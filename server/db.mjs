import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, "data");
const dbPath = process.env.SQLITE_PATH || join(dataDir, "clipboard.sqlite");

let db;

export function getDb() {
  if (db) return db;

  mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS clipboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      password_salt TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clipboard_id INTEGER NOT NULL,
      browser_key TEXT NOT NULL,
      os_name TEXT NOT NULL,
      ip TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar_seed TEXT NOT NULL,
      avatar_style TEXT NOT NULL,
      avatar_data_uri TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(clipboard_id, browser_key),
      FOREIGN KEY(clipboard_id) REFERENCES clipboards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clipboard_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'image', 'file')),
      content TEXT,
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(clipboard_id) REFERENCES clipboards(id) ON DELETE CASCADE,
      FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );
  `);

  const clipboardColumns = db.prepare("PRAGMA table_info('clipboards')").all().map((column) => column.name);
  if (!clipboardColumns.includes("password_salt")) {
    db.exec("ALTER TABLE clipboards ADD COLUMN password_salt TEXT");
  }
  if (!clipboardColumns.includes("password_hash")) {
    db.exec("ALTER TABLE clipboards ADD COLUMN password_hash TEXT");
  }

  return db;
}

export function normalizeCode(code) {
  return String(code || "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
}

export function getClipboardByCode(code) {
  const db = getDb();
  const normalized = normalizeCode(code);
  if (!normalized) throw new Error("识别码不能为空");

  return db.prepare("SELECT * FROM clipboards WHERE code = ?").get(normalized);
}

export function createClipboard(input) {
  const db = getDb();
  const normalized = normalizeCode(input.code);
  if (!normalized) throw new Error("识别码不能为空");

  const result = db
    .prepare("INSERT INTO clipboards (code, password_salt, password_hash) VALUES (?, ?, ?)")
    .run(normalized, input.passwordSalt, input.passwordHash);
  return db.prepare("SELECT * FROM clipboards WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function setClipboardPassword(id, input) {
  const db = getDb();
  db.prepare(
    `UPDATE clipboards
     SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(input.passwordSalt, input.passwordHash, id);
  return db.prepare("SELECT * FROM clipboards WHERE id = ?").get(id);
}

export function touchClipboard(id) {
  const db = getDb();
  db.prepare("UPDATE clipboards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return db.prepare("SELECT * FROM clipboards WHERE id = ?").get(id);
}

export function getOrCreateClipboard(code) {
  const row = getClipboardByCode(code);
  if (!row) {
    return createClipboard({ code, passwordSalt: null, passwordHash: null });
  }
  touchClipboard(row.id);
  return row;
}

export function getParticipant(clipboardId, browserKey) {
  return getDb()
    .prepare("SELECT * FROM participants WHERE clipboard_id = ? AND browser_key = ?")
    .get(clipboardId, browserKey);
}

export function updateParticipantSeen(id, input) {
  const db = getDb();
  db.prepare(
    `UPDATE participants
     SET os_name = ?, ip = ?, nickname = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(input.osName, input.ip, input.nickname, id);

  return db.prepare("SELECT * FROM participants WHERE id = ?").get(id);
}

export function createParticipant(input) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO participants
       (clipboard_id, browser_key, os_name, ip, nickname, avatar_seed, avatar_style, avatar_data_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.clipboardId,
      input.browserKey,
      input.osName,
      input.ip,
      input.nickname,
      input.avatarSeed,
      input.avatarStyle,
      input.avatarDataUri
    );

  return db.prepare("SELECT * FROM participants WHERE id = ?").get(Number(result.lastInsertRowid));
}

export function getParticipantById(id) {
  return getDb().prepare("SELECT * FROM participants WHERE id = ?").get(id);
}

export function listMessages(clipboardId) {
  return getDb()
    .prepare(
      `SELECT
         messages.*,
         participants.nickname,
         participants.avatar_data_uri,
         participants.os_name,
         participants.ip
       FROM messages
       JOIN participants ON participants.id = messages.participant_id
       WHERE messages.clipboard_id = ?
       ORDER BY messages.id ASC
       LIMIT 300`
    )
    .all(clipboardId);
}

export function insertMessage(input) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO messages
       (clipboard_id, participant_id, type, content, file_url, file_name, file_size, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.clipboardId,
      input.participantId,
      input.type,
      input.content || null,
      input.fileUrl || null,
      input.fileName || null,
      input.fileSize || null,
      input.mimeType || null
    );

  return getDb()
    .prepare(
      `SELECT
         messages.*,
         participants.nickname,
         participants.avatar_data_uri,
         participants.os_name,
         participants.ip
       FROM messages
       JOIN participants ON participants.id = messages.participant_id
       WHERE messages.id = ?`
    )
    .get(Number(result.lastInsertRowid));
}

export function getMessageById(id) {
  return getDb().prepare("SELECT * FROM messages WHERE id = ?").get(id);
}
