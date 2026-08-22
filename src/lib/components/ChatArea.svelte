<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import { serverHostService } from '../api/serverHostService';
  import {
    Hash,
    Plus,
    Smile,
    Send,
    Users,
    Download,
    Film,
    Music,
    FileText,
    FileArchive,
    Trash2,
    Copy,
    Check,
    Server,
    Play,
    Compass,
    WifiOff,
  } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { getAvatarUrl, ICONS8_ICONS } from '../utils/icons8';

  interface Props {
    toggleMembers: () => void;
    showMembers: boolean;
  }

  let { toggleMembers, showMembers }: Props = $props();

  let messageInput = $state('');
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let isUploading = $state(false);
  let showEmojiPicker = $state(false);
  let copiedMessageId = $state<string | null>(null);
  let typingTimer: any = null;

  const emojiCategories = [
    {
      name: 'Populares',
      emojis: ['😀', '😂', '🤣', '😍', '😎', '😭', '🔥', '❤️', '👍', '🎉', '🚀', '👀', '💀', '✨', '💯', '👏', '🥳', '🤔', '🙄', '🤩'],
    },
    {
      name: 'Gestos & Expressões',
      emojis: ['👋', '👌', '✌️', '🙌', '🤝', '💪', '🙏', '🫡', '🤦‍♂️', '🤷‍♂️', '🤫', '😴', '🤯', '🤠', '😇', '😈', '👻', '🤡', '💩', '👾'],
    },
    {
      name: 'Gaming & Geek',
      emojis: ['🎮', '🕹️', '🎲', '🎯', '🏆', '🥇', '👑', '⚔️', '🛡️', '⚡', '💣', '🎧', '💻', '🤖', '🔮', '💎', '🍿', '🍕', '🍻', '☕'],
    },
  ];

  function getUserRoleInfo(userId: string) {
    const isOwner = appState.currentServer?.owner_id === userId;
    if (isOwner) {
      return { name: '👑 Dono', color: '#f0b232', isOwner: true, isAdmin: true };
    }
    const member = appState.serverMembers.find(
      (sm) => sm.server_id === appState.currentServerId && sm.user_id === userId
    );
    if (member?.role_id) {
      const customRole = appState.roles.find((r) => r.id === member.role_id);
      if (customRole) {
        return {
          name: customRole.name,
          color: customRole.color || '#5865f2',
          isAdmin: customRole.is_admin === 1 || customRole.is_admin === true,
          isOwner: false,
        };
      }
    }
    if (member?.role === 'admin') {
      return { name: '🛡️ Admin', color: '#e91e63', isAdmin: true, isOwner: false };
    }
    if (member?.role === 'moderator' || member?.role === 'mod') {
      return { name: '⚔️ Mod', color: '#2ecc71', isAdmin: false, isOwner: false };
    }
    return { name: 'Membro', color: '#dbdee1', isAdmin: false, isOwner: false };
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderFormattedMessage(rawText: string): string {
    if (!rawText) return '';
    let escaped = escapeHtml(rawText);

    // Code blocks ```code```
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre class="bg-[#1e1f22] p-3 rounded-lg border border-[#111214] font-mono text-xs text-[#e0e0e0] my-1.5 overflow-x-auto select-text">$1</pre>');

    // Inline code `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-[#1e1f22] px-1.5 py-0.5 rounded text-[13px] font-mono text-[#e0e0e0] border border-[#111214] select-text">$1</code>');

    // Bold **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

    // Italic *text*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em class="italic text-[#dbdee1]">$1</em>');

    // Strikethrough ~~text~~
    escaped = escaped.replace(/~~([^~]+)~~/g, '<del class="line-through text-[#949ba4]">$1</del>');

    // Blockquote > text
    escaped = escaped.replace(/^(&gt;|>)\s?(.*)$/gm, '<blockquote class="border-l-4 border-[#4e5058] pl-3 my-1 text-[#b5bac1] italic">$2</blockquote>');

    // Clickable links
    escaped = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[#00a8fc] hover:underline break-all">$1</a>');

    return escaped;
  }

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text);
    copiedMessageId = id;
    setTimeout(() => {
      if (copiedMessageId === id) copiedMessageId = null;
    }, 2000);
  }

  function isSameDay(d1: string, d2: string): boolean {
    if (!d1 || !d2) return false;
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  function formatDateDivider(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  }

  let currentChannel = $derived(appState.currentChannel);
  let currentMessages = $derived(appState.currentMessages);
  let isConnected = $derived(appState.connectionStatus === 'connected');
  let typingDisplayNames = $derived(appState.typingUsers[appState.currentChannelId] || []);

  async function scrollToBottom() {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  $effect(() => {
    // When messages change, auto-scroll to bottom
    if (currentMessages.length > 0) {
      scrollToBottom();
    }
  });

  function handleInput(e: Event) {
    if (!typingTimer) {
      clientService.sendTyping(appState.currentChannelId, true);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      clientService.sendTyping(appState.currentChannelId, false);
      typingTimer = null;
    }, 2000);
  }

  function handleSendMessage() {
    const text = messageInput.trim();
    if (!text || !appState.currentChannelId) return;

    clientService.sendMessage(appState.currentChannelId, text);
    messageInput = '';

    if (typingTimer) {
      clearTimeout(typingTimer);
      clientService.sendTyping(appState.currentChannelId, false);
      typingTimer = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  async function handleFileUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    isUploading = true;

    try {
      const fileUrl = await clientService.uploadFile(file);
      if (fileUrl) {
        clientService.sendMessage(appState.currentChannelId, file.type.startsWith('image/') ? 'Shared an image' : (file.type.startsWith('video/') ? 'Shared a video' : `Uploaded ${file.name}`), [
          fileUrl,
        ]);
      }
    } finally {
      isUploading = false;
      target.value = '';
    }
  }

  function formatTime(isoString: string) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function getFullAttachmentUrl(urlOrPath: string): string {
    if (!urlOrPath) return '';
    const uploadsIndex = urlOrPath.indexOf('/uploads/');
    if (uploadsIndex !== -1) {
      const relativePath = urlOrPath.substring(uploadsIndex);
      return `${appState.serverUrl}${relativePath}`;
    }
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      return urlOrPath;
    }
    return `${appState.serverUrl}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;
  }

  function getFilename(urlOrPath: string): string {
    try {
      const clean = urlOrPath.split('?')[0];
      const parts = clean.split('/');
      const last = parts[parts.length - 1];
      return decodeURIComponent(last) || 'arquivo';
    } catch {
      return 'arquivo';
    }
  }
  function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(url);
  }

  function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|mov|mkv|avi|ogv)$/i.test(url);
  }

  function isAudioUrl(url: string): boolean {
    return /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(url);
  }

  async function downloadAttachment(url: string, suggestedFilename?: string) {
    const fullUrl = getFullAttachmentUrl(url);
    const filename = suggestedFilename || getFilename(url);
    try {
      const res = await fetch(fullUrl);
      if (!res.ok) throw new Error('Download request failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (e) {
      console.warn('Fallback download opening link:', e);
      window.open(fullUrl, '_blank');
    }
  }
</script>

<div class="flex-1 bg-[#111214] flex flex-col h-full overflow-hidden">
  <!-- Channel Header -->
  <header class="h-12 border-b border-[#1a1b1e] px-4 flex items-center justify-between bg-[#111214] shrink-0">
    <div class="flex items-center space-x-2 min-w-0 mr-4">
      <Hash class="w-6 h-6 text-[#80848e] shrink-0" />
      <h2 class="text-white font-bold text-base tracking-wide shrink-0">
        {currentChannel?.name || 'select-a-channel'}
      </h2>
      {#if currentChannel?.topic}
        <div class="w-[1px] h-4 bg-[#232428] mx-2 hidden sm:block shrink-0"></div>
        <p class="text-xs text-[#949ba4] truncate hidden sm:block">
          {currentChannel.topic}
        </p>
      {/if}
    </div>

    <div class="flex items-center space-x-2">
      <button
        onclick={toggleMembers}
        class={`p-1.5 rounded-md hover:bg-[#16171a] text-[#b5bac1] hover:text-white transition-colors ${showMembers ? 'text-white bg-[#16171a]' : ''} cursor-pointer`}
        title="Ocultar / Exibir Lista de Membros"
      >
        <Users class="w-5 h-5" />
      </button>
    </div>
  </header>

  <!-- Disconnected Top Notice Banner -->
  {#if !isConnected}
    <div class="bg-[#f0b232]/10 border-b border-[#f0b232]/20 px-4 py-2 flex items-center justify-between shrink-0 text-xs">
      <div class="flex items-center space-x-2 text-[#f0b232]">
        <WifiOff class="w-4 h-4 shrink-0" />
        <span class="font-medium">
          Not connected to a LAN server ({appState.serverUrl}).
        </span>
      </div>
      <div class="flex items-center space-x-2">
        <button
          onclick={() => (appState.activeModal = 'hostServer')}
          class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition-colors shadow cursor-pointer"
        >
          <Play class="w-3 h-3 fill-current" />
          <span>Host Locally</span>
        </button>
        <button
          onclick={() => {
            appState.activeModal = 'discovery';
            clientService.scanLanServers();
          }}
          class="bg-[#16171a] hover:bg-[#1e1f22] text-white px-2.5 py-1 rounded font-semibold flex items-center space-x-1 transition-colors cursor-pointer border border-[#232428]"
        >
          <Compass class="w-3 h-3 text-[#5865f2]" />
          <span>Find LAN</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- Messages List -->
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 py-3">
    {#if !isConnected && (!currentChannel || currentMessages.length === 0)}
      <!-- Offline / No Connection Hub Guide -->
      <div class="max-w-md mx-auto my-12 p-6 bg-[#16171a] rounded-2xl border border-[#232428] text-center space-y-4 shadow-2xl">
        <div class="w-16 h-16 rounded-full bg-[#1e1f22] flex items-center justify-center mx-auto text-[#5865f2] border border-[#232428]">
          <Server class="w-8 h-8" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-white mb-1">Concord LAN Hub</h3>
          <p class="text-xs text-[#949ba4] leading-relaxed">
            Concord funciona inteiramente na sua rede local (Wi-Fi ou Ethernet) sem precisar de internet ou contas na nuvem.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onclick={() => (appState.activeModal = 'hostServer')}
            class="bg-[#5865f2] hover:bg-[#4752c4] text-white p-4 rounded-xl font-bold text-sm flex flex-col items-center justify-center space-y-2 transition-all shadow-lg hover:shadow-[#5865f2]/30 active:scale-95 group cursor-pointer"
          >
            <div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Play class="w-4 h-4 fill-current" />
            </div>
            <span>Host Server Locally</span>
            <span class="text-[11px] font-normal text-white/80">Start server on this PC</span>
          </button>

          <button
            onclick={() => {
              appState.activeModal = 'discovery';
              clientService.scanLanServers();
            }}
            class="bg-[#1e1f22] hover:bg-[#232428] text-white p-4 rounded-xl font-bold text-sm flex flex-col items-center justify-center space-y-2 transition-all border border-[#232428] group cursor-pointer"
          >
            <div class="w-8 h-8 rounded-full bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center">
              <Compass class="w-4 h-4" />
            </div>
            <span>Join Existing Server</span>
            <span class="text-[11px] font-normal text-[#949ba4]">Scan or enter host IP</span>
          </button>
        </div>
      </div>
    {:else if currentMessages.length === 0}
      <!-- Channel Welcome banner -->
      <div class="mt-8 mb-6">
        <div class="w-16 h-16 rounded-full bg-[#16171a] border border-[#232428] flex items-center justify-center mb-2 text-[#dbdee1]">
          <Hash class="w-10 h-10 text-[#80848e]" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-1">
          Welcome to #{currentChannel?.name || 'channel'}!
        </h1>
        <p class="text-sm text-[#949ba4]">
          This is the start of the #{currentChannel?.name} channel on this LAN.
        </p>
      </div>
    {:else}
      {#each currentMessages as message, i (message.id)}
        {@const prev = currentMessages[i - 1]}
        {@const prevUserId = prev ? (prev.userId || prev.user?.id) : null}
        {@const currentUserId = message.userId || message.user?.id || ''}
        {@const isSequence = !!prev && prevUserId === currentUserId && (new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000) && isSameDay(message.createdAt, prev.createdAt)}
        {@const roleInfo = getUserRoleInfo(currentUserId)}
        {@const isAuthor = currentUserId === appState.currentUser.id}
        {@const canDelete = isAuthor || appState.canManageMessages || appState.isCurrentUserAdmin || appState.isCurrentUserOwner}

        <!-- Date Divider between days -->
        {#if i === 0 || !isSameDay(message.createdAt, currentMessages[i - 1].createdAt)}
          <div class="relative my-5 flex items-center justify-center select-none">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-[#232428]"></div>
            </div>
            <span class="relative bg-[#111214] px-2.5 py-0.5 rounded-full border border-[#232428] text-[11px] font-bold text-[#949ba4] uppercase tracking-wider shadow-sm">
              {formatDateDivider(message.createdAt)}
            </span>
          </div>
        {/if}

        <div
          class="flex items-start space-x-4 hover:bg-[#16171a]/80 -mx-4 px-4 rounded transition-colors group relative font-sans"
          class:mt-4={!isSequence && i > 0 && isSameDay(message.createdAt, currentMessages[i - 1]?.createdAt)}
          class:mt-1={!isSequence && (i === 0 || !isSameDay(message.createdAt, currentMessages[i - 1]?.createdAt))}
          class:mt-[2px]={isSequence}
          class:py-0.5={!isSequence}
          class:py-[2px]={isSequence}
        >
          <!-- Floating Action Toolbar on Hover (Copy & Delete only, ZERO emoji reactions) -->
          <div class="absolute right-4 -top-3 hidden group-hover:flex items-center bg-[#16171a] border border-[#232428] rounded-md shadow-lg py-0.5 px-1 space-x-1 z-20">
            <!-- Copy message button -->
            <button
              type="button"
              onclick={() => copyMessage(message.id, message.content)}
              class="p-1 hover:bg-[#232428] text-[#949ba4] hover:text-white rounded transition-colors cursor-pointer"
              title="Copiar texto da mensagem"
            >
              {#if copiedMessageId === message.id}
                <Check class="w-3.5 h-3.5 text-[#23a55a]" />
              {:else}
                <Copy class="w-3.5 h-3.5" />
              {/if}
            </button>

            <!-- Delete message button -->
            {#if canDelete}
              <button
                type="button"
                onclick={() => {
                  if (confirm('Tem certeza que deseja apagar esta mensagem?')) {
                    clientService.deleteMessage(message.id, message.channelId);
                  }
                }}
                class="p-1 hover:bg-[#da373c] text-[#949ba4] hover:text-white rounded transition-colors cursor-pointer"
                title={isAuthor ? 'Apagar minha mensagem' : 'Apagar mensagem (Moderação)'}
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            {/if}
          </div>

          {#if !isSequence}
            <!-- First message in block: Avatar + Header + Body -->
            <div class="w-10 h-10 rounded-full bg-[#16171a] flex items-center justify-center p-1.5 shrink-0 mt-0.5 select-none shadow cursor-pointer hover:opacity-90 transition-opacity border border-[#232428]/40 overflow-hidden">
              <img src={getAvatarUrl(message.user?.avatar)} alt="Avatar" class="w-full h-full object-contain" loading="lazy" />
            </div>
            <div class="flex-1 overflow-hidden min-w-0">
              <div class="flex items-baseline space-x-2 leading-none mb-1">
                <span
                  class="font-semibold text-[15px] hover:underline cursor-pointer flex items-center space-x-1.5"
                  style="color: {roleInfo.color || '#ffffff'}"
                >
                  <span>{message.user?.displayName || message.user?.username || 'User'}</span>
                  {#if message.user?.id === 'user-system'}
                    <span class="bg-[#5865f2] text-white text-[9px] font-bold px-1 py-0.2 rounded uppercase tracking-wider flex items-center gap-1">
                      <img src={ICONS8_ICONS.robot.url} class="w-3 h-3 object-contain" alt="Bot" />
                      BOT
                    </span>
                  {:else if roleInfo.isOwner}
                    <img src={ICONS8_ICONS.crown.url} class="w-3.5 h-3.5 object-contain" alt="Crown" title="Dono do Servidor" />
                  {:else if roleInfo.isAdmin}
                    <img src={ICONS8_ICONS.shield.url} class="w-3.5 h-3.5 object-contain" alt="Shield" title="Administrador" />
                  {/if}
                </span>
                <span class="text-[11px] text-[#949ba4] font-normal select-none">
                  {formatTime(message.createdAt)}
                </span>
              </div>
              <div class="text-[#dbdee1] text-[15px] leading-[1.375rem] break-words whitespace-pre-wrap select-text font-normal">
                {@html renderFormattedMessage(message.content)}
              </div>

              <!-- Attachments -->
              {#if message.attachments && message.attachments.length > 0}
                <div class="mt-2 space-y-2">
                  {#each message.attachments as att}
                    {@const rawUrl = typeof att === 'string' ? att : att.url}
                    {@const fullUrl = getFullAttachmentUrl(rawUrl)}
                    {@const filename = typeof att === 'object' && att.filename ? att.filename : getFilename(rawUrl)}

                    {#if isImageUrl(rawUrl)}
                      <button
                        type="button"
                        class="block p-0 border-0 bg-transparent cursor-pointer text-left"
                        onclick={() => window.open(fullUrl, '_blank')}
                      >
                        <img
                          src={fullUrl}
                          alt={filename}
                          class="max-w-md max-h-80 rounded-xl shadow-md border border-[#232428] hover:opacity-95 transition-opacity object-contain bg-[#0e0f10]"
                          loading="lazy"
                        />
                      </button>
                    {:else if isVideoUrl(rawUrl)}
                      <div class="max-w-md my-1.5">
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <video
                          src={fullUrl}
                          controls
                          playsinline
                          preload="metadata"
                          class="max-w-full max-h-80 rounded-xl shadow-md border border-[#232428] bg-black"
                        ></video>
                      </div>
                    {:else if isAudioUrl(rawUrl)}
                      <div class="max-w-md my-1.5 bg-[#16171a] p-2.5 rounded-xl border border-[#232428]">
                        <div class="text-xs text-[#dbdee1] font-semibold mb-1 flex items-center space-x-1.5 truncate">
                          <Music class="w-3.5 h-3.5 text-[#5865f2] shrink-0" />
                          <span class="truncate">{filename}</span>
                        </div>
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <audio src={fullUrl} controls preload="metadata" class="w-full h-8"></audio>
                      </div>
                    {:else}
                      <!-- Discord-style File Card with direct download -->
                      <div class="flex items-center justify-between bg-[#16171a] hover:bg-[#1e1f22] px-3.5 py-3 rounded-xl border border-[#232428] max-w-md my-1.5 transition-colors group/card">
                        <div class="flex items-center space-x-3 truncate min-w-0 mr-3">
                          <div class="w-10 h-10 rounded-lg bg-[#0e0f10] flex items-center justify-center text-[#5865f2] shrink-0 shadow-inner border border-[#232428]">
                            {#if filename.match(/\.(zip|rar|7z|tar|gz)$/i)}
                              <FileArchive class="w-5 h-5 text-[#f0b232]" />
                            {:else if filename.match(/\.(pdf|doc|docx|txt|md)$/i)}
                              <FileText class="w-5 h-5 text-[#23a55a]" />
                            {:else}
                              <FileText class="w-5 h-5 text-[#5865f2]" />
                            {/if}
                          </div>
                          <div class="truncate min-w-0">
                            <div class="text-sm font-semibold text-[#00a8fc] group-hover/card:underline truncate" title={filename}>
                              {filename}
                            </div>
                            <div class="text-[11px] text-[#949ba4]">
                              Clique para baixar via LAN
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onclick={() => downloadAttachment(rawUrl, filename)}
                          class="bg-[#0e0f10] hover:bg-[#5865f2] text-[#dbdee1] hover:text-white p-2 rounded-lg transition-colors cursor-pointer shrink-0 shadow border border-[#232428]"
                          title="Baixar Arquivo"
                        >
                          <Download class="w-4 h-4" />
                        </button>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <!-- Continuation message: Hidden timestamp in gutter + direct aligned text -->
            <div class="w-10 text-[10px] text-[#949ba4] text-right shrink-0 opacity-0 group-hover:opacity-100 select-none pr-1 pt-[2px] leading-tight font-mono">
              {formatTime(message.createdAt)}
            </div>
            <div class="flex-1 overflow-hidden min-w-0">
              <div class="text-[#dbdee1] text-[15px] leading-[1.375rem] break-words whitespace-pre-wrap select-text font-normal">
                {@html renderFormattedMessage(message.content)}
              </div>

              <!-- Attachments in continuation -->
              {#if message.attachments && message.attachments.length > 0}
                <div class="mt-2 space-y-2">
                  {#each message.attachments as att}
                    {@const rawUrl = typeof att === 'string' ? att : att.url}
                    {@const fullUrl = getFullAttachmentUrl(rawUrl)}
                    {@const filename = typeof att === 'object' && att.filename ? att.filename : getFilename(rawUrl)}

                    {#if isImageUrl(rawUrl)}
                      <button
                        type="button"
                        class="block p-0 border-0 bg-transparent cursor-pointer text-left"
                        onclick={() => window.open(fullUrl, '_blank')}
                      >
                        <img
                          src={fullUrl}
                          alt={filename}
                          class="max-w-md max-h-80 rounded-xl shadow-md border border-[#232428] hover:opacity-95 transition-opacity object-contain bg-[#0e0f10]"
                          loading="lazy"
                        />
                      </button>
                    {:else if isVideoUrl(rawUrl)}
                      <div class="max-w-md my-1.5">
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <video
                          src={fullUrl}
                          controls
                          playsinline
                          preload="metadata"
                          class="max-w-full max-h-80 rounded-xl shadow-md border border-[#232428] bg-black"
                        ></video>
                      </div>
                    {:else if isAudioUrl(rawUrl)}
                      <div class="max-w-md my-1.5 bg-[#16171a] p-2.5 rounded-xl border border-[#232428]">
                        <div class="text-xs text-[#dbdee1] font-semibold mb-1 flex items-center space-x-1.5 truncate">
                          <Music class="w-3.5 h-3.5 text-[#5865f2] shrink-0" />
                          <span class="truncate">{filename}</span>
                        </div>
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <audio src={fullUrl} controls preload="metadata" class="w-full h-8"></audio>
                      </div>
                    {:else}
                      <!-- Discord-style File Card with direct download -->
                      <div class="flex items-center justify-between bg-[#16171a] hover:bg-[#1e1f22] px-3.5 py-3 rounded-xl border border-[#232428] max-w-md my-1.5 transition-colors group/card">
                        <div class="flex items-center space-x-3 truncate min-w-0 mr-3">
                          <div class="w-10 h-10 rounded-lg bg-[#0e0f10] flex items-center justify-center text-[#5865f2] shrink-0 shadow-inner border border-[#232428]">
                            {#if filename.match(/\.(zip|rar|7z|tar|gz)$/i)}
                              <FileArchive class="w-5 h-5 text-[#f0b232]" />
                            {:else if filename.match(/\.(pdf|doc|docx|txt|md)$/i)}
                              <FileText class="w-5 h-5 text-[#23a55a]" />
                            {:else}
                              <FileText class="w-5 h-5 text-[#5865f2]" />
                            {/if}
                          </div>
                          <div class="truncate min-w-0">
                            <div class="text-sm font-semibold text-[#00a8fc] group-hover/card:underline truncate" title={filename}>
                              {filename}
                            </div>
                            <div class="text-[11px] text-[#949ba4]">
                              Clique para baixar via LAN
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onclick={() => downloadAttachment(rawUrl, filename)}
                          class="bg-[#0e0f10] hover:bg-[#5865f2] text-[#dbdee1] hover:text-white p-2 rounded-lg transition-colors cursor-pointer shrink-0 shadow border border-[#232428]"
                          title="Baixar Arquivo"
                        >
                          <Download class="w-4 h-4" />
                        </button>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Typing Indicator -->
  <div class="h-6 px-4 text-xs text-[#dbdee1] flex items-center shrink-0">
    {#if typingDisplayNames.length > 0}
      <div class="flex items-center space-x-1.5">
        <span class="inline-flex space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce [animation-delay:0.2s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce [animation-delay:0.4s]"></span>
        </span>
        <span class="font-medium text-[#949ba4]">
          <strong class="text-white font-bold">{typingDisplayNames.join(', ')}</strong> {typingDisplayNames.length === 1 ? 'está digitando...' : 'estão digitando...'}
        </span>
      </div>
    {/if}
  </div>

  <!-- Message Input Bar -->
  <div class="px-4 pb-4 shrink-0 relative">
    <!-- Emoji Picker Popover -->
    {#if showEmojiPicker}
      <!-- Backdrop to close -->
      <div
        role="button"
        tabindex="0"
        class="fixed inset-0 z-30"
        onclick={() => (showEmojiPicker = false)}
        onkeydown={(e) => { if (e.key === 'Escape') showEmojiPicker = false; }}
      ></div>

      <div class="absolute bottom-16 right-6 bg-[#16171a] border border-[#232428] rounded-2xl shadow-2xl p-3 z-40 space-y-3 animate-in fade-in zoom-in-95 duration-100 w-80 max-h-80 overflow-y-auto">
        {#each emojiCategories as cat}
          <div>
            <div class="text-[10px] font-extrabold uppercase text-[#949ba4] tracking-wider px-1 mb-1">
              {cat.name}
            </div>
            <div class="grid grid-cols-5 gap-1">
              {#each cat.emojis as emoji}
                <button
                  type="button"
                  onclick={() => {
                    messageInput += emoji;
                    showEmojiPicker = false;
                  }}
                  class="w-10 h-10 rounded-lg hover:bg-[#232428] flex items-center justify-center text-xl transition-transform hover:scale-125 cursor-pointer"
                >
                  {emoji}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="bg-[#18191c] border border-[#232428] rounded-xl flex items-center px-4 py-2.5 focus-within:ring-1 focus-within:ring-[#5865f2] focus-within:border-[#5865f2] transition-all shadow-inner">
      <!-- File upload button -->
      <input
        bind:this={fileInput}
        type="file"
        class="hidden"
        onchange={handleFileUpload}
      />
      <button
        type="button"
        onclick={() => fileInput?.click()}
        disabled={isUploading}
        class="w-6 h-6 rounded-full bg-[#2b2d31] hover:bg-[#dbdee1] text-[#949ba4] hover:text-[#111214] flex items-center justify-center transition-all mr-3 disabled:opacity-50 cursor-pointer shrink-0"
        title="Enviar Foto / Vídeo / Arquivo pela LAN"
      >
        <Plus class="w-4 h-4 font-bold" />
      </button>

      <!-- Message input field -->
      <input
        type="text"
        bind:value={messageInput}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        placeholder={`Conversar em #${currentChannel?.name || 'geral'}`}
        class="bg-transparent flex-1 text-white placeholder-[#80848e] text-sm focus:outline-none"
      />

      <!-- Emoji Picker Toggle Button -->
      <button
        type="button"
        onclick={() => (showEmojiPicker = !showEmojiPicker)}
        class="text-[#b5bac1] hover:text-[#f0b232] p-1.5 rounded-lg hover:bg-[#2b2d31] transition-colors ml-1 cursor-pointer"
        title="Inserir Emoji"
      >
        <Smile class="w-5 h-5" />
      </button>

      <!-- Send button -->
      <button
        type="button"
        onclick={handleSendMessage}
        disabled={!messageInput.trim()}
        class="text-[#b5bac1] hover:text-[#5865f2] p-1.5 rounded-lg hover:bg-[#2b2d31] transition-colors ml-1 disabled:opacity-30 disabled:hover:text-[#b5bac1] cursor-pointer"
        title="Enviar Mensagem (Enter)"
      >
        <Send class="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
