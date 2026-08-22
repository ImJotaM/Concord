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
  isMuted?: boolean;
  isDeafened?: boolean;
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

      case 'send_dm':
        this.handleSendDm(ws, payload);
        break;

      case 'get_dm_history':
        this.handleGetDmHistory(ws, payload);
        break;

      case 'typing_dm':
        this.handleTypingDm(ws, payload);
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

      case 'voice_screen_share':
        this.handleVoiceScreenShare(ws, payload);
        break;

      case 'voice_audio_chunk':
        this.handleVoiceAudioChunk(ws, payload);
        break;

      case 'voice_state_update':
        this.handleVoiceStateUpdate(ws, payload);
        break;

      case 'soundboard_play':
        this.handleSoundboardPlay(ws, payload);
        break;

      // Moderation & Roles
      case 'delete_message':
        this.handleDeleteMessage(ws, payload);
        break;

      case 'delete_channel':
        this.handleDeleteChannel(ws, payload);
        break;

      case 'delete_server':
        this.handleDeleteServer(ws, payload);
        break;

      case 'kick_member':
        this.handleKickMember(ws, payload);
        break;

      case 'delete_user':
        this.handleDeleteUser(ws, payload);
        break;

      case 'create_role':
        this.handleCreateRole(ws, payload);
        break;

      case 'update_role':
        this.handleUpdateRole(ws, payload);
        break;

      case 'delete_role':
        this.handleDeleteRole(ws, payload);
        break;

      case 'assign_member_role':
        this.handleAssignMemberRole(ws, payload);
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
    const allRoles = db.prepare('SELECT * FROM roles ORDER BY position ASC, created_at ASC').all();
    const allMembers = db.prepare(`
      SELECT sm.server_id, sm.user_id, sm.nickname, sm.role, sm.role_id, sm.joined_at,
             r.name as role_name, r.color as role_color, r.is_admin
      FROM server_members sm
      LEFT JOIN roles r ON sm.role_id = r.id
    `).all();

    // Map online users from active sockets
    const onlineUserIds = new Set(Array.from(this.clients.values()).map((c) => c.userId));
    const usersWithPresence = allUsers.map((u: any) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatar: u.avatar || '👤',
      status: onlineUserIds.has(u.id) ? 'online' : 'offline',
      customStatus: u.custom_status,
    }));

    // Voice participants map
    const activeVoiceMembers: Record<string, { peerId: string; userId: string; username: string; displayName: string; avatar: string; isMuted?: boolean; isDeafened?: boolean }[]> = {};
    for (const [chanId, clientIds] of this.voiceRooms.entries()) {
      const roomClients = Array.from(this.clients.values()).filter((c) => clientIds.has(c.id));
      activeVoiceMembers[chanId] = roomClients.map((c) => ({
        peerId: c.id,
        userId: c.userId,
        username: c.username,
        displayName: c.displayName,
        avatar: c.avatar,
        isMuted: c.isMuted ?? false,
        isDeafened: c.isDeafened ?? false,
      }));
    }

    // Fetch user's recent DM conversations
    let dmConversations: any[] = [];
    try {
      const recentDms = db.prepare(`
        SELECT dm.channel_id, dm.sender_id, dm.recipient_id, dm.content, dm.created_at,
               CASE WHEN dm.sender_id = ? THEN dm.recipient_id ELSE dm.sender_id END as other_user_id
        FROM direct_messages dm
        WHERE dm.sender_id = ? OR dm.recipient_id = ?
        ORDER BY dm.created_at DESC
      `).all(user.id, user.id, user.id);

      const dmConversationsMap = new Map<string, any>();
      for (const row of recentDms as any[]) {
        if (!dmConversationsMap.has(row.other_user_id)) {
          const otherUser: any = allUsers.find((u: any) => u.id === row.other_user_id);
          if (otherUser) {
            dmConversationsMap.set(row.other_user_id, {
              id: row.channel_id,
              userId: otherUser.id,
              user: {
                id: otherUser.id,
                username: otherUser.username,
                displayName: otherUser.display_name,
                avatar: otherUser.avatar || '👤',
                status: onlineUserIds.has(otherUser.id) ? 'online' : 'offline',
                customStatus: otherUser.custom_status,
              },
              lastMessage: {
                content: row.content,
                createdAt: row.created_at,
                senderId: row.sender_id,
              },
              unreadCount: 0,
              updatedAt: row.created_at,
            });
          }
        }
      }
      dmConversations = Array.from(dmConversationsMap.values());
    } catch (e) {
      console.warn('Error fetching dmConversations:', e);
    }

    this.send(ws, 'init_sync', {
      myPeerId: client.id,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar || '👤',
        status: 'online',
        customStatus: user.custom_status,
      },
      servers: allServers,
      channels: allChannels,
      roles: allRoles,
      serverMembers: allMembers,
      users: usersWithPresence,
      voiceRooms: activeVoiceMembers,
      dmConversations,
    });

    // Broadcast user joined / online to all other clients
    this.broadcast(
      'user_presence',
      {
        userId: user.id,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatar: user.avatar || '👤',
          status: 'online',
          customStatus: user.custom_status,
        },
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

  private handleSendDm(ws: WebSocket, payload: { recipientId: string; content: string; attachments?: string[] }) {
    const client = this.clients.get(ws);
    if (!client || !payload.recipientId) return;

    const channelId = `dm_${[client.userId, payload.recipientId].sort().join('_')}`;
    const messageId = `dm-msg-${uuidv4()}`;
    const attachmentsJson = payload.attachments ? JSON.stringify(payload.attachments) : null;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO direct_messages (id, channel_id, sender_id, recipient_id, content, attachments, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, channelId, client.userId, payload.recipientId, payload.content, attachmentsJson, createdAt);

    const messageObj = {
      id: messageId,
      channelId,
      senderId: client.userId,
      recipientId: payload.recipientId,
      userId: client.userId,
      user: {
        id: client.userId,
        username: client.username,
        displayName: client.displayName,
        avatar: client.avatar,
      },
      content: payload.content,
      attachments: payload.attachments || [],
      createdAt,
    };

    // Send to sender
    this.send(ws, 'new_dm', messageObj);

    // Send to all active sockets of the recipient
    for (const [targetWs, targetClient] of this.clients.entries()) {
      if (targetClient.userId === payload.recipientId && targetWs !== ws) {
        this.send(targetWs, 'new_dm', messageObj);
      }
    }
  }

  private handleGetDmHistory(ws: WebSocket, payload: { recipientId: string }) {
    const client = this.clients.get(ws);
    if (!client || !payload.recipientId) return;

    const channelId = `dm_${[client.userId, payload.recipientId].sort().join('_')}`;
    const rawMessages = db.prepare(`
      SELECT dm.*, u.username, u.display_name, u.avatar
      FROM direct_messages dm
      JOIN users u ON dm.sender_id = u.id
      WHERE dm.channel_id = ?
      ORDER BY dm.created_at ASC
      LIMIT 150
    `).all(channelId);

    const messages = rawMessages.map((m: any) => ({
      id: m.id,
      channelId: m.channel_id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      userId: m.sender_id,
      user: {
        id: m.sender_id,
        username: m.username,
        displayName: m.display_name,
        avatar: m.avatar || '👤',
      },
      content: m.content,
      attachments: m.attachments ? JSON.parse(m.attachments) : [],
      createdAt: m.created_at,
    }));

    this.send(ws, 'dm_history', {
      recipientId: payload.recipientId,
      channelId,
      messages,
    });
  }

  private handleTypingDm(ws: WebSocket, payload: { recipientId: string; isTyping: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !payload.recipientId) return;

    for (const [targetWs, targetClient] of this.clients.entries()) {
      if (targetClient.userId === payload.recipientId && targetWs !== ws) {
        this.send(targetWs, 'user_typing_dm', {
          senderId: client.userId,
          displayName: client.displayName,
          isTyping: payload.isTyping,
        });
      }
    }
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

    // 1. Create default roles for this server (Admin, Mod, Membro)
    const adminRoleId = `role-${uuidv4().slice(0, 8)}`;
    const modRoleId = `role-${uuidv4().slice(0, 8)}`;
    const memberRoleId = `role-${uuidv4().slice(0, 8)}`;

    db.prepare('INSERT INTO roles (id, server_id, name, color, is_admin, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      adminRoleId, serverId, 'Administrador', '#eb459e', 1, 0
    );
    db.prepare('INSERT INTO roles (id, server_id, name, color, is_admin, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      modRoleId, serverId, 'Moderador', '#57f287', 0, 1
    );
    db.prepare('INSERT INTO roles (id, server_id, name, color, is_admin, position) VALUES (?, ?, ?, ?, ?, ?)').run(
      memberRoleId, serverId, 'Membro', '#99aab5', 0, 2
    );

    // 2. Add creator as owner member
    db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, role, role_id) VALUES (?, ?, ?, ?)').run(
      serverId,
      client.userId,
      'owner',
      adminRoleId
    );

    // 3. Automatically add all other existing LAN users to this new server as members
    const allUsers = db.prepare('SELECT id FROM users').all() as { id: string }[];
    for (const u of allUsers) {
      if (u.id !== client.userId) {
        db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, role, role_id) VALUES (?, ?, ?, ?)').run(
          serverId,
          u.id,
          'member',
          memberRoleId
        );
      }
    }

    // 4. Create default general channel for this server
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
    const newRoles = db.prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position ASC').all(serverId);
    const newMembers = db.prepare(`
      SELECT sm.server_id, sm.user_id, sm.nickname, sm.role, sm.role_id, sm.joined_at,
             r.name as role_name, r.color as role_color, r.is_admin
      FROM server_members sm
      LEFT JOIN roles r ON sm.role_id = r.id
      WHERE sm.server_id = ?
    `).all(serverId);

    this.broadcast('server_created', {
      server: newServer,
      channels: newChannels,
      roles: newRoles,
      serverMembers: newMembers,
    });
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
    const existingPeers: { peerId: string; userId: string; displayName: string; avatar: string; isMuted?: boolean; isDeafened?: boolean }[] = [];

    // Gather existing peers in room
    for (const peerClientId of room) {
      const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
      if (peer) {
        existingPeers.push({
          peerId: peer.id,
          userId: peer.userId,
          displayName: peer.displayName,
          avatar: peer.avatar,
          isMuted: peer.isMuted ?? false,
          isDeafened: peer.isDeafened ?? false,
        });

        // Notify existing peer that a new peer joined
        this.send(peer.ws, 'voice_peer_joined', {
          peerId: client.id,
          userId: client.userId,
          displayName: client.displayName,
          avatar: client.avatar,
          isMuted: client.isMuted ?? false,
          isDeafened: client.isDeafened ?? false,
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

  private handleVoiceScreenShare(ws: WebSocket, payload: { isSharing: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !client.currentVoiceChannelId) return;

    const room = this.voiceRooms.get(client.currentVoiceChannelId);
    if (!room) return;

    for (const peerClientId of room) {
      if (peerClientId === client.id) continue;
      const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
      if (peer) {
        this.send(peer.ws, 'voice_peer_screen_share', {
          peerId: client.id,
          userId: client.userId,
          isSharing: payload.isSharing,
        });
      }
    }
  }

  private handleVoiceAudioChunk(ws: WebSocket, payload: { chunk: string }) {
    const client = this.clients.get(ws);
    if (!client || !client.currentVoiceChannelId) return;

    const channelId = client.currentVoiceChannelId;
    const room = this.voiceRooms.get(channelId);
    if (!room) return;

    const msg = JSON.stringify({
      type: 'voice_peer_audio_chunk',
      payload: {
        userId: client.userId,
        peerId: client.id,
        chunk: payload.chunk,
      },
    });

    for (const [otherWs, otherClient] of this.clients.entries()) {
      if (otherWs !== ws && room.has(otherClient.id) && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(msg);
      }
    }
  }

  private handleVoiceStateUpdate(ws: WebSocket, payload: { isMuted?: boolean; isDeafened?: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !client.currentVoiceChannelId) return;

    if (payload.isMuted !== undefined) client.isMuted = payload.isMuted;
    if (payload.isDeafened !== undefined) client.isDeafened = payload.isDeafened;

    const channelId = client.currentVoiceChannelId;
    const room = this.voiceRooms.get(channelId);
    if (!room) return;

    for (const peerClientId of room) {
      const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
      if (peer && peer.ws.readyState === WebSocket.OPEN) {
        this.send(peer.ws, 'voice_peer_state_update', {
          peerId: client.id,
          userId: client.userId,
          channelId,
          isMuted: client.isMuted ?? false,
          isDeafened: client.isDeafened ?? false,
        });
      }
    }

    this.broadcastVoiceRoomUpdate(channelId);
  }

  private handleSoundboardPlay(ws: WebSocket, payload: { channelId: string; soundId: string; soundName: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const channelId = payload.channelId || client.currentVoiceChannelId;
    if (!channelId) return;

    const room = this.voiceRooms.get(channelId);
    if (room) {
      for (const peerClientId of room) {
        if (peerClientId === client.id) continue;
        const peer = Array.from(this.clients.values()).find((c) => c.id === peerClientId);
        if (peer && peer.ws.readyState === WebSocket.OPEN) {
          this.send(peer.ws, 'voice_soundboard_play', {
            channelId,
            soundId: payload.soundId,
            soundName: payload.soundName,
            userId: client.userId,
            displayName: client.displayName,
          });
        }
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
            return c
              ? {
                  peerId: c.id,
                  userId: c.userId,
                  username: c.username,
                  displayName: c.displayName,
                  avatar: c.avatar,
                  isMuted: c.isMuted ?? false,
                  isDeafened: c.isDeafened ?? false,
                }
              : null;
          })
          .filter(Boolean)
      : [];

    this.broadcast('voice_room_update', {
      channelId,
      members,
    });
  }

  private hasAdminPermission(serverId: string, userId: string): boolean {
    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId) as any;
    if (server && server.owner_id === userId) return true;

    const member = db.prepare(`
      SELECT sm.*, r.is_admin 
      FROM server_members sm
      LEFT JOIN roles r ON sm.role_id = r.id
      WHERE sm.server_id = ? AND sm.user_id = ?
    `).get(serverId, userId) as any;

    if (member) {
      if (member.role === 'owner' || member.role === 'admin' || member.is_admin === 1) {
        return true;
      }
    }
    return false;
  }

  private hasModOrAdminPermission(serverId: string, userId: string): boolean {
    if (this.hasAdminPermission(serverId, userId)) return true;

    const member = db.prepare(`
      SELECT sm.*, r.is_admin, r.name as role_name
      FROM server_members sm
      LEFT JOIN roles r ON sm.role_id = r.id
      WHERE sm.server_id = ? AND sm.user_id = ?
    `).get(serverId, userId) as any;

    if (member) {
      if (member.role === 'moderator' || member.role === 'mod') {
        return true;
      }
      if (member.role_name && member.role_name.toLowerCase().includes('mod')) {
        return true;
      }
    }
    return false;
  }

  private handleDeleteMessage(ws: WebSocket, payload: { messageId: string; channelId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(payload.messageId) as any;
    if (!msg) return;

    const chan = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(payload.channelId) as any;
    const isAuthor = client.userId === msg.user_id;
    const canDelete = isAuthor || (chan ? this.hasModOrAdminPermission(chan.server_id, client.userId) : false);

    if (canDelete) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(payload.messageId);
      this.broadcast('message_deleted', { messageId: payload.messageId, channelId: payload.channelId });
    }
  }

  private handleDeleteChannel(ws: WebSocket, payload: { channelId: string; serverId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (!this.hasAdminPermission(payload.serverId, client.userId)) {
      return;
    }

    // If channel has active voice room, clean it up
    if (this.voiceRooms.has(payload.channelId)) {
      this.voiceRooms.delete(payload.channelId);
      this.broadcastVoiceRoomUpdate(payload.channelId);
    }

    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(payload.channelId);
    db.prepare('DELETE FROM channels WHERE id = ?').run(payload.channelId);

    this.broadcast('channel_deleted', { channelId: payload.channelId, serverId: payload.serverId });
  }

  private handleDeleteServer(ws: WebSocket, payload: { serverId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(payload.serverId) as any;
    if (!server) return;

    if (server.owner_id !== client.userId && !this.hasAdminPermission(payload.serverId, client.userId)) {
      return;
    }

    // Clean up all related data
    db.prepare('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(payload.serverId);
    db.prepare('DELETE FROM channels WHERE server_id = ?').run(payload.serverId);
    db.prepare('DELETE FROM roles WHERE server_id = ?').run(payload.serverId);
    db.prepare('DELETE FROM server_members WHERE server_id = ?').run(payload.serverId);
    db.prepare('DELETE FROM servers WHERE id = ?').run(payload.serverId);

    this.broadcast('server_deleted', { serverId: payload.serverId });
  }

  private handleKickMember(ws: WebSocket, payload: { serverId: string; userId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(payload.serverId) as any;
    if (server && server.owner_id === payload.userId) {
      // Cannot kick server owner
      return;
    }

    if (!this.hasAdminPermission(payload.serverId, client.userId)) {
      return;
    }

    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(payload.serverId, payload.userId);
    this.broadcast('member_kicked', { serverId: payload.serverId, userId: payload.userId });
  }

  private handleDeleteUser(ws: WebSocket, payload: { userId: string }) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Only owners/admins can delete users completely
    db.prepare('DELETE FROM messages WHERE user_id = ?').run(payload.userId);
    db.prepare('DELETE FROM server_members WHERE user_id = ?').run(payload.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(payload.userId);

    // Disconnect target user sockets if connected
    for (const [targetWs, targetClient] of this.clients.entries()) {
      if (targetClient.userId === payload.userId) {
        this.send(targetWs, 'user_kicked', { message: 'Sua conta foi excluída pelo administrador.' });
        targetWs.close();
      }
    }

    this.broadcast('user_deleted', { userId: payload.userId });
  }

  private handleCreateRole(ws: WebSocket, payload: { serverId: string; name: string; color?: string; isAdmin?: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !this.hasAdminPermission(payload.serverId, client.userId)) return;

    const roleId = `role-${uuidv4().slice(0, 8)}`;
    const color = payload.color || '#99aab5';
    const isAdmin = payload.isAdmin ? 1 : 0;
    const position = 1;

    db.prepare(`
      INSERT INTO roles (id, server_id, name, color, is_admin, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(roleId, payload.serverId, payload.name, color, isAdmin, position);

    const newRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    this.broadcast('role_created', { role: newRole });
  }

  private handleUpdateRole(ws: WebSocket, payload: { roleId: string; serverId: string; name: string; color: string; isAdmin: boolean }) {
    const client = this.clients.get(ws);
    if (!client || !this.hasAdminPermission(payload.serverId, client.userId)) return;

    db.prepare(`
      UPDATE roles
      SET name = ?, color = ?, is_admin = ?
      WHERE id = ? AND server_id = ?
    `).run(payload.name, payload.color, payload.isAdmin ? 1 : 0, payload.roleId, payload.serverId);

    const updatedRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(payload.roleId);
    this.broadcast('role_updated', { role: updatedRole });
  }

  private handleDeleteRole(ws: WebSocket, payload: { roleId: string; serverId: string }) {
    const client = this.clients.get(ws);
    if (!client || !this.hasAdminPermission(payload.serverId, client.userId)) return;

    db.prepare('UPDATE server_members SET role_id = NULL WHERE role_id = ?').run(payload.roleId);
    db.prepare('DELETE FROM roles WHERE id = ? AND server_id = ?').run(payload.roleId, payload.serverId);

    this.broadcast('role_deleted', { roleId: payload.roleId, serverId: payload.serverId });
  }

  private handleAssignMemberRole(ws: WebSocket, payload: { serverId: string; userId: string; roleId?: string; roleName?: string }) {
    const client = this.clients.get(ws);
    if (!client || !this.hasAdminPermission(payload.serverId, client.userId)) return;

    let roleId: string | null = (payload.roleId && payload.roleId !== 'none') ? payload.roleId : null;
    let role = payload.roleName || 'member';

    if (roleId) {
      const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
      if (r) {
        role = r.is_admin === 1 ? 'admin' : r.name;
      } else {
        roleId = null;
      }
    } else {
      role = 'member';
    }

    db.prepare(`
      UPDATE server_members
      SET role_id = ?, role = ?
      WHERE server_id = ? AND user_id = ?
    `).run(roleId, role, payload.serverId, payload.userId);

    const member = db.prepare(`
      SELECT sm.server_id, sm.user_id, sm.nickname, sm.role, sm.role_id, sm.joined_at,
             r.name as role_name, r.color as role_color, r.is_admin
      FROM server_members sm
      LEFT JOIN roles r ON sm.role_id = r.id
      WHERE sm.server_id = ? AND sm.user_id = ?
    `).get(payload.serverId, payload.userId);

    this.broadcast('member_role_updated', {
      serverId: payload.serverId,
      userId: payload.userId,
      roleId: payload.roleId || null,
      role,
      member,
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
