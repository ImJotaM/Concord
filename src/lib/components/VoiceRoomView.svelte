<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import {
    Mic,
    MicOff,
    Headphones,
    PhoneOff,
    Volume2,
    VolumeX,
    Monitor,
    MonitorOff,
    Maximize2,
    Minimize2,
    Tv,
    Radio,
    Settings,
  } from '@lucide/svelte';

  interface Props {
    channelId: string;
  }

  let { channelId }: Props = $props();

  let participants = $derived(appState.voiceState.roomParticipants[channelId] || []);
  let channel = $derived(appState.channels.find((c) => c.id === channelId));
  let isConnectedToThis = $derived(appState.voiceState.activeChannelId === channelId);

  // Screen share list
  let remoteScreensList = $derived(Object.values(appState.voiceState.remoteScreenStreams));
  let localScreenStream = $derived(appState.voiceState.localScreenStream);
  let isLocalSharing = $derived(appState.voiceState.isScreenSharing);

  // Active spotlight screen or participant
  let selectedScreenId = $state<string | null>(null);
  let isFullScreen = $state(false);
  let stageContainer: HTMLDivElement | null = $state(null);

  function attachAudio(node: HTMLAudioElement, params: { stream?: MediaStream | null; volume: number }) {
    let { stream, volume } = params;

    function apply(s?: MediaStream | null, v?: number) {
      if (s && node.srcObject !== s) {
        node.srcObject = s;
      }
      if (v !== undefined) {
        node.volume = Math.min(Math.max(v / 100, 0), 1);
      }
      if (s) {
        const playPromise = node.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('[WebRTC-Debug] ⚠️ Autoplay blocked on remote audio:', err);
            if (err.name === 'NotAllowedError') {
              appState.voiceState.autoplayBlocked = true;
            }
          });
        }
      }
    }

    apply(stream, volume);

    return {
      update(newParams: { stream?: MediaStream | null; volume: number }) {
        stream = newParams.stream;
        volume = newParams.volume;
        apply(stream, volume);
      },
      destroy() {
        node.srcObject = null;
      },
    };
  }

  function unlockAudioAll() {
    appState.voiceState.autoplayBlocked = false;
    document.querySelectorAll('audio').forEach((el) => {
      el.play().catch(console.warn);
    });
  }

  // Determine current active stream for main spotlight stage
  let activeSpotlight = $derived.by(() => {
    if (selectedScreenId === 'local' && localScreenStream) {
      return {
        id: 'local',
        title: `${appState.currentUser.displayName} (Sua Tela)`,
        stream: localScreenStream,
        isLocal: true,
      };
    }
    if (selectedScreenId && appState.voiceState.remoteScreenStreams[selectedScreenId]) {
      const rs = appState.voiceState.remoteScreenStreams[selectedScreenId];
      return {
        id: rs.peerId,
        title: `${rs.displayName} (Tela Compartilhada)`,
        stream: rs.stream,
        isLocal: false,
      };
    }
    // Auto fallback to first remote screen or local screen
    if (remoteScreensList.length > 0) {
      const first = remoteScreensList[0];
      return {
        id: first.peerId,
        title: `${first.displayName} (Tela Compartilhada)`,
        stream: first.stream,
        isLocal: false,
      };
    }
    if (isLocalSharing && localScreenStream) {
      return {
        id: 'local',
        title: `${appState.currentUser.displayName} (Sua Tela)`,
        stream: localScreenStream,
        isLocal: true,
      };
    }
    return null;
  });

  function attachStream(node: HTMLVideoElement, stream: MediaStream) {
    node.srcObject = stream;
    node.play().catch((e) => console.log('Video play prompt:', e));
    return {
      update(newStream: MediaStream) {
        if (node.srcObject !== newStream) {
          node.srcObject = newStream;
          node.play().catch((e) => console.log('Video play prompt:', e));
        }
      },
      destroy() {
        node.srcObject = null;
      },
    };
  }

  function toggleFullScreen() {
    if (!stageContainer) return;
    if (!document.fullscreenElement) {
      stageContainer.requestFullscreen().then(() => (isFullScreen = true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => (isFullScreen = false)).catch(() => {});
    }
  }
</script>

<div class="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden select-none">
  <!-- Voice Room Header -->
  <header class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between bg-[#313338] shrink-0">
    <div class="flex items-center space-x-2">
      <Volume2 class="w-5 h-5 text-[#23a55a]" />
      <h2 class="text-white font-bold text-base truncate">{channel?.name || 'Canal de Voz'}</h2>
      <span class="text-[11px] bg-[#232428] text-[#949ba4] px-2 py-0.5 rounded-full flex items-center space-x-1.5 border border-[#1f2023]">
        <span class="w-1.5 h-1.5 rounded-full bg-[#23a55a] animate-pulse"></span>
        <span>WebRTC LAN &lt;5ms</span>
      </span>

      {#if activeSpotlight}
        <span class="text-[11px] bg-[#f23f43]/15 text-[#f23f43] border border-[#f23f43]/30 px-2 py-0.5 rounded-full flex items-center space-x-1 font-bold animate-pulse">
          <Radio class="w-3 h-3" />
          <span>TRANSMISSÃO AO VIVO</span>
        </span>
      {/if}
    </div>

    <div class="flex items-center space-x-2">
      {#if !isConnectedToThis}
        <button
          onclick={() => clientService.joinVoiceChannel(channelId)}
          class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-4 py-1.5 rounded-md text-sm font-semibold transition-all flex items-center space-x-1.5 shadow cursor-pointer"
        >
          <Volume2 class="w-4 h-4" />
          <span>Entrar na Chamada</span>
        </button>
      {:else}
        {#if isLocalSharing}
          <button
            onclick={() => clientService.stopScreenShare()}
            class="bg-[#f23f43]/20 hover:bg-[#f23f43]/30 text-[#f23f43] border border-[#f23f43]/40 px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="Parar de transmitir tela"
          >
            <MonitorOff class="w-3.5 h-3.5" />
            <span>Parar Tela</span>
          </button>
        {:else}
          <button
            onclick={() => clientService.startScreenShare()}
            class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 shadow cursor-pointer"
            title="Compartilhar sua tela na sala"
          >
            <Monitor class="w-3.5 h-3.5" />
            <span>Compartilhar Tela</span>
          </button>
        {/if}

        <button
          onclick={() => clientService.leaveVoiceChannel()}
          class="bg-[#f23f43] hover:bg-[#d83a3e] text-white px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center space-x-1.5 shadow cursor-pointer"
        >
          <PhoneOff class="w-3.5 h-3.5" />
          <span>Desconectar</span>
        </button>
      {/if}
    </div>
  </header>

  {#if appState.voiceState.autoplayBlocked}
    <div class="bg-[#f23f43] text-white px-4 py-3 flex items-center justify-between shrink-0 shadow-md z-10 animate-in slide-in-from-top-2">
      <div class="flex items-center space-x-2">
        <Volume2 class="w-5 h-5" />
        <span class="text-sm font-bold">O navegador bloqueou o áudio automático da chamada.</span>
      </div>
      <button
        onclick={unlockAudioAll}
        class="bg-white text-[#f23f43] hover:bg-gray-100 px-4 py-1.5 rounded text-sm font-bold transition-colors shadow cursor-pointer"
      >
        Desbloquear Áudio
      </button>
    </div>
  {/if}

  <!-- Main Stage Workspace -->
  <div class="flex-1 p-4 overflow-y-auto flex flex-col items-center justify-center space-y-4">
    {#if participants.length === 0}
      <div class="text-center py-12 text-[#949ba4] space-y-3">
        <Volume2 class="w-14 h-14 mx-auto text-[#4e5058] opacity-50" />
        <p class="text-sm font-medium">Ninguém está neste canal de voz ainda.</p>
        {#if !isConnectedToThis}
          <button
            onclick={() => clientService.joinVoiceChannel(channelId)}
            class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
          >
            Seja o primeiro a entrar
          </button>
        {/if}
      </div>
    {:else if activeSpotlight}
      <!-- 1. SPOTLIGHT STAGE (Screen Share Mode) -->
      <div
        bind:this={stageContainer}
        class="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#1f2023] flex items-center justify-center group"
      >
        <video
          use:attachStream={activeSpotlight.stream}
          autoplay
          playsinline
          muted={activeSpotlight.isLocal}
          class="w-full h-full object-contain"
        >
          <track kind="captions" />
        </video>

        <!-- Stage Overlay Controls -->
        <div class="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/80 to-transparent p-3 rounded-t-xl">
          <div class="flex items-center space-x-2">
            <span class="inline-flex items-center gap-1.5 rounded-md bg-[#f23f43] px-2 py-0.5 text-xs font-bold text-white shadow">
              <Tv class="w-3 h-3" />
              <span>AO VIVO</span>
            </span>
            <span class="text-xs font-bold text-white drop-shadow">{activeSpotlight.title}</span>
          </div>

          <button
            onclick={toggleFullScreen}
            class="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
            title="Tela Cheia"
          >
            {#if isFullScreen}
              <Minimize2 class="w-4 h-4" />
            {:else}
              <Maximize2 class="w-4 h-4" />
            {/if}
          </button>
        </div>
      </div>

      <!-- Bottom Mini-Strip of Participants / Streams -->
      <div class="flex flex-wrap items-center justify-center gap-3 w-full max-w-5xl pt-1">
        {#each participants as p (p.userId)}
          {@const isLocal = p.userId === appState.currentUser.id}
          {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : p.isSpeaking}
          {@const hasScreen = isLocal ? isLocalSharing : !!remoteScreensList.find((s) => s.userId === p.userId || (p.peerId && s.peerId === p.peerId))}
          {@const isSelected = selectedScreenId === (isLocal ? 'local' : (p.peerId || p.userId))}
          {@const remoteStream = !isLocal ? ((p.peerId && appState.voiceState.remoteAudioStreams[p.peerId]) || appState.voiceState.remoteAudioStreams[p.userId] || null) : null}
          {@const userVol = clientService.getUserVolume(p.userId)}

          {#if !isLocal}
            <audio use:attachAudio={{ stream: remoteStream, volume: userVol }} autoplay playsinline class="hidden"></audio>
          {/if}

          <button
            onclick={() => {
              if (hasScreen) {
                selectedScreenId = isLocal ? 'local' : (remoteScreensList.find((s) => s.userId === p.userId || (p.peerId && s.peerId === p.peerId))?.peerId || null);
              }
            }}
            class="bg-[#2b2d31] hover:bg-[#35373c] px-3 py-2 rounded-xl flex items-center space-x-2.5 border-2 transition-all cursor-pointer text-left"
            class:border-[#23a55a]={isSpeaking}
            class:border-[#5865f2]={isSelected}
            class:border-transparent={!isSpeaking && !isSelected}
          >
            <div class="w-8 h-8 rounded-full bg-[#1e1f22] flex items-center justify-center text-sm ring-2 ring-transparent" class:ring-[#23a55a]={isSpeaking}>
              <span>{p.avatar || '👤'}</span>
            </div>
            <div class="truncate max-w-[120px]">
              <div class="text-xs font-bold text-white truncate">{p.displayName} {isLocal ? '(Você)' : ''}</div>
              {#if hasScreen}
                <div class="text-[10px] text-[#f23f43] font-bold flex items-center space-x-1">
                  <Monitor class="w-3 h-3" />
                  <span>Transmitindo</span>
                </div>
              {:else}
                <div class="text-[10px] text-[#949ba4] truncate">{isSpeaking ? 'Falando...' : 'Conectado'}</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <!-- 2. STANDARD PARTICIPANT AUDIO GRID WITH INDIVIDUAL VOLUME -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
        {#each participants as p (p.userId)}
          {@const isLocal = p.userId === appState.currentUser.id}
          {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : p.isSpeaking}
          {@const remoteStream = !isLocal ? ((p.peerId && appState.voiceState.remoteAudioStreams[p.peerId]) || appState.voiceState.remoteAudioStreams[p.userId] || null) : null}
          {@const userVol = clientService.getUserVolume(p.userId)}

          {#if !isLocal}
            <audio use:attachAudio={{ stream: remoteStream, volume: userVol }} autoplay playsinline class="hidden"></audio>
          {/if}

          <div
            class="bg-[#2b2d31] rounded-2xl p-5 flex flex-col items-center justify-between relative shadow-lg border-2 transition-all min-h-[220px]"
            class:border-[#23a55a]={isSpeaking}
            class:border-transparent={!isSpeaking}
            class:shadow-[0_0_20px_rgba(35,165,90,0.25)]={isSpeaking}
          >
            <div class="absolute top-3 right-3 flex items-center space-x-1.5">
              {#if isLocal && appState.voiceState.isMuted}
                <div class="bg-[#f23f43] p-1.5 rounded-full text-white shadow" title="Microfone Mutado">
                  <MicOff class="w-3.5 h-3.5" />
                </div>
              {/if}
              {#if isLocal && appState.voiceState.isDeafened}
                <div class="bg-[#f23f43] p-1.5 rounded-full text-white shadow" title="Áudio Desativado">
                  <Headphones class="w-3.5 h-3.5" />
                </div>
              {/if}
            </div>

            <div class="flex flex-col items-center justify-center mt-2">
              <div
                class="w-20 h-20 rounded-full bg-[#1e1f22] flex items-center justify-center text-4xl mb-3 shadow-inner ring-4 transition-all"
                class:ring-[#23a55a]={isSpeaking}
                class:ring-transparent={!isSpeaking}
              >
                <span>{p.avatar || '👤'}</span>
              </div>
              <div class="text-white font-bold text-sm truncate max-w-[180px] text-center">
                {p.displayName}
                {#if isLocal}
                  <span class="text-[#949ba4] text-xs font-normal"> (Você)</span>
                {/if}
              </div>
            </div>

            {#if !isLocal}
              <div class="w-full bg-[#1e1f22] px-3 py-2 rounded-xl flex items-center space-x-2.5 mt-3 shadow-inner">
                {#if userVol === 0}
                  <VolumeX class="w-4 h-4 text-[#f23f43] shrink-0" />
                {:else}
                  <Volume2 class="w-4 h-4 text-[#949ba4] shrink-0" />
                {/if}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={userVol}
                  oninput={(e) => {
                    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                    clientService.setUserVolume(p.userId, val);
                  }}
                  class="w-full accent-[#5865f2] h-1.5 bg-[#35373c] rounded-lg cursor-pointer"
                  title="Volume de {p.displayName}: {userVol}%"
                />
                <span class="text-[11px] font-mono text-[#949ba4] w-8 text-right shrink-0">
                  {userVol}%
                </span>
              </div>
            {:else}
              <div class="text-xs text-[#949ba4] flex items-center space-x-1 py-1">
                {#if appState.voiceState.isMuted}
                  <span class="text-[#f23f43] flex items-center gap-1 font-medium"><MicOff class="w-3.5 h-3.5" /> Mutado</span>
                {:else}
                  <span class="text-[#23a55a] font-medium">● Microfone Ativo</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if isConnectedToThis}
    <div class="h-16 bg-[#2b2d31] border-t border-[#1f2023] px-6 flex items-center justify-center space-x-3 shrink-0">
      <button
        onclick={() => clientService.toggleMute()}
        class="w-11 h-11 rounded-xl flex items-center justify-center transition-all text-white shadow cursor-pointer active:scale-95"
        class:bg-[#f23f43]={appState.voiceState.isMuted}
        class:bg-[#3b3e45]={!appState.voiceState.isMuted}
        class:hover:bg-[#474b53]={!appState.voiceState.isMuted}
        title={appState.voiceState.isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
      >
        {#if appState.voiceState.isMuted}
          <MicOff class="w-5 h-5" />
        {:else}
          <Mic class="w-5 h-5" />
        {/if}
      </button>

      <button
        onclick={() => clientService.toggleDeafen()}
        class="w-11 h-11 rounded-xl flex items-center justify-center transition-all text-white shadow cursor-pointer active:scale-95"
        class:bg-[#f23f43]={appState.voiceState.isDeafened}
        class:bg-[#3b3e45]={!appState.voiceState.isDeafened}
        class:hover:bg-[#474b53]={!appState.voiceState.isDeafened}
        title={appState.voiceState.isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
      >
        <Headphones class="w-5 h-5" />
      </button>

      <button
        onclick={() => clientService.toggleScreenShare()}
        class="w-11 h-11 rounded-xl flex items-center justify-center transition-all text-white shadow cursor-pointer active:scale-95"
        class:bg-[#5865f2]={!isLocalSharing}
        class:hover:bg-[#4752c4]={!isLocalSharing}
        class:bg-[#f23f43]={isLocalSharing}
        class:hover:bg-[#d83a3e]={isLocalSharing}
        title={isLocalSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
      >
        {#if isLocalSharing}
          <MonitorOff class="w-5 h-5" />
        {:else}
          <Monitor class="w-5 h-5" />
        {/if}
      </button>

      <button
        onclick={() => (appState.activeModal = 'settings')}
        class="w-11 h-11 rounded-xl bg-[#3b3e45] hover:bg-[#474b53] flex items-center justify-center transition-all text-white shadow cursor-pointer active:scale-95"
        title="Configurações de Voz e Microfone"
      >
        <Settings class="w-5 h-5" />
      </button>

      <button
        onclick={() => clientService.leaveVoiceChannel()}
        class="w-11 h-11 rounded-xl bg-[#f23f43] hover:bg-[#d83a3e] flex items-center justify-center transition-all text-white shadow cursor-pointer active:scale-95"
        title="Desconectar da Chamada"
      >
        <PhoneOff class="w-5 h-5" />
      </button>
    </div>
  {/if}
</div>
