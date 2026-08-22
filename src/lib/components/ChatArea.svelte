<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import { serverHostService } from '../api/serverHostService';
  import {
    Hash,
    PlusCircle,
    Smile,
    Send,
    Paperclip,
    Users,
    Image as ImageIcon,
    Server,
    Play,
    Compass,
    AlertCircle,
    WifiOff,
    Globe,
    Download,
    Film,
    Music,
    FileText,
    FileArchive,
    Trash2,
  } from '@lucide/svelte';
  import { tick } from 'svelte';

  interface Props {
    toggleMembers: () => void;
    showMembers: boolean;
  }

  let { toggleMembers, showMembers }: Props = $props();

  let messageInput = $state('');
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let isUploading = $state(false);
  let typingTimer: any = null;

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

<div class="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
  <!-- Channel Header -->
  <header class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between bg-[#313338] shrink-0">
    <div class="flex items-center space-x-2 truncate">
      <Hash class="w-6 h-6 text-[#80848e]" />
      <h2 class="text-white font-bold text-base tracking-wide truncate">
        {currentChannel?.name || 'select-a-channel'}
      </h2>
      {#if currentChannel?.topic}
        <div class="w-[1px] h-4 bg-[#4e5058] mx-2 hidden sm:block"></div>
        <p class="text-xs text-[#949ba4] truncate max-w-md hidden sm:block">
          {currentChannel.topic}
        </p>
      {/if}
    </div>

    <div class="flex items-center space-x-2">
      <!-- Quick Host Server Button in Top Header -->
      <button
        onclick={() => (appState.activeModal = 'hostServer')}
        class="bg-[#2b2d31] hover:bg-[#35373c] text-xs font-semibold px-3 py-1.5 rounded-md text-[#dbdee1] hover:text-white transition-colors flex items-center space-x-1.5 border border-[#1f2023] cursor-pointer"
        title="Host Local Server Controls"
      >
        <Server class="w-3.5 h-3.5 text-[#23a55a]" />
        <span>Host Server</span>
      </button>

      <button
        onclick={toggleMembers}
        class={`p-1.5 rounded hover:bg-[#35373c] text-[#b5bac1] hover:text-white transition-colors ${showMembers ? 'text-white bg-[#35373c]' : ''} cursor-pointer`}
        title="Toggle Member List"
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
          class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition-colors shadow"
        >
          <Play class="w-3 h-3 fill-current" />
          <span>Host Locally</span>
        </button>
        <button
          onclick={() => {
            appState.activeModal = 'discovery';
            clientService.scanLanServers();
          }}
          class="bg-[#2b2d31] hover:bg-[#35373c] text-white px-2.5 py-1 rounded font-semibold flex items-center space-x-1 transition-colors"
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
      <!-- Disconnected Welcome Dashboard -->
      <div class="h-full flex flex-col items-center justify-center text-center p-6 max-w-lg mx-auto">
        <div class="w-20 h-20 rounded-2xl bg-[#5865f2] flex items-center justify-center text-white mb-4 shadow-xl">
          <Server class="w-10 h-10" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">Welcome to Concord LAN!</h1>
        <p class="text-sm text-[#949ba4] mb-6 leading-relaxed">
          Concord operates completely on your Local Area Network with zero internet required.
          To start chatting, talk in voice channels, and share files across devices:
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-6">
          <button
            onclick={() => (appState.activeModal = 'hostServer')}
            class="bg-[#5865f2] hover:bg-[#4752c4] text-white p-4 rounded-xl font-bold text-sm flex flex-col items-center justify-center space-y-2 transition-all shadow-lg hover:shadow-[#5865f2]/25 group"
          >
            <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
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
            class="bg-[#2b2d31] hover:bg-[#35373c] text-white p-4 rounded-xl font-bold text-sm flex flex-col items-center justify-center space-y-2 transition-all border border-[#1f2023] group"
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
        <div class="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center mb-2 text-[#dbdee1]">
          <Hash class="w-10 h-10" />
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
        {@const currentUserId = message.userId || message.user?.id}
        {@const isSequence = !!prev && prevUserId === currentUserId && (new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000)}

        {@const isAuthor = currentUserId === appState.currentUser.id}
        {@const canDelete = isAuthor || appState.canManageMessages || appState.isCurrentUserAdmin || appState.isCurrentUserOwner}

        <div
          class="flex items-start space-x-3.5 hover:bg-[#2e3035]/60 -mx-4 px-4 rounded-[4px] transition-colors group relative"
          class:mt-3.5={!isSequence && i > 0}
          class:mt-0.5={!isSequence && i === 0}
          class:mt-[1px]={isSequence}
          class:py-1={!isSequence}
          class:py-[2px]={isSequence}
        >
          <!-- Floating Action Toolbar on Hover (Delete Message) -->
          {#if canDelete}
            <div class="absolute right-4 -top-3 hidden group-hover:flex items-center bg-[#313338] border border-[#232428] rounded-md shadow-md py-0.5 px-1 space-x-1 z-10">
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
            </div>
          {/if}

          {#if !isSequence}
            <!-- First message in block: Avatar + Header + Body -->
            <div class="w-10 h-10 rounded-full bg-[#1e1f22] flex items-center justify-center text-lg shrink-0 mt-0.5 select-none shadow-sm cursor-pointer hover:opacity-90">
              <span>{message.user?.avatar || '👤'}</span>
            </div>
            <div class="flex-1 overflow-hidden min-w-0">
              <div class="flex items-baseline space-x-2 leading-none mb-1">
                <span class="text-white font-semibold text-sm hover:underline cursor-pointer">
                  {message.user?.displayName || message.user?.username || 'User'}
                </span>
                <span class="text-[11px] text-[#949ba4] font-normal">
                  {formatTime(message.createdAt)}
                </span>
              </div>
              <div class="text-[#dbdee1] text-sm leading-[1.375rem] break-words whitespace-pre-wrap select-text">
                {message.content}
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
                        class="block p-0 border-0 bg-transparent cursor-pointer"
                        onclick={() => window.open(fullUrl, '_blank')}
                      >
                        <img
                          src={fullUrl}
                          alt={filename}
                          class="max-w-md max-h-80 rounded-lg shadow-md border border-[#1f2023] hover:opacity-95 transition-opacity object-contain bg-[#1e1f22]"
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
                          class="max-w-full max-h-80 rounded-lg shadow-md border border-[#1f2023] bg-black"
                        ></video>
                      </div>
                    {:else if isAudioUrl(rawUrl)}
                      <div class="max-w-md my-1.5 bg-[#2b2d31] p-2.5 rounded-lg border border-[#1f2023]">
                        <div class="text-xs text-[#dbdee1] font-semibold mb-1 flex items-center space-x-1.5 truncate">
                          <Music class="w-3.5 h-3.5 text-[#5865f2] shrink-0" />
                          <span class="truncate">{filename}</span>
                        </div>
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <audio src={fullUrl} controls preload="metadata" class="w-full h-8"></audio>
                      </div>
                    {:else}
                      <!-- Discord-style File Card with direct download -->
                      <div class="flex items-center justify-between bg-[#2b2d31] hover:bg-[#35373c] px-3.5 py-3 rounded-lg border border-[#1f2023] max-w-md my-1.5 transition-colors group/card">
                        <div class="flex items-center space-x-3 truncate min-w-0 mr-3">
                          <div class="w-10 h-10 rounded-lg bg-[#1e1f22] flex items-center justify-center text-[#5865f2] shrink-0 shadow-inner">
                            {#if filename.match(/\.(zip|rar|7z|tar|gz)$/i)}
                              <FileArchive class="w-5 h-5 text-[#f0b232]" />
                            {:else if filename.match(/\.(pdf|doc|docx|txt|md)$/i)}
                              <FileText class="w-5 h-5 text-[#23a55a]" />
                            {:else}
                              <Paperclip class="w-5 h-5 text-[#5865f2]" />
                            {/if}
                          </div>
                          <div class="truncate min-w-0">
                            <div class="text-sm font-semibold text-[#00a8fc] group-hover/card:underline truncate" title={filename}>
                              {filename}
                            </div>
                            <div class="text-[11px] text-[#949ba4]">
                              Clique para baixar
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onclick={() => downloadAttachment(rawUrl, filename)}
                          class="bg-[#1e1f22] hover:bg-[#5865f2] text-[#dbdee1] hover:text-white p-2 rounded-md transition-colors cursor-pointer shrink-0 shadow"
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
            <div class="w-10 text-[10px] text-[#949ba4] text-right shrink-0 opacity-0 group-hover:opacity-100 select-none pr-1 pt-[2px] leading-tight">
              {formatTime(message.createdAt)}
            </div>
            <div class="flex-1 overflow-hidden min-w-0">
              <div class="text-[#dbdee1] text-sm leading-[1.375rem] break-words whitespace-pre-wrap select-text">
                {message.content}
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
                        class="block p-0 border-0 bg-transparent cursor-pointer"
                        onclick={() => window.open(fullUrl, '_blank')}
                      >
                        <img
                          src={fullUrl}
                          alt={filename}
                          class="max-w-md max-h-80 rounded-lg shadow-md border border-[#1f2023] hover:opacity-95 transition-opacity object-contain bg-[#1e1f22]"
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
                          class="max-w-full max-h-80 rounded-lg shadow-md border border-[#1f2023] bg-black"
                        ></video>
                      </div>
                    {:else if isAudioUrl(rawUrl)}
                      <div class="max-w-md my-1.5 bg-[#2b2d31] p-2.5 rounded-lg border border-[#1f2023]">
                        <div class="text-xs text-[#dbdee1] font-semibold mb-1 flex items-center space-x-1.5 truncate">
                          <Music class="w-3.5 h-3.5 text-[#5865f2] shrink-0" />
                          <span class="truncate">{filename}</span>
                        </div>
                        <!-- svelte-ignore a11y_media_has_caption -->
                        <audio src={fullUrl} controls preload="metadata" class="w-full h-8"></audio>
                      </div>
                    {:else}
                      <!-- Discord-style File Card with direct download -->
                      <div class="flex items-center justify-between bg-[#2b2d31] hover:bg-[#35373c] px-3.5 py-3 rounded-lg border border-[#1f2023] max-w-md my-1.5 transition-colors group/card">
                        <div class="flex items-center space-x-3 truncate min-w-0 mr-3">
                          <div class="w-10 h-10 rounded-lg bg-[#1e1f22] flex items-center justify-center text-[#5865f2] shrink-0 shadow-inner">
                            {#if filename.match(/\.(zip|rar|7z|tar|gz)$/i)}
                              <FileArchive class="w-5 h-5 text-[#f0b232]" />
                            {:else if filename.match(/\.(pdf|doc|docx|txt|md)$/i)}
                              <FileText class="w-5 h-5 text-[#23a55a]" />
                            {:else}
                              <Paperclip class="w-5 h-5 text-[#5865f2]" />
                            {/if}
                          </div>
                          <div class="truncate min-w-0">
                            <div class="text-sm font-semibold text-[#00a8fc] group-hover/card:underline truncate" title={filename}>
                              {filename}
                            </div>
                            <div class="text-[11px] text-[#949ba4]">
                              Clique para baixar
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onclick={() => downloadAttachment(rawUrl, filename)}
                          class="bg-[#1e1f22] hover:bg-[#5865f2] text-[#dbdee1] hover:text-white p-2 rounded-md transition-colors cursor-pointer shrink-0 shadow"
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
  <div class="h-5 px-4 text-xs text-[#dbdee1] flex items-center shrink-0">
    {#if typingDisplayNames.length > 0}
      <div class="flex items-center space-x-1">
        <span class="inline-flex space-x-1">
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce [animation-delay:0.2s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#949ba4] animate-bounce [animation-delay:0.4s]"></span>
        </span>
        <span class="font-medium text-[#949ba4]">
          {typingDisplayNames.join(', ')} {typingDisplayNames.length === 1 ? 'is' : 'are'} typing...
        </span>
      </div>
    {/if}
  </div>

  <!-- Message Input Bar -->
  <div class="px-4 pb-4 shrink-0">
    <div class="bg-[#383a40] rounded-lg flex items-center px-4 py-2.5 focus-within:ring-1 focus-within:ring-[#5865f2] transition-all">
      <!-- File upload button -->
      <input
        bind:this={fileInput}
        type="file"
        class="hidden"
        onchange={handleFileUpload}
      />
      <button
        onclick={() => fileInput?.click()}
        disabled={isUploading}
        class="text-[#b5bac1] hover:text-white p-1 rounded-full hover:bg-[#4e5058]/50 transition-colors mr-2 disabled:opacity-50"
        title="Upload Image/File over LAN"
      >
        <PlusCircle class="w-5 h-5" />
      </button>

      <!-- Message input field -->
      <input
        type="text"
        bind:value={messageInput}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        placeholder={`Message #${currentChannel?.name || 'channel'}`}
        class="bg-transparent flex-1 text-white placeholder-[#80848e] text-sm focus:outline-none"
      />

      <!-- Send button -->
      <button
        onclick={handleSendMessage}
        disabled={!messageInput.trim()}
        class="text-[#b5bac1] hover:text-[#5865f2] p-1.5 rounded hover:bg-[#4e5058]/50 transition-colors ml-1 disabled:opacity-30 disabled:hover:text-[#b5bac1]"
        title="Send Message"
      >
        <Send class="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
