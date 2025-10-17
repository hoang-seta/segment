import { Clip, Video, VideoStatus } from '@prisma/client';
import axios from 'axios';
import { execFile } from 'child_process';
import 'dotenv/config';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { promisify } from 'util';
import { uploadClipToMinIO } from './lib/minio';
import prisma from './lib/prisma';
import { uploadClipToDrive } from './lib/drive';
import { runClippingSegmentVideo, getJobStatus } from './lib/veritone';

const execFileAsync = promisify(execFile);

// const outputDir = './clips';
// const tempFile = './test.mov';

// Example clip list
// const clips: Clip[] = [
//     { start: '00:00:05', end: '00:00:10' },
//     { start: '00:00:15', end: '00:00:25' },
//     { start: '00:00:30', end: '00:00:35' },
// ];
// /**
//  * Download a video file from a URL to a local path
//  */


/**
 * Process all clips sequentially
 */
async function processVideoFromUrl(video: Video, tempFile: string): Promise<void> {
    const clips = await prisma.clip.findMany({
        where: {
            videoID: video.videoID,
        },
    });
    for (const clip of clips) {
        const clipPath = await cutVideo(tempFile, clip);

        await uploadClipToDrive(video.videoID, clipPath);
        // if (driveClipUrl !== 'file not found') {
        //     await prisma.clip.update({
        //         where: { id: clip.id },
        //         data: { driveClipUrl: driveClipUrl },
        //     });
        // }

        // const uploadedUrl = await uploadClipToMinIO(tempFile, clipPath);
        // if (uploadedUrl !== 'file not found') {
        //     await prisma.clip.update({
        //         where: { id: clip.id },
        //         data: { clipPath: uploadedUrl },
        //     });
        // }
        const xmlFile = await createXMLFile(video, tempFile, clip);
        await uploadClipToDrive(video.videoID, xmlFile);
        // if (driveClipUrl !== 'file not found') {
        //     await prisma.clip.update({
        //         where: { id: clip.id },
        //         data: { driveClipUrl: driveClipUrl },
        //     });
        // }
        // await uploadClipToMinIO(tempFile, xmlFile);
        // if (uploadedXmlUrl !== 'file not found') {
        //     await prisma.clip.update({
        //         where: { id: clip.id },
        //         data: { xmlPath: uploadedXmlUrl },
        //     });
        // }
        if (fs.existsSync(clipPath)) {
            fs.unlinkSync(clipPath);
        }
        if (fs.existsSync(xmlFile)) {
            fs.unlinkSync(xmlFile);
        }

    }
}


/**
 * Cut a video segment using FFmpeg
 */
async function cutVideo(inputFile: string, clip: Clip): Promise<string> {
    return new Promise((resolve, reject) => {

        const outputFile = inputFile.replace(".mp4", "") + "_" + clip.startTime + "_" + clip.endTime + ".mp4";
        const startString = clip.startTime.split(':').map(Number);
        const startSeconds = startString[0]! * 3600 + startString[1]! * 60 + startString[2]!;
        const endString = clip.endTime.split(':').map(Number);
        const endSeconds = endString[0]! * 3600 + endString[1]! * 60 + endString[2]!;
        const duration = endSeconds - startSeconds;
        console.log(`Cutting clip ${clip.startTime} to ${clip.endTime} duration: ${duration}`);
        console.log(`Start seconds: ${startSeconds}`);
        ffmpeg(inputFile)
            .setStartTime(startSeconds)
            .setDuration(duration)
            .output(outputFile)
            .on('end', () => {
                console.log(`Clip ${clip.startTime} done -> ${outputFile}`);
                resolve(outputFile);
            })
            .on('error', (err: Error) => {
                console.error(`Error cutting clip ${clip.startTime}: ${err.message}`);
                reject(err);
            })
            .run();
    });
}

async function probeVideo(filePath: string): Promise<{ resolution: string, fps: number }> {
    const args = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,avg_frame_rate',
        '-of', 'json',
        filePath,
    ];

    const { stdout } = await execFileAsync('ffprobe', args);
    const data = JSON.parse(stdout);

    if (!data.streams?.length) {
        throw new Error('No video stream found in file');
    }

    const stream = data.streams[0];
    const [num, den] = stream.avg_frame_rate.split('/').map(Number);
    const fps = den ? num / den : num;

    const resolution = `${stream.width}x${stream.height}`;
    return { resolution, fps };
}

async function createXMLFile(video: Video, tempFile: string, clip: Clip): Promise<string> {
    const startTime = clip.startTime.split(':').map(Number);
    const endTime = clip.endTime.split(':').map(Number);
    const duration = (endTime[0]! * 3600 + endTime[1]! * 60 + endTime[2]!) - (startTime[0]! * 3600 + startTime[1]! * 60 + startTime[2]!);
    const hh = Math.floor(duration / 3600).toString().padStart(2, '0');
    const mm = Math.floor((duration % 3600) / 60).toString().padStart(2, '0');
    const ss = Math.floor(duration % 60).toString().padStart(2, '0');
    const durationString = `${hh}:${mm}:${ss}`;
    const { resolution, fps } = await probeVideo(tempFile);
    const xml = `<record>
    <TE_ParentClip>${video.resourceName}</TE_ParentClip>
    <Filename>${video.resourceName}-${clip.startTime}-${clip.endTime}.mp4</Filename>
    <Duration>${durationString}</Duration>
    <Resolution>${resolution}</Resolution>
    <FPS>${fps}</FPS>
    <Primary_Language>N/A</Primary_Language>
    <CountryOrigin>N/A</CountryOrigin>
    <CD_Category>Emerging Objects and Cinematic Storytelling</CD_Category>
    <Production_TextRef>N/A</Production_TextRef>
    <Title>${video.Title}</Title>
    <Description></Description>
</record>`;
    const xmlFile = `${video.videoID}-${clip.startTime}-${clip.endTime}.xml`;
    fs.writeFileSync(xmlFile, xml);
    return xmlFile;
}

async function getVideoWaiting(): Promise<Video | null> {
    return prisma.$transaction(async (tx) => {
        const video = await tx.video.findFirst({
            where: {
                status: VideoStatus.READY,
            },
        });
        if (video) {
            await tx.video.update({
                where: { videoID: video.videoID },
                data: { status: VideoStatus.PROCESSING, updatedAt: new Date() },
            });
            return video;
        }
        return null;
    });
}

async function getRenditionUrl(video: Video): Promise<string> {
    const videoResponse = await axios.get(`https://crxextapi.pd.dmh.veritone.com/assets-api/v1/renditionUrl/${video.videoID}?scheme=https&context=browser&api_key=c24b9617-e4ad-4466-89d7-8902d7d7dd15`);
    const data = videoResponse.data;
    const renditionUrl = data.renditionInfoList.find((item: any) => item.purpose === 'c')?.url;
    if (!renditionUrl) {
        throw new Error(`No url found for clipId: ${video.videoID}`);
    }
    return renditionUrl;
}

async function downloadVideo(video: Video, renditionUrl: string): Promise<string> {
    // download the video from the url
    // set the name file with clipid is the name of the file
    const fileName = `${video.videoID}.mp4`;
    const response = await axios.get(renditionUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    console.log('Downloaded video successfully, file name: ', fileName);
    return fileName;
}

async function callEngineVeritone(renditionUrl: string): Promise<string> {
    const jobId = await runClippingSegmentVideo(renditionUrl);
    if (jobId) {
        return jobId;
    }
    return '';
}

async function main() {
    while (true) {
        const video = await getVideoWaiting()
        if (video) {
            try {
                console.log("Start processing video: ", video.videoID);
                // Get rendition URL once
                const renditionUrl = await getRenditionUrl(video);

                // Run callEngineVeritone and downloadVideo in parallel
                const [jobId, tempFile] = await Promise.all([
                    callEngineVeritone(renditionUrl),
                    downloadVideo(video, renditionUrl)
                ]);
                console.log("called engine veritone and download video successfully");
                if (!jobId) {
                    throw new Error('Job ID not found');
                }
                // const jobId = '25104217_AJhL3a5q7a'
                // const tempFile = './61701414.mp4';
                while (true) {
                    const { startAndEndTime, isCompleted } = await getJobStatus(jobId);
                    if (isCompleted) {
                        for (const startTime of startAndEndTime) {
                            await insertClip(video, startTime.startTimeMs, startTime.stopTimeMs);
                        }
                        break;
                    }
                    console.log('Sleeping for 1 minute, wait job id: ', jobId);
                    await new Promise(resolve => setTimeout(resolve, 1000 * 30));
                }
                console.log("detect segments successfully, start processing video");
                // const tempFile = './test.mov';
                await processVideoFromUrl(video, tempFile);
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                await prisma.video.update({
                    where: { videoID: video.videoID },
                    data: { status: VideoStatus.COMPLETED, updatedAt: new Date() },
                });
            } catch (error) {
                console.error(`Error processing video ${video.videoID}:`, error);
                await prisma.video.update({
                    where: { videoID: video.videoID },
                    data: {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        status: VideoStatus.FAILED,
                        updatedAt: new Date()
                    },
                });
            }
        }
        console.log('Sleeping for 1 minute');
        await new Promise(resolve => setTimeout(resolve, 1000 * 60));
    }
}


async function insertClip(video: Video, startTime: number, endTime: number) {
    const startTimeSeconds = startTime / 1000;
    const endTimeSeconds = endTime / 1000;
    const startTimeHour = Math.floor(startTimeSeconds / 3600).toString().padStart(2, '0');
    const startTimeMinute = Math.floor((startTimeSeconds % 3600) / 60).toString().padStart(2, '0');
    const startTimeSecond = Math.floor(startTimeSeconds % 60).toString().padStart(2, '0');
    const endTimeHour = Math.floor(endTimeSeconds / 3600).toString().padStart(2, '0');
    const endTimeMinute = Math.floor((endTimeSeconds % 3600) / 60).toString().padStart(2, '0');
    const endTimeSecond = Math.floor(endTimeSeconds % 60).toString().padStart(2, '0');
    const startTimeString = `${startTimeHour}:${startTimeMinute}:${startTimeSecond}`;
    const endTimeString = `${endTimeHour}:${endTimeMinute}:${endTimeSecond}`;
    console.log(`Inserting clip ${startTimeString} to ${endTimeString}`);
    await prisma.clip.create({
        data: {
            videoID: video.videoID,
            startTime: startTimeString,
            endTime: endTimeString,
        },
    });
}

main();

// insertClip('61490169', [
//     { startTime: '00:00:00', endTime: '00:00:11' },
//     { startTime: '00:00:13', endTime: '00:00:26' },
//     // { startTime: '00:00:44', endTime: '00:00:56' },
// ]);
