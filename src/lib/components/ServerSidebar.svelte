<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import { Compass, Plus, Wifi, Radio, Server, Globe, MessageSquare } from '@lucide/svelte';
  import { getServerAcronym, isCustomImage } from '../utils/avatar';
  import { soundService } from '../services/soundService.svelte';

  function getServerUnreadCount(serverId: string): number {
    const channels = appState.channels.filter((c) => c.server_id === serverId);
    return channels.reduce((sum, c) => sum + (appState.unreadChannels[c.id] || 0), 0);
  }
</script>

<nav class="w-[72px] bg-[#0e0f10] flex flex-col items-center py-3 space-y-2 select-none z-20 shrink-0 border-r border-[#1a1b1e]">
  <!-- Concord LAN Home / Direct Messages -->
  <div class="relative group flex items-center justify-center w-full">
    <!-- Active Pill indicator -->
    <div
      class="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
      class:h-10={appState.currentView === 'dms'}
      class:h-5={appState.currentView !== 'dms'}
      class:opacity-0={appState.currentView !== 'dms'}
      class:group-hover:opacity-100={appState.currentView !== 'dms'}
    ></div>

    <button
      onclick={() => {
        soundService.play('button-click');
        appState.currentView = 'dms';
      }}
      class="relative w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#16171a] group-hover:bg-[#5865f2] flex items-center justify-center text-white transition-all duration-200 shadow-md cursor-pointer"
      class:!rounded-[16px]={appState.currentView === 'dms'}
      class:!bg-[#5865f2]={appState.currentView === 'dms'}
      title="Mensagens Diretas (DMs)"
    >
      <MessageSquare class="w-6 h-6" />

      <!-- Unread DMs Total Badge -->
      {#if appState.totalUnreadDms > 0}
        <span class="absolute -top-1 -right-1 bg-[#f23f43] text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ring-2 ring-[#0e0f10] shadow animate-pulse">
          {appState.totalUnreadDms > 99 ? '99+' : appState.totalUnreadDms}
        </span>
      {/if}
    </button>
  </div>

  <div class="w-8 h-[2px] bg-[#232428] rounded-full my-1"></div>

  <!-- Server List -->
  <div class="flex-1 w-full space-y-2 overflow-y-auto no-scrollbar flex flex-col items-center">
    {#each appState.servers as server (server.id)}
      {@const isActive = appState.currentView === 'chat' && appState.currentServerId === server.id}
      {@const serverUnread = getServerUnreadCount(server.id)}

      <div class="relative group flex items-center justify-center w-full">
        <!-- Active Pill indicator -->
        <div
          class="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
          class:h-10={isActive}
          class:h-5={!isActive && serverUnread > 0}
          class:h-2={!isActive && serverUnread === 0}
          class:opacity-0={!isActive && serverUnread === 0}
          class:group-hover:opacity-100={!isActive}
        ></div>

        <button
          onclick={() => {
            soundService.play('button-click');
            appState.currentView = 'chat';
            appState.currentServerId = server.id;
            const availableChannels = appState.channels.filter((c) => c.server_id === server.id && c.type === 'text');
            if (availableChannels.length > 0) {
              appState.currentChannelId = availableChannels[0].id;
              appState.markChannelAsRead(availableChannels[0].id);
              clientService.fetchChannelMessages(availableChannels[0].id);
            }
          }}
          class="relative w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] group-hover:bg-[#5865f2] text-[#dbdee1] group-hover:text-white flex items-center justify-center font-bold text-sm tracking-wider transition-all duration-200 shadow-md overflow-hidden cursor-pointer border border-[#232428]/60 select-none"
          class:!rounded-[16px]={isActive}
          class:!bg-[#5865f2]={isActive}
          class:!text-white={isActive}
          title={server.name}
        >
          {#if isCustomImage(server.icon)}
            <img
              src={server.icon}
              alt={server.name}
              class="w-full h-full object-cover rounded-inherit"
              loading="lazy"
            />
          {:else}
            <span class="font-extrabold text-sm uppercase">{getServerAcronym(server.name)}</span>
          {/if}

          <!-- Server Unread Badge -->
          {#if serverUnread > 0 && !isActive}
            <span class="absolute -top-1 -right-1 bg-[#f23f43] text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ring-2 ring-[#0e0f10] shadow">
              {serverUnread > 99 ? '99+' : serverUnread}
            </span>
          {/if}
        </button>
      </div>
    {/each}

    <!-- Add Server Button -->
    <div class="relative group flex items-center justify-center w-full">
      <button
        onclick={() => {
          soundService.play('button-click');
          appState.activeModal = 'createServer';
        }}
        class="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#16171a] hover:!bg-[#23a55a] text-[#23a55a] hover:!text-white flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer"
        title="Add a LAN Server"
      >
        <Plus class="w-6 h-6" />
      </button>
    </div>

    <!-- LAN Auto-Discovery Hub -->
    <div class="relative group flex items-center justify-center w-full">
      <button
        onclick={() => {
          soundService.play('button-click');
          appState.activeModal = 'discovery';
          clientService.scanLanServers();
        }}
        class="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#16171a] hover:!bg-[#5865f2] text-[#949ba4] hover:!text-white flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer"
        title="Discover LAN Servers"
      >
        <Compass class="w-6 h-6" />
      </button>
    </div>

    <!-- In-App Web Browser Button -->
    <div class="relative group flex items-center justify-center w-full">
      <div
        class="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200"
        class:h-10={appState.currentView === 'browser'}
        class:h-5={appState.currentView !== 'browser'}
        class:opacity-0={appState.currentView !== 'browser'}
        class:group-hover:opacity-100={appState.currentView !== 'browser'}
      ></div>

      <button
        onclick={() => {
          soundService.play('button-click');
          appState.currentView = appState.currentView === 'browser' ? 'chat' : 'browser';
        }}
        class="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#16171a] hover:!bg-[#5865f2] text-[#949ba4] hover:!text-white flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer"
        class:!rounded-[16px]={appState.currentView === 'browser'}
        class:!bg-[#5865f2]={appState.currentView === 'browser'}
        class:!text-white={appState.currentView === 'browser'}
        title="Navegador Web Integrado (Google / Sites / Pesquisas)"
      >
        <Globe class="w-6 h-6" />
      </button>
    </div>

    <div class="w-8 h-[2px] bg-[#232428] rounded-full my-1"></div>

    <!-- Host Local Server Button -->
    <div class="relative group flex items-center justify-center w-full">
      <button
        onclick={() => (appState.activeModal = 'hostServer')}
        class="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#16171a] hover:!bg-[#23a55a] text-[#949ba4] hover:!text-white flex items-center justify-center transition-all duration-200 shadow-md relative cursor-pointer"
        title="Host Local Server (Port 3000)"
      >
        <Server class="w-5 h-5 text-white" />
        {#if appState.isServerStarting}
          <span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#f0b232] ring-2 ring-[#0e0f10] animate-ping"></span>
        {:else if appState.localServerRunning || appState.connectionStatus === 'connected'}
          <span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#23a55a] ring-2 ring-[#0e0f10]"></span>
        {:else}
          <span class="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#f23f43] ring-2 ring-[#0e0f10]"></span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Connection Status Pill at bottom -->
  <div class="pt-2 flex flex-col items-center">
    <button
      onclick={() => (appState.activeModal = 'discovery')}
      class="p-2 rounded-full hover:bg-[#16171a] transition-colors relative cursor-pointer"
      title={`Server Status: ${appState.connectionStatus} (${appState.serverUrl})`}
    >
      <Wifi
        class={`w-5 h-5 ${
          appState.connectionStatus === 'connected'
            ? 'text-[#23a55a]'
            : appState.connectionStatus === 'connecting'
              ? 'text-[#f0b232]'
              : 'text-[#f23f43]'
        }`}
      />
      {#if appState.connectionStatus === 'connected'}
        <span class="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-[#23a55a] ring-2 ring-[#0e0f10]"></span>
      {/if}
    </button>
  </div>
</nav>
