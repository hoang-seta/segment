import 'dotenv/config';
import * as XLSX from 'xlsx';
import prisma from '../src/lib/prisma';
import axios from 'axios';

type Row = {
    CLIP_ID: string | number;
    INGEST_DATE: string;
    RESOURCE_NAME: string;
    OWNER: string;
    TITLE: string;
    DURATION: string | number;
    PHYLUM?: string;
    FILENAME: string;
    STATUS?: string;
    BROADCASTSTANDARD: string;
};

function toStringVal(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

function toBigIntVal(v: unknown): bigint {
    if (typeof v === 'number') return BigInt(Math.trunc(v));
    const s = toStringVal(v);
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Invalid numeric duration: ${s}`);
    return BigInt(Math.trunc(n));
}

async function main(): Promise<void> {
    const workbook = XLSX.readFile('video.xlsx');
    const sheetName = 'Sources';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
        throw new Error(`Sheet not found: ${sheetName}`);
    }
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' });

    for (const r of rows) {
        const clipId = toStringVal(r.CLIP_ID);
        const ingestDate = toStringVal(r.INGEST_DATE);
        const resourceName = toStringVal(r.RESOURCE_NAME);
        const owner = toStringVal(r.OWNER);
        const title = toStringVal(r.TITLE);
        const duration = toBigIntVal(r.DURATION);
        const fileName = toStringVal(r.FILENAME);
        const broadcast = toStringVal(r.BROADCASTSTANDARD);


        //  call api like this https://crxextapi.pd.dmh.veritone.com/assets-api/v1/renditionUrl/61701414?scheme=https&context=browser&api_key=c24b9617-e4ad-4466-89d7-8902d7d7dd15
        // then from resonse like this
        // "assetId": 61701414,
        // "renditionInfoList": [
        //     {
        //         "id": 135658345,
        //         "name": "Joe Vitale lesson 5.mov",
        //         "format": "mov",
        //         "purpose": "m",
        //         "size": "f",
        //         "fileSize": 4997529700,
        //         "url": "https://s3-vdr-proven-singlefile-or-1.s3.us-west-2.amazonaws.com/ProvenEntertainment/Guru%20Assets%20Hard%20Drive%2044/Joe%20Vitale/Joe%20Vitale%20lesson%205.mov?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20251016T081210Z&X-Amz-SignedHeaders=host&X-Amz-Expires=172800&X-Amz-Credential=AKIAZ2UOZDUOSI3QHVMD%2F20251016%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Signature=20220c063088e4d5fe56462dfa34cf5c62fec9e4a74ce8526775913bfc094909",
        //         "internalUri": "t3://S3ViaS3Signed:5f929d90-1e2b-4914-88be-e4037d852655@s3-vdr-proven-singlefile-or-1.s3.amazonaws.com/ProvenEntertainment/Guru+Assets+Hard+Drive+44/Joe+Vitale/Joe+Vitale+lesson+5.mov"
        //     },
        //     {
        //  from response, get url from renditionInfoList (get purpose is c)

        const response = await axios.get(`https://crxextapi.pd.dmh.veritone.com/assets-api/v1/renditionUrl/${clipId}?scheme=https&context=browser&api_key=c24b9617-e4ad-4466-89d7-8902d7d7dd15`);
        const data = response.data;
        const renditionUrl = data.renditionInfoList.find((item: any) => item.purpose === 'c')?.url;
        if (!renditionUrl) {
            throw new Error(`No url found for clipId: ${clipId}`);
        }
        const url = renditionUrl;
        await prisma.video.upsert({
            where: { url: url },
            create: {
                url: url,
                videoID: clipId,
                ingestDate,
                owner,
                resourceName,
                Title: title,
                Duration: duration,
                FileName: fileName,
                BroadcastStandard: broadcast,
            },
            update: {
                videoID: clipId,
                ingestDate: ingestDate,
                owner: owner,
                resourceName: resourceName,
                Title: title,
                Duration: duration,
                FileName: fileName,
                BroadcastStandard: broadcast,
            },
        });
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });


