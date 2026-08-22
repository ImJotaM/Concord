<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';
  import type { User } from '../types';
  import { Shield, ShieldAlert, UserMinus, Trash2, X, Check, MessageSquare } from '@lucide/svelte';
  import { getAvatarUrl, ICONS8_ICONS } from '../utils/icons8';
  import Avatar from './Avatar.svelte';

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
      return { name: '👑 Dono', color: '#f0b232', isAdmin: true, isOwner: true, priority: 0 };
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
          roleId: customRole.id,
          isAdmin: customRole.is_admin === 1 || customRole.is_admin === true,
          isOwner: false,
          priority: customRole.is_admin === 1 || customRole.is_admin === true ? 1 : 2,
        };
      }
    }
    if (member?.role === 'admin') {
      return { name: '🛡️ Admin', color: '#e91e63', isAdmin: true, isOwner: false, priority: 1 };
    }
    return { name: 'Membros', color: '#949ba4', isAdmin: false, isOwner: false, priority: 3 };
  }

  function groupedOnlineUsers() {
    const groups: Record<string, { name: string; priority: number; users: User[] }> = {};

    onlineUsers.forEach((u) => {
      const roleInfo = getUserRoleInfo(u.id);
      let groupKey = roleInfo.name;

      if (u.id === 'user-system') {
        groupKey = '🤖 Concord Bot';
      } else if (roleInfo.isOwner) {
        groupKey = '👑 Dono do Servidor';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          name: groupKey,
          priority: u.id === 'user-system' ? -1 : roleInfo.priority,
          users: [],
        };
      }
      groups[groupKey].users.push(u);
    });

    return Object.values(groups).sort((a, b) => a.priority - b.priority);
  }
</script>

<aside class="w-60 bg-[#111214] flex flex-col h-full select-none shrink-0 border-l border-[#1a1b1e] relative">
  <div class="flex-1 overflow-y-auto px-3 py-3 space-y-4">
    <!-- ROLE-GROUPED ONLINE USERS -->
    {#each groupedOnlineUsers() as group}
      <div>
        <div class="text-[11px] font-extrabold text-[#949ba4] px-1 mb-1 tracking-wider uppercase flex items-center justify-between">
          <span>{group.name}</span>
          <span class="text-[10px] font-bold text-[#80848e]">{group.users.length}</span>
        </div>

        <div class="space-y-[2px]">
          {#each group.users as user (user.id)}
            {@const roleInfo = getUserRoleInfo(user.id)}
            <button
              type="button"
              onclick={() => (selectedUser = user)}
              class="w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#16171a] transition-colors cursor-pointer group text-left"
            >
              <div class="relative shrink-0">
                <Avatar
                  name={user.displayName || user.username}
                  avatar={user.avatar}
                  userId={user.id}
                  size="md"
                />
                <div
                  class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#111214] {statusColors[
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
                    <img src={ICONS8_ICONS.crown.url} alt="Dono" class="w-3.5 h-3.5 shrink-0 object-contain" title="Dono do Servidor" />
                  {:else if roleInfo.isAdmin}
                    <img src={ICONS8_ICONS.shield.url} alt="Admin" class="w-3.5 h-3.5 shrink-0 object-contain" title="Administrador" />
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
    {/each}

    <!-- OFFLINE USERS -->
    {#if offlineUsers.length > 0}
      <div>
        <div class="text-[11px] font-extrabold text-[#949ba4] px-1 mb-1 tracking-wider uppercase flex items-center justify-between">
          <span>OFFLINE</span>
          <span class="text-[10px] font-bold text-[#80848e]">{offlineUsers.length}</span>
        </div>

        <div class="space-y-[2px] opacity-60">
          {#each offlineUsers as user (user.id)}
            {@const roleInfo = getUserRoleInfo(user.id)}
            <button
              type="button"
              onclick={() => (selectedUser = user)}
              class="w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[#16171a] transition-colors cursor-pointer group text-left"
            >
              <div class="relative shrink-0">
                <Avatar
                  name={user.displayName || user.username}
                  avatar={user.avatar}
                  userId={user.id}
                  size="md"
                />
                <div class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#111214] bg-[#80848e]"></div>
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
      class="fixed inset-0 bg-black/60 z-40"
      onclick={() => (selectedUser = null)}
      onkeydown={(e) => { if (e.key === 'Escape') selectedUser = null; }}
    ></div>

    <!-- Popup Card -->
    <div
      class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-[#111214] border border-[#232428] rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Profile Banner -->
      <div
        class="h-16 w-full relative"
        style="background: linear-gradient(135deg, {roleInfo.color || '#5865f2'} 0%, #0e0f10 100%);"
      >
        <button
          onclick={() => (selectedUser = null)}
          class="absolute top-2 right-2 text-white/80 hover:text-white p-1 rounded-full bg-black/30 hover:bg-black/50 transition-colors cursor-pointer"
          title="Fechar"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="px-5 pb-5 pt-0 space-y-3.5">
        <!-- Avatar overlapping banner -->
        <div class="flex items-end justify-between -mt-9">
          <div class="relative">
            <div class="rounded-2xl ring-4 ring-[#111214] shadow-xl overflow-hidden">
              <Avatar
                name={user.displayName || user.username}
                avatar={user.avatar}
                userId={user.id}
                size="xl"
                shape="rounded"
              />
            </div>
            <div
              class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-[#111214] {statusColors[
                user.status || 'online'
              ]}"
            ></div>
          </div>

          <div class="flex items-center space-x-1">
            {#if user.id === 'user-system'}
              <span class="bg-[#5865f2] text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                <img src={ICONS8_ICONS.robot.url} class="w-3 h-3 object-contain" alt="Bot" />
                BOT
              </span>
            {:else if roleInfo.isOwner}
              <span class="bg-[#f0b232]/15 text-[#f0b232] border border-[#f0b232]/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <img src={ICONS8_ICONS.crown.url} class="w-3 h-3 object-contain" alt="Crown" />
                <span>Dono</span>
              </span>
            {:else if roleInfo.isAdmin}
              <span class="bg-[#e91e63]/15 text-[#e91e63] border border-[#e91e63]/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                <img src={ICONS8_ICONS.shield.url} class="w-3 h-3 object-contain" alt="Shield" />
                <span>Admin</span>
              </span>
            {/if}
          </div>
        </div>

        <div>
          <div class="font-bold text-white text-lg leading-tight">
            {user.displayName || user.username}
          </div>
          <div class="text-xs text-[#949ba4] font-medium">
            @{user.username}
          </div>
        </div>

        {#if user.customStatus}
          <div class="bg-[#16171a] px-3 py-2 rounded-xl text-xs text-[#dbdee1] border border-[#232428] relative">
            <span class="text-[#949ba4] block text-[10px] font-bold uppercase mb-0.5">Status</span>
            {user.customStatus}
          </div>
        {/if}

        {#if !isSelf && user.id !== 'user-system'}
          <button
            type="button"
            onclick={() => {
              appState.openDm(user.id);
              selectedUser = null;
            }}
            class="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer shadow hover:shadow-[#5865f2]/30 active:scale-95"
          >
            <MessageSquare class="w-4 h-4" />
            <span>Enviar Mensagem Privada</span>
          </button>
        {/if}

        <!-- Roles Section -->
        <div class="bg-[#16171a] p-3 rounded-xl border border-[#232428] space-y-2">
          <div class="flex items-center justify-between text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">
            <span>Cargo no Servidor</span>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <span
              class="px-2.5 py-1 rounded-md text-xs font-bold text-white shadow-sm flex items-center space-x-1"
              style="background-color: {roleInfo.color || '#5865f2'}"
            >
              <span>{roleInfo.name}</span>
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
      </div>
    {/if}
  </aside>
