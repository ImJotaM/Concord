<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import {
    Hash,
    Volume2,
    Plus,
    Mic,
    MicOff,
    Headphones,
    VolumeX,
    Settings,
    PhoneOff,
    ChevronDown,
    Server,
    Monitor,
    Trash2,
    Shield,
  } from '@lucide/svelte';
  import { AVATAR_OPTIONS, getAvatarUrl } from '../utils/icons8';
  import { soundService } from '../services/soundService.svelte';
  import Avatar from './Avatar.svelte';

  const statusColors: Record<string, string> = {
    online: 'bg-[#23a55a]',
    idle: 'bg-[#f0b232]',
    dnd: 'bg-[#f23f43]',
    offline: 'bg-[#80848e]',
  };

  let showServerMenu = $state(false);
  let hasServerOptions = $derived(appState.canManageChannels || appState.canManageRoles || appState.canDeleteServer);
</script>

<aside class="w-60 bg-[#111214] flex flex-col h-full select-none z-10 shrink-0 border-r border-[#1a1b1e] relative">
  <!-- Server Header -->
  {#if hasServerOptions}
    <div class="relative">
      <div
        role="button"
        tabindex="0"
        onclick={() => (showServerMenu = !showServerMenu)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') showServerMenu = !showServerMenu; }}
        class="h-12 border-b border-[#1a1b1e] px-4 flex items-center justify-between font-semibold text-white shadow-sm hover:bg-[#16171a] transition-colors cursor-pointer w-full text-left select-none"
      >
        <div class="flex items-center space-x-2 truncate">
          <span class="truncate font-bold tracking-wide">
            {appState.currentServer?.name || 'Concord LAN'}
          </span>
        </div>
        <div class="flex items-center space-x-1">
          {#if appState.canManageChannels}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                appState.activeModal = 'createChannel';
              }}
              class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#1e1f22] transition-colors cursor-pointer"
              title="Criar Canal"
            >
              <Plus class="w-4 h-4" />
            </button>
          {/if}
          <ChevronDown class={`w-4 h-4 text-[#949ba4] transition-transform ${showServerMenu ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <!-- Server Dropdown Menu -->
      {#if showServerMenu}
        <div
          class="absolute top-12 left-2 right-2 bg-[#0e0f10] border border-[#1a1b1e] rounded-lg shadow-2xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100"
        >
          {#if appState.canManageChannels}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                showServerMenu = false;
                appState.activeModal = 'createChannel';
              }}
              class="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-[#dbdee1] hover:text-white hover:bg-[#5865f2] transition-colors cursor-pointer"
            >
              <span>Criar Canal</span>
              <Plus class="w-4 h-4" />
            </button>
          {/if}

          {#if appState.canManageRoles}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                showServerMenu = false;
                appState.activeModal = 'serverRoles';
              }}
              class="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-[#dbdee1] hover:text-white hover:bg-[#5865f2] transition-colors cursor-pointer"
            >
              <span>Cargos & Permissões</span>
              <Shield class="w-4 h-4" />
            </button>
          {/if}

          {#if appState.canDeleteServer}
            <div class="h-[1px] bg-[#232428] my-1"></div>
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                showServerMenu = false;
                if (confirm(`Tem certeza que deseja EXCLUIR o servidor "${appState.currentServer?.name}"? Esta ação apagará todos os canais e mensagens para todos na rede!`)) {
                  clientService.deleteServer(appState.currentServerId);
                }
              }}
              class="w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium text-[#da373c] hover:text-white hover:bg-[#da373c] transition-colors cursor-pointer"
            >
              <span>Excluir Servidor</span>
              <Trash2 class="w-4 h-4" />
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between font-semibold text-white shadow-sm cursor-default select-none">
      <span class="truncate font-bold tracking-wide">
        {appState.currentServer?.name || 'Concord LAN'}
      </span>
    </div>
  {/if}

  <!-- Channels List -->
  <div class="flex-1 overflow-y-auto px-2 py-3 space-y-4">
    {#if appState.connectionStatus !== 'connected' && appState.channels.length === 0}
      <div class="px-1 py-2 text-center">
        <div class="p-3 bg-[#1e1f22] rounded-lg border border-[#1f2023] text-xs text-[#949ba4] space-y-2.5">
          <div class="font-bold text-white text-xs">No Server Connected</div>
          <p class="text-[11px] text-[#949ba4]">
            Host a local server or connect to a friend on Wi-Fi.
          </p>
          <button
            onclick={() => (appState.activeModal = 'hostServer')}
            class="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white py-1.5 px-2 rounded-md text-xs font-bold flex items-center justify-center space-x-1.5 shadow"
          >
            <Server class="w-3.5 h-3.5" />
            <span>Host Server</span>
          </button>
        </div>
      </div>
    {/if}

    <!-- TEXT CHANNELS -->
    <div>
      <div class="flex items-center justify-between text-[12px] font-bold text-[#949ba4] px-2 mb-1 tracking-wider uppercase">
        <span>Canais de Texto</span>
        {#if appState.canManageChannels}
          <button
            onclick={() => (appState.activeModal = 'createChannel')}
            class="hover:text-white transition-colors cursor-pointer"
            title="Create Text Channel"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        {/if}
      </div>

      <div class="space-y-[2px]">
        {#each appState.currentTextChannels as channel (channel.id)}
          {@const isActive = appState.currentView === 'chat' && appState.currentChannelId === channel.id}
          {@const unreadCount = appState.unreadChannels[channel.id] || 0}
          <div
            role="button"
            tabindex="0"
            onclick={() => {
              soundService.play('button-click');
              appState.currentView = 'chat';
              appState.currentChannelId = channel.id;
              appState.markChannelAsRead(channel.id);
              clientService.fetchChannelMessages(channel.id);
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                soundService.play('button-click');
                appState.currentView = 'chat';
                appState.currentChannelId = channel.id;
                appState.markChannelAsRead(channel.id);
                clientService.fetchChannelMessages(channel.id);
              }
            }}
            class="w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] text-sm font-medium transition-colors group cursor-pointer relative"
            class:bg-[#1e1f22]={isActive}
            class:text-white={isActive || unreadCount > 0}
            class:font-bold={unreadCount > 0}
            class:text-[#949ba4]={!isActive && unreadCount === 0}
            class:hover:bg-[#16171a]={!isActive}
            class:hover:text-[#dbdee1]={!isActive && unreadCount === 0}
          >
            <!-- Discord Unread White Pill Indicator on the left -->
            {#if unreadCount > 0 && !isActive}
              <div class="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-2 bg-white rounded-r-full"></div>
            {/if}

            <div class="flex items-center truncate flex-1 min-w-0">
              <Hash class={`w-4 h-4 mr-1.5 shrink-0 ${isActive || unreadCount > 0 ? 'text-white' : 'text-[#80848e] group-hover:text-[#dbdee1]'}`} />
              <span class="truncate">{channel.name}</span>
            </div>

            <!-- Unread Badge on the right -->
            {#if unreadCount > 0 && !isActive}
              <span class="bg-[#f23f43] text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full shadow shrink-0 mr-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            {/if}

            {#if appState.canManageChannels}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Excluir o canal de texto #${channel.name}?`)) {
                    clientService.deleteChannel(channel.id, channel.server_id);
                  }
                }}
                class="opacity-0 group-hover:opacity-100 hover:text-[#da373c] p-0.5 rounded transition-opacity shrink-0 cursor-pointer"
                title="Excluir Canal"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- VOICE CHANNELS -->
    <div>
      <div class="flex items-center justify-between text-[12px] font-bold text-[#949ba4] px-2 mb-1 tracking-wider uppercase">
        <span>Salas de Voz (LAN)</span>
        {#if appState.canManageChannels}
          <button
            onclick={() => (appState.activeModal = 'createChannel')}
            class="hover:text-white transition-colors cursor-pointer"
            title="Create Voice Channel"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        {/if}
      </div>

      <div class="space-y-[2px]">
        {#each appState.currentVoiceChannels as channel (channel.id)}
          {@const isCurrentVoice = appState.voiceState.activeChannelId === channel.id}
          {@const participants = appState.voiceState.roomParticipants[channel.id] || []}

          <div class="space-y-1">
            <div
              role="button"
              tabindex="0"
              onclick={() => {
                appState.currentView = 'chat';
                if (isCurrentVoice) {
                  appState.currentChannelId = channel.id;
                } else {
                  clientService.joinVoiceChannel(channel.id);
                  appState.currentChannelId = channel.id;
                }
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  appState.currentView = 'chat';
                  if (isCurrentVoice) {
                    appState.currentChannelId = channel.id;
                  } else {
                    clientService.joinVoiceChannel(channel.id);
                    appState.currentChannelId = channel.id;
                  }
                }
              }}
              class="w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] text-sm font-medium transition-colors group text-left cursor-pointer"
              class:bg-[#16171a]={isCurrentVoice}
              class:text-[#23a55a]={isCurrentVoice}
              class:text-[#949ba4]={!isCurrentVoice}
              class:hover:bg-[#16171a]={!isCurrentVoice}
              class:hover:text-[#dbdee1]={!isCurrentVoice}
            >
              <div class="flex items-center truncate flex-1 min-w-0">
                <Volume2 class={`w-4 h-4 mr-1.5 shrink-0 ${isCurrentVoice ? 'text-[#23a55a]' : 'text-[#80848e] group-hover:text-[#dbdee1]'}`} />
                <span class="truncate flex-1">{channel.name}</span>
                {#if participants.length > 0}
                  <span class="text-xs bg-[#0e0f10] text-[#dbdee1] px-1.5 py-0.5 rounded-full font-semibold mr-1">
                    {participants.length}
                  </span>
                {/if}
              </div>

              {#if appState.canManageChannels}
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir a sala de voz "${channel.name}"?`)) {
                      clientService.deleteChannel(channel.id, channel.server_id);
                    }
                  }}
                  class="opacity-0 group-hover:opacity-100 hover:text-[#da373c] p-0.5 rounded transition-opacity shrink-0 cursor-pointer"
                  title="Excluir Sala de Voz"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              {/if}
            </div>

            <!-- Voice Participants List -->
            {#if participants.length > 0}
              <div class="pl-6 space-y-1 py-0.5">
                {#each participants as participant (participant.userId)}
                  {@const isLocal = participant.userId === appState.currentUser.id}
                  {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : participant.isSpeaking}
                  {@const isPeerMuted = isLocal ? appState.voiceState.isMuted : participant.isMuted}
                  {@const isPeerDeafened = isLocal ? appState.voiceState.isDeafened : participant.isDeafened}
                  <div class="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-[#16171a] transition-colors">
                    <Avatar
                      name={participant.displayName}
                      avatar={participant.avatar}
                      userId={participant.userId}
                      size="sm"
                      {isSpeaking}
                    />
                    <span
                      class="text-xs font-medium truncate flex-1 min-w-0"
                      class:text-[#23a55a]={isSpeaking}
                      class:text-[#dbdee1]={!isSpeaking}
                    >
                      {participant.displayName}
                    </span>
                    {#if (isLocal ? appState.voiceState.isScreenSharing : participant.isScreenSharing)}
                      <span class="text-[9px] bg-[#f23f43] text-white font-bold px-1 py-0.2 rounded shadow shrink-0">
                        AO VIVO
                      </span>
                    {/if}
                    {#if isPeerDeafened}
                      <VolumeX class="w-3.5 h-3.5 text-[#f23f43] shrink-0" title="Áudio Desativado" />
                    {:else if isPeerMuted}
                      <MicOff class="w-3.5 h-3.5 text-[#f23f43] shrink-0" title="Microfone Mutado" />
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- ACTIVE VOICE STATUS BAR (When connected to voice) -->
  {#if appState.voiceState.activeChannelId}
    {@const connectedChannel = appState.channels.find((c) => c.id === appState.voiceState.activeChannelId)}
    <div class="bg-[#0e0f10] border-b border-[#1a1b1e] p-2 flex items-center justify-between">
      <button
        type="button"
        onclick={() => {
          if (appState.voiceState.activeChannelId) {
            appState.currentView = 'chat';
            appState.currentChannelId = appState.voiceState.activeChannelId;
          }
        }}
        class="flex items-center space-x-2 truncate hover:opacity-85 transition-opacity text-left flex-1 cursor-pointer"
        title="Voltar para a chamada de voz"
      >
        <div class="w-2.5 h-2.5 rounded-full bg-[#23a55a] animate-pulse shrink-0"></div>
        <div class="truncate">
          <div class="text-xs font-bold text-[#23a55a] flex items-center space-x-1">
            <span>Voz Conectada</span>
            <span class="text-[10px] text-[#949ba4] font-normal">(LAN &lt;5ms)</span>
          </div>
          <div class="text-xs text-[#949ba4] hover:text-white transition-colors truncate">{connectedChannel?.name || 'Sala de Voz'}</div>
        </div>
      </button>

      <div class="flex items-center space-x-1">
        <button
          onclick={() => clientService.toggleScreenShare()}
          class="p-1.5 rounded hover:bg-[#16171a] transition-colors cursor-pointer"
          class:text-[#5865f2]={!appState.voiceState.isScreenSharing}
          class:text-[#f23f43]={appState.voiceState.isScreenSharing}
          title={appState.voiceState.isScreenSharing ? 'Parar Tela' : 'Compartilhar Tela'}
        >
          <Monitor class="w-4 h-4" />
        </button>

        <button
          onclick={() => clientService.leaveVoiceChannel()}
          class="p-1.5 rounded hover:bg-[#16171a] text-[#f23f43] transition-colors cursor-pointer"
          title="Desconectar da Voz"
        >
          <PhoneOff class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}

  <!-- USER FOOTER -->
  <footer class="h-14 bg-[#0a0b0c] px-2 flex items-center justify-between border-t border-[#1a1b1e]">
    <button
      onclick={() => (appState.activeModal = 'settings')}
      class="flex items-center space-x-2 p-1 -ml-1 rounded-md hover:bg-[#16171a] transition-colors truncate text-left flex-1 mr-1 cursor-pointer"
    >
      <div class="relative">
        <Avatar
          name={appState.currentUser.displayName}
          avatar={appState.currentUser.avatar}
          userId={appState.currentUser.id}
          size="md"
        />
        <div
          class="absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#0a0b0c] {statusColors[
            appState.currentUser.status
          ]}"
        ></div>
      </div>
      <div class="truncate leading-tight">
        <div class="text-xs font-semibold text-white truncate">{appState.currentUser.displayName}</div>
        <div class="text-[10px] text-[#949ba4] truncate">@{appState.currentUser.username}</div>
      </div>
    </button>

    <!-- Voice / Audio controls -->
    <div class="flex items-center space-x-0.5 text-[#b5bac1]">
      <button
        onclick={() => clientService.toggleMute()}
        class="p-1.5 rounded hover:bg-[#16171a] hover:text-[#dbdee1] transition-colors cursor-pointer"
        class:text-[#f23f43]={appState.voiceState.isMuted}
        title={appState.voiceState.isMuted ? 'Unmute Mic' : 'Mute Mic'}
      >
        {#if appState.voiceState.isMuted}
          <MicOff class="w-4 h-4" />
        {:else}
          <Mic class="w-4 h-4" />
        {/if}
      </button>

      <button
        onclick={() => clientService.toggleDeafen()}
        class="p-1.5 rounded hover:bg-[#16171a] hover:text-[#dbdee1] transition-colors cursor-pointer"
        class:text-[#f23f43]={appState.voiceState.isDeafened}
        title={appState.voiceState.isDeafened ? 'Undeafen' : 'Deafen'}
      >
        <Headphones class="w-4 h-4" />
      </button>

      <button
        onclick={() => (appState.activeModal = 'settings')}
        class="p-1.5 rounded hover:bg-[#16171a] hover:text-[#dbdee1] transition-colors cursor-pointer"
        title="User Settings"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </footer>
</aside>
