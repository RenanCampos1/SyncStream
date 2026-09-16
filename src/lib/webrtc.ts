import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const MIC_DEVICE_KEY = "telaviva.micDeviceId";

export type SignalPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit | null };

export type SignalMessage = {
  id: string;
  room_id: string;
  from_user: string;
  to_user: string | null;
  payload: SignalPayload;
  created_at: string;
};

export type PresenceData = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  micOn: boolean;
  screenOn: boolean;
};

export type RemotePeer = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  micOn: boolean;
  screenOn: boolean;
  speaking: boolean;
  stream: MediaStream;
  hasVideo: boolean;
  connected: boolean;
};

export type SelfState = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  micOn: boolean;
  screenOn: boolean;
  speaking: boolean;
  screenStream: MediaStream | null;
};

export type RoomClientState = {
  self: SelfState;
  peers: RemotePeer[];
  micDenied: boolean;
};

type PeerConn = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  stream: MediaStream;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  lastOfferAt: number;
  speaking: boolean;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const SPEAKING_THRESHOLD = 0.045;

/**
 * Mesh WebRTC manager for one room: voice (mic) + screen sharing.
 * Signaling flows through the `signal_messages` table (postgres_changes),
 * presence through a realtime presence channel. Uses "perfect negotiation"
 * (polite/impolite + rollback), queues ICE candidates until the remote
 * description is set, and runs a watchdog that keeps re-negotiating until
 * every peer is connected (self-healing for lost signaling messages).
 * A Web Audio analyser per stream detects who is speaking.
 */
export class RoomClient {
  private roomId: string;
  private roomCode: string;
  private userId: string;
  private displayName: string;
  private avatarUrl: string | null;

  private localMic: MediaStream | null = null;
  private localScreen: MediaStream | null = null;
  private micOn = true;
  private screenOn = false;
  private micDenied = false;
  private selfSpeaking = false;

  private peers = new Map<string, PeerConn>();
  private presence = new Map<string, PresenceData>();
  private peerRetries = new Map<string, number>();
  private retryTimers: number[] = [];

  private signalChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private destroyed = false;

  private watchdog: number | null = null;
  private speakTimer: number | null = null;
  private audioCtx: AudioContext | null = null;
  private analysers = new Map<
    string,
    { analyser: AnalyserNode; data: Uint8Array }
  >();
  private audioResumeHandler: (() => void) | null = null;

  private onState: (state: RoomClientState) => void;

  constructor(
    opts: {
      roomId: string;
      roomCode: string;
      userId: string;
      displayName: string;
      avatarUrl: string | null;
    },
    onState: (state: RoomClientState) => void,
  ) {
    this.roomId = opts.roomId;
    this.roomCode = opts.roomCode;
    this.userId = opts.userId;
    this.displayName = opts.displayName;
    this.avatarUrl = opts.avatarUrl;
    this.onState = onState;
  }

  async join() {
    this.localMic = await this.acquireMic();
    if (this.localMic) {
      this.attachAnalyser(this.localMic, "self");
    }

    const presenceData: PresenceData = {
      userId: this.userId,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      micOn: this.micOn,
      screenOn: this.screenOn,
    };

    this.signalChannel = supabase
      .channel(`signals:${this.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signal_messages",
          filter: `room_id=eq.${this.roomId}`,
        },
        (payload) => {
          const msg = payload.new as unknown as SignalMessage;
          if (msg.from_user === this.userId) return;
          if (msg.to_user && msg.to_user !== this.userId) return;
          void this.handleSignal(msg);
        },
      )
      .subscribe();

    this.presenceChannel = supabase.channel(`presence:${this.roomCode}`, {
      config: { presence: { key: this.userId } },
    });

    this.presenceChannel
      .on("presence", { event: "join" }, ({ newPresences }) =>
        this.onPresenceJoin(newPresences as unknown as PresenceData[]),
      )
      .on("presence", { event: "update" }, ({ newPresences }) =>
        this.onPresenceUpdate(newPresences as unknown as PresenceData[]),
      )
      .on("presence", { event: "leave" }, ({ key }) =>
        this.onPresenceLeave(key as string),
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || this.destroyed) return;
        const state = this.presenceChannel?.presenceState() ?? {};
        Object.values(state).forEach((list) => {
          (list as PresenceData[]).forEach((p) => {
            if (p.userId !== this.userId) this.presence.set(p.userId, p);
          });
        });
        this.presence.forEach((p, id) => {
          if (!this.peers.has(id)) this.createPeer(p);
        });
        await this.presenceChannel?.track(presenceData);
        this.emit();
      });

    this.startWatchdog();
    this.startSpeakingDetector();
    this.setupAudioResume();
  }

  getScreenOn() {
    return this.screenOn;
  }

  toggleMic() {
    this.micOn = !this.micOn;
    if (this.localMic) {
      this.localMic.getAudioTracks().forEach((t) => (t.enabled = this.micOn));
    }
    void this.updatePresence();
    this.emit();
  }

  async startScreen(): Promise<boolean> {
    if (this.screenOn) return true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
    } catch {
      return false;
    }
    this.localScreen = stream;
    this.screenOn = true;
    stream.getVideoTracks()[0]?.addEventListener("ended", () =>
      this.stopScreen(),
    );
    this.peers.forEach((peer) => {
      stream.getVideoTracks().forEach((t) => peer.pc.addTrack(t, stream));
    });
    void this.updatePresence();
    this.emit();
    return true;
  }

  stopScreen() {
    if (!this.screenOn || !this.localScreen) return;
    const tracks = this.localScreen.getVideoTracks();
    this.screenOn = false;
    this.peers.forEach((peer) => {
      tracks.forEach((t) => {
        const sender = peer.pc.getSenders().find((s) => s.track === t);
        if (sender) peer.pc.removeTrack(sender);
      });
    });
    this.localScreen.getTracks().forEach((t) => t.stop());
    this.localScreen = null;
    void this.updatePresence();
    this.emit();
  }

  async leave() {
    this.destroyed = true;
    if (this.watchdog !== null) window.clearInterval(this.watchdog);
    if (this.speakTimer !== null) window.clearInterval(this.speakTimer);
    if (this.audioResumeHandler) {
      window.removeEventListener("pointerdown", this.audioResumeHandler);
      this.audioResumeHandler = null;
    }
    this.analysers.clear();
    this.peers.forEach((p) => this.closePeer(p.userId));
    this.peers.clear();
    this.presence.clear();
    this.localMic?.getTracks().forEach((t) => t.stop());
    this.localMic = null;
    this.localScreen?.getTracks().forEach((t) => t.stop());
    this.localScreen = null;
    try {
      await this.presenceChannel?.untrack();
    } catch {
      /* noop */
    }
    this.retryTimers.forEach((timer) => window.clearTimeout(timer));
    this.retryTimers = [];
    if (this.presenceChannel) await supabase.removeChannel(this.presenceChannel);
    if (this.signalChannel) await supabase.removeChannel(this.signalChannel);
    this.presenceChannel = null;
    this.signalChannel = null;
  }

  // ---------------- media ----------------

  private async acquireMic(): Promise<MediaStream | null> {
    const base: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
    };
    const savedDevice = localStorage.getItem(MIC_DEVICE_KEY);
    if (savedDevice) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { ...base, deviceId: { exact: savedDevice } },
        });
      } catch {
        /* device gone — fall back to default */
      }
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: base });
    } catch {
      this.micOn = false;
      this.micDenied = true;
      return null;
    }
  }

  private attachAnalyser(stream: MediaStream | null, key: string) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    if (this.analysers.has(key)) return;
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === "suspended") {
        void this.audioCtx.resume().catch(() => {});
      }
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      this.analysers.set(key, {
        analyser,
        data: new Uint8Array(analyser.frequencyBinCount),
      });
    } catch (err) {
      console.warn("TelaViva: analisador de áudio indisponível", err);
    }
  }

  private startSpeakingDetector() {
    this.speakTimer = window.setInterval(() => {
      let changed = false;
      this.analysers.forEach(({ analyser, data }, key) => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        const speaking = avg > SPEAKING_THRESHOLD;
        if (key === "self") {
          if (this.selfSpeaking !== speaking) {
            this.selfSpeaking = speaking;
            changed = true;
          }
        } else {
          const peer = this.peers.get(key);
          if (peer && peer.speaking !== speaking) {
            peer.speaking = speaking;
            changed = true;
          }
        }
      });
      if (changed) this.emit();
    }, 120);
  }

  private setupAudioResume() {
    const resume = () => {
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        void this.audioCtx.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", resume);
    this.audioResumeHandler = resume;
  }

  // ---------------- connection ----------------

  private createPeer(p: PresenceData) {
    if (this.peers.has(p.userId) || this.destroyed) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const stream = new MediaStream();
    const peer: PeerConn = {
      userId: p.userId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      pc,
      dc: null,
      stream,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.userId > p.userId,
      pendingCandidates: [],
      lastOfferAt: 0,
      speaking: false,
    };
    this.peers.set(p.userId, peer);

    // A data channel guarantees the connection negotiates and ICE runs even
    // when there is no media (e.g. microphone blocked inside the preview),
    // so peers never get stuck on "Conectando...".
    if (this.isInitiator(p.userId)) {
      peer.dc = pc.createDataChannel("telaviva");
    } else {
      pc.ondatachannel = (e) => {
        peer.dc = e.channel;
      };
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        void this.sendSignal(p.userId, {
          type: "ice",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams?.[0]) {
        e.streams[0].getTracks().forEach((t) => {
          if (!peer.stream.getTracks().some((x) => x.id === t.id)) {
            peer.stream.addTrack(t);
          }
        });
      }
      this.attachAnalyser(peer.stream, peer.userId);
      this.emit();
    };

    pc.onconnectionstatechange = () => {
      if (this.destroyed) return;
      console.log(
        "TelaViva: conexão com",
        peer.displayName,
        "->",
        pc.connectionState,
      );
      if (pc.connectionState === "connected") {
        this.peerRetries.set(p.userId, 0);
      } else if (pc.connectionState === "failed" && this.peers.has(p.userId)) {
        const attempts = this.peerRetries.get(p.userId) ?? 0;
        if (attempts < 3) {
          this.peerRetries.set(p.userId, attempts + 1);
          this.closePeer(p.userId);
          const timer = window.setTimeout(() => {
            const pres = this.presence.get(p.userId);
            if (pres && !this.destroyed) this.createPeer(pres);
            this.emit();
          }, 1000);
          this.retryTimers.push(timer);
        }
      }
      this.emit();
    };

    pc.onnegotiationneeded = () => {
      if (this.isInitiator(p.userId) || peer.pc.remoteDescription !== null) {
        void this.onNegotiationNeeded(peer);
      }
    };

    if (this.localMic) {
      this.localMic.getAudioTracks().forEach((t) => pc.addTrack(t, this.localMic!));
    }
    if (this.localScreen) {
      this.localScreen.getVideoTracks().forEach((t) => pc.addTrack(t, this.localScreen!));
    }

    if (this.isInitiator(p.userId)) {
      void this.onNegotiationNeeded(peer);
    }

    this.emit();
  }

  /** Larger user id wins the role of first offerer. */
  private isInitiator(otherUserId: string) {
    return this.userId > otherUserId;
  }

  private async onNegotiationNeeded(peer: PeerConn) {
    if (
      peer.makingOffer ||
      this.destroyed ||
      (peer.pc.signalingState !== "stable" && peer.pc.signalingState !== "new")
    ) {
      return;
    }
    peer.makingOffer = true;
    peer.lastOfferAt = Date.now();
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      console.log("TelaViva: oferta enviada para", peer.displayName);
      await this.sendSignal(peer.userId, {
        type: "offer",
        sdp: peer.pc.localDescription!,
      });
    } catch (err) {
      console.error("TelaViva: falha ao criar oferta", err);
    } finally {
      peer.makingOffer = false;
    }
  }

  /** Watchdog: keep re-negotiating until every peer is connected. */
  private startWatchdog() {
    this.watchdog = window.setInterval(() => {
      if (this.destroyed) return;
      this.peers.forEach((peer) => {
        if (peer.pc.connectionState === "connected") return;
        if (Date.now() - peer.lastOfferAt < 4000) return;
        void this.ensureNegotiation(peer);
      });
    }, 2500);
  }

  private async ensureNegotiation(peer: PeerConn) {
    if (this.destroyed) return;
    try {
      if (peer.pc.signalingState === "have-local-offer") {
        await peer.pc.setLocalDescription({ type: "rollback" });
      }
    } catch {
      /* ignore */
    }
    await this.onNegotiationNeeded(peer);
  }

  private async handleSignal(msg: SignalMessage) {
    const { from_user, payload } = msg;
    let peer = this.peers.get(from_user);
    if (!peer) {
      const pres = this.presence.get(from_user);
      if (pres) this.createPeer(pres);
      if (!this.peers.has(from_user) && payload.type === "offer") {
        this.createPeer({
          userId: from_user,
          displayName: "…",
          avatarUrl: null,
          micOn: true,
          screenOn: false,
        });
      }
      peer = this.peers.get(from_user);
    }
    if (!peer) return;
    switch (payload.type) {
      case "offer":
        await this.handleOffer(peer, payload.sdp);
        break;
      case "answer":
        await this.handleAnswer(peer, payload.sdp);
        break;
      case "ice":
        await this.handleIce(peer, payload.candidate);
        break;
    }
  }

  private async handleOffer(peer: PeerConn, desc: RTCSessionDescriptionInit) {
    if (peer.ignoreOffer) {
      peer.ignoreOffer = false;
      return;
    }
    const ready = !peer.makingOffer && peer.pc.signalingState === "stable";
    if (!ready) {
      if (peer.polite) {
        try {
          await peer.pc.setLocalDescription({ type: "rollback" });
        } catch {
          /* signaling already stable */
        }
        await this.setRemoteAndAnswer(peer, desc);
        return;
      }
      peer.ignoreOffer = true;
      return;
    }
    await this.setRemoteAndAnswer(peer, desc);
  }

  private async setRemoteAndAnswer(
    peer: PeerConn,
    desc: RTCSessionDescriptionInit,
  ) {
    await peer.pc.setRemoteDescription(desc);
    await this.flushIceCandidates(peer);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    console.log("TelaViva: resposta enviada para", peer.displayName);
    await this.sendSignal(peer.userId, { type: "answer", sdp: answer });
  }

  private async handleAnswer(peer: PeerConn, desc: RTCSessionDescriptionInit) {
    if (peer.pc.signalingState !== "have-local-offer") return;
    await peer.pc.setRemoteDescription(desc);
    await this.flushIceCandidates(peer);
  }

  private async handleIce(
    peer: PeerConn,
    candidate: RTCIceCandidateInit | null,
  ) {
    if (!candidate) return;
    if (peer.pc.remoteDescription === null) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("TelaViva: ICE rejeitado", err);
    }
  }

  private async flushIceCandidates(peer: PeerConn) {
    if (peer.pc.remoteDescription === null) return;
    const queue = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queue) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn("TelaViva: ICE rejeitado", err);
      }
    }
  }

  private async sendSignal(toUserId: string | null, payload: SignalPayload) {
    try {
      await supabase.from("signal_messages").insert({
        room_id: this.roomId,
        from_user: this.userId,
        to_user: toUserId,
        payload,
      });
    } catch (err) {
      console.error("TelaViva: falha ao enviar sinal", err);
    }
  }

  // ---------------- presence ----------------

  private onPresenceJoin(list: PresenceData[]) {
    list.forEach((p) => {
      if (p.userId === this.userId) return;
      console.log("TelaViva: presença entrou:", p.displayName);
      this.presence.set(p.userId, p);
      if (!this.peers.has(p.userId)) this.createPeer(p);
    });
    this.emit();
  }

  private onPresenceUpdate(list: PresenceData[]) {
    list.forEach((p) => {
      if (p.userId === this.userId) return;
      this.presence.set(p.userId, p);
      const peer = this.peers.get(p.userId);
      if (peer) {
        peer.displayName = p.displayName;
        peer.avatarUrl = p.avatarUrl;
      }
    });
    this.emit();
  }

  private onPresenceLeave(key: string) {
    console.log("TelaViva: presença saiu:", key);
    this.presence.delete(key);
    this.analysers.delete(key);
    this.closePeer(key);
    this.emit();
  }

  private closePeer(userId: string) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.stream.getTracks().forEach((t) => t.stop());
    peer.pc.close();
    this.peers.delete(userId);
  }

  private async updatePresence() {
    await this.presenceChannel?.track({
      userId: this.userId,
      displayName: this.displayName,
      avatarUrl: this.avatarUrl,
      micOn: this.micOn,
      screenOn: this.screenOn,
    } satisfies PresenceData);
  }

  private emit() {
    if (this.destroyed) return;
    const peers: RemotePeer[] = [];
    this.peers.forEach((peer, userId) => {
      const pres = this.presence.get(userId);
      const hasVideo = peer.stream.getVideoTracks().length > 0;
      peers.push({
        userId,
        displayName: pres?.displayName ?? peer.displayName,
        avatarUrl: pres?.avatarUrl ?? peer.avatarUrl,
        micOn: pres?.micOn ?? true,
        screenOn: pres?.screenOn ?? false,
        speaking: peer.speaking,
        stream: peer.stream,
        hasVideo,
        connected: peer.pc.connectionState === "connected",
      });
    });
    this.onState({
      self: {
        userId: this.userId,
        displayName: this.displayName,
        avatarUrl: this.avatarUrl,
        micOn: this.micOn,
        screenOn: this.screenOn,
        speaking: this.selfSpeaking,
        screenStream: this.localScreen,
      },
      peers,
      micDenied: this.micDenied,
    });
  }
}
