const supabaseHosts = ["https://*.supabase.co", "wss://*.supabase.co"];
const mapScriptHosts = ["https://unpkg.com"];
const mapAssetHosts = [...mapScriptHosts, "https://tile.openstreetmap.org"];
const mapLookupHosts = ["https://nominatim.openstreetmap.org"];

export function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const scriptSources = [
    "script-src",
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ...mapScriptHosts,
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com https://*.supabase.co https://tile.openstreetmap.org",
    `connect-src 'self' ${[...supabaseHosts, ...mapAssetHosts, ...mapLookupHosts].join(" ")}`,
    "font-src 'self' data:",
    "media-src 'self' blob: https://*.supabase.co",
    scriptSources.join(" "),
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}' https://unpkg.com`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
