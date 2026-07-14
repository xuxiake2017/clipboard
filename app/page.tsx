"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Clipboard,
  Copy,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Lock,
  Paperclip,
  Send,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publicPath, stripPublicPath, withPublicPath } from "@/lib/public-path";
import { formatBytes } from "@/lib/utils";

type Participant = {
  id: number;
  nickname: string;
  avatarDataUri: string;
};

type Message = {
  id: number;
  type: "text" | "image" | "file";
  content?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
  participant_id: number;
  nickname: string;
  avatar_data_uri: string;
};

function getOsName() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const source = `${platform} ${userAgent}`;

  if (/android/i.test(source)) return "Android";
  if (/iphone|ipad|ipod|ios/i.test(source)) return "iOS";
  if (/win/i.test(source)) return "Windows";
  if (/mac/i.test(source)) return "macOS";
  if (/linux/i.test(source)) return "Linux";
  return "Unknown OS";
}

function getBrowserKey() {
  const key = "online-clipboard-browser-key";
  let id = localStorage.getItem(key);
  if (!id) {
    id = createBrowserId();
    localStorage.setItem(key, id);
  }
  return id;
}

function createBrowserId() {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) return randomUUID();

  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some(Boolean)) {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(`${value.replace(" ", "T")}Z`));
}

function getDownloadHref(message: Message) {
  if (!message.file_url) return "#";
  if (/^https?:\/\//i.test(message.file_url)) return message.file_url;
  return withPublicPath(`/api/download?id=${message.id}`);
}

function getFileSrc(url?: string | null) {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith("data:")) return url || "";
  return withPublicPath(url);
}

function getCodeFromPath() {
  const segment = stripPublicPath(window.location.pathname).split("/").filter(Boolean)[0];
  return segment ? decodeURIComponent(segment) : "";
}

function updateCodePath(code: string) {
  const nextPath = `${publicPath}/${encodeURIComponent(code)}`;
  if (window.location.pathname !== nextPath) {
    window.history.pushState(null, "", nextPath);
  }
}

export default function Home() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [activeCode, setActiveCode] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Participant[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clipboardPanelRef = useRef<HTMLDivElement | null>(null);

  const canSend = text.trim().length > 0 && participant && activeCode;

  const addMessage = useCallback((message: Message) => {
    setMessages((items) => (items.some((item) => item.id === message.id) ? items : [...items, message]));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!activeCode || !window.matchMedia("(max-width: 1023px)").matches) return;
    window.setTimeout(() => {
      clipboardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 80);
  }, [activeCode]);

  const joinClipboard = useCallback(
    async (nextCode?: string, syncPath = true) => {
      const targetCode = (nextCode || code).trim();
      if (!targetCode) {
        setError("请输入识别码");
        return;
      }
      if (!password) {
        setError("请输入剪贴板密码");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await fetch(withPublicPath("/api/clipboards"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: targetCode,
            password,
            osName: getOsName(),
            browserKey: getBrowserKey()
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "进入失败");

        setActiveCode(data.clipboard.code);
        setCode(data.clipboard.code);
        setParticipant(data.participant);
        if (syncPath) updateCodePath(data.clipboard.code);

        socketRef.current?.disconnect();
        const socket = io({ path: withPublicPath("/socket.io") });
        socketRef.current = socket;

        const joinRealtimeRoom = () => {
          socket.emit(
            "join",
            { code: data.clipboard.code, participantId: data.participant.id },
            (ack: { ok: boolean; messages?: Message[]; error?: string }) => {
              if (!ack.ok) {
                setError(ack.error || "实时连接失败");
                return;
              }
              setMessages(ack.messages || []);
            }
          );
        };

        socket.on("connect", joinRealtimeRoom);
        socket.on("message:created", addMessage);
        socket.on("presence", (items: Participant[]) => setPeople(items));
        if (socket.connected) joinRealtimeRoom();
      } catch (err) {
        setError(err instanceof Error ? err.message : "进入失败");
      } finally {
        setLoading(false);
      }
    },
    [addMessage, code, password]
  );

  useEffect(() => {
    const pathCode = getCodeFromPath();
    if (pathCode) {
      setCode(pathCode);
    }
  }, []);

  const sendMessage = useCallback(
    (payload: Partial<Message> & { type: "text" | "image" | "file" }) => {
      if (!participant || !activeCode || !socketRef.current) return;
      socketRef.current.emit("message:create", {
        code: activeCode,
        participantId: participant.id,
        type: payload.type,
        content: payload.content,
        fileUrl: payload.file_url,
        fileName: payload.file_name,
        fileSize: payload.file_size,
        mimeType: payload.mime_type
      }, (ack: { ok: boolean; message?: Message; error?: string }) => {
        if (!ack.ok) {
          setError(ack.error || "发送失败");
          return;
        }
        if (ack.message) addMessage(ack.message);
      });
    },
    [activeCode, addMessage, participant]
  );

  const sendText = useCallback(() => {
    const content = text.trim();
    if (!content) return;
    sendMessage({ type: "text", content });
    setText("");
  }, [sendMessage, text]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length || !activeCode) return;
      setUploading(true);
      setError("");

      try {
        for (const file of list) {
          const form = new FormData();
          form.append("file", file);
          form.append("code", activeCode);
          const res = await fetch(withPublicPath("/api/upload"), { method: "POST", body: form });
          const contentType = res.headers.get("content-type") || "";
          const data = contentType.includes("application/json") ? await res.json() : null;
          if (!res.ok) {
            const requestId = data?.requestId ? `（请求 ID：${data.requestId}）` : "";
            throw new Error(data?.error ? `${data.error}${requestId}` : `${file.name} 上传失败：HTTP ${res.status}`);
          }

          const isImage = (data.type || file.type || "").startsWith("image/");
          sendMessage({
            type: isImage ? "image" : "file",
            file_url: data.url,
            file_name: data.name,
            file_size: data.size,
            mime_type: data.type
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [activeCode, sendMessage]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!activeCode || !event.clipboardData?.files.length) return;
      event.preventDefault();
      uploadFiles(event.clipboardData.files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [activeCode, uploadFiles]);

  useEffect(
    () => () => {
      socketRef.current?.disconnect();
    },
    []
  );

  const featureItems = useMemo(
    () => [
      { title: "多端同步", text: "电脑、手机打开同一识别码即可共享剪贴板。" },
      { title: "实时协作", text: "文字、图片和文件消息会即时推送给在线成员。" },
      { title: "密码保护", text: "首次进入会绑定密码，之后访问同一识别码需要校验。" }
    ],
    []
  );

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-10">
      <section className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-sm text-muted-foreground shadow-sm backdrop-blur">
            <Clipboard className="h-4 w-4 text-primary" />
            在线剪贴板
          </div>
          <div className="space-y-5">
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
              把一段文字、一张图、一个文件，快速交给另一台设备。
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              输入同一个识别码即可创建或进入剪贴板。多人同时在线时，消息会实时同步，支持拖拽、选择文件和 Ctrl+V 粘贴上传。
            </p>
          </div>

          <form
            className="grid max-w-xl gap-3 rounded-lg border bg-white/78 p-3 shadow-sm backdrop-blur sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              joinClipboard();
            }}
          >
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="输入识别码，例如 team-notes"
              className="h-12 flex-1 border-transparent bg-white text-base"
              autoComplete="off"
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入剪贴板密码"
              className="h-12 border-transparent bg-white text-base"
              autoComplete="current-password"
            />
            <Button type="submit" className="h-12 gap-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              进入
            </Button>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            {featureItems.map((item) => (
              <div key={item.title} className="rounded-lg border bg-white/64 p-4 shadow-sm backdrop-blur">
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          ref={clipboardPanelRef}
          className="relative mx-auto flex h-[min(760px,calc(100vh-3rem))] w-full max-w-[620px] flex-col overflow-hidden rounded-lg border bg-white shadow-2xl"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            uploadFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex items-center justify-between border-b bg-card px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold">
                  {activeCode ? `剪贴板 ${activeCode}` : "剪贴板预览"}
                </h2>
                {activeCode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigator.clipboard.writeText(activeCode)}
                    title="复制识别码"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {activeCode ? `${people.length || 1} 人在线` : "输入识别码后开始同步"}
              </p>
            </div>
            {activeCode && participant && (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground sm:block">
                  {participant.nickname}
                </span>
                <img
                  src={participant.avatarDataUri}
                  alt={participant.nickname}
                  className="h-10 w-10 rounded-full border bg-muted"
                />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-slate-50/80 p-4">
            {!activeCode && (
              <div className="flex h-full items-center justify-center text-center text-sm leading-6 text-muted-foreground">
                这里会以对话框形式展示剪贴板内容。
                <br />
                进入后可以发送文字、拖拽文件，或直接 Ctrl+V 粘贴图片。
              </div>
            )}

            {messages.map((message) => {
              const mine = message.participant_id === participant?.id;
              return (
                <div key={message.id} className={`flex min-w-0 gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                  <img
                    src={message.avatar_data_uri}
                    alt={message.nickname}
                    className="h-9 w-9 shrink-0 rounded-full border bg-white"
                  />
                  <div className={`min-w-0 max-w-[78%] space-y-1 ${mine ? "items-end text-right" : ""}`}>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 max-w-[180px] truncate">{message.nickname}</span>
                      <span>{formatTime(message.created_at)}</span>
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-lg border bg-white p-3 text-left shadow-sm">
                      {message.type === "text" && (
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">
                          {message.content}
                        </p>
                      )}
                      {message.type === "image" && message.file_url && (
                        <a href={getDownloadHref(message)} className="block" download={message.file_name || true}>
                          <img
                            src={getFileSrc(message.file_url)}
                            alt={message.file_name || "图片"}
                            className="max-h-72 max-w-full rounded-md object-contain"
                          />
                          <span className="mt-2 block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {message.file_name}
                          </span>
                        </a>
                      )}
                      {message.type === "file" && message.file_url && (
                        <a
                          href={getDownloadHref(message)}
                          download={message.file_name || true}
                          className="flex min-w-0 items-center gap-3 text-sm"
                        >
                          <FileIcon className="h-8 w-8 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block break-words font-medium [overflow-wrap:anywhere]">
                              {message.file_name}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatBytes(message.file_size)}</span>
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>

          <div className="border-t bg-white p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{activeCode ? "支持拖拽文件到窗口或 Ctrl+V 粘贴图片/文件" : "先输入识别码进入剪贴板"}</span>
              {uploading && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  上传中
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                value={text}
                disabled={!activeCode}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendText();
                }}
                placeholder="输入文字，Ctrl/Command + Enter 发送"
                className="min-h-20 flex-1 resize-none"
              />
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    if (event.target.files) uploadFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!activeCode || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="选择文件"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  disabled={!canSend}
                  onClick={sendText}
                  title="发送"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {uploading && (
            <div className="pointer-events-none absolute inset-x-0 top-[57px] flex justify-center">
              <div className="mt-3 flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs shadow-sm">
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
                正在处理附件
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
