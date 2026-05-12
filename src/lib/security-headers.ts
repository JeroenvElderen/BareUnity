const supabaseHosts = ["https://*.supabase.co", "wss://*.supabase.co"];

export function buildContentSecurityPolicy(scriptNonce?: string) {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const scriptSources = [
    "script-src",
    "'self'",
    ...(scriptNonce ? [`'nonce-${scriptNonce}'`, "'strict-dynamic'"] : []),
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];

  const styleSources = scriptNonce
    ? [
        "style-src 'self'",
        `style-src-elem 'self' 'nonce-${scriptNonce}'`,
        "style-src-attr 'none'",
      ]
    : ["style-src 'self'"];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://picsum.photos https://images.unsplash.com https://*.supabase.co",
    `connect-src 'self' ${supabaseHosts.join(" ")}`,
    "font-src 'self' data:",
    "media-src 'self' blob: https://*.supabase.co",
    scriptSources.join(" "),
    "script-src-attr 'none'",
    ...styleSources,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
