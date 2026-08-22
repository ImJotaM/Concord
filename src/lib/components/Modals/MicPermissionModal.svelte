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
    Headphones,
    HelpCircle,
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
        'O navegador bloqueou o acesso ao microfone porque a conexão não é segura (HTTPS ou localhost). Acesse via http://localhost:5173 ou ative o modo HTTPS.';
      permState = 'unsupported';
      return;
    }

    try {
      await startLevelMeter();
      permState = 'granted';
    } catch (err: any) {
      console.error('Permission request error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        permState = 'denied';
        errorMessage = 'A permissão foi negada no navegador. Clique no ícone de cadeado / configurações na barra de endereço (URL) e mude o Microfone para "Permitir".';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        permState = 'unsupported';
        errorMessage = 'Nenhum microfone foi detectado no seu computador. Verifique se o microfone está conectado e ativo no Windows.';
      } else {
        permState = 'unsupported';
        errorMessage = err.message || 'Não foi possível acessar o dispositivo de áudio.';
      }
    } finally {
      isRequesting = false;
    }
  }

  function handleJoinVoice(listenOnly = false) {
    const chanId = appState.pendingVoiceChannelId;
    appState.activeModal = null;
    if (chanId) {
      clientService.joinVoiceChannel(chanId, listenOnly);
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
  <div class="relative w-full max-w-lg rounded-2xl bg-[#2b2d31] p-6 shadow-2xl border border-[#1f2023] sm:p-8 overflow-hidden max-h-[90vh] flex flex-col">
    <!-- Close button -->
    <button
      onclick={() => (appState.activeModal = null)}
      class="absolute top-4 right-4 text-[#949ba4] hover:text-white p-2 rounded-lg hover:bg-[#35373c] transition-colors"
      title="Fechar"
    >
      <X class="w-5 h-5" />
    </button>

    <!-- Header Section -->
    <div class="flex items-center space-x-3.5 mb-4 shrink-0">
      <div class="w-12 h-12 rounded-xl bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center shadow-inner">
        <Mic class="w-6 h-6" />
      </div>
      <div>
        <h3 class="text-lg font-bold text-white leading-tight">Permissão de Microfone</h3>
        <p class="text-xs text-[#949ba4]">Necessário para falar nos canais de voz WebRTC do Concord</p>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="overflow-y-auto flex-1 space-y-4 pr-1">
      <!-- Status Badge & Visualizer -->
      <div class="bg-[#1e1f22] p-4 rounded-xl border border-[#1f2023] space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-[#949ba4] uppercase tracking-wider">Status:</span>
          {#if permState === 'granted'}
            <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
              <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Microfone Ativo & Liberado
            </span>
          {:else if permState === 'denied'}
            <span class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">
              <span class="h-2 w-2 rounded-full bg-rose-400"></span>
              Bloqueado no Navegador
            </span>
          {:else if !isSecure}
            <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400 border border-amber-500/30">
              <AlertTriangle class="w-3 h-3" />
              Acesso via IP (Requer HTTPS ou localhost)
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-bold text-indigo-400 border border-indigo-500/30">
              <Radio class="w-3 h-3 animate-pulse" />
              Pronto para solicitar permissão
            </span>
          {/if}
        </div>

        <!-- Live Mic Level Visualizer -->
        {#if permState === 'granted'}
          <div class="space-y-1.5 pt-1">
            <div class="flex justify-between text-xs text-[#949ba4]">
              <span>Nível de captação do microfone:</span>
              <span class="font-mono text-emerald-400">{audioLevel}%</span>
            </div>
            <div class="w-full bg-[#2b2d31] h-3 rounded-full overflow-hidden p-0.5 border border-[#35373c]">
              <div
                class="h-full bg-gradient-to-r from-[#23a55a] via-[#5865f2] to-[#f0b232] rounded-full transition-all duration-75"
                style={`width: ${audioLevel}%`}
              ></div>
            </div>
            <p class="text-[11px] text-[#949ba4] text-center pt-1">
              🎙️ Fale no microfone para testar a detecção de voz!
            </p>
          </div>
        {/if}
      </div>

      <!-- Instructions & Troubleshooting Card -->
      <div class="rounded-xl border border-[#35373c] bg-[#1e1f22]/80 p-4 text-xs text-[#dbdee1] space-y-3">
        <div class="flex items-center gap-2 font-bold text-white">
          <HelpCircle class="h-4 w-4 text-[#5865f2]" />
          <span>Por que o popup de permissão pode não ter aparecido?</span>
        </div>

        <div class="space-y-2.5 text-[12px] leading-relaxed">
          <div class="bg-[#2b2d31] p-2.5 rounded-lg border border-[#1f2023]">
            <div class="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
              <Lock class="w-3.5 h-3.5" />
              <span>1. Permissão bloqueada anteriormente no navegador</span>
            </div>
            <p class="text-[#949ba4] text-[11px]">
              Se você clicou em "Bloquear" ou fechou a mensagem antes, o navegador não pergunta novamente.
              <strong>Solução:</strong> Clique no ícone de <strong>Cadeado / Ajustes do Site</strong> à esquerda do endereço <code class="bg-black/40 px-1 py-0.5 rounded text-white">http://localhost:5173</code> e marque <strong>Microfone: Permitir</strong>, depois recarregue a página.
            </p>
          </div>

          <div class="bg-[#2b2d31] p-2.5 rounded-lg border border-[#1f2023]">
            <div class="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
              <AlertTriangle class="w-3.5 h-3.5" />
              <span>2. Acessando pelo IP da rede local (ex: celular)</span>
            </div>
            <p class="text-[#949ba4] text-[11px]">
              Os navegadores bloqueiam o microfone em conexões HTTP normais com endereço IP. Para usar microfone no celular ou outros PCs, use o modo HTTPS (<code class="bg-black/40 px-1 py-0.5 rounded text-white">npm run start:https</code>) ou acesse no próprio computador como <code class="bg-black/40 px-1 py-0.5 rounded text-white">localhost</code>.
            </p>
          </div>

          <div class="bg-[#2b2d31] p-2.5 rounded-lg border border-[#1f2023]">
            <div class="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
              <Mic class="w-3.5 h-3.5" />
              <span>3. Privacidade do Windows</span>
            </div>
            <p class="text-[#949ba4] text-[11px]">
              Vá em <em>Configurações do Windows > Privacidade e Segurança > Microfone</em> e garanta que <strong>"Permitir que os aplicativos acessem seu microfone"</strong> está ATIVADO.
            </p>
          </div>
        </div>
      </div>

      {#if errorMessage}
        <div class="rounded-xl border-s-4 border-rose-500 bg-rose-500/10 p-3.5 text-xs text-rose-200 flex items-start gap-2">
          <ShieldAlert class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div class="text-[11px] leading-relaxed">{errorMessage}</div>
        </div>
      {/if}
    </div>

    <!-- Action Buttons -->
    <div class="space-y-2 pt-4 border-t border-[#1f2023] shrink-0">
      {#if permState !== 'granted'}
        <button
          onclick={requestPermission}
          disabled={isRequesting}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] active:scale-[0.98] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#5865f2]/25 transition-all disabled:opacity-50 cursor-pointer"
        >
          <Mic class="w-4 h-4" />
          <span>{isRequesting ? 'Solicitando permissão ao navegador...' : 'Solicitar Permissão do Microfone'}</span>
        </button>

        <button
          onclick={() => handleJoinVoice(true)}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#313338] hover:bg-[#383a40] active:scale-[0.98] px-4 py-2.5 text-xs font-bold text-[#dbdee1] hover:text-white border border-[#404249] transition-all cursor-pointer"
        >
          <Headphones class="w-4 h-4 text-[#23a55a]" />
          <span>Entrar apenas como Ouvinte (Sem Microfone)</span>
        </button>
      {:else}
        <button
          onclick={() => handleJoinVoice(false)}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#23a55a] hover:bg-[#1f934f] active:scale-[0.98] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#23a55a]/25 transition-all cursor-pointer"
        >
          <Volume2 class="w-4 h-4" />
          <span>Microfone Liberado — Entrar na Sala de Voz</span>
        </button>
      {/if}

      <button
        onclick={() => (appState.activeModal = null)}
        class="w-full inline-flex items-center justify-center rounded-xl bg-[#1e1f22] hover:bg-[#35373c] px-4 py-2 text-xs font-semibold text-[#949ba4] hover:text-white transition-colors"
      >
        Cancelar
      </button>
    </div>
  </div>
</div>

