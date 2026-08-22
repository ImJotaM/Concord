import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import { getLocalIpAddresses } from '../discovery/mdns.js';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB LAN file limit
});

export const apiRouter = Router();

// Server info & LAN discovery endpoint
apiRouter.get('/info', (_req, res) => {
  const localIps = getLocalIpAddresses();
  res.json({
    name: 'Concord LAN Server',
    hostname: os.hostname(),
    platform: os.platform(),
    localIps,
    version: '1.0.0',
    status: 'online',
  });
});

// Get messages for a channel
apiRouter.get('/channels/:channelId/messages', (req, res) => {
  const { channelId } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

  const messages = db
    .prepare(
      `
    SELECT m.*, u.username, u.display_name, u.avatar
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.channel_id = ?
    ORDER BY m.created_at ASC
    LIMIT ?
  `
    )
    .all(channelId, limit) as any[];

  const formatted = messages.map((m) => ({
    id: m.id,
    channelId: m.channel_id,
    userId: m.user_id,
    content: m.content,
    attachments: m.attachments ? JSON.parse(m.attachments) : [],
    createdAt: m.created_at,
    user: {
      id: m.user_id,
      username: m.username,
      displayName: m.display_name,
      avatar: m.avatar,
    },
  }));

  res.json(formatted);
});

// File upload endpoint for chat attachments / images
apiRouter.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    url: fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Update profile / username / avatar
apiRouter.post('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const { displayName, avatar, customStatus } = req.body;

  db.prepare(`
    UPDATE users
    SET display_name = COALESCE(?, display_name),
        avatar = COALESCE(?, avatar),
        custom_status = COALESCE(?, custom_status)
    WHERE id = ?
  `).run(displayName, avatar, customStatus, userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json(updated);
});
