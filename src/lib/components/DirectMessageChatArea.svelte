<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import {
    Smile,
    Paperclip,
    Send,
    Radio,
    Image as ImageIcon,
    X,
    MessageSquare,
    Loader2,
    Upload,
    Check,
  } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import type { Message } from '../types';
  import {
    getFullAttachmentUrl,
    getFilename,
    isImageUrl,
    formatFileSize,
    extractFilesFromClipboard,
    generatePastedFileName,
    type PendingAttachment,
  } from '../utils/attachment';

  interface Props {
    recipientId: string;
  }

  let { recipientId }: Props = $props();

  let messageInput = $state('');
  let messagesContainer: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let pendingAttachments = $state<PendingAttachment[]>([]);
  let isDraggingOver = $state(false);
  let isTyping = $state(false);
  let typingTimeout: any = null;

  let recipientUser = $derived(
    appState.users.find((u) => u.id === recipientId) || {
      id: recipientId,
      username: 'usuario',
      displayName: 'Amigo',
      avatar: '',
      status: 'offline' as const,
    }
  );

  let messages = $derived<Message[]>(appState.dmMessages[recipientId] || []);
  let isPeerTyping = $derived(!!appState.typingDmUsers[recipientId]);

  $effect(() => {
    if (recipientId) {
      clientService.fetchDmHistory(recipientId);
      appState.markDmAsRead(recipientId);
    }
  });

  $effect(() => {
    if (messages.length > 0 && messagesContainer) {
      setTimeout(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 50);
    }
  });

  function processFiles(files: File[]) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif)$/i.test(file.name);
      const filename = isImg ? generatePastedFileName(file.name, file.type) : file.name;
      const fileObj = new File([file], filename, { type: file.type || 'application/octet-stream' });
      const previewUrl = isImg ? URL.createObjectURL(fileObj) : '';
      const attachmentId = Math.random().toString(36).substring(2, 9);

      const pendingItem: PendingAttachment = {
        id: attachmentId,
        file: fileObj,
        previewUrl,
        name: filename,
        size: fileObj.size,
        isImage: isImg,
        isUploading: true,
        uploadFailed: false,
      };

      pendingAttachments = [...pendingAttachments, pendingItem];

      // Initiate background upload immediately
      clientService
        .uploadFile(fileObj)
        .then((url) => {
          pendingAttachments = pendingAttachments.map((att) =>
            att.id === attachmentId
              ? { ...att, uploadedUrl: url, isUploading: false, uploadFailed: !url }
              : att
          );
        })
        .catch((err) => {
          console.error('Upload failed for DM attachment:', err);
          pendingAttachments = pendingAttachments.map((att) =>
            att.id === attachmentId
              ? { ...att, isUploading: false, uploadFailed: true }
              : att
          );
        });
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const files = extractFilesFromClipboard(e);
    if (files.length > 0) {
      e.preventDefault();
      processFiles(files);
    }
  }

  function removeAttachment(id: string) {
    const target = pendingAttachments.find((a) => a.id === id);
    if (target && target.previewUrl && target.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      isDraggingOver = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }

  function handleFileUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
    (e.target as HTMLInputElement).value = '';
  }

  async function handleSend() {
    const text = messageInput.trim();
    if (!text && pendingAttachments.length === 0) return;

    if (pendingAttachments.some((a) => a.isUploading)) {
      return;
    }

    const uploadedUrls: string[] = [];
    for (const att of pendingAttachments) {
      if (att.uploadedUrl) {
        uploadedUrls.push(att.uploadedUrl);
      } else if (!att.uploadFailed) {
        const url = await clientService.uploadFile(att.file);
        if (url) uploadedUrls.push(url);
      }
    }

    if (!text && uploadedUrls.length === 0) return;

    clientService.sendDm(
      recipientId,
      text,
      uploadedUrls.length > 0 ? uploadedUrls : undefined
    );

    // Clean up preview object URLs
    pendingAttachments.forEach((att) => {
      if (att.previewUrl && att.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(att.previewUrl);
      }
    });

    messageInput = '';
    pendingAttachments = [];

    if (isTyping) {
      isTyping = false;
      clientService.sendTypingDm(recipientId, false);
      clearTimeout(typingTimeout);
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    messageInput = target.value;

    if (!isTyping) {
      isTyping = true;
      clientService.sendTypingDm(recipientId, true);
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      isTyping = false;
      clientService.sendTypingDm(recipientId, false);
    }, 2000);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex-1 flex flex-col h-full bg-[#313338] text-white relative"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <!-- Drag and drop overlay -->
  {#if isDraggingOver}
    <div class="absolute inset-0 bg-[#5865f2]/20 backdrop-blur-xs border-2 border-dashed border-[#5865f2] z-50 flex flex-col items-center justify-center pointer-events-none rounded-xl m-2">
      <div class="p-6 bg-[#111214]/95 rounded-2xl border border-[#5865f2] flex flex-col items-center space-y-3 shadow-2xl animate-bounce">
        <Upload class="w-10 h-10 text-[#5865f2]" />
        <span class="text-sm font-bold text-white">Solte os arquivos ou imagens para enviar</span>
      </div>
    </div>
  {/if}

  <!-- Top DM Header -->
  <header class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between shrink-0 shadow-sm z-10">
    <div class="flex items-center space-x-3 min-w-0">
      <div class="relative shrink-0">
        <Avatar
          name={recipientUser.displayName}
          avatar={recipientUser.avatar}
          userId={recipientUser.id}
          size="sm"
        />
        <span
          class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#313338]"
          class:bg-[#23a55a]={recipientUser.status === 'online'}
          class:bg-[#f0b232]={recipientUser.status === 'idle'}
          class:bg-[#f23f43]={recipientUser.status === 'dnd'}
          class:bg-[#80848e]={recipientUser.status === 'offline' || !recipientUser.status}
        ></span>
      </div>

      <div class="min-w-0 truncate">
        <div class="flex items-center space-x-1.5 truncate">
          <span class="text-sm font-bold text-white truncate">{recipientUser.displayName}</span>
          <span class="text-xs text-[#949ba4] truncate">@{recipientUser.username}</span>
        </div>
      </div>
    </div>
  </header>

  <!-- Messages Scroll Area -->
  <div
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
  >
    <!-- Hero Conversation Header at top -->
    <div class="py-8 space-y-3 border-b border-[#35373c]/60">
      <Avatar
        name={recipientUser.displayName}
        avatar={recipientUser.avatar}
        userId={recipientUser.id}
        size="2xl"
      />
      <div>
        <h2 class="text-2xl font-extrabold text-white">{recipientUser.displayName}</h2>
        <div class="text-sm text-[#949ba4] font-medium">@{recipientUser.username}</div>
      </div>
      <p class="text-xs text-[#b5bac1] leading-relaxed max-w-md">
        Este é o início do seu histórico de mensagens diretas privadas com <strong class="text-white">{recipientUser.displayName}</strong>.
      </p>
    </div>

    <!-- Message List -->
    {#each messages as msg, i (msg.id || i)}
      {@const isLocal = msg.userId === appState.currentUser.id || msg.senderId === appState.currentUser.id}
      {@const author = isLocal ? appState.currentUser : recipientUser}

      <div class="flex items-start space-x-3.5 hover:bg-[#2e3035]/50 -mx-4 px-4 py-1.5 rounded-lg transition-colors group">
        <Avatar
          name={author.displayName}
          avatar={author.avatar}
          userId={author.id}
          size="md"
        />

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline space-x-2">
            <span class="text-xs font-bold text-white truncate hover:underline cursor-pointer">
              {author.displayName}
            </span>
            <span class="text-[10px] text-[#949ba4]">
              {formatTime(msg.createdAt)}
            </span>
          </div>

          {#if msg.content}
            <div class="text-xs text-[#dbdee1] leading-relaxed break-words whitespace-pre-wrap select-text mt-0.5">
              {msg.content}
            </div>
          {/if}

          <!-- Attachments Preview -->
          {#if msg.attachments && msg.attachments.length > 0}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each msg.attachments as att}
                {@const rawUrl = typeof att === 'string' ? att : att.url}
                {@const fullUrl = getFullAttachmentUrl(rawUrl)}
                <button
                  type="button"
                  class="block p-0 border-0 bg-transparent cursor-pointer text-left max-w-xs rounded-xl overflow-hidden border border-[#232428] hover:border-[#5865f2]/50 shadow-md hover:opacity-95 transition-all"
                  onclick={() => appState.openImagePreview(fullUrl, getFilename(rawUrl))}
                  title="Clique para ver imagem ampliada"
                >
                  <img src={fullUrl} alt="Anexo" class="max-h-60 object-contain bg-black/30" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Typing Indicator -->
    {#if isPeerTyping}
      <div class="flex items-center space-x-2 text-xs text-[#5865f2] animate-pulse py-1">
        <span class="font-bold">{recipientUser.displayName}</span>
        <span>está digitando...</span>
      </div>
    {/if}
  </div>

  <!-- Message Composer (Bottom Bar) -->
  <div class="p-4 pt-1">
    <!-- Attachments Queue Preview -->
    {#if pendingAttachments.length > 0}
      <div class="mb-2 p-2.5 bg-[#2b2d31] rounded-2xl flex flex-wrap gap-2.5 border border-[#1f2023] max-h-48 overflow-y-auto custom-scrollbar shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
        {#each pendingAttachments as att (att.id)}
          <div class="relative flex items-center space-x-2.5 bg-[#1e1f22] border border-[#383a40] p-2 pr-3 rounded-xl max-w-xs transition-all shadow-md group">
            <!-- Thumbnail / File Icon -->
            <div class="relative w-12 h-12 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center shrink-0 border border-[#2b2d31]">
              {#if att.isImage && att.previewUrl}
                <button
                  type="button"
                  onclick={() => appState.openImagePreview(att.previewUrl, att.name)}
                  class="w-full h-full p-0 border-0 bg-transparent cursor-pointer"
                  title="Clique para ver imagem ampliada"
                >
                  <img src={att.previewUrl} alt={att.name} class="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                </button>
              {:else}
                <ImageIcon class="w-6 h-6 text-[#5865f2]" />
              {/if}

              <!-- Uploading Spinner Overlay -->
              {#if att.isUploading}
                <div class="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                  <Loader2 class="w-5 h-5 text-[#5865f2] animate-spin" />
                </div>
              {/if}
            </div>

            <!-- File Info -->
            <div class="flex-1 min-w-0 pr-3">
              <div class="text-xs font-bold text-white truncate" title={att.name}>
                {att.name}
              </div>
              <div class="text-[10px] text-[#949ba4] mt-0.5 flex items-center space-x-1.5">
                <span>{formatFileSize(att.size)}</span>
                {#if att.isUploading}
                  <span class="text-[#5865f2] font-semibold flex items-center">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#5865f2] animate-ping mr-1"></span>
                    Enviando...
                  </span>
                {:else if att.uploadFailed}
                  <span class="text-[#f23f43] font-semibold">• Erro</span>
                {:else}
                  <span class="text-[#23a55a] font-semibold flex items-center">
                    <Check class="w-3 h-3 mr-0.5 inline" /> Pronto
                  </span>
                {/if}
              </div>
            </div>

            <!-- Remove Button -->
            <button
              type="button"
              onclick={() => removeAttachment(att.id)}
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1e1f22] border border-[#3f4147] hover:bg-[#f23f43] hover:border-[#f23f43] text-[#dbdee1] hover:text-white flex items-center justify-center transition-all shadow-lg cursor-pointer group-hover:scale-105"
              title="Remover anexo"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="bg-[#383a40] rounded-xl p-2.5 flex items-center space-x-2.5 shadow-inner focus-within:ring-1 focus-within:ring-[#5865f2]">
      <!-- File Attachment Upload Button -->
      <button
        type="button"
        onclick={() => fileInput?.click()}
        class="text-[#b5bac1] hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
        title="Anexar arquivo / imagem"
      >
        <Paperclip class="w-4 h-4" />
      </button>
      <input
        type="file"
        bind:this={fileInput}
        onchange={handleFileUpload}
        accept="image/*"
        multiple
        class="hidden"
      />

      <!-- Message Textarea / Input with clipboard paste support -->
      <input
        type="text"
        bind:value={messageInput}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        onpaste={handlePaste}
        placeholder="Conversar com @{recipientUser.username}..."
        class="bg-transparent text-xs text-white placeholder-[#949ba4] flex-1 focus:outline-none"
      />

      <!-- Soundboard shortcut button -->
      <button
        type="button"
        onclick={() => (appState.activeModal = 'soundboard')}
        class="text-[#b5bac1] hover:text-[#5865f2] p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
        title="Soundboard (Efeitos Sonoros)"
      >
        <Radio class="w-4 h-4" />
      </button>

      <!-- Send Button -->
      <button
        type="button"
        onclick={handleSend}
        disabled={(!messageInput.trim() && pendingAttachments.length === 0) || pendingAttachments.some(a => a.isUploading)}
        class="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
        title="Enviar mensagem (Enter)"
      >
        {#if pendingAttachments.some(a => a.isUploading)}
          <Loader2 class="w-4 h-4 animate-spin text-white" />
        {:else}
          <Send class="w-4 h-4" />
        {/if}
      </button>
    </div>
  </div>
</div>
