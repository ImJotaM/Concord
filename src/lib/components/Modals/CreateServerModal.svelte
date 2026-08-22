<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { X } from '@lucide/svelte';

  let serverName = $state('');
  let serverIcon = $state('🚀');
  const availableIcons = ['🚀', '🎮', '👾', '🔥', '🛡️', '⚡', '💻', '🍕', '🏆', '🎧', '🌐', '⛺'];

  function handleCreate() {
    const name = serverName.trim();
    if (!name) return;

    clientService.createServer(name, serverIcon);
    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-md rounded-lg shadow-2xl border border-[#1f2023] overflow-hidden">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023]">
      <h3 class="font-bold text-white text-base">Create a LAN Server</h3>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#35373c]"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Body -->
    <div class="p-5 space-y-4">
      <p class="text-xs text-[#949ba4]">
        Your server is where you and your friends on the local network hang out. Create yours and start talking.
      </p>

      <!-- Server Icon Picker -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
          Server Icon
        </label>
        <div class="flex flex-wrap gap-2">
          {#each availableIcons as icon}
            <button
              type="button"
              onclick={() => (serverIcon = icon)}
              class="w-10 h-10 rounded-full bg-[#1e1f22] hover:bg-[#35373c] flex items-center justify-center text-xl transition-all"
              class:ring-2={serverIcon === icon}
              class:ring-[#5865f2]={serverIcon === icon}
            >
              {icon}
            </button>
          {/each}
        </div>
      </div>

      <!-- Server Name Input -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Server Name
        </label>
        <input
          type="text"
          bind:value={serverName}
          placeholder="My Epic LAN Server"
          class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#1f2023]"
        />
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 bg-[#2b2d31] flex justify-end space-x-2 border-t border-[#1f2023]">
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-white hover:underline text-sm font-semibold px-4 py-2"
      >
        Cancel
      </button>
      <button
        onclick={handleCreate}
        disabled={!serverName.trim()}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50"
      >
        Create
      </button>
    </div>
  </div>
</div>
