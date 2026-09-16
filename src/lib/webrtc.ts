import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  micOn: boolean;
  screenOn: boolean;
};

export type RemotePeer = {
  userId: string;
  displayName: string;
  micOn: boolean;
  screenOn: boolean;
  stream: MediaStream;
  hasVideo: boolean;
  connected: boolean;
};

export type SelfState = {
  userId: string;
  displayName: string;
  micOn: boolean;
  screenOn: boolean;
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
  pc: RTCPeerConnection;
  stream: MediaStream;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  pendingCandidates: RTCIceCandidateInit[];
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

/**
 * Mesh WebRTC manager for one room: voice (mic) + screen sharing.
 * Signaling flows through the `signal_messages` table (postgres_changes),
 * presence through a realtime presence channel. Uses the "perfect
 * negotiation" pattern (polite/impolite + rollback) to resolve offer glare,
 * and queues ICE candidates until the remote description is set.
 */
export class RoomClient {
  private roomId: string;
  private roomCode: string;
  private userId: string;
  private displayName: string;

  private localMic: MediaStream | null = null;
  private localScreen: MediaStream | null = null;
  private micOn = true;
  private screenOn = false;
  private micDenied = false;

  private peers = new Map<string, PeerConn>();
  private presence = new Map<string, PresenceData>();
  private peerRetries = new Map<string, number>();
  private retryTimers: number[] = [];

  private signalChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private destroyed = false;

  private onState: (state: RoomClientState) => void;

  constructor(
    opts: {
      roomId: string;
      roomCode: string;
      userId: string;
      displayName: string;
    },
    onState: (state: RoomClientState) => void,
  ) {
    this.roomId = opts.roomId;
    this.roomCode = opts.roomCode;
    this.userId = opts.userId;
    this.displayName = opts.displayName;
    this.onState = onState;
  }

  async join() {
    try {
      this.localMic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.micOn = false;
      this.micDenied = true;
    }

    const presenceData: PresenceData = {
      userId: this.userId,
      displayName: this.displayName,
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
        // Existing members are only available through presenceState() for a
        // late joiner — connect to everyone already in the room.
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
  }

  getScreenOn() {
    return this.screenOn;
  }

  /** Deterministic single-initiator: the user with the larger id sends the
   *  first offer, so the initial handshake never glares. Renegotiation
   *  (screen share) is allowed from either side via perfect negotiation. */
  private isInitiator(otherUserId: string) {
    return this.userId > otherUserId;
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

  // ---------------- internal ----------------

  private createPeer(p: PresenceData) {
    if (this.peers.has(p.userId) || this.destroyed) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const stream = new MediaStream();
    const peer: PeerConn = {
      userId: p.userId,
      displayName: p.displayName,
      pc,
      stream,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.userId > p.userId,
      pendingCandidates: [],
    };
    this.peers.set(p.userId, peer);

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
      this.emit();
    };

    pc.onconnectionstatechange = () => {
      if (this.destroyed) return;
      if (pc.connectionState === "connected") {
        this.peerRetries.set(p.userId, 0);
      } else if (
        pc.connectionState === "failed" &&
        this.peers.has(p.userId)
      ) {
        // Self-heal flaky connections (up to 3 attempts per peer).
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
      // Offer on first connection only if we are the initiator; once the
      // connection exists (remote description set) either side may renegotiate.
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

    // Explicitly kick off the handshake even if no local tracks exist yet
    // (e.g. microphone blocked), so the peer still connects.
    if (this.isInitiator(p.userId)) {
      void this.onNegotiationNeeded(peer);
    }

    this.emit();
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
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
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

  private async handleSignal(msg: SignalMessage) {
    const { from_user, payload } = msg;
    let peer = this.peers.get(from_user);
    if (!peer) {
      const pres = this.presence.get(from_user);
      if (pres) this.createPeer(pres);
      // An offer can arrive before the presence sync — create the peer from
      // the offer itself so the handshake is never dropped.
      if (!this.peers.has(from_user) && payload.type === "offer") {
        this.createPeer({
          userId: from_user,
          displayName: "…",
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
    const ready =
      !peer.makingOffer && peer.pc.signalingState === "stable";
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
      // Remote description not set yet — queue until offer/answer arrives.
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
    await supabase.from("signal_messages").insert({
      room_id: this.roomId,
      from_user: this.userId,
      to_user: toUserId,
      payload,
    });
  }

  private onPresenceJoin(list: PresenceData[]) {
    list.forEach((p) => {
      if (p.userId === this.userId) return;
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
      if (peer) peer.displayName = p.displayName;
    });
    this.emit();
  }

  private onPresenceLeave(key: string) {
    this.presence.delete(key);
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
        micOn: pres?.micOn ?? true,
        screenOn: pres?.screenOn ?? false,
        stream: peer.stream,
        hasVideo,
        connected: peer.pc.connectionState === "connected",
      });
    });
    this.onState({
      self: {
        userId: this.userId,
        displayName: this.displayName,
        micOn: this.micOn,
        screenOn: this.screenOn,
        screenStream: this.localScreen,
      },
      peers,
      micDenied: this.micDenied,
    });
  }
}
