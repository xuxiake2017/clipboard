import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import COS from "cos-nodejs-sdk-v5";

export const runtime = "nodejs";

const uploadRoot = join(process.cwd(), "public", "uploads");

function logUpload(level: "info" | "error", event: string, data: Record<string, unknown>) {
  const payload = {
    event,
    ...data
  };
  const line = `[upload] ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  const extra = error as Error & {
    code?: string;
    statusCode?: number;
    headers?: Record<string, string>;
    requestId?: string;
  };
  return {
    name: error.name,
    message: error.message,
    code: extra.code,
    statusCode: extra.statusCode,
    requestId: extra.requestId,
    cosRequestId: extra.headers?.["x-cos-request-id"]
  };
}

function extFromName(name: string) {
  const ext = name.split(".").pop();
  return ext && ext !== name ? `.${ext}` : "";
}

function contentDisposition(filename: string) {
  const safeName = filename.replace(/[\r\n"]/g, "_") || "download";
  const encoded = encodeURIComponent(safeName).replace(/['()]/g, escape).replace(/\*/g, "%2A");
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`;
}

async function uploadToCos(file: File, key: string) {
  const required = [
    "TENCENT_SECRET_ID",
    "TENCENT_SECRET_KEY",
    "TENCENT_COS_BUCKET",
    "TENCENT_COS_REGION"
  ];
  const ready = required.every((name) => Boolean(process.env[name]));
  if (!ready) return null;

  const cos = new COS({
    SecretId: process.env.TENCENT_SECRET_ID,
    SecretKey: process.env.TENCENT_SECRET_KEY
  });
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await cos.putObject({
    Bucket: process.env.TENCENT_COS_BUCKET!,
    Region: process.env.TENCENT_COS_REGION!,
    Key: key,
    Body: buffer,
    ContentType: file.type || undefined,
    ContentDisposition: contentDisposition(file.name)
  });

  const origin =
    process.env.TENCENT_COS_PUBLIC_URL ||
    `https://${process.env.TENCENT_COS_BUCKET}.cos.${process.env.TENCENT_COS_REGION}.myqcloud.com`;

  return {
    url: `${origin.replace(/\/$/, "")}/${key}`,
    etag: result.ETag
  };
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let fileInfo: Record<string, unknown> = {};

  try {
    const form = await req.formData();
    const file = form.get("file");
    const code = String(form.get("code") || "default").replace(/[^\w-]/g, "_").slice(0, 64);

    if (!(file instanceof File)) {
      logUpload("error", "missing_file", { requestId, code });
      return NextResponse.json({ error: "没有收到文件", requestId }, { status: 400 });
    }

    fileInfo = {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream"
    };
    logUpload("info", "started", {
      requestId,
      code,
      ...fileInfo,
      cosConfigured: Boolean(
        process.env.TENCENT_SECRET_ID &&
          process.env.TENCENT_SECRET_KEY &&
          process.env.TENCENT_COS_BUCKET &&
          process.env.TENCENT_COS_REGION
      )
    });

    const key = `clipboards/${code}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extFromName(file.name)}`;
    const cosResult = await uploadToCos(file, key);

    if (cosResult) {
      logUpload("info", "succeeded", {
        requestId,
        code,
        storage: "tencent-cos",
        key,
        ...fileInfo
      });
      return NextResponse.json({
        url: cosResult.url,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: "tencent-cos",
        requestId
      });
    }

    await mkdir(uploadRoot, { recursive: true });
    const localName = `${randomUUID()}${extFromName(file.name)}`;
    const localPath = join(uploadRoot, localName);
    await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

    logUpload("info", "succeeded", {
      requestId,
      code,
      storage: "local-dev",
      localName,
      ...fileInfo
    });

    return NextResponse.json({
      url: `/uploads/${localName}`,
      name: file.name,
      size: file.size,
      type: file.type,
      storage: "local-dev",
      requestId
    });
  } catch (error) {
    logUpload("error", "failed", {
      requestId,
      ...fileInfo,
      error: serializeError(error)
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败", requestId },
      { status: 500 }
    );
  }
}
