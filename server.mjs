import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  getOrCreateClipboard,
  getParticipantById,
  insertMessage,
  listMessages
} from "./server/db.mjs";

const dev = process.env.NODE_ENV !== "production" && process.env.npm_lifecycle_event !== "start";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 25 * 1024 * 1024
});

const presence = new Map();

function roomName(code) {
  return `clipboard:${code}`;
}

function broadcastPresence(code) {
  const people = Array.from(presence.values())
    .filter((item) => item.code === code)
    .map(({ participant }) => participant);
  io.to(roomName(code)).emit("presence", people);
}

io.on("connection", (socket) => {
  socket.on("join", ({ code, participantId }, ack) => {
    try {
      const clipboard = getOrCreateClipboard(code);
      const participant = getParticipantById(Number(participantId));

      if (!participant || participant.clipboard_id !== clipboard.id) {
        throw new Error("身份信息不匹配，请重新进入剪贴板");
      }

      socket.join(roomName(clipboard.code));
      presence.set(socket.id, {
        code: clipboard.code,
        participant: {
          id: participant.id,
          nickname: participant.nickname,
          avatarDataUri: participant.avatar_data_uri
        }
      });

      ack?.({ ok: true, messages: listMessages(clipboard.id) });
      broadcastPresence(clipboard.code);
    } catch (error) {
      ack?.({ ok: false, error: error.message || "加入失败" });
    }
  });

  socket.on("message:create", (payload, ack) => {
    try {
      const clipboard = getOrCreateClipboard(payload.code);
      const participant = getParticipantById(Number(payload.participantId));

      if (!participant || participant.clipboard_id !== clipboard.id) {
        throw new Error("身份信息不匹配");
      }

      const message = insertMessage({
        clipboardId: clipboard.id,
        participantId: participant.id,
        type: payload.type,
        content: payload.content,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType
      });

      io.to(roomName(clipboard.code)).emit("message:created", message);
      ack?.({ ok: true, message });
    } catch (error) {
      ack?.({ ok: false, error: error.message || "发送失败" });
    }
  });

  socket.on("disconnect", () => {
    const item = presence.get(socket.id);
    presence.delete(socket.id);
    if (item) broadcastPresence(item.code);
  });
});

httpServer.listen(port, hostname, () => {
  console.log(`> Ready on http://localhost:${port}`);
});
