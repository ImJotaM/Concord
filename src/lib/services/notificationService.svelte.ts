import { appState } from '../stores/appState.svelte';
import { soundService } from './soundService.svelte';
import type { InAppNotification } from '../types';

class NotificationService {
  private hasRequestedPermission = false;

  async requestDesktopPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  notify(params: {
    senderName: string;
    senderAvatar?: string;
    senderUserId?: string;
    locationType?: 'channel' | 'dm';
    channelId?: string;
    channelName?: string;
    serverId?: string;
    serverName?: string;
    title?: string;
    subtitle?: string;
    body: string;
    avatar?: string;
    userId?: string;
    isDm?: boolean;
    playAudio?: boolean;
  }) {
    const settings = appState.notificationSettings;

    // 1. Play Sound Chime (Discord notification)
    if (settings.enableSounds && (params.playAudio ?? true)) {
      soundService.play('message-received');
    }

    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const locationType = params.locationType || (params.isDm ? 'dm' : 'channel');
    const title = params.title || (locationType === 'dm' ? `Mensagem Direta` : `#${params.channelName || 'canal'}`);
    const subtitle = params.subtitle || (locationType === 'dm' ? params.senderName : `${params.senderName} em ${params.serverName || 'Servidor'}`);

    // 2. Trigger In-App Visual Toast
    if (settings.enableInAppToast) {
      const newNotif: InAppNotification = {
        id: notifId,
        senderName: params.senderName,
        senderAvatar: params.senderAvatar || params.avatar,
        senderUserId: params.senderUserId || params.userId,
        locationType,
        channelId: params.channelId,
        channelName: params.channelName,
        serverId: params.serverId,
        serverName: params.serverName,
        title,
        subtitle,
        body: params.body,
        avatar: params.senderAvatar || params.avatar,
        userId: params.senderUserId || params.userId,
        isDm: locationType === 'dm',
        timestamp: Date.now(),
      };

      appState.inAppNotifications = [newNotif, ...appState.inAppNotifications.slice(0, 3)];

      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        appState.inAppNotifications = appState.inAppNotifications.filter((n) => n.id !== notifId);
      }, 6000);
    }

    // 3. Trigger Desktop Notification if window is blurred or backgrounded
    if (settings.enableDesktop && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
        try {
          const desktopTitle = locationType === 'dm' ? `${params.senderName} (Mensagem Direta)` : `${params.senderName} (#${params.channelName || 'chat'})`;
          const desktopNotif = new Notification(desktopTitle, {
            body: params.body,
            icon: '/favicon.png',
            tag: locationType === 'dm' ? `dm-${params.senderUserId || params.userId}` : `chan-${params.channelId}`,
          });

          desktopNotif.onclick = () => {
            window.focus();
            if (locationType === 'dm' && (params.senderUserId || params.userId)) {
              appState.openDm(params.senderUserId || params.userId!);
            } else if (params.serverId && params.channelId) {
              appState.currentServerId = params.serverId;
              appState.currentChannelId = params.channelId;
              appState.currentView = 'chat';
              appState.markChannelAsRead(params.channelId);
            }
            desktopNotif.close();
          };
        } catch (e) {
          console.warn('Failed to show desktop notification:', e);
        }
      }
    }
  }
}

export const notificationService = new NotificationService();
