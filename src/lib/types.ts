export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
}

export interface Server {
  id: string;
  name: string;
  icon?: string;
  owner_id: string;
  created_at?: string;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  is_admin: boolean | number;
  position?: number;
}

export interface ServerMember {
  server_id: string;
  user_id: string;
  nickname?: string;
  role?: string;
  role_id?: string;
  role_name?: string;
  role_color?: string;
  is_admin?: boolean | number;
  joined_at?: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice' | 'web';
  topic?: string;
  position?: number;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading?: boolean;
  history?: string[];
  historyIndex?: number;
}

export interface MessageAttachment {
  url: string;
  filename: string;
  size?: number;
  mimetype?: string;
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  attachments?: (string | MessageAttachment)[];
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
}

export interface DiscoveredServer {
  name: string;
  host: string;
  port: number;
  url: string;
}

export interface VoicePeer {
  peerId: string;
  userId: string;
  displayName: string;
  avatar: string;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  audioStream?: MediaStream;
}

export interface VoiceParticipant {
  peerId?: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
}

export interface RemoteScreen {
  peerId: string;
  userId: string;
  displayName: string;
  avatar: string;
  stream: MediaStream;
}

export interface AudioSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sensitivity: number;
}

export interface ScreenShareSettings {
  resolution: '720p' | '1080p' | '1440p' | 'source';
  frameRate: 15 | 30 | 60;
  qualityMode: 'smooth' | 'detail';
  includeAudio: boolean;
}

export interface DirectMessage {
  id: string;
  channelId: string;
  senderId: string;
  recipientId: string;
  content: string;
  attachments?: (string | MessageAttachment)[];
  createdAt: string;
  sender?: User;
  recipient?: User;
}

export interface DirectMessageConversation {
  id: string;
  userId: string;
  user: User;
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
  updatedAt: string;
}

export interface InAppNotification {
  id: string;
  senderName: string;
  senderAvatar?: string;
  senderUserId?: string;
  locationType: 'channel' | 'dm';
  channelId?: string;
  channelName?: string;
  serverId?: string;
  serverName?: string;
  title: string;
  subtitle?: string;
  body: string;
  avatar?: string;
  userId?: string;
  isDm?: boolean;
  timestamp: number;
}

export interface NotificationSettings {
  enableSounds: boolean;
  enableDesktop: boolean;
  enableInAppToast: boolean;
  notifyAllMessages: boolean;
}
