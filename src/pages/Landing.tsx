import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Download,
  MessageSquare,
  Mic,
  MonitorUp,
  Ticket,
} from "lucide-react";
import { trackEvent } from "@enter-pro/analytics-sdk";
import { Button } from "@/components/ui/button";
import { DESKTOP_WINDOWS_URL } from "@/lib/download-links";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";

const FEATURES = [
  { icon: Mic, title: "landing.features.voz.title", desc: "landing.features.voz.desc" },
  { icon: MonitorUp, title: "landing.features.tela.title", desc: "landing.features.tela.desc" },
  { icon: MessageSquare, title: "landing.features.chat.title", desc: "landing.features.chat.desc" },
  { icon: Ticket, title: "landing.features.convite.title", desc: "landing.features.convite.desc" },
];

const STEPS = [
  { n: "01", title: "landing.how.step1.title", desc: "landing.how.step1.desc" },
  { n: "02", title: "landing.how.step2.title", desc: "landing.how.step2.desc" },
  { n: "03", title: "landing.how.step3.title", desc: "landing.how.step3.desc" },
];

const STATS = [
  { value: "<10s", label: "landing.stats.seconds" },
  { value: "P2P", label: "landing.stats.p2p" },
  { value: "Ilimitadas", label: "landing.stats.screens" },
];

export default function Landing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const goJoin = () => {
    const norm = code.trim().toUpperCase();
    if (!norm) return;
    navigate(user ? `/room/${norm}` : "/auth");
  };

  const heroTitle = t("landing.hero.title");
  const marker = "ao vivo";
  const markerIdx = heroTitle.indexOf(marker);
  const titleBefore = markerIdx >= 0 ? heroTitle.slice(0, markerIdx) : heroTitle;
  const titleAfter = markerIdx >= 0 ? heroTitle.slice(markerIdx + marker.length) : "";

  const primaryCta = user ? "/home" : "/auth";

  return (
    <div className="min-h-screen overflow-x-hidden bg-app text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-60" />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo size={36} className="rounded-xl" />
          <span className="font-display text-lg font-bold tracking-tight">
            {t("common.appName")}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <Button onClick={() => navigate("/home")} variant="ghost">
              {t("home.welcome", { name: "" }).split(",")[0]}, {user.email?.split("@")[0]}
            </Button>
          ) : (
            <>
              <Button onClick={() => navigate("/auth")} variant="ghost">
                {t("auth.login.title")}
              </Button>
              <Button onClick={() => navigate("/auth")} className="hidden sm:inline-flex">
                {t("auth.signup.title")}
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-16 pt-14 text-center md:pb-24 md:pt-20">
          <div className="animate-fade-up flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 backdrop-blur">
            <span className="live-dot" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-destructive">
              {t("common.live")}
            </span>
            <span className="text-xs text-muted-foreground">{t("landing.badge")}</span>
          </div>

          <h1
            className="animate-fade-up mt-8 font-display text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            {titleBefore}
            {markerIdx >= 0 && <span className="text-gradient">ao vivo</span>}
            {titleAfter}
          </h1>

          <p
            className="animate-fade-up mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
            style={{ animationDelay: "160ms" }}
          >
            {t("landing.hero.subtitle")}
          </p>

          <div
            className="animate-fade-up mt-10 flex flex-col items-center gap-4 sm:flex-row"
            style={{ animationDelay: "240ms" }}
          >
            <Button
              size="lg"
              onClick={() => navigate(primaryCta)}
              className="group h-12 rounded-full px-8 text-base font-semibold"
            >
              {t("landing.hero.ctaPrimary")}
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Button>
            <div className="flex w-full max-w-sm flex-col items-center gap-2 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goJoin()}
                placeholder={t("landing.hero.codeLabel")}
                className="h-12 w-full rounded-full border-border bg-card/70 text-center font-mono uppercase tracking-[0.3em] backdrop-blur"
                maxLength={6}
              />
              <Button
                variant="outline"
                size="lg"
                onClick={goJoin}
                className="h-12 w-full rounded-full sm:w-auto"
              >
                {t("landing.hero.ctaSecondary")}
              </Button>
            </div>
          </div>

          {/* Mini mock of a room */}
          <div
            className="animate-fade-up mt-16 w-full max-w-3xl"
            style={{ animationDelay: "320ms" }}
          >
            <div className="glass overflow-hidden rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="live-dot" />
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    sala · A1B2C3
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-6 w-6 rounded-full bg-gradient-to-br from-accent/70 to-primary/70"
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3">
                <div className="col-span-2 flex aspect-video items-center justify-center rounded-xl border border-border bg-black/40 md:col-span-1">
                  <MonitorUp className="h-8 w-8 text-primary/70" />
                </div>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex aspect-video items-center justify-center rounded-xl border border-border bg-card/60"
                  >
                    <span className="font-display text-sm font-bold text-muted-foreground">
                      {String.fromCharCode(65 + i)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 border-y border-border/60 px-6 py-10 sm:flex-row sm:gap-16">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-bold text-gradient">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(s.label)}</p>
            </div>
          ))}
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              {t("landing.features.title")}
            </h2>
            <p className="mt-3 text-muted-foreground">{t("landing.features.subtitle")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--glow-primary)]"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-lg">
                  <f.icon className="h-6 w-6" />
                </span>
                <h3 className="font-semibold">{t(f.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(f.desc)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-4xl px-6 pb-20 md:pb-28">
          <h2 className="mb-12 text-center font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t("landing.how.title")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative rounded-2xl border border-border bg-card/40 p-6 pt-12">
                <span className="absolute left-6 top-6 font-display text-5xl font-bold text-transparent [-webkit-text-stroke:1px_hsl(var(--primary)/0.6)]">
                  {s.n}
                </span>
                <div className="mt-4 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold">{t(s.title)}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(s.desc)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Desktop app download */}
      <section className="mx-auto max-w-4xl px-6 pb-20 md:pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card/50 p-8 text-center md:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t("landing.download.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            {t("landing.download.desc")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {DESKTOP_WINDOWS_URL ? (
              <Button asChild size="lg" className="h-12 rounded-full px-8 text-base font-semibold">
                <a
                  href={DESKTOP_WINDOWS_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackEvent("desktop_download_clicked", {
                      eventType: "conversion",
                    })
                  }
                >
                  <Download />
                  {t("landing.download.windows")}
                </a>
              </Button>
            ) : (
              <Button size="lg" disabled className="h-12 rounded-full px-8 text-base font-semibold">
                <Download />
                {t("landing.download.windows")}
              </Button>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border bg-card/60 px-3 py-1.5">
                {t("landing.download.mac")} · {t("landing.download.soon")}
              </span>
              <span className="rounded-full border border-border bg-card/60 px-3 py-1.5">
                {t("landing.download.linux")} · {t("landing.download.soon")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-10 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <BrandLogo size={28} className="rounded-lg" />
          <span className="font-display font-bold">{t("common.appName")}</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("landing.footer.tagline")}</p>
      </footer>
    </div>
  );
}
