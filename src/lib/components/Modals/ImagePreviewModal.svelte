<script lang="ts">
  import { appState } from '../../stores/appState.svelte';
  import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCcw } from '@lucide/svelte';
  import { getFilename } from '../../utils/attachment';

  let zoomLevel = $state(1); // 1 = 100% fit, 1.5 = 150%, 2 = 200%, etc.
  let pan = $state({ x: 0, y: 0 });
  let isDragging = $state(false);
  let hasMoved = $state(false);
  let dragStart = { x: 0, y: 0 };
  let startPan = { x: 0, y: 0 };

  let url = $derived(appState.previewImage?.url || '');
  let filename = $derived(appState.previewImage?.filename || getFilename(url));

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      appState.closeImagePreview();
    } else if (e.key === '+' || e.key === '=') {
      zoomIn();
    } else if (e.key === '-' || e.key === '_') {
      zoomOut();
    } else if (e.key === '0') {
      resetZoom();
    }
  }

  function zoomIn() {
    zoomLevel = Math.min(Number((zoomLevel + 0.5).toFixed(2)), 4);
  }

  function zoomOut() {
    const next = Math.max(Number((zoomLevel - 0.5).toFixed(2)), 0.5);
    zoomLevel = next;
    if (next <= 1) {
      pan = { x: 0, y: 0 };
    }
  }

  function resetZoom() {
    zoomLevel = 1;
    pan = { x: 0, y: 0 };
  }

  function toggleZoom() {
    if (zoomLevel === 1) {
      zoomLevel = 2;
    } else {
      resetZoom();
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    const newZoom = Math.min(Math.max(Number((zoomLevel + delta).toFixed(2)), 0.5), 4);
    zoomLevel = newZoom;
    if (newZoom <= 1) {
      pan = { x: 0, y: 0 };
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (zoomLevel > 1) {
      isDragging = true;
      hasMoved = false;
      dragStart = { x: e.clientX, y: e.clientY };
      startPan = { ...pan };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (isDragging && zoomLevel > 1) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved = true;
      }
      pan = {
        x: startPan.x + dx / zoomLevel,
        y: startPan.y + dy / zoomLevel,
      };
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isDragging) {
      isDragging = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  }

  async function handleDownload() {
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      window.open(url, '_blank');
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- Modal Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  aria-label="Visualizador de Imagem"
  class="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-150 select-none outline-none overflow-hidden"
  onclick={(e) => {
    if (e.target === e.currentTarget && !hasMoved) {
      appState.closeImagePreview();
    }
  }}
>
  <!-- Top Bar: Image Title (Top-Left Corner) & Control Toolbar (Top-Right Corner) -->
  <div class="w-full px-6 pt-5 pb-3 flex items-center justify-between shrink-0 z-30 pointer-events-none">
    <!-- Top-Left Corner: Image Title / Filename -->
    <div class="flex items-center space-x-2 bg-[#1e1f22]/90 backdrop-blur-md px-4 py-2 rounded-xl border border-[#383a40] shadow-xl max-w-sm sm:max-w-md pointer-events-auto">
      <span class="text-xs sm:text-sm font-semibold text-white truncate" title={filename}>
        {filename}
      </span>
    </div>

    <!-- Top-Right Corner: Action Buttons Toolbar -->
    <div class="flex items-center space-x-2 pointer-events-auto">
      <!-- Zoom Controls Group -->
      <div class="flex items-center bg-[#1e1f22]/90 backdrop-blur-md rounded-xl border border-[#383a40] shadow-xl p-0.5">
        <button
          type="button"
          onclick={zoomOut}
          disabled={zoomLevel <= 0.5}
          class="p-2 rounded-lg text-[#dbdee1] hover:text-white hover:bg-[#2b2d31] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Diminuir Zoom (-)"
        >
          <ZoomOut class="w-4 h-4" />
        </button>

        <button
          type="button"
          onclick={resetZoom}
          class="px-2 py-1 text-xs font-bold text-[#dbdee1] hover:text-white hover:bg-[#2b2d31] rounded-md transition-colors cursor-pointer min-w-[3.5rem] text-center"
          title="Redefinir Zoom (100%)"
        >
          {Math.round(zoomLevel * 100)}%
        </button>

        <button
          type="button"
          onclick={zoomIn}
          disabled={zoomLevel >= 4}
          class="p-2 rounded-lg text-[#dbdee1] hover:text-white hover:bg-[#2b2d31] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          title="Aumentar Zoom (+)"
        >
          <ZoomIn class="w-4 h-4" />
        </button>
      </div>

      <!-- Download Button -->
      <button
        type="button"
        onclick={handleDownload}
        class="p-2.5 rounded-xl bg-[#1e1f22]/90 hover:bg-[#2b2d31] text-[#dbdee1] hover:text-white border border-[#383a40] transition-colors cursor-pointer shadow-xl"
        title="Baixar imagem"
      >
        <Download class="w-4 h-4" />
      </button>

      <!-- Open in new tab Button -->
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="p-2.5 rounded-xl bg-[#1e1f22]/90 hover:bg-[#2b2d31] text-[#dbdee1] hover:text-white border border-[#383a40] transition-colors cursor-pointer shadow-xl flex items-center justify-center"
        title="Abrir no navegador"
      >
        <ExternalLink class="w-4 h-4" />
      </a>

      <!-- Close Button -->
      <button
        type="button"
        onclick={() => appState.closeImagePreview()}
        class="p-2.5 rounded-xl bg-[#1e1f22]/90 hover:bg-[#f23f43] text-[#dbdee1] hover:text-white border border-[#3f4147] hover:border-[#f23f43] transition-colors cursor-pointer shadow-xl ml-1"
        title="Fechar (Esc)"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>

  <!-- Center Image View Area with Zoom & Pan -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="flex-1 w-full flex items-center justify-center min-h-0 overflow-hidden p-4 relative z-10"
    onwheel={handleWheel}
    onclick={(e) => {
      if (e.target === e.currentTarget && !hasMoved) {
        appState.closeImagePreview();
      }
    }}
  >
    <div
      class="relative flex items-center justify-center select-none"
      class:transition-transform={!isDragging}
      class:duration-150={!isDragging}
      style="transform: scale({zoomLevel}) translate({pan.x}px, {pan.y}px); transform-origin: center center;"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <img
        src={url}
        alt={filename}
        draggable="false"
        class="max-w-[92vw] max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-white/10 select-none transition-shadow"
        class:cursor-zoom-in={zoomLevel === 1}
        class:cursor-grab={zoomLevel > 1 && !isDragging}
        class:cursor-grabbing={zoomLevel > 1 && isDragging}
        onclick={() => {
          if (!hasMoved) {
            toggleZoom();
          }
        }}
      />
    </div>
  </div>
</div>
