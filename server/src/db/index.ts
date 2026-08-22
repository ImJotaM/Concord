import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store database file in server/data/concord.db (or persistent AppData dir)
const dataDir = process.env.CONCORD_DATA_DIR
  ? path.resolve(process.env.CONCORD_DATA_DIR)
  : path.resolve(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'concord.db');

export interface DatabaseAdapter {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
  pragma(sql: string): any;
}

function createDatabase(filePath: string): DatabaseAdapter {
  // 1. Try built-in native node:sqlite first (Node 22+, zero native .node ABI issues across all versions)
  try {
    const { DatabaseSync } = require('node:sqlite');
    const rawDb = new DatabaseSync(filePath);
    return {
      exec: (sql: string) => rawDb.exec(sql),
      prepare: (sql: string) => {
        const stmt = rawDb.prepare(sql);
        return {
          run: (...params: any[]) => stmt.run(...params),
          get: (...params: any[]) => stmt.get(...params),
          all: (...params: any[]) => stmt.all(...params),
        };
      },
      pragma: (pragmaStr: string) => rawDb.exec(`PRAGMA ${pragmaStr};`),
    };
  } catch {}

  // 2. Fallback to better-sqlite3 if node:sqlite is not present
  try {
    const BetterSqlite = require('better-sqlite3');
    const rawDb = new BetterSqlite(filePath);
    return {
      exec: (sql: string) => rawDb.exec(sql),
      prepare: (sql: string) => rawDb.prepare(sql),
      pragma: (pragmaStr: string) => rawDb.pragma(pragmaStr),
    };
  } catch (err: any) {
    console.error('Failed to initialize SQLite driver:', err);
    throw new Error(`Não foi possível inicializar o banco de dados SQLite: ${err?.message || err}`);
  }
}

export const db: DatabaseAdapter = createDatabase(dbPath);

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
      role_id TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#99aab5',
      is_admin INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_channel ON direct_messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(sender_id, recipient_id);
    CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);
    CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id, position);
  `);

  try {
    db.exec(`ALTER TABLE server_members ADD COLUMN role_id TEXT`);
  } catch {}

  // Seed default server and channels if no servers exist
  const serverCount = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
  if (serverCount.count === 0) {
    console.log('🌱 Seeding initial Concord LAN default server, channels, and roles...');
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

    const insertRole = db.prepare(`
      INSERT INTO roles (id, server_id, name, color, is_admin, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertRole.run('role-admin', defaultServerId, 'Administrador', '#e91e63', 1, 0);
    insertRole.run('role-mod', defaultServerId, 'Moderador', '#2ecc71', 0, 1);
    insertRole.run('role-member', defaultServerId, 'Membro', '#5865f2', 0, 2);

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

  // Ensure default roles exist for all servers
  try {
    const allExistingServers = db.prepare('SELECT id FROM servers').all() as { id: string }[];
    const checkRoles = db.prepare('SELECT COUNT(*) as count FROM roles WHERE server_id = ?');
    const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, server_id, name, color, is_admin, position) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of allExistingServers) {
      const res = checkRoles.get(s.id) as { count: number };
      if (res.count === 0) {
        insertRole.run(`role-admin-${s.id}`, s.id, 'Administrador', '#e91e63', 1, 0);
        insertRole.run(`role-mod-${s.id}`, s.id, 'Moderador', '#2ecc71', 0, 1);
        insertRole.run(`role-member-${s.id}`, s.id, 'Membro', '#5865f2', 0, 2);
      }
    }
  } catch (e) {
    console.error('Role check migration error:', e);
  }

  // Clean up ghost/temporary offline users who never sent a message and are not the system bot
  try {
    db.prepare(`
      DELETE FROM users 
      WHERE id != 'user-system' 
      AND id NOT IN (SELECT DISTINCT user_id FROM messages)
    `).run();
  } catch (e) {
    console.warn('Ghost user cleanup notice:', e);
  }
}
