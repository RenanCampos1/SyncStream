import { useTranslation } from "react-i18next";
import {
  Flame,
  Ghost,
  Mic,
  MicOff,
  MonitorUp,
  Sparkles,
  Users,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { RemotePeer, SelfState } from "@/lib/webrtc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Equalizer } from "./video-grid";
import type { CandleColor } from "./candle-overlay";

function ParticipantRow({
  userId,
  name,
  avatarUrl,
  micOn,
  screenOn,
  speaking,
  connected,
  isSelf,
  onCandle,
}: {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  micOn: boolean;
  screenOn: boolean;
  speaking?: boolean;
  connected?: boolean;
  isSelf?: boolean;
  onCandle?: (userId: string, color: CandleColor) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60",
        speaking && "bg-primary/10",
      )}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={avatarUrl ?? undefined} alt={name} />
          <AvatarFallback className="bg-gradient-to-br from-accent to-primary font-display text-sm font-bold text-primary-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
            connected ? "bg-primary" : "bg-muted-foreground/60",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          <span className={cn("truncate", speaking && "speak-pulse font-semibold")}>
            {name}
          </span>
          {speaking && <Equalizer className="shrink-0" />}
          {isSelf && (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {t("room.self")}
            </span>
          )}
        </p>
      </div>
      {screenOn && (
        <span
          className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"
          title={t("room.screenSharing")}
        >
          <MonitorUp className="h-3 w-3" />
        </span>
      )}
      {micOn ? (
        <Mic className={cn("h-4 w-4 text-muted-foreground", isSelf && "text-primary")} />
      ) : (
        <MicOff className="h-4 w-4 text-destructive" />
      )}
      {!isSelf && onCandle && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-amber-400"
              aria-label={t("room.candleFor", { name })}
              title={t("room.candleFor", { name })}
            >
              <Flame className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onCandle(userId, "white")}
              className="cursor-pointer"
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              {t("room.candleWhite")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onCandle(userId, "black")}
              className="cursor-pointer"
            >
              <Ghost className="h-4 w-4 text-fuchsia-400" />
              {t("room.candleBlack")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function ParticipantList({
  self,
  peers,
  onCandle,
}: {
  self: SelfState;
  peers: RemotePeer[];
  onCandle?: (userId: string, color: CandleColor) => void;
}) {
  const { t } = useTranslation();
  const total = peers.length + 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("room.members")}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {total}
        </span>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {peers.map((p) => (
          <ParticipantRow
            key={p.userId}
            userId={p.userId}
            name={p.displayName}
            avatarUrl={p.avatarUrl}
            micOn={p.micOn}
            screenOn={p.screenOn}
            speaking={p.speaking}
            connected={p.connected}
            onCandle={onCandle}
          />
        ))}
        <ParticipantRow
          userId={self.userId}
          name={self.displayName}
          avatarUrl={self.avatarUrl}
          micOn={self.micOn}
          screenOn={self.screenOn}
          speaking={self.speaking}
          connected
          isSelf
        />
      </div>
    </div>
  );
}
