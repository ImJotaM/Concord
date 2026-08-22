<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { X } from '@lucide/svelte';
  import { SERVER_ICON_OPTIONS } from '../../utils/icons8';

  let serverName = $state('');
  let serverIcon = $state('controller');

  function handleCreate() {
    const name = serverName.trim();
    if (!name) return;

    clientService.createServer(name, serverIcon);
    appState.activeModal = null;
  }
</script>

<div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#111214] w-full max-w-md rounded-2xl shadow-2xl border border-[#232428] overflow-hidden">
    <!-- Header -->
    <div class="p-4 bg-[#16171a] flex items-center justify-between border-b border-[#232428]">
      <h3 class="font-bold text-white text-base">Criar Servidor LAN</h3>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1 rounded-full hover:bg-[#232428] transition-colors cursor-pointer"
        title="Fechar"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Body -->
    <div class="p-5 space-y-4">
      <p class="text-xs text-[#949ba4] leading-relaxed">
        Seu servidor LAN permite conversar, entrar em canais de voz ultra-rápidos e transferir arquivos gigabytes com seus amigos na rede local.
      </p>

      <!-- Server Icon Picker -->
      <div>
        <span class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-2">
          Ícone do Servidor (Icons8)
        </span>
        <div class="grid grid-cols-4 gap-2.5">
          {#each SERVER_ICON_OPTIONS as opt}
            <button
              type="button"
              onclick={() => (serverIcon = opt.key)}
              class="flex flex-col items-center justify-center p-2 rounded-xl bg-[#16171a] hover:bg-[#1e1f22] border border-[#232428] transition-all cursor-pointer group"
              class:!border-[#5865f2]={serverIcon === opt.key}
              class:!bg-[#1e1f22]={serverIcon === opt.key}
              class:ring-2={serverIcon === opt.key}
              class:ring-[#5865f2]={serverIcon === opt.key}
            >
              <img
                src={opt.url}
                alt={opt.name}
                class="w-9 h-9 object-contain group-hover:scale-110 transition-transform mb-1"
                loading="lazy"
              />
              <span class="text-[10px] font-medium text-[#dbdee1] truncate max-w-full">{opt.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Server Name Input -->
      <div>
        <label for="server-name-input" class="block text-xs font-bold uppercase tracking-wider text-[#949ba4] mb-1.5">
          Nome do Servidor
        </label>
        <input
          id="server-name-input"
          type="text"
          bind:value={serverName}
          placeholder="Ex: Squad LAN 2026"
          class="w-full bg-[#16171a] text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#5865f2] border border-[#232428]"
        />
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 bg-[#16171a] flex justify-end space-x-2 border-t border-[#232428]">
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-white hover:underline text-sm font-semibold px-4 py-2 cursor-pointer"
      >
        Cancelar
      </button>
      <button
        onclick={handleCreate}
        disabled={!serverName.trim()}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-5 py-2 rounded-xl font-bold transition-all disabled:opacity-50 shadow-md cursor-pointer"
      >
        Criar Servidor
      </button>
    </div>
  </div>
</div>
