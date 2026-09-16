import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Mic,
  Square,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MIC_DEVICE_KEY } from "@/lib/webrtc";
import { useAuth } from "@/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AudioDevice = { deviceId: string; label: string };

function MicMeter({
  stream,
  active,
}: {
  stream: MediaStream | null;
  active: boolean;
}) {
  const { t } = useTranslation();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || !active) return;
    let cancelled = false;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const timer = window.setInterval(() => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setLevel(sum / data.length / 255);
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void ctx.close();
    };
  }, [stream, active]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("profile.micLevel")}</span>
        <span className="font-mono">{Math.round(level * 100)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150",
            level > 0.5 ? "bg-destructive" : "bg-gradient-to-r from-accent to-primary",
          )}
          style={{ width: `${Math.min(100, Math.max(4, level * 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user, loading, displayName, avatarUrl, signOut } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>(
    () => localStorage.getItem(MIC_DEVICE_KEY) ?? "default",
  );
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) setName(displayName);
  }, [user, displayName]);

  // Enumerate input devices (asks mic permission once to reveal labels).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let probe: MediaStream | null = null;
      try {
        probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        /* permission denied — still enumerate (labels may be generic) */
      }
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const inputs = list
          .filter((d) => d.kind === "audioinput" && d.deviceId)
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microfone ${d.deviceId.slice(0, 4)}`,
          }));
        setDevices(inputs);
      } catch {
        /* ignore */
      }
      probe?.getTracks().forEach((tr) => tr.stop());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      testStream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [testStream]);

  const saveName = async () => {
    if (!user || !name.trim()) return;
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name.trim() },
    });
    setSavingName(false);
    if (error) {
      toast.error(t("auth.error.generic"));
      return;
    }
    toast.success(t("profile.saved"));
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("profile.photoHint"));
      return;
    }
    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    setUploading(true);
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) {
      setUploading(false);
      toast.error(t("auth.error.generic"));
      return;
    }
    const { data: publicUrl } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);
    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl.publicUrl },
    });
    setUploading(false);
    if (updateError) {
      toast.error(t("auth.error.generic"));
      return;
    }
    toast.success(t("profile.photoSaved"));
  };

  const startTest = async () => {
    setTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:
          selectedDevice === "default"
            ? { echoCancellation: true, noiseSuppression: true }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                deviceId: { exact: selectedDevice },
              },
      });
      setTestStream(stream);
    } catch {
      setTesting(false);
      setTestStream(null);
      toast.error(t("auth.error.generic"));
    }
  };

  const stopTest = () => {
    testStream?.getTracks().forEach((tr) => tr.stop());
    setTestStream(null);
    setTesting(false);
  };

  const saveMic = async () => {
    if (selectedDevice === "default") {
      localStorage.removeItem(MIC_DEVICE_KEY);
    } else {
      localStorage.setItem(MIC_DEVICE_KEY, selectedDevice);
    }
    stopTest();
    toast.success(t("profile.micSaved"));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-app text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />

      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/home")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("common.backHome")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-display text-xl font-bold">{t("profile.title")}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          {t("home.signOut")}
        </Button>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl space-y-5 px-6 pb-20">
        {/* Photo */}
        <section className="animate-fade-up rounded-3xl border border-border bg-card/50 p-7">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <UserRound className="h-4 w-4 text-primary" />
            {t("profile.photo")}
          </h2>
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-primary text-2xl font-bold text-primary-foreground shadow-lg">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  crossOrigin="anonymous"
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(displayName)
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {uploading ? t("profile.uploading") : t("profile.changePhoto")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("profile.photoHint")}
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
          </div>
        </section>

        {/* Name */}
        <section className="animate-fade-up rounded-3xl border border-border bg-card/50 p-7">
          <h2 className="mb-4 font-semibold">{t("profile.name")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("profile.nameHint")}</p>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profile.namePlaceholder")}
              className="h-11 flex-1 rounded-xl bg-card/70"
            />
            <Button
              onClick={saveName}
              disabled={savingName || !name.trim()}
              className="h-11 rounded-xl px-6"
            >
              {savingName ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </section>

        {/* Microphone */}
        <section className="animate-fade-up rounded-3xl border border-border bg-card/50 p-7">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <Mic className="h-4 w-4 text-primary" />
            {t("profile.mic")}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("profile.micHint")}</p>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mic-device">{t("profile.micSelect")}</Label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger id="mic-device" className="h-11 w-full rounded-xl bg-card/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("profile.defaultDevice")}</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {testing && <MicMeter stream={testStream} active={testing} />}

            <div className="flex flex-wrap gap-2">
              {testing ? (
                <Button variant="outline" onClick={stopTest}>
                  <Square className="h-4 w-4" />
                  {t("profile.micStop")}
                </Button>
              ) : (
                <Button variant="outline" onClick={startTest}>
                  <Mic className="h-4 w-4" />
                  {t("profile.micTest")}
                </Button>
              )}
              <Button onClick={saveMic}>
                {t("common.save")}
              </Button>
            </div>
            {testing && (
              <p className="text-sm text-muted-foreground">{t("profile.micTesting")}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
