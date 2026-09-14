# Plan: route PriceCharting scraping through the Oracle VM

Status: **plan, not implemented**. Written for a fresh Claude session working in the
repo that already deploys services to the Oracle Cloud VM. That session owns the VM
side (steps 1–3). The Vercel side (step 4) is a small change in this repo.

## 1. Why

`api/price-lookup.ts` in this repo (Grading-Calculator) scrapes pricecharting.com
from a Vercel serverless function. PriceCharting rate-limits and blocks by source
IP, and every Vercel function shares AWS egress IPs with every other Vercel tenant,
so we get blocked for other people's traffic. As of v1.4.21.0 the function already
caches aggressively, caps query variants, and (with Redis) shares a 1 req/sec
limiter across instances. What it cannot fix is the IP.

The relay moves the *one* thing that touches pricecharting.com onto the VM's own
static IP, in a single long-lived process that can:

- enforce one global request gap with no Redis,
- keep PriceCharting cookies between requests (looks like a browser, not a fresh
  cookieless hit from a new instance every time),
- and burn only *our* reputation, never a shared one.

Everything else (query variants, matching, ranking, sealed-product filtering,
grade-table parsing, caching, error mapping) stays in the Vercel function untouched.
The relay is a dumb, authenticated, host-allowlisted HTTP fetcher.

Ranking of options, for context: official PriceCharting API (paid, token-auth, no IP
risk) > this VM relay > Vercel + Redis (current). The official API path is already
implemented in `api/price-lookup.ts` behind `PRICECHARTING_API_TOKEN`; the relay
only matters while we are in scrape mode.

## 2. The contract (both sides must match this exactly)

One endpoint on the VM:

```
POST https://<relay-host>/fetch
Authorization: Bearer <SCRAPE_PROXY_SECRET>
Content-Type: application/json

{ "url": "https://www.pricecharting.com/search-products?q=charizard+4&type=suggestions" }
```

Response (always HTTP 200 from the relay when the relay itself worked; the upstream
status is inside the body):

```json
{
  "status": 200,
  "url": "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
  "retryAfter": null,
  "body": "<html>…</html>"
}
```

- `status` — upstream HTTP status (200, 404, 429, 403, 503 …). Pass it through
  untouched; the Vercel side maps 429 → rate-limited and 403/503 → blocked.
- `url` — the **final** URL after redirects (PriceCharting redirects exact-match
  searches straight to the card page; the Vercel side depends on seeing `/game/` in
  the final URL).
- `retryAfter` — upstream `Retry-After` header value as a string, or `null`.
- `body` — upstream response body as text (HTML or JSON), untouched.

Relay-level errors (bad secret, disallowed host, upstream timeout, relay overloaded)
use relay HTTP statuses so they are never confused with upstream ones:

| Relay status | Meaning | JSON body |
| --- | --- | --- |
| 401 | missing / wrong secret | `{ "error": "unauthorized" }` |
| 400 | `url` missing or not `https://www.pricecharting.com/…` | `{ "error": "url not allowed" }` |
| 502 | upstream fetch failed (network, timeout) | `{ "error": "upstream fetch failed: <msg>" }` |
| 503 | relay queue full | `{ "error": "relay busy" }` with `Retry-After: 5` |

`GET /healthz` → `200 {"ok":true,"queue":<n>,"lastFetchAgoMs":<n>}`, no auth.

## 3. VM service (the other session builds this)

### 3.1 Behaviour

Single Node process (Node 20+, native `fetch`, no framework needed — `node:http` is
fine, or reuse whatever the repo already uses for its VM services). Requirements:

1. **Auth**: constant-time compare of the bearer token against `SCRAPE_PROXY_SECRET`
   from the environment. Never log the token.
2. **Host allowlist**: only `https://www.pricecharting.com/`-prefixed URLs. Reject
   everything else with 400. This must never be an open proxy.
3. **Single-flight queue with a gap**: one upstream request at a time, minimum
   `1100 ms` between the *start* of consecutive upstream requests (env
   `SCRAPE_GAP_MS`, default 1100). Queue depth cap `SCRAPE_MAX_QUEUE` (default 20);
   beyond that respond 503 immediately.
4. **Cookie jar**: keep a process-wide cookie jar for `www.pricecharting.com`
   (`tough-cookie` or a 30-line hand-rolled jar keyed on domain/path is enough) and
   send it on every request. Parse `Set-Cookie` from every response.
5. **Browser-like headers** on upstream requests:
   ```
   User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36
   Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
   Accept-Language: en-US,en;q=0.9
   ```
   Keep the UA stable (rotating UAs on one IP is a bot signal, not camouflage).
6. **Redirects**: follow them (default fetch behaviour) and report `response.url`.
7. **Timeout** 15 s per upstream request (`AbortController`). **Body cap** 2 MB.
8. **Self-throttle on trouble**: if upstream returns 429/403/503, pause the queue for
   `max(Retry-After, 30 s)` before serving the next job, and still return the
   upstream status to the caller. Don't retry inside the relay — the Vercel side and
   the browser already have retry logic, and stacking retries is how blocks get longer.
9. **Logging**: one line per request — timestamp, upstream path (not query secrets;
   there are none, but keep it short), upstream status, ms, queue depth. Log to
   stdout; let systemd/journald keep it.
10. **Optional memory cache** keyed on the exact URL, TTL 10 min, only for status 200.
    Cheap insurance against the same card being looked up by two users seconds
    apart before Vercel's edge cache has it.

### 3.2 Reference implementation (adapt, don't necessarily copy)

```js
// relay.mjs — minimal PriceCharting fetch relay
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.SCRAPE_PROXY_SECRET || '';
const GAP_MS = Number(process.env.SCRAPE_GAP_MS || 1100);
const MAX_QUEUE = Number(process.env.SCRAPE_MAX_QUEUE || 20);
const ALLOWED_PREFIX = 'https://www.pricecharting.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

if (!SECRET) { console.error('SCRAPE_PROXY_SECRET is required'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cookies = new Map(); // name -> value (single-domain jar is enough here)
let queue = Promise.resolve();
let queued = 0;
let lastStart = 0;
let pausedUntil = 0;

function authOk(header) {
  const got = Buffer.from((header || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(SECRET);
  return got.length === want.length && timingSafeEqual(got, want);
}

function absorbCookies(resp) {
  const set = resp.headers.getSetCookie?.() ?? [];
  for (const line of set) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function upstream(url) {
  const wait = Math.max(pausedUntil - Date.now(), GAP_MS - (Date.now() - lastStart));
  if (wait > 0) await sleep(wait);
  lastStart = Date.now();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
    });
    absorbCookies(resp);
    const retryAfter = resp.headers.get('retry-after');
    if ([429, 403, 503].includes(resp.status)) {
      const secs = Math.max(parseInt(retryAfter || '', 10) || 0, 30);
      pausedUntil = Date.now() + secs * 1000;
    }
    const body = (await resp.text()).slice(0, 2 * 1024 * 1024);
    return { status: resp.status, url: resp.url, retryAfter, body };
  } finally {
    clearTimeout(t);
  }
}

function json(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    return json(res, 200, { ok: true, queue: queued, lastFetchAgoMs: Date.now() - lastStart });
  }
  if (req.method !== 'POST' || req.url !== '/fetch') return json(res, 404, { error: 'not found' });
  if (!authOk(req.headers.authorization)) return json(res, 401, { error: 'unauthorized' });

  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 10_000) break; }
  let url;
  try { url = JSON.parse(body).url; } catch { /* fallthrough */ }
  if (typeof url !== 'string' || !url.startsWith(ALLOWED_PREFIX)) {
    return json(res, 400, { error: 'url not allowed' });
  }
  if (queued >= MAX_QUEUE) return json(res, 503, { error: 'relay busy' }, { 'Retry-After': '5' });

  queued++;
  const started = Date.now();
  const job = queue.then(() => upstream(url));
  queue = job.catch(() => {});
  try {
    const out = await job;
    console.log(`${new Date().toISOString()} ${out.status} ${Date.now() - started}ms q=${queued} ${new URL(url).pathname}`);
    json(res, 200, out);
  } catch (err) {
    console.log(`${new Date().toISOString()} ERR ${Date.now() - started}ms ${err?.message}`);
    json(res, 502, { error: `upstream fetch failed: ${err?.message ?? 'unknown'}` });
  } finally {
    queued--;
  }
}).listen(PORT, '127.0.0.1', () => console.log(`relay listening on 127.0.0.1:${PORT}`));
```

Bind to `127.0.0.1` and put it behind the VM's existing reverse proxy for TLS.

### 3.3 Deploy on the VM

Follow whatever pattern the VM repo already uses (systemd unit + Caddy/nginx site,
or its existing process manager). Requirements:

- **systemd** unit with `Restart=always`, `Environment=SCRAPE_PROXY_SECRET=…`
  loaded from an `EnvironmentFile` that is `chmod 600`, not committed.
- **TLS** via the existing reverse proxy on a dedicated hostname, e.g.
  `relay.shinycardboard.win` (or a path on an existing host). Only `/fetch` and
  `/healthz` need to be exposed.
- **Firewall**: OCI security list + the VM's iptables/ufw must not expose port 8787
  directly; only 443 through the proxy.
- Generate the secret with `openssl rand -hex 32`. It has to be set identically on
  the VM and in the Vercel project.
- Confirm from the VM: `curl -s https://<relay-host>/healthz` and a real fetch:
  ```bash
  curl -s -X POST https://<relay-host>/fetch \
    -H "Authorization: Bearer $SCRAPE_PROXY_SECRET" -H 'Content-Type: application/json' \
    -d '{"url":"https://www.pricecharting.com/search-products?q=charizard%204&type=suggestions"}' | head -c 400
  ```
  Expect `"status":200` and a JSON array in `body`. Also confirm a wrong secret gives
  401 and a non-PriceCharting URL gives 400.

## 4. Vercel side (this repo, `api/price-lookup.ts`)

Small, self-contained change. Only `scrapeFetch` changes; nothing that calls it does.

1. Read two new optional env vars next to the existing config block:
   ```ts
   const SCRAPE_PROXY_URL = process.env.SCRAPE_PROXY_URL?.trim().replace(/\/$/, '') || '';
   const SCRAPE_PROXY_SECRET = process.env.SCRAPE_PROXY_SECRET?.trim() || '';
   const proxyEnabled = !!(SCRAPE_PROXY_URL && SCRAPE_PROXY_SECRET);
   ```
2. In `scrapeFetch(url)`: when `proxyEnabled`, **skip `acquireScrapeSlot()`** (the
   relay enforces the gap; double-throttling just adds latency) and POST to
   `${SCRAPE_PROXY_URL}/fetch`. Adapt the relay JSON into the same shape the callers
   already use (`ok`, `status`, `url`, `headers.get('retry-after')`, `text()`), and
   throw `UpstreamError` on 429/403/503 exactly as the direct path does. Relay-level
   failures (401/400/502/503 from the relay itself) should throw a plain `Error`
   whose message names the relay, so they surface as a 500 with a clear message and
   are never mistaken for a PriceCharting block. Sketch:
   ```ts
   async function scrapeFetch(url: string): Promise<Response> {
     if (!proxyEnabled) {
       await acquireScrapeSlot();
       const resp = await fetch(url, { headers: BROWSER_HEADERS });
       if ([403, 429, 503].includes(resp.status)) {
         throw new UpstreamError(resp.status, 'pricecharting.com', resp.headers.get('retry-after'));
       }
       return resp;
     }
     const relay = await fetch(`${SCRAPE_PROXY_URL}/fetch`, {
       method: 'POST',
       headers: { Authorization: `Bearer ${SCRAPE_PROXY_SECRET}`, 'Content-Type': 'application/json' },
       body: JSON.stringify({ url }),
     });
     if (!relay.ok) {
       const detail = await relay.text().catch(() => '');
       throw new Error(`scrape relay error ${relay.status}: ${detail.slice(0, 200)}`);
     }
     const data = (await relay.json()) as { status: number; url: string; retryAfter: string | null; body: string };
     if ([403, 429, 503].includes(data.status)) {
       throw new UpstreamError(data.status, 'pricecharting.com (via relay)', data.retryAfter);
     }
     return new Response(data.body, { status: data.status, headers: { 'x-final-url': data.url } });
   }
   ```
   Note: `Response.url` is read-only and empty on a constructed Response, and two
   callers (`searchPriceChartingPage`, `scrapePageGrades`) read `resp.url` to detect
   the redirect-to-card-page case. Either return a small object literal that
   satisfies the subset of `Response` those callers use (`ok`, `status`, `url`,
   `headers`, `text()`) — change `scrapeFetch`'s return type to that interface — or
   have those two callers read `resp.headers.get('x-final-url') ?? resp.url`. The
   interface approach is cleaner.
3. Add `via: proxyEnabled ? 'relay' : 'direct'` next to the existing `source` field
   in the handler's JSON so it is visible in the browser network tab which path
   served a lookup.
4. Set `SCRAPE_PROXY_URL` (e.g. `https://relay.shinycardboard.win`) and
   `SCRAPE_PROXY_SECRET` on the Vercel project (Production + Preview). Redeploy.
5. Document both vars in the README env-var table (added in v1.4.21.0) and bump the
   version + `src/changelog.ts` (the build fails otherwise — see `CLAUDE.md`).
6. Extend the mocked smoke test approach used for v1.4.21.0 (bundle with esbuild,
   stub `globalThis.fetch`): assert that with the two env vars set, every outbound
   call goes to `<SCRAPE_PROXY_URL>/fetch`, none go to pricecharting.com directly,
   an upstream `status: 429` inside the relay body maps to the 429/rate-limited
   response, and a relay 401 maps to a 500 whose message mentions the relay.

## 5. Rollout and rollback

- Deploy the relay first and verify it with curl from outside the VM.
- Set the Vercel env vars on **Preview** only, open a preview deployment, run a
  lookup, confirm `via: "relay"` in the response and a matching line in the relay
  log on the VM.
- Then set them on Production. Because Vercel's edge cache already holds recent
  lookups, traffic to the relay ramps gradually.
- **Rollback** is unsetting `SCRAPE_PROXY_URL` on Vercel and redeploying; the
  function falls back to direct scraping with no code change.
- Watch the relay log for 403/503 in the first days. If the VM's IP starts getting
  blocked too, the cause is our own volume; the fix is more caching (Redis) or the
  official API, not a second relay.

## 6. Things not to do

- Do not make the relay an open proxy (no host allowlist) or leave it reachable
  without the secret, even "temporarily". It is a scraping endpoint on a public IP.
- Do not add retries inside the relay, and do not rotate user agents or IPs.
- Do not move the matching/ranking/caching logic to the VM; keeping it on Vercel means
  the relay stays trivial and the Portfolio-Price-Comparison app can share the same
  relay with the same contract.
- Do not commit the secret anywhere, including this doc, `vercel.json`, or the VM
  repo's unit files.

## 7. Follow-ups once this works

- Point Portfolio-Price-Comparison's lookup at the same relay (same contract, same
  secret), so both tools share one queue and one cookie jar.
- If Redis is also configured on Vercel, keep it: it still saves relay round-trips.
- When the official PriceCharting API is purchased, set `PRICECHARTING_API_TOKEN`
  and the relay becomes idle except for the opt-in grade-table scrape
  (`PRICECHARTING_API_SCRAPE_GRADES=1`), which also goes through the relay automatically
  since it uses `scrapeFetch`.
