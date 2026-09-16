import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  LogOut,
  MonitorUp,
  Plus,
  Radio,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type MyRoom = {
  code: string;
  name: string;
  created_at: string;
  created_by: string;
};

export default function Home() {
  const { t } = useTranslation();
  const { user, loading, displayName, signOut } = useAuth();
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [rooms, setRooms] = useState<MyRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("room_members")
        .select("room_id, joined_at, rooms(code, name, created_at, created_by)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });
      if (cancelled) return;
      setRooms(
        (data ?? [])
          .map((r) => r.rooms)
          .filter((r): r is MyRoom => r !== null && !!r.code),
      );
      setRoomsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const createRoom = async () => {
    if (!user) return;
    setCreating(true);
    const name = roomName.trim() || "Sala";
    const { data, error } = await supabase
      .from("rooms")
      .insert({ name, created_by: user.id })
      .select("id, code")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error(t("auth.error.generic"));
      return;
    }
    await supabase.from("room_members").insert({
      room_id: data.id,
      user_id: user.id,
    });
    navigate(`/room/${data.code}`);
  };

  const joinRoom = () => {
    const norm = joinCode.trim().toUpperCase();
    if (!norm) return;
    navigate(`/room/${norm}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-app text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-primary shadow-[var(--glow-accent)]">
            <Radio className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {t("common.appName")}
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 py-1.5 pl-1.5 pr-4">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-gradient-to-br from-accent to-primary font-display text-xs font-bold text-primary-foreground">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{displayName}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label={t("home.signOut")}>
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-20">
        <div className="pt-6 md:pt-10">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            {t("home.welcome", { name: displayName.split(" ")[0] })}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("home.subtitle")}</p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {/* Create */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card/50 p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-primary text-primary-foreground shadow-lg">
              <Plus className="h-6 w-6" />
            </span>
            <h2 className="font-semibold">{t("home.create.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.create.desc")}</p>
            <div className="mt-5 flex gap-2">
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createRoom()}
                placeholder={t("home.create.title")}
                className="h-11 flex-1 rounded-xl bg-card/70"
              />
              <Button
                onClick={createRoom}
                disabled={creating}
                className="h-11 rounded-xl px-5"
              >
                {creating ? t("common.loading") : t("home.create.cta")}
              </Button>
            </div>
          </div>

          {/* Join */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card/50 p-7">
            <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-accent/10 blur-2xl" />
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/40 bg-primary/15 text-primary">
              <Ticket className="h-6 w-6" />
            </span>
            <h2 className="font-semibold">{t("home.join.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.join.desc")}</p>
            <div className="mt-5 flex gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                placeholder={t("home.join.placeholder")}
                maxLength={6}
                className="h-11 flex-1 rounded-xl bg-card/70 font-mono uppercase tracking-[0.3em]"
              />
              <Button
                onClick={joinRoom}
                variant="outline"
                className="h-11 rounded-xl px-5"
              >
                {t("home.join.cta")}
              </Button>
            </div>
          </div>
        </div>

        {/* My rooms */}
        <section className="mt-12">
          <h2 className="mb-4 font-display text-xl font-bold">{t("home.myRooms")}</h2>
          {roomsLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <MonitorUp className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">{t("home.empty")}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rooms.map((r) => (
                <button
                  key={r.code}
                  onClick={() => navigate(`/room/${r.code}`)}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card/40 p-4 text-left transition-all hover:border-primary/40 hover:shadow-[var(--glow-primary)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-primary font-mono text-sm font-bold text-primary-foreground">
                    {r.code.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono uppercase tracking-widest">{r.code}</span>
                      {r.created_by === user?.id && <span>· {t("home.invitedBy")}</span>}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
