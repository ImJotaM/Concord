<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { checkMicrophonePermission } from '../../webrtc/voiceEngine';
  import {
    Mic,
    MicOff,
    ShieldAlert,
    ShieldCheck,
    Lock,
    ExternalLink,
    X,
    Check,
    Volume2,
    Copy,
    AlertTriangle,
    Sparkles,
    Radio,
  } from '@lucide/svelte';
  import { onMount, onDestroy } from 'svelte';

  let permState = $state<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  let isRequesting = $state(false);
  let audioLevel = $state(0);
  let errorMessage = $state<string | null>(null);
  let testStream: MediaStream | null = null;
  let animId: number | null = null;
  let audioCtx: AudioContext | null = null;
  let copiedFlag = $state(false);

  let isSecure = $derived(
    typeof window !== 'undefined'
      ? window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
      : true
  );

  let currentHost = $derived(
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : 'http://localhost:5173'
  );

  onMount(async () => {
    permState = await checkMicrophonePermission();
    if (permState === 'granted') {
      startLevelMeter();
    }
  });

  onDestroy(() => {
    cleanupMeter();
  });

  function cleanupMeter() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    if (testStream) {
      testStream.getTracks().forEach((t) => t.stop());
      testStream = null;
    }
  }

  async function startLevelMeter() {
    cleanupMeter();
    try {
      testStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(testStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        audioLevel = Math.min(100, Math.round((avg / 128) * 100));
        animId = requestAnimationFrame(update);
      };
      animId = requestAnimationFrame(update);
      permState = 'granted';
      errorMessage = null;
    } catch (err: any) {
      console.warn('Could not test microphone stream:', err);
    }
  }

  async function requestPermission() {
    isRequesting = true;
    errorMessage = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isRequesting = false;
      errorMessage =
        'Microphone is blocked by the browser on non-HTTPS LAN connections. Please see the Secure Context guide below.';
      permState = 'unsupported';
      return;
    }

    try {
      await startLevelMeter();
      permState = 'granted';
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        permState = 'denied';
        errorMessage = 'Microphone permission was denied in browser settings. Please click the lock / permissions icon in your browser URL bar to allow it.';
      } else {
        permState = 'unsupported';
        errorMessage = err.message || 'Could not access audio device.';
      }
    } finally {
      isRequesting = false;
    }
  }

  function handleJoinVoice() {
    const chanId = appState.pendingVoiceChannelId;
    appState.activeModal = null;
    if (chanId) {
      clientService.joinVoiceChannel(chanId);
      appState.currentChannelId = chanId;
    }
  }

  function copyFlagsUrl() {
    navigator.clipboard.writeText(currentHost);
    copiedFlag = true;
    setTimeout(() => (copiedFlag = false), 2500);
  }
</script>

<div class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
  <!-- HyperUI Modal Card -->
  <div class="relative w-full max-w-lg rounded-2xl bg-[#2b2d31] p-6 shadow-2xl border border-[#1f2023] sm:p-8 overflow-hidden">
    <!-- Close button -->
    <button
      onclick={() => (appState.activeModal = null)}
      class="absolute top-4 right-4 text-[#949ba4] hover:text-white p-2 rounded-lg hover:bg-[#35373c] transition-colors"
      title="Close"
    >
      <X class="w-5 h-5" />
    </button>

    <!-- Header Section -->
    <div class="flex items-center space-x-3.5 mb-5">
      <div class="w-12 h-12 rounded-xl bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center shadow-inner">
        <Mic class="w-6 h-6" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-white leading-tight">Microphone Permission</h3>
        <p class="text-xs text-[#949ba4]">Required for Concord real-time LAN voice chat</p>
      </div>
    </div>

    <!-- HyperUI Status Badge & Meter -->
    <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] mb-5 space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-[#949ba4] uppercase tracking-wider">Status:</span>
        {#if permState === 'granted'}
          <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
            <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Permission Granted & Active
          </span>
        {:else if permState === 'denied'}
          <span class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">
            <span class="h-2 w-2 rounded-full bg-rose-400"></span>
            Permission Denied
          </span>
        {:else if !isSecure}
          <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
            <AlertTriangle class="w-3 h-3" />
            HTTP LAN Context
          </span>
        {:else}
          <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/30">
            <Radio class="w-3 h-3 animate-pulse" />
            Ready to Request
          </span>
        {/if}
      </div>

      <!-- Live Mic Level Visualizer -->
      {#if permState === 'granted'}
        <div class="space-y-1.5 pt-1">
          <div class="flex justify-between text-xs text-[#949ba4]">
            <span>Microphone Input Level</span>
            <span class="font-mono text-emerald-400">{audioLevel}%</span>
          </div>
          <div class="w-full bg-[#2b2d31] h-3 rounded-full overflow-hidden p-0.5 border border-[#35373c]">
            <div
              class="h-full bg-gradient-to-r from-[#23a55a] via-[#5865f2] to-[#f0b232] rounded-full transition-all duration-75"
              style={`width: ${audioLevel}%`}
            ></div>
          </div>
          <p class="text-[11px] text-[#949ba4] text-center pt-1">
            🎙️ Speak into your mic to test voice activity!
          </p>
        </div>
      {/if}
    </div>

    <!-- Error / Insecure Context Warning (HyperUI Alert Card) -->
    {#if !isSecure || permState === 'unsupported'}
      <div class="rounded-xl border-s-4 border-amber-500 bg-amber-500/10 p-4 text-xs text-amber-200 mb-5 space-y-2">
        <div class="flex items-center gap-2 font-bold text-amber-400">
          <AlertTriangle class="h-4 w-4" />
          <span>Why is the microphone option not showing on phone/LAN?</span>
        </div>
        <p class="leading-relaxed text-[11px] text-amber-200/90">
          Modern web browsers (Safari, Chrome, Firefox) restrict microphone access to <strong>Secure Contexts</strong> (<code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">https://</code> or <code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">localhost</code>). Plain HTTP over local IP (<code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">http://192.168.x.x</code>) blocks media devices automatically.
        </p>

        <div class="pt-2 border-t border-amber-500/20 space-y-1.5">
          <p class="font-bold text-white text-[11px]">Easy 1-Step Fixes for Mobile / Browser:</p>
          <ul class="list-disc pl-4 space-y-1 text-[11px] text-amber-100/90">
            <li>
              <strong>Option A (HTTPS Mode)</strong>: Run Vite with HTTPS (<code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">npm run dev:https</code>) and open <code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">https://192.168.1.13:5173</code> on your phone.
            </li>
            <li>
              <strong>Option B (Chrome on Phone/PC)</strong>: Open <code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, add <code class="bg-black/30 px-1 py-0.5 rounded text-amber-300">{currentHost}</code> and set to <strong>Enabled</strong>.
            </li>
          </ul>
        </div>
      </div>
    {:else if errorMessage}
      <div class="rounded-xl border-s-4 border-rose-500 bg-rose-500/10 p-4 text-xs text-rose-200 mb-5 flex items-start gap-2">
        <ShieldAlert class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div class="text-[11px] leading-relaxed">{errorMessage}</div>
      </div>
    {/if}

    <!-- Action Buttons (HyperUI Button patterns) -->
    <div class="space-y-3">
      {#if permState !== 'granted'}
        <button
          onclick={requestPermission}
          disabled={isRequesting}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-[0.98] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#5865f2]/25 transition-all disabled:opacity-50 cursor-pointer"
        >
          <Mic class="w-4 h-4" />
          <span>{isRequesting ? 'Requesting Browser Permission...' : 'Allow Microphone Permission'}</span>
        </button>
      {:else}
        <button
          onclick={handleJoinVoice}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#23a55a] hover:bg-[#1f934f] active:scale-[0.98] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#23a55a]/25 transition-all cursor-pointer"
        >
          <Volume2 class="w-4 h-4" />
          <span>Microphone Ready — Join Voice Channel</span>
        </button>
      {/if}

      <button
        onclick={() => (appState.activeModal = null)}
        class="w-full inline-flex items-center justify-center rounded-xl bg-[#1e1f22] hover:bg-[#35373c] px-4 py-2.5 text-xs font-semibold text-[#949ba4] hover:text-white transition-colors"
      >
        Dismiss
      </button>
    </div>
  </div>
</div>
