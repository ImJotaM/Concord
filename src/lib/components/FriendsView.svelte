<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import {
    Users,
    MessageSquare,
    Search,
    UserPlus,
    Check,
    Volume2,
    Shield,
    Sparkles,
  } from '@lucide/svelte';
  import Avatar from './Avatar.svelte';

  let activeTab = $state<'online' | 'all' | 'add'>('online');
  let searchQuery = $state('');
  let addFriendInput = $state('');
  let addFriendSuccess = $state(false);

  let otherUsers = $derived.by(() => {
    return appState.users.filter((u) => u.id !== appState.currentUser.id);
  });

  let onlineUsers = $derived.by(() => {
    return otherUsers.filter(
      (u) => u.status === 'online' || u.status === 'idle' || u.status === 'dnd'
    );
  });

  let displayedUsers = $derived.by(() => {
    const list = activeTab === 'online' ? onlineUsers : otherUsers;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.customStatus && u.customStatus.toLowerCase().includes(q))
    );
  });

  function handleAddFriend() {
    if (!addFriendInput.trim()) return;
    const found = otherUsers.find(
      (u) =>
        u.username.toLowerCase() === addFriendInput.trim().toLowerCase() ||
        u.displayName.toLowerCase() === addFriendInput.trim().toLowerCase()
    );
    if (found) {
      appState.openDm(found.id);
      addFriendSuccess = true;
      addFriendInput = '';
      setTimeout(() => (addFriendSuccess = false), 3000);
    }
  }
</script>

<div class="flex-1 flex flex-col h-full bg-[#313338] text-white select-none">
  <!-- Top Navigation Header -->
  <header class="h-12 border-b border-[#1f2023] px-6 flex items-center justify-between shrink-0 shadow-sm">
    <div class="flex items-center space-x-6">
      <div class="flex items-center space-x-2 font-bold text-sm text-white pr-2 border-r border-[#3f4147]">
        <Users class="w-5 h-5 text-[#949ba4]" />
        <span>Amigos</span>
      </div>

      <!-- Tab Pills -->
      <div class="flex items-center space-x-2 text-xs font-semibold">
        <button
          onclick={() => (activeTab = 'online')}
          class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {activeTab === 'online' ? 'bg-[#3f4147] text-white' : 'text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]'}"
        >
          Disponível ({onlineUsers.length})
        </button>

        <button
          onclick={() => (activeTab = 'all')}
          class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {activeTab === 'all' ? 'bg-[#3f4147] text-white' : 'text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]'}"
        >
          Todos ({otherUsers.length})
        </button>

        <button
          onclick={() => (activeTab = 'add')}
          class="px-2.5 py-1 rounded-md transition-colors cursor-pointer {activeTab === 'add' ? 'bg-[#23a55a]/20 text-[#23a55a] font-bold' : 'text-[#23a55a] hover:bg-[#23a55a]/10'}"
        >
          Adicionar Amigo
        </button>
      </div>
    </div>
  </header>

  <!-- Content Body -->
  <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
    {#if activeTab === 'add'}
      <!-- ADICIONAR AMIGO TAB -->
      <div class="max-w-xl space-y-4">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wider text-white mb-1">Adicionar Amigo na Rede Local</h2>
          <p class="text-xs text-[#949ba4]">
            Você pode iniciar conversas privadas com qualquer membro conectado ao seu Hub Concord na rede LAN.
          </p>
        </div>

        <div class="relative bg-[#1e1f22] p-3 rounded-xl border border-[#1f2023] flex items-center space-x-3 focus-within:border-[#5865f2] transition-colors">
          <input
            type="text"
            bind:value={addFriendInput}
            onkeydown={(e) => e.key === 'Enter' && handleAddFriend()}
            placeholder="Digite o nome de usuário ou identificador (@username)..."
            class="bg-transparent text-white text-xs flex-1 focus:outline-none"
          />
          <button
            onclick={handleAddFriend}
            disabled={!addFriendInput.trim()}
            class="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow"
          >
            Enviar Mensagem
          </button>
        </div>

        {#if addFriendSuccess}
          <div class="p-3 bg-[#23a55a]/15 border border-[#23a55a]/40 text-[#23a55a] rounded-xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
            <Check class="w-4 h-4" />
            <span>Conversa direta aberta com sucesso!</span>
          </div>
        {/if}
      </div>
    {:else}
      <!-- LISTA DE AMIGOS TAB -->
      <div class="max-w-4xl space-y-4">
        <!-- Search Input -->
        <div class="relative max-w-md">
          <Search class="w-4 h-4 absolute left-3 top-2.5 text-[#949ba4]" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Buscar amigo por nome ou status..."
            class="w-full bg-[#1e1f22] text-white text-xs pl-9 pr-4 py-2 rounded-xl border border-[#232428] focus:border-[#5865f2] focus:outline-none"
          />
        </div>

        <!-- Section Title -->
        <div class="text-xs font-bold uppercase tracking-wider text-[#949ba4] pt-2">
          {activeTab === 'online' ? `Disponível — ${displayedUsers.length}` : `Todos os Amigos — ${displayedUsers.length}`}
        </div>

        <!-- Friends List Items -->
        {#if displayedUsers.length === 0}
          <div class="text-center py-16 space-y-3">
            <div class="w-16 h-16 rounded-full bg-[#1e1f22] flex items-center justify-center mx-auto text-[#949ba4] shadow-inner">
              <Users class="w-8 h-8 text-[#4e5058]" />
            </div>
            <p class="text-xs text-[#949ba4]">
              {activeTab === 'online' ? 'Nenhum amigo online no momento.' : 'Nenhum membro encontrado.'}
            </p>
          </div>
        {:else}
          <div class="divide-y divide-[#35373c] border-t border-[#35373c]">
            {#each displayedUsers as user (user.id)}
              <div class="py-3 px-2 flex items-center justify-between hover:bg-[#35373c]/40 rounded-xl transition-colors group">
                <!-- User Details -->
                <div class="flex items-center space-x-3.5 min-w-0">
                  <div class="relative shrink-0">
                    <Avatar
                      name={user.displayName}
                      avatar={user.avatar}
                      userId={user.id}
                      size="md"
                    />
                    <span
                      class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#313338]"
                      class:bg-[#23a55a]={user.status === 'online'}
                      class:bg-[#f0b232]={user.status === 'idle'}
                      class:bg-[#f23f43]={user.status === 'dnd'}
                      class:bg-[#80848e]={user.status === 'offline' || !user.status}
                    ></span>
                  </div>

                  <div class="min-w-0 truncate">
                    <div class="flex items-center space-x-1.5">
                      <span class="text-sm font-bold text-white truncate">{user.displayName}</span>
                      <span class="text-xs text-[#949ba4] truncate">@{user.username}</span>
                    </div>
                    <div class="text-xs text-[#949ba4] truncate">
                      {user.customStatus || (user.status === 'online' ? 'Disponível na rede local' : 'Offline')}
                    </div>
                  </div>
                </div>

                <!-- Action Button -->
                <button
                  onclick={() => appState.openDm(user.id)}
                  class="w-9 h-9 rounded-full bg-[#2b2d31] hover:bg-[#35373c] text-[#b5bac1] hover:text-white flex items-center justify-center transition-colors cursor-pointer shadow"
                  title="Enviar Mensagem Direta"
                >
                  <MessageSquare class="w-4 h-4" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
