<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { Hash, Volume2, X } from '@lucide/svelte';

  let channelName = $state('');
  let channelTopic = $state('');
  let channelType = $state<'text' | 'voice'>('text');

  function handleCreate() {
    const name = channelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || !appState.currentServerId) return;

    clientService.createChannel(appState.currentServerId, name, channelType, channelTopic.trim());
    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-md rounded-lg shadow-2xl border border-[#1f2023] overflow-hidden">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023]">
      <h3 class="font-bold text-white text-base">Create Channel</h3>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1 rounded hover:bg-[#35373c]"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Body -->
    <div class="p-5 space-y-4">
      <!-- Channel Type Selector -->
      <div>
        <div class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
          Channel Type
        </div>
        <div class="space-y-2">
          <button
            type="button"
            onclick={() => (channelType = 'text')}
            class="w-full p-3 rounded-md flex items-center space-x-3 text-left transition-colors border"
            class:bg-[#383a40]={channelType === 'text'}
            class:border-[#5865f2]={channelType === 'text'}
            class:border-transparent={channelType !== 'text'}
            class:bg-[#2b2d31]={channelType !== 'text'}
          >
            <Hash class={`w-6 h-6 ${channelType === 'text' ? 'text-white' : 'text-[#949ba4]'}`} />
            <div>
              <div class="text-sm font-semibold text-white">Text Channel</div>
              <div class="text-xs text-[#949ba4]">Post messages, images, memes, and files</div>
            </div>
          </button>

          <button
            type="button"
            onclick={() => (channelType = 'voice')}
            class="w-full p-3 rounded-md flex items-center space-x-3 text-left transition-colors border"
            class:bg-[#383a40]={channelType === 'voice'}
            class:border-[#23a55a]={channelType === 'voice'}
            class:border-transparent={channelType !== 'voice'}
            class:bg-[#2b2d31]={channelType !== 'voice'}
          >
            <Volume2 class={`w-6 h-6 ${channelType === 'voice' ? 'text-[#23a55a]' : 'text-[#949ba4]'}`} />
            <div>
              <div class="text-sm font-semibold text-white">Voice Channel (LAN)</div>
              <div class="text-xs text-[#949ba4]">Low-latency voice chat over Wi-Fi/Ethernet</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Channel Name Input -->
      <div>
        <label for="channel-name-input" class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Channel Name
        </label>
        <div class="relative flex items-center">
          <span class="absolute left-3 text-[#949ba4]">
            {#if channelType === 'text'}# {:else}🔊 {/if}
          </span>
          <input
            id="channel-name-input"
            type="text"
            bind:value={channelName}
            placeholder="new-channel"
            class="w-full bg-[#1e1f22] text-white text-sm pl-8 pr-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#1f2023]"
          />
        </div>
      </div>

      <!-- Channel Topic -->
      {#if channelType === 'text'}
        <div>
          <label for="channel-topic-input" class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
            Topic (Optional)
          </label>
          <input
            id="channel-topic-input"
            type="text"
            bind:value={channelTopic}
            placeholder="Let everyone know how to use this channel"
            class="w-full bg-[#1e1f22] text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#1f2023]"
          />
        </div>
      {/if}
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
        disabled={!channelName.trim()}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50"
      >
        Create Channel
      </button>
    </div>
  </div>
</div>
