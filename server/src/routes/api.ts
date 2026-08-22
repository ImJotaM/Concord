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

const uploadsDir = process.env.CONCORD_DATA_DIR
  ? path.join(process.env.CONCORD_DATA_DIR, 'uploads')
  : path.resolve(__dirname, '../../uploads');

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

// In-App Web Proxy Endpoint (bypasses X-Frame-Options, CSP, and injects navigation bridges)
apiRouter.get('/proxy', async (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  try {
    let targetUrl = rawUrl.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const parsed = new URL(targetUrl);

    // Special case for Google search: ensure igu=1 parameter
    if (parsed.hostname.includes('google.') && !parsed.searchParams.has('igu')) {
      parsed.searchParams.set('igu', '1');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    // Remove restrictive framing and CSP headers
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const contentType = response.headers.get('content-type') || 'text/html';
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const escapedTarget = targetUrl.replace(/"/g, '&quot;');
      const escapedOrigin = parsed.origin;

      const injection = `
        <base href="${escapedOrigin}/">
        <script>
          (function() {
            try {
              window.parent.postMessage({
                type: 'concord-browser-nav',
                url: "${targetUrl.replace(/"/g, '\\"')}",
                title: document.title || "${parsed.hostname}"
              }, '*');
            } catch(e) {}

            document.addEventListener('click', function(e) {
              var a = e.target.closest('a');
              if (!a) return;
              var href = a.getAttribute('href');
              if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

              e.preventDefault();
              try {
                var full = new URL(href, "${escapedTarget}").href;
                if (full.includes('google.') && full.includes('/url?')) {
                  var m = full.match(/[?&]q=([^&]+)/);
                  if (m && m[1]) full = decodeURIComponent(m[1]);
                }
                window.parent.postMessage({
                  type: 'concord-browser-nav-request',
                  url: full
                }, '*');
              } catch(err) {}
            }, true);
          })();
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${injection}`);
      } else if (html.includes('<html>')) {
        html = html.replace('<html>', `<html><head>${injection}</head>`);
      } else {
        html = `${injection}${html}`;
      }
      res.send(html);
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    }
  } catch (err: any) {
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1e1f22; color: #dbdee1; padding: 2rem; text-align: center; margin: 0; }
            .card { max-width: 520px; margin: 4rem auto; background: #2b2d31; padding: 2.5rem; border-radius: 1rem; border: 1px solid #35373c; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
            h2 { color: #f23f43; margin-top: 0; font-size: 18px; }
            p { color: #949ba4; font-size: 13px; line-height: 1.6; }
            .btn { display: inline-flex; align-items: center; justify-content: center; margin-top: 1.5rem; background: #5865f2; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: bold; font-size: 13px; transition: background 0.2s; }
            .btn:hover { background: #4752c4; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Não foi possível carregar no modo embutido</h2>
            <p>O site <strong>${rawUrl}</strong> utiliza proteções avançadas contra visualização em quadros ou está indisponível na rede.</p>
            <p style="font-family: monospace; font-size: 11px; color: #72767d; background: #1e1f22; padding: 0.5rem; border-radius: 0.5rem; word-break: break-all;">${err.message || 'Falha de conexão'}</p>
            <a class="btn" href="${rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl}" target="_blank" rel="noopener noreferrer">
              Abrir no Navegador Externo (Windows) ↗
            </a>
          </div>
        </body>
      </html>
    `);
  }
});
