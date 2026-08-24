import { appState } from '../stores/appState.svelte';
import { WebRtcVoiceEngine } from '../webrtc/voiceEngine';
import { soundService } from '../services/soundService.svelte';
import { notificationService } from '../services/notificationService.svelte';
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

  private fallbackAttempts = 0;

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
      let target = appState.serverUrl || 'http://localhost:3000';
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = `http://${target}`;
      }
      const httpUrl = new URL(target);
      const wsProtocol = (httpUrl.protocol === 'https:' || httpUrl.protocol === 'wss:') ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${httpUrl.host}`;

      console.log('Connecting to WebSocket at:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.fallbackAttempts = 0;
        appState.connectionStatus = 'connected';
        console.log('Connected to Concord LAN server at', wsUrl);

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
        this.fallbackAttempts++;
        console.log(`Attempting to reconnect to Concord LAN server (attempt #${this.fallbackAttempts})...`);
        // If failed multiple times on custom saved URL, try fallback to current hostname:3000 or localhost:3000
        if (this.fallbackAttempts >= 2 && typeof window !== 'undefined') {
          const localHostUrl = 'http://localhost:3000';
          const networkHostUrl = window.location.hostname ? `http://${window.location.hostname}:3000` : localHostUrl;
          if (appState.serverUrl !== networkHostUrl) {
            console.log('🔄 Attempting fallback to:', networkHostUrl);
            appState.setServerUrl(networkHostUrl);
          } else if (appState.serverUrl !== localHostUrl) {
            console.log('🔄 Attempting fallback to:', localHostUrl);
            appState.setServerUrl(localHostUrl);
          }
        }
        this.connect();
      }
    }, 2500);
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

        if (payload.dmConversations && Array.isArray(payload.dmConversations)) {
          payload.dmConversations.forEach((conv: any) => {
            appState.dmConversations[conv.userId] = conv;
          });
        }

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
        const isFromOther = payload.userId !== appState.currentUser.id && payload.user?.id !== appState.currentUser.id;
        if (isFromOther) {
          const isCurrentActiveChannel = appState.currentView === 'chat' && appState.currentChannelId === payload.channelId && !document.hidden;
          if (!isCurrentActiveChannel) {
            appState.unreadChannels[payload.channelId] = (appState.unreadChannels[payload.channelId] || 0) + 1;
            const chan = appState.channels.find((c) => c.id === payload.channelId);
            const srv = chan ? appState.servers.find((s) => s.id === chan.server_id) : null;
            notificationService.notify({
              senderName: payload.user?.displayName || payload.user?.username || 'Membro',
              senderAvatar: payload.user?.avatar,
              senderUserId: payload.userId || payload.user?.id,
              locationType: 'channel',
              channelId: payload.channelId,
              channelName: chan?.name || 'chat',
              serverId: chan?.server_id,
              serverName: srv?.name || 'Servidor',
              body: payload.content,
            });
          } else {
            soundService.play('message-received');
          }
        }
        break;
      }

      case 'new_dm': {
        const otherUserId = payload.senderId === appState.currentUser.id ? payload.recipientId : payload.senderId;
        if (!appState.dmMessages[otherUserId]) {
          appState.dmMessages[otherUserId] = [];
        }
        // Avoid duplicates
        if (!appState.dmMessages[otherUserId].some((m) => m.id === payload.id)) {
          appState.dmMessages[otherUserId].push(payload);
        }

        // Update DM Conversation entry
        const otherUser = appState.users.find((u) => u.id === otherUserId) || payload.user;
        const isSender = payload.senderId === appState.currentUser.id;
        const isCurrentlyInThisDm = appState.currentView === 'dms' && appState.activeDmUserId === otherUserId && !document.hidden;

        if (!isSender && !isCurrentlyInThisDm) {
          appState.unreadDms[otherUserId] = (appState.unreadDms[otherUserId] || 0) + 1;
        }

        appState.dmConversations[otherUserId] = {
          id: payload.channelId,
          userId: otherUserId,
          user: otherUser,
          lastMessage: {
            content: payload.content,
            createdAt: payload.createdAt,
            senderId: payload.senderId,
          },
          unreadCount: appState.unreadDms[otherUserId] || 0,
          updatedAt: payload.createdAt,
        };

        if (!isSender) {
          if (!isCurrentlyInThisDm) {
            notificationService.notify({
              senderName: payload.user?.displayName || payload.user?.username || 'Amigo',
              senderAvatar: payload.user?.avatar,
              senderUserId: otherUserId,
              locationType: 'dm',
              isDm: true,
              body: payload.content,
            });
          } else {
            soundService.play('message-received');
          }
        }
        break;
      }

      case 'dm_history': {
        if (payload.recipientId && payload.messages) {
          appState.dmMessages[payload.recipientId] = payload.messages;
        }
        break;
      }

      case 'user_typing_dm': {
        if (payload.senderId) {
          appState.typingDmUsers[payload.senderId] = payload.isTyping;
        }
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
          soundService.play('success');
        }
        break;
      }

      case 'server_created': {
        if (!appState.servers.some((s) => s.id === payload.server.id)) {
          appState.servers.push(payload.server);
          soundService.play('success');
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
        soundService.play('join-channel');
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
        soundService.play('leave-channel');
        appState.voiceState.activeChannelId = null;
        if (this.voiceEngine) {
          this.voiceEngine.cleanup();
          this.setupVoiceEngine();
        }
        break;
      }

      case 'voice_soundboard_play': {
        soundService.playSoundboard(payload.soundId);
        break;
      }

      case 'voice_peer_joined': {
        soundService.play('join-channel');
        console.log('Peer joined voice channel:', payload.displayName);
        break;
      }

      case 'voice_peer_left': {
        soundService.play('leave-channel');
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

      case 'voice_peer_state_update': {
        for (const chanId in appState.voiceState.roomParticipants) {
          const list = appState.voiceState.roomParticipants[chanId];
          const participant = list.find((p) => p.userId === payload.userId || p.peerId === payload.peerId);
          if (participant) {
            participant.isMuted = payload.isMuted;
            participant.isDeafened = payload.isDeafened;
          }
        }
        break;
      }

      case 'voice_peer_audio_chunk': {
        if (this.voiceEngine && payload.userId !== appState.currentUser.id) {
          if (!this.voiceEngine.hasActiveWebRtcAudio(payload.userId)) {
            const userVol = this.getUserVolume(payload.userId);
            this.voiceEngine.playRemoteAudioChunk(payload.userId, payload.chunk, userVol);
          }
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

  sendDm(recipientId: string, content: string, attachments?: string[]) {
    this.send('send_dm', {
      recipientId,
      content,
      attachments,
    });
  }

  fetchDmHistory(recipientId: string) {
    this.send('get_dm_history', { recipientId });
  }

  sendTyping(channelId: string, isTyping: boolean) {
    this.send('typing', { channelId, isTyping });
  }

  sendTypingDm(recipientId: string, isTyping: boolean) {
    this.send('typing_dm', { recipientId, isTyping });
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
    soundService.play('leave-channel');
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
    soundService.play(next ? 'mute' : 'unmute');
    if (this.voiceEngine) {
      this.voiceEngine.setMute(next);
    }

    // Update local state in room participants list
    if (appState.voiceState.activeChannelId && appState.voiceState.roomParticipants[appState.voiceState.activeChannelId]) {
      const p = appState.voiceState.roomParticipants[appState.voiceState.activeChannelId].find((x) => x.userId === appState.currentUser.id);
      if (p) {
        p.isMuted = next;
      }
    }

    this.send('voice_state_update', {
      isMuted: next,
      isDeafened: appState.voiceState.isDeafened,
    });
  }

  toggleDeafen() {
    const next = !appState.voiceState.isDeafened;
    appState.voiceState.isDeafened = next;

    if (next) {
      // Deafening muts BOTH incoming audio and outgoing microphone
      appState.voiceState.isMuted = true;
      if (this.voiceEngine) {
        this.voiceEngine.setDeafen(true);
        this.voiceEngine.setMute(true);
      }
    } else {
      // Undeafening restores both incoming audio and outgoing mic
      appState.voiceState.isMuted = false;
      if (this.voiceEngine) {
        this.voiceEngine.setDeafen(false);
        this.voiceEngine.setMute(false);
      }
    }

    soundService.play(next ? 'deafen' : 'undeafen');

    // Update local state in room participants list
    if (appState.voiceState.activeChannelId && appState.voiceState.roomParticipants[appState.voiceState.activeChannelId]) {
      const p = appState.voiceState.roomParticipants[appState.voiceState.activeChannelId].find((x) => x.userId === appState.currentUser.id);
      if (p) {
        p.isDeafened = next;
        p.isMuted = appState.voiceState.isMuted;
      }
    }

    this.send('voice_state_update', {
      isMuted: appState.voiceState.isMuted,
      isDeafened: next,
    });
  }

  async startScreenShare() {
    if (this.voiceEngine) {
      try {
        await this.voiceEngine.startScreenShare();
        appState.voiceState.isScreenSharing = true;
        soundService.play('screen-share-start');
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
      soundService.play('screen-share-stop');
      this.send('voice_screen_share', { isSharing: false });
    }
  }

  broadcastSoundboard(channelId: string, soundId: string, soundName: string) {
    this.send('soundboard_play', { channelId, soundId, soundName });
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
    appState.audioSettings.inputDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_audio_settings', JSON.stringify(appState.audioSettings));
    }
    if (this.voiceEngine) {
      await this.voiceEngine.switchMicrophone(deviceId);
    }
  }

  async setAudioOutput(deviceId: string) {
    appState.audioSettings.outputDeviceId = deviceId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_audio_settings', JSON.stringify(appState.audioSettings));
    }
  }

  updateAudioSettings(settings: Partial<typeof appState.audioSettings>) {
    appState.audioSettings = { ...appState.audioSettings, ...settings };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_audio_settings', JSON.stringify(appState.audioSettings));
    }
    if (this.voiceEngine) {
      this.voiceEngine.applyAudioSettings(settings);
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
