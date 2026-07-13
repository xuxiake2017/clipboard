import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAvatar } from "@dicebear/core";
import { adventurer, bottts, identicon, thumbs } from "@dicebear/collection";
import {
  createClipboard,
  createParticipant,
  getClipboardByCode,
  getParticipant,
  setClipboardPassword,
  touchClipboard,
  updateParticipantSeen
} from "@/server/db.mjs";

export const runtime = "nodejs";

const avatarStyles = [
  { name: "adventurer", style: adventurer },
  { name: "bottts", style: bottts },
  { name: "identicon", style: identicon },
  { name: "thumbs", style: thumbs }
];

function getIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "127.0.0.1";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyHash(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = String(body.password || "");
    if (!password) {
      throw new Error("请输入剪贴板密码");
    }

    let clipboard = getClipboardByCode(body.code);
    if (!clipboard) {
      const passwordSalt = randomBytes(16).toString("hex");
      clipboard = createClipboard({
        code: body.code,
        passwordSalt,
        passwordHash: hashPassword(password, passwordSalt)
      });
    } else if (!clipboard.password_salt || !clipboard.password_hash) {
      const passwordSalt = randomBytes(16).toString("hex");
      clipboard = setClipboardPassword(clipboard.id, {
        passwordSalt,
        passwordHash: hashPassword(password, passwordSalt)
      });
    } else if (!verifyHash(hashPassword(password, clipboard.password_salt), clipboard.password_hash)) {
      throw new Error("剪贴板密码不正确");
    } else {
      clipboard = touchClipboard(clipboard.id);
    }

    const osName = String(body.osName || "Unknown OS").slice(0, 40);
    const browserKey = String(body.browserKey || req.headers.get("user-agent") || "unknown").slice(0, 240);
    const ip = getIp(req);
    const nickname = `${osName} ${ip}`;

    let participant = getParticipant(clipboard.id, browserKey);

    if (!participant) {
      const seed = hash(`${clipboard.code}:${browserKey}`).slice(0, 24);
      const styleIndex = parseInt(seed.slice(0, 2), 16) % avatarStyles.length;
      const avatar = avatarStyles[styleIndex];
      const avatarDataUri = await createAvatar(avatar.style as never, {
        seed,
        size: 96,
        backgroundType: ["solid", "gradientLinear"]
      }).toDataUri();

      participant = createParticipant({
        clipboardId: clipboard.id,
        browserKey,
        osName,
        ip,
        nickname,
        avatarSeed: seed,
        avatarStyle: avatar.name,
        avatarDataUri
      });
    } else if (participant.ip !== ip || participant.os_name !== osName || participant.nickname !== nickname) {
      participant = updateParticipantSeen(participant.id, {
        osName,
        ip,
        nickname
      });
    }

    return NextResponse.json({
      clipboard: {
        id: clipboard.id,
        code: clipboard.code
      },
      participant: {
        id: participant.id,
        nickname: participant.nickname,
        avatarDataUri: participant.avatar_data_uri
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "进入剪贴板失败" },
      { status: 400 }
    );
  }
}
