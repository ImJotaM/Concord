import { appState } from '../stores/appState.svelte';
import { clientService } from './wsClient';

export class ServerHostService {
  private logListenerInitialized = false;
  private pollInterval: any = null;

  isTauri(): boolean {
    return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  }

  async init() {
    appState.isTauriApp = this.isTauri();
    await this.checkServerStatus();
    if (this.isTauri()) {
      this.initTauriListeners();
    }
  }

  private async initTauriListeners() {
    if (this.logListenerInitialized) return;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string>('server-log', (event) => {
        if (appState.serverLogs.length >= 300) {
          appState.serverLogs.shift();
        }
        appState.serverLogs.push(event.payload);
      });
      await listen<boolean>('server-status-changed', (event) => {
        appState.localServerRunning = event.payload;
      });
      this.logListenerInitialized = true;
    } catch (e) {
      console.warn('Could not initialize Tauri listeners:', e);
    }
  }

  async checkServerStatus(): Promise<boolean> {
    const targetUrl = appState.serverUrl || 'http://localhost:3000';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${targetUrl}/api/info`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        appState.localServerRunning = true;
        if (data.localIps && Array.isArray(data.localIps)) {
          appState.lanIps = data.localIps;
        }
        return true;
      }
    } catch {
      // not reachable via HTTP
    }

    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<any>('get_server_status');
        appState.localServerRunning = status.is_running;
        if (status.lan_ips) {
          appState.lanIps = status.lan_ips;
        }
        if (status.logs && status.logs.length > 0) {
          appState.serverLogs = status.logs;
        }
        return status.is_running;
      } catch (err) {
        console.warn('Failed to get Tauri server status:', err);
      }
    }

    appState.localServerRunning = false;
    return false;
  }

  async startLocalServer(): Promise<boolean> {
    appState.isServerStarting = true;
    appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] 🚀 Starting Concord LAN Server...`);

    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<any>('start_local_server');
        if (res.lan_ips) {
          appState.lanIps = res.lan_ips;
        }
      } catch (err: any) {
        appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] ❌ Failed to start server: ${err?.message || err}`);
        appState.isServerStarting = false;
        return false;
      }
    }

    // Poll until the server responds on port 3000
    let attempts = 0;
    const maxAttempts = 25;

    return new Promise((resolve) => {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(async () => {
        attempts++;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 800);
          const res = await fetch('http://localhost:3000/api/info', { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            clearInterval(this.pollInterval);
            const data = await res.json();
            appState.localServerRunning = true;
            appState.isServerStarting = false;
            if (data.localIps) {
              appState.lanIps = data.localIps;
            }
            appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] ✅ Concord LAN Server is live and running on port 3000!`);
            // Connect client to local server
            clientService.connect('http://localhost:3000');
            resolve(true);
            return;
          }
        } catch {}

        if (attempts >= maxAttempts) {
          clearInterval(this.pollInterval);
          appState.isServerStarting = false;
          if (!this.isTauri()) {
            appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] ⏳ Polling timeout. Run 'npm run server' in your terminal and click 'Test Connection'.`);
          }
          resolve(false);
        }
      }, 600);
    });
  }

  async stopLocalServer(): Promise<boolean> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('stop_local_server');
        appState.localServerRunning = false;
        appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] 🛑 Local server stopped.`);
        return true;
      } catch (err) {
        console.error('Failed to stop server:', err);
        return false;
      }
    } else {
      appState.serverLogs.push(`[${new Date().toLocaleTimeString()}] To stop the server in browser mode, stop the terminal process (Ctrl+C).`);
      return false;
    }
  }

  async fetchLanIps(): Promise<string[]> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ips = await invoke<string[]>('get_lan_ips');
        appState.lanIps = ips;
        return ips;
      } catch {}
    }
    try {
      const res = await fetch(`${appState.serverUrl}/api/info`);
      if (res.ok) {
        const data = await res.json();
        if (data.localIps) {
          appState.lanIps = data.localIps;
          return data.localIps;
        }
      }
    } catch {}
    return ['127.0.0.1'];
  }
}

export const serverHostService = new ServerHostService();
