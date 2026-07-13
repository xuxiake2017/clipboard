export const publicPath = normalizePublicPath(process.env.NEXT_PUBLIC_PUBLIC_PATH || "");

export function normalizePublicPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function withPublicPath(path: string) {
  if (!publicPath) return path;
  return `${publicPath}${path.startsWith("/") ? path : `/${path}`}`;
}

export function stripPublicPath(pathname: string) {
  if (!publicPath) return pathname;
  if (pathname === publicPath) return "/";
  if (pathname.startsWith(`${publicPath}/`)) {
    return pathname.slice(publicPath.length) || "/";
  }
  return pathname;
}
