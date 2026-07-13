function normalizePublicPath(value) {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

const publicPath = normalizePublicPath(process.env.NEXT_PUBLIC_PUBLIC_PATH || process.env.PUBLIC_PATH);

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(publicPath ? { basePath: publicPath } : {}),
  allowedDevOrigins: [
    "192.168.137.1",
    ...(process.env.NEXT_ALLOWED_DEV_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  ],
  serverExternalPackages: ["cos-nodejs-sdk-v5"]
};

export default nextConfig;
