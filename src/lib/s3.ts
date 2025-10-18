import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'fs';
import mime from 'mime-types';
import path from 'path';

const s3 = new S3Client({
    region: process.env['AWS_REGION'] as string,
    credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] as string,
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] as string,
    }
})

const bucketName = 'abc'

async function uploadFileToS3(
    filePath: string,
): Promise<string> {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath);
    const fileKey = path.basename(filePath);

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: fileStream,
        ContentType: (mime.lookup(filePath) || 'application/octet-stream').toString(),
    });

    await s3.send(command);

    return `s3://${bucketName}/${fileKey}`;
}

export { uploadFileToS3 };
