import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MicOff, MonitorUp } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import {
  applyOutputDevice,
  getOutputDeviceId,
  getOutputVolume,
} from "@/lib/audio-settings";
import type { RemotePeer, SelfState } from "@/lib/webrtc";

function StreamVideo({
  stream,
  muted,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn("h-full w-full", className)}
    />
  );
}

/** Hidden audio element that plays a remote peer's mic track. */
function RemoteAudio({
  stream,
  volume,
}: {
  stream: MediaStream | null;
  volume?: number | null;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.volume = volume ?? getOutputVolume();
    void applyOutputDevice(el, getOutputDeviceId());
    if (stream) {
      void el.play().catch(() => {
        /* autoplay blocked until user interaction — retry handled by React */
      });
    }
  }, [stream, volume]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export function Equalizer({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-3 items-end gap-[3px]", className)}>
      <span className="animate-equalize h-full w-[3px] rounded-full bg-primary" />
      <span
        className="animate-equalize h-full w-[3px] rounded-full bg-primary"
        style={{ animationDelay: "0.18s" }}
      />
      <span
        className="animate-equalize h-full w-[3px] rounded-full bg-primary"
        style={{ animationDelay: "0.36s" }}
      />
    </span>
  );
}

export function AvatarTile({
  name,
  avatarUrl,
  micOn,
  speaking,
  isSelf,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  micOn: boolean;
  speaking?: boolean;
  isSelf?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center gap-4",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-primary shadow-lg transition-shadow duration-300 md:h-24 md:w-24",
          speaking && "shadow-[0_0_30px_hsl(var(--primary)/0.8)]",
        )}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            crossOrigin="anonymous"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-xl font-bold text-primary-foreground md:text-3xl">
            {initials(name)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground md:text-base">
        <span className={cn("truncate", speaking && "speak-pulse font-semibold")}>
          {name}
        </span>
        {speaking && <Equalizer />}
        {isSelf && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("room.self")}
          </span>
        )}
      </div>
      {!micOn && (
        <MicOff className="absolute right-3 top-3 h-5 w-5 text-destructive" />
      )}
    </div>
  );
}

function TileLabel({
  name,
  screenOn,
  micOn,
  speaking,
  self,
}: {
  name: string;
  screenOn: boolean;
  micOn: boolean;
  speaking?: boolean;
  self?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          className={cn(
            "truncate text-sm font-semibold text-white",
            speaking && "speak-pulse",
          )}
        >
          {name}
          {self && (
            <span className="ml-2 text-xs text-white/70">
              · {t("room.self")}
            </span>
          )}
        </span>
        {screenOn && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
            <MonitorUp className="h-3 w-3" />
            {t("room.screenSharing")}
          </span>
        )}
        {speaking && <Equalizer className="shrink-0" />}
      </div>
      {!micOn && <MicOff className="h-4 w-4 shrink-0 text-red-400" />}
    </div>
  );
}

export function VideoTile({
  peer,
  isSelf,
  self,
  volume,
}: {
  peer?: RemotePeer;
  isSelf?: boolean;
  self?: SelfState;
  volume?: number | null;
}) {
  const { t } = useTranslation();
  const name = isSelf ? (self?.displayName ?? "") : (peer?.displayName ?? "");
  const avatarUrl = isSelf ? (self?.avatarUrl ?? null) : (peer?.avatarUrl ?? null);
  const micOn = isSelf ? (self?.micOn ?? true) : (peer?.micOn ?? true);
  const screenOn = isSelf ? (self?.screenOn ?? false) : (peer?.screenOn ?? false);
  const speaking = isSelf
    ? (self?.speaking ?? false)
    : (peer?.speaking ?? false);
  const hasVideo = isSelf
    ? (self?.screenOn ?? false)
    : (peer?.hasVideo ?? false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black/30">
      {!isSelf && peer && <RemoteAudio stream={peer.stream} volume={volume} />}
      {hasVideo ? (
        <>
          <StreamVideo
            stream={isSelf ? (self?.screenStream ?? null) : (peer?.stream ?? null)}
            muted
            className="object-contain"
          />
          <TileLabel
            name={name}
            screenOn={screenOn}
            micOn={micOn}
            speaking={speaking}
            self={isSelf}
          />
        </>
      ) : (
        <>
          <AvatarTile
            name={name}
            avatarUrl={avatarUrl}
            micOn={micOn}
            speaking={speaking}
            isSelf={isSelf}
          />
          <TileLabel
            name={name}
            screenOn={false}
            micOn={micOn}
            speaking={speaking}
            self={isSelf}
          />
        </>
      )}
      {peer && !peer.connected && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <span className="flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("room.connecting")}
          </span>
        </div>
      )}
    </div>
  );
}

export function VideoGrid({
  self,
  peers,
  volumes,
}: {
  self: SelfState;
  peers: RemotePeer[];
  volumes?: Record<string, number | null>;
}) {
  const count = peers.length + 1;
  const cols =
    count === 1
      ? "grid-cols-1"
      : count <= 4
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={cn("grid w-full gap-3 p-4 md:gap-4", cols)}>
      {peers.map((p) => (
        <VideoTile key={p.userId} peer={p} volume={volumes?.[p.userId] ?? null} />
      ))}
      <VideoTile isSelf self={self} />
    </div>
  );
}
