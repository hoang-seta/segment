import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import path from 'path';
import prisma from '../lib/prisma';

const app = express();
const PORT = process.env['PORT'] || 3000;
const PUBLIC_URL = process.env['PUBLIC_URL'] || `http://localhost:${PORT}`;

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Session configuration
app.use(session({
    secret: process.env['SESSION_SECRET'] || 'change-this-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env['NODE_ENV'] === 'production',
    }
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());
app.use(passport.session());

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env['GOOGLE_CLIENT_ID'] || '',
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
    callbackURL: `${PUBLIC_URL}/auth/google/callback`,
}, (accessToken, refreshToken, profile, done) => {
    const user = {
        id: profile.id,
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName,
        picture: profile.photos?.[0]?.value || '',
    };
    return done(null, user);
}));

passport.serializeUser((user: any, done) => {
    done(null, user);
});

passport.deserializeUser((user: any, done) => {
    done(null, user);
});

function serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(serializeBigInt);
    if (typeof obj === 'object') {
        const serialized: any = {};
        for (const key in obj) {
            serialized[key] = serializeBigInt(obj[key]);
        }
        return serialized;
    }
    return obj;
}

// Middleware to check if user is authenticated
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized', needsAuth: true });
}

// Auth Routes
app.get('/auth/google', passport.authenticate('google', { 
    scope: ['profile', 'email'] 
}));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req: Request, res: Response) => {
        res.redirect('/');
    }
);

app.get('/auth/logout', (req: Request, res: Response) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.get('/auth/user', (req: Request, res: Response) => {
    if (req.isAuthenticated()) {
        res.json({ user: req.user });
    } else {
        res.json({ user: null });
    }
});

// API Routes

app.post('/api/clips/navigate', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as any;
        const qaEmail = user.email;
        const { currentId, direction } = req.body;
        
        console.log(`🔍 Navigating ${direction} for: ${qaEmail}`);

        const now = new Date();
        const lockExpiredTime = new Date(now.getTime() - LOCK_TIMEOUT_MS);

        let clip = null;
        
        if (!currentId || !direction) {
            const availableClip = await prisma.clip.findFirst({
                where: {
                    driveClipUrl: { not: null },
                    isPassed: null,
                    OR: [
                        { qaLockedBy: null },
                        { qaLockedBy: qaEmail },
                        { qaLockedAt: { lt: lockExpiredTime } },
                    ],
                },
                orderBy: { createdAt: 'asc' },
            });

            if (availableClip) {
                clip = await prisma.clip.update({
                    where: { id: availableClip.id },
                    data: {
                        qaLockedBy: qaEmail,
                        qaLockedAt: now,
                        updatedAt: now,
                    },
                });
            }
        } else {
            const currentClipId = BigInt(currentId);

            if (direction === 'next') {
                const availableClip = await prisma.clip.findFirst({
                    where: {
                        driveClipUrl: { not: null },
                        isPassed: null,
                        id: { gt: currentClipId },
                        OR: [
                            { qaLockedBy: null },
                            { qaLockedBy: qaEmail },
                            { qaLockedAt: { lt: lockExpiredTime } },
                        ],
                    },
                    orderBy: { id: 'asc' },
                });

                if (!availableClip) {
                    const firstClip = await prisma.clip.findFirst({
                        where: {
                            driveClipUrl: { not: null },
                            isPassed: null,
                            OR: [
                                { qaLockedBy: null },
                                { qaLockedBy: qaEmail },
                                { qaLockedAt: { lt: lockExpiredTime } },
                            ],
                        },
                        orderBy: { id: 'asc' },
                    });

                    if (firstClip) {
                        clip = await prisma.clip.update({
                            where: { id: firstClip.id },
                            data: {
                                qaLockedBy: qaEmail,
                                qaLockedAt: now,
                                updatedAt: now,
                            },
                        });
                    }
                } else {
                    clip = await prisma.clip.update({
                        where: { id: availableClip.id },
                        data: {
                            qaLockedBy: qaEmail,
                            qaLockedAt: now,
                            updatedAt: now,
                        },
                    });
                }
            } else if (direction === 'prev') {
                const availableClip = await prisma.clip.findFirst({
                    where: {
                        driveClipUrl: { not: null },
                        isPassed: null,
                        id: { lt: currentClipId },
                        OR: [
                            { qaLockedBy: null },
                            { qaLockedBy: qaEmail },
                            { qaLockedAt: { lt: lockExpiredTime } },
                        ],
                    },
                    orderBy: { id: 'desc' },
                });

                if (!availableClip) {
                    const lastClip = await prisma.clip.findFirst({
                        where: {
                            driveClipUrl: { not: null },
                            isPassed: null,
                            OR: [
                                { qaLockedBy: null },
                                { qaLockedBy: qaEmail },
                                { qaLockedAt: { lt: lockExpiredTime } },
                            ],
                        },
                        orderBy: { id: 'desc' },
                    });

                    if (lastClip) {
                        clip = await prisma.clip.update({
                            where: { id: lastClip.id },
                            data: {
                                qaLockedBy: qaEmail,
                                qaLockedAt: now,
                                updatedAt: now,
                            },
                        });
                    }
                } else {
                    clip = await prisma.clip.update({
                        where: { id: availableClip.id },
                        data: {
                            qaLockedBy: qaEmail,
                            qaLockedAt: now,
                            updatedAt: now,
                        },
                    });
                }
            }
        }

        if (!clip) {
            res.json({ clip: null, message: 'No clips available for QA' });
            return;
        }

        const video = await prisma.video.findUnique({
            where: { videoID: clip.videoID }
        });

        res.json(serializeBigInt({ clip, video }));
    } catch (error) {
        console.error('❌ Error navigating clips:', error);
        res.status(500).json({ error: 'Failed to navigate clips' });
    }
});

app.post('/api/clips/:clipId/skip', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as any;
        const qaEmail = user.email;
        const clipId = parseInt(req.params['clipId'] as string);
        const { skipReason } = req.body;

        if (isNaN(clipId) || !skipReason || skipReason.trim().length === 0) {
            res.status(400).json({ error: 'Skip reason is required' });
            return;
        }

        const existingClip = await prisma.clip.findUnique({
            where: { id: BigInt(clipId) },
        });

        if (existingClip?.qaLockedBy && existingClip.qaLockedBy !== qaEmail) {
            res.status(403).json({ error: 'This clip is locked by another user' });
            return;
        }

        const clip = await prisma.clip.update({
            where: { id: BigInt(clipId) },
            data: {
                isSkipped: true,
                skipReason: skipReason.trim(),
                skippedBy: qaEmail,
                skippedAt: new Date(),
                qaLockedBy: null,
                qaLockedAt: null,
                updatedAt: new Date(),
            },
        });

        console.log(`⏭️ Clip ${clipId} skipped by ${qaEmail}: ${skipReason}`);
        res.json(serializeBigInt({ success: true, clip }));
    } catch (error) {
        console.error('Error skipping clip:', error);
        res.status(500).json({ error: 'Failed to skip clip' });
    }
});

app.post('/api/clips/:clipId/unlock', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as any;
        const qaEmail = user.email;
        const clipId = parseInt(req.params['clipId'] as string);

        await prisma.clip.updateMany({
            where: {
                id: BigInt(clipId),
                qaLockedBy: qaEmail,
            },
            data: {
                qaLockedBy: null,
                qaLockedAt: null,
            },
        });

        console.log(`🔓 Unlocked clip ${clipId} from ${qaEmail}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Error unlocking clip:', error);
        res.status(500).json({ error: 'Failed to unlock clip' });
    }
});

app.get('/api/clips/stats', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
    try {
        const now = new Date();
        const lockExpiredTime = new Date(now.getTime() - LOCK_TIMEOUT_MS);

        const [total, uploaded, passed, failed, pending, locked, skipped] = await Promise.all([
            prisma.clip.count(),
            prisma.clip.count({ where: { driveClipUrl: { not: null } } }),
            prisma.clip.count({ where: { isPassed: true } }),
            prisma.clip.count({ where: { isPassed: false } }),
            prisma.clip.count({ 
                where: { 
                    driveClipUrl: { not: null },
                    isPassed: null,
                    isSkipped: false,
                    OR: [
                        { qaLockedBy: null },
                        { qaLockedAt: { lt: lockExpiredTime } },
                    ],
                } 
            }),
            prisma.clip.count({
                where: {
                    qaLockedBy: { not: null },
                    qaLockedAt: { gte: lockExpiredTime },
                    isPassed: null,
                },
            }),
            prisma.clip.count({ where: { isSkipped: true } }),
        ]);

        // Calculate success rate
        const totalReviewed = passed + failed;
        const successRate = totalReviewed > 0 ? Math.round((passed / totalReviewed) * 100) : 0;

        res.json({ 
            total, 
            uploaded, 
            passed, 
            failed, 
            pending, 
            locked, 
            skipped,
            successRate 
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

app.post('/api/clips/:clipId/qa', ensureAuthenticated, async (req: Request, res: Response): Promise<void> => {
    try {
        const user = req.user as any;
        const qaEmail = user.email;
        const clipId = parseInt(req.params['clipId'] as string);
        const { isPassed, comment } = req.body;

        if (isNaN(clipId) || typeof isPassed !== 'boolean') {
            res.status(400).json({ error: 'Invalid request' });
            return;
        }

        const existingClip = await prisma.clip.findUnique({
            where: { id: BigInt(clipId) },
        });

        if (existingClip?.qaLockedBy && existingClip.qaLockedBy !== qaEmail) {
            res.status(403).json({ error: 'This clip is locked by another user' });
            return;
        }

        const clip = await prisma.clip.update({
            where: { id: BigInt(clipId) },
            data: {
                isPassed,
                qaComment: comment || null,
                qaCompletedAt: new Date(),
                qaLockedBy: null,
                qaLockedAt: null,
                isSkipped: false, // Reset skip if it was previously skipped
                skipReason: null,
                updatedAt: new Date(),
            },
        });

        console.log(`✅ QA completed for clip ${clipId} by ${qaEmail}: ${isPassed ? 'PASSED' : 'FAILED'}`);
        res.json(serializeBigInt({ success: true, clip }));
    } catch (error) {
        console.error('Error updating QA status:', error);
        res.status(500).json({ error: 'Failed to update QA status' });
    }
});

app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 QA Web Server running on http://localhost:${PORT}`);
    console.log(`🔒 Lock timeout: ${LOCK_TIMEOUT_MS / 1000 / 60} minutes`);
});