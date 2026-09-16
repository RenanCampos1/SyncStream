import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type CandleColor = "white" | "black";

export function Candle({
  color,
  size = "md",
}: {
  color: CandleColor;
  size?: "md" | "lg";
}) {
  const flameSize = size === "lg" ? "h-16 w-12 -top-9" : "h-12 w-9 -top-7";
  const flameGlow =
    color === "white"
      ? "shadow-[0_0_40px_12px_rgba(251,191,36,0.55)]"
      : "shadow-[0_0_40px_12px_rgba(147,51,234,0.5)]";
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={cn(
          "candle-halo absolute h-48 w-48 rounded-full blur-2xl",
          color === "white" ? "bg-amber-400/40" : "bg-violet-600/40",
        )}
      />
      <div className="relative z-10">
        <div
          className={cn(
            "relative h-36 w-14 rounded-t-lg rounded-b-sm shadow-lg",
            color === "white"
              ? "bg-gradient-to-b from-amber-50 to-amber-200"
              : "border border-zinc-600 bg-gradient-to-b from-zinc-700 to-black",
          )}
        >
          <div className="absolute left-1/2 top-0 h-1.5 w-1 -translate-x-1/2 -translate-y-px rounded-full bg-zinc-900" />
        </div>
        <div
          className={cn(
            "candle-flame absolute z-10 -translate-x-1/2 rounded-[50%_50%_50%_50%/65%_65%_35%_35%]",
            flameSize,
            flameGlow,
            color === "white"
              ? "left-1/2 bg-gradient-to-t from-orange-500 via-yellow-300 to-white"
              : "left-1/2 bg-gradient-to-t from-red-700 via-purple-600 to-fuchsia-400",
          )}
        />
      </div>
    </div>
  );
}

export function CandleOverlay({
  sender,
  color,
}: {
  sender: string;
  color: CandleColor;
}) {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-up fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-black/85 backdrop-blur-md">
      <Candle color={color} size="lg" />
      <p
        className={cn(
          "z-10 max-w-md px-6 text-center font-display text-lg font-bold md:text-2xl",
          color === "white" ? "text-amber-200" : "text-fuchsia-300",
        )}
      >
        {color === "white"
          ? t("room.candleReceivedWhite", { name: sender })
          : t("room.candleReceivedBlack", { name: sender })}
      </p>
    </div>
  );
}
