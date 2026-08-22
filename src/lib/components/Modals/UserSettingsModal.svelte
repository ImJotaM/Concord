<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { WebRtcVoiceEngine } from '../../webrtc/voiceEngine';
  import {
    X,
    Mic,
    MicOff,
    Volume2,
    Shield,
    User,
    Laptop,
    Sliders,
    Monitor,
    Tv,
    Radio,
    Check,
    RefreshCw,
    Sparkles,
  } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';
  import { AVATAR_OPTIONS, getAvatarUrl } from '../../utils/icons8';

  let activeTab = $state<'profile' | 'voice' | 'screenshare'>('profile');

  // Profile fields
  let displayName = $state(appState.currentUser.displayName);
  let username = $state(appState.currentUser.username);
  let customStatus = $state(appState.currentUser.customStatus || '');
  let avatar = $state(appState.currentUser.avatar || 'user');
  let status = $state(appState.currentUser.status || 'online');

  // Audio Devices & Settings
  let inputDevices = $state<MediaDeviceInfo[]>([]);
  let outputDevices = $state<MediaDeviceInfo[]>([]);
  let selectedInputId = $state(appState.audioSettings.inputDeviceId || 'default');
  let selectedOutputId = $state(appState.audioSettings.outputDeviceId || 'default');
  let echoCancellation = $state(appState.audioSettings.echoCancellation ?? true);
  let noiseSuppression = $state(appState.audioSettings.noiseSuppression ?? true);
  let autoGainControl = $state(appState.audioSettings.autoGainControl ?? true);
  let sensitivity = $state(appState.audioSettings.sensitivity ?? 75);

  // Live Mic Test
  let isTestingMic = $state(false);
  let testAudioLevel = $state(0);
  let testStream: MediaStream | null = null;
  let testAudioCtx: AudioContext | null = null;
  let testAnimId: number | null = null;

  onMount(async () => {
    await loadDevices();
  });

  onDestroy(() => {
    stopMicTest();
  });

  async function loadDevices() {
    const { inputs, outputs } = await WebRtcVoiceEngine.getAudioDevices();
    inputDevices = inputs;
    outputDevices = outputs;
  }

  async function startMicTest() {
    stopMicTest();
    try {
      isTestingMic = true;
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      };
      if (selectedInputId && selectedInputId !== 'default') {
        audioConstraints.deviceId = { exact: selectedInputId };
      }

      testStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      testAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = testAudioCtx.createMediaStreamSource(testStream);
      const analyser = testAudioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        testAudioLevel = Math.min(100, Math.round((avg / 128) * 100));
        testAnimId = requestAnimationFrame(update);
      };

      testAnimId = requestAnimationFrame(update);
    } catch (e) {
      console.warn('Could not run mic test:', e);
      isTestingMic = false;
    }
  }

  function stopMicTest() {
    isTestingMic = false;
    testAudioLevel = 0;
    if (testAnimId) {
      cancelAnimationFrame(testAnimId);
      testAnimId = null;
    }
    if (testAudioCtx) {
      testAudioCtx.close();
      testAudioCtx = null;
    }
    if (testStream) {
      testStream.getTracks().forEach((t) => t.stop());
      testStream = null;
    }
  }

  async function handleInputDeviceChange(deviceId: string) {
    selectedInputId = deviceId;
    await clientService.switchMicrophone(deviceId);
    if (isTestingMic) {
      await startMicTest();
    }
  }

  async function handleOutputDeviceChange(deviceId: string) {
    selectedOutputId = deviceId;
    await clientService.setAudioOutput(deviceId);
  }

  function handleSave() {
    stopMicTest();

    // 1. Save Profile
    appState.setUser({
      displayName: displayName.trim() || appState.currentUser.username,
      username: username.trim() || appState.currentUser.username,
      customStatus: customStatus.trim(),
      avatar,
      status,
    });

    clientService.send('update_presence', {
      status,
      customStatus: customStatus.trim(),
    });

    // 2. Save Audio Settings
    clientService.updateAudioSettings({
      inputDeviceId: selectedInputId,
      outputDeviceId: selectedOutputId,
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      sensitivity,
    });

    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-2xl rounded-2xl shadow-2xl border border-[#1f2023] overflow-hidden flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023] shrink-0">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center">
          <Sliders class="w-4 h-4" />
        </div>
        <div>
          <h3 class="font-bold text-white text-base leading-tight">Configurações do Usuário</h3>
          <p class="text-[11px] text-[#949ba4]">Personalize seu perfil, dispositivos de áudio e transmissão</p>
        </div>
      </div>
      <button
        onclick={() => {
          stopMicTest();
          appState.activeModal = null;
        }}
        class="text-[#949ba4] hover:text-white p-1.5 rounded-lg hover:bg-[#35373c] transition-colors"
        title="Fechar"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Tab Bar -->
    <div class="bg-[#2b2d31] px-4 flex space-x-2 border-b border-[#1f2023] shrink-0">
      <button
        onclick={() => (activeTab = 'profile')}
        class="py-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-2"
        class:border-[#5865f2]={activeTab === 'profile'}
        class:text-white={activeTab === 'profile'}
        class:border-transparent={activeTab !== 'profile'}
        class:text-[#949ba4]={activeTab !== 'profile'}
      >
        <User class="w-3.5 h-3.5" />
        <span>Perfil do Usuário</span>
      </button>

      <button
        onclick={() => {
          activeTab = 'voice';
          loadDevices();
        }}
        class="py-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-2"
        class:border-[#5865f2]={activeTab === 'voice'}
        class:text-white={activeTab === 'voice'}
        class:border-transparent={activeTab !== 'voice'}
        class:text-[#949ba4]={activeTab !== 'voice'}
      >
        <Mic class="w-3.5 h-3.5" />
        <span>Voz & Microfone</span>
      </button>

      <button
        onclick={() => (activeTab = 'screenshare')}
        class="py-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-2"
        class:border-[#5865f2]={activeTab === 'screenshare'}
        class:text-white={activeTab === 'screenshare'}
        class:border-transparent={activeTab !== 'screenshare'}
        class:text-[#949ba4]={activeTab !== 'screenshare'}
      >
        <Monitor class="w-3.5 h-3.5" />
        <span>Transmissão & Tela</span>
      </button>
    </div>

    <!-- Body (Scrollable) -->
    <div class="p-6 space-y-6 overflow-y-auto flex-1">
      {#if activeTab === 'profile'}
        <!-- 1. PROFILE TAB -->
        <div class="space-y-5">
          <!-- Profile Preview Card -->
          <div class="bg-[#16171a] p-4 rounded-2xl flex items-center space-x-4 border border-[#232428] shadow-inner">
            <div class="w-16 h-16 rounded-2xl bg-[#0e0f10] flex items-center justify-center p-2 shadow ring-2 ring-[#5865f2]/40 border border-[#232428]">
              <img src={getAvatarUrl(avatar)} alt="Avatar" class="w-full h-full object-contain" />
            </div>
            <div class="flex-1 truncate">
              <div class="text-white font-bold text-base truncate">{displayName || 'Seu Nome'}</div>
              <div class="text-[#949ba4] text-xs font-mono">@{username || appState.currentUser.username}</div>
              {#if customStatus}
                <div class="text-[#dbdee1] text-xs mt-1 italic truncate">"{customStatus}"</div>
              {/if}
            </div>
            <div class="text-right">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
                <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
                {status.toUpperCase()}
              </span>
            </div>
          </div>

          <!-- Avatar Picker -->
          <div>
            <span class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
              Escolha seu Avatar (Icons8)
            </span>
            <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {#each AVATAR_OPTIONS as opt}
                <button
                  type="button"
                  onclick={() => (avatar = opt.key)}
                  class="flex flex-col items-center justify-center p-2 rounded-xl bg-[#16171a] hover:bg-[#1e1f22] border border-[#232428] transition-all cursor-pointer group"
                  class:!border-[#5865f2]={avatar === opt.key || avatar === opt.url}
                  class:!bg-[#1e1f22]={avatar === opt.key || avatar === opt.url}
                  class:ring-2={avatar === opt.key || avatar === opt.url}
                  class:ring-[#5865f2]={avatar === opt.key || avatar === opt.url}
                  title={opt.name}
                >
                  <img
                    src={opt.url}
                    alt={opt.name}
                    class="w-8 h-8 object-contain group-hover:scale-110 transition-transform"
                    loading="lazy"
                  />
                  <span class="text-[9px] font-medium text-[#949ba4] mt-1 truncate max-w-full">{opt.name}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Display Name & Username -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
                Nome de Exibição
              </label>
              <input
                type="text"
                bind:value={displayName}
                class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5865f2] border border-[#1f2023]"
                placeholder="Ex: Gabriel LAN Master"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
                Identificador (@Username)
              </label>
              <input
                type="text"
                bind:value={username}
                class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5865f2] border border-[#1f2023]"
                placeholder="Ex: gabriel_lan"
              />
            </div>
          </div>

          <!-- Custom Status -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
              Frase de Status Personalizada
            </label>
            <input
              type="text"
              bind:value={customStatus}
              placeholder="Ex: Jogando CS2 na LAN / Ouvindo música"
              class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5865f2] border border-[#1f2023]"
            />
          </div>

          <!-- Status Selector -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
              Status Online
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                onclick={() => (status = 'online')}
                class="p-2.5 rounded-xl bg-[#2b2d31] hover:bg-[#35373c] border flex items-center justify-center space-x-2 text-xs font-bold transition-all cursor-pointer"
                class:border-[#23a55a]={status === 'online'}
                class:border-transparent={status !== 'online'}
              >
                <span class="w-2.5 h-2.5 rounded-full bg-[#23a55a]"></span>
                <span class="text-white">Online</span>
              </button>

              <button
                type="button"
                onclick={() => (status = 'idle')}
                class="p-2.5 rounded-xl bg-[#2b2d31] hover:bg-[#35373c] border flex items-center justify-center space-x-2 text-xs font-bold transition-all cursor-pointer"
                class:border-[#f0b232]={status === 'idle'}
                class:border-transparent={status !== 'idle'}
              >
                <span class="w-2.5 h-2.5 rounded-full bg-[#f0b232]"></span>
                <span class="text-white">Ausente</span>
              </button>

              <button
                type="button"
                onclick={() => (status = 'dnd')}
                class="p-2.5 rounded-xl bg-[#2b2d31] hover:bg-[#35373c] border flex items-center justify-center space-x-2 text-xs font-bold transition-all cursor-pointer"
                class:border-[#f23f43]={status === 'dnd'}
                class:border-transparent={status !== 'dnd'}
              >
                <span class="w-2.5 h-2.5 rounded-full bg-[#f23f43]"></span>
                <span class="text-white">Não Perturbe</span>
              </button>
            </div>
          </div>
        </div>

      {:else if activeTab === 'voice'}
        <!-- 2. VOICE & MICROPHONE TAB -->
        <div class="space-y-5">
          <!-- Device Selectors -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Input Device (Microphone) -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
                  Dispositivo de Entrada (Microfone)
                </label>
                <button onclick={loadDevices} class="text-[#5865f2] hover:text-[#4752c4] text-[11px] flex items-center space-x-1" title="Atualizar lista">
                  <RefreshCw class="w-3 h-3" />
                  <span>Atualizar</span>
                </button>
              </div>
              <select
                value={selectedInputId}
                onchange={(e) => handleInputDeviceChange((e.target as HTMLSelectElement).value)}
                class="w-full bg-[#1e1f22] text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5865f2] border border-[#1f2023] cursor-pointer"
              >
                <option value="default">Microfone Padrão do Sistema</option>
                {#each inputDevices as dev}
                  <option value={dev.deviceId}>{dev.label || `Microfone (${dev.deviceId.slice(0, 8)})`}</option>
                {/each}
              </select>
            </div>

            <!-- Output Device (Speaker/Headphone) -->
            <div>
              <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
                Dispositivo de Saída (Fone / Caixa)
              </label>
              <select
                value={selectedOutputId}
                onchange={(e) => handleOutputDeviceChange((e.target as HTMLSelectElement).value)}
                class="w-full bg-[#1e1f22] text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5865f2] border border-[#1f2023] cursor-pointer"
              >
                <option value="default">Alto-falante Padrão do Sistema</option>
                {#each outputDevices as dev}
                  <option value={dev.deviceId}>{dev.label || `Alto-falante (${dev.deviceId.slice(0, 8)})`}</option>
                {/each}
              </select>
            </div>
          </div>

          <!-- Live Mic Test Box -->
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-3 shadow-inner">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                <Mic class="w-4 h-4 text-[#5865f2]" />
                <span>Teste do Microfone</span>
              </span>
              {#if isTestingMic}
                <button
                  onclick={stopMicTest}
                  class="bg-[#f23f43] hover:bg-[#d83a3e] text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow"
                >
                  Parar Teste
                </button>
              {:else}
                <button
                  onclick={startMicTest}
                  class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow"
                >
                  Testar Microfone
                </button>
              {/if}
            </div>

            <!-- Live Level Bar -->
            <div class="space-y-1.5 pt-1">
              <div class="flex justify-between text-xs text-[#949ba4]">
                <span>Nível de Captação em Tempo Real:</span>
                <span class="font-mono text-emerald-400 font-bold">{testAudioLevel}%</span>
              </div>
              <div class="w-full bg-[#2b2d31] h-3.5 rounded-full overflow-hidden p-0.5 border border-[#35373c]">
                <div
                  class="h-full bg-gradient-to-r from-[#23a55a] via-[#5865f2] to-[#f0b232] rounded-full transition-all duration-75"
                  style={`width: ${testAudioLevel}%`}
                ></div>
              </div>
              <p class="text-[11px] text-[#949ba4]">
                {isTestingMic ? '🎙️ Fale algo para ver a barra se mover!' : 'Clique em "Testar Microfone" para verificar se a sua voz está sendo captada.'}
              </p>
            </div>
          </div>

          <!-- Sensitivity Slider -->
          <div>
            <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
              <span>Sensibilidade de Ativação por Voz</span>
              <span class="text-white font-mono">{sensitivity}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              bind:value={sensitivity}
              class="w-full accent-[#5865f2] cursor-pointer"
            />
            <p class="text-[11px] text-[#949ba4] mt-1">
              Ajuste para filtrar ruídos de fundo como teclado e respiração.
            </p>
          </div>

          <!-- Audio Filters Toggles -->
          <div class="space-y-2.5 pt-2 border-t border-[#1f2023]">
            <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4] block">
              Processamento Avançado de Voz
            </span>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white">Cancelamento de Eco</div>
                <div class="text-[11px] text-[#949ba4]">Impede que o som dos alto-falantes volte para a chamada</div>
              </div>
              <input type="checkbox" bind:checked={echoCancellation} class="w-4 h-4 accent-[#5865f2]" />
            </label>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white">Supressão de Ruído de Fundo</div>
                <div class="text-[11px] text-[#949ba4]">Reduz barulho de ventilador, digitação e ruídos da sala</div>
              </div>
              <input type="checkbox" bind:checked={noiseSuppression} class="w-4 h-4 accent-[#5865f2]" />
            </label>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white">Controle Automático de Ganho (AGC)</div>
                <div class="text-[11px] text-[#949ba4]">Nivela o volume para que sua voz não fique nem muito baixa nem estourada</div>
              </div>
              <input type="checkbox" bind:checked={autoGainControl} class="w-4 h-4 accent-[#5865f2]" />
            </label>
          </div>
        </div>

      {:else if activeTab === 'screenshare'}
        <!-- 3. SCREEN SHARE TAB -->
        <div class="space-y-4">
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-2.5">
            <div class="flex items-center space-x-2 text-white font-bold text-sm">
              <Monitor class="w-4 h-4 text-[#5865f2]" />
              <span>Transmissão de Tela P2P WebRTC</span>
            </div>
            <p class="text-xs text-[#949ba4] leading-relaxed">
              O Concord transmite vídeo e áudio de tela diretamente entre os dispositivos na sua rede local com taxa de até <strong>60 FPS</strong> e latência quase imperceptível (&lt;5ms).
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="bg-[#2b2d31] p-3.5 rounded-xl border border-[#1f2023] space-y-1">
              <div class="text-xs font-bold text-white">🎮 Compartilhar Jogos & Apps</div>
              <p class="text-[11px] text-[#949ba4]">Transmita telas de jogos, janelas de navegadores ou todo o seu monitor.</p>
            </div>

            <div class="bg-[#2b2d31] p-3.5 rounded-xl border border-[#1f2023] space-y-1">
              <div class="text-xs font-bold text-white">🔊 Áudio do Sistema</div>
              <p class="text-[11px] text-[#949ba4]">Envie o som do jogo ou do vídeo junto com a imagem.</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="p-4 bg-[#2b2d31] flex justify-end space-x-2 border-t border-[#1f2023] shrink-0">
      <button
        onclick={() => {
          stopMicTest();
          appState.activeModal = null;
        }}
        class="text-white hover:underline text-sm font-semibold px-4 py-2"
      >
        Cancelar
      </button>
      <button
        onclick={handleSave}
        class="bg-[#5865f2] hover:bg-[#4752c4] active:scale-95 text-white text-sm px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#5865f2]/25 cursor-pointer"
      >
        Salvar Alterações
      </button>
    </div>
  </div>
</div>

