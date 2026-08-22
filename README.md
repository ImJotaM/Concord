# Concord 🚀

A fast, lightweight, **LAN-only Discord clone** for **Desktop, Mobile, and Web**, built with **Rust (Tauri v2)**, **Svelte 5**, **Node.js**, **WebSockets**, **SQLite**, and **WebRTC**.

Designed for zero internet dependency: host on any PC or Raspberry Pi on your local network (Wi-Fi or Ethernet), and all your devices can chat, share files, and talk over low-latency voice channels.

---

## 🌟 Key Features

* **1-Click Local Server Hosting**: Start, stop, and monitor the local Concord LAN server directly inside the app with live console logs and LAN IP sharing.
* **Discord UI & Feel**: Dark theme, server list rail, text & voice channel sidebar, typing indicators, user badges, and member list.
* **LAN Auto-Discovery**: mDNS / Zeroconf broadcast and network scanner so clients discover the host server without typing IP addresses.
* **Low-Latency LAN Voice (WebRTC)**: Peer-to-peer audio mesh streaming with sub-5ms LAN latency, live speaking halo indicators, mic mute, and deafen controls.
* **Persistent SQLite Storage**: Server configuration, channels, user profiles, and chat message history saved locally in `server/data/concord.db`.
* **Cross-Platform Native Apps**: Powered by **Tauri v2 (Rust)** for Desktop (Windows, macOS, Linux) and Mobile (Android, iOS).
* **Zero-Install Web / PWA**: Any phone or tablet on the same Wi-Fi can open `http://<HOST-IP>:5173` and add it to their home screen.
* **File & Image Attachments**: Share photos, memes, and files directly over LAN with inline image previews.

---

## 🏗️ Project Architecture

```
concord/
├── server/                 # Node.js LAN Hub & Host Server
│   ├── src/
│   │   ├── db/             # Better-SQLite3 database & schema
│   │   ├── routes/         # Express REST API (file uploads, messages, info)
│   │   ├── ws/             # Realtime WebSockets & WebRTC signaling
│   │   ├── discovery/      # mDNS LAN broadcaster & IP detection
│   │   └── server.ts
│   └── package.json
│
├── src/                    # Svelte 5 Client Frontend
│   ├── lib/
│   │   ├── components/     # ServerSidebar, ChannelSidebar, ChatArea, VoiceRoomView, MemberList, Modals
│   │   ├── stores/         # Svelte 5 runes ($state) state management
│   │   ├── webrtc/         # WebRTC voice mesh audio engine & voice activity detection
│   │   ├── api/            # WebSocket & REST client
│   │   └── types.ts
│   ├── App.svelte
│   └── main.ts
│
├── src-tauri/              # Rust Tauri Native Core
│   ├── src/
│   │   └── lib.rs          # Rust Tauri commands (LAN IP interface discovery, log)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18+) & **npm**
* **Rust & Cargo** (for Tauri desktop/mobile builds)

### 1. Start Everything (Server + Svelte Web Client)
In the root directory, run:
```bash
npm run start:all
```
This runs both the backend LAN server on `http://localhost:3000` and the Vite Svelte client on `http://localhost:5173`.

### 2. Run the Native Desktop App (Rust + Tauri)
To launch the native desktop window:
```bash
npm run tauri dev
```

### 3. Connect from Mobile Devices (Same Wi-Fi)
1. Check the server console log or click the **Compass** icon in Concord to see your host machine's LAN IP (e.g. `http://192.168.1.50:5173`).
2. Open that URL in your mobile browser (Safari / Chrome).
3. Tap **"Add to Home Screen"** to install it as a standalone app!

---

## 🛠️ Individual Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the Svelte 5 frontend with Vite |
| `npm run server` | Start the Node.js LAN server (WebSockets + SQLite + mDNS) |
| `npm run start:all` | Run both server and client concurrently |
| `npm run build` | Build optimized frontend production bundle |
| `npm run tauri dev` | Launch the Rust Tauri native desktop app in dev mode |
| `npm run tauri build` | Compile the release desktop executable / installer |

---

## 🔒 Offline & Privacy
Concord operates completely isolated on your Local Area Network. No analytics, no external servers, and no internet required.
