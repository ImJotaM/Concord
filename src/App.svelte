<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from './lib/stores/appState.svelte';
  import { clientService } from './lib/api/wsClient';
  import { serverHostService } from './lib/api/serverHostService';
  import ServerSidebar from './lib/components/ServerSidebar.svelte';
  import ChannelSidebar from './lib/components/ChannelSidebar.svelte';
  import DirectMessagesSidebar from './lib/components/DirectMessagesSidebar.svelte';
  import DirectMessageChatArea from './lib/components/DirectMessageChatArea.svelte';
  import FriendsView from './lib/components/FriendsView.svelte';
  import ChatArea from './lib/components/ChatArea.svelte';
  import VoiceRoomView from './lib/components/VoiceRoomView.svelte';
  import WebBrowserView from './lib/components/WebBrowserView.svelte';
  import MemberList from './lib/components/MemberList.svelte';
  import NotificationToast from './lib/components/NotificationToast.svelte';
  import DiscoveryModal from './lib/components/Modals/DiscoveryModal.svelte';
  import CreateChannelModal from './lib/components/Modals/CreateChannelModal.svelte';
  import CreateServerModal from './lib/components/Modals/CreateServerModal.svelte';
  import UserSettingsModal from './lib/components/Modals/UserSettingsModal.svelte';
  import HostServerModal from './lib/components/Modals/HostServerModal.svelte';
  import MicPermissionModal from './lib/components/Modals/MicPermissionModal.svelte';
  import ServerRolesModal from './lib/components/Modals/ServerRolesModal.svelte';
  import SoundboardModal from './lib/components/Modals/SoundboardModal.svelte';
  import ImagePreviewModal from './lib/components/Modals/ImagePreviewModal.svelte';
  import GlobalVoiceAudio from './lib/components/GlobalVoiceAudio.svelte';
  import { soundService } from './lib/services/soundService.svelte';

  let showMembers = $state(true);

  let currentChannel = $derived(appState.currentChannel);
  let isVoiceChannel = $derived(currentChannel?.type === 'voice');

  onMount(() => {
    // Preload top MyInstants soundboard assets
    soundService.preloadSounds();
    // Initialize server host status detection
    serverHostService.init();
    // Connect to the configured LAN server
    clientService.connect();
  });
</script>

<main class="flex h-screen w-screen bg-[#0e0f10] overflow-hidden select-none font-sans text-[#dbdee1]">
  <!-- Persistent background audio for ongoing voice calls -->
  <GlobalVoiceAudio />

  <!-- Global In-App Discord-Style Notification Toasts -->
  <NotificationToast />

  <!-- 1. Leftmost Server Rail -->
  <ServerSidebar />

  <!-- 2. Channels Sidebar (or Direct Messages Sidebar when in DMs view) -->
  {#if appState.currentView === 'dms'}
    <DirectMessagesSidebar />
  {:else}
    <ChannelSidebar />
  {/if}

  <!-- 3. Main Center Workspace -->
  <div class="flex-1 flex h-full overflow-hidden">
    {#if appState.currentView === 'dms'}
      {#if appState.activeDmUserId}
        <DirectMessageChatArea recipientId={appState.activeDmUserId} />
      {:else}
        <FriendsView />
      {/if}
    {:else if appState.currentView === 'browser'}
      <WebBrowserView />
    {:else if isVoiceChannel && currentChannel}
      <VoiceRoomView channelId={currentChannel.id} />
    {:else}
      <ChatArea
        showMembers={showMembers}
        toggleMembers={() => (showMembers = !showMembers)}
      />
    {/if}

    <!-- 4. Right Member List (for server text channels) -->
    {#if appState.currentView === 'chat' && showMembers && !isVoiceChannel}
      <MemberList />
    {/if}
  </div>

  <!-- Modals -->
  {#if appState.activeModal === 'discovery'}
    <DiscoveryModal />
  {:else if appState.activeModal === 'hostServer'}
    <HostServerModal />
  {:else if appState.activeModal === 'micPermission'}
    <MicPermissionModal />
  {:else if appState.activeModal === 'createChannel'}
    <CreateChannelModal />
  {:else if appState.activeModal === 'createServer'}
    <CreateServerModal />
  {:else if appState.activeModal === 'settings'}
    <UserSettingsModal />
  {:else if appState.activeModal === 'serverRoles'}
    <ServerRolesModal />
  {:else if appState.activeModal === 'soundboard'}
    <SoundboardModal />
  {/if}

  <!-- Fullscreen Image Preview Lightbox -->
  {#if appState.previewImage}
    <ImagePreviewModal />
  {/if}
</main>
