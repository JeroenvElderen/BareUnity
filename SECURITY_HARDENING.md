# Production security hardening checklist

This application enforces a stronger in-app security baseline: strict browser security headers, production HTTPS redirects, centralized admin authorization, authenticated moderation requests, upload size/type/signature checks, and stricter rate limits for sensitive mutation endpoints. The following items must still be verified in the production host, CDN/WAF, Supabase project, DNS/TLS provider, and trust-and-safety operations.

## Required environment secrets

- Set `PLATFORM_ADMIN_EMAILS` to a comma-separated list of authorized admin emails on the server. Production admin APIs return an error when no admin emails are configured.
- Set `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` only if the client UI should show admin navigation before a server round trip. Treat the server-side `PLATFORM_ADMIN_EMAILS` list as authoritative.
- Set `VERIFICATION_DOCUMENT_HASH_PEPPER` to a long random secret so verification-document fingerprints use HMAC-SHA-256. Production registration rejects verified ID uploads when this secret is missing. Rotate through a documented incident process only, because rotation changes future fingerprints.
- Store `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, Hugging Face tokens, and any future payment or analytics credentials as server-only secrets. Never expose service-role credentials to browser code.

## Application controls to keep enabled

- Keep Supabase row-level security enabled and verify policies for every member, report, profile, media, message, notification, and verification table before launch.
- Keep `verification-documents` private and accessible only through short-lived signed URLs generated after admin authorization.
- Keep media and document MIME/signature validation enabled; review new file types with legal/security before adding them.
- Keep CDN or edge rate limiting enabled in production. The app includes per-instance API mutation throttling, but distributed attacks must be stopped before reaching the origin.
- Require MFA on the Supabase account and email account for every user in `PLATFORM_ADMIN_EMAILS`.
- Log admin access to reports, user records, verification documents, and trust-and-safety decisions.

## TCP timestamps information disclosure

TCP timestamps are an operating-system setting, not an application setting. On Linux hosts that do not require TCP timestamps, disable them and persist the setting:

```bash
sudo sysctl -w net.ipv4.tcp_timestamps=0
printf 'net.ipv4.tcp_timestamps = 0\n' | sudo tee /etc/sysctl.d/99-disable-tcp-timestamps.conf
sudo sysctl --system
```

Validate with your scanner after the next deploy. Some managed platforms do not expose this sysctl; in that case, document the provider limitation and place the service behind a CDN or load balancer that normalizes TCP behavior.

## Open TCP ports 80 and 443

Port 443 should remain open for HTTPS traffic. Port 80 should either be closed at the firewall/CDN or only allow HTTP-to-HTTPS redirects. The application performs a `308` redirect in production, but the preferred network posture is:

- allow inbound TCP `443` from the internet;
- allow inbound TCP `80` only when required for ACME/Let's Encrypt validation or redirect service;
- block direct origin access when a CDN or reverse proxy is the public entry point.

Example host firewall policy:

```bash
sudo ufw default deny incoming
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp # omit if your CDN/load balancer handles redirects and ACME
sudo ufw enable
```

## TLS and EU/GDPR operations

- Terminate TLS with TLS 1.2+ and modern ciphers at the CDN/load balancer.
- Retain verification documents only for the documented review/legal period, then delete or anonymize them.
- Treat document fingerprints as personal data when they can be linked to a member account, even when HMAC-protected.
- Maintain a data processing agreement with each infrastructure provider used for hosting, auth, storage, email, analytics, and moderation.
- Document incident-response contacts, breach-notification timelines, evidence preservation, user appeal handling, and verification-document deletion workflows before public launch.
