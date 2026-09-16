import { useTranslation } from "react-i18next";
import { Mic, MicOff, MonitorUp, PhoneOff, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function RoundButton({
  active,
  danger,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 md:h-14 md:w-14",
            danger
              ? "border-transparent bg-destructive text-white shadow-lg hover:bg-destructive/90"
              : active
                ? "border-primary bg-primary text-primary-foreground shadow-[var(--glow-primary)]"
                : "border-border bg-card/80 text-foreground hover:border-foreground/30 hover:bg-card",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBar({
  micOn,
  screenOn,
  onToggleMic,
  onToggleScreen,
  onLeave,
}: {
  micOn: boolean;
  screenOn: boolean;
  onToggleMic: () => void;
  onToggleScreen: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center gap-3 pb-5 pt-2 md:gap-4">
      <RoundButton
        active={micOn}
        onClick={onToggleMic}
        label={micOn ? t("room.mic") : t("room.muted")}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </RoundButton>

      <RoundButton
        active={screenOn}
        onClick={onToggleScreen}
        label={screenOn ? t("room.stopShare") : t("room.share")}
      >
        {screenOn ? (
          <Square className="h-5 w-5" />
        ) : (
          <MonitorUp className="h-5 w-5" />
        )}
      </RoundButton>

      <RoundButton danger onClick={onLeave} label={t("room.leave")}>
        <PhoneOff className="h-5 w-5" />
      </RoundButton>
    </div>
  );
}
