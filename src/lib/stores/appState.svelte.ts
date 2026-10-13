import type {
  User,
  Server,
  Channel,
  Message,
  DiscoveredServer,
  AudioSettings,
  ScreenShareSettings,
  RemoteScreen,
  VoiceParticipant,
  BrowserTab,
  Role,
  ServerMember,
  DirectMessage,
  DirectMessageConversation,
  InAppNotification,
  NotificationSettings,
} from '../types';

function getSavedNotificationSettings(): NotificationSettings {
  const defaults: NotificationSettings = {
    enableSounds: true,
    enableDesktop: true,
    enableInAppToast: true,
    notifyAllMessages: true,
  };
  if (typeof localStorage === 'undefined') return defaults;
  const saved = localStorage.getItem('concord_notification_settings');
  if (saved) {
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch {}
  }
  return defaults;
}

function getSavedAudioSettings(): AudioSettings {
  const defaults: AudioSettings = {
    inputDeviceId: 'default',
    outputDeviceId: 'default',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sensitivity: 75,
  };
  if (typeof localStorage === 'undefined') return defaults;
  const saved = localStorage.getItem('concord_audio_settings');
  if (saved) {
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch {}
  }
  return defaults;
}

function getSavedScreenShareSettings(): ScreenShareSettings {
  const defaults: ScreenShareSettings = {
    resolution: '1080p',
    frameRate: 60,
    qualityMode: 'smooth',
    includeAudio: true,
  };
  if (typeof localStorage === 'undefined') return defaults;
  const saved = localStorage.getItem('concord_screenshare_settings');
  if (saved) {
    try {
      return { ...defaults, ...JSON.parse(saved) };
    } catch {}
  }
  return defaults;
}

// Generate or retrieve persistent local user identity
function getOrCreateUser(): User {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('concord_user') : null;
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  const id = 'user-' + Math.random().toString(36).substring(2, 9);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  
  const user: User = {
    id,
    username: `User${randomNum}`,
    displayName: `LAN Gamer #${randomNum}`,
    avatar: '',
    status: 'online',
    customStatus: 'Chilling on LAN',
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('concord_user', JSON.stringify(user));
  }
  return user;
}

function getSavedServerUrl(): string {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('concord_server_url') : null;
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
  
  roles = $state<Role[]>([]);
  serverMembers = $state<ServerMember[]>([]);
  
  users = $state<User[]>([]);
  messages = $state<Record<string, Message[]>>({});
  typingUsers = $state<Record<string, string[]>>({});

  audioSettings = $state<AudioSettings>(getSavedAudioSettings());
  screenShareSettings = $state<ScreenShareSettings>(getSavedScreenShareSettings());

  updateScreenShareSettings(newSettings: Partial<ScreenShareSettings>) {
    Object.assign(this.screenShareSettings, newSettings);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_screenshare_settings', JSON.stringify(this.screenShareSettings));
    }
  }
  
  // Voice & Screen state
  voiceState = $state<{
    activeChannelId: string | null;
    isMuted: boolean;
    isDeafened: boolean;
    isSpeaking: boolean;
    isScreenSharing: boolean;
    autoplayBlocked: boolean;
    watchingScreenId: string | null;
    localScreenStream: MediaStream | null;
    remoteScreenStreams: Record<string, RemoteScreen>;
    remoteAudioStreams: Record<string, MediaStream>;
    remoteScreenAudioStreams: Record<string, MediaStream>;
    userVolumes: Record<string, number>;
    roomParticipants: Record<string, VoiceParticipant[]>;
  }>({
    activeChannelId: null,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
    autoplayBlocked: false,
    watchingScreenId: null,
    localScreenStream: null,
    remoteScreenStreams: {},
    remoteAudioStreams: {},
    remoteScreenAudioStreams: {},
    userVolumes: {},
    roomParticipants: {},
  });

  watchScreen(screenId: string) {
    this.voiceState.watchingScreenId = screenId;
  }

  stopWatchingScreen() {
    this.voiceState.watchingScreenId = null;
  }

  isWatchingScreen(peerOrUserId?: string): boolean {
    if (!this.voiceState.watchingScreenId || !peerOrUserId) return false;
    if (this.voiceState.watchingScreenId === peerOrUserId) return true;
    const byPeer = this.voiceState.remoteScreenStreams[this.voiceState.watchingScreenId];
    if (byPeer && byPeer.userId === peerOrUserId) return true;
    const byUser = Object.values(this.voiceState.remoteScreenStreams).find(
      (s) => s.userId === peerOrUserId || s.peerId === peerOrUserId
    );
    if (byUser && byUser.peerId === this.voiceState.watchingScreenId) return true;
    return false;
  }

  // Notification settings
  notificationSettings = $state<NotificationSettings>(getSavedNotificationSettings());

  updateNotificationSettings(newSettings: Partial<NotificationSettings>) {
    Object.assign(this.notificationSettings, newSettings);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_notification_settings', JSON.stringify(this.notificationSettings));
    }
  }

  // Direct Messages (DMs) state
  activeDmUserId = $state<string | null>(null);
  dmConversations = $state<Record<string, DirectMessageConversation>>({});
  dmMessages = $state<Record<string, Message[]>>({});
  typingDmUsers = $state<Record<string, boolean>>({});
  unreadDms = $state<Record<string, number>>({});
  unreadChannels = $state<Record<string, number>>({});
  inAppNotifications = $state<InAppNotification[]>([]);

  // Total unread DMs count derived
  totalUnreadDms = $derived(
    Object.values(this.unreadDms).reduce((sum, count) => sum + count, 0)
  );

  openDm(userId: string) {
    this.currentView = 'dms';
    this.activeDmUserId = userId;
    this.unreadDms[userId] = 0;
    // If conversation doesn't exist locally, create a placeholder
    if (!this.dmConversations[userId]) {
      const user = this.users.find((u) => u.id === userId);
      if (user) {
        this.dmConversations[userId] = {
          id: `dm_${[this.currentUser.id, userId].sort().join('_')}`,
          userId,
          user,
          unreadCount: 0,
          updatedAt: new Date().toISOString(),
        };
      }
    }
  }

  openFriends() {
    this.currentView = 'dms';
    this.activeDmUserId = null;
  }

  markDmAsRead(userId: string) {
    if (this.unreadDms[userId]) {
      this.unreadDms[userId] = 0;
    }
    if (this.dmConversations[userId] && this.dmConversations[userId].unreadCount > 0) {
      this.dmConversations[userId].unreadCount = 0;
    }
    if (this.inAppNotifications.some((n) => n.userId === userId || n.senderUserId === userId)) {
      this.inAppNotifications = this.inAppNotifications.filter(
        (n) => n.userId !== userId && n.senderUserId !== userId
      );
    }
  }

  markChannelAsRead(channelId: string) {
    if (this.unreadChannels[channelId]) {
      this.unreadChannels[channelId] = 0;
    }
    if (this.inAppNotifications.some((n) => n.channelId === channelId)) {
      this.inAppNotifications = this.inAppNotifications.filter(
        (n) => n.channelId !== channelId
      );
    }
  }

  dismissNotification(id: string) {
    this.inAppNotifications = this.inAppNotifications.filter((n) => n.id !== id);
  }

  discoveredServers = $state<DiscoveredServer[]>([]);
  activeModal = $state<'discovery' | 'createChannel' | 'createServer' | 'settings' | 'hostServer' | 'micPermission' | 'serverRoles' | 'soundboard' | null>(null);
  previewImage = $state<{ url: string; filename?: string } | null>(null);
  pendingVoiceChannelId = $state<string | null>(null);

  openImagePreview(url: string, filename?: string) {
    this.previewImage = { url, filename };
  }

  closeImagePreview() {
    this.previewImage = null;
  }

  // Main view state: 'chat' | 'browser' | 'dms'
  currentView = $state<'chat' | 'browser' | 'dms'>('chat');

  // In-App Browser Tabs State
  browserTabs = $state<BrowserTab[]>([
    {
      id: 'tab-google',
      title: 'Google',
      url: 'https://www.google.com/webhp?igu=1',
      favicon: '🔍',
      history: ['https://www.google.com/webhp?igu=1'],
      historyIndex: 0,
    },
  ]);
  activeBrowserTabId = $state<string>('tab-google');

  // Local Server Hosting State
  isTauriApp = $state<boolean>(false);
  localServerRunning = $state<boolean>(false);
  isServerStarting = $state<boolean>(false);
  serverLogs = $state<string[]>([]);
  lanIps = $state<string[]>([]);

  openInBrowser(url: string, title?: string) {
    const existing = this.browserTabs.find((t) => t.url === url);
    if (existing) {
      this.activeBrowserTabId = existing.id;
    } else {
      const newId = `tab-${Date.now()}`;
      this.browserTabs.push({
        id: newId,
        title: title || 'Nova Página',
        url,
        favicon: '🌐',
        history: [url],
        historyIndex: 0,
      });
      this.activeBrowserTabId = newId;
    }
    this.currentView = 'browser';
  }

  addBrowserTab(url = 'https://www.google.com/webhp?igu=1', title = 'Nova Guia') {
    const newId = `tab-${Date.now()}`;
    this.browserTabs.push({
      id: newId,
      title,
      url,
      favicon: url.includes('google') ? '🔍' : '🌐',
      history: [url],
      historyIndex: 0,
    });
    this.activeBrowserTabId = newId;
    this.currentView = 'browser';
  }

  closeBrowserTab(tabId: string) {
    if (this.browserTabs.length <= 1) {
      // If closing the only tab, reset to Google homepage
      this.browserTabs[0] = {
        id: 'tab-google',
        title: 'Google',
        url: 'https://www.google.com/webhp?igu=1',
        favicon: '🔍',
      };
      this.activeBrowserTabId = 'tab-google';
      return;
    }

    const index = this.browserTabs.findIndex((t) => t.id === tabId);
    if (index !== -1) {
      this.browserTabs.splice(index, 1);
      if (this.activeBrowserTabId === tabId) {
        const nextTab = this.browserTabs[Math.max(0, index - 1)];
        this.activeBrowserTabId = nextTab.id;
      }
    }
  }

  selectBrowserTab(tabId: string) {
    this.activeBrowserTabId = tabId;
  }

  updateBrowserTab(tabId: string, data: Partial<BrowserTab>) {
    const tab = this.browserTabs.find((t) => t.id === tabId);
    if (tab) {
      Object.assign(tab, data);
    }
  }

  get activeBrowserTab(): BrowserTab | undefined {
    return this.browserTabs.find((t) => t.id === this.activeBrowserTabId) || this.browserTabs[0];
  }

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

  get currentRoles(): Role[] {
    return this.roles.filter((r) => r.server_id === this.currentServerId);
  }

  get currentServerMembers(): ServerMember[] {
    return this.serverMembers.filter((sm) => sm.server_id === this.currentServerId);
  }

  get currentMember(): ServerMember | undefined {
    return this.serverMembers.find(
      (sm) => sm.server_id === this.currentServerId && sm.user_id === this.currentUser.id
    );
  }

  get isCurrentUserOwner(): boolean {
    const srv = this.currentServer;
    return srv ? srv.owner_id === this.currentUser.id : false;
  }

  get isCurrentUserAdmin(): boolean {
    if (this.isCurrentUserOwner) return true;
    const mem = this.currentMember;
    if (!mem) return false;
    if (mem.role === 'owner' || mem.role === 'admin') return true;
    if (mem.is_admin === 1 || mem.is_admin === true) return true;
    if (mem.role_name && mem.role_name.toLowerCase().includes('admin')) return true;
    if (mem.role_id) {
      const role = this.roles.find((r) => r.id === mem.role_id);
      if (role && (role.is_admin === 1 || role.is_admin === true || role.name.toLowerCase().includes('admin'))) return true;
    }
    return false;
  }

  get canManageChannels(): boolean {
    return this.isCurrentUserAdmin || this.isCurrentUserOwner;
  }

  get canManageMessages(): boolean {
    if (this.isCurrentUserAdmin || this.isCurrentUserOwner) return true;
    const mem = this.currentMember;
    if (!mem) return false;
    if (mem.role === 'moderator' || mem.role === 'mod') return true;
    if (mem.role_name && mem.role_name.toLowerCase().includes('mod')) return true;
    if (mem.role_id) {
      const role = this.roles.find((r) => r.id === mem.role_id);
      if (role && role.name.toLowerCase().includes('mod')) return true;
    }
    return false;
  }

  get canKickMembers(): boolean {
    if (this.isCurrentUserAdmin || this.isCurrentUserOwner) return true;
    const mem = this.currentMember;
    if (!mem) return false;
    if (mem.role === 'moderator' || mem.role === 'mod') return true;
    return false;
  }

  get canManageRoles(): boolean {
    return this.isCurrentUserAdmin || this.isCurrentUserOwner;
  }

  get canDeleteServer(): boolean {
    return this.isCurrentUserOwner || this.isCurrentUserAdmin;
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

  setAudioSettings(settings: Partial<AudioSettings>) {
    this.audioSettings = { ...this.audioSettings, ...settings };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_audio_settings', JSON.stringify(this.audioSettings));
    }
  }

  addRemoteScreenStream(screen: RemoteScreen) {
    this.voiceState.remoteScreenStreams[screen.peerId] = screen;
  }

  removeRemoteScreenStream(peerId: string) {
    const updated = { ...this.voiceState.remoteScreenStreams };
    delete updated[peerId];
    this.voiceState.remoteScreenStreams = updated;
  }
}

export const appState = new AppState();

