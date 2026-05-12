import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "./lib/security-headers";

const ALLOWED_API_ORIGINS = new Set([
  "https://www.bareunity.com",
  "https://bareunity.com",
]);
const DEFAULT_CORS_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_CORS_HEADERS = "Authorization, Content-Type, X-Requested-With";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const STRICT_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const STRICT_RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildNonceHeaders(req: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);

  // Next.js reads this request header to nonce framework-managed scripts/styles.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  return { contentSecurityPolicy, requestHeaders };
}

function applySecurityHeaders(res: NextResponse, contentSecurityPolicy: string) {
  res.headers.set("Content-Security-Policy", contentSecurityPolicy);
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("Origin-Agent-Cluster", "?1");
  res.headers.set("X-DNS-Prefetch-Control", "off");

  return res;
}

function isMutatingApiRequest(req: NextRequest) {
  return (
    req.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  );
}

function getRateLimitPolicy(req: NextRequest) {
  if (
    req.nextUrl.pathname === "/api/auth/register" ||
    req.nextUrl.pathname === "/api/verification/apply"
  ) {
    return {
      windowMs: STRICT_RATE_LIMIT_WINDOW_MS,
      maxRequests: STRICT_RATE_LIMIT_MAX_REQUESTS,
    };
  }

  return {
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
  };
}

function getClientIdentifier(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function pruneExpiredRateLimits(now: number) {
  if (rateLimitBuckets.size < 10_000) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function consumeRateLimit(req: NextRequest) {
  const now = Date.now();
  pruneExpiredRateLimits(now);
  const policy = getRateLimitPolicy(req);
  const key = `${getClientIdentifier(req)}:${req.method}:${req.nextUrl.pathname}`;
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  current.count += 1;

  if (current.count > policy.maxRequests) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

function buildRateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": retryAfterSeconds.toString(),
        "Cache-Control": "no-store",
      },
    },
  );
}

function getRequestHost(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host
  );
}

function getRequestHostname(req: NextRequest) {
  return getRequestHost(req).split(":")[0].toLowerCase();
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function isAllowedApiOrigin(origin: string | null) {
  if (!origin) {
    return true;
  }

  return ALLOWED_API_ORIGINS.has(origin);
}

function applyApiCorsHeaders(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");

  if (!origin || !isAllowedApiOrigin(origin)) {
    return res;
  }

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", DEFAULT_CORS_METHODS);
  res.headers.set(
    "Access-Control-Allow-Headers",
    req.headers.get("access-control-request-headers") ?? DEFAULT_CORS_HEADERS,
  );
  res.headers.set("Access-Control-Max-Age", "600");
  res.headers.append("Vary", "Origin");

  return res;
}

function shouldRedirectToHttps(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const hostname = getRequestHostname(req);

  if (isLocalHostname(hostname)) {
    return false;
  }

  const forwardedProto = req.headers.get("x-forwarded-proto");

  return req.nextUrl.protocol === "http:" || forwardedProto === "http";
}

function buildHttpsUrl(req: NextRequest) {
  const secureUrl = req.nextUrl.clone();
  secureUrl.protocol = "https:";
  secureUrl.host = getRequestHost(req);
  return secureUrl;
}

export function middleware(req: NextRequest) {
  const { contentSecurityPolicy, requestHeaders } = buildNonceHeaders(req);

  if (shouldRedirectToHttps(req)) {
    return applySecurityHeaders(
      NextResponse.redirect(buildHttpsUrl(req), 308),
      contentSecurityPolicy,
    );
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");

    if (!isAllowedApiOrigin(origin)) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Cross-origin request blocked." },
          { status: 403 },
        ),
        contentSecurityPolicy,
      );
    }

    if (req.method === "OPTIONS") {
      return applySecurityHeaders(
        applyApiCorsHeaders(req, new NextResponse(null, { status: 204 })),
        contentSecurityPolicy,
      );
    }

    if (isMutatingApiRequest(req)) {
      const rateLimit = consumeRateLimit(req);

      if (rateLimit.limited) {
        return applySecurityHeaders(
          applyApiCorsHeaders(
            req,
            buildRateLimitResponse(rateLimit.retryAfterSeconds),
          ),
          contentSecurityPolicy,
        );
      }
    }
  }

  // Supabase auth in this app is currently client-side (localStorage session),
  // so middleware cannot reliably read auth state from cookies.
  // Enforcing redirects here causes successful login attempts to bounce back
  // to /login and look like a page refresh loop.
  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (req.nextUrl.pathname.startsWith("/api/")) {
    res.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(
      applyApiCorsHeaders(req, res),
      contentSecurityPolicy,
    );
  }

  return applySecurityHeaders(res, contentSecurityPolicy);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
