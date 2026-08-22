<script lang="ts">
  import { appState } from '../stores/appState.svelte';

  const statusColors: Record<string, string> = {
    online: 'bg-[#23a55a]',
    idle: 'bg-[#f0b232]',
    dnd: 'bg-[#f23f43]',
    offline: 'bg-[#80848e]',
  };

  let onlineUsers = $derived(appState.onlineUsers);
  let offlineUsers = $derived(appState.offlineUsers);
</script>

<aside class="w-60 bg-[#2b2d31] flex flex-col h-full select-none shrink-0 border-l border-[#1f2023]/60">
  <div class="flex-1 overflow-y-auto px-3 py-4 space-y-4">
    <!-- ONLINE USERS -->
    <div>
      <div class="text-[12px] font-bold text-[#949ba4] px-1 mb-1 tracking-wider uppercase">
        Online — {onlineUsers.length}
      </div>

      <div class="space-y-[2px]">
        {#each onlineUsers as user (user.id)}
          <div
            class="flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#35373c] transition-colors cursor-pointer group"
          >
            <div class="relative">
              <div class="w-8 h-8 rounded-full bg-[#1e1f22] flex items-center justify-center text-sm">
                <span>{user.avatar || '👤'}</span>
              </div>
              <div
                class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#2b2d31] {statusColors[
                  user.status || 'online'
                ]}"
              ></div>
            </div>

            <div class="truncate leading-tight flex-1">
              <div class="flex items-center space-x-1">
                <span class="text-xs font-semibold text-[#dbdee1] group-hover:text-white truncate">
                  {user.displayName}
                </span>
                {#if user.id === 'user-system'}
                  <span class="bg-[#5865f2] text-white text-[9px] font-bold px-1 rounded uppercase tracking-wider">
                    BOT
                  </span>
                {/if}
              </div>
              {#if user.customStatus}
                <div class="text-[11px] text-[#949ba4] truncate font-normal">
                  {user.customStatus}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- OFFLINE USERS -->
    {#if offlineUsers.length > 0}
      <div>
        <div class="text-[12px] font-bold text-[#949ba4] px-1 mb-1 tracking-wider uppercase">
          Offline — {offlineUsers.length}
        </div>

        <div class="space-y-[2px] opacity-60">
          {#each offlineUsers as user (user.id)}
            <div
              class="flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#35373c] transition-colors cursor-pointer group"
            >
              <div class="relative">
                <div class="w-8 h-8 rounded-full bg-[#1e1f22] flex items-center justify-center text-sm grayscale">
                  <span>{user.avatar || '👤'}</span>
                </div>
                <div class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#2b2d31] bg-[#80848e]"></div>
              </div>

              <div class="truncate leading-tight flex-1">
                <div class="text-xs font-medium text-[#949ba4] group-hover:text-[#dbdee1] truncate">
                  {user.displayName}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</aside>
