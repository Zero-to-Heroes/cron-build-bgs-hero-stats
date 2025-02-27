import { S3 } from 'aws-sdk';

const s3 = new S3();

export const readAllAnomalies = async (bucket: string, folder: string): Promise<readonly (string | null)[]> => {
	const params: S3.Types.ListObjectsV2Request = {
		Bucket: bucket,
		Prefix: folder,
	};
	let allKeys: string[] = [];
	let continuationToken: string | undefined;

	do {
		if (continuationToken) {
			params.ContinuationToken = continuationToken;
		}

		try {
			const data = await s3.listObjectsV2(params).promise();
			// console.debug('listing result', params.ContinuationToken, data.Contents);
			const allKeysForToken = data.Contents?.map((item) => item.Key) ?? [];
			const suffixes = allKeysForToken.map((key) => key.replace(`${folder}/`, ''));
			const anomalies = suffixes.map((suffix) => suffix.split('/')[0]);
			const uniqueAnomalies = [...new Set(anomalies)];
			// console.debug('uniqueAnomalies', uniqueAnomalies);
			allKeys = allKeys.concat(uniqueAnomalies);
			continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined;
		} catch (error) {
			console.error('Error listing files:', error);
			return [null];
		}
	} while (continuationToken);

	const uniqueKeys = [...new Set(allKeys)];
	// console.debug('uniqueKeys', uniqueKeys);
	const result = [null, ...uniqueKeys];
	// console.debug('listing anomalies', bucket, folder, result);
	return result;
};
