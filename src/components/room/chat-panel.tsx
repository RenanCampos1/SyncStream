import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Send } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ChatMessage = {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
};

export function ChatPanel({
  messages,
  currentUserId,
  onSend,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (content: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("room.chat")}</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("room.chatEmpty")}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.userId === currentUserId;
          return (
            <div
              key={m.id}
              className={cn("flex gap-2.5", mine && "flex-row-reverse")}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-xs font-bold text-primary-foreground",
                  mine && "from-primary to-accent",
                )}
              >
                {initials(m.displayName)}
              </div>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl rounded-tl-sm bg-muted/70 px-3.5 py-2",
                  mine && "rounded-tr-sm rounded-tl-2xl bg-primary/15",
                )}
              >
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-xs font-semibold">{m.displayName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="break-words text-sm leading-snug">{m.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("room.chatPlaceholder")}
          className="h-10"
        />
        <Button onClick={submit} size="icon" className="h-10 w-10 shrink-0" aria-label={t("room.chatSend")}>
          <Send />
        </Button>
      </div>
    </div>
  );
}
