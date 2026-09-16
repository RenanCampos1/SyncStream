import { useTranslation } from "react-i18next";
import { Mic, MicOff, MonitorUp, Users } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { RemotePeer, SelfState } from "@/lib/webrtc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function ParticipantList({
  self,
  peers,
}: {
  self: SelfState;
  peers: RemotePeer[];
}) {
  const { t } = useTranslation();
  const total = peers.length + 1;

  const Row = ({
    name,
    micOn,
    screenOn,
    isSelf,
  }: {
    name: string;
    micOn: boolean;
    screenOn: boolean;
    isSelf?: boolean;
  }) => (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-gradient-to-br from-accent to-primary font-display text-sm font-bold text-primary-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {isSelf && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
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
    </div>
  );

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
          <Row key={p.userId} name={p.displayName} micOn={p.micOn} screenOn={p.screenOn} />
        ))}
        <Row name={self.displayName} micOn={self.micOn} screenOn={self.screenOn} isSelf />
      </div>
    </div>
  );
}
