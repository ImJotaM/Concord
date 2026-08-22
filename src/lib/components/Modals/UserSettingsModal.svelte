<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { X, Mic, Volume2, Shield, User, Laptop } from '@lucide/svelte';

  let displayName = $state(appState.currentUser.displayName);
  let customStatus = $state(appState.currentUser.customStatus || '');
  let avatar = $state(appState.currentUser.avatar || '👤');
  let status = $state(appState.currentUser.status || 'online');

  const avatarOptions = ['😎', '🦊', '🐱', '🚀', '⚡', '🎮', '👾', '🔥', '🛡️', '🧙', '🐉', '🤖', '💀', '🍕'];

  function handleSave() {
    appState.setUser({
      displayName: displayName.trim() || appState.currentUser.username,
      customStatus: customStatus.trim(),
      avatar,
      status,
    });

    clientService.send('update_presence', {
      status,
      customStatus: customStatus.trim(),
    });

    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-lg rounded-lg shadow-2xl border border-[#1f2023] overflow-hidden flex flex-col max-h-[90vh]">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023] shrink-0">
      <div class="flex items-center space-x-2">
        <User class="w-5 h-5 text-[#5865f2]" />
        <h3 class="font-bold text-white text-base">User & LAN Voice Settings</h3>
      </div>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#35373c]"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Body (Scrollable) -->
    <div class="p-5 space-y-5 overflow-y-auto flex-1">
      <!-- Profile Preview Card -->
      <div class="bg-[#1e1f22] p-4 rounded-lg flex items-center space-x-4 border border-[#111214]">
        <div class="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center text-3xl shadow">
          {avatar}
        </div>
        <div>
          <div class="text-white font-bold text-base">{displayName || 'Your Name'}</div>
          <div class="text-[#949ba4] text-xs font-mono">@{appState.currentUser.username}</div>
          {#if customStatus}
            <div class="text-[#dbdee1] text-xs mt-1 italic">"{customStatus}"</div>
          {/if}
        </div>
      </div>

      <!-- Avatar Picker -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
          Choose Avatar Emoji
        </label>
        <div class="flex flex-wrap gap-2">
          {#each avatarOptions as emo}
            <button
              type="button"
              onclick={() => (avatar = emo)}
              class="w-10 h-10 rounded-full bg-[#2b2d31] hover:bg-[#35373c] flex items-center justify-center text-xl transition-all"
              class:ring-2={avatar === emo}
              class:ring-[#5865f2]={avatar === emo}
            >
              {emo}
            </button>
          {/each}
        </div>
      </div>

      <!-- Display Name -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Display Name
        </label>
        <input
          type="text"
          bind:value={displayName}
          class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#1f2023]"
        />
      </div>

      <!-- Custom Status -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Custom Status
        </label>
        <input
          type="text"
          bind:value={customStatus}
          placeholder="e.g. Playing LAN Tournament"
          class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#1f2023]"
        />
      </div>

      <!-- Status (Online, Idle, DND) -->
      <div>
        <label class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Online Status
        </label>
        <div class="grid grid-cols-3 gap-2">
          <button
            type="button"
            onclick={() => (status = 'online')}
            class="p-2.5 rounded bg-[#2b2d31] border flex items-center justify-center space-x-2 text-xs font-semibold"
            class:border-[#23a55a]={status === 'online'}
            class:border-transparent={status !== 'online'}
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#23a55a]"></span>
            <span class="text-white">Online</span>
          </button>

          <button
            type="button"
            onclick={() => (status = 'idle')}
            class="p-2.5 rounded bg-[#2b2d31] border flex items-center justify-center space-x-2 text-xs font-semibold"
            class:border-[#f0b232]={status === 'idle'}
            class:border-transparent={status !== 'idle'}
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#f0b232]"></span>
            <span class="text-white">Idle</span>
          </button>

          <button
            type="button"
            onclick={() => (status = 'dnd')}
            class="p-2.5 rounded bg-[#2b2d31] border flex items-center justify-center space-x-2 text-xs font-semibold"
            class:border-[#f23f43]={status === 'dnd'}
            class:border-transparent={status !== 'dnd'}
          >
            <span class="w-2.5 h-2.5 rounded-full bg-[#f23f43]"></span>
            <span class="text-white">Do Not Disturb</span>
          </button>
        </div>
      </div>

      <!-- LAN Voice Settings Note -->
      <div class="bg-[#2b2d31] p-3 rounded text-xs text-[#949ba4] space-y-1">
        <div class="flex items-center space-x-1.5 text-white font-semibold">
          <Mic class="w-4 h-4 text-[#23a55a]" />
          <span>LAN WebRTC Voice Engine</span>
        </div>
        <p>
          Microphone uses hardware echo cancellation and auto-gain. Latency on your local network is usually under 5 milliseconds.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 bg-[#2b2d31] flex justify-end space-x-2 border-t border-[#1f2023] shrink-0">
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-white hover:underline text-sm font-semibold px-4 py-2"
      >
        Cancel
      </button>
      <button
        onclick={handleSave}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-5 py-2 rounded font-semibold transition-colors"
      >
        Save Changes
      </button>
    </div>
  </div>
</div>
