import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_CORS_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_CORS_HEADERS = "Authorization, Content-Type, X-Requested-With";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const STRICT_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const STRICT_RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

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

function getConfiguredOrigins() {
  return (process.env.APP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrigin(req: NextRequest, origin: string | null) {
  if (!origin) {
    return true;
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  const requestHostname = getRequestHostname(req);
  const originHostname = parsedOrigin.hostname.toLowerCase();

  if (originHostname === requestHostname) {
    return true;
  }

  return getConfiguredOrigins().includes(origin.toLowerCase());
}

function applyCorsHeaders(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");

  if (!origin || !isAllowedOrigin(req, origin)) {
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

export function proxy(req: NextRequest) {
  if (shouldRedirectToHttps(req)) {
    return NextResponse.redirect(buildHttpsUrl(req), 308);
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");

    if (!isAllowedOrigin(req, origin)) {
      return NextResponse.json(
        { error: "Cross-origin request blocked." },
        { status: 403 },
      );
    }

    if (req.method === "OPTIONS") {
      return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
    }

    if (isMutatingApiRequest(req)) {
      const rateLimit = consumeRateLimit(req);

      if (rateLimit.limited) {
        return applyCorsHeaders(
          req,
          buildRateLimitResponse(rateLimit.retryAfterSeconds),
        );
      }
    }
  }

  // Supabase auth in this app is currently client-side (localStorage session),
  // so middleware cannot reliably read auth state from cookies.
  // Enforcing redirects here causes successful login attempts to bounce back
  // to /login and look like a page refresh loop.
  const res = NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    res.headers.set("Cache-Control", "no-store");
  }

  return applyCorsHeaders(req, res);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
