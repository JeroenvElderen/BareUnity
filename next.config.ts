import type { NextConfig } from "next";

const HSTS_HEADER = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

const NOSNIFF_HEADER = {
  key: "X-Content-Type-Options",
  value: "nosniff",
};

const REFERRER_POLICY_HEADER = {
  key: "Referrer-Policy",
  value: "strict-origin-when-cross-origin",
};

const FRAME_OPTIONS_HEADER = {
  key: "X-Frame-Options",
  value: "DENY",
};

const PERMITTED_CROSS_DOMAIN_POLICIES_HEADER = {
  key: "X-Permitted-Cross-Domain-Policies",
  value: "none",
};

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.7"],
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          HSTS_HEADER,
          NOSNIFF_HEADER,
          REFERRER_POLICY_HEADER,
          FRAME_OPTIONS_HEADER,
          PERMITTED_CROSS_DOMAIN_POLICIES_HEADER,
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          HSTS_HEADER,
          NOSNIFF_HEADER,
          PERMITTED_CROSS_DOMAIN_POLICIES_HEADER,
        ],
      },
      {
        source: "/_next/image",
        headers: [HSTS_HEADER, NOSNIFF_HEADER],
      },
      {
        source: "/favicon.ico",
        headers: [
          HSTS_HEADER,
          NOSNIFF_HEADER,
          PERMITTED_CROSS_DOMAIN_POLICIES_HEADER,
        ],
      },
      {
        source: "/robots.txt",
        headers: [HSTS_HEADER, NOSNIFF_HEADER],
      },
      {
        source: "/sitemap.xml",
        headers: [HSTS_HEADER, NOSNIFF_HEADER],
      },
    ];
  },

  experimental: {
    proxyClientMaxBodySize: "16mb",
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
