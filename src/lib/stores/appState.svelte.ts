import type { User, Server, Channel, Message, DiscoveredServer } from '../types';

// Generate or retrieve persistent local user identity
function getOrCreateUser(): User {
  const saved = localStorage.getItem('concord_user');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  const id = 'user-' + Math.random().toString(36).substring(2, 9);
  const avatars = ['😎', '🦊', '🐱', '🚀', '⚡', '🎮', '👾', '🔥', '🛡️'];
  const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  
  const user: User = {
    id,
    username: `User${randomNum}`,
    displayName: `LAN Gamer #${randomNum}`,
    avatar: randomAvatar,
    status: 'online',
    customStatus: 'Chilling on LAN',
  };
  localStorage.setItem('concord_user', JSON.stringify(user));
  return user;
}

function getSavedServerUrl(): string {
  const saved = localStorage.getItem('concord_server_url');
  if (saved) return saved;
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `http://${window.location.hostname}:3000`;
  }
  return 'http://localhost:3000';
}

class AppState {
  currentUser = $state<User>(getOrCreateUser());
  serverUrl = $state<string>(getSavedServerUrl());
  connectionStatus = $state<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  servers = $state<Server[]>([]);
  channels = $state<Channel[]>([]);
  currentServerId = $state<string>('server-general');
  currentChannelId = $state<string>('chan-general');
  
  users = $state<User[]>([]);
  messages = $state<Record<string, Message[]>>({});
  typingUsers = $state<Record<string, string[]>>({});
  
  // Voice state
  voiceState = $state<{
    activeChannelId: string | null;
    isMuted: boolean;
    isDeafened: boolean;
    isSpeaking: boolean;
    roomParticipants: Record<string, { userId: string; username: string; displayName: string; avatar: string; isSpeaking?: boolean }[]>;
  }>({
    activeChannelId: null,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    roomParticipants: {},
  });

  discoveredServers = $state<DiscoveredServer[]>([]);
  activeModal = $state<'discovery' | 'createChannel' | 'createServer' | 'settings' | 'hostServer' | 'micPermission' | null>(null);
  pendingVoiceChannelId = $state<string | null>(null);

  // Local Server Hosting State
  isTauriApp = $state<boolean>(false);
  localServerRunning = $state<boolean>(false);
  isServerStarting = $state<boolean>(false);
  serverLogs = $state<string[]>([]);
  lanIps = $state<string[]>([]);

  // Derived properties
  get currentServer(): Server | undefined {
    return this.servers.find((s) => s.id === this.currentServerId) || this.servers[0];
  }

  get currentChannels(): Channel[] {
    return this.channels.filter((c) => c.server_id === this.currentServerId);
  }

  get currentTextChannels(): Channel[] {
    return this.currentChannels.filter((c) => c.type === 'text');
  }

  get currentVoiceChannels(): Channel[] {
    return this.currentChannels.filter((c) => c.type === 'voice');
  }

  get currentChannel(): Channel | undefined {
    return this.channels.find((c) => c.id === this.currentChannelId) || this.currentTextChannels[0];
  }

  get currentMessages(): Message[] {
    return this.messages[this.currentChannelId] || [];
  }

  get onlineUsers(): User[] {
    return this.users.filter((u) => u.status !== 'offline');
  }

  get offlineUsers(): User[] {
    return this.users.filter((u) => u.status === 'offline');
  }

  setUser(user: Partial<User>) {
    this.currentUser = { ...this.currentUser, ...user };
    localStorage.setItem('concord_user', JSON.stringify(this.currentUser));
  }

  setServerUrl(url: string) {
    this.serverUrl = url;
    localStorage.setItem('concord_server_url', url);
  }

  setMessagesForChannel(channelId: string, msgs: Message[]) {
    this.messages[channelId] = msgs;
  }

  addMessage(msg: Message) {
    if (!this.messages[msg.channelId]) {
      this.messages[msg.channelId] = [];
    }
    // Prevent duplicate messages
    if (!this.messages[msg.channelId].some((m) => m.id === msg.id)) {
      this.messages[msg.channelId].push(msg);
    }
  }

  setUserTyping(channelId: string, displayName: string, isTyping: boolean) {
    if (!this.typingUsers[channelId]) {
      this.typingUsers[channelId] = [];
    }
    if (isTyping) {
      if (!this.typingUsers[channelId].includes(displayName)) {
        this.typingUsers[channelId].push(displayName);
      }
    } else {
      this.typingUsers[channelId] = this.typingUsers[channelId].filter((name) => name !== displayName);
    }
  }
}

export const appState = new AppState();
