import express, { Request, Response } from 'express';
import path from 'path';
import prisma from '../lib/prisma';

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to convert BigInt to string in objects
function serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    
    if (Array.isArray(obj)) {
        return obj.map(serializeBigInt);
    }
    
    if (typeof obj === 'object') {
        const serialized: any = {};
        for (const key in obj) {
            serialized[key] = serializeBigInt(obj[key]);
        }
        return serialized;
    }
    
    return obj;
}

// API Routes

// DEBUG: Get all clips to see what's in the database
app.get('/api/clips/debug', async (req: Request, res: Response): Promise<void> => {
    try {
        const allClips = await prisma.clip.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' }
        });
        
        const clipsWithUrl = await prisma.clip.count({
            where: { driveClipUrl: { not: null } }
        });
        
        const clipsNotQAd = await prisma.clip.count({
            where: { isPassed: null }
        });
        
        const clipsReadyForQA = await prisma.clip.count({
            where: {
                driveClipUrl: { not: null },
                isPassed: null
            }
        });

        res.json(serializeBigInt({
            totalClips: allClips.length,
            clipsWithUrl,
            clipsNotQAd,
            clipsReadyForQA,
            sampleClips: allClips.map(c => ({
                id: c.id,
                videoID: c.videoID,
                driveClipUrl: c.driveClipUrl,
                isPassed: c.isPassed,
                startTime: c.startTime,
                endTime: c.endTime
            }))
        }));
    } catch (error) {
        console.error('Debug error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// Get clip by ID or navigation (next/previous)
app.get('/api/clips/navigate', async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentId, direction } = req.query;
        
        console.log(`🔍 Navigating: currentId=${currentId}, direction=${direction}`);
        
        let clip = null;
        
        if (!currentId || !direction) {
            // Get first clip (default behavior)
            clip = await prisma.clip.findFirst({
                where: {
                    driveClipUrl: { not: null },
                    isPassed: null,
                },
                orderBy: { createdAt: 'asc' },
            });
        } else {
            const currentClipId = BigInt(currentId as string);
            
            if (direction === 'next') {
                // Get next clip (created after current)
                clip = await prisma.clip.findFirst({
                    where: {
                        driveClipUrl: { not: null },
                        isPassed: null,
                        id: { gt: currentClipId }, // Greater than current ID
                    },
                    orderBy: { id: 'asc' },
                });
                
                // If no next clip found, wrap around to first
                if (!clip) {
                    clip = await prisma.clip.findFirst({
                        where: {
                            driveClipUrl: { not: null },
                            isPassed: null,
                        },
                        orderBy: { id: 'asc' },
                    });
                }
            } else if (direction === 'prev') {
                // Get previous clip (created before current)
                clip = await prisma.clip.findFirst({
                    where: {
                        driveClipUrl: { not: null },
                        isPassed: null,
                        id: { lt: currentClipId }, // Less than current ID
                    },
                    orderBy: { id: 'desc' },
                });
                
                // If no previous clip found, wrap around to last
                if (!clip) {
                    clip = await prisma.clip.findFirst({
                        where: {
                            driveClipUrl: { not: null },
                            isPassed: null,
                        },
                        orderBy: { id: 'desc' },
                    });
                }
            }
        }

        console.log('📋 Found clip:', clip ? `ID ${clip.id}` : 'None');

        if (!clip) {
            res.json({ clip: null, message: 'No clips available for QA' });
            return;
        }

        // Get parent video info
        const video = await prisma.video.findUnique({
            where: { videoID: clip.videoID }
        });

        console.log('🎥 Found video:', video ? video.videoID : 'None');

        res.json(serializeBigInt({ clip, video }));
    } catch (error) {
        console.error('❌ Error navigating clips:', error);
        res.status(500).json({ error: 'Failed to navigate clips' });
    }
});

// Get next clip for QA (has driveClipUrl, not yet QA'd)
app.get('/api/clips/next-qa', async (req: Request, res: Response): Promise<void> => {
    try {
        console.log('🔍 Fetching next clip for QA...');
        
        const clip = await prisma.clip.findFirst({
            where: {
                driveClipUrl: { not: null }, // Must have Drive URL
                isPassed: null, // Not yet QA'd
            },
            orderBy: {
                createdAt: 'asc', // Oldest first
            },
        });

        console.log('📋 Found clip:', clip ? `ID ${clip.id}` : 'None');

        if (!clip) {
            res.json({ clip: null, message: 'No clips available for QA' });
            return;
        }

        // Get parent video info
        const video = await prisma.video.findUnique({
            where: { videoID: clip.videoID }
        });

        console.log('🎥 Found video:', video ? video.videoID : 'None');

        res.json(serializeBigInt({ clip, video }));
    } catch (error) {
        console.error('❌ Error fetching next QA clip:', error);
        res.status(500).json({ error: 'Failed to fetch clip' });
    }
});

// Get clip statistics
app.get('/api/clips/stats', async (req: Request, res: Response): Promise<void> => {
    try {
        const [total, uploaded, passed, failed, pending] = await Promise.all([
            prisma.clip.count(),
            prisma.clip.count({ where: { driveClipUrl: { not: null } } }),
            prisma.clip.count({ where: { isPassed: true } }),
            prisma.clip.count({ where: { isPassed: false } }),
            prisma.clip.count({ 
                where: { 
                    driveClipUrl: { not: null },
                    isPassed: null 
                } 
            }),
        ]);

        const successRate = uploaded > 0 ? ((passed / uploaded) * 100).toFixed(2) : '0.00';

        res.json({
            total,
            uploaded,
            passed,
            failed,
            pending,
            successRate,
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Update clip QA status
app.post('/api/clips/:clipId/qa', async (req: Request, res: Response): Promise<void> => {
    try {
        const clipId = parseInt(req.params['clipId'] as string);
        const { isPassed, comment } = req.body;

        if (isNaN(clipId)) {
            res.status(400).json({ error: 'Invalid clip ID' });
            return;
        }

        if (typeof isPassed !== 'boolean') {
            res.status(400).json({ error: 'isPassed must be a boolean' });
            return;
        }

        const clip = await prisma.clip.update({
            where: { id: BigInt(clipId) },
            data: {
                isPassed,
                qaComment: comment || null,
                qaCompletedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        res.json(serializeBigInt({ success: true, clip }));
    } catch (error) {
        console.error('Error updating QA status:', error);
        res.status(500).json({ error: 'Failed to update QA status' });
    }
});

// Get all clips with filters
app.get('/api/clips', async (req: Request, res: Response): Promise<void> => {
    try {
        const { videoID, isPassed, page = '1', limit = '20' } = req.query;
        
        const where: any = {};
        if (videoID) where.videoID = videoID;
        if (isPassed !== undefined) {
            where.isPassed = isPassed === 'true' ? true : isPassed === 'false' ? false : null;
        }

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const [clips, total] = await Promise.all([
            prisma.clip.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.clip.count({ where }),
        ]);

        res.json(serializeBigInt({
            clips,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        }));
    } catch (error) {
        console.error('Error fetching clips:', error);
        res.status(500).json({ error: 'Failed to fetch clips' });
    }
});

// Serve HTML page
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 QA Web Server running on http://localhost:${PORT}`);
});