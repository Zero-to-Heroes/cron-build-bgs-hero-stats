import { S3Multipart } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, CardIds } from '@firestone-hs/reference-data';
import { S3 as S3AWS } from 'aws-sdk';
import SecretsManager, { GetSecretValueRequest, GetSecretValueResponse } from 'aws-sdk/clients/secretsmanager';
import { Connection, createConnection } from 'mysql';
import { InternalBgsRow } from './internal-model';
import { normalizeHeroCardId } from './utils/util-functions';

export const saveRowsOnS3 = async (allCards: AllCardsService) => {
	console.log('will export rows to S3');
	const secretRequest: GetSecretValueRequest = {
		SecretId: 'rds-connection',
	};
	const secret: SecretInfo = await getSecret(secretRequest);
	const connection = createConnection({
		host: secret.host,
		user: secret.username,
		password: secret.password,
		database: 'replay_summary',
		port: secret.port,
	});

	await performRowsProcessing(connection, allCards);
	connection.end();
};

const performRowsProcessing = async (connection: Connection, allCards: AllCardsService) => {
	const multipartUpload = new S3Multipart(new S3AWS());
	await multipartUpload.initMultipart('static.zerotoheroes.com', `api/bgs/working-rows.json`, 'application/json');

	return new Promise<void>((resolve) => {
		const query = connection.query(`
            SELECT *
            FROM bgs_run_stats
            WHERE creationDate > DATE_SUB(NOW(), INTERVAL 30 DAY);
        `);

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
				if (rowsToProcess.length > 30000 && !multipartUpload.processing) {
					const toUpload = rowsToProcess;
					rowsToProcess = [];
					// connection.pause();
					const uploaded = await processRows(toUpload, multipartUpload, allCards);
					rowCount += uploaded;
					console.log('processed rows', rowsToProcess.length, rowCount);
					// connection.resume();
				}
			})
			.on('end', async () => {
				console.log('end');
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
		.filter((row) => row.heroCardId.startsWith('TB_BaconShop_') || row.heroCardId.startsWith('BG'))
		.filter(
			(row) =>
				row.heroCardId !== CardIds.ArannaStarseeker_ArannaUnleashedTokenBattlegrounds &&
				row.heroCardId !== CardIds.QueenAzshara_NagaQueenAzsharaToken,
		)
		.map((row) => ({
			...row,
			heroCardId: normalizeHeroCardId(row.heroCardId, allCards),
		}))
		.filter((row) => !!row.rank)
		.filter((row) => !!row.tribes?.length)
		.map((row) => {
			const result: InternalBgsRow = {
				...row,
				tribesExpanded: row.tribes.split(',').map((tribe) => parseInt(tribe)),
			};
			delete (result as any).reviewId;
			delete (result as any).tribes;
			return result;
		});
	if (validRows.length > 0) {
		await multipartUpload.uploadPart(validRows);
		// logger.log('uploaded', validRows.length);
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
	readonly port: number;
	readonly dbClusterIdentifier: string;
}
