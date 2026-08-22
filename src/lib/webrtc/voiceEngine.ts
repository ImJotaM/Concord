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
  private remoteMicTracks: Map<string, MediaStreamTrack> = new Map();
  private remoteScreenAudioTracks: Map<string, MediaStreamTrack> = new Map();
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

  private rawMicStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private notchFilter: BiquadFilterNode | null = null;
  private noiseGateGain: GainNode | null = null;
  private agcCompressor: DynamicsCompressorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  async startLocalAudio(deviceId?: string): Promise<MediaStream> {
    if (this.processedStream && this.rawMicStream) {
      return this.processedStream;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext && !navigator.mediaDevices) {
      throw new Error('SECURE_CONTEXT_REQUIRED');
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MEDIA_DEVICES_UNSUPPORTED');
    }

    console.log('[WebRTC-Debug] 🎙️ Solicitando permissão do microfone com DSP profissional...');
    try {
      const audioSettings = appState.audioSettings;
      const targetDevice = deviceId || (audioSettings.inputDeviceId !== 'default' ? audioSettings.inputDeviceId : undefined);

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: audioSettings.echoCancellation ?? true,
          noiseSuppression: audioSettings.noiseSuppression ?? true,
          autoGainControl: audioSettings.autoGainControl ?? true,
          channelCount: 1,
          sampleRate: 48000,
          ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
        },
        video: false,
      };

      this.rawMicStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC-Debug] ✅ Microfone capturado com sucesso:', this.rawMicStream.id);

      this.setupDspAudioPipeline();
      this.localStream = this.processedStream || this.rawMicStream;
      return this.localStream;
    } catch (err: any) {
      console.error('[WebRTC-Debug] ❌ Erro ao acessar microfone:', err);
      throw err;
    }
  }

  async applyAudioSettings(settings: Partial<typeof appState.audioSettings>) {
    const audioSettings = { ...appState.audioSettings, ...settings };
    const now = this.audioContext ? this.audioContext.currentTime : 0;

    // 1. High-Pass filter update (85Hz)
    if (this.highPassFilter) {
      if (audioSettings.noiseSuppression) {
        this.highPassFilter.frequency.setTargetAtTime(85, now, 0.05);
      } else {
        this.highPassFilter.frequency.setTargetAtTime(10, now, 0.05); // Flat bypass
      }
    }

    // 2. AGC Compressor update
    if (this.agcCompressor) {
      if (audioSettings.autoGainControl) {
        this.agcCompressor.threshold.setTargetAtTime(-24, now, 0.05);
        this.agcCompressor.ratio.setTargetAtTime(12, now, 0.05);
      } else {
        this.agcCompressor.threshold.setTargetAtTime(0, now, 0.05); // Bypass
        this.agcCompressor.ratio.setTargetAtTime(1, now, 0.05);
      }
    }

    // 3. Hardware track constraints
    if (this.rawMicStream) {
      const track = this.rawMicStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        const targetDevice = audioSettings.inputDeviceId !== 'default' ? audioSettings.inputDeviceId : undefined;
        try {
          await track.applyConstraints({
            echoCancellation: audioSettings.echoCancellation ?? true,
            noiseSuppression: audioSettings.noiseSuppression ?? true,
            autoGainControl: audioSettings.autoGainControl ?? true,
            ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
          });
          console.log('[WebRTC-Debug] 🎛️ Configurações de áudio aplicadas com sucesso:', audioSettings);
        } catch (e) {
          console.warn('[WebRTC-Debug] ⚠️ Hardware constraints update error:', e);
        }
      }
    }
  }

  async switchMicrophone(deviceId: string) {
    console.log(`[WebRTC-Debug] 🔄 Alternando dispositivo de microfone para: ${deviceId}`);
    try {
      const audioSettings = appState.audioSettings;
      const targetDevice = deviceId !== 'default' ? deviceId : undefined;

      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: audioSettings.echoCancellation ?? true,
          noiseSuppression: audioSettings.noiseSuppression ?? true,
          autoGainControl: audioSettings.autoGainControl ?? true,
          channelCount: 1,
          sampleRate: 48000,
          ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
        },
        video: false,
      };

      const newRawStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.rawMicStream) {
        this.rawMicStream.getTracks().forEach((t) => t.stop());
      }
      this.rawMicStream = newRawStream;

      // Re-setup DSP pipeline
      this.setupDspAudioPipeline();
      this.localStream = this.processedStream || this.rawMicStream;

      // Replace audio track across all active WebRTC peer connections
      if (this.localStream) {
        const newTrack = this.localStream.getAudioTracks()[0];
        if (newTrack) {
          newTrack.enabled = !this.isMuted;
          for (const [peerId, pc] of this.peerConnections.entries()) {
            const senders = pc.getSenders();
            const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
            if (audioSender) {
              await audioSender.replaceTrack(newTrack);
              console.log(`[WebRTC-Debug] ✅ Track DSP substituída para o peer ${peerId}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC-Debug] ❌ Erro ao trocar de microfone:', err);
    }
  }

  private setupDspAudioPipeline() {
    if (!this.rawMicStream) return;

    try {
      if (this.scriptProcessor) {
        try { this.scriptProcessor.disconnect(); } catch (e) {}
        this.scriptProcessor = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        try { this.audioContext.close(); } catch (e) {}
        this.audioContext = null;
      }

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(this.rawMicStream);

      // 1. High-Pass Filter (85Hz) - removes sub-bass room rumble, air conditioning, fan resonance
      this.highPassFilter = this.audioContext.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.setValueAtTime(
        appState.audioSettings.noiseSuppression ? 85 : 10,
        this.audioContext.currentTime
      );

      // 2. Notch Filter (60Hz electrical hum filter)
      this.notchFilter = this.audioContext.createBiquadFilter();
      this.notchFilter.type = 'notch';
      this.notchFilter.frequency.setValueAtTime(60, this.audioContext.currentTime);
      this.notchFilter.Q.setValueAtTime(4.0, this.audioContext.currentTime);

      // 3. Noise Gate (Dynamically opened/closed based on voice envelope detection)
      this.noiseGateGain = this.audioContext.createGain();
      this.noiseGateGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);

      // 4. Automatic Gain Control (AGC) - Studio Dynamics Compressor
      this.agcCompressor = this.audioContext.createDynamicsCompressor();
      if (appState.audioSettings.autoGainControl) {
        this.agcCompressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
        this.agcCompressor.knee.setValueAtTime(30, this.audioContext.currentTime);
        this.agcCompressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
      } else {
        this.agcCompressor.threshold.setValueAtTime(0, this.audioContext.currentTime);
        this.agcCompressor.ratio.setValueAtTime(1, this.audioContext.currentTime);
      }
      this.agcCompressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      this.agcCompressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

      // 5. Analyser node for real-time frequency analysis & speaking detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      // 6. Destination node (The processed Web Audio stream transmitted to peers)
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.processedStream = this.destinationNode.stream;

      // Connect DSP chain:
      // Source -> HighPass -> Notch -> NoiseGate -> AGC Compressor -> Destination
      source.connect(this.highPassFilter);
      this.highPassFilter.connect(this.notchFilter);
      this.notchFilter.connect(this.noiseGateGain);
      this.noiseGateGain.connect(this.agcCompressor);
      this.agcCompressor.connect(this.destinationNode);

      // Branch to analyser for speaking and noise gate level calculation
      this.notchFilter.connect(this.analyser);

      // ScriptProcessor for fallback chunks (connected after DSP processing)
      this.scriptProcessor = this.audioContext.createScriptProcessor(2048, 1, 1);
      this.agcCompressor.connect(this.scriptProcessor);
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.scriptProcessor.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.isMuted || !this.isSpeaking || !this.onAudioChunk) return;

        let needFallback = false;
        if (this.peerConnections.size === 0) {
          needFallback = true;
        } else {
          for (const pc of this.peerConnections.values()) {
            if (
              pc.connectionState !== 'connected' &&
              pc.iceConnectionState !== 'connected' &&
              pc.iceConnectionState !== 'completed'
            ) {
              needFallback = true;
              break;
            }
          }
        }

        if (!needFallback) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const uint8 = new Uint8Array(int16.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);
        this.onAudioChunk(base64);
      };

      // Real-time Noise Gate & Speaking Detection loop
      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      let speakingHoldFrames = 0;

      const checkVolume = () => {
        if (!this.analyser) return;

        const now = this.audioContext ? this.audioContext.currentTime : 0;
        const settings = appState.audioSettings;

        if (this.isMuted) {
          if (this.noiseGateGain) {
            this.noiseGateGain.gain.setTargetAtTime(0.0001, now, 0.01);
          }
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
        const average = sum / buffer.length; // 0 to 128
        const normalizedLevel = (average / 128) * 100;

        const useNoiseSuppression = settings.noiseSuppression ?? true;
        const sensitivity = settings.sensitivity ?? 75;
        const threshold = Math.max(6, (100 - sensitivity) * 0.4);

        const voiceDetected = normalizedLevel > threshold;

        if (useNoiseSuppression) {
          if (voiceDetected) {
            speakingHoldFrames = 15; // ~250ms hold
            if (this.noiseGateGain) {
              this.noiseGateGain.gain.setTargetAtTime(1.0, now, 0.005); // Fast 5ms attack
            }
          } else if (speakingHoldFrames > 0) {
            speakingHoldFrames--;
            if (this.noiseGateGain) {
              this.noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
            }
          } else {
            // Mute background noise
            if (this.noiseGateGain) {
              this.noiseGateGain.gain.setTargetAtTime(0.0001, now, 0.08); // 80ms smooth release
            }
          }
        } else {
          // If noise suppression is off, leave gate open
          if (this.noiseGateGain) {
            this.noiseGateGain.gain.setTargetAtTime(1.0, now, 0.01);
          }
        }

        const calculatedIsSpeaking = voiceDetected || speakingHoldFrames > 0;
        if (calculatedIsSpeaking !== this.isSpeaking) {
          this.isSpeaking = calculatedIsSpeaking;
          this.onSpeakingChange(this.isSpeaking);
        }

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
      }
      this.animFrameId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('[WebRTC-Debug] DSP audio pipeline initialization error:', e);
    }
  }

  // Check if native WebRTC P2P Opus audio is already streaming for a given user
  hasActiveWebRtcAudio(userId: string): boolean {
    const stream = appState.voiceState.remoteAudioStreams[userId];
    if (stream && stream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)) {
      return true;
    }
    for (const chanId in appState.voiceState.roomParticipants) {
      const list = appState.voiceState.roomParticipants[chanId];
      const found = list.find((p) => p.userId === userId || p.peerId === userId);
      if (found) {
        if (found.peerId) {
          const peerStream = appState.voiceState.remoteAudioStreams[found.peerId];
          if (peerStream && peerStream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)) {
            return true;
          }
        }
        if (found.userId) {
          const userStream = appState.voiceState.remoteAudioStreams[found.userId];
          if (userStream && userStream.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Play real-time PCM audio chunk received from server (fallback ONLY when WebRTC P2P is not connected)
  playRemoteAudioChunk(userId: string, base64Chunk: string, volume = 100) {
    if (this.isDeafened || volume <= 0) return;
    if (userId === appState.currentUser.id) return;

    // CRITICAL: If WebRTC P2P direct audio stream is active for this user, do NOT double-play WebSocket chunks!
    // Double-playing causes echo and metallic comb-filtering robotic distortion.
    if (this.hasActiveWebRtcAudio(userId)) {
      return;
    }

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
      const screenSettings = appState.screenShareSettings;
      const res = screenSettings.resolution;
      const fps = screenSettings.frameRate;

      let widthConstraint: any = undefined;
      let heightConstraint: any = undefined;
      if (res === '720p') {
        widthConstraint = { ideal: 1280, max: 1280 };
        heightConstraint = { ideal: 720, max: 720 };
      } else if (res === '1080p') {
        widthConstraint = { ideal: 1920, max: 1920 };
        heightConstraint = { ideal: 1080, max: 1080 };
      } else if (res === '1440p') {
        widthConstraint = { ideal: 2560, max: 2560 };
        heightConstraint = { ideal: 1440, max: 1440 };
      }

      const videoConstraints: any = {
        cursor: 'always',
        displaySurface: 'monitor',
        frameRate: { ideal: fps, max: fps },
      };

      if (widthConstraint && heightConstraint) {
        videoConstraints.width = widthConstraint;
        videoConstraints.height = heightConstraint;
      }

      console.log(`[WebRTC-Debug] 🖥️ Solicitando compartilhamento de tela (${res}, ${fps} FPS, áudio: ${screenSettings.includeAudio})...`);
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: screenSettings.includeAudio
          ? ({
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: 2,
              sampleRate: 48000,
            } as any)
          : false,
      });

      appState.voiceState.localScreenStream = screenStream;
      appState.voiceState.isScreenSharing = true;
      appState.voiceState.watchingScreenId = 'local';

      // Add screen tracks (video and system audio) to all currently connected peers and renegotiate
      for (const [peerId, pc] of this.peerConnections.entries()) {
        const senders: RTCRtpSender[] = [];
        screenStream.getTracks().forEach((track) => {
          console.log(`[WebRTC-Debug] ➕ Adicionando track de transmissão (${track.kind}) para peer ${peerId}`);
          const sender = pc.addTrack(track, screenStream);
          senders.push(sender);
        });
        this.screenSenders.set(peerId, senders);
        await this.renegotiatePeer(peerId);
      }

      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          console.log('[WebRTC-Debug] 🖥️ Compartilhamento de tela finalizado pelo usuário via navegador');
          this.stopScreenShare();
        };
      }
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
    if (appState.voiceState.watchingScreenId === 'local') {
      appState.voiceState.watchingScreenId = null;
    }

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
      console.log(`[WebRTC-Debug] 🎵 Track REMOTA recebida de ${peerId}! Kind: ${event.track.kind}, Track ID: ${event.track.id}`);
      const incomingStream = event.streams && event.streams[0] ? event.streams[0] : null;

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
        const stream = incomingStream || new MediaStream([event.track]);
        appState.voiceState.remoteScreenStreams[peerId] = {
          peerId,
          userId: participantInfo.userId,
          displayName: participantInfo.displayName,
          avatar: participantInfo.avatar,
          stream,
        };

        if (appState.voiceState.watchingScreenId === null) {
          appState.voiceState.watchingScreenId = peerId;
        }

        event.track.onended = () => {
          console.log(`[WebRTC-Debug] 📺 Tela remota finalizada por ${peerId}`);
          delete appState.voiceState.remoteScreenStreams[peerId];
          delete appState.voiceState.remoteScreenAudioStreams[peerId];
          this.remoteScreenAudioTracks.delete(peerId);
          if (appState.voiceState.watchingScreenId === peerId || appState.voiceState.watchingScreenId === participantInfo.userId) {
            appState.voiceState.watchingScreenId = null;
          }
        };
      } else if (event.track.kind === 'audio') {
        // Track kind is 'audio'
        const existingMicTrack = this.remoteMicTracks.get(peerId);
        const existingScreen = appState.voiceState.remoteScreenStreams[peerId];

        // Is this track screen audio?
        // 1. It belongs to the same stream as video (or incomingStream has video tracks)
        // 2. Or the stream id matches existingScreen
        // 3. Or we already have a registered live mic track for this peer, so this new/second track is screen audio!
        const isScreenAudio =
          (incomingStream && incomingStream.getVideoTracks().length > 0) ||
          (incomingStream && existingScreen && incomingStream.id === existingScreen.stream.id) ||
          (existingMicTrack && existingMicTrack.id !== event.track.id && existingMicTrack.readyState === 'live');

        if (isScreenAudio) {
          console.log(`[WebRTC-Debug] 🔊 Áudio de transmissão de tela registrado para ${participantInfo.displayName}`);
          this.remoteScreenAudioTracks.set(peerId, event.track);
          const screenAudioStream = new MediaStream([event.track]);
          appState.voiceState.remoteScreenAudioStreams[peerId] = screenAudioStream;
          if (participantInfo.userId && participantInfo.userId !== peerId) {
            appState.voiceState.remoteScreenAudioStreams[participantInfo.userId] = screenAudioStream;
          }

          event.track.onended = () => {
            console.log(`[WebRTC-Debug] 🔊 Áudio de tela finalizado para ${peerId}`);
            delete appState.voiceState.remoteScreenAudioStreams[peerId];
            if (participantInfo.userId && participantInfo.userId !== peerId) {
              delete appState.voiceState.remoteScreenAudioStreams[participantInfo.userId];
            }
            this.remoteScreenAudioTracks.delete(peerId);
          };
        } else {
          // Microphone audio stream
          console.log(`[WebRTC-Debug] 🎙️ Áudio de microfone registrado para ${participantInfo.displayName} (${peerId})`);
          this.remoteMicTracks.set(peerId, event.track);
          const micAudioStream = new MediaStream([event.track]);
          appState.voiceState.remoteAudioStreams[peerId] = micAudioStream;
          if (participantInfo.userId && participantInfo.userId !== peerId) {
            appState.voiceState.remoteAudioStreams[participantInfo.userId] = micAudioStream;
          }

          event.track.onended = () => {
            console.log(`[WebRTC-Debug] 🎙️ Microfone finalizado para ${peerId}`);
            this.remoteMicTracks.delete(peerId);
          };
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
    this.remoteMicTracks.delete(peerId);
    this.remoteScreenAudioTracks.delete(peerId);
    delete appState.voiceState.remoteAudioStreams[peerId];
    delete appState.voiceState.remoteScreenStreams[peerId];
    delete appState.voiceState.remoteScreenAudioStreams[peerId];
    if (appState.voiceState.watchingScreenId === peerId) {
      appState.voiceState.watchingScreenId = null;
    }
  }

  cleanup() {
    appState.voiceState.watchingScreenId = null;
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

    if (this.rawMicStream) {
      this.rawMicStream.getTracks().forEach((track) => track.stop());
      this.rawMicStream = null;
    }

    if (this.processedStream) {
      this.processedStream.getTracks().forEach((track) => track.stop());
      this.processedStream = null;
    }

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
    this.remoteMicTracks.clear();
    this.remoteScreenAudioTracks.clear();
    this.lastIceRestartMap.clear();
    this.iceRestartAttemptsMap.clear();

    appState.voiceState.remoteAudioStreams = {};
    appState.voiceState.remoteScreenStreams = {};
    appState.voiceState.remoteScreenAudioStreams = {};

    this.isSpeaking = false;
    this.onSpeakingChange(false);
  }
}
