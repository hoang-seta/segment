import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const PARENT_FOLDER_ID = process.env['DRIVE_FOLDER_ID'];
const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function getAuthClient() {
    const credentialsJson = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    
    if (!credentialsJson) {
        throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is not set');
    }
    
    const credentials = JSON.parse(credentialsJson);
    
    const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: SCOPES,
    });
    return auth;
}

async function getOrCreateFolder(folderName: string, parentFolderId?: string): Promise<string> {
    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth: auth });

    // Search for existing folder with support for Shared Drives
    const query = parentFolderId
        ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`
        : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });

    if (response.data.files && response.data.files.length > 0) {
        const folderId = response.data.files[0]?.id;
        if (!folderId) {
            throw new Error(`Folder ID not found for folder: ${folderName}`);
        }
        console.log(`Folder '${folderName}' already exists with ID: ${folderId}`);
        return folderId;
    }

    // Create new folder with Shared Drive support
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : null,
    };

    const folder = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
        supportsAllDrives: true,
    });

    const newFolderId = folder.data.id;
    if (!newFolderId) {
        throw new Error(`Failed to create folder: ${folderName}`);
    }

    console.log(`Created folder '${folderName}' with ID: ${newFolderId}`);
    return newFolderId;
}

async function uploadFileToDrive(
    filePath: string,
    folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
    const auth = await getAuthClient();
    const drive = google.drive({ version: 'v3', auth: auth });

    const fileName = path.basename(filePath);
    const fileMetadata = {
        name: fileName,
        parents: [folderId],
    };

    const media = {
        body: fs.createReadStream(filePath),
    };

    console.log(`Uploading ${fileName} to Google Drive folder ${folderId}...`);

    const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
        supportsAllDrives: true,
    });

    const fileId = file.data.id;
    const webViewLink = file.data.webViewLink;

    if (!fileId || !webViewLink) {
        throw new Error(`Failed to upload file: ${fileName}`);
    }

    console.log(`Uploaded ${fileName} - File ID: ${fileId}`);

    return { fileId, webViewLink };
}

export async function uploadClipToDrive(videoID: string, clipPath: string): Promise<string> {
    try {
        if (!PARENT_FOLDER_ID) {
            throw new Error('GOOGLE_DRIVE_PARENT_FOLDER_ID environment variable is not set');
        }
        
        const folderId = await getOrCreateFolder(videoID, PARENT_FOLDER_ID);
        const { webViewLink } = await uploadFileToDrive(clipPath, folderId);

        return webViewLink;
    } catch (error) {
        console.error(`Error uploading clip to Drive:`, error);
        throw error;
    }
}