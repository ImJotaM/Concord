<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { WebRtcVoiceEngine } from '../../webrtc/voiceEngine';
  import {
    X,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Play,
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
    CheckCircle,
    Bell,
    MessageSquare,
  } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';
  import { AVATAR_OPTIONS, getAvatarUrl } from '../../utils/icons8';
  import { soundService } from '../../services/soundService.svelte';
  import { notificationService } from '../../services/notificationService.svelte';
  import Avatar from '../Avatar.svelte';
  import { DISCORD_PALETTE } from '../../utils/avatar';

  let activeTab = $state<'profile' | 'voice' | 'sound' | 'screenshare'>('profile');

  // Profile fields
  let displayName = $state(appState.currentUser.displayName);
  let username = $state(appState.currentUser.username);
  let customStatus = $state(appState.currentUser.customStatus || '');
  let avatar = $state(appState.currentUser.avatar || '');
  let status = $state(appState.currentUser.status || 'online');

  // Screen Share Settings
  let screenResolution = $state(appState.screenShareSettings.resolution);
  let screenFps = $state(appState.screenShareSettings.frameRate);
  let screenQualityMode = $state(appState.screenShareSettings.qualityMode);
  let screenIncludeAudio = $state(appState.screenShareSettings.includeAudio);

  // Audio Devices & Settings
  let inputDevices = $state<MediaDeviceInfo[]>([]);
  let outputDevices = $state<MediaDeviceInfo[]>([]);
  let selectedInputId = $state(appState.audioSettings.inputDeviceId || 'default');
  let selectedOutputId = $state(appState.audioSettings.outputDeviceId || 'default');
  let echoCancellation = $state(appState.audioSettings.echoCancellation ?? true);
  let noiseSuppression = $state(appState.audioSettings.noiseSuppression ?? true);
  let autoGainControl = $state(appState.audioSettings.autoGainControl ?? true);
  let sensitivity = $state(appState.audioSettings.sensitivity ?? 75);

  // Live Mic Test & DSP
  let isTestingMic = $state(false);
  let isHearingSelf = $state(false);
  let isGateOpen = $state(false);
  let testAudioLevel = $state(0);
  let testStream: MediaStream | null = null;
  let testAudioCtx: AudioContext | null = null;
  let testHighPass: BiquadFilterNode | null = null;
  let testNotch: BiquadFilterNode | null = null;
  let testNoiseGate: GainNode | null = null;
  let testAgcCompressor: DynamicsCompressorNode | null = null;
  let testLoopbackGain: GainNode | null = null;
  let testAnalyser: AnalyserNode | null = null;
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
      const targetDevice = selectedInputId !== 'default' ? selectedInputId : undefined;

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
        channelCount: 1,
        sampleRate: 48000,
        ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
      };

      testStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      testAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      if (testAudioCtx.state === 'suspended') {
        testAudioCtx.resume().catch(() => {});
      }

      const source = testAudioCtx.createMediaStreamSource(testStream);

      // High-Pass Filter (85Hz) - removes low-end fan/rumble
      testHighPass = testAudioCtx.createBiquadFilter();
      testHighPass.type = 'highpass';
      testHighPass.frequency.setValueAtTime(noiseSuppression ? 85 : 10, testAudioCtx.currentTime);

      // Notch Filter (60Hz hum)
      testNotch = testAudioCtx.createBiquadFilter();
      testNotch.type = 'notch';
      testNotch.frequency.setValueAtTime(60, testAudioCtx.currentTime);
      testNotch.Q.setValueAtTime(4.0, testAudioCtx.currentTime);

      // Noise Gate Gain
      testNoiseGate = testAudioCtx.createGain();
      testNoiseGate.gain.setValueAtTime(1.0, testAudioCtx.currentTime);

      // AGC Dynamics Compressor
      testAgcCompressor = testAudioCtx.createDynamicsCompressor();
      if (autoGainControl) {
        testAgcCompressor.threshold.setValueAtTime(-24, testAudioCtx.currentTime);
        testAgcCompressor.knee.setValueAtTime(30, testAudioCtx.currentTime);
        testAgcCompressor.ratio.setValueAtTime(12, testAudioCtx.currentTime);
      } else {
        testAgcCompressor.threshold.setValueAtTime(0, testAudioCtx.currentTime);
        testAgcCompressor.ratio.setValueAtTime(1, testAudioCtx.currentTime);
      }
      testAgcCompressor.attack.setValueAtTime(0.003, testAudioCtx.currentTime);
      testAgcCompressor.release.setValueAtTime(0.25, testAudioCtx.currentTime);

      // Analyser
      testAnalyser = testAudioCtx.createAnalyser();
      testAnalyser.fftSize = 512;
      testAnalyser.smoothingTimeConstant = 0.3;

      // Loopback gain to user headphones
      testLoopbackGain = testAudioCtx.createGain();
      testLoopbackGain.gain.setValueAtTime(isHearingSelf ? 0.9 : 0.0, testAudioCtx.currentTime);

      // Connect DSP chain:
      // Source -> HighPass -> Notch -> NoiseGate -> AGC Compressor -> Loopback -> Destination
      source.connect(testHighPass);
      testHighPass.connect(testNotch);
      testNotch.connect(testNoiseGate);
      testNoiseGate.connect(testAgcCompressor);
      testAgcCompressor.connect(testLoopbackGain);
      testLoopbackGain.connect(testAudioCtx.destination);

      // Sidechain: Analyser listens directly to the filtered mic input (BEFORE the gate)
      // This ensures the voice detector can ALWAYS hear speech and open the noise gate!
      testNotch.connect(testAnalyser);

      // Route to selected output device (headphones/speaker) if supported
      if (selectedOutputId && selectedOutputId !== 'default' && typeof (testAudioCtx as any).setSinkId === 'function') {
        try {
          await (testAudioCtx as any).setSinkId(selectedOutputId);
        } catch (e) {}
      }

      const buffer = new Uint8Array(testAnalyser.frequencyBinCount);
      let speakingHoldFrames = 0;

      const update = () => {
        if (!testAnalyser) return;
        const now = testAudioCtx ? testAudioCtx.currentTime : 0;

        testAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        testAudioLevel = Math.min(100, Math.round((avg / 128) * 100));

        const useNoiseSuppression = noiseSuppression;
        const threshold = Math.max(4, (100 - sensitivity) * 0.45);
        const voiceDetected = testAudioLevel > threshold;

        if (useNoiseSuppression) {
          if (voiceDetected) {
            speakingHoldFrames = 15;
            if (testNoiseGate) {
              testNoiseGate.gain.setTargetAtTime(1.0, now, 0.005);
            }
          } else if (speakingHoldFrames > 0) {
            speakingHoldFrames--;
            if (testNoiseGate) {
              testNoiseGate.gain.setTargetAtTime(1.0, now, 0.01);
            }
          } else {
            if (testNoiseGate) {
              testNoiseGate.gain.setTargetAtTime(0.0001, now, 0.06);
            }
          }
        } else {
          if (testNoiseGate) {
            testNoiseGate.gain.setTargetAtTime(1.0, now, 0.01);
          }
        }

        isGateOpen = voiceDetected || speakingHoldFrames > 0 || !useNoiseSuppression;
        testAnimId = requestAnimationFrame(update);
      };

      testAnimId = requestAnimationFrame(update);
    } catch (e) {
      console.warn('Could not run mic test:', e);
      isTestingMic = false;
    }
  }

  async function toggleHearingSelf() {
    isHearingSelf = !isHearingSelf;
    if (testAudioCtx) {
      if (testAudioCtx.state === 'suspended') {
        try {
          await testAudioCtx.resume();
        } catch (e) {}
      }
      if (testLoopbackGain) {
        testLoopbackGain.gain.setValueAtTime(isHearingSelf ? 1.0 : 0.0, testAudioCtx.currentTime);
      }
    }
  }

  function updateTestDspNodes() {
    if (!testAudioCtx) return;
    const now = testAudioCtx.currentTime;

    if (testHighPass) {
      testHighPass.frequency.setTargetAtTime(noiseSuppression ? 85 : 10, now, 0.05);
    }
    if (testNoiseGate && !noiseSuppression) {
      testNoiseGate.gain.setTargetAtTime(1.0, now, 0.01);
    }
    if (testAgcCompressor) {
      if (autoGainControl) {
        testAgcCompressor.threshold.setTargetAtTime(-24, now, 0.05);
        testAgcCompressor.ratio.setTargetAtTime(12, now, 0.05);
      } else {
        testAgcCompressor.threshold.setTargetAtTime(0, now, 0.05);
        testAgcCompressor.ratio.setTargetAtTime(1, now, 0.05);
      }
    }
    if (testStream) {
      const track = testStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        const targetDevice = selectedInputId !== 'default' ? selectedInputId : undefined;
        track.applyConstraints({
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
        }).catch(console.warn);
      }
    }
  }

  function onSettingChanged() {
    clientService.updateAudioSettings({
      inputDeviceId: selectedInputId,
      outputDeviceId: selectedOutputId,
      echoCancellation,
      noiseSuppression,
      autoGainControl,
      sensitivity,
    });
    if (isTestingMic) {
      updateTestDspNodes();
    }
  }

  function stopMicTest() {
    isTestingMic = false;
    isHearingSelf = false;
    isGateOpen = false;
    testAudioLevel = 0;
    if (testAnimId) {
      cancelAnimationFrame(testAnimId);
      testAnimId = null;
    }
    if (testAudioCtx) {
      try {
        testAudioCtx.close();
      } catch (e) {}
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

    // 3. Save Screen Share Settings
    appState.updateScreenShareSettings({
      resolution: screenResolution,
      frameRate: screenFps,
      qualityMode: screenQualityMode,
      includeAudio: screenIncludeAudio,
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
        onclick={() => (activeTab = 'sound')}
        class="py-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-2 cursor-pointer"
        class:border-[#5865f2]={activeTab === 'sound'}
        class:text-white={activeTab === 'sound'}
        class:border-transparent={activeTab !== 'sound'}
        class:text-[#949ba4]={activeTab !== 'sound'}
      >
        <Radio class="w-3.5 h-3.5" />
        <span>Sons & Notificações</span>
      </button>

      <button
        onclick={() => (activeTab = 'screenshare')}
        class="py-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-2 cursor-pointer"
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
            <div class="rounded-2xl ring-2 ring-[#5865f2]/40 shadow-md overflow-hidden">
              <Avatar
                name={displayName || 'Usuário'}
                avatar={avatar}
                userId={appState.currentUser.id}
                size="xl"
                shape="rounded"
              />
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
            <div class="flex items-center justify-between mb-2">
              <span class="block text-xs font-bold uppercase tracking-wider text-[#949ba4]">
                Estilo do Avatar (Letras Iniciais Padrão Discord)
              </span>
              {#if avatar}
                <button
                  type="button"
                  onclick={() => (avatar = '')}
                  class="text-[11px] text-[#5865f2] hover:underline font-semibold cursor-pointer"
                >
                  Resetar para Letras Iniciais
                </button>
              {/if}
            </div>
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

          <!-- Live Mic Test Box with DSP Processing -->
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-3.5 shadow-inner">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Mic class="w-4 h-4 text-[#5865f2]" />
                  <span>Teste do Microfone (DSP Ativo)</span>
                </span>
                {#if isTestingMic}
                  {#if isGateOpen}
                    <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center space-x-1 animate-pulse">
                      <span>🟢</span>
                      <span>Voz Detectada (Portão Aberto)</span>
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 rounded-md bg-[#2b2d31] text-[#949ba4] text-[10px] font-bold border border-[#3b3e45] flex items-center space-x-1">
                      <span>🛡️</span>
                      <span>Ruído Filtrado (Portão Fechado)</span>
                    </span>
                  {/if}
                {/if}
              </div>

              <div class="flex items-center space-x-2">
                {#if isTestingMic}
                  <button
                    onclick={toggleHearingSelf}
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center space-x-1.5"
                    class:bg-[#5865f2]={isHearingSelf}
                    class:text-white={isHearingSelf}
                    class:border-[#5865f2]={isHearingSelf}
                    class:bg-[#2b2d31]={!isHearingSelf}
                    class:text-[#949ba4]={!isHearingSelf}
                    class:border-[#35373c]={!isHearingSelf}
                    title="Ouça o som processado pelo filtro no seu próprio fone"
                  >
                    <Volume2 class="w-3.5 h-3.5" />
                    <span>{isHearingSelf ? 'Ouvindo Retorno 🔊' : 'Ouvir Minha Voz 🎧'}</span>
                  </button>

                  <button
                    onclick={stopMicTest}
                    class="bg-[#f23f43] hover:bg-[#d83a3e] text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow"
                  >
                    Parar Teste
                  </button>
                {:else}
                  <button
                    onclick={startMicTest}
                    class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-3.5 py-1 rounded-lg text-xs font-bold transition-all shadow"
                  >
                    Testar Microfone
                  </button>
                {/if}
              </div>
            </div>

            <!-- Live Level Bar with Gate Threshold Marker -->
            <div class="space-y-1.5 pt-1">
              <div class="flex justify-between text-xs text-[#949ba4]">
                <span>Nível de Captação em Tempo Real:</span>
                <div class="flex items-center space-x-3">
                  <span class="text-[11px] text-[#949ba4]">Gatilho do Filtro: <b class="text-white">{Math.round(Math.max(6, (100 - sensitivity) * 0.4))}%</b></span>
                  <span class="font-mono text-emerald-400 font-bold">{testAudioLevel}%</span>
                </div>
              </div>
              <div class="relative w-full bg-[#2b2d31] h-4 rounded-full overflow-hidden p-0.5 border border-[#35373c]">
                <!-- Threshold Marker line -->
                <div
                  class="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10 opacity-80"
                  style={`left: ${Math.round(Math.max(6, (100 - sensitivity) * 0.4))}%`}
                  title="Linha de corte do ruído"
                ></div>
                <div
                  class="h-full bg-gradient-to-r from-[#23a55a] via-[#5865f2] to-[#f0b232] rounded-full transition-all duration-75"
                  style={`width: ${testAudioLevel}%`}
                ></div>
              </div>
              <p class="text-[11px] text-[#949ba4]">
                {isTestingMic
                  ? '🎙️ Fale ou digite no teclado para ver como a supressão de ruído corta barulhos abaixo da linha amarela!'
                  : 'Clique em "Testar Microfone" e ative "Ouvir Minha Voz" para escutar o cancelamento de ruído no seu fone.'}
              </p>
            </div>
          </div>

          <!-- Sensitivity Slider -->
          <div>
            <div class="flex justify-between text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
              <span>Sensibilidade de Ativação por Voz (Noise Gate)</span>
              <span class="text-white font-mono">{sensitivity}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              bind:value={sensitivity}
              oninput={onSettingChanged}
              class="w-full accent-[#5865f2] cursor-pointer"
            />
            <p class="text-[11px] text-[#949ba4] mt-1">
              Ajuste para filtrar ruídos de fundo como teclado, ventilador e respiração pesada.
            </p>
          </div>

          <!-- Audio Filters Toggles -->
          <div class="space-y-2.5 pt-2 border-t border-[#1f2023]">
            <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4] block">
              Processamento Avançado de Voz (DSP Ativo)
            </span>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Cancelamento de Eco</span>
                  <span class="text-[10px] px-1.5 py-0.2 bg-[#5865f2]/20 text-[#5865f2] font-semibold rounded">Hardware & WebRTC</span>
                </div>
                <div class="text-[11px] text-[#949ba4]">Impede que o som dos alto-falantes retorne para a chamada</div>
              </div>
              <input type="checkbox" bind:checked={echoCancellation} onchange={onSettingChanged} class="w-4 h-4 accent-[#5865f2]" />
            </label>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Supressão de Ruído de Fundo (Noise Gate + Filtro 85Hz)</span>
                  <span class="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 font-semibold rounded">DSP Ativo</span>
                </div>
                <div class="text-[11px] text-[#949ba4]">Elimina vibração de mesa, barulho de ventilador, respiração e digitação mecânica</div>
              </div>
              <input type="checkbox" bind:checked={noiseSuppression} onchange={onSettingChanged} class="w-4 h-4 accent-[#5865f2]" />
            </label>

            <label class="flex items-center justify-between p-3 rounded-xl bg-[#1e1f22] border border-[#1f2023] cursor-pointer hover:bg-[#232428] transition-colors">
              <div>
                <div class="text-xs font-bold text-white flex items-center space-x-1.5">
                  <span>Controle Automático de Ganho (AGC / Compressor de Estúdio)</span>
                  <span class="text-[10px] px-1.5 py-0.2 bg-purple-500/20 text-purple-400 font-semibold rounded">Limiter 12:1</span>
                </div>
                <div class="text-[11px] text-[#949ba4]">Nivela o volume para que sua voz fique clara mesmo falando baixo ou alto</div>
              </div>
              <input type="checkbox" bind:checked={autoGainControl} onchange={onSettingChanged} class="w-4 h-4 accent-[#5865f2]" />
            </label>
          </div>
        </div>

      {:else if activeTab === 'sound'}
        <!-- SOUND & NOTIFICATIONS TAB -->
        <div class="space-y-5">
          <!-- Master Toggle & Volume Slider Card -->
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-4 shadow-inner">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <Radio class="w-4 h-4 text-[#5865f2]" />
                  <span>Efeitos Sonoros do Aplicativo</span>
                </div>
                <div class="text-[11px] text-[#949ba4] mt-0.5">
                  Sons de mensagens, entrada/saída de chamada, microfone e soundboard
                </div>
              </div>

              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={soundService.enabled}
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-[#2b2d31] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5865f2]"></div>
              </label>
            </div>

            <!-- Volume Sliders -->
            <div class="space-y-4 pt-2 border-t border-[#2b2d31]">
              <!-- System Effects Volume -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-[#949ba4] font-medium flex items-center space-x-1.5">
                    <Volume2 class="w-3.5 h-3.5" />
                    <span>Volume dos Sons do Sistema (Notificações, Chimes)</span>
                  </span>
                  <span class="font-mono text-white font-bold">{soundService.volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  bind:value={soundService.volume}
                  class="w-full accent-[#5865f2] h-2 bg-[#2b2d31] rounded-lg cursor-pointer"
                />
              </div>

              <!-- Soundboard Memes Volume -->
              <div class="space-y-1.5 pt-2 border-t border-[#2b2d31]/50">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-[#949ba4] font-medium flex items-center space-x-1.5">
                    <Sparkles class="w-3.5 h-3.5 text-[#5865f2]" />
                    <span>Volume do Soundboard & Memes (MyInstants)</span>
                  </span>
                  <span class="font-mono text-white font-bold">{soundService.soundboardVolumePercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  bind:value={soundService.soundboardVolumePercent}
                  class="w-full accent-[#5865f2] h-2 bg-[#2b2d31] rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          <!-- Discord Notification Settings Panel -->
          <div class="bg-[#1e1f22] p-5 rounded-2xl border border-[#1f2023] space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-[#2b2d31]/50">
              <div class="flex items-center space-x-2">
                <Bell class="w-4 h-4 text-[#5865f2]" />
                <span class="text-xs font-bold uppercase tracking-wider text-white">Configurações de Notificações</span>
              </div>
              <button
                type="button"
                onclick={() => {
                  notificationService.notify({
                    title: 'Notificação de Teste',
                    subtitle: 'Concord App • LAN',
                    body: 'Tudo funcionando perfeitamente! As notificações visuais e sonoras estão ativas.',
                    playAudio: true,
                  });
                }}
                class="bg-[#5865f2]/20 hover:bg-[#5865f2] text-[#5865f2] hover:text-white px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center space-x-1.5"
              >
                <Bell class="w-3.5 h-3.5" />
                <span>Testar Notificação</span>
              </button>
            </div>

            <!-- Toggle: Sound Notifications -->
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-bold text-white">Sons de Notificação e Mensagens</div>
                <div class="text-[11px] text-[#949ba4]">Toca chimes sutis ao receber mensagens de texto e DMs</div>
              </div>
              <button
                type="button"
                onclick={() => {
                  appState.updateNotificationSettings({
                    enableSounds: !appState.notificationSettings.enableSounds,
                  });
                }}
                class="w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0"
                class:bg-[#23a55a]={appState.notificationSettings.enableSounds}
                class:bg-[#4e5058]={!appState.notificationSettings.enableSounds}
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                  class:translate-x-6={appState.notificationSettings.enableSounds}
                ></span>
              </button>
            </div>

            <!-- Toggle: In-App Toasts -->
            <div class="flex items-center justify-between pt-2 border-t border-[#2b2d31]/50">
              <div>
                <div class="text-xs font-bold text-white">Banners Visuais Flutuantes no App (Toasts)</div>
                <div class="text-[11px] text-[#949ba4]">Exibe popup no canto superior com avatar e prévia da mensagem</div>
              </div>
              <button
                type="button"
                onclick={() => {
                  appState.updateNotificationSettings({
                    enableInAppToast: !appState.notificationSettings.enableInAppToast,
                  });
                }}
                class="w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0"
                class:bg-[#23a55a]={appState.notificationSettings.enableInAppToast}
                class:bg-[#4e5058]={!appState.notificationSettings.enableInAppToast}
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                  class:translate-x-6={appState.notificationSettings.enableInAppToast}
                ></span>
              </button>
            </div>

            <!-- Toggle: Desktop Notifications -->
            <div class="flex items-center justify-between pt-2 border-t border-[#2b2d31]/50">
              <div>
                <div class="text-xs font-bold text-white">Notificações na Área de Trabalho (Desktop / OS)</div>
                <div class="text-[11px] text-[#949ba4]">Envia alerta do sistema quando o Concord estiver minimizado ou em segundo plano</div>
              </div>
              <button
                type="button"
                onclick={async () => {
                  if (!appState.notificationSettings.enableDesktop) {
                    await notificationService.requestDesktopPermission();
                  }
                  appState.updateNotificationSettings({
                    enableDesktop: !appState.notificationSettings.enableDesktop,
                  });
                }}
                class="w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0"
                class:bg-[#23a55a]={appState.notificationSettings.enableDesktop}
                class:bg-[#4e5058]={!appState.notificationSettings.enableDesktop}
              >
                <span
                  class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                  class:translate-x-6={appState.notificationSettings.enableDesktop}
                ></span>
              </button>
            </div>
          </div>

          <!-- Sound Tester Grid -->
          <div class="space-y-3">
            <div class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
              Testar Efeitos Sonoros do Sistema (0ms Latência)
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onclick={() => soundService.play('message-received')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#5865f2] transition-colors">
                    🔔 Mensagem Recebida
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Notificação harmônica dupla</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#5865f2] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>

              <button
                type="button"
                onclick={() => soundService.play('message-sent')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#5865f2] transition-colors">
                    📤 Mensagem Enviada
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Pop suave de envio</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#5865f2] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>

              <button
                type="button"
                onclick={() => soundService.play('join-channel')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#23a55a] transition-colors">
                    🟢 Entrar na Chamada
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Chime ascendente de 4 notas</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#23a55a] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>

              <button
                type="button"
                onclick={() => soundService.play('leave-channel')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#f23f43] transition-colors">
                    🔴 Sair da Chamada
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Chime descendente de saída</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#f23f43] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>

              <button
                type="button"
                onclick={() => soundService.play('mute')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#f0b232] transition-colors">
                    🎙️ Mutar Microfone
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Blip grave duplo</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#f0b232] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>

              <button
                type="button"
                onclick={() => soundService.play('unmute')}
                class="p-3 bg-[#1e1f22] hover:bg-[#282a2e] rounded-xl border border-[#1f2023] flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div>
                  <div class="text-xs font-bold text-white group-hover:text-[#23a55a] transition-colors">
                    🔊 Desmutar Microfone
                  </div>
                  <div class="text-[10px] text-[#949ba4]">Blip agudo duplo</div>
                </div>
                <div class="w-7 h-7 rounded-lg bg-[#2b2d31] flex items-center justify-center text-[#23a55a] group-hover:scale-110 transition-transform">
                  <Play class="w-3.5 h-3.5 fill-current" />
                </div>
              </button>
            </div>
          </div>
        </div>

      {:else if activeTab === 'screenshare'}
        <!-- 3. SCREEN SHARE TAB -->
        <div class="space-y-6">
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-2">
            <div class="flex items-center space-x-2 text-white font-bold text-sm">
              <Monitor class="w-4 h-4 text-[#5865f2]" />
              <span>Configurações de Transmissão de Tela (WebRTC LAN)</span>
            </div>
            <p class="text-xs text-[#949ba4] leading-relaxed">
              Ajuste a resolução, taxa de quadros e captura de áudio da sua transmissão de tela na rede local.
            </p>
          </div>

          <!-- 1. RESOLUÇÃO -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
                Resolução da Transmissão
              </span>
              <span class="text-[11px] text-[#5865f2] font-semibold">P2P Direto</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {#each [
                { id: '720p', label: '720p', sub: 'HD (1280x720)' },
                { id: '1080p', label: '1080p', sub: 'Full HD (Padrão)' },
                { id: '1440p', label: '1440p', sub: '2K Quad HD' },
                { id: 'source', label: 'Fonte', sub: 'Original do Monitor' },
              ] as opt}
                <button
                  type="button"
                  onclick={() => (screenResolution = opt.id as any)}
                  class="p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer text-center {screenResolution === opt.id ? 'bg-[#5865f2]/20 border-[#5865f2] text-white ring-1 ring-[#5865f2]' : 'bg-[#1e1f22] border-[#1f2023] text-[#949ba4] hover:border-[#35373c]'}"
                >
                  <span class="text-sm font-bold">{opt.label}</span>
                  <span class="text-[10px] opacity-80">{opt.sub}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 2. TAXA DE QUADROS (FPS) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
                Taxa de Quadros (FPS)
              </span>
              <span class="text-[11px] text-[#23a55a] font-semibold">60 FPS Suportado</span>
            </div>

            <div class="grid grid-cols-3 gap-2.5">
              {#each [
                { id: 15, label: '15 FPS', sub: 'Baixo Consumo' },
                { id: 30, label: '30 FPS', sub: 'Padrão Suave' },
                { id: 60, label: '60 FPS', sub: 'Ultra Fluido (Jogos)' },
              ] as opt}
                <button
                  type="button"
                  onclick={() => (screenFps = opt.id as any)}
                  class="p-3 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer text-center {screenFps === opt.id ? 'bg-[#5865f2]/20 border-[#5865f2] text-white ring-1 ring-[#5865f2]' : 'bg-[#1e1f22] border-[#1f2023] text-[#949ba4] hover:border-[#35373c]'}"
                >
                  <span class="text-sm font-bold">{opt.label}</span>
                  <span class="text-[10px] opacity-80">{opt.sub}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 3. MODO DE OTIMIZAÇÃO -->
          <div class="space-y-2">
            <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
              Modo de Otimização de Qualidade
            </span>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onclick={() => (screenQualityMode = 'smooth')}
                class="p-3.5 rounded-xl border flex items-center space-x-3 transition-all cursor-pointer text-left {screenQualityMode === 'smooth' ? 'bg-[#5865f2]/20 border-[#5865f2] text-white ring-1 ring-[#5865f2]' : 'bg-[#1e1f22] border-[#1f2023] text-[#949ba4]'}"
              >
                <div class="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center shrink-0 text-base">
                  🎮
                </div>
                <div>
                  <div class="text-xs font-bold text-white">Fluidez de Vídeo & Jogos</div>
                  <div class="text-[10px] text-[#949ba4]">Prioriza FPS elevado e reprodução sem engasgos</div>
                </div>
              </button>

              <button
                type="button"
                onclick={() => (screenQualityMode = 'detail')}
                class="p-3.5 rounded-xl border flex items-center space-x-3 transition-all cursor-pointer text-left {screenQualityMode === 'detail' ? 'bg-[#5865f2]/20 border-[#5865f2] text-white ring-1 ring-[#5865f2]' : 'bg-[#1e1f22] border-[#1f2023] text-[#949ba4]'}"
              >
                <div class="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center shrink-0 text-base">
                  📄
                </div>
                <div>
                  <div class="text-xs font-bold text-white">Nitidez de Texto & Leitura</div>
                  <div class="text-[10px] text-[#949ba4]">Mantém letras de código, docs e navegadores nítidas</div>
                </div>
              </button>
            </div>
          </div>

          <!-- 4. CAPTURA DE ÁUDIO -->
          <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] flex items-center justify-between">
            <div class="space-y-0.5 pr-4">
              <div class="text-xs font-bold text-white flex items-center space-x-1.5">
                <Volume2 class="w-4 h-4 text-[#5865f2]" />
                <span>Capturar e Transmitir Áudio do Sistema</span>
              </div>
              <p class="text-[11px] text-[#949ba4]">
                Envia o som do jogo, aba ou aplicativo junto com o vídeo para todos na chamada.
              </p>
            </div>

            <button
              type="button"
              onclick={() => (screenIncludeAudio = !screenIncludeAudio)}
              class="w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0"
              class:bg-[#23a55a]={screenIncludeAudio}
              class:bg-[#4e5058]={!screenIncludeAudio}
            >
              <div
                class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform"
                class:left-[26px]={screenIncludeAudio}
                class:left-[2px]={!screenIncludeAudio}
              ></div>
            </button>
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

