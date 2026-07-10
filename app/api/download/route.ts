import { NextRequest, NextResponse } from "next/server";
import { getMessageById } from "@/server/db.mjs";

export const runtime = "nodejs";

function contentDisposition(filename: string) {
  const safeName = filename.replace(/[\r\n"]/g, "_") || "download";
  const encoded = encodeURIComponent(safeName).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "下载参数无效" }, { status: 400 });
  }

  const message = getMessageById(id);
  if (!message?.file_url) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  try {
    const sourceUrl = new URL(message.file_url, req.nextUrl.origin);
    const upstream = await fetch(sourceUrl);

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "文件读取失败" }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": message.mime_type || upstream.headers.get("content-type") || "application/octet-stream",
        "Content-Length": upstream.headers.get("content-length") || String(message.file_size || ""),
        "Content-Disposition": contentDisposition(message.file_name || "download"),
        "Cache-Control": "private, max-age=0, must-revalidate"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "下载失败" },
      { status: 500 }
    );
  }
}
