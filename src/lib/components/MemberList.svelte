<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import type { User } from '../types';
  import { Shield, ShieldAlert, UserMinus, Trash2, X, Check } from '@lucide/svelte';

  const statusColors: Record<string, string> = {
    online: 'bg-[#23a55a]',
    idle: 'bg-[#f0b232]',
    dnd: 'bg-[#f23f43]',
    offline: 'bg-[#80848e]',
  };

  let onlineUsers = $derived(appState.onlineUsers);
  let offlineUsers = $derived(appState.offlineUsers);
  let selectedUser = $state<User | null>(null);

  function getUserRoleInfo(userId: string) {
    const isOwner = appState.currentServer?.owner_id === userId;
    if (isOwner) {
      return { name: '👑 Dono', color: '#f0b232', isAdmin: true, isOwner: true };
    }
    const member = appState.serverMembers.find(
      (sm) => sm.server_id === appState.currentServerId && sm.user_id === userId
    );
    if (member?.role_id) {
      const customRole = appState.roles.find((r) => r.id === member.role_id);
      if (customRole) {
        return {
          name: customRole.name,
          color: customRole.color || '#5865f2',
          isAdmin: customRole.is_admin === 1 || customRole.is_admin === true,
          isOwner: false,
          roleId: customRole.id,
        };
      }
    }
    if (member?.role === 'admin') {
      return { name: '🛡️ Admin', color: '#e91e63', isAdmin: true, isOwner: false };
    }
    if (member?.role === 'moderator' || member?.role === 'mod') {
      return { name: '⚔️ Mod', color: '#2ecc71', isAdmin: false, isOwner: false };
    }
    return { name: 'Membro', color: '#949ba4', isAdmin: false, isOwner: false };
  }
</script>

<aside class="w-60 bg-[#2b2d31] flex flex-col h-full select-none shrink-0 border-l border-[#1f2023]/60 relative">
  <div class="flex-1 overflow-y-auto px-3 py-4 space-y-4">
    <!-- ONLINE USERS -->
    <div>
      <div class="text-[12px] font-bold text-[#949ba4] px-1 mb-1 tracking-wider uppercase">
        Online — {onlineUsers.length}
      </div>

      <div class="space-y-[2px]">
        {#each onlineUsers as user (user.id)}
          {@const roleInfo = getUserRoleInfo(user.id)}
          <button
            type="button"
            onclick={() => (selectedUser = user)}
            class="w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#35373c] transition-colors cursor-pointer group text-left"
          >
            <div class="relative shrink-0">
              <div class="w-8 h-8 rounded-full bg-[#1e1f22] flex items-center justify-center text-sm shadow-sm">
                <span>{user.avatar || '👤'}</span>
              </div>
              <div
                class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#2b2d31] {statusColors[
                  user.status || 'online'
                ]}"
              ></div>
            </div>

            <div class="truncate leading-tight flex-1 min-w-0">
              <div class="flex items-center space-x-1.5 truncate">
                <span
                  class="text-xs font-semibold truncate group-hover:underline"
                  style="color: {roleInfo.color || '#dbdee1'}"
                >
                  {user.displayName || user.username || 'Membro'}
                </span>
                {#if user.id === 'user-system'}
                  <span class="bg-[#5865f2] text-white text-[9px] font-bold px-1 rounded uppercase tracking-wider shrink-0">
                    BOT
                  </span>
                {:else if roleInfo.isOwner}
                  <span class="text-[10px] shrink-0" title="Dono do Servidor">👑</span>
                {:else if roleInfo.isAdmin}
                  <span class="text-[10px] shrink-0" title="Administrador">🛡️</span>
                {/if}
              </div>
              {#if user.customStatus}
                <div class="text-[11px] text-[#949ba4] truncate font-normal mt-0.5">
                  {user.customStatus}
                </div>
              {/if}
            </div>
          </button>
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
            {@const roleInfo = getUserRoleInfo(user.id)}
            <button
              type="button"
              onclick={() => (selectedUser = user)}
              class="w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#35373c] transition-colors cursor-pointer group text-left"
            >
              <div class="relative shrink-0">
                <div class="w-8 h-8 rounded-full bg-[#1e1f22] flex items-center justify-center text-sm grayscale shadow-sm">
                  <span>{user.avatar || '👤'}</span>
                </div>
                <div class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#2b2d31] bg-[#80848e]"></div>
              </div>

              <div class="truncate leading-tight flex-1 min-w-0">
                <div
                  class="text-xs font-medium truncate"
                  style="color: {roleInfo.color || '#949ba4'}"
                >
                  {user.displayName || user.username || 'Membro'}
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- SELECTED USER PROFILE / MODERATION POPUP -->
  {#if selectedUser}
    {@const user = selectedUser}
    {@const roleInfo = getUserRoleInfo(user.id)}
    {@const isTargetOwner = appState.currentServer?.owner_id === user.id}
    {@const isSelf = user.id === appState.currentUser.id}

    <!-- Backdrop -->
    <div
      role="button"
      tabindex="0"
      class="fixed inset-0 bg-black/40 z-40"
      onclick={() => (selectedUser = null)}
      onkeydown={(e) => { if (e.key === 'Escape') selectedUser = null; }}
    ></div>

    <!-- Popup Card -->
    <div
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-[#232428] border border-[#111214] rounded-2xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-14 h-14 rounded-full bg-[#1e1f22] flex items-center justify-center text-2xl shadow ring-4 ring-[#111214]">
            <span>{user.avatar || '👤'}</span>
          </div>
          <div>
            <div class="font-bold text-white text-base leading-tight">
              {user.displayName || user.username}
            </div>
            <div class="text-xs text-[#949ba4]">
              @{user.username}
            </div>
          </div>
        </div>
        <button
          onclick={() => (selectedUser = null)}
          class="text-[#949ba4] hover:text-white p-1 rounded-full hover:bg-[#35373c] transition-colors"
          title="Fechar"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      {#if user.customStatus}
        <div class="bg-[#111214] px-3 py-2 rounded-lg text-xs text-[#dbdee1]">
          <span class="text-[#949ba4] block text-[10px] font-bold uppercase mb-0.5">Status</span>
          {user.customStatus}
        </div>
      {/if}

      <!-- Roles Section -->
      <div class="bg-[#1e1f22] p-3 rounded-xl border border-[#111214] space-y-2">
        <div class="flex items-center justify-between text-xs font-bold text-[#949ba4] uppercase tracking-wider">
          <span>Cargo no Servidor</span>
          {#if roleInfo.isAdmin}
            <span class="text-[#f0b232] text-[10px] flex items-center space-x-1 font-bold">
              <Shield class="w-3 h-3" />
              <span>Admin</span>
            </span>
          {/if}
        </div>

        <div class="flex items-center space-x-2">
          <span
            class="px-2.5 py-1 rounded-md text-xs font-bold text-white shadow-sm"
            style="background-color: {roleInfo.color || '#5865f2'}"
          >
            {roleInfo.name}
          </span>
        </div>

        <!-- Role Assignment Selector (if user has manage roles) -->
        {#if appState.canManageRoles && !isTargetOwner && user.id !== 'user-system'}
          <div class="pt-2 border-t border-[#2b2d31]">
            <label class="block text-[11px] text-[#949ba4] font-medium mb-1">
              Atribuir Cargo:
            </label>
            <select
              value={roleInfo.roleId || 'none'}
              onchange={(e) => {
                const target = e.target as HTMLSelectElement;
                const val = target.value;
                clientService.assignMemberRole(appState.currentServerId, user.id, val);
              }}
              class="w-full bg-[#111214] border border-[#2b2d31] text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5865f2]"
            >
              <option value="none">👤 Sem Cargo (Membro)</option>
              {#each appState.currentRoles as r}
                <option value={r.id}>
                  {r.is_admin === 1 || r.is_admin === true ? '🛡️' : '🏷️'} {r.name} {r.is_admin === 1 || r.is_admin === true ? '(Admin)' : ''}
                </option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      <!-- Moderation Actions -->
      {#if (appState.canKickMembers || appState.isCurrentUserAdmin) && !isTargetOwner && !isSelf && user.id !== 'user-system'}
        <div class="space-y-2 pt-1">
          <div class="text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">
            Moderação
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => {
                if (confirm(`Expulsar ${user.displayName || user.username} deste servidor?`)) {
                  clientService.kickMember(appState.currentServerId, user.id);
                  selectedUser = null;
                }
              }}
              class="bg-[#da373c]/15 hover:bg-[#da373c] text-[#da373c] hover:text-white py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-[#da373c]/30"
            >
              <UserMinus class="w-3.5 h-3.5" />
              <span>Expulsar</span>
            </button>

            {#if appState.isCurrentUserOwner}
              <button
                type="button"
                onclick={() => {
                  if (confirm(`EXCLUIR PERMANENTEMENTE a conta de ${user.displayName || user.username} do sistema LAN?`)) {
                    clientService.deleteUser(user.id);
                    selectedUser = null;
                  }
                }}
                class="bg-[#da373c] hover:bg-[#a1282c] text-white py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Deletar Conta</span>
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</aside>
