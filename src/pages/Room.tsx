import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MessageSquare,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  supabase,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/integrations/supabase/client";
import { RoomClient, type RoomClientState } from "@/lib/webrtc";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VideoGrid } from "@/components/room/video-grid";
import { ParticipantList } from "@/components/room/participant-list";
import { ChatPanel, type ChatMessage } from "@/components/room/chat-panel";
import { ControlBar } from "@/components/room/control-bar";

type RoomRow = {
  id: string;
  code: string;
  name: string;
  created_by: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  content: string;
  created_at: string;
};

const toChatMessage = (m: MessageRow): ChatMessage => ({
  id: m.id,
  userId: m.user_id,
  displayName: m.display_name || m.user_id.slice(0, 6),
  content: m.content,
  createdAt: m.created_at,
});

export default function Room() {
  const { code } = useParams();
  const { user, loading: authLoading, displayName, avatarUrl } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [ready, setReady] = useState(false);
  const [clientState, setClientState] = useState<RoomClientState | null>(null);
  const clientRef = useRef<RoomClient | null>(null);
  const chatChannelRef = useRef<RealtimeChannel | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const roomRef = useRef<string | null>(null);
  const userRef = useRef<string | null>(null);

  // Best-effort cleanup when the tab is closed, so the room does not stay
  // registered (and its data does not pile up) after everyone leaves.
  useEffect(() => {
    const onUnload = () => {
      const roomId = roomRef.current;
      const uid = userRef.current;
      if (!roomId || !uid) return;
      void clientRef.current?.leave();
      void supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        void fetch(
          `${SUPABASE_URL}/rest/v1/room_members?room_id=eq.${roomId}&user_id=eq.${uid}`,
          {
            method: "DELETE",
            keepalive: true,
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
          },
        );
      });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    const norm = (code ?? "").trim().toUpperCase();
    if (!norm) {
      navigate("/home", { replace: true });
      return;
    }

    let cancelled = false;
    const dispose = () => {
      cancelled = true;
      void clientRef.current?.leave();
      clientRef.current = null;
      void chatChannelRef.current?.unsubscribe();
      chatChannelRef.current = null;
    };

    void (async () => {
      const { data: roomRow } = await supabase.rpc("get_room_by_code", {
        code_input: norm,
      });
      if (cancelled) return;
      if (!roomRow) {
        setNotFound(true);
        return;
      }
      setRoom(roomRow);
      roomRef.current = roomRow.id;
      userRef.current = user.id;

      // Auto-join: add this user to the room membership (idempotent).
      const { data: member } = await supabase
        .from("room_members")
        .select("id")
        .eq("room_id", roomRow.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) {
        await supabase
          .from("room_members")
          .insert({ room_id: roomRow.id, user_id: user.id });
      }

      // Chat history + live inserts.
      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomRow.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setMessages((msgs ?? []).map((m) => toChatMessage(m as unknown as MessageRow)));

      const chatChannel = supabase
        .channel(`chat:${roomRow.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `room_id=eq.${roomRow.id}`,
          },
          (payload) => {
            setMessages((prev) => [
              ...prev,
              toChatMessage(payload.new as unknown as MessageRow),
            ]);
          },
        )
        .subscribe();
      chatChannelRef.current = chatChannel;

      const client = new RoomClient(
        {
          roomId: roomRow.id,
          roomCode: roomRow.code,
          userId: user.id,
          displayName,
          avatarUrl,
        },
        (state) => setClientState(state),
      );
      clientRef.current = client;
      await client.join();
      if (!cancelled) setReady(true);
    })();

    return dispose;
  }, [authLoading, user, code, navigate, displayName, avatarUrl]);

  const sendMessage = async (content: string) => {
    if (!room || !user) return;
    await supabase.from("messages").insert({
      room_id: room.id,
      user_id: user.id,
      display_name: displayName,
      content,
    });
  };

  const copyInvite = async () => {
    if (!room) return;
    const link = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    toast.success(t("common.copied"));
    window.setTimeout(() => setCopied(false), 2000);
  };

  const toggleScreen = async () => {
    if (!clientRef.current) return;
    if (clientRef.current.getScreenOn()) {
      clientRef.current.stopScreen();
    } else {
      const ok = await clientRef.current.startScreen();
      if (!ok) toast.error(t("room.shareError"));
    }
  };

  const confirmLeave = async () => {
    if (!room || !user) return;
    setLeaving(true);
    await clientRef.current?.leave();
    await supabase
      .from("room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", user.id);
    setLeaving(false);
    navigate("/home", { replace: true });
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-app">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const total = clientState ? clientState.peers.length + 1 : 1;
  const self = clientState?.self;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/40 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/home")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card/70 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Home"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <span className="truncate font-semibold">{room?.name ?? t("common.loading")}</span>
            </div>
            <button
              type="button"
              onClick={copyInvite}
              className="group mt-0.5 flex items-center gap-1.5 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:text-primary"
            >
              {room?.code ?? "••••••"}
              <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
            <Users className="h-4 w-4" />
            {t(total === 1 ? "room.participantsOne" : "room.participantsOther", {
              count: total,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={copyInvite}
            className="hidden sm:inline-flex"
          >
            {copied ? <Check /> : <Copy />}
            {copied ? t("common.copied") : t("room.invite")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/profile")}
            aria-label={t("common.profile")}
          >
            <UserRound />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("room.chat")}
          >
            <MessageSquare />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Main stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          {notFound ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="font-semibold">{t("room.notFound")}</p>
              <Button onClick={() => navigate("/home")} variant="outline">
                {t("notFound.actions.backHome")}
              </Button>
            </div>
          ) : !ready || !clientState ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm">{t("room.connecting")}</span>
            </div>
          ) : (
            <>
              {clientState.micDenied && (
                <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t("room.micDenied")}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <VideoGrid self={clientState.self} peers={clientState.peers} />
              </div>
              <ControlBar
                micOn={clientState.self.micOn}
                screenOn={clientState.self.screenOn}
                onToggleMic={() => clientRef.current?.toggleMic()}
                onToggleScreen={toggleScreen}
                onLeave={() => setLeaveOpen(true)}
              />
            </>
          )}
        </main>

        {/* Desktop sidebar */}
        <aside className="hidden w-80 shrink-0 border-l border-border/70 lg:block">
          <Tabs defaultValue="members" className="flex h-full flex-col">
            <TabsList className="mx-4 mt-4 grid grid-cols-2">
              <TabsTrigger value="members">{t("room.members")}</TabsTrigger>
              <TabsTrigger value="chat">{t("room.chat")}</TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="mt-0 min-h-0 flex-1">
              {self && (
                <ParticipantList self={self} peers={clientState?.peers ?? []} />
              )}
            </TabsContent>
            <TabsContent value="chat" className="mt-0 min-h-0 flex-1">
              <ChatPanel
                messages={messages}
                currentUserId={user?.id ?? ""}
                onSend={sendMessage}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Mobile panel */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full p-0 pt-12 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("room.chat")}</SheetTitle>
          </SheetHeader>
          {self && (
            <Tabs defaultValue="chat" className="flex h-full flex-col">
              <TabsList className="mx-4 mt-4 grid grid-cols-2">
                <TabsTrigger value="members">{t("room.members")}</TabsTrigger>
                <TabsTrigger value="chat">{t("room.chat")}</TabsTrigger>
              </TabsList>
              <TabsContent value="members" className="mt-0 min-h-0 flex-1">
                <ParticipantList self={self} peers={clientState?.peers ?? []} />
              </TabsContent>
              <TabsContent value="chat" className="mt-0 min-h-0 flex-1">
                <ChatPanel
                  messages={messages}
                  currentUserId={user?.id ?? ""}
                  onSend={sendMessage}
                />
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Leave confirmation */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("room.leaveConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("room.leaveConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>{t("common.close")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLeave}
              disabled={leaving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {leaving ? t("common.loading") : t("room.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
