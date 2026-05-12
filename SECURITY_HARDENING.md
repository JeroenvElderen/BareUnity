# Production security hardening checklist

This application now sends browser security headers and redirects production HTTP requests to HTTPS at the Next.js layer. The following audit items still depend on the production host, load balancer, CDN, or operating-system network stack and must be enforced there as well.

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
- Keep Supabase row-level security enabled and store service-role keys only as server-side secrets.
- Retain verification documents only for the documented review/legal period, then delete or anonymize them.
- Set `VERIFICATION_DOCUMENT_HASH_PEPPER` to a long random secret so verification-document fingerprints use HMAC-SHA-256. Production registration rejects verified ID uploads when this secret is missing. Rotate through a documented incident process only, because rotation changes future fingerprints.
- Set `APP_ALLOWED_ORIGINS` to a comma-separated allowlist for any trusted cross-origin API clients; leave it empty when the app should be same-origin only.
- Keep CDN or edge rate limiting enabled in production. The app includes per-instance API mutation throttling, but distributed attacks must be stopped before reaching the origin.
- Keep ID upload MIME/signature validation enabled and review new file types with legal/security before adding them.
- Treat document fingerprints as personal data when they can be linked to a member account, even when HMAC-protected.
- Maintain a data processing agreement with each infrastructure provider used for hosting, auth, storage, email, analytics, and moderation.
