import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectedClient {
  id: string; // Session / connection ID
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  currentVoiceChannelId?: string;
  ws: WebSocket;
}

export class WebSocketHandler {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  // voiceChannelId -> Set of clientIds
  private voiceRooms: Map<string, Set<string>> = new Map();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setup();
  }

  private setup() {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (rawData: string) => {
        try {
          const message = JSON.parse(rawData.toString());
          this.handleMessage(ws, message);
        } catch (err) {
          console.error('Error handling WS message:', err);
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        console.error('WS Error:', err);
      });
    });
  }

  private handleMessage(ws: WebSocket, data: any) {
    const { type, payload } = data;

    switch (type) {
      case 'auth':
        this.handleAuth(ws, payload);
        break;

      case 'send_message':
        this.handleSendMessage(ws, payload);
        break;

      case 'typing':
        this.handleTyping(ws, payload);
        break;

      case 'update_presence':
        this.handlePresenceUpdate(ws, payload);
        break;

      case 'create_channel':
        this.handleCreateChannel(ws, payload);
        break;

      case 'create_server':
        this.handleCreateServer(ws, payload);
        break;

      // WebRTC Voice Signaling
      case 'voice_join':
        this.handleVoiceJoin(ws, payload);
        break;

      case 'voice_leave':
        this.handleVoiceLeave(ws);
        break;

      case 'voice_signal':
        this.handleVoiceSignal(ws, payload);
        break;

      case 'voice_speaking':
        this.handleVoiceSpeaking(ws, payload);
        break;

      default:
        console.log('Unknown event type:', type);
    }
  }

  private handleAuth(ws: WebSocket, payload: { userId: string; username: string; displayName: string; avatar?: string }) {
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as any;

    if (!user) {
      // Create user if new
      db.prepare(`
        INSERT INTO users (id, username, display_name, avatar, status)
        VALUES (?, ?, ?, ?, 'online')
      `).run(
        payload.userId,
        payload.username || `User_${payload.userId.slice(0, 4)}`,
        payload.displayName || payload.username || 'LAN Member',
        payload.avatar || '👤'
      );
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as any;
    } else {
      // Update display name / avatar if changed
      db.prepare(`
        UPDATE users SET display_name = ?, avatar = ?, status = 'online'
        WHERE id = ?
      `).run(payload.displayName || user.display_name, payload.avatar || user.avatar, payload.userId);
    }

    // Ensure member of default servers
    const servers = db.prepare('SELECT id FROM servers').all() as { id: string }[];
    const checkMember = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?');
    const addMember = db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)');
    for (const s of servers) {
      if (!checkMember.get(s.id, payload.userId)) {
        addMember.run(s.id, payload.userId);
      }
    }

    const client: ConnectedClient = {
      id: uuidv4(),
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      avatar: user.avatar || '👤',
      status: 'online',
      customStatus: user.custom_status,
      ws,
    };

    this.clients.set(ws, client);

    // Send initial state to the client
    const allServers = db.prepare('SELECT * FROM servers ORDER BY created_at ASC').all();
    const allChannels = db.prepare('SELECT * FROM channels ORDER BY position ASC').all();
    const allUsers = db.prepare('SELECT id, username, display_name, avatar, status, custom_status FROM users').all();

    // Map online users from active sockets
    const onlineUserIds = new Set(Array.from(this.clients.values()).map((c) => c.userId));
    const usersWithPresence = allUsers.map((u: any) => ({
      ...u,
      status: onlineUserIds.has(u.id) ? 'online' : 'offline',
    }));

    // Voice participants map
    const activeVoiceMembers: Record<string, { userId: string; username: string; displayName: string; avatar: string }[]> = {};
    for (const [chanId, clientIds] of this.voiceRooms.entries()) {
      const roomClients = Array.from(this.clients.values()).filter((c) => clientIds.has(c.id));
      activeVoiceMembers[chanId] = roomClients.map((c) => ({
        userId: c.userId,
        username: c.username,
        displayName: c.displayName,
        avatar: c.avatar,
      }));
    }

    this.send(ws, 'init_sync', {
      user,
      servers: allServers,
      channels: allChannels,
      users: usersWithPresence,
      voiceRooms: activeVoiceMembers,
    });

    // Broadcast user joined / online to all other clients
    this.broadcast(
      'user_presence',
      {
        userId: user.id,
        status: 'online',
      },
      ws
    );
  }

  private handleSendMessage(ws: WebSocket, payload: { channelId: string; content: string; attachments?: string[] }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const messageId = `msg-${uuidv4()}`;
    const attachmentsJson = payload.attachments ? JSON.stringify(payload.attachments) : null;

    db.prepare(`
      INSERT INTO messages (id, channel_id, user_id, content, attachments)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, payload.channelId, client.userId, payload.content, attachmentsJson);

    const messageObj = {
      id: messageId,
      channelId: payload.channelId,
      userId: client.userId,
      user: {
        id: client.userId,
        username: client.username,
        displayName: client.displayName,
        avatar: client.avatar,
      },
      content: payload.content,
      attachments: payload.attachments || [],
      createdAt: new Date().toISOString(),
    };

    // Broadcast new message to all clients
    this.broadcast('new_message', messageObj);
  }

  private handleTyping(ws: WebSocket, payload: { channelId: string; isTyping: boolean }) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.broadcast(
      'user_typing',
      {
        channelId: payload.channelId,
        userId: client.userId,
        displayName: client.displayName,
        isTyping: payload.isTyping,
      },
      ws
    );
  }

  private handlePresenceUpdate(ws: WebSocket, payload: { status: 'online' | 'idle' | 'dnd' | 'offline'; customStatus?: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    client.status = payload.status;
    client.customStatus = payload.customStatus;

    db.prepare('UPDATE users SET status = ?, custom_status = ? WHERE id = ?').run(
      payload.status,
      payload.customStatus || null,
      client.userId
    );

    this.broadcast('user_presence', {
      userId: client.userId,
      status: payload.status,
      customStatus: payload.customStatus,
    });
  }

  private handleCreateChannel(ws: WebSocket, payload: { serverId: string; name: string; type: 'text' | 'voice'; topic?: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const channelId = `chan-${uuidv4().slice(0, 8)}`;
    const position = 99;

    db.prepare(`
      INSERT INTO channels (id, server_id, name, type, topic, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(channelId, payload.serverId, payload.name, payload.type, payload.topic || '', position);

    const newChannel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    this.broadcast('channel_created', newChannel);
  }

  private handleCreateServer(ws: WebSocket, payload: { name: string; icon?: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const serverId = `srv-${uuidv4().slice(0, 8)}`;
    const icon = payload.icon || '🚀';

    db.prepare('INSERT INTO servers (id, name, icon, owner_id) VALUES (?, ?, ?, ?)').run(
      serverId,
      payload.name,
      icon,
      client.userId
    );

    // Create default general channel for this server
    const genChanId = `chan-${uuidv4().slice(0, 8)}`;
    db.prepare('INSERT INTO channels (id, server_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      genChanId,
      serverId,
      'general',
      'text',
      'General chat',
      0
    );

    // Create voice channel
    const voiceChanId = `chan-${uuidv4().slice(0, 8)}`;
    db.prepare('INSERT INTO channels (id, server_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      voiceChanId,
      serverId,
      'General Voice',
      'voice',
      'Voice lounge',
      1
    );

    const newServer = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    const newChannels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(serverId);

    this.broadcast('server_created', { server: newServer, channels: newChannels });
  }

  // --- WebRTC LAN Voice Handling ---

  private handleVoiceJoin(ws: WebSocket, payload: { channelId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Leave any previous voice room
    this.handleVoiceLeave(ws);

    const channelId = payload.channelId;
    if (!this.voiceRooms.has(channelId)) {
      this.voiceRooms.set(channelId, new Set());
    }

    const room = this.voiceRooms.get(channelId)!;
    const existingPeers: { peerId: string; userId: string; displayName: string; avatar: string }[] = [];

    // Gather existing peers in room
    for (const peerClientId of room) {
      const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
      if (peer) {
        existingPeers.push({
          peerId: peer.id,
          userId: peer.userId,
          displayName: peer.displayName,
          avatar: peer.avatar,
        });

        // Notify existing peer that a new peer joined
        this.send(peer.ws, 'voice_peer_joined', {
          peerId: client.id,
          userId: client.userId,
          displayName: client.displayName,
          avatar: client.avatar,
          channelId,
        });
      }
    }

    room.add(client.id);
    client.currentVoiceChannelId = channelId;

    // Send the list of existing peers in this voice room to the newly joined client
    this.send(ws, 'voice_joined', {
      channelId,
      myPeerId: client.id,
      existingPeers,
    });

    // Notify all other clients of voice room state update
    this.broadcastVoiceRoomUpdate(channelId);
  }

  private handleVoiceLeave(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (!client || !client.currentVoiceChannelId) return;

    const channelId = client.currentVoiceChannelId;
    const room = this.voiceRooms.get(channelId);

    if (room) {
      room.delete(client.id);
      if (room.size === 0) {
        this.voiceRooms.delete(channelId);
      }

      // Notify peers in room that this peer left
      for (const peerClientId of room) {
        const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
        if (peer) {
          this.send(peer.ws, 'voice_peer_left', {
            peerId: client.id,
            userId: client.userId,
            channelId,
          });
        }
      }
    }

    client.currentVoiceChannelId = undefined;
    this.send(ws, 'voice_left', { channelId });
    this.broadcastVoiceRoomUpdate(channelId);
  }

  private handleVoiceSignal(ws: WebSocket, payload: { targetPeerId: string; signal: any }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const targetClient = Array.from(this.clients.values()).find((c) => c.id === payload.targetPeerId);
    if (targetClient) {
      this.send(targetClient.ws, 'voice_signal', {
        fromPeerId: client.id,
        signal: payload.signal,
      });
    }
  }

  private handleVoiceSpeaking(ws: WebSocket, payload: { isSpeaking: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !client.currentVoiceChannelId) return;

    const room = this.voiceRooms.get(client.currentVoiceChannelId);
    if (!room) return;

    for (const peerClientId of room) {
      if (peerClientId === client.id) continue;
      const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
      if (peer) {
        this.send(peer.ws, 'voice_peer_speaking', {
          peerId: client.id,
          userId: client.userId,
          isSpeaking: payload.isSpeaking,
        });
      }
    }
  }

  private handleDisconnect(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Leave any voice channel
    if (client.currentVoiceChannelId) {
      this.handleVoiceLeave(ws);
    }

    this.clients.delete(ws);

    // If user has no other active connections, broadcast offline
    const hasOtherConnection = Array.from(this.clients.values()).some((c) => c.userId === client.userId);
    if (!hasOtherConnection) {
      this.broadcast('user_presence', {
        userId: client.userId,
        status: 'offline',
      });
    }
  }

  private broadcastVoiceRoomUpdate(channelId: string) {
    const room = this.voiceRooms.get(channelId);
    const members = room
      ? Array.from(room)
          .map((cid) => {
            const c = Array.from(this.clients.values()).find((cl) => cl.id === cid);
            return c ? { userId: c.userId, username: c.username, displayName: c.displayName, avatar: c.avatar } : null;
          })
          .filter(Boolean)
      : [];

    this.broadcast('voice_room_update', {
      channelId,
      members,
    });
  }

  public send(ws: WebSocket, type: string, payload: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  public broadcast(type: string, payload: any, ignoreWs?: WebSocket) {
    const msg = JSON.stringify({ type, payload });
    for (const [ws] of this.clients) {
      if (ws !== ignoreWs && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }
}
