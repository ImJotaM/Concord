import { appState } from '../stores/appState.svelte';

export type VoiceSignalCallback = (targetPeerId: string, signal: any) => void;
export type SpeakingCallback = (isSpeaking: boolean) => void;
export type AudioChunkCallback = (base64Chunk: string) => void;

export const ICE_SERVERS_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:5349',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:standard.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

function normalizeSdp(signal: any, fallbackType: 'offer' | 'answer'): RTCSessionDescriptionInit {
  if (signal.sdp && typeof signal.sdp === 'object' && signal.sdp.type && signal.sdp.sdp) {
    return { type: signal.sdp.type, sdp: signal.sdp.sdp };
  }
  if (signal.sdp && typeof signal.sdp === 'string') {
    return { type: signal.type || fallbackType, sdp: signal.sdp };
  }
  if (signal.type && signal.sdp) {
    return { type: signal.type, sdp: typeof signal.sdp === 'string' ? signal.sdp : signal.sdp.sdp };
  }
  return signal;
}

export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return 'unsupported';
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'unsupported';
  }
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      return 'prompt';
    }
  }
  return 'prompt';
}

export class WebRtcVoiceEngine {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private isMakingOfferMap: Map<string, boolean> = new Map();
  private ignoreOfferMap: Map<string, boolean> = new Map();
  private screenSenders: Map<string, RTCRtpSender[]> = new Map();
  private lastIceRestartMap: Map<string, number> = new Map();
  private iceRestartAttemptsMap: Map<string, number> = new Map();
  private myPeerId: string | null = null;
  private onSignal: VoiceSignalCallback;
  private onSpeakingChange: SpeakingCallback;
  private onAudioChunk?: AudioChunkCallback;

  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isSpeaking = false;
  private isMuted = false;
  private isDeafened = false;

  // Real-time PCM Audio Playback engine
  private playbackContext: AudioContext | null = null;
  private userAudioStates: Map<string, { gainNode: GainNode; nextStartTime: number }> = new Map();

  constructor(onSignal: VoiceSignalCallback, onSpeakingChange: SpeakingCallback, onAudioChunk?: AudioChunkCallback) {
    this.onSignal = onSignal;
    this.onSpeakingChange = onSpeakingChange;
    this.onAudioChunk = onAudioChunk;
  }

  setMyPeerId(peerId: string) {
    this.myPeerId = peerId;
    console.log('[WebRTC-Debug] 🆔 Meu PeerId definido como:', peerId);
  }

  static async getAudioDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { inputs: [], outputs: [] };
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    const outputs = devices.filter((d) => d.kind === 'audiooutput');
    return { inputs, outputs };
  }

  async startLocalAudio(deviceId?: string): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext && !navigator.mediaDevices) {
      throw new Error('SECURE_CONTEXT_REQUIRED');
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MEDIA_DEVICES_UNSUPPORTED');
    }

    console.log('[WebRTC-Debug] 🎙️ Solicitando permissão do microfone...');
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC-Debug] ✅ Microfone capturado com sucesso:', this.localStream.id);

      this.setupSpeakingDetectionAndStreaming();
      return this.localStream;
    } catch (err: any) {
      console.error('[WebRTC-Debug] ❌ Erro ao acessar microfone:', err);
      throw err;
    }
  }

  private setupSpeakingDetectionAndStreaming() {
    if (!this.localStream) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      // Real-time Low-Latency Audio Streaming Pipeline
      this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
      source.connect(this.scriptProcessor);
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.isMuted || !this.isSpeaking || !this.onAudioChunk) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to 16-bit PCM Int16
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Fast binary to base64
        const uint8 = new Uint8Array(int16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        this.onAudioChunk(base64);
      };

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let speakingFrames = 0;

      const checkVolume = () => {
        if (!this.analyser || this.isMuted) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.onSpeakingChange(false);
          }
          this.animFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;

        const nowSpeaking = average > 18;
        if (nowSpeaking) {
          speakingFrames = Math.min(speakingFrames + 1, 10);
        } else {
          speakingFrames = Math.max(speakingFrames - 1, 0);
        }

        const calculatedIsSpeaking = speakingFrames > 3;
        if (calculatedIsSpeaking !== this.isSpeaking) {
          this.isSpeaking = calculatedIsSpeaking;
          this.onSpeakingChange(this.isSpeaking);
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      this.animFrameId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('[WebRTC-Debug] AudioContext speaking detection not initialized:', e);
    }
  }

  // Play real-time PCM audio chunk received from server
  playRemoteAudioChunk(userId: string, base64Chunk: string, volume = 100) {
    if (this.isDeafened) return;
    try {
      if (!this.playbackContext || this.playbackContext.state === 'closed') {
        this.playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.playbackContext.state === 'suspended') {
        this.playbackContext.resume().catch(() => {});
      }

      let userState = this.userAudioStates.get(userId);
      if (!userState) {
        const gainNode = this.playbackContext.createGain();
        gainNode.gain.value = Math.min(Math.max(volume / 100, 0), 1);
        gainNode.connect(this.playbackContext.destination);
        userState = { gainNode, nextStartTime: 0 };
        this.userAudioStates.set(userId, userState);
      } else {
        userState.gainNode.gain.value = Math.min(Math.max(volume / 100, 0), 1);
      }

      const binary = atob(base64Chunk);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
      }

      const sampleRate = this.audioContext ? this.audioContext.sampleRate : 48000;
      const audioBuffer = this.playbackContext.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(userState.gainNode);

      const now = this.playbackContext.currentTime;
      const startTime = Math.max(now, userState.nextStartTime);
      source.start(startTime);
      userState.nextStartTime = startTime + audioBuffer.duration;
    } catch (e) {
      console.warn('[WebRTC-Debug] ⚠️ Play remote audio chunk error:', e);
    }
  }

  setRemoteUserVolume(userId: string, volume: number) {
    const userState = this.userAudioStates.get(userId);
    if (userState) {
      userState.gainNode.gain.value = Math.min(Math.max(volume / 100, 0), 1);
    }
  }

  async startScreenShare() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('DISPLAY_MEDIA_UNSUPPORTED');
    }

    try {
      console.log('[WebRTC-Debug] 🖥️ Solicitando compartilhamento de tela...');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        } as any,
        audio: true,
      });

      appState.voiceState.localScreenStream = screenStream;
      appState.voiceState.isScreenSharing = true;

      // Add screen tracks to all currently connected peers and renegotiate
      for (const [peerId, pc] of this.peerConnections.entries()) {
        const senders: RTCRtpSender[] = [];
        screenStream.getTracks().forEach((track) => {
          console.log(`[WebRTC-Debug] ➕ Adicionando track de tela (${track.kind}) para peer ${peerId}`);
          const sender = pc.addTrack(track, screenStream);
          senders.push(sender);
        });
        this.screenSenders.set(peerId, senders);
        await this.renegotiatePeer(peerId);
      }

      screenStream.getVideoTracks()[0].onended = () => {
        console.log('[WebRTC-Debug] 🖥️ Compartilhamento de tela finalizado pelo usuário via navegador');
        this.stopScreenShare();
      };
    } catch (e) {
      console.warn('[WebRTC-Debug] ❌ Falha ao iniciar compartilhamento de tela:', e);
      throw e;
    }
  }

  async stopScreenShare() {
    console.log('[WebRTC-Debug] 🖥️ Parando compartilhamento de tela...');
    if (appState.voiceState.localScreenStream) {
      appState.voiceState.localScreenStream.getTracks().forEach((track) => track.stop());
      appState.voiceState.localScreenStream = null;
    }
    appState.voiceState.isScreenSharing = false;

    // Remove screen senders from each peer connection and renegotiate
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const senders = this.screenSenders.get(peerId);
      if (senders) {
        senders.forEach((sender) => {
          try {
            pc.removeTrack(sender);
          } catch (e) {}
        });
        this.screenSenders.delete(peerId);
      }
      await this.renegotiatePeer(peerId);
    }
  }

  // Connect to an existing peer in the voice room (Initiator / create Offer)
  async connectToPeer(peerId: string) {
    if (this.peerConnections.has(peerId)) {
      console.log(`[WebRTC-Debug] ℹ️ Conexão já existente com ${peerId}`);
      return;
    }

    console.log(`[WebRTC-Debug] 🚀 Iniciando conexão (Offer) com peer: ${peerId}`);
    const pc = this.getOrCreatePeerConnection(peerId);

    try {
      this.isMakingOfferMap.set(peerId, true);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC-Debug] ⚠️ Ignorando criação de offer com ${peerId} pois signalingState=${pc.signalingState}`);
        return;
      }

      await pc.setLocalDescription(offer);
      console.log(`[WebRTC-Debug] 📤 Enviando SDP Offer para ${peerId}`);
      this.onSignal(peerId, { type: 'offer', sdp: pc.localDescription });
    } catch (err) {
      console.error(`[WebRTC-Debug] ❌ Erro ao criar Offer para ${peerId}:`, err);
    } finally {
      this.isMakingOfferMap.set(peerId, false);
    }
  }

  async restartPeerIce(peerId: string) {
    const now = Date.now();
    const last = this.lastIceRestartMap.get(peerId) || 0;
    const attempts = this.iceRestartAttemptsMap.get(peerId) || 0;

    if (now - last < 8000 || attempts >= 2) {
      console.log(`[WebRTC-Debug] ℹ️ ICE Restart ignorado para ${peerId} (tentativas: ${attempts}, intervalo: ${now - last}ms)`);
      return;
    }

    this.lastIceRestartMap.set(peerId, now);
    this.iceRestartAttemptsMap.set(peerId, attempts + 1);

    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      this.isMakingOfferMap.set(peerId, true);
      console.log(`[WebRTC-Debug] 🔄 Executando ICE Restart #${attempts + 1} para ${peerId}...`);
      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);
      console.log(`[WebRTC-Debug] 📤 Enviando SDP Offer com ICE Restart para ${peerId}`);
      this.onSignal(peerId, { type: 'offer', sdp: pc.localDescription });
    } catch (err) {
      console.error(`[WebRTC-Debug] ❌ Erro ao reiniciar ICE para ${peerId}:`, err);
    } finally {
      this.isMakingOfferMap.set(peerId, false);
    }
  }

  async renegotiatePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      this.isMakingOfferMap.set(peerId, true);
      console.log(`[WebRTC-Debug] 🔄 Renegociando SDP (Screen/Audio) com ${peerId}...`);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC-Debug] ⚠️ Renegociação ignorada pois signalingState é ${pc.signalingState}`);
        return;
      }

      await pc.setLocalDescription(offer);
      console.log(`[WebRTC-Debug] 📤 Enviando SDP Offer de renegociação para ${peerId}`);
      this.onSignal(peerId, { type: 'offer', sdp: pc.localDescription });
    } catch (err) {
      console.error(`[WebRTC-Debug] ❌ Erro na renegociação com ${peerId}:`, err);
    } finally {
      this.isMakingOfferMap.set(peerId, false);
    }
  }

  // Handle incoming signal (Offer, Answer, ICE Candidate) from a peer using Perfect Negotiation
  async handleSignal(fromPeerId: string, signal: any) {
    const pc = this.getOrCreatePeerConnection(fromPeerId);

    try {
      const isOffer = signal.type === 'offer' || (signal.sdp && signal.sdp.type === 'offer');
      const isAnswer = signal.type === 'answer' || (signal.sdp && signal.sdp.type === 'answer');

      if (isOffer) {
        const sdpInit = normalizeSdp(signal, 'offer');
        // Perfect Negotiation: deterministic polite/impolite role
        const isPolite = this.myPeerId ? this.myPeerId > fromPeerId : true;
        const isMakingOffer = this.isMakingOfferMap.get(fromPeerId) || false;
        const offerCollision = isMakingOffer || pc.signalingState !== 'stable';

        this.ignoreOfferMap.set(fromPeerId, !isPolite && offerCollision);
        if (this.ignoreOfferMap.get(fromPeerId)) {
          console.warn(`[WebRTC-Debug] 🛑 Glare detectado com ${fromPeerId}. Peer impolítico ignorando oferta colidente.`);
          return;
        }

        if (offerCollision) {
          console.warn(`[WebRTC-Debug] 🤝 Glare detectado com ${fromPeerId}. Peer político fazendo rollback para aceitar oferta remota.`);
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (e) {
            console.warn(`[WebRTC-Debug] Rollback notice:`, e);
          }
        }

        console.log(`[WebRTC-Debug] 📥 Definindo Remote Description (Offer) de ${fromPeerId}`);
        await pc.setRemoteDescription(new RTCSessionDescription(sdpInit));

        if (pc.signalingState === 'have-remote-offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log(`[WebRTC-Debug] 📤 Enviando SDP Answer para ${fromPeerId}`);
          this.onSignal(fromPeerId, { type: 'answer', sdp: pc.localDescription });
          await this.processPendingCandidates(fromPeerId, pc);
        }
      } else if (isAnswer) {
        const sdpInit = normalizeSdp(signal, 'answer');
        console.log(`[WebRTC-Debug] 📥 Recebido SDP Answer de ${fromPeerId}`);
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdpInit));
          await this.processPendingCandidates(fromPeerId, pc);
        } else {
          console.warn(`[WebRTC-Debug] ⚠️ Ignorando Answer de ${fromPeerId} porque signalingState é "${pc.signalingState}"`);
        }
      } else if (signal.candidate) {
        const isIgnored = this.ignoreOfferMap.get(fromPeerId) || false;
        if (isIgnored) {
          return;
        }

        console.log(`[WebRTC-Debug] 📥 Recebido ICE Candidate de ${fromPeerId}`);
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            console.log(`[WebRTC-Debug] ✅ ICE Candidate adicionado para ${fromPeerId}`);
          } catch (e) {
            console.warn(`[WebRTC-Debug] ⚠️ Erro ao adicionar ICE Candidate de ${fromPeerId}:`, e);
          }
        } else {
          console.log(`[WebRTC-Debug] ⏳ Enfileirando ICE Candidate para ${fromPeerId}`);
          const queue = this.pendingCandidates.get(fromPeerId) || [];
          queue.push(signal.candidate);
          this.pendingCandidates.set(fromPeerId, queue);
        }
      }
    } catch (err) {
      console.error(`[WebRTC-Debug] ❌ Erro ao processar sinal de ${fromPeerId}:`, err);
    }
  }

  private async processPendingCandidates(peerId: string, pc: RTCPeerConnection) {
    const pending = this.pendingCandidates.get(peerId);
    if (pending && pending.length > 0) {
      console.log(`[WebRTC-Debug] 🔄 Esvaziando fila de ${pending.length} ICE candidates para ${peerId}`);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`[WebRTC-Debug] ⚠️ Erro ao adicionar candidato pendente para ${peerId}:`, e);
        }
      }
      this.pendingCandidates.delete(peerId);
    }
  }

  private getOrCreatePeerConnection(peerId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(peerId);
    if (pc) return pc;

    console.log(`[WebRTC-Debug] 🛠️ Criando RTCPeerConnection para ${peerId}`);
    pc = new RTCPeerConnection(ICE_SERVERS_CONFIG);

    // Add local microphone audio tracks
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc!.addTrack(track, this.localStream!);
      });
    }

    // Add local screen share tracks if active
    if (appState.voiceState.localScreenStream) {
      const senders: RTCRtpSender[] = [];
      appState.voiceState.localScreenStream.getTracks().forEach((track) => {
        console.log(`[WebRTC-Debug] ➕ Adicionando track de tela ativa para novo peer ${peerId}`);
        const sender = pc!.addTrack(track, appState.voiceState.localScreenStream!);
        senders.push(sender);
      });
      this.screenSenders.set(peerId, senders);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC-Debug] 🧊 Local ICE Candidate gerado para ${peerId}:`, event.candidate.candidate);
        this.onSignal(peerId, { candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC-Debug] 🔄 ICE State (${peerId}): %c${pc!.iceConnectionState}`, 'font-weight: bold; color: yellow;');
      if (pc!.iceConnectionState === 'failed') {
        console.warn(`[WebRTC-Debug] ⚠️ Conexão ICE falhou com ${peerId}. Tentando ICE Restart automático...`);
        this.restartPeerIce(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC-Debug] 🌐 Connection State (${peerId}): %c${pc!.connectionState}`, 'font-weight: bold; color: cyan;');
      if (pc!.connectionState === 'failed') {
        console.warn(`[WebRTC-Debug] ⚠️ Connection State falhou com ${peerId}. Tentando ICE Restart...`);
        this.restartPeerIce(peerId);
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC-Debug] 🎵 Track REMOTA recebida de ${peerId}! Kind: ${event.track.kind}`);
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      
      let participantInfo = {
        peerId,
        userId: peerId,
        displayName: `Amigo`,
        avatar: '👤',
      };

      for (const chanId in appState.voiceState.roomParticipants) {
        const list = appState.voiceState.roomParticipants[chanId];
        const found = list.find((p) => p.peerId === peerId || p.userId === peerId);
        if (found) {
          participantInfo = {
            peerId,
            userId: found.userId,
            displayName: found.displayName,
            avatar: found.avatar,
          };
          break;
        }
      }

      if (event.track.kind === 'video') {
        console.log(`[WebRTC-Debug] 📺 Registrando tela compartilhada remota de ${participantInfo.displayName}`);
        appState.voiceState.remoteScreenStreams[peerId] = {
          peerId,
          userId: participantInfo.userId,
          displayName: participantInfo.displayName,
          avatar: participantInfo.avatar,
          stream: remoteStream,
        };

        event.track.onended = () => {
          console.log(`[WebRTC-Debug] 📺 Tela remota finalizada por ${peerId}`);
          delete appState.voiceState.remoteScreenStreams[peerId];
        };
      } else {
        // Audio stream: store by peerId AND by userId for reliable reactive binding
        console.log(`[WebRTC-Debug] 🔊 Vinculando stream de áudio para ${participantInfo.displayName} (${peerId})`);
        appState.voiceState.remoteAudioStreams[peerId] = remoteStream;
        if (participantInfo.userId && participantInfo.userId !== peerId) {
          appState.voiceState.remoteAudioStreams[participantInfo.userId] = remoteStream;
        }
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !mute;
      });
    }
  }

  setDeafen(deafen: boolean) {
    this.isDeafened = deafen;
    if (deafen) {
      this.setMute(true);
    }
  }

  removePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      this.peerConnections.delete(peerId);
    }

    this.pendingCandidates.delete(peerId);
    this.isMakingOfferMap.delete(peerId);
    this.ignoreOfferMap.delete(peerId);
    this.screenSenders.delete(peerId);
    delete appState.voiceState.remoteAudioStreams[peerId];
    delete appState.voiceState.remoteScreenStreams[peerId];
  }

  cleanup() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {}
      this.scriptProcessor = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.playbackContext) {
      try {
        this.playbackContext.close();
      } catch (e) {}
      this.playbackContext = null;
    }
    this.userAudioStates.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (appState.voiceState.localScreenStream) {
      appState.voiceState.localScreenStream.getTracks().forEach((track) => track.stop());
      appState.voiceState.localScreenStream = null;
    }
    appState.voiceState.isScreenSharing = false;

    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch (e) {}
    });
    this.peerConnections.clear();
    this.pendingCandidates.clear();
    this.isMakingOfferMap.clear();
    this.ignoreOfferMap.clear();
    this.screenSenders.clear();
    this.lastIceRestartMap.clear();
    this.iceRestartAttemptsMap.clear();

    appState.voiceState.remoteAudioStreams = {};
    appState.voiceState.remoteScreenStreams = {};

    this.isSpeaking = false;
    this.onSpeakingChange(false);
  }
}
