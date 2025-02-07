import { S3Multipart } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import { S3 as S3AWS } from 'aws-sdk';
import SecretsManager, { GetSecretValueRequest, GetSecretValueResponse } from 'aws-sdk/clients/secretsmanager';
import { Connection, createPool } from 'mysql';
import { Readable } from 'stream';
import { normalizeHeroCardId } from '../../common/util-functions';
import { InternalBgsRow } from '../../internal-model';
import { STATS_BUCKET, WORKING_ROWS_FILE, s3 } from './_build-battlegrounds-hero-stats';

export const readRowsFromS3 = async (startDate: string): Promise<readonly InternalBgsRow[]> => {
	return new Promise<readonly InternalBgsRow[]>((resolve, reject) => {
		const workingRowsFile = `${WORKING_ROWS_FILE.replace('%time%', startDate)}`;
		console.debug('reading rows from s3', workingRowsFile);
		let parseErrors = 0;
		let totalParsed = 0;
		const stream: Readable = s3.readStream(STATS_BUCKET, workingRowsFile);
		const result: InternalBgsRow[] = [];
		let previousString = '';
		let emptyRowsInARow = 0;
		stream
			.on('data', (chunk) => {
				const str = Buffer.from(chunk).toString('utf-8');
				const newStr = previousString + str;
				const split = newStr.split('\n');
				const rows: readonly InternalBgsRow[] = split.slice(0, split.length - 1).map((row) => {
					try {
						const result: InternalBgsRow = JSON.parse(row);
						totalParsed++;
						return result;
					} catch (e) {
						// logger.warn('could not parse row', row);
						parseErrors++;
					}
				});
				previousString = split[split.length - 1];
				result.push(...rows);

				// Do this to avoid errors in case the chunks are small compared to the row sizes
				if (result.length === 0 && rows.length === 0) {
					emptyRowsInARow++;
				} else {
					emptyRowsInARow = 0;
				}
				if (emptyRowsInARow > 50) {
					console.error(newStr);
					console.error(split);
					throw new Error('Could not parse any row');
				}
			})
			.on('end', () => {
				const finalResult = result.filter((row) => !!row);
				console.log('stream end', result.length, finalResult.length);
				console.log('parsing', parseErrors, '/', totalParsed);
				resolve(finalResult);
			});
	});
};

export const saveRowsOnS3 = async (startDate: Date, endDate: Date, allCards: AllCardsService) => {
	console.log('will export rows to S3', startDate, endDate);
	const secretRequest: GetSecretValueRequest = {
		SecretId: 'rds-connection',
	};
	const secret: SecretInfo = await getSecret(secretRequest);
	const pool = createPool({
		connectionLimit: 1,
		host: secret.hostReadOnly,
		user: secret.username,
		password: secret.password,
		database: 'replay_summary',
		port: secret.port,
	});

	try {
		await performRowProcessIngPool(pool, startDate, endDate, allCards);
	} finally {
		pool.end((err) => {
			console.log('ending pool', err);
		});
	}
};

const performRowProcessIngPool = async (pool: any, startDate: Date, endDate: Date, allCards: AllCardsService) => {
	return new Promise<void>((resolve) => {
		pool.getConnection(async (err, connection) => {
			if (err) {
				console.log('error with connection', err);
				throw new Error('Could not connect to DB');
			} else {
				await performRowsProcessing(connection, startDate, endDate, allCards);
				connection.release();
			}
			resolve();
		});
	});
};

const performRowsProcessing = async (
	connection: Connection,
	startDate: Date,
	endDate: Date,
	allCards: AllCardsService,
) => {
	const multipartUpload = new S3Multipart(new S3AWS());
	const workingRowsFile = `${WORKING_ROWS_FILE.replace('%time%', startDate.toISOString())}`;
	await multipartUpload.initMultipart('static.zerotoheroes.com', workingRowsFile, 'application/json');
	console.log('multipart upload init', workingRowsFile);

	return new Promise<void>((resolve) => {
		const queryStr = `
			SELECT * FROM bgs_run_stats
			WHERE creationDate >= ?
			AND creationDate < ?
		`;
		console.log('running query', queryStr);
		const query = connection.query(queryStr, [startDate, endDate]);

		let rowsToProcess = [];
		let rowCount = 0;
		query
			.on('error', (err) => {
				console.error('error while fetching rows', err);
			})
			.on('fields', (fields) => {
				console.log('fields', fields);
			})
			.on('result', async (row) => {
				rowsToProcess.push(row);
				if (rowsToProcess.length > 20000 && !multipartUpload.processing) {
					connection.pause();
					// console.log('before upload', rowsToProcess.length);
					const toUpload = rowsToProcess;
					rowsToProcess = [];
					// console.log('will upload', toUpload.length, 'rows');
					const uploaded = await processRows(toUpload, multipartUpload, allCards);
					rowCount += uploaded;
					console.log('processed rows', uploaded, '/', toUpload.length, rowCount);
					connection.resume();
				}
			})
			.on('end', async () => {
				console.log('end');
				const toUpload = rowsToProcess;
				rowsToProcess = [];
				// console.log('will upload', toUpload.length, 'rows');
				const uploaded = await processRows(toUpload, multipartUpload, allCards);
				rowCount += uploaded;
				console.log('processed rows', uploaded, rowCount);
				// connection.resume();
				await multipartUpload.completeMultipart();
				resolve();
			});
	});
};

const processRows = async (
	rows: readonly InternalBgsRow[],
	multipartUpload: S3Multipart,
	allCards: AllCardsService,
) => {
	const validRows = rows
		// .filter((row) => row.heroCardId.startsWith('TB_BaconShop_') || row.heroCardId.startsWith('BG'))
		.filter(
			(row) =>
				row.heroCardId !== CardIds.ArannaStarseeker_ArannaUnleashedToken &&
				row.heroCardId !== CardIds.QueenAzshara_NagaQueenAzsharaToken,
		)
		.filter((row) => !!row.playerRank && !!row.tribes?.length)
		.map((row) => {
			const result: InternalBgsRow = {
				...row,
				heroCardId: normalizeHeroCardId(row.heroCardId, allCards),
				tribesExpanded: row.tribes.split(',').map((tribe) => parseInt(tribe)),
				heroesOptionsExpanded:
					row.heroesOptions?.split(',').map((hero) => normalizeHeroCardId(hero, allCards)) ?? [],
				playedCardsExpanded: row.playedCards != null ? JSON.parse(row.playedCards) : [],
			};
			// delete (result as any).reviewId;
			delete (result as any).tribes;
			delete (result as any).heroesOptions;
			delete (result as any).playedCards;
			return result;
		});
	if (validRows.length > 0) {
		// console.log('\t', 'uploading', validRows.length, 'rows');
		await multipartUpload.uploadPart(validRows.map((r) => JSON.stringify(r)).join('\n'));
	}
	return validRows.length;
};

const getSecret = (secretRequest: GetSecretValueRequest) => {
	const secretsManager = new SecretsManager({ region: 'us-west-2' });
	return new Promise<SecretInfo>((resolve) => {
		secretsManager.getSecretValue(secretRequest, (err, data: GetSecretValueResponse) => {
			const secretInfo: SecretInfo = JSON.parse(data.SecretString);
			resolve(secretInfo);
		});
	});
};

interface SecretInfo {
	readonly username: string;
	readonly password: string;
	readonly host: string;
	readonly hostReadOnly: string;
	readonly port: number;
	readonly dbClusterIdentifier: string;
}
