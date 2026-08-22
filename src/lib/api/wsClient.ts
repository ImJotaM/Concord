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
        appState.servers = payload.servers || [];
        appState.channels = payload.channels || [];
        appState.users = payload.users || [];
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
        }
        break;
      }

      // WebRTC Voice Events
      case 'voice_joined': {
        appState.voiceState.activeChannelId = payload.channelId;
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
          const participant = list.find((p) => p.userId === payload.userId);
          if (participant) {
            participant.isSpeaking = payload.isSpeaking;
          }
        }
        break;
      }

      case 'voice_room_update': {
        appState.voiceState.roomParticipants[payload.channelId] = payload.members || [];
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

  async joinVoiceChannel(channelId: string) {
    try {
      if (this.voiceEngine) {
        await this.voiceEngine.startLocalAudio();
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
        return `${appState.serverUrl}${data.url}`;
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

  public send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}

export const clientService = new ClientService();
