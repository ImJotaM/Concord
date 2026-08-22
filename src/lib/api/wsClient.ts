import { appState } from '../stores/appState.svelte';
import { WebRtcVoiceEngine } from '../webrtc/voiceEngine';
import type { Message } from '../types';

class ClientService {
  private ws: WebSocket | null = null;
  private voiceEngine: WebRtcVoiceEngine | null = null;
  private reconnectTimer: any = null;
  private isIntentionalDisconnect = false;

  constructor() {
    this.setupVoiceEngine();
  }

  private setupVoiceEngine() {
    this.voiceEngine = new WebRtcVoiceEngine(
      (targetPeerId, signal) => {
        this.send('voice_signal', { targetPeerId, signal });
      },
      (isSpeaking) => {
        appState.voiceState.isSpeaking = isSpeaking;
        this.send('voice_speaking', { isSpeaking });
      },
      (audioChunk) => {
        this.send('voice_audio_chunk', { chunk: audioChunk });
      }
    );
  }

  connect(serverUrl?: string) {
    if (serverUrl) {
      appState.setServerUrl(serverUrl);
    }

    if (this.ws) {
      this.isIntentionalDisconnect = true;
      this.ws.close();
      this.ws = null;
    }

    this.isIntentionalDisconnect = false;
    appState.connectionStatus = 'connecting';

    try {
      const httpUrl = new URL(appState.serverUrl);
      const wsProtocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${httpUrl.host}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        appState.connectionStatus = 'connected';
        console.log('⚡ Connected to Concord LAN server at', wsUrl);

        // Authenticate immediately
        this.send('auth', {
          userId: appState.currentUser.id,
          username: appState.currentUser.username,
          displayName: appState.currentUser.displayName,
          avatar: appState.currentUser.avatar,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);
          this.handleServerMessage(type, payload);
        } catch (err) {
          console.error('Failed to parse incoming WebSocket message:', err);
        }
      };

      this.ws.onclose = () => {
        if (!this.isIntentionalDisconnect) {
          appState.connectionStatus = 'disconnected';
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
        appState.connectionStatus = 'error';
      };
    } catch (err) {
      console.error('Invalid server URL:', err);
      appState.connectionStatus = 'error';
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (appState.connectionStatus !== 'connected') {
        console.log('Attempting to reconnect to Concord LAN server...');
        this.connect();
      }
    }, 3000);
  }

  private handleServerMessage(type: string, payload: any) {
    switch (type) {
      case 'init_sync': {
        if (payload.myPeerId && this.voiceEngine) {
          this.voiceEngine.setMyPeerId(payload.myPeerId);
        }
        appState.servers = payload.servers || [];
        appState.channels = payload.channels || [];
        appState.users = payload.users || [];
        appState.roles = payload.roles || [];
        appState.serverMembers = payload.serverMembers || [];
        appState.voiceState.roomParticipants = payload.voiceRooms || {};

        if (appState.servers.length > 0 && !appState.servers.some((s) => s.id === appState.currentServerId)) {
          appState.currentServerId = appState.servers[0].id;
        }

        const availableChannels = appState.channels.filter((c) => c.server_id === appState.currentServerId);
        const textChannels = availableChannels.filter((c) => c.type === 'text');
        if (textChannels.length > 0 && !textChannels.some((c) => c.id === appState.currentChannelId)) {
          appState.currentChannelId = textChannels[0].id;
        }

        // Fetch initial messages for current channel
        if (appState.currentChannelId) {
          this.fetchChannelMessages(appState.currentChannelId);
        }
        break;
      }

      case 'new_message': {
        appState.addMessage(payload);
        break;
      }

      case 'user_presence': {
        const user = appState.users.find((u) => u.id === payload.userId);
        if (user) {
          user.status = payload.status;
          if (payload.customStatus !== undefined) {
            user.customStatus = payload.customStatus;
          }
          if (payload.user) {
            user.displayName = payload.user.displayName || user.displayName;
            user.avatar = payload.user.avatar || user.avatar;
          }
        } else if (payload.user) {
          appState.users.push(payload.user);
        }
        break;
      }

      case 'user_typing': {
        appState.setUserTyping(payload.channelId, payload.displayName, payload.isTyping);
        break;
      }

      case 'channel_created': {
        if (!appState.channels.some((c) => c.id === payload.id)) {
          appState.channels.push(payload);
        }
        break;
      }

      case 'server_created': {
        if (!appState.servers.some((s) => s.id === payload.server.id)) {
          appState.servers.push(payload.server);
          if (payload.channels) {
            payload.channels.forEach((c: any) => {
              if (!appState.channels.some((ch) => ch.id === c.id)) {
                appState.channels.push(c);
              }
            });
          }
          if (payload.roles) {
            payload.roles.forEach((r: any) => {
              if (!appState.roles.some((ro) => ro.id === r.id)) {
                appState.roles.push(r);
              }
            });
          }
          if (payload.serverMembers) {
            payload.serverMembers.forEach((sm: any) => {
              const idx = appState.serverMembers.findIndex(
                (existing) => existing.server_id === sm.server_id && existing.user_id === sm.user_id
              );
              if (idx !== -1) {
                appState.serverMembers[idx] = sm;
              } else {
                appState.serverMembers.push(sm);
              }
            });
          }
        }
        break;
      }

      // WebRTC Voice Events
      case 'voice_joined': {
        appState.voiceState.activeChannelId = payload.channelId;
        if (payload.myPeerId && this.voiceEngine) {
          this.voiceEngine.setMyPeerId(payload.myPeerId);
        }
        // Connect with each existing peer
        if (payload.existingPeers && this.voiceEngine) {
          for (const peer of payload.existingPeers) {
            this.voiceEngine.connectToPeer(peer.peerId);
          }
        }
        break;
      }

      case 'voice_left': {
        appState.voiceState.activeChannelId = null;
        if (this.voiceEngine) {
          this.voiceEngine.cleanup();
          this.setupVoiceEngine();
        }
        break;
      }

      case 'voice_peer_joined': {
        console.log('Peer joined voice channel:', payload.displayName);
        break;
      }

      case 'voice_peer_left': {
        if (this.voiceEngine) {
          this.voiceEngine.removePeer(payload.peerId);
        }
        break;
      }

      case 'voice_signal': {
        if (this.voiceEngine) {
          this.voiceEngine.handleSignal(payload.fromPeerId, payload.signal);
        }
        break;
      }

      case 'voice_peer_speaking': {
        // Update speaking status in participant list
        for (const chanId in appState.voiceState.roomParticipants) {
          const list = appState.voiceState.roomParticipants[chanId];
          const participant = list.find((p) => p.userId === payload.userId || p.peerId === payload.peerId);
          if (participant) {
            participant.isSpeaking = payload.isSpeaking;
          }
        }
        break;
      }

      case 'voice_peer_screen_share': {
        if (!payload.isSharing) {
          delete appState.voiceState.remoteScreenStreams[payload.peerId];
        }
        for (const chanId in appState.voiceState.roomParticipants) {
          const list = appState.voiceState.roomParticipants[chanId];
          const participant = list.find((p) => p.userId === payload.userId || p.peerId === payload.peerId);
          if (participant) {
            participant.isScreenSharing = payload.isSharing;
          }
        }
        break;
      }

      case 'voice_peer_audio_chunk': {
        if (this.voiceEngine) {
          const userVol = this.getUserVolume(payload.userId);
          this.voiceEngine.playRemoteAudioChunk(payload.userId, payload.chunk, userVol);
        }
        break;
      }

      case 'voice_room_update': {
        appState.voiceState.roomParticipants[payload.channelId] = payload.members || [];
        break;
      }

      // Moderation & Roles Events
      case 'message_deleted': {
        if (appState.messages[payload.channelId]) {
          appState.messages[payload.channelId] = appState.messages[payload.channelId].filter((m) => m.id !== payload.messageId);
        }
        break;
      }

      case 'channel_deleted': {
        appState.channels = appState.channels.filter((c) => c.id !== payload.channelId);
        delete appState.messages[payload.channelId];
        if (appState.currentChannelId === payload.channelId) {
          const remaining = appState.currentChannels.filter((c) => c.type === 'text');
          if (remaining.length > 0) {
            appState.currentChannelId = remaining[0].id;
            this.fetchChannelMessages(remaining[0].id);
          }
        }
        break;
      }

      case 'server_deleted': {
        appState.servers = appState.servers.filter((s) => s.id !== payload.serverId);
        appState.channels = appState.channels.filter((c) => c.server_id !== payload.serverId);
        appState.roles = appState.roles.filter((r) => r.server_id !== payload.serverId);
        appState.serverMembers = appState.serverMembers.filter((sm) => sm.server_id !== payload.serverId);
        if (appState.currentServerId === payload.serverId) {
          if (appState.servers.length > 0) {
            appState.currentServerId = appState.servers[0].id;
            const chans = appState.channels.filter((c) => c.server_id === appState.currentServerId && c.type === 'text');
            if (chans.length > 0) {
              appState.currentChannelId = chans[0].id;
              this.fetchChannelMessages(chans[0].id);
            }
          }
        }
        break;
      }

      case 'member_kicked': {
        appState.serverMembers = appState.serverMembers.filter(
          (sm) => !(sm.server_id === payload.serverId && sm.user_id === payload.userId)
        );
        if (payload.userId === appState.currentUser.id && appState.currentServerId === payload.serverId) {
          const otherServers = appState.servers.filter((s) => s.id !== payload.serverId);
          if (otherServers.length > 0) {
            appState.currentServerId = otherServers[0].id;
          }
        }
        break;
      }

      case 'user_deleted': {
        appState.users = appState.users.filter((u) => u.id !== payload.userId);
        appState.serverMembers = appState.serverMembers.filter((sm) => sm.user_id !== payload.userId);
        for (const chanId in appState.messages) {
          appState.messages[chanId] = appState.messages[chanId].filter((m) => m.userId !== payload.userId);
        }
        break;
      }

      case 'user_kicked': {
        alert(payload.message || 'Você foi desconectado pelo administrador.');
        window.location.reload();
        break;
      }

      case 'role_created': {
        if (!appState.roles.some((r) => r.id === payload.role.id)) {
          appState.roles.push(payload.role);
        }
        break;
      }

      case 'role_updated': {
        const idx = appState.roles.findIndex((r) => r.id === payload.role.id);
        if (idx !== -1) {
          appState.roles[idx] = payload.role;
        }
        break;
      }

      case 'role_deleted': {
        appState.roles = appState.roles.filter((r) => r.id !== payload.roleId);
        appState.serverMembers.forEach((sm) => {
          if (sm.role_id === payload.roleId) {
            sm.role_id = undefined;
          }
        });
        break;
      }

      case 'member_role_updated': {
        const idx = appState.serverMembers.findIndex(
          (sm) => sm.server_id === payload.serverId && sm.user_id === payload.userId
        );
        if (idx !== -1) {
          appState.serverMembers[idx] = { ...appState.serverMembers[idx], ...payload.member, role: payload.role, role_id: payload.roleId };
        } else {
          appState.serverMembers.push(payload.member || {
            server_id: payload.serverId,
            user_id: payload.userId,
            role: payload.role,
            role_id: payload.roleId,
          });
        }
        break;
      }
    }
  }

  async fetchChannelMessages(channelId: string) {
    try {
      const res = await fetch(`${appState.serverUrl}/api/channels/${channelId}/messages?limit=50`);
      if (res.ok) {
        const msgs: Message[] = await res.json();
        appState.setMessagesForChannel(channelId, msgs);
      }
    } catch (err) {
      console.error(`Failed to fetch messages for channel ${channelId}:`, err);
    }
  }

  sendMessage(channelId: string, content: string, attachments?: string[]) {
    this.send('send_message', {
      channelId,
      content,
      attachments,
    });
  }

  sendTyping(channelId: string, isTyping: boolean) {
    this.send('typing', { channelId, isTyping });
  }

  createChannel(serverId: string, name: string, type: 'text' | 'voice', topic?: string) {
    this.send('create_channel', { serverId, name, type, topic });
  }

  createServer(name: string, icon?: string) {
    this.send('create_server', { name, icon });
  }

  async joinVoiceChannel(channelId: string, listenOnly = false, deviceId?: string) {
    try {
      if (this.voiceEngine && !listenOnly) {
        await this.voiceEngine.startLocalAudio(deviceId);
        this.voiceEngine.setMute(appState.voiceState.isMuted);
        this.voiceEngine.setDeafen(appState.voiceState.isDeafened);
      }
      this.send('voice_join', { channelId });
    } catch (err: any) {
      console.warn('Microphone permission or secure context required:', err);
      appState.pendingVoiceChannelId = channelId;
      appState.activeModal = 'micPermission';
    }
  }

  leaveVoiceChannel() {
    this.send('voice_leave', {});
    if (this.voiceEngine) {
      this.voiceEngine.cleanup();
      this.setupVoiceEngine();
    }
    appState.voiceState.activeChannelId = null;
  }

  toggleMute() {
    const next = !appState.voiceState.isMuted;
    appState.voiceState.isMuted = next;
    if (this.voiceEngine) {
      this.voiceEngine.setMute(next);
    }
  }

  toggleDeafen() {
    const next = !appState.voiceState.isDeafened;
    appState.voiceState.isDeafened = next;
    if (this.voiceEngine) {
      this.voiceEngine.setDeafen(next);
    }
  }

  async startScreenShare() {
    if (this.voiceEngine) {
      try {
        await this.voiceEngine.startScreenShare();
        appState.voiceState.isScreenSharing = true;
        this.send('voice_screen_share', { isSharing: true });
      } catch (e) {
        console.error('Failed to start screen share:', e);
      }
    }
  }

  async stopScreenShare() {
    if (this.voiceEngine) {
      await this.voiceEngine.stopScreenShare();
      appState.voiceState.isScreenSharing = false;
      this.send('voice_screen_share', { isSharing: false });
    }
  }

  toggleScreenShare() {
    if (appState.voiceState.isScreenSharing) {
      this.stopScreenShare();
    } else {
      this.startScreenShare();
    }
  }

  setUserVolume(userId: string, volume: number) {
    appState.voiceState.userVolumes[userId] = volume;
    if (this.voiceEngine) {
      this.voiceEngine.setRemoteUserVolume(userId, volume);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`concord_vol_${userId}`, volume.toString());
      } catch {}
    }
  }

  getUserVolume(userId: string): number {
    if (appState.voiceState.userVolumes[userId] !== undefined) {
      return appState.voiceState.userVolumes[userId];
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(`concord_vol_${userId}`);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val)) {
          return val;
        }
      }
    }
    return 100; // Default 100%
  }

  async switchMicrophone(deviceId: string) {
    if (this.voiceEngine) {
      this.voiceEngine.cleanup();
      await this.joinVoiceChannel(appState.voiceState.activeChannelId!, false, deviceId);
    }
  }

  async setAudioOutput(deviceId: string) {
    // Handled directly via HTMLAudioElement.setSinkId on user audio elements
    appState.audioSettings.outputDeviceId = deviceId;
  }

  updateAudioSettings(settings: Partial<typeof appState.audioSettings>) {
    appState.audioSettings = { ...appState.audioSettings, ...settings };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_audio_settings', JSON.stringify(appState.audioSettings));
    }
  }

  async uploadFile(file: File): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${appState.serverUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      return null;
    } catch (err) {
      console.error('File upload failed:', err);
      return null;
    }
  }

  async scanLanServers() {
    const defaultPorts = [3000, 3001, 8080];
    const hostsToCheck = ['localhost'];
    if (
      typeof window !== 'undefined' &&
      window.location.hostname &&
      !hostsToCheck.includes(window.location.hostname)
    ) {
      hostsToCheck.push(window.location.hostname);
    }
    const found: { name: string; host: string; port: number; url: string }[] = [];

    for (const host of hostsToCheck) {
      for (const port of defaultPorts) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 800);
          const res = await fetch(`http://${host}:${port}/api/info`, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const info = await res.json();
            const url = `http://${host}:${port}`;
            if (!found.some((s) => s.url === url)) {
              found.push({
                name: `${info.name} (${info.hostname})`,
                host,
                port,
                url,
              });
            }
          }
        } catch {}
      }
    }

    appState.discoveredServers = found;
  }

  deleteMessage(messageId: string, channelId: string) {
    this.send('delete_message', { messageId, channelId });
  }

  deleteChannel(channelId: string, serverId: string) {
    this.send('delete_channel', { channelId, serverId });
  }

  deleteServer(serverId: string) {
    this.send('delete_server', { serverId });
  }

  kickMember(serverId: string, userId: string) {
    this.send('kick_member', { serverId, userId });
  }

  deleteUser(userId: string) {
    this.send('delete_user', { userId });
  }

  createRole(serverId: string, name: string, color = '#99aab5', isAdmin = false) {
    this.send('create_role', { serverId, name, color, isAdmin });
  }

  updateRole(roleId: string, serverId: string, name: string, color: string, isAdmin: boolean) {
    this.send('update_role', { roleId, serverId, name, color, isAdmin });
  }

  deleteRole(roleId: string, serverId: string) {
    this.send('delete_role', { roleId, serverId });
  }

  assignMemberRole(serverId: string, userId: string, roleId?: string, roleName?: string) {
    this.send('assign_member_role', { serverId, userId, roleId, roleName });
  }

  public send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}

export const clientService = new ClientService();
