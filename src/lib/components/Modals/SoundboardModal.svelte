<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import {
    soundService,
    SOUNDBOARD_SOUNDS,
    type SoundboardSound,
  } from '../../services/soundService.svelte';
  import {
    X,
    Search,
    Volume2,
    VolumeX,
    Radio,
    Sparkles,
    Play,
    Flame,
    Gamepad2,
    Smile,
  } from '@lucide/svelte';

  let searchQuery = $state('');
  let selectedCategory = $state<'all' | 'memes' | 'effects' | 'games' | 'reactions'>('all');
  let activePlayingId = $state<string | null>(null);
  let playTimeout: any = null;

  let filteredSounds = $derived.by(() => {
    return SOUNDBOARD_SOUNDS.filter((s) => {
      const matchQuery =
        !searchQuery.trim() ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchCategory =
        selectedCategory === 'all' || s.category === selectedCategory;
      return matchQuery && matchCategory;
    });
  });

  let isInVoice = $derived(!!appState.voiceState.activeChannelId);

  async function handlePlaySound(sound: SoundboardSound) {
    activePlayingId = sound.id;
    clearTimeout(playTimeout);
    playTimeout = setTimeout(() => {
      activePlayingId = null;
    }, 2500);

    // Play locally
    await soundService.playSoundboard(sound);

    // If in a voice channel, broadcast to all participants via WebSocket
    if (isInVoice && appState.voiceState.activeChannelId) {
      clientService.broadcastSoundboard(
        appState.voiceState.activeChannelId,
        sound.id,
        sound.name
      );
    }
  }

  function handleClose() {
    soundService.play('modal-close');
    appState.activeModal = null;
  }
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
  onclick={(e) => {
    if (e.target === e.currentTarget) handleClose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') handleClose();
  }}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    class="bg-[#111214] border border-[#232428] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
  >
    <!-- Header -->
    <div class="px-6 py-4 border-b border-[#1a1b1e] flex items-center justify-between bg-[#0e0f10]">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-[#5865f2]/10 border border-[#5865f2]/20 flex items-center justify-center text-[#5865f2]">
          <Radio class="w-5 h-5" />
        </div>
        <div>
          <h2 class="text-white font-bold text-lg flex items-center space-x-2">
            <span>Concord Soundboard</span>
            <span class="text-[10px] bg-[#5865f2]/20 text-[#5865f2] px-2 py-0.5 rounded-full font-semibold">
              MyInstants
            </span>
          </h2>
          <p class="text-xs text-[#949ba4]">
            {#if isInVoice}
              <span class="text-[#23a55a] font-medium flex items-center space-x-1">
                <span class="w-2 h-2 rounded-full bg-[#23a55a] inline-block animate-pulse"></span>
                <span>Transmitindo para a chamada de voz em tempo real</span>
              </span>
            {:else}
              Clique para tocar sons e efeitos sonoros dinâmicos
            {/if}
          </p>
        </div>
      </div>

      <button
        onclick={handleClose}
        class="text-[#949ba4] hover:text-white p-1.5 rounded-lg hover:bg-[#1a1b1e] transition-colors cursor-pointer"
        aria-label="Fechar"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Search & Category Filters -->
    <div class="p-4 border-b border-[#1a1b1e] space-y-3 bg-[#111214]">
      <!-- Search Input -->
      <div class="relative">
        <Search class="w-4 h-4 text-[#80848e] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Pesquisar efeitos sonoros..."
          class="w-full bg-[#0a0b0c] text-white text-sm pl-9 pr-4 py-2.5 rounded-xl border border-[#232428] focus:border-[#5865f2] focus:outline-none placeholder-[#80848e] transition-colors"
        />
        {#if searchQuery}
          <button
            onclick={() => (searchQuery = '')}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-[#80848e] hover:text-white text-xs"
          >
            Limpar
          </button>
        {/if}
      </div>

      <!-- Categories Pills -->
      <div class="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
        <button
          onclick={() => (selectedCategory = 'all')}
          class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          class:bg-[#5865f2]={selectedCategory === 'all'}
          class:text-white={selectedCategory === 'all'}
          class:bg-[#16171a]={selectedCategory !== 'all'}
          class:text-[#949ba4]={selectedCategory !== 'all'}
          class:hover:text-white={selectedCategory !== 'all'}
          class:border={selectedCategory !== 'all'}
          class:border-[#232428]={selectedCategory !== 'all'}
        >
          <Sparkles class="w-3.5 h-3.5" />
          <span>Todos</span>
          <span class="opacity-60 text-[10px]">({SOUNDBOARD_SOUNDS.length})</span>
        </button>

        <button
          onclick={() => (selectedCategory = 'memes')}
          class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          class:bg-[#5865f2]={selectedCategory === 'memes'}
          class:text-white={selectedCategory === 'memes'}
          class:bg-[#16171a]={selectedCategory !== 'memes'}
          class:text-[#949ba4]={selectedCategory !== 'memes'}
          class:hover:text-white={selectedCategory !== 'memes'}
          class:border={selectedCategory !== 'memes'}
          class:border-[#232428]={selectedCategory !== 'memes'}
        >
          <Flame class="w-3.5 h-3.5 text-[#f0b232]" />
          <span>Memes</span>
        </button>

        <button
          onclick={() => (selectedCategory = 'effects')}
          class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          class:bg-[#5865f2]={selectedCategory === 'effects'}
          class:text-white={selectedCategory === 'effects'}
          class:bg-[#16171a]={selectedCategory !== 'effects'}
          class:text-[#949ba4]={selectedCategory !== 'effects'}
          class:hover:text-white={selectedCategory !== 'effects'}
          class:border={selectedCategory !== 'effects'}
          class:border-[#232428]={selectedCategory !== 'effects'}
        >
          <Radio class="w-3.5 h-3.5 text-[#5865f2]" />
          <span>Efeitos</span>
        </button>

        <button
          onclick={() => (selectedCategory = 'games')}
          class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          class:bg-[#5865f2]={selectedCategory === 'games'}
          class:text-white={selectedCategory === 'games'}
          class:bg-[#16171a]={selectedCategory !== 'games'}
          class:text-[#949ba4]={selectedCategory !== 'games'}
          class:hover:text-white={selectedCategory !== 'games'}
          class:border={selectedCategory !== 'games'}
          class:border-[#232428]={selectedCategory !== 'games'}
        >
          <Gamepad2 class="w-3.5 h-3.5 text-[#23a55a]" />
          <span>Games</span>
        </button>

        <button
          onclick={() => (selectedCategory = 'reactions')}
          class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center space-x-1.5 shrink-0"
          class:bg-[#5865f2]={selectedCategory === 'reactions'}
          class:text-white={selectedCategory === 'reactions'}
          class:bg-[#16171a]={selectedCategory !== 'reactions'}
          class:text-[#949ba4]={selectedCategory !== 'reactions'}
          class:hover:text-white={selectedCategory !== 'reactions'}
          class:border={selectedCategory !== 'reactions'}
          class:border-[#232428]={selectedCategory !== 'reactions'}
        >
          <Smile class="w-3.5 h-3.5 text-[#e91e63]" />
          <span>Reações</span>
        </button>
      </div>
    </div>

    <!-- Sound Grid -->
    <div class="flex-1 overflow-y-auto p-4 max-h-[50vh]">
      {#if filteredSounds.length === 0}
        <div class="py-12 text-center text-[#949ba4] space-y-2">
          <p class="text-sm">Nenhum som encontrado para "{searchQuery}"</p>
          <button
            onclick={() => (searchQuery = '')}
            class="text-xs text-[#5865f2] hover:underline"
          >
            Ver todos os sons
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {#each filteredSounds as sound (sound.id)}
            {@const isPlaying = activePlayingId === sound.id}
            <button
              onclick={() => handlePlaySound(sound)}
              class="group relative p-3.5 rounded-xl border transition-all flex flex-col items-center justify-center text-center space-y-2 cursor-pointer active:scale-95 shadow-md overflow-hidden {isPlaying ? 'bg-[#5865f2]/10 border-[#5865f2]' : 'bg-[#16171a] hover:bg-[#1e1f22] border-[#232428] hover:border-[#5865f2]/40'}"
            >
              <!-- Playing wave glow -->
              {#if isPlaying}
                <div class="absolute inset-0 bg-[#5865f2]/10 pointer-events-none animate-pulse"></div>
              {/if}

              <!-- Icon -->
              <div
                class="w-12 h-12 rounded-2xl bg-[#111214] flex items-center justify-center text-2xl group-hover:scale-110 transition-transform border border-[#232428] shadow-inner"
                class:!border-[#5865f2]={isPlaying}
              >
                {#if isPlaying}
                  <div class="flex items-center space-x-0.5 h-5">
                    <span class="w-1 bg-[#5865f2] rounded-full animate-[bounce_0.6s_infinite_100ms] h-4"></span>
                    <span class="w-1 bg-[#5865f2] rounded-full animate-[bounce_0.6s_infinite_200ms] h-5"></span>
                    <span class="w-1 bg-[#5865f2] rounded-full animate-[bounce_0.6s_infinite_300ms] h-3"></span>
                  </div>
                {:else}
                  <span>{sound.icon}</span>
                {/if}
              </div>

              <!-- Name & Category -->
              <div class="w-full truncate">
                <div class="text-xs font-bold text-white group-hover:text-[#5865f2] transition-colors truncate">
                  {sound.name}
                </div>
                <div class="text-[10px] text-[#80848e] uppercase font-semibold tracking-wider">
                  {sound.category}
                </div>
              </div>

              <!-- Play Indicator Overlay on Hover -->
              <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="w-5 h-5 rounded-full bg-[#5865f2] text-white flex items-center justify-center shadow">
                  <Play class="w-2.5 h-2.5 fill-current ml-0.5" />
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Footer with Volume Slider & Master Toggle -->
    <div class="px-6 py-3 border-t border-[#1a1b1e] bg-[#0e0f10] flex items-center justify-between text-xs">
      <div class="flex items-center space-x-3 text-[#949ba4]">
        <button
          onclick={() => {
            soundService.enabled = !soundService.enabled;
          }}
          class="flex items-center space-x-1.5 hover:text-white transition-colors cursor-pointer"
        >
          {#if soundService.enabled}
            <Volume2 class="w-4 h-4 text-[#23a55a]" />
            <span>Sons Ativados</span>
          {:else}
            <VolumeX class="w-4 h-4 text-[#f23f43]" />
            <span>Sons Mutados</span>
          {/if}
        </button>

        <div class="w-[1px] h-3 bg-[#232428]"></div>

        <div class="flex items-center space-x-2">
          <span class="text-[11px] text-[#80848e]">Volume Soundboard:</span>
          <input
            type="range"
            min="0"
            max="100"
            bind:value={soundService.soundboardVolumePercent}
            class="w-20 accent-[#5865f2] h-1.5 bg-[#232428] rounded-lg cursor-pointer"
          />
          <span class="font-mono text-[10px] w-7 text-white font-bold">{soundService.soundboardVolumePercent}%</span>
        </div>
      </div>

      <button
        onclick={handleClose}
        class="bg-[#232428] hover:bg-[#2b2d31] text-white px-4 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer"
      >
        Fechar
      </button>
    </div>
  </div>
</div>
