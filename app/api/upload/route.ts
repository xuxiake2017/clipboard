import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import COS from "cos-nodejs-sdk-v5";

export const runtime = "nodejs";

const uploadRoot = join(process.cwd(), "public", "uploads");

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
  try {
    const form = await req.formData();
    const file = form.get("file");
    const code = String(form.get("code") || "default").replace(/[^\w-]/g, "_").slice(0, 64);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "没有收到文件" }, { status: 400 });
    }

    const key = `clipboards/${code}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extFromName(file.name)}`;
    const cosResult = await uploadToCos(file, key);

    if (cosResult) {
      return NextResponse.json({
        url: cosResult.url,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: "tencent-cos"
      });
    }

    await mkdir(uploadRoot, { recursive: true });
    const localName = `${randomUUID()}${extFromName(file.name)}`;
    const localPath = join(uploadRoot, localName);
    await writeFile(localPath, Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      url: `/uploads/${localName}`,
      name: file.name,
      size: file.size,
      type: file.type,
      storage: "local-dev"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    );
  }
}
