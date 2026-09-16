import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Mic,
  SlidersHorizontal,
  Speaker,
  Square,
  UserRound,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_DEVICE,
  applyOutputDevice,
  getMicDeviceId,
  getMicGain,
  getOutputDeviceId,
  getOutputVolume,
  setMicDeviceId,
  setMicGain,
  setOutputDeviceId,
  setOutputVolume,
  supportsOutputSelection,
} from "@/lib/audio-settings";
import { useAuth } from "@/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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

  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [micDevice, setMicDevice] = useState<string>(
    () => getMicDeviceId() ?? DEFAULT_DEVICE,
  );
  const [outputDevice, setOutputDevice] = useState<string>(
    () => getOutputDeviceId() ?? DEFAULT_DEVICE,
  );
  const [micGain, setMicGainState] = useState<number>(() =>
    Math.round(getMicGain() * 100),
  );
  const [outputVolume, setOutputVolumeState] = useState<number>(() =>
    Math.round(getOutputVolume() * 100),
  );
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [testing, setTesting] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) setName(displayName);
  }, [user, displayName]);

  // Enumerate input and output devices (asks mic permission once for labels).
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
        setInputs(
          list
            .filter((d) => d.kind === "audioinput" && d.deviceId)
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Microfone ${d.deviceId.slice(0, 4)}`,
            })),
        );
        setOutputs(
          list
            .filter((d) => d.kind === "audiooutput" && d.deviceId)
            .map((d) => ({
              deviceId: d.deviceId,
              label: d.label || `Saída ${d.deviceId.slice(0, 4)}`,
            })),
        );
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
          micDevice === DEFAULT_DEVICE
            ? { echoCancellation: true, noiseSuppression: true }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                deviceId: { exact: micDevice },
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

  /** Plays a short tone through the selected output device. */
  const testOutput = async () => {
    if (testingOutput) return;
    setTestingOutput(true);
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 440;
      gain.gain.value = 0.18;
      osc.connect(gain);
      gain.connect(dest);
      const el = new Audio();
      el.srcObject = dest.stream;
      el.volume = Math.max(0, outputVolume / 100);
      if (outputDevice !== DEFAULT_DEVICE) {
        await applyOutputDevice(el, outputDevice);
      }
      osc.start();
      await el.play().catch(() => {});
      window.setTimeout(() => {
        osc.stop();
        el.srcObject = null;
        void ctx.close().catch(() => {});
        setTestingOutput(false);
      }, 1400);
    } catch {
      setTestingOutput(false);
      toast.error(t("auth.error.generic"));
    }
  };

  const saveAudio = () => {
    setMicDeviceId(micDevice);
    setOutputDeviceId(outputDevice);
    setMicGain(micGain / 100);
    setOutputVolume(outputVolume / 100);
    stopTest();
    toast.success(t("profile.audioSaved"));
  };

  const micLabel =
    micDevice === DEFAULT_DEVICE
      ? t("profile.defaultDevice")
      : (inputs.find((d) => d.deviceId === micDevice)?.label ??
        t("profile.defaultDevice"));
  const outputLabel =
    outputDevice === DEFAULT_DEVICE
      ? t("profile.defaultDevice")
      : (outputs.find((d) => d.deviceId === outputDevice)?.label ??
        t("profile.defaultDevice"));

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

        {/* Audio: input, gain, output, volume */}
        <section className="animate-fade-up rounded-3xl border border-border bg-card/50 p-7">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {t("profile.audio")}
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">{t("profile.micHint")}</p>

          <div className="space-y-6">
            {/* Input */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Mic className="h-3.5 w-3.5 text-primary" />
                {t("profile.input")}
              </Label>
              <Select value={micDevice} onValueChange={setMicDevice}>
                <SelectTrigger className="h-11 w-full rounded-xl bg-card/70">
                  <span className="truncate">{micLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_DEVICE}>
                    {t("profile.defaultDevice")}
                  </SelectItem>
                  {inputs.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("profile.micGain")}</span>
                  <span className="font-mono text-muted-foreground">{micGain}%</span>
                </div>
                <Slider
                  value={[micGain]}
                  min={10}
                  max={200}
                  step={5}
                  onValueChange={([v]) => setMicGainState(v)}
                />
              </div>

              {testing && <MicMeter stream={testStream} active={testing} />}

              <div className="flex flex-wrap gap-2">
                {testing ? (
                  <Button variant="outline" size="sm" onClick={stopTest}>
                    <Square className="h-4 w-4" />
                    {t("profile.micStop")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={startTest}>
                    <Mic className="h-4 w-4" />
                    {t("profile.micTest")}
                  </Button>
                )}
                {testing && (
                  <span className="self-center text-sm text-muted-foreground">
                    {t("profile.micTesting")}
                  </span>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Output */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Speaker className="h-3.5 w-3.5 text-primary" />
                {t("profile.output")}
              </Label>
              <Select value={outputDevice} onValueChange={setOutputDevice}>
                <SelectTrigger className="h-11 w-full rounded-xl bg-card/70">
                  <span className="truncate">{outputLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_DEVICE}>
                    {t("profile.defaultDevice")}
                  </SelectItem>
                  {outputs.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!supportsOutputSelection() && (
                <p className="text-xs text-muted-foreground">
                  {t("profile.outputUnsupported")}
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("profile.outputVolume")}
                  </span>
                  <span className="font-mono text-muted-foreground">{outputVolume}%</span>
                </div>
                <Slider
                  value={[outputVolume]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => setOutputVolumeState(v)}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={testOutput}
                disabled={testingOutput}
              >
                <Volume2 className="h-4 w-4" />
                {testingOutput ? t("profile.micTesting") : t("profile.testOutput")}
              </Button>
            </div>

            <div className="flex justify-end border-t border-border pt-5">
              <Button onClick={saveAudio} className="h-11 rounded-xl px-6">
                {t("common.save")}
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
