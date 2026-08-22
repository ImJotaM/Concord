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
    Users,
    Signal,
  } from '@lucide/svelte';
  import { getAvatarUrl } from '../utils/icons8';

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

<div class="flex-1 bg-[#111214] flex flex-col h-full overflow-hidden select-none relative font-sans">
  <!-- Voice Room Top Header -->
  <header class="h-12 border-b border-[#1f2023] px-4 flex items-center justify-between bg-[#1e1f22]/90 backdrop-blur shrink-0 z-20">
    <div class="flex items-center space-x-2.5">
      <Volume2 class="w-5 h-5 text-[#23a55a]" />
      <h2 class="text-white font-bold text-base tracking-wide truncate">{channel?.name || 'Canal de Voz'}</h2>
      
      <div class="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-[#23a55a]/10 border border-[#23a55a]/20 text-[#23a55a] text-[11px] font-semibold">
        <Signal class="w-3 h-3 text-[#23a55a]" />
        <span>LAN &lt;5ms</span>
      </div>

      {#if activeSpotlight}
        <span class="text-[11px] bg-[#f23f43]/15 text-[#f23f43] border border-[#f23f43]/30 px-2 py-0.5 rounded-full flex items-center space-x-1 font-bold animate-pulse">
          <Radio class="w-3 h-3" />
          <span>TRANSMISSÃO AO VIVO</span>
        </span>
      {/if}
    </div>

    <div class="flex items-center space-x-2">
      <div class="flex items-center space-x-1 text-xs text-[#949ba4] font-medium mr-2">
        <Users class="w-4 h-4 text-[#80848e]" />
        <span>{participants.length}</span>
      </div>

      {#if !isConnectedToThis}
        <button
          onclick={() => clientService.joinVoiceChannel(channelId)}
          class="bg-[#23a55a] hover:bg-[#1f934f] text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shadow-lg active:scale-95 cursor-pointer"
        >
          <Volume2 class="w-4 h-4" />
          <span>Conectar na Sala</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- Autoplay Alert if browser blocks audio -->
  {#if appState.voiceState.autoplayBlocked}
    <div class="bg-[#f23f43] text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-lg z-30 animate-in slide-in-from-top-2">
      <div class="flex items-center space-x-2">
        <Volume2 class="w-5 h-5" />
        <span class="text-xs font-bold">O navegador bloqueou a reprodução automática de voz. Clique para ativar.</span>
      </div>
      <button
        onclick={unlockAudioAll}
        class="bg-white text-[#f23f43] hover:bg-gray-100 px-3.5 py-1 rounded-md text-xs font-bold transition-colors shadow cursor-pointer"
      >
        Ativar Áudio
      </button>
    </div>
  {/if}

  <!-- Main Stage Workspace -->
  <div class="flex-1 p-6 overflow-y-auto flex flex-col items-center justify-center relative z-10 pb-28">
    {#if participants.length === 0}
      <!-- Empty Call State -->
      <div class="text-center py-16 space-y-4 max-w-sm mx-auto">
        <div class="w-24 h-24 rounded-full bg-[#1e1f22] border-2 border-[#2b2d31] flex items-center justify-center mx-auto text-[#5865f2] shadow-2xl">
          <Volume2 class="w-12 h-12 text-[#4e5058]" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-white mb-1">Ninguém está nesta sala de voz</h3>
          <p class="text-xs text-[#949ba4] leading-relaxed">
            Conecte-se para conversar em tempo real com baixa latência e compartilhar sua tela na rede local.
          </p>
        </div>
        {#if !isConnectedToThis}
          <button
            onclick={() => clientService.joinVoiceChannel(channelId)}
            class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-xl hover:shadow-[#5865f2]/30 active:scale-95 cursor-pointer inline-flex items-center space-x-2"
          >
            <Volume2 class="w-4 h-4" />
            <span>Entrar no Canal de Voz</span>
          </button>
        {/if}
      </div>
    {:else if activeSpotlight}
      <!-- 1. SPOTLIGHT THEATER MODE (Screen Share Stage) -->
      <div class="w-full max-w-6xl space-y-4 flex flex-col items-center">
        <div
          bind:this={stageContainer}
          class="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#1f2023] flex items-center justify-center group"
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

          <!-- Stage Top Floating Controls -->
          <div class="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <div class="flex items-center space-x-2.5">
              <span class="inline-flex items-center gap-1.5 rounded-md bg-[#f23f43] px-2.5 py-1 text-xs font-bold text-white shadow-md">
                <Tv class="w-3.5 h-3.5" />
                <span>AO VIVO</span>
              </span>
              <span class="text-sm font-bold text-white drop-shadow-md">{activeSpotlight.title}</span>
            </div>

            <button
              onclick={toggleFullScreen}
              class="p-2 rounded-xl bg-black/60 hover:bg-black/90 text-white transition-all cursor-pointer backdrop-blur shadow"
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

        <!-- Participants Filmstrip Under Screen Share -->
        <div class="flex flex-wrap items-center justify-center gap-3 w-full max-w-6xl pt-2">
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
              type="button"
              onclick={() => {
                if (hasScreen) {
                  selectedScreenId = isLocal ? 'local' : (remoteScreensList.find((s) => s.userId === p.userId || (p.peerId && s.peerId === p.peerId))?.peerId || null);
                }
              }}
              class="bg-[#2b2d31] hover:bg-[#35373c] px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 border-2 transition-all cursor-pointer text-left shadow-md"
              class:border-[#23a55a]={isSpeaking}
              class:border-[#5865f2]={isSelected}
              class:border-transparent={!isSpeaking && !isSelected}
            >
              <div class="w-10 h-10 rounded-full bg-[#16171a] flex items-center justify-center p-1 ring-2 ring-transparent transition-all border border-[#232428]/40 overflow-hidden" class:ring-[#23a55a]={isSpeaking}>
                <img src={getAvatarUrl(p.avatar)} alt={p.displayName} class="w-full h-full object-contain" />
              </div>
              <div class="truncate max-w-[130px]">
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
      </div>
    {:else}
      <!-- 2. DISCORD GRID TILES (Full Responsive Voice Call Grid) -->
      <div class="flex flex-wrap items-center justify-center gap-4 w-full max-w-6xl mx-auto">
        {#each participants as p (p.userId)}
          {@const isLocal = p.userId === appState.currentUser.id}
          {@const isSpeaking = isLocal ? appState.voiceState.isSpeaking : p.isSpeaking}
          {@const remoteStream = !isLocal ? ((p.peerId && appState.voiceState.remoteAudioStreams[p.peerId]) || appState.voiceState.remoteAudioStreams[p.userId] || null) : null}
          {@const userVol = clientService.getUserVolume(p.userId)}

          {#if !isLocal}
            <audio use:attachAudio={{ stream: remoteStream, volume: userVol }} autoplay playsinline class="hidden"></audio>
          {/if}

          <!-- Participant Discord Tile with proportional 16:9 responsive sizing -->
          <div
            class="bg-[#16171a] rounded-2xl relative overflow-hidden shadow-2xl border-2 transition-all flex flex-col items-center justify-center aspect-video group
            {participants.length === 1 ? 'w-full max-w-2xl min-h-[260px]' : participants.length === 2 ? 'w-full md:w-[calc(50%-0.5rem)] max-w-xl min-h-[220px]' : participants.length === 3 ? 'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] max-w-md min-h-[190px]' : participants.length === 4 ? 'w-full sm:w-[calc(50%-0.5rem)] max-w-md min-h-[190px]' : 'w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] max-w-md min-h-[170px]'}"
            class:border-[#23a55a]={isSpeaking}
            class:border-[#232428]={!isSpeaking}
            class:shadow-[0_0_30px_rgba(35,165,90,0.35)]={isSpeaking}
          >
            <!-- Background Ambient Glow when speaking -->
            {#if isSpeaking}
              <div class="absolute inset-0 bg-[#23a55a]/5 pointer-events-none transition-opacity"></div>
            {/if}

            <!-- Discrete Volume Slider at TOP-RIGHT on Hover for Remote Users (never collides with bottom badge) -->
            {#if !isLocal}
              <div class="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity bg-[#111214]/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg flex items-center space-x-2 border border-black/40 shadow-lg z-20">
                {#if userVol === 0}
                  <VolumeX class="w-3.5 h-3.5 text-[#f23f43] shrink-0" />
                {:else}
                  <Volume2 class="w-3.5 h-3.5 text-[#949ba4] shrink-0" />
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
                  class="w-16 accent-[#5865f2] h-1.5 bg-[#232428] rounded-lg cursor-pointer"
                  title="Volume de {p.displayName}: {userVol}%"
                />
                <span class="text-[10px] font-mono text-[#949ba4] w-6 text-right">
                  {userVol}%
                </span>
              </div>
            {/if}

            <!-- Center Large Responsive Avatar -->
            <div class="relative flex flex-col items-center justify-center z-10 my-auto">
              <div
                class="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-[#111214] flex items-center justify-center p-3 sm:p-4 shadow-2xl ring-4 transition-all duration-150 select-none border border-[#232428] overflow-hidden"
                class:ring-[#23a55a]={isSpeaking}
                class:ring-[#1e1f22]={!isSpeaking}
                class:scale-105={isSpeaking}
              >
                <img src={getAvatarUrl(p.avatar)} alt={p.displayName} class="w-full h-full object-contain" />
              </div>
            </div>

            <!-- Bottom Left Name Badge Overlay (Discord Style) -->
            <div class="absolute bottom-2.5 left-2.5 bg-[#111214]/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 border border-black/40 shadow-md z-20 max-w-[calc(100%-1.25rem)]">
              <span class="text-xs font-bold text-white truncate">
                {p.displayName}
                {#if isLocal}
                  <span class="text-[#949ba4] font-normal"> (Você)</span>
                {/if}
              </span>

              {#if isLocal && appState.voiceState.isMuted}
                <MicOff class="w-3.5 h-3.5 text-[#f23f43] shrink-0" />
              {:else if isSpeaking}
                <span class="w-2 h-2 rounded-full bg-[#23a55a] shrink-0 animate-pulse"></span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- FLOATING BOTTOM DISCORD CALL CONTROL DOCK -->
  {#if isConnectedToThis}
    <div class="absolute bottom-6 inset-x-0 flex justify-center z-30 pointer-events-none">
      <div class="bg-[#1e1f22]/95 backdrop-blur-lg border border-[#2b2d31] px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3.5 pointer-events-auto">
        <!-- Microphone Button -->
        <button
          onclick={() => clientService.toggleMute()}
          class="w-12 h-12 rounded-full flex items-center justify-center transition-all text-white shadow-lg cursor-pointer active:scale-95 {appState.voiceState.isMuted ? 'bg-[#f23f43] hover:bg-[#da373c]' : 'bg-[#313338] hover:bg-[#3b3e45]'}"
          title={appState.voiceState.isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
        >
          {#if appState.voiceState.isMuted}
            <MicOff class="w-5 h-5" />
          {:else}
            <Mic class="w-5 h-5" />
          {/if}
        </button>

        <!-- Headphones / Deafen Button -->
        <button
          onclick={() => clientService.toggleDeafen()}
          class="w-12 h-12 rounded-full flex items-center justify-center transition-all text-white shadow-lg cursor-pointer active:scale-95 {appState.voiceState.isDeafened ? 'bg-[#f23f43] hover:bg-[#da373c]' : 'bg-[#313338] hover:bg-[#3b3e45]'}"
          title={appState.voiceState.isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
        >
          <Headphones class="w-5 h-5" />
        </button>

        <!-- Screen Share Button -->
        <button
          onclick={() => clientService.toggleScreenShare()}
          class="w-12 h-12 rounded-full flex items-center justify-center transition-all text-white shadow-lg cursor-pointer active:scale-95 {isLocalSharing ? 'bg-[#23a55a] hover:bg-[#1f934f]' : 'bg-[#313338] hover:bg-[#3b3e45]'}"
          title={isLocalSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
        >
          {#if isLocalSharing}
            <MonitorOff class="w-5 h-5" />
          {:else}
            <Monitor class="w-5 h-5" />
          {/if}
        </button>

        <!-- Settings Modal Button -->
        <button
          onclick={() => (appState.activeModal = 'settings')}
          class="w-12 h-12 rounded-full bg-[#313338] hover:bg-[#3b3e45] flex items-center justify-center transition-all text-white shadow-lg cursor-pointer active:scale-95"
          title="Configurações de Áudio e Microfone"
        >
          <Settings class="w-5 h-5" />
        </button>

        <div class="w-[1px] h-6 bg-[#35373c] mx-1"></div>

        <!-- Disconnect Call Button -->
        <button
          onclick={() => clientService.leaveVoiceChannel()}
          class="h-12 px-5 rounded-full bg-[#f23f43] hover:bg-[#da373c] flex items-center space-x-2 transition-all text-white font-bold text-xs shadow-lg shadow-[#f23f43]/30 cursor-pointer active:scale-95"
          title="Desconectar da Chamada"
        >
          <PhoneOff class="w-5 h-5" />
          <span>Desconectar</span>
        </button>
      </div>
    </div>
  {/if}
</div>
