import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { uploadClipToDrive } from './drive';

/**
 * Get all unique video IDs from the output directory
 */
function getVideoIDsFromOutput(outputDir: string): string[] {
    if (!fs.existsSync(outputDir)) {
        console.error(`Output directory not found: ${outputDir}`);
        return [];
    }

    const files = fs.readdirSync(outputDir);
    const videoIDs = new Set<string>();

    // Extract video IDs from filenames
    // Format: 61490169_00:00:00_00:00:11.mp4
    for (const file of files) {
        if (file.endsWith('.mp4')) {
            const videoID = file.split('_')[0];
            if (videoID) {
                videoIDs.add(videoID);
            }
        }
    }

    return Array.from(videoIDs);
}

/**
 * Get all clips for a specific video ID
 */
function getClipsForVideo(outputDir: string, videoID: string): string[] {
    const files = fs.readdirSync(outputDir);
    return files
        .filter(file => file.startsWith(videoID) && file.endsWith('.mp4'))
        .map(file => path.join(outputDir, file));
}

async function testRealVideo() {
    try {
        console.log('Testing Google Drive upload with real video data...\n');
        
        const outputDir = path.resolve(__dirname, '../../');
        console.log('📁 Scanning output directory:', outputDir);
        
        // Get all video IDs
        const videoIDs = getVideoIDsFromOutput(outputDir);
        
        if (videoIDs.length === 0) {
            console.error('❌ No videos found in output directory');
            console.log('Please process some videos first');
            return;
        }
        
        console.log(`\n✅ Found ${videoIDs.length} video(s): ${videoIDs.join(', ')}\n`);
        
        // Process each video
        for (const videoID of videoIDs) {
            console.log(`${'='.repeat(60)}`);
            console.log(`📹 Processing Video ID: ${videoID}`);
            console.log(`${'='.repeat(60)}\n`);
            
            // Get all clips for this video
            const clips = getClipsForVideo(outputDir, videoID);
            console.log(`Found ${clips.length} clip(s):`);
            clips.forEach((clip, i) => console.log(`  ${i + 1}. ${path.basename(clip)}`));
            console.log(); // Empty line
            
            // Upload all clips
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                if (clip) {
                    console.log(`📤 Uploading clip ${i + 1}/${clips.length}: ${path.basename(clip)}`);
                    const link = await uploadClipToDrive(videoID, clip);
                    console.log(`✅ Uploaded: ${link}\n`);
                }
            }
            
            console.log(`✅ Completed video ${videoID}\n`);
        }
        
        console.log(`${'='.repeat(60)}`);
        console.log('🎉 All videos uploaded successfully!');
        console.log(`${'='.repeat(60)}`);
        console.log('\n📁 Check your Google Drive for the following folders:');
        videoIDs.forEach(id => console.log(`  - ${id}`));
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testRealVideo();