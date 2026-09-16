import { cn } from "@/lib/utils";

export const BRAND_LOGO_URL =
  "https://cdn.enter.pro/resources/uid_100541343/labutuca-logo_bd041355.png";

export function BrandLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={BRAND_LOGO_URL}
      alt="LAButuca"
      crossOrigin="anonymous"
      className={cn("shrink-0 rounded-xl object-cover shadow-[var(--glow-accent)]", className)}
      style={{ width: size, height: size }}
    />
  );
}
