<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { serverHostService } from '../../api/serverHostService';
  import { clientService } from '../../api/wsClient';
  import {
    Server,
    Play,
    Square,
    RefreshCw,
    X,
    Copy,
    Check,
    Terminal,
    Wifi,
    Share2,
    Laptop,
    Smartphone,
    Info,
  } from '@lucide/svelte';

  let copiedItem = $state<string | null>(null);
  let isChecking = $state(false);
  let logsContainer = $state<HTMLDivElement | null>(null);
  let showLogs = $state(true);

  let isHosting = $derived(appState.localServerRunning);
  let isStarting = $derived(appState.isServerStarting);
  let isConnected = $derived(appState.connectionStatus === 'connected');
  let isTauri = $derived(appState.isTauriApp);
  let primaryLanIp = $derived(
    appState.lanIps.find((ip) => ip !== '127.0.0.1') || 'localhost'
  );

  async function handleStart() {
    await serverHostService.startLocalServer();
  }

  async function handleStop() {
    await serverHostService.stopLocalServer();
  }

  async function handleCheck() {
    isChecking = true;
    try {
      const active = await serverHostService.checkServerStatus();
      if (active) {
        clientService.connect('http://localhost:3000');
      }
    } finally {
      isChecking = false;
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    copiedItem = key;
    setTimeout(() => {
      if (copiedItem === key) copiedItem = null;
    }, 2000);
  }

  $effect(() => {
    if (appState.serverLogs.length > 0 && logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  });
</script>

<div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-lg rounded-xl shadow-2xl border border-[#1f2023] overflow-hidden flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023] shrink-0">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-[#5865f2] flex items-center justify-center text-white shadow">
          <Server class="w-4 h-4" />
        </div>
        <div>
          <h3 class="font-bold text-white text-base leading-tight">Host Local Server</h3>
          <p class="text-[11px] text-[#949ba4]">Run a private Concord LAN Hub on this machine</p>
        </div>
      </div>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1.5 rounded-lg hover:bg-[#35373c] transition-colors"
        title="Close"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Modal Body -->
    <div class="p-5 space-y-4 overflow-y-auto flex-1">
      <!-- Status & Primary Action Card -->
      <div class="bg-[#2b2d31] p-4 rounded-lg border border-[#1f2023] shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
              Server Status:
            </span>
            {#if isStarting}
              <span class="inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#f0b232]/20 text-[#f0b232] border border-[#f0b232]/30">
                <span class="w-2 h-2 rounded-full bg-[#f0b232] animate-ping"></span>
                <span>Starting...</span>
              </span>
            {:else if isHosting || isConnected}
              <span class="inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#23a55a]/20 text-[#23a55a] border border-[#23a55a]/30">
                <span class="w-2 h-2 rounded-full bg-[#23a55a] animate-pulse"></span>
                <span>Online & Hosting</span>
              </span>
            {:else}
              <span class="inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#f23f43]/20 text-[#f23f43] border border-[#f23f43]/30">
                <span class="w-2 h-2 rounded-full bg-[#f23f43]"></span>
                <span>Offline / Stopped</span>
              </span>
            {/if}
          </div>

          <button
            onclick={handleCheck}
            disabled={isChecking}
            class="text-xs text-[#5865f2] hover:text-[#7983f5] flex items-center space-x-1 font-medium transition-colors"
            title="Check server status"
          >
            <RefreshCw class={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>Check</span>
          </button>
        </div>

        <!-- Start / Stop Button -->
        {#if isStarting}
          <button
            disabled
            class="w-full py-3 px-4 rounded-lg bg-[#5865f2]/50 text-white font-bold text-sm flex items-center justify-center space-x-2 cursor-not-allowed"
          >
            <RefreshCw class="w-4 h-4 animate-spin" />
            <span>Starting Server on port 3000...</span>
          </button>
        {:else if isHosting || isConnected}
          <div class="space-y-2">
            <div class="flex items-center space-x-2">
              <button
                onclick={() => clientService.connect('http://localhost:3000')}
                class="flex-1 py-2.5 px-4 rounded-lg bg-[#23a55a] hover:bg-[#1f934f] text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow"
              >
                <Check class="w-4 h-4" />
                <span>Connected to Local Server</span>
              </button>

              {#if isTauri}
                <button
                  onclick={handleStop}
                  class="py-2.5 px-3 rounded-lg bg-[#f23f43] hover:bg-[#d83a3e] text-white font-semibold text-xs flex items-center space-x-1 transition-all shadow"
                  title="Stop Server Process"
                >
                  <Square class="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              {/if}
            </div>
          </div>
        {:else}
          <!-- Start Server Button -->
          <button
            onclick={handleStart}
            class="w-full py-3 px-4 rounded-lg bg-[#5865f2] hover:bg-[#4752c4] active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg hover:shadow-[#5865f2]/25"
          >
            <Play class="w-4 h-4 fill-current" />
            <span>Host Local Server (Port 3000)</span>
          </button>
        {/if}

        <!-- Web Browser Command helper if not in Tauri -->
        {#if !isTauri && !isHosting && !isConnected}
          <div class="mt-3 pt-3 border-t border-[#35363c] space-y-2">
            <div class="flex items-center justify-between text-[11px] text-[#949ba4]">
              <span class="flex items-center space-x-1 font-medium">
                <Terminal class="w-3.5 h-3.5 text-[#5865f2]" />
                <span>Run from Terminal:</span>
              </span>
              <button
                onclick={() => copyToClipboard('npm run server', 'npm-cmd')}
                class="text-[#5865f2] hover:underline flex items-center space-x-1"
              >
                {#if copiedItem === 'npm-cmd'}
                  <Check class="w-3 h-3 text-[#23a55a]" />
                  <span class="text-[#23a55a]">Copied!</span>
                {:else}
                  <Copy class="w-3 h-3" />
                  <span>Copy</span>
                {/if}
              </button>
            </div>

            <div class="bg-[#1e1f22] p-2 rounded font-mono text-xs text-[#23a55a] border border-[#1f2023] flex items-center justify-between">
              <code>npm run server</code>
              <button
                onclick={() => copyToClipboard('npm run server', 'npm-cmd')}
                class="p-1 text-[#949ba4] hover:text-white rounded hover:bg-[#313338]"
              >
                <Copy class="w-3.5 h-3.5" />
              </button>
            </div>
            <p class="text-[11px] text-[#949ba4]">
              Once started in terminal, click <button onclick={handleCheck} class="text-[#5865f2] underline font-semibold">Check</button> above to connect instantly!
            </p>
          </div>
        {/if}
      </div>

      <!-- LAN Sharing & Join Addresses -->
      <div class="bg-[#2b2d31] p-4 rounded-lg border border-[#1f2023] space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold uppercase tracking-wider text-[#949ba4] flex items-center space-x-1.5">
            <Wifi class="w-3.5 h-3.5 text-[#23a55a]" />
            <span>Local Network (LAN) Access</span>
          </label>
        </div>

        <div class="space-y-2">
          <!-- Localhost URL -->
          <div class="flex items-center justify-between bg-[#1e1f22] p-2.5 rounded-md border border-[#1f2023]">
            <div class="flex items-center space-x-2.5 truncate mr-2">
              <Laptop class="w-4 h-4 text-[#949ba4] shrink-0" />
              <div class="truncate">
                <div class="text-[11px] text-[#949ba4]">Local PC Address:</div>
                <div class="text-xs text-white font-mono font-semibold">http://localhost:3000</div>
              </div>
            </div>
            <button
              onclick={() => copyToClipboard('http://localhost:3000', 'local-url')}
              class="p-1.5 text-[#949ba4] hover:text-white rounded hover:bg-[#313338] transition-colors shrink-0"
              title="Copy Local URL"
            >
              {#if copiedItem === 'local-url'}
                <Check class="w-4 h-4 text-[#23a55a]" />
              {:else}
                <Copy class="w-4 h-4" />
              {/if}
            </button>
          </div>

          <!-- LAN Wi-Fi URL -->
          {#if primaryLanIp !== 'localhost'}
            <div class="flex items-center justify-between bg-[#1e1f22] p-2.5 rounded-md border border-[#1f2023]">
              <div class="flex items-center space-x-2.5 truncate mr-2">
                <Smartphone class="w-4 h-4 text-[#23a55a] shrink-0" />
                <div class="truncate">
                  <div class="text-[11px] text-[#949ba4]">Wi-Fi LAN Server URL (Share with Friends):</div>
                  <div class="text-xs text-[#23a55a] font-mono font-semibold">
                    http://{primaryLanIp}:3000
                  </div>
                </div>
              </div>
              <button
                onclick={() => copyToClipboard(`http://${primaryLanIp}:3000`, 'lan-url')}
                class="p-1.5 text-[#949ba4] hover:text-white rounded hover:bg-[#313338] transition-colors shrink-0"
                title="Copy Wi-Fi Server URL"
              >
                {#if copiedItem === 'lan-url'}
                  <Check class="w-4 h-4 text-[#23a55a]" />
                {:else}
                  <Copy class="w-4 h-4" />
                {/if}
              </button>
            </div>
          {/if}
        </div>

        <div class="bg-[#1e1f22]/60 p-2.5 rounded text-[11px] text-[#949ba4] flex items-start space-x-2">
          <Info class="w-4 h-4 text-[#5865f2] shrink-0 mt-0.5" />
          <span>
            Any phone, tablet, or PC connected to the same Wi-Fi can connect to this host server without needing an internet connection.
          </span>
        </div>
      </div>

      <!-- Live Server Console Logs -->
      <div class="bg-[#2b2d31] rounded-lg border border-[#1f2023] overflow-hidden">
        <div class="p-2.5 bg-[#26282c] flex items-center justify-between border-b border-[#1f2023]">
          <button
            onclick={() => (showLogs = !showLogs)}
            class="flex items-center space-x-1.5 text-xs font-bold text-[#dbdee1] hover:text-white"
          >
            <Terminal class="w-3.5 h-3.5 text-[#949ba4]" />
            <span>Server Console Logs</span>
            <span class="text-[10px] text-[#949ba4] font-normal">({appState.serverLogs.length} lines)</span>
          </button>

          {#if appState.serverLogs.length > 0}
            <button
              onclick={() => (appState.serverLogs = [])}
              class="text-[10px] text-[#949ba4] hover:text-white hover:underline"
            >
              Clear
            </button>
          {/if}
        </div>

        {#if showLogs}
          <div
            bind:this={logsContainer}
            class="bg-[#111214] p-3 font-mono text-[11px] text-[#dbdee1] h-32 overflow-y-auto space-y-1 select-text"
          >
            {#if appState.serverLogs.length === 0}
              <div class="text-[#80848e] italic">Server console output will appear here...</div>
            {:else}
              {#each appState.serverLogs as line}
                <div class="leading-tight break-all whitespace-pre-wrap {line.includes('[ERR]') ? 'text-[#f23f43]' : line.includes('✅') || line.includes('🚀') ? 'text-[#23a55a]' : 'text-[#dbdee1]'}">
                  {line}
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Modal Footer -->
    <div class="p-3 bg-[#2b2d31] border-t border-[#1f2023] flex justify-end shrink-0">
      <button
        onclick={() => (appState.activeModal = null)}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs px-5 py-2 rounded-md font-semibold transition-colors shadow"
      >
        Done
      </button>
    </div>
  </div>
</div>
