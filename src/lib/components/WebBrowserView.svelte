<script lang="ts">
  import { appState } from '../stores/appState.svelte';
  import {
    Globe,
    Search,
    ArrowLeft,
    ArrowRight,
    RotateCw,
    Home,
    Plus,
    X,
    ExternalLink,
    Copy,
    Check,
    Shield,
    Lock,
    Play,
  } from '@lucide/svelte';

  let activeTab = $derived(appState.activeBrowserTab || appState.browserTabs[0]);
  let urlInput = $state('https://www.google.com/webhp?igu=1');
  let iframeRef: HTMLIFrameElement | null = $state(null);
  let isLoading = $state(false);
  let copied = $state(false);
  let useProxy = $state(false);
  let selectedEngine = $state<'google' | 'youtube' | 'duckduckgo' | 'bing' | 'wikipedia'>('google');

  // YouTube Hub Search State
  let ytSearchQuery = $state('');

  $effect(() => {
    if (activeTab) {
      urlInput = activeTab.url === 'youtube://home' ? 'https://www.youtube.com' : activeTab.url;
    }
  });

  function extractYouTubeVideoId(input: string): string | null {
    const match = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
  }

  function sanitizeOrSearch(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return 'https://www.google.com/webhp?igu=1';

    // 1. YouTube specific handler
    if (
      trimmed === 'youtube' ||
      trimmed === 'youtube.com' ||
      trimmed === 'https://youtube.com' ||
      trimmed === 'https://www.youtube.com' ||
      trimmed === 'www.youtube.com'
    ) {
      return 'youtube://home';
    }

    const ytVideoId = extractYouTubeVideoId(trimmed);
    if (ytVideoId) {
      return `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&enablejsapi=1&rel=0`;
    }

    // If searching YouTube explicitly or engine is youtube
    if (selectedEngine === 'youtube' || trimmed.toLowerCase().startsWith('yt:') || trimmed.toLowerCase().startsWith('youtube:')) {
      const q = trimmed.replace(/^(yt:|youtube:)/i, '').trim();
      return `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(q || 'musica')}`;
    }

    // 2. Wikipedia handler (use mobile wikipedia for smooth iframe rendering)
    if (trimmed.includes('wikipedia.org')) {
      let wikiUrl = trimmed;
      if (!wikiUrl.startsWith('http://') && !wikiUrl.startsWith('https://')) {
        wikiUrl = `https://${wikiUrl}`;
      }
      if (!wikiUrl.includes('.m.wikipedia.org')) {
        wikiUrl = wikiUrl.replace('wikipedia.org', 'm.wikipedia.org');
      }
      return wikiUrl;
    }

    // 3. Explicit Protocols: http://, https://, file://, etc.
    if (/^[a-zA-Z]+:\/\//i.test(trimmed)) {
      let full = trimmed;
      if (full.includes('google.') && !full.includes('igu=1')) {
        full += (full.includes('?') ? '&' : '?') + 'igu=1';
      }
      return full;
    }

    // 4. Localhost or Local IP patterns (e.g., localhost:3000, 192.168.1.1, 127.0.0.1:8080)
    const isLocalOrIp = /^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/i.test(trimmed);
    if (isLocalOrIp) {
      return `http://${trimmed}`;
    }

    // 5. Domain patterns without protocol (e.g., "google.com", "www.github.com", "devdocs.io", "globo.com/esportes")
    // Check that there are NO spaces and it has a valid domain structure with TLD
    const isDomainUrl = !/\s/.test(trimmed) && /^(www\.|[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed);
    if (isDomainUrl) {
      let full = `https://${trimmed}`;
      if (full.includes('google.') && !full.includes('igu=1')) {
        full += (full.includes('?') ? '&' : '?') + 'igu=1';
      }
      return full;
    }

    // 6. Otherwise, treat as Search Query
    const encoded = encodeURIComponent(trimmed);
    switch (selectedEngine) {
      case 'duckduckgo':
        return `https://html.duckduckgo.com/html/?q=${encoded}`;
      case 'bing':
        return `https://www.bing.com/search?q=${encoded}`;
      case 'wikipedia':
        return `https://pt.m.wikipedia.org/w/index.php?search=${encoded}`;
      case 'google':
      default:
        return `https://www.google.com/search?igu=1&q=${encoded}`;
    }
  }

  function getIframeSrc(url: string): string {
    if (!url || url === 'youtube://home') return '';

    // Direct YouTube Embed
    const ytVideoId = extractYouTubeVideoId(url);
    if (ytVideoId) {
      return `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&enablejsapi=1&rel=0`;
    }
    if (url.startsWith('https://www.youtube-nocookie.com/embed') || url.startsWith('https://www.youtube.com/embed')) {
      return url;
    }

    // Google with igu=1 and DuckDuckGo and Mobile Wikipedia embed directly
    if (url.includes('google.') && url.includes('igu=1')) {
      return url;
    }
    if (url.includes('html.duckduckgo.com') || url.includes('.m.wikipedia.org') || url.includes('devdocs.io')) {
      return url;
    }

    // All other sites route via relative HTTPS proxy to prevent mixed content
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }

  let canGoBack = $derived((activeTab?.historyIndex ?? 0) > 0);
  let canGoForward = $derived(
    activeTab?.history !== undefined && (activeTab.historyIndex ?? 0) < activeTab.history.length - 1
  );

  function goBack() {
    if (!activeTab || !activeTab.history || (activeTab.historyIndex ?? 0) <= 0) return;
    const newIdx = (activeTab.historyIndex ?? 0) - 1;
    const targetUrl = activeTab.history[newIdx];
    activeTab.historyIndex = newIdx;
    activeTab.url = targetUrl;
    activeTab.title = formatTitleFromUrl(targetUrl);
    activeTab.favicon = targetUrl.includes('youtube') ? '🎬' : targetUrl.includes('google') ? '🔍' : '🌐';
    urlInput = targetUrl === 'youtube://home' ? 'https://www.youtube.com' : targetUrl;
    isLoading = true;
  }

  function goForward() {
    if (!activeTab || !activeTab.history || (activeTab.historyIndex ?? 0) >= activeTab.history.length - 1) return;
    const newIdx = (activeTab.historyIndex ?? 0) + 1;
    const targetUrl = activeTab.history[newIdx];
    activeTab.historyIndex = newIdx;
    activeTab.url = targetUrl;
    activeTab.title = formatTitleFromUrl(targetUrl);
    activeTab.favicon = targetUrl.includes('youtube') ? '🎬' : targetUrl.includes('google') ? '🔍' : '🌐';
    urlInput = targetUrl === 'youtube://home' ? 'https://www.youtube.com' : targetUrl;
    isLoading = true;
  }

  function navigateTo(url: string, title?: string) {
    const finalUrl = sanitizeOrSearch(url);
    urlInput = finalUrl === 'youtube://home' ? 'https://www.youtube.com' : finalUrl;
    if (activeTab) {
      const history = activeTab.history ? [...activeTab.history] : [activeTab.url];
      const historyIndex = activeTab.historyIndex ?? 0;
      // Truncate any forward history and append new URL
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(finalUrl);

      appState.updateBrowserTab(activeTab.id, {
        url: finalUrl,
        title: title || formatTitleFromUrl(finalUrl),
        favicon: finalUrl.includes('youtube') ? '🎬' : finalUrl.includes('google') ? '🔍' : '🌐',
        history: newHistory,
        historyIndex: newHistory.length - 1,
      });
    }
    isLoading = true;
  }

  function handleYtSearch(query: string) {
    if (!query.trim()) return;
    const finalUrl = `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(query.trim())}`;
    navigateTo(finalUrl, `YouTube: ${query}`);
  }

  function formatTitleFromUrl(url: string): string {
    if (url === 'youtube://home') return 'YouTube';
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      if (parsed.searchParams.has('q')) {
        return `Busca: ${parsed.searchParams.get('q')}`;
      }
      if (parsed.searchParams.has('list')) {
        return `YT: ${parsed.searchParams.get('list')}`;
      }
      return parsed.hostname.replace('www.', '').replace('.m.', '.');
    } catch {
      return 'Navegador';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      navigateTo(urlInput);
    }
  }

  function reloadPage() {
    isLoading = true;
    if (iframeRef) {
      const current = iframeRef.src;
      iframeRef.src = 'about:blank';
      setTimeout(() => {
        if (iframeRef) iframeRef.src = current;
      }, 50);
    }
  }

  function goHome() {
    navigateTo('https://www.google.com/webhp?igu=1', 'Google');
  }

  function copyCurrentUrl() {
    if (!activeTab?.url) return;
    const toCopy = activeTab.url === 'youtube://home' ? 'https://www.youtube.com' : activeTab.url;
    navigator.clipboard.writeText(toCopy);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function openInExternalBrowser() {
    if (!activeTab?.url) return;
    const toOpen = activeTab.url === 'youtube://home' ? 'https://www.youtube.com' : activeTab.url;
    window.open(toOpen, '_blank', 'noopener,noreferrer');
  }
</script>

<div class="flex-1 bg-[#313338] flex flex-col h-full overflow-hidden select-none">
  <!-- 1. TABS HEADER BAR -->
  <header class="bg-[#1e1f22] pt-2 px-2 flex items-center justify-between border-b border-[#111214] shrink-0">
    <div class="flex items-center space-x-1 overflow-x-auto no-scrollbar flex-1 mr-2">
      {#each appState.browserTabs as tab (tab.id)}
        {@const isActive = tab.id === appState.activeBrowserTabId}
        <button
          type="button"
          class="flex items-center space-x-2 px-3 py-1.5 rounded-t-lg max-w-[200px] min-w-[120px] transition-all cursor-pointer group text-xs border-t-2 text-left"
          class:bg-[#313338]={isActive}
          class:text-white={isActive}
          class:border-[#5865f2]={isActive}
          class:bg-[#232428]={!isActive}
          class:text-[#949ba4]={!isActive}
          class:border-transparent={!isActive}
          class:hover:bg-[#2b2d31]={!isActive}
          onclick={() => appState.selectBrowserTab(tab.id)}
        >
          <span class="text-sm shrink-0">{tab.favicon || '🌐'}</span>
          <span class="truncate font-semibold flex-1">{tab.title}</span>
          <span
            role="button"
            tabindex="0"
            onclick={(e) => {
              e.stopPropagation();
              appState.closeBrowserTab(tab.id);
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                appState.closeBrowserTab(tab.id);
              }
            }}
            class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#35373c] text-[#949ba4] hover:text-white transition-opacity shrink-0"
            title="Fechar guia"
          >
            <X class="w-3 h-3" />
          </span>
        </button>
      {/each}

      <!-- New Tab Button -->
      <button
        onclick={() => appState.addBrowserTab()}
        class="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
        title="Nova guia"
      >
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <div class="flex items-center space-x-1.5 pb-1">
      <button
        onclick={() => (appState.currentView = 'chat')}
        class="bg-[#2b2d31] hover:bg-[#35373c] text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow flex items-center space-x-1.5 cursor-pointer"
      >
        <span>Voltar ao Chat</span>
      </button>
    </div>
  </header>

  <!-- 2. NAVIGATION & OMNIBOX BAR -->
  <div class="bg-[#2b2d31] p-2 flex items-center space-x-2 border-b border-[#1f2023] shrink-0">
    <!-- Back & Forward & Reload & Home -->
    <div class="flex items-center space-x-1 text-[#949ba4]">
      <button
        onclick={goBack}
        disabled={!canGoBack}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#949ba4] disabled:cursor-not-allowed"
        title="Voltar"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>

      <button
        onclick={goForward}
        disabled={!canGoForward}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#949ba4] disabled:cursor-not-allowed"
        title="Avançar"
      >
        <ArrowRight class="w-4 h-4" />
      </button>

      <button
        onclick={reloadPage}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        class:animate-spin={isLoading}
        title="Recarregar página"
      >
        <RotateCw class="w-4 h-4" />
      </button>

      <button
        onclick={goHome}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        title="Página Inicial (Google)"
      >
        <Home class="w-4 h-4" />
      </button>
    </div>

    <!-- Search Engine Selector -->
    <select
      bind:value={selectedEngine}
      class="bg-[#1e1f22] text-[#dbdee1] text-xs font-semibold px-2 py-1.5 rounded-lg border border-[#1f2023] focus:outline-none focus:ring-1 focus:ring-[#5865f2] cursor-pointer shrink-0"
      title="Mecanismo de busca padrão"
    >
      <option value="google">🔍 Google</option>
      <option value="youtube">🎬 YouTube</option>
      <option value="duckduckgo">🦆 DuckDuckGo</option>
      <option value="wikipedia">📚 Wikipédia</option>
      <option value="bing">🔎 Bing</option>
    </select>

    <!-- Omnibox URL / Search input -->
    <div class="flex-1 relative flex items-center">
      <div class="absolute left-3 text-[#23a55a] flex items-center space-x-1 pointer-events-none">
        <Lock class="w-3.5 h-3.5" />
      </div>
      <input
        type="text"
        bind:value={urlInput}
        onkeydown={handleKeydown}
        placeholder="Digite uma URL (ex: youtube.com, google.com) ou pesquise qualquer coisa..."
        class="w-full bg-[#1e1f22] text-white text-xs pl-8 pr-20 py-2 rounded-xl border border-[#1f2023] focus:outline-none focus:ring-2 focus:ring-[#5865f2] transition-all"
      />
      <div class="absolute right-2 flex items-center space-x-1">
        <button
          onclick={() => navigateTo(urlInput)}
          class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center space-x-1 shadow cursor-pointer"
        >
          <Search class="w-3 h-3" />
          <span>Ir</span>
        </button>
      </div>
    </div>

    <!-- Quick Action Tools -->
    <div class="flex items-center space-x-1 text-[#949ba4]">
      <!-- Copy Link -->
      <button
        onclick={copyCurrentUrl}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        title="Copiar link"
      >
        {#if copied}
          <Check class="w-4 h-4 text-[#23a55a]" />
        {:else}
          <Copy class="w-4 h-4" />
        {/if}
      </button>

      <!-- Open in External Browser -->
      <button
        onclick={openInExternalBrowser}
        class="p-1.5 rounded-lg hover:bg-[#35373c] hover:text-white transition-colors cursor-pointer"
        title="Abrir no navegador do Windows"
      >
        <ExternalLink class="w-4 h-4" />
      </button>
    </div>
  </div>

  <!-- 3. WEB VIEW FRAME WORKSPACE -->
  <div class="flex-1 relative bg-[#1e1f22] overflow-hidden flex flex-col">
    {#if activeTab?.url === 'youtube://home'}
      <!-- DEDICATED YOUTUBE HUB -->
      <div class="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center max-w-4xl mx-auto w-full space-y-6">
        <div class="text-center space-y-2">
          <div class="w-16 h-16 rounded-2xl bg-[#f23f43] text-white flex items-center justify-center mx-auto text-3xl shadow-xl shadow-[#f23f43]/20">
            🎬
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">YouTube no Concord</h2>
          <p class="text-xs text-[#949ba4] max-w-md mx-auto">
            Pesquise qualquer vídeo, música ou podcast para assistir e ouvir diretamente no aplicativo!
          </p>
        </div>

        <!-- YouTube Big Search Input -->
        <div class="w-full max-w-2xl relative flex items-center shadow-2xl">
          <div class="absolute left-4 text-[#949ba4] pointer-events-none">
            <Search class="w-5 h-5" />
          </div>
          <input
            type="text"
            bind:value={ytSearchQuery}
            onkeydown={(e) => e.key === 'Enter' && handleYtSearch(ytSearchQuery)}
            placeholder="O que você quer assistir ou ouvir? (Ex: lofi hip hop, rock, tutorial...)"
            class="w-full bg-[#2b2d31] text-white text-sm pl-12 pr-28 py-3.5 rounded-2xl border border-[#35373c] focus:outline-none focus:ring-2 focus:ring-[#f23f43] transition-all shadow-inner"
          />
          <button
            onclick={() => handleYtSearch(ytSearchQuery)}
            class="absolute right-2 bg-[#f23f43] hover:bg-[#d83a3e] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
          >
            Pesquisar
          </button>
        </div>
      </div>
    {:else if activeTab}
      {@const frameSrc = getIframeSrc(activeTab.url)}
      <iframe
        bind:this={iframeRef}
        src={frameSrc}
        title={activeTab.title}
        onload={() => (isLoading = false)}
        allow="camera; microphone; display-capture; fullscreen; geolocation; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; autoplay"
        sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads allow-presentation"
        class="w-full h-full border-0 bg-white"
      ></iframe>
    {:else}
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div class="w-16 h-16 rounded-2xl bg-[#2b2d31] flex items-center justify-center text-3xl mb-3 shadow">
          🌐
        </div>
        <h3 class="text-white font-bold text-lg mb-1">Navegador Integrado do Concord</h3>
        <p class="text-xs text-[#949ba4] max-w-sm mb-4">
          Pesquise no Google, assista vídeos do YouTube ou abra documentações sem sair do app!
        </p>
        <button
          onclick={goHome}
          class="bg-[#5865f2] hover:bg-[#4752c4] text-white px-5 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#5865f2]/25 cursor-pointer"
        >
          Abrir Google
        </button>
      </div>
    {/if}
  </div>
</div>
