<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import {
    Smile,
    Paperclip,
    Send,
    Radio,
    Image,
    X,
    MessageSquare,
  } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';
  import type { Message } from '../types';

  interface Props {
    recipientId: string;
  }

  let { recipientId }: Props = $props();

  let messageInput = $state('');
  let messagesContainer: HTMLDivElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let pendingAttachments = $state<string[]>([]);
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

  function handleSend() {
    const text = messageInput.trim();
    if (!text && pendingAttachments.length === 0) return;

    clientService.sendDm(
      recipientId,
      text,
      pendingAttachments.length > 0 ? pendingAttachments : undefined
    );

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

  function handleFileUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          pendingAttachments = [...pendingAttachments, event.target.result as string];
        }
      };
      reader.readAsDataURL(file);
    });
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

<div class="flex-1 flex flex-col h-full bg-[#313338] text-white relative">
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
                {@const url = typeof att === 'string' ? att : att.url}
                <div class="max-w-xs rounded-xl overflow-hidden border border-[#232428] shadow-md">
                  <img src={url} alt="Anexo" class="max-h-60 object-contain bg-black/30" />
                </div>
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
      <div class="mb-2 p-2 bg-[#2b2d31] rounded-xl flex flex-wrap gap-2 border border-[#1f2023]">
        {#each pendingAttachments as att, idx}
          <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-[#3f4147] group">
            <img src={att} alt="Preview" class="w-full h-full object-cover" />
            <button
              onclick={() => (pendingAttachments = pendingAttachments.filter((_, i) => i !== idx))}
              class="absolute top-1 right-1 bg-black/70 hover:bg-[#f23f43] text-white p-0.5 rounded-full transition-colors cursor-pointer"
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

      <!-- Message Textarea / Input -->
      <input
        type="text"
        bind:value={messageInput}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        placeholder="Conversar com @{recipientUser.username}..."
        class="bg-transparent text-xs text-white placeholder-[#949ba4] flex-1 focus:outline-none"
      />

      <!-- Soundboard shortcut button -->
      <button
        onclick={() => (appState.activeModal = 'soundboard')}
        class="text-[#b5bac1] hover:text-[#5865f2] p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
        title="Soundboard (Efeitos Sonoros)"
      >
        <Radio class="w-4 h-4" />
      </button>

      <!-- Send Button -->
      <button
        onclick={handleSend}
        disabled={!messageInput.trim() && pendingAttachments.length === 0}
        class="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white p-1.5 rounded-lg transition-colors cursor-pointer"
        title="Enviar mensagem"
      >
        <Send class="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
