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

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  position?: number;
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
  audioStream?: MediaStream;
}
