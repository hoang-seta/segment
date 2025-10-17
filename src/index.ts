import { Clip, Video, VideoStatus } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { uploadClipToMinIO } from './lib/minio';
import prisma from './lib/prisma';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { uploadClipToDrive } from './lib/drive';

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

        const driveClipUrl = await uploadClipToDrive(video.videoID, clipPath);
        if (driveClipUrl !== 'file not found') {
            await prisma.clip.update({
                where: { id: clip.id },
                data: { driveClipUrl: driveClipUrl },
            });
        }

        const uploadedUrl = await uploadClipToMinIO(tempFile, clipPath);
        if (uploadedUrl !== 'file not found') {
            await prisma.clip.update({
                where: { id: clip.id },
                data: { clipPath: uploadedUrl },
            });
        }
        const xmlFile = await createXMLFile(video, tempFile, clip);
        const uploadedXmlUrl = await uploadClipToMinIO(tempFile, xmlFile);
        if (uploadedXmlUrl !== 'file not found') {
            await prisma.clip.update({
                where: { id: clip.id },
                data: { xmlPath: uploadedXmlUrl },
            });
        }
        // if (fs.existsSync(clipPath)) {
        //     fs.unlinkSync(clipPath);
        // }
        // if (fs.existsSync(xmlFile)) {
        //     fs.unlinkSync(xmlFile);
        // }

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

async function createXMLFile(video: Video,tempFile: string, clip: Clip): Promise<string> {
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
                where: { url: video.url },
                data: { status: VideoStatus.PROCESSING, updatedAt: new Date() },
            });
            return video;
        }
        return null;
    });
}

async function downloadVideo(video: Video): Promise<string> {
    // download the video from the url
    // set the name file with clipid is the name of the file
    const fileName = `${video.videoID}.mp4`;
    const response = await axios.get(video.url, { responseType: 'stream' });
    const writer = fs.createWriteStream(fileName);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    console.log('Downloaded video successfully, file name: ', fileName);
    return fileName;
}

async function main() {
    while (true) {
        const video = await getVideoWaiting()
        if (video) {
            try {
                const tempFile = await downloadVideo(video);
                // const tempFile = './test.mov';
                await processVideoFromUrl(video, tempFile);
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                await prisma.video.update({
                    where: { url: video.url },
                    data: { status: VideoStatus.COMPLETED, updatedAt: new Date() },
                });
            } catch (error) {
                console.error(`Error processing video ${video.url}:`, error);
                await prisma.video.update({
                    where: { url: video.url },
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


interface ClipTime {
    startTime: string;
    endTime: string;
}
async function insertClip(videoID: string, clips: ClipTime[]) {
    prisma.$transaction(async (tx) => {
        const video = await prisma.video.findFirst({
            where: {
                videoID: videoID,
            },
        });
        if (!video) {
            throw new Error(`Video not found for videoID: ${videoID}`);
        }
        await tx.video.update({
            where: { videoID: videoID },
            data: { status: VideoStatus.READY, updatedAt: new Date() },
        });

        for (const clipTime of clips) {
            await tx.clip.create({
                data: {
                    videoID: video.videoID,
                    startTime: clipTime.startTime,
                    endTime: clipTime.endTime,
                },
            });
        }
    });
}

main();

// insertClip('61490169', [
//     { startTime: '00:00:00', endTime: '00:00:11' },
//     { startTime: '00:00:13', endTime: '00:00:26' },
//     // { startTime: '00:00:44', endTime: '00:00:56' },
// ]);