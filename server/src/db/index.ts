import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store database file in server/data/concord.db
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'concord.db');
export const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar TEXT,
      status TEXT DEFAULT 'online',
      custom_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'text' or 'voice'
      topic TEXT,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT, -- JSON string array of file URLs
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);
  `);

  // Seed default server and channels if no servers exist
  const serverCount = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
  if (serverCount.count === 0) {
    console.log('🌱 Seeding initial Concord LAN default server and channels...');
    const defaultServerId = 'server-general';
    const systemUserId = 'user-system';

    db.prepare(`
      INSERT INTO users (id, username, display_name, avatar, status, custom_status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(systemUserId, 'concord_bot', 'Concord Bot', '🤖', 'online', 'Local LAN Master');

    db.prepare(`
      INSERT INTO servers (id, name, icon, owner_id)
      VALUES (?, ?, ?, ?)
    `).run(defaultServerId, 'LAN Community Hub', '🌐', systemUserId);

    const insertChannel = db.prepare(`
      INSERT INTO channels (id, server_id, name, type, topic, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertChannel.run('chan-general', defaultServerId, 'general', 'text', 'Welcome to Concord on your local network! Chat freely.', 0);
    insertChannel.run('chan-gaming', defaultServerId, 'gaming-lounge', 'text', 'Coordinate LAN party games and matches.', 1);
    insertChannel.run('chan-media', defaultServerId, 'media-share', 'text', 'Share photos, memes, and files across devices.', 2);
    insertChannel.run('chan-voice-gen', defaultServerId, 'General Voice', 'voice', 'Low-latency LAN voice room', 3);
    insertChannel.run('chan-voice-game', defaultServerId, 'Gaming Squad', 'voice', 'Low-latency in-game voice chat', 4);

    db.prepare(`
      INSERT INTO messages (id, channel_id, user_id, content)
      VALUES (?, ?, ?, ?)
    `).run('msg-welcome', 'chan-general', systemUserId, '🎉 **Welcome to Concord!** This is a high-speed LAN-only Discord clone. Anyone on this Wi-Fi/Ethernet network can connect, chat, share files, and talk with crystal-clear voice!');
  }
}
