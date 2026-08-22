<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import { clientService } from '../api/wsClient';

  let activeChannelId = $derived(appState.voiceState.activeChannelId);
  let isDeafened = $derived(appState.voiceState.isDeafened);
  let outputDeviceId = $derived(appState.audioSettings.outputDeviceId);

  let currentParticipants = $derived.by(() => {
    if (!activeChannelId) return [];
    const list = appState.voiceState.roomParticipants[activeChannelId] || [];
    return list.filter((p) => p.userId !== appState.currentUser.id);
  });

  function attachGlobalAudio(node: HTMLAudioElement, params: { stream?: MediaStream | null; volume: number; outputId?: string }) {
    let { stream, volume, outputId } = params;

    async function apply(s?: MediaStream | null, v?: number, outId?: string) {
      if (s && node.srcObject !== s) {
        node.srcObject = s;
      } else if (!s && node.srcObject) {
        node.srcObject = null;
      }

      if (isDeafened) {
        node.muted = true;
      } else {
        node.muted = false;
        if (v !== undefined) {
          node.volume = Math.min(Math.max(v / 100, 0), 1);
        }
      }

      // Output device routing (Speakers/Headphones)
      if (outId && outId !== 'default' && typeof (node as any).setSinkId === 'function') {
        try {
          await (node as any).setSinkId(outId);
        } catch (err) {
          console.warn('[GlobalVoiceAudio] Failed to set sinkId:', err);
        }
      }

      if (s && !isDeafened) {
        const playPromise = node.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              appState.voiceState.autoplayBlocked = true;
            }
          });
        }
      }
    }

    apply(stream, volume, outputId);

    return {
      update(newParams: { stream?: MediaStream | null; volume: number; outputId?: string }) {
        stream = newParams.stream;
        volume = newParams.volume;
        outputId = newParams.outputId;
        apply(stream, volume, outputId);
      },
      destroy() {
        node.srcObject = null;
      },
    };
  }
</script>

<!-- Persistent Global Voice & Screen Audio Bridge (stays active across all chats, servers and tabs) -->
<div class="hidden" aria-hidden="true">
  {#if activeChannelId}
    {#each currentParticipants as p (p.userId)}
      {@const remoteVoiceStream = (p.peerId && appState.voiceState.remoteAudioStreams[p.peerId]) || appState.voiceState.remoteAudioStreams[p.userId] || null}
      {@const remoteScreenAudioStream = (p.peerId && appState.voiceState.remoteScreenAudioStreams[p.peerId]) || appState.voiceState.remoteScreenAudioStreams[p.userId] || null}
      {@const userVol = clientService.getUserVolume(p.userId)}

      <!-- 1. Voice Microphone Stream -->
      <audio
        use:attachGlobalAudio={{ stream: remoteVoiceStream, volume: userVol, outputId: outputDeviceId }}
        autoplay
        playsinline
      ></audio>

      <!-- 2. Screen Share System/Game Audio Stream (Only played when user is actively watching this stream!) -->
      {#if remoteScreenAudioStream && appState.isWatchingScreen(p.peerId || p.userId)}
        <audio
          use:attachGlobalAudio={{ stream: remoteScreenAudioStream, volume: userVol, outputId: outputDeviceId }}
          autoplay
          playsinline
        ></audio>
      {/if}
    {/each}
  {/if}
</div>
