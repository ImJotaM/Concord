<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { clientService } from '../../api/wsClient';
  import { Shield, Plus, Trash2, X, Users, Settings, Check } from '@lucide/svelte';

  let activeTab = $state<'roles' | 'members' | 'server'>('roles');

  // New role form state
  let newRoleName = $state('');
  let newRoleColor = $state('#5865f2');
  let newRoleIsAdmin = $state(false);

  const presetColors = [
    '#5865f2', // Discord Blurple
    '#57f287', // Green
    '#fee75c', // Yellow
    '#eb459e', // Fuchsia
    '#ed4245', // Red
    '#9b59b6', // Purple
    '#e67e22', // Orange
    '#1abc9c', // Teal
    '#99aab5', // Gray
  ];

  let currentServer = $derived(appState.currentServer);
  let serverRoles = $derived(appState.currentRoles);
  let serverMembers = $derived(appState.currentServerMembers);

  function handleCreateRole() {
    const name = newRoleName.trim();
    if (!name || !currentServer) return;

    clientService.createRole(currentServer.id, name, newRoleColor, newRoleIsAdmin);
    newRoleName = '';
    newRoleColor = '#5865f2';
    newRoleIsAdmin = false;
  }

  function handleDeleteRole(roleId: string) {
    if (!currentServer) return;
    if (confirm('Tem certeza que deseja excluir este cargo? Os membros associados perderão as permissões deste cargo.')) {
      clientService.deleteRole(roleId, currentServer.id);
    }
  }

  function getMemberUserInfo(userId: string) {
    return appState.users.find((u) => u.id === userId) || {
      id: userId,
      username: 'Desconhecido',
      displayName: 'Membro',
      avatar: '👤',
      status: 'offline',
    };
  }
</script>

<div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-[#313338] w-full max-w-2xl rounded-2xl shadow-2xl border border-[#1f2023] overflow-hidden flex flex-col max-h-[85vh]">
    <!-- Header -->
    <div class="p-4 bg-[#2b2d31] flex items-center justify-between border-b border-[#1f2023] shrink-0">
      <div class="flex items-center space-x-2.5">
        <div class="w-8 h-8 rounded-lg bg-[#5865f2] flex items-center justify-center text-white text-base shadow">
          <Shield class="w-5 h-5" />
        </div>
        <div>
          <h3 class="font-bold text-white text-base leading-tight">
            Gerenciamento do Servidor — {currentServer?.name}
          </h3>
          <p class="text-xs text-[#949ba4]">
            Controle cargos, permissões de administrador e membros da rede.
          </p>
        </div>
      </div>
      <button
        onclick={() => (appState.activeModal = null)}
        class="text-[#949ba4] hover:text-white p-1.5 rounded-full hover:bg-[#35373c] transition-colors cursor-pointer"
        title="Fechar"
      >
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center space-x-1 px-4 pt-3 border-b border-[#1f2023] bg-[#2b2d31]/50 shrink-0">
      <button
        onclick={() => (activeTab = 'roles')}
        class="flex items-center space-x-1.5 px-4 py-2 border-b-2 font-semibold text-xs transition-colors cursor-pointer"
        class:border-[#5865f2]={activeTab === 'roles'}
        class:text-white={activeTab === 'roles'}
        class:border-transparent={activeTab !== 'roles'}
        class:text-[#949ba4]={activeTab !== 'roles'}
        class:hover:text-[#dbdee1]={activeTab !== 'roles'}
      >
        <Shield class="w-4 h-4" />
        <span>Cargos & Permissões ({serverRoles.length})</span>
      </button>

      <button
        onclick={() => (activeTab = 'members')}
        class="flex items-center space-x-1.5 px-4 py-2 border-b-2 font-semibold text-xs transition-colors cursor-pointer"
        class:border-[#5865f2]={activeTab === 'members'}
        class:text-white={activeTab === 'members'}
        class:border-transparent={activeTab !== 'members'}
        class:text-[#949ba4]={activeTab !== 'members'}
        class:hover:text-[#dbdee1]={activeTab !== 'members'}
      >
        <Users class="w-4 h-4" />
        <span>Membros ({serverMembers.length})</span>
      </button>

      <button
        onclick={() => (activeTab = 'server')}
        class="flex items-center space-x-1.5 px-4 py-2 border-b-2 font-semibold text-xs transition-colors cursor-pointer"
        class:border-[#5865f2]={activeTab === 'server'}
        class:text-white={activeTab === 'server'}
        class:border-transparent={activeTab !== 'server'}
        class:text-[#949ba4]={activeTab !== 'server'}
        class:hover:text-[#dbdee1]={activeTab !== 'server'}
      >
        <Settings class="w-4 h-4" />
        <span>Configurações</span>
      </button>
    </div>

    <!-- Tab Contents -->
    <div class="p-5 flex-1 overflow-y-auto space-y-5">
      {#if activeTab === 'roles'}
        <!-- NEW ROLE BUILDER -->
        <div class="bg-[#2b2d31] p-4 rounded-xl border border-[#1f2023] space-y-3 shadow-sm">
          <div class="text-xs font-bold uppercase tracking-wider text-white flex items-center space-x-1.5">
            <Plus class="w-4 h-4 text-[#5865f2]" />
            <span>Criar Novo Cargo</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-bold text-[#949ba4] uppercase mb-1">
                Nome do Cargo
              </label>
              <input
                type="text"
                bind:value={newRoleName}
                placeholder="Ex: Moderador Chefe, VIP, Gamer..."
                class="w-full bg-[#1e1f22] text-white text-xs px-3 py-2 rounded-lg border border-[#1f2023] focus:outline-none focus:border-[#5865f2]"
              />
            </div>

            <div>
              <label class="block text-[11px] font-bold text-[#949ba4] uppercase mb-1">
                Cor do Cargo
              </label>
              <div class="flex items-center space-x-2 pt-1">
                <div class="flex items-center space-x-1.5">
                  {#each presetColors as col}
                    <button
                      type="button"
                      onclick={() => (newRoleColor = col)}
                      class="w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center shadow-sm"
                      style="background-color: {col}"
                      class:scale-125={newRoleColor === col}
                      class:ring-2={newRoleColor === col}
                      class:ring-white={newRoleColor === col}
                    >
                      {#if newRoleColor === col}
                        <Check class="w-3 h-3 text-white stroke-[3]" />
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          <!-- Admin Permission Checkbox -->
          <label class="flex items-center space-x-2.5 cursor-pointer bg-[#1e1f22] p-2.5 rounded-lg border border-[#1f2023]">
            <input
              type="checkbox"
              bind:checked={newRoleIsAdmin}
              class="w-4 h-4 text-[#5865f2] rounded focus:ring-0 focus:ring-offset-0 bg-[#2b2d31] border-[#1f2023]"
            />
            <div>
              <div class="text-xs font-bold text-white flex items-center space-x-1">
                <span>Permissão de Administrador</span>
                <span class="text-[#f0b232] text-[10px] font-normal">(Controle Total)</span>
              </div>
              <p class="text-[11px] text-[#949ba4]">
                Membros com este cargo têm os mesmos poderes do Host: deletar mensagens, expulsar membros, criar/excluir salas e atribuir cargos.
              </p>
            </div>
          </label>

          <div class="flex justify-end pt-1">
            <button
              type="button"
              onclick={handleCreateRole}
              disabled={!newRoleName.trim()}
              class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center space-x-1.5 shadow cursor-pointer"
            >
              <Plus class="w-4 h-4" />
              <span>Salvar Novo Cargo</span>
            </button>
          </div>
        </div>

        <!-- ROLES LIST -->
        <div class="space-y-2">
          <div class="text-xs font-bold text-[#949ba4] uppercase tracking-wider">
            Cargos Existentes no Servidor
          </div>

          {#if serverRoles.length === 0}
            <p class="text-xs text-[#949ba4] italic py-2">
              Nenhum cargo customizado criado ainda. Crie um acima para gerenciar permissões!
            </p>
          {/if}

          {#each serverRoles as role (role.id)}
            <div class="flex items-center justify-between bg-[#2b2d31] hover:bg-[#35373c] p-3 rounded-xl border border-[#1f2023] transition-colors">
              <div class="flex items-center space-x-3">
                <div
                  class="w-4 h-4 rounded-full shadow-inner shrink-0"
                  style="background-color: {role.color || '#5865f2'}"
                ></div>
                <div>
                  <div class="font-bold text-white text-sm flex items-center space-x-1.5">
                    <span>{role.name}</span>
                    {#if role.is_admin === 1 || role.is_admin === true}
                      <span class="bg-[#f0b232]/20 text-[#f0b232] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#f0b232]/30 flex items-center space-x-1">
                        <Shield class="w-3 h-3" />
                        <span>ADMIN</span>
                      </span>
                    {/if}
                  </div>
                  <div class="text-[11px] text-[#949ba4]">
                    {role.is_admin ? 'Acesso total a moderação e canais' : 'Permissões padrão'}
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  onclick={() => handleDeleteRole(role.id)}
                  class="p-2 text-[#949ba4] hover:text-[#da373c] hover:bg-[#da373c]/10 rounded-lg transition-colors cursor-pointer"
                  title="Excluir Cargo"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'members'}
        <!-- MEMBERS LIST -->
        <div class="space-y-3">
          <div class="text-xs font-bold text-[#949ba4] uppercase tracking-wider">
            Membros deste Servidor ({serverMembers.length})
          </div>

          <div class="space-y-2">
            {#each serverMembers as member (member.user_id)}
              {@const user = getMemberUserInfo(member.user_id)}
              {@const isOwner = currentServer?.owner_id === member.user_id}
              {@const isSelf = member.user_id === appState.currentUser.id}

              <div class="flex items-center justify-between bg-[#2b2d31] p-3 rounded-xl border border-[#1f2023]">
                <div class="flex items-center space-x-3 min-w-0 mr-3">
                  <div class="w-9 h-9 rounded-full bg-[#1e1f22] flex items-center justify-center text-base shrink-0 shadow">
                    <span>{user.avatar || '👤'}</span>
                  </div>
                  <div class="truncate min-w-0">
                    <div class="font-bold text-white text-xs truncate flex items-center space-x-1">
                      <span>{user.displayName || user.username}</span>
                      {#if isOwner}
                        <span class="text-[10px]" title="Dono do Servidor">👑</span>
                      {/if}
                    </div>
                    <div class="text-[10px] text-[#949ba4] truncate">
                      @{user.username} • Cargo atual: <strong class="text-white">{member.role_name || member.role || 'Membro'}</strong>
                    </div>
                  </div>
                </div>

                <!-- Action / Role Selector -->
                <div class="flex items-center space-x-2 shrink-0">
                  {#if !isOwner && !isSelf}
                    <select
                      value={member.role_id || 'none'}
                      onchange={(e) => {
                        const target = e.target as HTMLSelectElement;
                        const val = target.value;
                        if (!currentServer) return;
                        clientService.assignMemberRole(currentServer.id, member.user_id, val);
                      }}
                      class="bg-[#1e1f22] border border-[#1f2023] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#5865f2]"
                    >
                      <option value="none">👤 Sem Cargo (Membro)</option>
                      {#each serverRoles as r}
                        <option value={r.id}>
                          {r.is_admin === 1 || r.is_admin === true ? '🛡️' : '🏷️'} {r.name} {r.is_admin === 1 || r.is_admin === true ? '(Admin)' : ''}
                        </option>
                      {/each}
                    </select>

                    <button
                      type="button"
                      onclick={() => {
                        if (currentServer && confirm(`Expulsar ${user.displayName || user.username} do servidor?`)) {
                          clientService.kickMember(currentServer.id, member.user_id);
                        }
                      }}
                      class="p-1.5 text-[#da373c] hover:bg-[#da373c]/15 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      title="Expulsar do Servidor"
                    >
                      Expulsar
                    </button>
                  {:else if isOwner}
                    <span class="text-xs font-bold text-[#f0b232] px-2 py-1 bg-[#f0b232]/10 rounded-md">
                      Dono
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else if activeTab === 'server'}
        <!-- SERVER SETTINGS -->
        <div class="space-y-4">
          <div class="bg-[#2b2d31] p-4 rounded-xl border border-[#1f2023] space-y-3">
            <div class="text-xs font-bold uppercase tracking-wider text-white">
              Detalhes do Servidor
            </div>
            <div class="flex items-center space-x-3">
              <div class="w-12 h-12 rounded-xl bg-[#1e1f22] flex items-center justify-center text-2xl shadow">
                {currentServer?.icon || '🌐'}
              </div>
              <div>
                <div class="font-bold text-white text-base">{currentServer?.name}</div>
                <div class="text-xs text-[#949ba4]">ID: {currentServer?.id}</div>
              </div>
            </div>
          </div>

          {#if appState.canDeleteServer}
            <!-- DANGER ZONE -->
            <div class="bg-[#da373c]/10 border border-[#da373c]/30 p-4 rounded-xl space-y-3">
              <div class="text-xs font-bold uppercase tracking-wider text-[#da373c]">
                Zona de Perigo
              </div>
              <p class="text-xs text-[#949ba4]">
                Excluir o servidor apagará permanentemente todos os canais de texto, salas de voz e mensagens para todos os computadores conectados.
              </p>
              <button
                type="button"
                onclick={() => {
                  if (currentServer && confirm(`Deseja realmente EXCLUIR o servidor "${currentServer.name}"? Esta ação não pode ser desfeita.`)) {
                    clientService.deleteServer(currentServer.id);
                    appState.activeModal = null;
                  }
                }}
                class="bg-[#da373c] hover:bg-[#a1282c] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center space-x-1.5 shadow cursor-pointer"
              >
                <Trash2 class="w-4 h-4" />
                <span>Excluir Servidor Definitivamente</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="p-4 bg-[#2b2d31] flex justify-end border-t border-[#1f2023] shrink-0">
      <button
        onclick={() => (appState.activeModal = null)}
        class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs px-5 py-2 rounded-lg font-bold transition-colors cursor-pointer"
      >
        Concluir
      </button>
    </div>
  </div>
</div>
