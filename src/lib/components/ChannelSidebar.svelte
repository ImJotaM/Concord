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
    Settings,
    PhoneOff,
    ChevronDown,
    Server,
  } from '@lucide/svelte';

  const statusColors: Record<string, string> = {
    online: 'bg-[#23a55a]',
    idle: 'bg-[#f0b232]',
    dnd: 'bg-[#f23f43]',
    offline: 'bg-[#80848e]',
  };
</script>

<aside class="w-60 bg-[#2b2d31] flex flex-col h-full select-none z-10 shrink-0 border-r border-[#1f2023]/60">
  <!-- Server Header -->
  <header
    class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between font-semibold text-white shadow-sm hover:bg-[#35373c] transition-colors cursor-pointer"
  >
    <div class="flex items-center space-x-2 truncate">
      <span class="truncate font-bold tracking-wide">
        {appState.currentServer?.name || 'Concord LAN'}
      </span>
    </div>
    <div class="flex items-center space-x-1">
      <button
        onclick={(e) => {
          e.stopPropagation();
          appState.activeModal = 'createChannel';
        }}
        class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#3f4147] transition-colors"
        title="Create Channel"
      >
        <Plus class="w-4 h-4" />
      </button>
      <ChevronDown class="w-4 h-4 text-[#949ba4]" />
    </div>
  </header>

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
        <span>Text Channels</span>
        <button
          onclick={() => (appState.activeModal = 'createChannel')}
          class="hover:text-white transition-colors"
          title="Create Text Channel"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="space-y-[2px]">
        {#each appState.currentTextChannels as channel (channel.id)}
          {@const isActive = appState.currentChannelId === channel.id}
          <button
            onclick={() => {
              appState.currentChannelId = channel.id;
              clientService.fetchChannelMessages(channel.id);
            }}
            class="w-full flex items-center px-2 py-1.5 rounded-[4px] text-sm font-medium transition-colors group text-left"
            class:bg-[#404249]={isActive}
            class:text-white={isActive}
            class:text-[#949ba4]={!isActive}
            class:hover:bg-[#35373c]={!isActive}
            class:hover:text-[#dbdee1]={!isActive}
          >
            <Hash class={`w-4 h-4 mr-1.5 ${isActive ? 'text-white' : 'text-[#80848e] group-hover:text-[#dbdee1]'}`} />
            <span class="truncate">{channel.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- VOICE CHANNELS -->
    <div>
      <div class="flex items-center justify-between text-[12px] font-bold text-[#949ba4] px-2 mb-1 tracking-wider uppercase">
        <span>Voice Channels (LAN)</span>
        <button
          onclick={() => (appState.activeModal = 'createChannel')}
          class="hover:text-white transition-colors"
          title="Create Voice Channel"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="space-y-[2px]">
        {#each appState.currentVoiceChannels as channel (channel.id)}
          {@const isCurrentVoice = appState.voiceState.activeChannelId === channel.id}
          {@const participants = appState.voiceState.roomParticipants[channel.id] || []}

          <div class="space-y-1">
            <button
              onclick={() => {
                if (isCurrentVoice) {
                  // Switch chat focus or show voice room
                  appState.currentChannelId = channel.id;
                } else {
                  clientService.joinVoiceChannel(channel.id);
                  appState.currentChannelId = channel.id;
                }
              }}
              class="w-full flex items-center px-2 py-1.5 rounded-[4px] text-sm font-medium transition-colors group text-left"
              class:bg-[#35373c]={isCurrentVoice}
              class:text-[#23a55a]={isCurrentVoice}
              class:text-[#949ba4]={!isCurrentVoice}
              class:hover:bg-[#35373c]={!isCurrentVoice}
              class:hover:text-[#dbdee1]={!isCurrentVoice}
            >
              <Volume2 class={`w-4 h-4 mr-1.5 ${isCurrentVoice ? 'text-[#23a55a]' : 'text-[#80848e] group-hover:text-[#dbdee1]'}`} />
              <span class="truncate flex-1">{channel.name}</span>
              {#if participants.length > 0}
                <span class="text-xs bg-[#1e1f22] text-[#dbdee1] px-1.5 py-0.5 rounded-full font-semibold">
                  {participants.length}
                </span>
              {/if}
            </button>

            <!-- Voice Participants List -->
            {#if participants.length > 0}
              <div class="pl-6 space-y-1 py-0.5">
                {#each participants as participant (participant.userId)}
                  {@const isLocal = participant.userId === appState.currentUser.id}
                  {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : participant.isSpeaking}
                  <div class="flex items-center space-x-2 py-1 px-1.5 rounded hover:bg-[#35373c]/50 transition-colors">
                    <div
                      class="w-6 h-6 rounded-full bg-[#1e1f22] flex items-center justify-center text-xs ring-2 ring-transparent transition-all"
                      class:is-speaking={isSpeaking}
                    >
                      <span>{participant.avatar || '👤'}</span>
                    </div>
                    <span
                      class="text-xs font-medium truncate flex-1"
                      class:text-[#23a55a]={isSpeaking}
                      class:text-[#dbdee1]={!isSpeaking}
                    >
                      {participant.displayName}
                    </span>
                    {#if isLocal && appState.voiceState.isMuted}
                      <MicOff class="w-3.5 h-3.5 text-[#f23f43]" />
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
    <div class="bg-[#232428] border-b border-[#1f2023] p-2 flex items-center justify-between">
      <div class="flex items-center space-x-2 truncate">
        <div class="w-2.5 h-2.5 rounded-full bg-[#23a55a] animate-pulse"></div>
        <div class="truncate">
          <div class="text-xs font-bold text-[#23a55a] flex items-center space-x-1">
            <span>Voice Connected</span>
            <span class="text-[10px] text-[#949ba4] font-normal">(LAN &lt;2ms)</span>
          </div>
          <div class="text-xs text-[#949ba4] truncate">{connectedChannel?.name || 'Voice Room'}</div>
        </div>
      </div>

      <button
        onclick={() => clientService.leaveVoiceChannel()}
        class="p-1.5 rounded hover:bg-[#35373c] text-[#f23f43] transition-colors"
        title="Disconnect from Voice"
      >
        <PhoneOff class="w-4 h-4" />
      </button>
    </div>
  {/if}

  <!-- USER FOOTER -->
  <footer class="h-14 bg-[#232428] px-2 flex items-center justify-between border-t border-[#1f2023]/60">
    <button
      onclick={() => (appState.activeModal = 'settings')}
      class="flex items-center space-x-2 p-1 -ml-1 rounded-md hover:bg-[#35373c] transition-colors truncate text-left flex-1 mr-1"
    >
      <div class="relative">
        <div class="w-8 h-8 rounded-full bg-[#313338] flex items-center justify-center text-sm">
          <span>{appState.currentUser.avatar}</span>
        </div>
        <div
          class="absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#232428] {statusColors[
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
        class="p-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] transition-colors"
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
        class="p-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] transition-colors"
        class:text-[#f23f43]={appState.voiceState.isDeafened}
        title={appState.voiceState.isDeafened ? 'Undeafen' : 'Deafen'}
      >
        <Headphones class="w-4 h-4" />
      </button>

      <button
        onclick={() => (appState.activeModal = 'settings')}
        class="p-1.5 rounded hover:bg-[#35373c] hover:text-[#dbdee1] transition-colors"
        title="User Settings"
      >
        <Settings class="w-4 h-4" />
      </button>
    </div>
  </footer>
</aside>
