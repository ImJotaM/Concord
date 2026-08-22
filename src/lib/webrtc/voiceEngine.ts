export type VoiceSignalCallback = (targetPeerId: string, signal: any) => void;
export type SpeakingCallback = (isSpeaking: boolean) => void;

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
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private onSignal: VoiceSignalCallback;
  private onSpeakingChange: SpeakingCallback;
  
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isSpeaking = false;
  private isMuted = false;
  private isDeafened = false;

  constructor(onSignal: VoiceSignalCallback, onSpeakingChange: SpeakingCallback) {
    this.onSignal = onSignal;
    this.onSpeakingChange = onSpeakingChange;
  }

  async startLocalAudio(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext && !navigator.mediaDevices) {
      throw new Error('SECURE_CONTEXT_REQUIRED');
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MEDIA_DEVICES_UNSUPPORTED');
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.setupSpeakingDetection();
      return this.localStream;
    } catch (err: any) {
      console.error('Failed to get local microphone stream:', err);
      throw err;
    }
  }

  private setupSpeakingDetection() {
    if (!this.localStream) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

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

        // Threshold for speaking detection
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
      console.warn('AudioContext speaking detection not initialized:', e);
    }
  }

  // Connect to an existing peer in the voice room (Initiator / create Offer)
  async connectToPeer(peerId: string) {
    if (this.peerConnections.has(peerId)) return;

    const pc = this.createPeerConnection(peerId);
    this.peerConnections.set(peerId, pc);

    // Create SDP Offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.onSignal(peerId, { type: 'offer', sdp: offer });
    } catch (err) {
      console.error(`Error creating offer for peer ${peerId}:`, err);
    }
  }

  // Handle incoming signal (Offer, Answer, ICE Candidate) from a peer
  async handleSignal(fromPeerId: string, signal: any) {
    let pc = this.peerConnections.get(fromPeerId);

    if (!pc) {
      // Peer is sending us an offer
      pc = this.createPeerConnection(fromPeerId);
      this.peerConnections.set(fromPeerId, pc);
    }

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.onSignal(fromPeerId, { type: 'answer', sdp: answer });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.error(`Error handling signal from peer ${fromPeerId}:`, err);
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    // For pure LAN WebRTC, ICE servers are optional, but standard STUN is included for fallback
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local audio tracks to the peer connection
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onSignal(peerId, { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      this.playRemoteAudio(peerId, remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    return pc;
  }

  private playRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = this.audioElements.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      (audio as any).playsInline = true;
      this.audioElements.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.muted = this.isDeafened;
    audio.play().catch((e) => console.log('Auto-play audio prompt:', e));
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
    this.audioElements.forEach((audio) => {
      audio.muted = deafen;
    });
    // Deafen also mutes mic by default (Discord behavior)
    if (deafen) {
      this.setMute(true);
    }
  }

  removePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    const audio = this.audioElements.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(peerId);
    }
  }

  cleanup() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    this.isSpeaking = false;
    this.onSpeakingChange(false);
  }
}
