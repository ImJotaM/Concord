<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import { Mic, MicOff, Headphones, PhoneOff, Volume2, Users, Shield } from '@lucide/svelte';

  interface Props {
    channelId: string;
  }

  let { channelId }: Props = $props();

  let participants = $derived(appState.voiceState.roomParticipants[channelId] || []);
  let channel = $derived(appState.channels.find((c) => c.id === channelId));
  let isConnectedToThis = $derived(appState.voiceState.activeChannelId === channelId);
</script>

<div class="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden">
  <!-- Voice Room Header -->
  <header class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between bg-[#313338] shrink-0">
    <div class="flex items-center space-x-2">
      <Volume2 class="w-6 h-6 text-[#23a55a]" />
      <h2 class="text-white font-bold text-base">{channel?.name || 'Voice Channel'}</h2>
      <span class="text-xs bg-[#232428] text-[#949ba4] px-2 py-0.5 rounded-full flex items-center space-x-1">
        <span class="w-1.5 h-1.5 rounded-full bg-[#23a55a]"></span>
        <span>LAN Realtime WebRTC</span>
      </span>
    </div>

    {#if !isConnectedToThis}
      <button
        onclick={() => clientService.joinVoiceChannel(channelId)}
        class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors flex items-center space-x-2 shadow"
      >
        <Volume2 class="w-4 h-4" />
        <span>Join Voice</span>
      </button>
    {:else}
      <button
        onclick={() => clientService.leaveVoiceChannel()}
        class="bg-[#f23f43] hover:bg-[#d83a3e] text-white px-4 py-1.5 rounded text-sm font-semibold transition-colors flex items-center space-x-2 shadow"
      >
        <PhoneOff class="w-4 h-4" />
        <span>Disconnect</span>
      </button>
    {/if}
  </header>

  <!-- Participant Grid -->
  <div class="flex-1 p-6 overflow-y-auto flex items-center justify-center">
    {#if participants.length === 0}
      <div class="text-center text-[#949ba4] max-w-sm">
        <div class="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center mx-auto mb-3 text-2xl">
          🔊
        </div>
        <h3 class="text-white font-bold text-lg mb-1">Nobody is here yet</h3>
        <p class="text-sm mb-4">Click below to hop in and start talking over the local network!</p>
        <button
          onclick={() => clientService.joinVoiceChannel(channelId)}
          class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-5 py-2 rounded-md font-semibold text-sm transition-colors"
        >
          Join Voice Channel
        </button>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
        {#each participants as p (p.userId)}
          {@const isLocal = p.userId === appState.currentUser.id}
          {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : p.isSpeaking}
          <div
            class="bg-[#2b2d31] rounded-lg p-6 flex flex-col items-center justify-center relative aspect-video shadow-md border-2 transition-all"
            class:border-[#23a55a]={isSpeaking}
            class:border-transparent={!isSpeaking}
            class:shadow-[0_0_15px_rgba(35,165,90,0.3)]={isSpeaking}
          >
            <!-- Avatar -->
            <div
              class="w-20 h-20 rounded-full bg-[#1e1f22] flex items-center justify-center text-4xl mb-3 shadow-inner ring-4 transition-all"
              class:ring-[#23a55a]={isSpeaking}
              class:ring-transparent={!isSpeaking}
            >
              <span>{p.avatar || '👤'}</span>
            </div>

            <!-- Name -->
            <div class="text-white font-semibold text-sm truncate max-w-[90%] text-center">
              {p.displayName}
              {#if isLocal}
                <span class="text-[#949ba4] text-xs font-normal"> (You)</span>
              {/if}
            </div>

            <!-- Status badges -->
            <div class="absolute top-3 right-3 flex items-center space-x-1">
              {#if isLocal && appState.voiceState.isMuted}
                <div class="bg-[#f23f43] p-1 rounded-full text-white" title="Muted">
                  <MicOff class="w-3.5 h-3.5" />
                </div>
              {/if}
              {#if isLocal && appState.voiceState.isDeafened}
                <div class="bg-[#f23f43] p-1 rounded-full text-white" title="Deafened">
                  <Headphones class="w-3.5 h-3.5" />
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Bottom Voice Bar controls inside grid -->
  {#if isConnectedToThis}
    <div class="h-16 bg-[#2b2d31] border-t border-[#1f2023] px-6 flex items-center justify-center space-x-4 shrink-0">
      <button
        onclick={() => clientService.toggleMute()}
        class="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-white"
        class:bg-[#f23f43]={appState.voiceState.isMuted}
        class:bg-[#3b3e45]={!appState.voiceState.isMuted}
        class:hover:bg-[#474b53]={!appState.voiceState.isMuted}
        title={appState.voiceState.isMuted ? 'Unmute' : 'Mute'}
      >
        {#if appState.voiceState.isMuted}
          <MicOff class="w-5 h-5" />
        {:else}
          <Mic class="w-5 h-5" />
        {/if}
      </button>

      <button
        onclick={() => clientService.toggleDeafen()}
        class="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-white"
        class:bg-[#f23f43]={appState.voiceState.isDeafened}
        class:bg-[#3b3e45]={!appState.voiceState.isDeafened}
        class:hover:bg-[#474b53]={!appState.voiceState.isDeafened}
        title={appState.voiceState.isDeafened ? 'Undeafen' : 'Deafen'}
      >
        <Headphones class="w-5 h-5" />
      </button>

      <button
        onclick={() => clientService.leaveVoiceChannel()}
        class="w-10 h-10 rounded-full bg-[#f23f43] hover:bg-[#d83a3e] flex items-center justify-center transition-colors text-white"
        title="Disconnect"
      >
        <PhoneOff class="w-5 h-5" />
      </button>
    </div>
  {/if}
</div>
