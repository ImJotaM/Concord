import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { initDatabase } from './db/index.js';
import { WebSocketHandler } from './ws/handler.js';
import { apiRouter } from './routes/api.js';
import { startMdnsBroadcaster, getLocalIpAddresses } from './discovery/mdns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0'; // Listen on all network interfaces for LAN connectivity

// Initialize SQLite database
initDatabase();

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded media (images, files, videos) with CORS & streaming support
const uploadsDir = process.env.CONCORD_DATA_DIR
  ? path.join(process.env.CONCORD_DATA_DIR, 'uploads')
  : path.resolve(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  '/uploads',
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

import fs from 'fs';

// API routes
app.use('/api', apiRouter);

// Serve built frontend if available
const distDir = path.resolve(__dirname, '../../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  // Health check fallback
  app.get('/', (_req, res) => {
    res.send('Concord LAN Server is running.');
  });
}

// Create HTTP and WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
new WebSocketHandler(wss);

server.listen(PORT, HOST, () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🚀 Concord LAN Server running on port ${PORT}`);
  console.log(`   Local machine: http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`   LAN Access:`);
    localIps.forEach((ip) => {
      console.log(`     👉 http://${ip}:${PORT}`);
    });
  }
  console.log(`======================================================\n`);

  // Start mDNS network broadcasting
  startMdnsBroadcaster(PORT, 'Concord LAN Server');
});
