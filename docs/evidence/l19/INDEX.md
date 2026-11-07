# L19 deployment evidence — Vultr preview (Engineer 3)

Captured **2026-11-07** against the live Vultr deployment.

- **URL:** `https://45.77.204.195.sslip.io/` (temporary sslip.io TLS — pending owner's purchased domain for the final URL)
- **Deployed SHA:** `93e27a4` (develop)
- **Image:** `highcastle/web:93e27a4` → `sha256:7d3b12f928332c6ff4a2b14fa05017dd3e47d1842285d1ddf8578f023edf071e`
- **Screenshots:** `landing-desktop-https.png` (1440×900), `landing-mobile-https.png` (390×844), `demo-desktop-http.png` (pre-HTTPS)
- **Verified:** HTTP→HTTPS 308 redirect, HTTP/2 200 on `/`, `/healthz`,`/onboarding`,`/sign-in`,`/demo` 200, `POST /api/auth/demo` 201 + `Set-Cookie: hc_demo … Secure; HttpOnly; SameSite=Lax; Max-Age=3600`.
- **Isolation:** only Caddy publishes 80/443; postgres/worker/target-lab/sandbox have no published ports.
