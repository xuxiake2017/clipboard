/** @type {import('next').NextConfig} */
const nextConfig = {
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
