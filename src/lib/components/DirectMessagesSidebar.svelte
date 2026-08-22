<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import {
    Users,
    Plus,
    X,
    MessageSquare,
    Search,
    Mic,
    MicOff,
    Headphones,
    Settings,
    VolumeX,
    UserPlus,
  } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';

  let searchQuery = $state('');
  let isStartDmModalOpen = $state(false);
  let startDmSearch = $state('');

  let dmConversationsList = $derived.by(() => {
    const list = Object.values(appState.dmConversations);
    // Sort by updatedAt descending
    list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.user?.displayName?.toLowerCase().includes(q) ||
        c.user?.username?.toLowerCase().includes(q) ||
        c.lastMessage?.content?.toLowerCase().includes(q)
    );
  });

  let otherUsersList = $derived.by(() => {
    return appState.users.filter((u) => u.id !== appState.currentUser.id);
  });

  let onlineFriendsCount = $derived(
    otherUsersList.filter((u) => u.status === 'online' || u.status === 'idle' || u.status === 'dnd').length
  );

  let filteredStartDmUsers = $derived.by(() => {
    if (!startDmSearch.trim()) return otherUsersList;
    const q = startDmSearch.toLowerCase();
    return otherUsersList.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
    );
  });

  function closeConversation(e: MouseEvent, userId: string) {
    e.stopPropagation();
    delete appState.dmConversations[userId];
    if (appState.activeDmUserId === userId) {
      appState.activeDmUserId = null;
    }
  }
</script>

<div class="w-60 bg-[#2b2d31] flex flex-col h-full border-r border-[#1f2023] shrink-0 select-none">
  <!-- Top Search / Quick Action Bar -->
  <div class="h-12 px-3 border-b border-[#1f2023] flex items-center shadow-sm">
    <button
      onclick={() => (isStartDmModalOpen = true)}
      class="w-full bg-[#1e1f22] text-[#949ba4] hover:text-white px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors shadow-inner cursor-pointer"
    >
      <span class="flex items-center space-x-2 truncate">
        <Search class="w-3.5 h-3.5" />
        <span class="truncate">Encontrar ou conversar</span>
      </span>
      <span class="text-[10px] bg-[#313338] text-[#949ba4] px-1.5 py-0.5 rounded font-mono">
        +
      </span>
    </button>
  </div>

  <!-- Main Scrollable Section -->
  <div class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 custom-scrollbar">
    <!-- Friends Tab Button -->
    <button
      onclick={() => appState.openFriends()}
      class="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer {appState.activeDmUserId === null ? 'bg-[#35373c] text-white' : 'text-[#949ba4] hover:bg-[#35373c]/50 hover:text-[#dbdee1]'}"
    >
      <div class="flex items-center space-x-3">
        <Users class="w-5 h-5" />
        <span>Amigos</span>
      </div>
      {#if onlineFriendsCount > 0}
        <span class="bg-[#5865f2] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
          {onlineFriendsCount}
        </span>
      {/if}
    </button>

    <!-- Header: MENSAGENS DIRETAS -->
    <div class="pt-4 pb-1 px-2 flex items-center justify-between text-[#949ba4] group">
      <span class="text-[11px] font-bold uppercase tracking-wider">Mensagens Diretas</span>
      <button
        onclick={() => (isStartDmModalOpen = true)}
        class="text-[#949ba4] hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-white/10"
        title="Criar Mensagem Direta"
      >
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <!-- DM Conversations List -->
    {#if dmConversationsList.length === 0}
      <div class="text-center py-6 px-3 space-y-2">
        <div class="w-10 h-10 rounded-full bg-[#1e1f22] flex items-center justify-center mx-auto text-[#949ba4]">
          <MessageSquare class="w-5 h-5" />
        </div>
        <p class="text-xs text-[#949ba4]">Nenhuma conversa direta ainda.</p>
        <button
          onclick={() => (isStartDmModalOpen = true)}
          class="text-xs font-bold text-[#5865f2] hover:underline cursor-pointer"
        >
          Iniciar uma conversa
        </button>
      </div>
    {:else}
      {#each dmConversationsList as conv (conv.userId)}
        {@const user = appState.users.find((u) => u.id === conv.userId) || conv.user}
        {@const isActive = appState.activeDmUserId === conv.userId}
        {@const unread = appState.unreadDms[conv.userId] || 0}
        {@const isTyping = appState.typingDmUsers[conv.userId]}

        <div
          role="button"
          tabindex="0"
          onclick={() => appState.openDm(conv.userId)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              appState.openDm(conv.userId);
            }
          }}
          class="w-full flex items-center space-x-3 px-2 py-2 rounded-md transition-colors group cursor-pointer relative {isActive ? 'bg-[#35373c] text-white' : 'text-[#949ba4] hover:bg-[#35373c]/50 hover:text-[#dbdee1]'}"
        >
          <!-- User Avatar with Status Indicator -->
          <div class="relative shrink-0">
            <Avatar
              name={user.displayName}
              avatar={user.avatar}
              userId={user.id}
              size="sm"
            />
            <span
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#2b2d31]"
              class:bg-[#23a55a]={user.status === 'online'}
              class:bg-[#f0b232]={user.status === 'idle'}
              class:bg-[#f23f43]={user.status === 'dnd'}
              class:bg-[#80848e]={user.status === 'offline' || !user.status}
            ></span>
          </div>

          <!-- Name & Snippet -->
          <div class="flex-1 min-w-0 text-left">
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium truncate {isActive ? 'text-white font-bold' : unread > 0 ? 'text-white font-bold' : 'text-[#dbdee1]'}">
                {user.displayName}
              </span>
            </div>
            <div class="text-[11px] text-[#949ba4] truncate">
              {#if isTyping}
                <span class="text-[#5865f2] font-semibold animate-pulse">Digitando...</span>
              {:else if conv.lastMessage}
                <span>{conv.lastMessage.content}</span>
              {:else if user.customStatus}
                <span>{user.customStatus}</span>
              {:else}
                <span>@{user.username}</span>
              {/if}
            </div>
          </div>

          <!-- Unread Badge or Close Button -->
          <div class="shrink-0 flex items-center">
            {#if unread > 0}
              <span class="bg-[#f23f43] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow">
                {unread}
              </span>
            {/if}
            <button
              type="button"
              onclick={(e) => closeConversation(e, conv.userId)}
              class="opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-white p-1 rounded transition-opacity cursor-pointer ml-1"
              title="Fechar Conversa"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom User Profile Bar (Standard Discord Footer) -->
  <div class="bg-[#232428] px-2 py-1.5 flex items-center justify-between shrink-0 border-t border-[#1f2023]">
    <div
      role="button"
      tabindex="0"
      onclick={() => (appState.activeModal = 'settings')}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') appState.activeModal = 'settings';
      }}
      class="flex items-center space-x-2 p-1 rounded-md hover:bg-[#35373c] cursor-pointer min-w-0 flex-1 transition-colors"
      title="Configurações do Usuário"
    >
      <div class="relative shrink-0">
        <Avatar
          name={appState.currentUser.displayName}
          avatar={appState.currentUser.avatar}
          userId={appState.currentUser.id}
          size="sm"
        />
        <span
          class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#232428]"
          class:bg-[#23a55a]={appState.currentUser.status === 'online'}
          class:bg-[#f0b232]={appState.currentUser.status === 'idle'}
          class:bg-[#f23f43]={appState.currentUser.status === 'dnd'}
          class:bg-[#80848e]={appState.currentUser.status === 'offline'}
        ></span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-xs font-bold text-white truncate leading-tight">
          {appState.currentUser.displayName}
        </div>
        <div class="text-[10px] text-[#949ba4] truncate leading-tight">
          {appState.currentUser.customStatus || `@${appState.currentUser.username}`}
        </div>
      </div>
    </div>

    <!-- Mic, Deafen & Settings Action Buttons -->
    <div class="flex items-center space-x-0.5 shrink-0 text-[#b5bac1]">
      <button
        onclick={() => clientService.toggleMute()}
        class="p-1.5 rounded-md hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        class:text-[#f23f43]={appState.voiceState.isMuted}
        title={appState.voiceState.isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
      >
        {#if appState.voiceState.isMuted}
          <MicOff class="w-4 h-4" />
        {:else}
          <Mic class="w-4 h-4" />
        {/if}
      </button>

      <button
        onclick={() => clientService.toggleDeafen()}
        class="p-1.5 rounded-md hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        class:text-[#f23f43]={appState.voiceState.isDeafened}
        title={appState.voiceState.isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
      >
        {#if appState.voiceState.isDeafened}
          <VolumeX class="w-4 h-4" />
        {:else}
          <Headphones class="w-4 h-4" />
        {/if}
      </button>

      <button
        onclick={() => (appState.activeModal = 'settings')}
        class="p-1.5 rounded-md hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        title="Configurações do Usuário"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </div>
</div>

<!-- Modal: Selecionar Usuário para Iniciar Conversa Direta -->
{#if isStartDmModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div class="bg-[#313338] border border-[#2b2d31] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-white flex items-center space-x-2">
          <UserPlus class="w-5 h-5 text-[#5865f2]" />
          <span>Selecionar Amigo para Conversar</span>
        </h3>
        <button
          onclick={() => (isStartDmModalOpen = false)}
          class="text-[#949ba4] hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative">
        <Search class="w-4 h-4 absolute left-3 top-3 text-[#949ba4]" />
        <input
          type="text"
          bind:value={startDmSearch}
          placeholder="Digite o nome ou @username do amigo..."
          class="w-full bg-[#1e1f22] text-white text-xs pl-9 pr-4 py-2.5 rounded-xl border border-[#232428] focus:border-[#5865f2] focus:outline-none"
        />
      </div>

      <!-- Users List -->
      <div class="max-h-60 overflow-y-auto space-y-1 custom-scrollbar pr-1">
        {#if filteredStartDmUsers.length === 0}
          <div class="text-center py-6 text-xs text-[#949ba4]">
            Nenhum amigo encontrado na rede local.
          </div>
        {:else}
          {#each filteredStartDmUsers as user (user.id)}
            <button
              onclick={() => {
                appState.openDm(user.id);
                isStartDmModalOpen = false;
              }}
              class="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#2b2d31] transition-colors cursor-pointer group text-left"
            >
              <div class="flex items-center space-x-3 min-w-0">
                <div class="relative shrink-0">
                  <Avatar
                    name={user.displayName}
                    avatar={user.avatar}
                    userId={user.id}
                    size="md"
                  />
                  <span
                    class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#313338]"
                    class:bg-[#23a55a]={user.status === 'online'}
                    class:bg-[#f0b232]={user.status === 'idle'}
                    class:bg-[#f23f43]={user.status === 'dnd'}
                    class:bg-[#80848e]={user.status === 'offline' || !user.status}
                  ></span>
                </div>
                <div class="truncate">
                  <div class="text-xs font-bold text-white truncate">{user.displayName}</div>
                  <div class="text-[10px] text-[#949ba4] truncate">@{user.username}</div>
                </div>
              </div>
              <span class="text-xs text-[#5865f2] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Conversar
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
