<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { X, MessageSquare, Hash, Bell } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import type { InAppNotification } from '../types';

  function handleClick(notif: InAppNotification) {
    if (notif.locationType === 'dm' || notif.isDm) {
      if (notif.senderUserId || notif.userId) {
        appState.openDm(notif.senderUserId || notif.userId!);
      }
    } else if (notif.serverId && notif.channelId) {
      appState.currentServerId = notif.serverId;
      appState.currentChannelId = notif.channelId;
      appState.currentView = 'chat';
      appState.markChannelAsRead(notif.channelId);
    }
    appState.dismissNotification(notif.id);
  }
</script>

<!-- Floating Discord-style Notification Toasts Container -->
<div class="fixed top-4 right-4 z-[9999] flex flex-col space-y-2.5 max-w-sm sm:max-w-md w-full pointer-events-none select-none">
  {#each appState.inAppNotifications as notif (notif.id)}
    <div
      role="button"
      tabindex="0"
      onclick={() => handleClick(notif)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(notif);
        }
      }}
      class="pointer-events-auto bg-[#1e1f22]/95 backdrop-blur-md border border-[#2b2d31] hover:border-[#5865f2] p-3.5 rounded-2xl shadow-2xl transition-all hover:scale-[1.02] cursor-pointer flex items-start gap-3 text-left group animate-in slide-in-from-top-3 fade-in duration-200"
    >
      <!-- Sender Avatar with Clean Discord Frame -->
      <div class="relative w-10 h-10 min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] shrink-0 flex items-center justify-center">
        <Avatar
          name={notif.senderName || notif.title}
          avatar={notif.senderAvatar || notif.avatar}
          userId={notif.senderUserId || notif.userId}
          size="lg"
        />

        <!-- Location Sub-badge (DM or Channel Hash) -->
        {#if notif.locationType === 'dm' || notif.isDm}
          <div class="absolute -bottom-1 -right-1 bg-[#5865f2] text-white p-1 rounded-full ring-2 ring-[#1e1f22] shadow">
            <MessageSquare class="w-2.5 h-2.5" />
          </div>
        {:else}
          <div class="absolute -bottom-1 -right-1 bg-[#23a55a] text-white p-1 rounded-full ring-2 ring-[#1e1f22] shadow">
            <Hash class="w-2.5 h-2.5" />
          </div>
        {/if}
      </div>

      <!-- Notification Details & Location -->
      <div class="flex-1 min-w-0 pr-1">
        <!-- Top Row: Sender Name + Location Badge + Time -->
        <div class="flex items-center justify-between gap-1.5 mb-0.5">
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span class="text-xs font-bold text-white truncate drop-shadow-sm">
              {notif.senderName || 'Membro'}
            </span>

            {#if notif.locationType === 'channel' && notif.channelName}
              <span class="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold bg-[#5865f2]/20 text-[#5865f2] px-1.5 py-0.5 rounded shrink-0">
                <Hash class="w-2.5 h-2.5" />
                <span>{notif.channelName}</span>
              </span>
            {:else if notif.locationType === 'dm' || notif.isDm}
              <span class="inline-flex items-center text-[10px] font-bold bg-[#23a55a]/20 text-[#23a55a] px-1.5 py-0.5 rounded shrink-0">
                DM
              </span>
            {/if}
          </div>

          <span class="text-[10px] text-[#949ba4] shrink-0 font-medium">Agora</span>
        </div>

        <!-- Location Context (Server name if in channel) -->
        {#if notif.locationType === 'channel' && notif.serverName}
          <div class="text-[11px] text-[#949ba4] truncate leading-none mb-1">
            em <span class="text-[#dbdee1] font-semibold">{notif.serverName}</span>
          </div>
        {/if}

        <!-- Message Body -->
        <p class="text-xs text-[#dbdee1] line-clamp-2 leading-relaxed break-words">
          {notif.body}
        </p>
      </div>

      <!-- Close Button -->
      <button
        type="button"
        onclick={(e) => {
          e.stopPropagation();
          appState.dismissNotification(notif.id);
        }}
        class="text-[#949ba4] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title="Fechar notificação"
      >
        <X class="w-3.5 h-3.5" />
      </button>
    </div>
  {/each}
</div>
