<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { serverHostService } from '../../api/serverHostService';
  import { Compass, RefreshCw, X, Radio, Check, Laptop, Smartphone, Server, Play } from '@lucide/svelte';

  let customUrl = $state(appState.serverUrl);
  let isScanning = $state(false);

  async function handleScan() {
    isScanning = true;
    try {
      await clientService.scanLanServers();
    } finally {
      isScanning = false;
    }
  }

  function handleConnect(url: string) {
    clientService.connect(url);
    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-md rounded-lg shadow-2xl border border-[#1f2023] overflow-hidden">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023]">
      <div class="flex items-center space-x-2">
        <Compass class="w-5 h-5 text-[#5865f2]" />
        <h3 class="font-bold text-white text-base">LAN Network Discovery</h3>
      </div>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#35373c]"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-5 space-y-5">
      <!-- Host On This PC / Device Section -->
      <div class="bg-[#2b2d31] p-3.5 rounded-lg border border-[#1f2023] flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-full bg-[#5865f2]/20 text-[#5865f2] flex items-center justify-center">
            <Server class="w-5 h-5" />
          </div>
          <div>
            <div class="text-white text-sm font-bold">Host Server on This Device</div>
            <div class="text-xs text-[#949ba4]">Run your own LAN Discord hub</div>
          </div>
        </div>
        <button
          onclick={() => {
            appState.activeModal = 'hostServer';
          }}
          class="bg-[#23a55a] hover:bg-[#1f934f] text-white text-xs px-3.5 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 transition-colors shadow"
        >
          <Play class="w-3.5 h-3.5 fill-current" />
          <span>Host Local</span>
        </button>
      </div>

      <!-- Discovered Hubs -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-xs font-bold uppercase tracking-wider text-[#949ba4]">
            Discovered LAN Hubs
          </label>
          <button
            onclick={handleScan}
            disabled={isScanning}
            class="text-xs text-[#5865f2] hover:underline flex items-center space-x-1"
          >
            <RefreshCw class={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>Scan Network</span>
          </button>
        </div>

        {#if appState.discoveredServers.length === 0}
          <div class="bg-[#2b2d31] p-3 rounded text-center text-xs text-[#949ba4]">
            No other LAN servers detected via auto-scan. Enter your host IP below or run the Concord server.
          </div>
        {:else}
          <div class="space-y-2">
            {#each appState.discoveredServers as server}
              <div class="bg-[#2b2d31] p-3 rounded flex items-center justify-between hover:bg-[#35373c] transition-colors">
                <div class="flex items-center space-x-3 truncate">
                  <div class="w-8 h-8 rounded-full bg-[#5865f2] text-white flex items-center justify-center font-bold text-sm">
                    🌐
                  </div>
                  <div class="truncate">
                    <div class="text-white text-sm font-semibold truncate">{server.name}</div>
                    <div class="text-xs text-[#949ba4] font-mono">{server.url}</div>
                  </div>
                </div>

                <button
                  onclick={() => handleConnect(server.url)}
                  class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs px-3 py-1.5 rounded font-semibold transition-colors"
                >
                  Connect
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Manual Connection Input -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
          Or Enter Server IP / Host URL
        </label>
        <div class="flex space-x-2">
          <input
            type="text"
            bind:value={customUrl}
            placeholder="http://192.168.1.50:3000"
            class="bg-[#1e1f22] text-white text-sm px-3 py-2 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-[#5865f2] font-mono border border-[#1f2023]"
          />
          <button
            onclick={() => handleConnect(customUrl)}
            class="bg-[#23a55a] hover:bg-[#1f934f] text-white text-sm px-4 py-2 rounded font-semibold transition-colors shrink-0"
          >
            Connect
          </button>
        </div>
        <p class="text-[11px] text-[#949ba4] mt-1.5">
          Tip: On your host PC running Concord server, share your LAN IP address (e.g. <span class="text-white font-mono">http://192.168.1.X:3000</span>) with phones and laptops on the same Wi-Fi.
        </p>
      </div>
    </div>
  </div>
</div>
