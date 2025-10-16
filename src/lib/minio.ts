import fs from 'fs';
import { Client } from 'minio';

import prisma from './prisma';


// MinIO configuration
const minioClient = new Client({
    endPoint: process.env['MINIO_ENDPOINT'] || 'localhost',
    port: parseInt(process.env['MINIO_PORT'] || '9000'),
    useSSL: process.env['MINIO_USE_SSL'] === 'true',
    accessKey: process.env['MINIO_ACCESS_KEY'] || 'minioadmin',
    secretKey: process.env['MINIO_SECRET_KEY'] || 'minioadmin',
});

const BUCKET_NAME = process.env['MINIO_BUCKET_NAME'] || 'video-clips';

/**
 * Upload a file to MinIO
 */
async function uploadToMinIO(localFilePath: string, objectName: string): Promise<void> {
    try {
        await minioClient.fPutObject(BUCKET_NAME, objectName, localFilePath);
    } catch (error) {
        console.error(`Error uploading ${objectName}:`, error);
        throw error;
    }
}

/**
 * Upload multiple clips to MinIO
 */
async function uploadClipToMinIO(inputFile: string, clipPath: string): Promise<string> {

    if (fs.existsSync(clipPath)) {
        const fileName = clipPath.split('/').pop() || 'unknown.mp4';
        const objectName = `${inputFile.split('/').pop() || 'unknown'}/${fileName}`;

        try {
            await uploadToMinIO(clipPath, objectName);
            //  get link from minio
            const link = await minioClient.presignedGetObject(BUCKET_NAME, objectName, 60 * 60 * 24);
            return link.toString();
        } catch (error) {
            console.error(`Failed to upload ${clipPath}:`, error);
            return 'file not found';
        }
    }
    return 'file not found';
}

export { uploadClipToMinIO, uploadToMinIO };

