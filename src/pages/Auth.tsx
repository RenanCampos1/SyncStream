import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { trackEvent } from "@enter-pro/analytics-sdk";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { BrandLogo } from "@/components/brand-logo";

export default function Auth() {
  const { t } = useTranslation();
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !loading) navigate("/home", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && !name.trim()) {
      setError(t("auth.nameRequired"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth.passwordHint"));
      return;
    }

    setBusy(true);
    const result =
      mode === "signup"
        ? await signUp(name, email, password)
        : await signIn(email, password);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    toast.success(mode === "signup" ? t("auth.signup.title") : t("auth.login.title"), {
      description: t(mode === "signup" ? "auth.signup.subtitle" : "auth.login.subtitle"),
    });
    trackEvent(mode === "signup" ? "signup_completed" : "login_completed", {
      eventType: "conversion",
    });
    navigate("/home");
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="flex min-h-screen bg-app text-foreground">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <Link to="/" className="flex w-fit items-center gap-2.5">
            <BrandLogo size={40} className="rounded-xl" />
            <span className="font-display text-xl font-bold tracking-tight">
              {t("common.appName")}
            </span>
          </Link>

          <div>
            <div className="mb-5 flex items-center gap-2">
              <span className="live-dot" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-destructive">
                {t("common.live")}
              </span>
            </div>
            <h2 className="w-full pr-2 font-display text-3xl font-bold leading-tight">
              {t("landing.hero.title")}
            </h2>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {["Voz", "Tela", "Chat"].map((f, i) => (
                <div
                  key={f}
                  className="rounded-xl border border-border bg-card/50 px-4 py-3 text-center text-sm font-semibold"
                >
                  <span className="mr-1 text-primary">{i + 1}.</span>
                  {f}
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{t("landing.footer.tagline")}</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex w-full items-center justify-center bg-gradient-soft px-6 py-12 lg:w-1/2 lg:bg-transparent">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandLogo size={36} className="rounded-xl" />
            <span className="font-display text-lg font-bold">{t("common.appName")}</span>
          </Link>

          <div className="animate-fade-up">
            <h1 className="font-display text-2xl font-bold">
              {t(mode === "login" ? "auth.login.title" : "auth.signup.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(mode === "login" ? "auth.login.subtitle" : "auth.signup.subtitle")}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-card/60 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                  mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("auth.login.title")}
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                  mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("auth.signup.title")}
              </button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.name")}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("auth.name")}
                    autoComplete="name"
                    className="h-11 rounded-xl bg-card/70"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  autoComplete="email"
                  required
                  className="h-11 rounded-xl bg-card/70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  className="h-11 rounded-xl bg-card/70"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-base font-semibold">
                {busy
                  ? t("common.loading")
                  : t(mode === "login" ? "auth.login.cta" : "auth.signup.cta")}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  {t("auth.switchToSignup")}{" "}
                  <button
                    onClick={() => switchMode("signup")}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    {t("auth.signup.title")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => switchMode("login")}
                  className="font-semibold text-primary hover:underline"
                >
                  {t("auth.switchToLogin")}
                </button>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
