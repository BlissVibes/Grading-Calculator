import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─────────────────────────────────────────────────────────────────────────────
// PriceCharting price lookup (Vercel serverless function)
//
// Request budget matters here: PriceCharting rate-limits and blocks by source
// IP, and every Vercel function shares the same AWS egress pool. Everything in
// this file is arranged to send as few outbound requests as possible:
//
//   1. Official API first (when PRICECHARTING_API_TOKEN is set) — token-auth'd
//      JSON, not subject to the IP-based scraping limits.
//   2. Caching at three layers: Vercel's edge (Cache-Control s-maxage on the
//      response), Redis (UPSTASH_REDIS_REST_URL/TOKEN or Vercel KV's
//      KV_REST_API_URL/TOKEN), and a per-instance in-memory map.
//   3. A global 1 req/sec limiter shared across function instances via Redis
//      (falls back to a per-instance gap when Redis isn't configured).
//   4. Search WITHOUT PriceCharting's search endpoints. Since ~mid 2026 both
//      /search-products?type=suggestions and ?type=prices sit behind a
//      Cloudflare "Just a moment" JS challenge for datacenter IPs (HTTP 403,
//      regardless of headers), while card pages (/game/...), set listings
//      (/console/...) and the category index (/category/...) stay open. So the
//      primary scrape search resolves the set to its /console/ slug via the
//      category index and scans the set listing for the card. The old search
//      endpoints are kept as a last resort in case the challenge is lifted.
//   5. Hard cap on query variants, and no Google scraping (datacenter IPs are
//      blocked by Google anyway). Google fallback uses the Custom Search JSON
//      API when GOOGLE_CSE_KEY/CX are set.
// ─────────────────────────────────────────────────────────────────────────────

// ───── Types ─────

interface PriceResult {
  raw: number;
  grade1: number;
  grade2: number;
  grade3: number;
  grade4: number;
  grade5: number;
  grade6: number;
  grade7: number;
  grade8: number;
  grade9: number;
  grade9_5: number;
  psa10: number;
  // Premium / alternate "10" grades (when present in the grade table)
  tag10: number;
  tag10pristine: number;
  bgs10: number;
  bgs10black: number;
  cgc10pristine: number;
  ace10: number;
  url: string;
}

interface SearchResult {
  title: string;
  url: string;
  /** PriceCharting product id (official API mode only). */
  id?: string;
}

type Grades = Omit<PriceResult, 'url'>;

const EMPTY_GRADES: Grades = {
  raw: 0, grade1: 0, grade2: 0, grade3: 0, grade4: 0, grade5: 0, grade6: 0,
  grade7: 0, grade8: 0, grade9: 0, grade9_5: 0, psa10: 0,
  tag10: 0, tag10pristine: 0, bgs10: 0, bgs10black: 0, cgc10pristine: 0, ace10: 0,
};

// ───── Config (all optional — the function degrades gracefully without them) ─────

const PC_API_TOKEN = process.env.PRICECHARTING_API_TOKEN?.trim() || '';
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY?.trim() || '';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX?.trim() || '';
/**
 * In official-API mode, PSA 1–6 and the premium 10s are only available by
 * scraping the card page. That one request is still subject to the IP-based
 * 403 risk, so it is OFF by default — set PRICECHARTING_API_SCRAPE_GRADES=1 to
 * enable it (one cached page fetch per card, best effort).
 */
const API_SCRAPE_GRADES = /^(1|true|yes)$/i.test(process.env.PRICECHARTING_API_SCRAPE_GRADES?.trim() || '');

/** Max query variants tried per lookup (each variant can cost up to 2 scrape requests). */
const MAX_VARIANTS = 5;

/** Cache TTLs (seconds). */
const TTL_SEARCH = 7 * 24 * 3600;    // query -> matched card URL (stable)
const TTL_SEARCH_MISS = 3600;        // query -> nothing found
const TTL_PRICES = 12 * 3600;        // card page -> prices
const TTL_SET_INDEX = 7 * 24 * 3600; // category page -> list of set slugs
const TTL_SET_LISTING = 24 * 3600;   // /console/<set> page -> rows
const EDGE_MAX_AGE = 12 * 3600;      // Cache-Control s-maxage for successful responses
const EDGE_MISS_MAX_AGE = 600;       // s-maxage for "no cards found"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───── Upstream error (rate limit vs. block) ─────

type UpstreamKind = 'rate-limited' | 'blocked';

class UpstreamError extends Error {
  kind: UpstreamKind;
  host: string;
  status: number;
  retryAfter: number; // seconds
  /** Optional actionable advice for the user, appended to the error message. */
  hint?: string;
  /** True when only the (Cloudflare-challenged) search endpoint failed — not a global block. */
  searchOnly = false;

  constructor(status: number, host: string, retryAfterHeader?: string | null) {
    const kind: UpstreamKind = status === 429 ? 'rate-limited' : 'blocked';
    super(`${host} ${kind} (${status})`);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.host = host;
    this.status = status;
    const parsed = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
    // 429 with no Retry-After: a short pause usually clears it.
    // 403/503 is bot protection — back off much longer.
    this.retryAfter = Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, 300)
      : kind === 'rate-limited' ? 10 : 60;
  }
}

// ───── Redis (Upstash REST) — optional shared cache + global limiter ─────

const redisEnabled = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd: (string | number)[]): Promise<unknown> {
  if (!redisEnabled) return null;
  try {
    const resp = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: unknown };
    return data.result ?? null;
  } catch {
    return null; // Redis trouble must never break a lookup
  }
}

// Per-instance memory cache. Vercel keeps warm instances around for a while, so
// this alone removes a lot of repeat traffic even without Redis.
const memCache = new Map<string, { value: unknown; expires: number }>();
const MEM_CACHE_MAX = 500;

async function cacheGet<T>(key: string): Promise<T | null> {
  const local = memCache.get(key);
  if (local && local.expires > Date.now()) return local.value as T;
  if (local) memCache.delete(key);

  const remote = await redis(['GET', key]);
  if (typeof remote === 'string') {
    try {
      const value = JSON.parse(remote) as T;
      memCache.set(key, { value, expires: Date.now() + 5 * 60 * 1000 });
      return value;
    } catch { /* corrupt entry — ignore */ }
  }
  return null;
}

async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  if (memCache.size >= MEM_CACHE_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  await redis(['SET', key, JSON.stringify(value), 'EX', ttlSec]);
}

const cacheKeyForQuery = (q: string) => `pc:search:v3:${q.toLowerCase().replace(/\s+/g, ' ').trim()}`;
const cacheKeyForPrices = (path: string) => `pc:prices:v3:${path.replace(/^https?:\/\/www\.pricecharting\.com/, '')}`;

// ───── Global outbound limiter ─────
//
// The old module-level "800ms since last fetch" only ever throttled a single
// warm instance; concurrent users each got their own instance and hammered
// PriceCharting in parallel. With Redis we take a 1-per-second slot shared by
// every instance. Without Redis we fall back to the per-instance gap.

const PER_INSTANCE_GAP_MS = 1100;
let lastFetchTime = 0;

async function acquireScrapeSlot(): Promise<void> {
  if (redisEnabled) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const sec = Math.floor(Date.now() / 1000);
      const key = `pc:rl:${sec}`;
      const count = await redis(['INCR', key]);
      if (typeof count !== 'number') break; // Redis unavailable — use local gap
      if (count === 1) {
        await redis(['EXPIRE', key, 5]);
        return;
      }
      // Someone else has this second — wait for the next one (with jitter).
      await sleep(1000 - (Date.now() % 1000) + Math.floor(Math.random() * 120));
    }
  }
  const elapsed = Date.now() - lastFetchTime;
  if (elapsed < PER_INSTANCE_GAP_MS) await sleep(PER_INSTANCE_GAP_MS - elapsed);
  lastFetchTime = Date.now();
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Fetch a pricecharting.com page under the global limiter; throws UpstreamError on 429/403/503. */
async function scrapeFetch(url: string): Promise<Response> {
  await acquireScrapeSlot();
  const resp = await fetch(url, { headers: BROWSER_HEADERS });
  if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
    throw new UpstreamError(resp.status, 'pricecharting.com', resp.headers.get('retry-after'));
  }
  return resp;
}

// ───── Official PriceCharting API (token-authenticated, not IP-limited) ─────
//
// Docs: https://www.pricecharting.com/api-documentation
//   GET /api/products?t=TOKEN&q=QUERY   -> { status, products: [ {...} ] }
//   GET /api/product?t=TOKEN&id=ID      -> { status, id, product-name, console-name, *-price }
// Prices are integers in cents. For trading cards the buckets map to:
//   loose = Ungraded, cib = Grade 7, new = Grade 8, graded = Grade 9,
//   box-only = Grade 9.5, manual-only = PSA 10, bgs-10 = BGS 10.
// The API does not expose PSA 1–6 or the premium 10s (Black Label, CGC/TAG
// Pristine, ACE) — those still come from one cached page fetch, best effort.

interface ApiProduct {
  id?: string | number;
  'product-name'?: string;
  'console-name'?: string;
  'loose-price'?: number;
  'cib-price'?: number;
  'new-price'?: number;
  'graded-price'?: number;
  'box-only-price'?: number;
  'manual-only-price'?: number;
  'bgs-10-price'?: number;
  'condition-17-price'?: number;
  'condition-18-price'?: number;
}

const apiEnabled = !!PC_API_TOKEN;

async function apiFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams({ t: PC_API_TOKEN, ...params }).toString();
  const resp = await fetch(`https://www.pricecharting.com/api/${path}?${qs}`, {
    headers: { Accept: 'application/json' },
  });
  if (resp.status === 429 || resp.status === 403 || resp.status === 503) {
    throw new UpstreamError(resp.status, 'pricecharting.com/api', resp.headers.get('retry-after'));
  }
  if (!resp.ok) return null;
  try {
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

function apiProductToSearchResult(p: ApiProduct): SearchResult | null {
  const name = (p['product-name'] || '').trim();
  const id = p.id !== undefined ? String(p.id) : '';
  if (!name || !id) return null;
  const console_ = (p['console-name'] || '').trim();
  return {
    id,
    title: console_ ? `${name} [${console_}]` : name,
    // The API doesn't return the page URL. The exact-name search redirects to
    // the card page (handled in fetchPageGrades), and is a sensible link too.
    url: `/search-products?type=prices&q=${encodeURIComponent(console_ ? `${name} ${console_}` : name)}`,
  };
}

async function apiSearch(query: string): Promise<SearchResult[]> {
  const data = await apiFetch<{ status?: string; products?: ApiProduct[] }>('products', { q: query });
  if (!data || data.status !== 'success' || !Array.isArray(data.products)) return [];
  return data.products.map(apiProductToSearchResult).filter((r): r is SearchResult => !!r);
}

const cents = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v / 100 : 0);

async function apiPrices(id: string): Promise<Partial<Grades> | null> {
  const p = await apiFetch<ApiProduct & { status?: string }>('product', { id });
  if (!p || p.status !== 'success') return null;
  return {
    raw: cents(p['loose-price']),
    grade7: cents(p['cib-price']),
    grade8: cents(p['new-price']),
    grade9: cents(p['graded-price']),
    grade9_5: cents(p['box-only-price']),
    psa10: cents(p['manual-only-price']),
    bgs10: cents(p['bgs-10-price']),
  };
}

// ───── Scrape search: suggestions endpoint (cheap JSON) ─────
// The site's search-bar autocomplete. One small request, no HTML, and it is
// more forgiving than the full search page ("slowpoke 116" resolves instantly).

async function searchPriceChartingSuggestions(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=suggestions`;
  const resp = await scrapeFetch(url);
  if (!resp.ok) return [];
  const text = await resp.text();

  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data
        .filter((item: { url?: string; title?: string }) => item.url && item.title)
        .map((item: { url: string; title: string; 'console-name'?: string }) => ({
          url: item.url.startsWith('http')
            ? item.url.replace(/https?:\/\/www\.pricecharting\.com/, '')
            : item.url,
          title: item.title + (item['console-name'] ? ` [${item['console-name']}]` : ''),
        }));
    }
  } catch {
    // Not JSON — parse as HTML suggestions
    const results: SearchResult[] = [];
    const re = /<a\s+href="([^"]*\/game\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const decodedUrl = m[1].replace(/&amp;/g, '&');
      const path = decodedUrl.replace(/https?:\/\/www\.pricecharting\.com/, '');
      results.push({ url: path, title: m[2].trim() });
    }
    return results;
  }

  return [];
}

// ───── Scrape search: full search-products page ─────

async function searchPriceChartingPage(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
  const resp = await scrapeFetch(url);
  if (!resp.ok) return [];

  // PriceCharting redirects straight to the card page for exact matches.
  const finalUrl = resp.url;
  if (finalUrl && /\/game\//.test(finalUrl)) {
    const html = await resp.text();
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = h1Match ? h1Match[1].trim() : query;
    const path = finalUrl.replace(/https?:\/\/www\.pricecharting\.com/, '');
    return [{ url: path, title }];
  }

  const html = await resp.text();
  const results: SearchResult[] = [];
  const re = /<td\s+class="title">\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const decodedUrl = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    results.push({ url: decodedUrl, title: m[2].trim() });
  }
  return results;
}

// ───── Fallback: Google Custom Search JSON API ─────
// Replaces scraping google.com (which blocks datacenter IPs and used to be
// mis-reported as a PriceCharting rate limit). Needs GOOGLE_CSE_KEY + GOOGLE_CSE_CX
// (a Programmable Search Engine restricted to pricecharting.com). Costs quota,
// so it runs once per lookup on the original query, never per variant.

async function searchViaGoogleApi(query: string): Promise<SearchResult[]> {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return [];
  const params = new URLSearchParams({
    key: GOOGLE_CSE_KEY,
    cx: GOOGLE_CSE_CX,
    q: `site:pricecharting.com/game ${query}`,
    num: '5',
  });
  let resp: Response;
  try {
    resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  } catch {
    return [];
  }
  if (!resp.ok) return []; // quota exhausted / misconfigured — just skip the fallback

  const data = (await resp.json().catch(() => null)) as { items?: { link?: string; title?: string }[] } | null;
  const results: SearchResult[] = [];
  for (const item of data?.items ?? []) {
    const link = item.link ?? '';
    const m = link.match(/^https?:\/\/www\.pricecharting\.com(\/game\/[^?#]+)/);
    if (!m) continue;
    const path = decodeURIComponent(m[1]);
    // Page titles look like "Charizard #4 Prices | Pokemon Base Set | Pokemon Cards"
    const rawTitle = (item.title ?? '').replace(/\s+\|.*$/, '').replace(/\s+Prices?$/i, '').trim();
    const setFromTitle = (item.title ?? '').split('|')[1]?.trim();
    const title = rawTitle
      ? setFromTitle ? `${rawTitle} [${setFromTitle}]` : rawTitle
      : (path.split('/').pop() ?? '').replace(/-/g, ' ');
    if (!results.some((r) => r.url === path)) results.push({ url: path, title });
  }
  return results;
}


// ───── Relevance Scoring ─────
// Score how well a search result title matches the original query

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // "Pokémon" -> "pokemon"
    .replace(/['']/g, '')            // remove apostrophes
    .replace(/[-–—]/g, ' ')          // dashes to spaces
    .replace(/[^a-z0-9#.\s]/g, ' ') // strip special chars
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeForMatch(s).split(' ').filter(Boolean);
}

// Keywords that indicate a sealed product or compilation — not an individual card page
const SEALED_KEYWORDS = ['pack', 'booster', 'box', 'collection', 'tin', 'bundle', 'deck', 'set box', 'promo pack', 'etb', 'elite trainer'];

/** Check if a result looks like a sealed product by inspecting both title AND URL. */
function looksLikeSealed(title: string, url?: string): boolean {
  const t = title.toLowerCase();
  if (SEALED_KEYWORDS.some((kw) => t.includes(kw))) return true;
  // Also check the URL slug — PriceCharting URLs like "/game/pokemon-promo/mew-v-box"
  // contain "box" even when the H1 title might not.
  if (url) {
    const slug = url.toLowerCase().split('/').pop()?.replace(/-/g, ' ') ?? '';
    if (SEALED_KEYWORDS.some((kw) => slug.includes(kw))) return true;
  }
  // "Vol7", "Vol. 3" etc. — compilation volumes
  if (/\bvol\.?\s*\d+\b/.test(t)) return true;
  return false;
}

/**
 * Extract the card number from a string (query or title).
 * Handles formats: #131, 131/200, 002/019, #002, 131
 * Returns the primary number (before any slash) as a string to preserve leading zeros.
 */
function extractCardNumber(s: string): string | null {
  // "#131", "#002" — explicit hash-prefixed number
  const hashMatch = s.match(/#(\d{1,4})/);
  if (hashMatch) return hashMatch[1];

  // "002/019", "131/200" — slash-separated (card/setSize)
  const slashMatch = s.match(/\b(\d{1,4})\/(\d{1,4})\b/);
  if (slashMatch) return slashMatch[1];

  return null;
}

/**
 * Extract ALL numbers that look like card numbers from a title.
 * Returns them as strings (preserving leading zeros).
 */
function extractAllNumbers(s: string): string[] {
  const nums: string[] = [];
  // "#271", "#002"
  for (const m of s.matchAll(/#(\d{1,4})/g)) nums.push(m[1]);
  // "002/019"
  for (const m of s.matchAll(/\b(\d{1,4})\/\d{1,4}\b/g)) nums.push(m[1]);
  // Standalone numbers like "271" in title (but not years like 2024)
  for (const m of s.matchAll(/\b(\d{1,4})\b/g)) {
    const n = m[1];
    if (n.length <= 3 || n.startsWith('0')) {
      if (!nums.includes(n)) nums.push(n);
    }
  }
  // Letter-prefixed promo / gallery numbers: "SM227", "SWSH039", "TG12", "GG01", "SV107"
  for (const m of s.matchAll(/\b[a-z]{1,5}(\d{1,4})\b/gi)) {
    if (!nums.includes(m[1])) nums.push(m[1]);
  }
  return nums;
}

/** Compare card numbers — handles leading-zero equivalence (002 == 2) */
function cardNumbersMatch(a: string, b: string): boolean {
  // Exact string match (preserves leading zeros: 002 === 002)
  if (a === b) return true;
  // Numeric match (002 == 2)
  if (parseInt(a, 10) === parseInt(b, 10)) return true;
  return false;
}

const LANGUAGE_KEYWORDS = ['japanese', 'korean', 'chinese', 'german', 'french', 'italian', 'spanish', 'portuguese'];

/** Check if a string (URL slug or title) indicates a non-English card */
function detectResultLanguage(s: string): string | null {
  const lower = s.toLowerCase();
  for (const lang of LANGUAGE_KEYWORDS) {
    if (lower.includes(lang)) return lang;
  }
  // Japanese promo suffixes: "S-P", "/S-P"
  if (/\bs[\s-]?p\b/i.test(lower)) return 'japanese';
  return null;
}

function scoreResult(query: string, resultTitle: string, resultUrl?: string): number {
  const qNorm = normalizeForMatch(query);
  const tNorm = normalizeForMatch(resultTitle);

  // Exact match (after normalization) is perfect
  if (qNorm === tNorm) return 1000;

  const qTokens = tokenize(query);
  const tTokens = tokenize(resultTitle);

  let score = 0;

  // Count how many query tokens appear in the title
  for (const qt of qTokens) {
    // Skip generic game-name tokens for scoring — they add noise
    if (['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese', 'german', 'french'].includes(qt)) continue;
    if (tTokens.some((tt) => tt === qt)) {
      score += 10; // exact token match
    } else if (tTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
      score += 5;  // partial token match
    }
  }

  // Penalize if the title has many extra tokens the query doesn't have
  const extraTokens = tTokens.filter(
    (tt) => !qTokens.some((qt) => tt === qt || tt.includes(qt) || qt.includes(tt))
  );
  score -= extraTokens.length * 1;

  // Bonus: title contains the card name substring
  // Extract card name (first significant part of query, before numbers/set)
  const GENERIC_TOKENS = ['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese', 'german', 'french', 'italian', 'spanish', 'portuguese'];
  const cardNamePart = qTokens.filter((t) => !/^#?\d+$/.test(t) && !GENERIC_TOKENS.includes(t));
  const cardNameStr = cardNamePart.join(' ');
  if (cardNameStr && tNorm.includes(cardNameStr)) {
    score += 20; // card name appears as substring in title
  }

  // Penalty: result is missing the primary subject word of the card name.
  // buildQuery puts the card name first (after the game/language prefix), so the
  // first distinctive token is the card's subject (e.g. "armored" in "Armored
  // Mewtwo"). A result that lacks it — like plain "Mewtwo" — is the wrong card.
  const primarySubject = qTokens.find((t) => !/^#?\d/.test(t) && !GENERIC_TOKENS.includes(t));
  if (primarySubject) {
    const slug = (resultUrl ?? '').toLowerCase();
    const subjectPresent =
      tTokens.some((tt) => tt === primarySubject || tt.includes(primarySubject) || primarySubject.includes(tt)) ||
      slug.includes(primarySubject);
    if (!subjectPresent) score -= 60;
  }

  // ── Card-number matching — important but must agree with card name ──
  // When a query specifies a card number, matching/mismatching that number
  // should heavily influence the final score — but only the full bonus is
  // awarded when the card name ALSO matches.  This prevents "Hop's Trevenant 237"
  // beating "Pikachu 237" when we searched for "Pikachu 237".
  const queryCardNum = extractCardNumber(query);
  const hasCardNameMatch = !!(cardNameStr && tNorm.includes(cardNameStr));
  if (queryCardNum) {
    const resultNums = extractAllNumbers(resultTitle);

    if (resultNums.length > 0) {
      const hasExactMatch = resultNums.some((rn) => cardNumbersMatch(rn, queryCardNum));
      if (hasExactMatch && hasCardNameMatch) {
        score += 100; // both card name and number match — high confidence
      } else if (hasExactMatch && !hasCardNameMatch) {
        score += 15;  // right number but wrong name — only a mild bonus
      } else {
        score -= 300; // WRONG card number — essentially disqualifying
      }
    }
    // No number in result title at all — mild penalty
    // (some PriceCharting titles omit the number)
    else {
      score -= 10;
    }

    // Sealed product penalty on top of number mismatch
    if (looksLikeSealed(resultTitle, resultUrl)) {
      score -= 50;
    }
  } else if (looksLikeSealed(resultTitle, resultUrl)) {
    // Even without a card number, slightly penalise sealed products
    score -= 15;
  }

  // ── Language mismatch penalty ──
  // If the query doesn't contain any language keyword (implying English),
  // but the result title or URL indicates a non-English card, penalize heavily.
  const queryHasLang = LANGUAGE_KEYWORDS.some((lk) => qNorm.includes(lk));
  const resultLang = detectResultLanguage(tNorm) || (resultUrl ? detectResultLanguage(resultUrl) : null);
  if (!queryHasLang && resultLang) {
    score -= 120; // wrong language — almost certainly wrong card
  } else if (queryHasLang && !resultLang) {
    // Query wants a specific language but result looks English — mild penalty
    score -= 30;
  }

  // ── Pokemon Center stamp mismatch ──
  // PriceCharting titles include "Pokemon Center" for stamped variants.
  // If the query asks for "pokemon center" but the result doesn't have it (or vice versa),
  // apply a penalty to avoid matching the wrong variant.
  const queryWantsPC = qNorm.includes('pokemon center');
  const resultHasPC = tNorm.includes('pokemon center') || (resultUrl ? resultUrl.toLowerCase().includes('pokemon-center') : false);
  if (queryWantsPC && !resultHasPC) {
    score -= 80; // wanted PC stamp but result is non-stamped
  } else if (!queryWantsPC && resultHasPC) {
    score -= 80; // didn't want PC stamp but result is stamped (would overprice)
  }

  return score;
}

function rankResults(query: string, results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  return [...results].sort((a, b) => {
    // Score against title AND URL slug (PriceCharting URLs contain the card identifier)
    const slugA = a.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const slugB = b.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const scoreA = Math.max(scoreResult(query, a.title, a.url), scoreResult(query, slugA, a.url));
    const scoreB = Math.max(scoreResult(query, b.title, b.url), scoreResult(query, slugB, b.url));
    return scoreB - scoreA;
  });
}


// ───── Structured query ─────
// The client sends the card's fields separately (name/number/set/game/lang/pc)
// alongside the legacy free-text `q`. When only `q` is present we parse it
// back apart using the same shape buildQuery() on the client produces:
//   "<game> [<language>] <name> <number> <set> [pokemon center]"

type Game = 'pokemon' | 'magic' | 'yugioh' | 'dragonball' | 'onepiece' | 'digimon';

interface StructuredQuery {
  game: Game | null;
  lang: string | null;      // 'japanese', 'korean', ... (null = English)
  name: string;
  number: string | null;    // as typed, e.g. "4", "008/025", "#131"
  set: string;
  pokemonCenter: boolean;
}

const GAME_WORDS: Record<string, Game> = {
  'pokemon': 'pokemon', 'pokémon': 'pokemon',
  'magic the gathering': 'magic', 'magic: the gathering': 'magic', 'magic': 'magic', 'mtg': 'magic',
  'yugioh': 'yugioh', 'yu-gi-oh!': 'yugioh', 'yu-gi-oh': 'yugioh',
  'dragon ball': 'dragonball', 'dragonball': 'dragonball', 'fusion world': 'dragonball',
  'one piece': 'onepiece', 'onepiece': 'onepiece',
  'digimon': 'digimon',
};

/**
 * Card numbers that carry their set code: "FB10-059" (Dragon Ball Fusion World),
 * "OP05-119" (One Piece), "BT12-001" (Digimon / Dragon Ball Super), "ST01-001".
 * The code alone identifies the set on PriceCharting ("Dragon Ball FB10").
 */
const SET_CODE_NUMBER_RE = /^([A-Za-z]{1,4}\d{0,3})-(\d{2,4})$/;
const isSetCodeNumber = (n: string | null): n is string => !!n && SET_CODE_NUMBER_RE.test(n.trim());

const LANG_CODE_WORDS: Record<string, string> = {
  JP: 'japanese', KR: 'korean', CN: 'chinese', DE: 'german', FR: 'french',
  IT: 'italian', ES: 'spanish', PT: 'portuguese',
};

function parseFreeTextQuery(q: string): StructuredQuery {
  let rest = q.trim();
  let game: Game | null = null;
  const gm = rest.match(/^(pokemon|magic the gathering|yugioh)\s+/i);
  if (gm) { game = GAME_WORDS[gm[1].toLowerCase()] ?? null; rest = rest.slice(gm[0].length); }
  let lang: string | null = null;
  const lm = rest.match(/^(japanese|korean|chinese|german|french|italian|spanish|portuguese)\s+/i);
  if (lm) { lang = lm[1].toLowerCase(); rest = rest.slice(lm[0].length); }
  let pokemonCenter = false;
  if (/\s+pokemon center$/i.test(rest)) { pokemonCenter = true; rest = rest.replace(/\s+pokemon center$/i, ''); }
  const nm = rest.match(/^(.+?)\s+(#?\d{1,4}(?:\/\d{1,4})?|[A-Za-z]{1,4}\d{0,3}-\d{2,4})(?:\s+(.*))?$/);
  if (nm) return { game, lang, name: nm[1].trim(), number: nm[2], set: (nm[3] ?? '').trim(), pokemonCenter };
  return { game, lang, name: rest, number: null, set: '', pokemonCenter };
}

function structuredFromParams(p: Record<string, string | string[] | undefined>, q: string): StructuredQuery {
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
  if (!str('name')) return parseFreeTextQuery(q);
  const gameRaw = str('game').toLowerCase();
  const gameKey = GAME_WORDS[gameRaw] ? gameRaw : Object.keys(GAME_WORDS).find((k) => gameRaw.includes(k));
  const game: Game | null = gameKey ? GAME_WORDS[gameKey] : null;
  const langRaw = str('lang').toUpperCase();
  const lang = langRaw && langRaw !== 'EN' ? (LANG_CODE_WORDS[langRaw] ?? null) : null;
  let name = str('name')
    .replace(/\s*\(([A-Za-z]{2,3})\)\s*/g, (m, code) => (LANG_CODE_WORDS[code.toUpperCase()] ? ' ' : m))
    .replace(/\s+/g, ' ').trim();
  let number: string | null = str('number') || null;
  // "pikachu 227" typed into the name field with no Card # -> name + number
  if (!number) {
    const tail = name.match(/^(.+?)\s+#?(\d{1,4}(?:\/\d{1,4})?|[A-Za-z]{1,4}\d{0,3}-\d{2,4})$/);
    if (tail) { name = tail[1]; number = tail[2]; }
  }
  return { game, lang, name, number, set: str('set'), pokemonCenter: str('pc') === '1' };
}

// ───── Scrape search v2: set listing pages ─────

const CATEGORY_BY_GAME: Record<Game, string> = {
  pokemon: 'pokemon-cards',
  magic: 'magic-cards',
  yugioh: 'yugioh-cards',
  dragonball: 'dragon-ball-cards',
  onepiece: 'one-piece-cards',
  digimon: 'digimon-cards',
};

/** /console/ slug prefix that marks a set as belonging to the game. */
const SLUG_PREFIX_BY_GAME: Record<Game, string> = {
  pokemon: 'pokemon-',
  magic: 'magic-',
  yugioh: 'yugioh-',
  dragonball: 'dragon-ball-',
  onepiece: 'one-piece-',
  digimon: 'digimon-',
};

/** Games whose card numbers carry a set code, in the order to try when the game is unknown. */
const SET_CODE_GAMES: Game[] = ['dragonball', 'onepiece', 'digimon'];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

interface SetEntry { slug: string; title: string }

/** All /console/<slug> sets for a game, from the category index page (cached 7d). */
async function getSetIndex(game: Game): Promise<SetEntry[]> {
  const key = `pc:sets:v1:${game}`;
  const cached = await cacheGet<SetEntry[]>(key);
  if (cached) return cached;

  const resp = await scrapeFetch(`https://www.pricecharting.com/category/${CATEGORY_BY_GAME[game]}`);
  if (!resp.ok) return [];
  const html = await resp.text();
  const seen = new Set<string>();
  const out: SetEntry[] = [];
  const re = /<a\s+href="\/console\/([^"?#]+)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    // Keep the slug exactly as the href has it (percent-encoding included, e.g.
    // "mcdonald%27s") — only HTML entities need decoding ("&amp;" -> "&").
    const slug = decodeEntities(m[1]);
    if (!slug.startsWith(SLUG_PREFIX_BY_GAME[game]) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: decodeEntities(m[2]).trim() });
  }
  if (out.length > 0) await cacheSet(key, out, TTL_SET_INDEX);
  return out;
}

const SET_NOISE_TOKENS = new Set(['pokemon', 'magic', 'the', 'gathering', 'yugioh', 'cards', 'card', 'tcg',
  'dragon', 'ball', 'one', 'piece', 'digimon', ...LANGUAGE_KEYWORDS]);

function setTokens(s: string): string[] {
  return tokenize(s).filter((t) => !SET_NOISE_TOKENS.has(t));
}

/** Pick the /console/ set that best matches the user's set text, honouring language. */
function findSet(index: SetEntry[], setText: string, lang: string | null): SetEntry | null {
  const want = setTokens(setText);
  if (want.length === 0) return null;
  const wantStr = want.join(' ');

  let best: SetEntry | null = null;
  let bestScore = 0;
  for (const entry of index) {
    const slugLang = LANGUAGE_KEYWORDS.find((l) => entry.slug.includes(`-${l}-`) || entry.slug.endsWith(`-${l}`)) ?? null;
    if ((lang ?? null) !== slugLang) continue; // English wants English sets; Japanese wants -japanese- sets

    const have = setTokens(entry.title);
    if (have.length === 0) continue;
    const haveStr = have.join(' ');
    let score: number;
    if (haveStr === wantStr) score = 1;
    else {
      const overlap = want.filter((t) => have.includes(t)).length;
      score = overlap / Math.max(want.length, have.length);
      // Substring containment either way is a strong signal ("151" vs "pokemon 151")
      if (overlap > 0 && (haveStr.includes(wantStr) || wantStr.includes(haveStr))) score = Math.max(score, 0.75);
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** One page (150 rows) of a set listing, as search results (cached 24h). */
async function getSetListingPage(set: SetEntry, cursor: number): Promise<{ rows: SearchResult[]; nextCursor: number | null }> {
  const key = `pc:console:v1:${set.slug}:${cursor}`;
  const cached = await cacheGet<{ rows: SearchResult[]; nextCursor: number | null }>(key);
  if (cached) return cached;

  const url = `https://www.pricecharting.com/console/${set.slug}${cursor > 0 ? `?cursor=${cursor}` : ''}`;
  const resp = await scrapeFetch(url);
  if (!resp.ok) return { rows: [], nextCursor: null };
  const html = await resp.text();

  const rows: SearchResult[] = [];
  const re = /<td\s+class="title"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    rows.push({ url: decodeEntities(m[1]), title: `${decodeEntities(m[2]).trim()} [${set.title}]` });
  }
  const nm = html.match(/name="cursor"\s+value="(\d+)"/);
  const nextCursor = nm && rows.length > 0 ? Number(nm[1]) : null;
  const result = { rows, nextCursor };
  if (rows.length > 0) await cacheSet(key, result, TTL_SET_LISTING);
  return result;
}

/**
 * Set listing filtered to one card number via the page's "model-number" filter
 * (exact string match on PriceCharting's number, e.g. "4", "25", "SM227").
 * Tiny page (~70KB) instead of 650KB per 150 rows. Cached 24h.
 */
async function getSetListingByNumber(set: SetEntry, number: string): Promise<SearchResult[]> {
  const key = `pc:console:v1:${set.slug}:mn:${number.toLowerCase()}`;
  const cached = await cacheGet<SearchResult[]>(key);
  if (cached) return cached;

  const resp = await scrapeFetch(`https://www.pricecharting.com/console/${set.slug}?model-number=${encodeURIComponent(number)}`);
  if (!resp.ok) return [];
  const html = await resp.text();
  const rows: SearchResult[] = [];
  const re = /<td\s+class="title"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    rows.push({ url: decodeEntities(m[1]), title: `${decodeEntities(m[2]).trim()} [${set.title}]` });
  }
  await cacheSet(key, rows, rows.length > 0 ? TTL_SET_LISTING : TTL_SEARCH_MISS);
  return rows;
}

/** Number spellings to try with the model-number filter: as typed, no leading zeros, 3-digit. */
function numberForms(number: string, hints: string[] = []): string[] {
  const base = number.replace(/^#/, '').replace(/\/\d+$/, '').trim();
  const digits = base.replace(/^0+(?=\d)/, '');
  const forms = [base, digits, digits.padStart(3, '0'), ...hints.map((h) => h.trim())].filter(Boolean);
  return [...new Set(forms)];
}

const MAX_NUMBER_FORMS = 3;
const MAX_SET_PAGES = 4; // 600 rows — covers every set incl. 1st-edition/reverse variants

/**
 * Find the card by scanning its set's listing pages instead of using the
 * (Cloudflare-challenged) search endpoint. Returns ranked single-card results,
 * or [] when the set can't be resolved or the card isn't in it.
 */
async function searchViaSetListing(sq: StructuredQuery): Promise<{ results: SearchResult[]; setResolved: boolean }> {
  if (!sq.game || !sq.set || !sq.name) return { results: [], setResolved: false };
  const index = await getSetIndex(sq.game);
  const set = findSet(index, sq.set, sq.lang);
  if (!set) return { results: [], setResolved: false };
  return { results: await scanSetListing(sq, set), setResolved: true };
}

async function scanSetListing(sq: StructuredQuery, set: SetEntry, numberHints: string[] = []): Promise<SearchResult[]> {
  // Fast path: filter the listing by card number (a few rows, one small page).
  if (sq.number) {
    const num = `#${sq.number.replace(/^#/, '').replace(/\/\d+$/, '')}`;
    const cardQuery = [sq.lang, sq.name, num, sq.pokemonCenter ? 'pokemon center' : null].filter(Boolean).join(' ');
    // Prefer the exact spellings TCGdex gave us (e.g. "SM227"), then the plain forms.
    const forms = [...new Set([...numberHints.filter(Boolean), ...numberForms(sq.number)])].slice(0, MAX_NUMBER_FORMS);
    for (const form of forms) {
      const rows = await getSetListingByNumber(set, form);
      if (rows.length === 0) continue;
      const ranked = keepSingleCards(cardQuery, rows);
      if (ranked.length === 0) continue;
      const top = ranked[0];
      const topScore = Math.max(
        scoreResult(cardQuery, top.title, top.url),
        scoreResult(cardQuery, top.url.split('/').pop()?.replace(/-/g, ' ') ?? '', top.url),
      );
      if (topScore >= 60) return ranked; // name matched on a number-filtered page
    }
  }
  return scanSetListingPages(sq, set);
}

/** Slow path: page through the whole set listing (150 rows a page). */
async function scanSetListingPages(sq: StructuredQuery, set: SetEntry): Promise<SearchResult[]> {

  // Score against "[lang] name number [pokemon center]" so the existing scorer's
  // number / language / stamp logic applies, without the set name adding noise.
  // The number goes in "#NNN" form so the scorer treats it as a card number
  // (bare "025" would not be recognised; leading zeros are matched numerically).
  const num = sq.number ? `#${sq.number.replace(/^#/, '').replace(/\/\d+$/, '')}` : null;
  const cardQuery = [sq.lang, sq.name, num, sq.pokemonCenter ? 'pokemon center' : null]
    .filter(Boolean).join(' ');

  const all: SearchResult[] = [];
  let cursor: number | null = 0;
  for (let page = 0; page < MAX_SET_PAGES && cursor !== null; page++) {
    const { rows, nextCursor } = await getSetListingPage(set, cursor);
    all.push(...rows);
    const ranked = keepSingleCards(cardQuery, all);
    if (ranked.length > 0) {
      const top = ranked[0];
      const topScore = Math.max(
        scoreResult(cardQuery, top.title, top.url),
        scoreResult(cardQuery, top.url.split('/').pop()?.replace(/-/g, ' ') ?? '', top.url),
      );
      // Name + number both matched (>= 100 bonus) — no need to read further pages.
      if (topScore >= 100) return ranked;
      // No number in the query: accept a clear name hit.
      if (!sq.number && topScore >= 20) return ranked;
    }
    cursor = nextCursor;
  }
  const ranked = keepSingleCards(cardQuery, all);
  if (ranked.length === 0) return [];
  // Last page read and still no confident hit: only accept a result that at least
  // carries the right card number (or a name match when no number was given).
  const top = ranked[0];
  const topScore = Math.max(
    scoreResult(cardQuery, top.title, top.url),
    scoreResult(cardQuery, top.url.split('/').pop()?.replace(/-/g, ' ') ?? '', top.url),
  );
  return topScore >= (sq.number ? 100 : 20) ? ranked : [];
}

// ───── Set-code lookups (Dragon Ball / One Piece / Digimon) ─────
// "Son Gohan: Future FB10-059": the code "FB10" names the set, and PriceCharting
// titles those sets with the code ("Dragon Ball FB10"). Resolve the set by code,
// filter its listing by the full number, rank by name.

async function searchViaSetCode(sq: StructuredQuery): Promise<SearchResult[]> {
  if (!isSetCodeNumber(sq.number) || !sq.name) return [];
  const m = sq.number.trim().match(SET_CODE_NUMBER_RE)!;
  const code = m[1].toLowerCase();
  const fullNumber = sq.number.trim().toUpperCase();

  const games: Game[] = sq.game && SET_CODE_GAMES.includes(sq.game) ? [sq.game] : SET_CODE_GAMES;
  for (const game of games) {
    const index = await getSetIndex(game);
    const set = index.find((e) => tokenize(e.title).includes(code));
    if (!set) continue;

    const rows = await getSetListingByNumber(set, fullNumber);
    const withCode = rows.filter((r) => r.title.toLowerCase().includes(fullNumber.toLowerCase()) || r.url.toLowerCase().includes(fullNumber.toLowerCase()));
    if (withCode.length === 0) continue;
    // Rank by name only (the number is already exact); the scorer's extra-token
    // penalty prefers the base printing over "[Alternate Art]" variants.
    const ranked = keepSingleCards(sq.name, withCode);
    if (ranked.length > 0) return ranked;
  }
  return [];
}

// ───── Set-less lookups: candidate sets from TCGdex (Pokémon, English) ─────
// When the user gave no Set (or one we can't map), ask the free TCGdex card
// database which sets contain a card with this name + number, then scan those
// PriceCharting set listings. TCGdex filters are "contains" matches, so the
// existing scorer does the final ranking. Data: https://api.tcgdex.net (no key).

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const TTL_TCGDEX = 7 * 24 * 3600;
const MAX_CANDIDATE_SETS = 3;

interface TcgdexSet { id: string; name: string }
interface TcgdexCardBrief { id: string; localId: string; name: string }

async function tcgdexJson<T>(path: string): Promise<T | null> {
  try {
    const resp = await fetch(`${TCGDEX_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

/** TCGdex set id -> name, excluding the "Pokémon TCG Pocket" app sets (cached 7d). */
async function getTcgdexSets(): Promise<Map<string, string>> {
  const key = 'tcgdex:sets:v1';
  const cached = await cacheGet<[string, string][]>(key);
  if (cached) return new Map(cached);

  const [sets, pocket] = await Promise.all([
    tcgdexJson<TcgdexSet[]>('/sets'),
    tcgdexJson<{ sets?: TcgdexSet[] }>('/series/tcgp'),
  ]);
  if (!sets) return new Map();
  const exclude = new Set((pocket?.sets ?? []).map((x) => x.id));
  const entries: [string, string][] = sets
    .filter((x) => x.id && x.name && !exclude.has(x.id))
    .map((x) => [x.id, x.name]);
  await cacheSet(key, entries, TTL_TCGDEX);
  return new Map(entries);
}

/** PriceCharting groups every English promo under "Pokemon Promo". */
function pcSetTextFor(tcgdexSetName: string): string {
  return /promo/i.test(tcgdexSetName) ? 'Promo' : tcgdexSetName;
}

interface CandidateSet { text: string; localIds: string[] }

/** Candidate PriceCharting set texts (+ TCGdex number spellings) for a name + number, best first. */
async function tcgdexCandidateSets(name: string, number: string): Promise<CandidateSet[]> {
  const num = number.replace(/^#/, '').replace(/\/\d+$/, '');
  const key = `tcgdex:cands:v2:${name.toLowerCase()}:${num}`;
  const cached = await cacheGet<CandidateSet[]>(key);
  if (cached) return cached;

  const cards = await tcgdexJson<TcgdexCardBrief[]>(
    `/cards?name=${encodeURIComponent(name)}&localId=${encodeURIComponent(num)}`,
  );
  if (!cards || cards.length === 0) return [];
  const sets = await getTcgdexSets();

  const exact: CandidateSet[] = [];
  const loose: CandidateSet[] = [];
  for (const c of cards) {
    const setId = c.id.endsWith(`-${c.localId}`) ? c.id.slice(0, -(c.localId.length + 1)) : c.id.split('-')[0];
    const setName = sets.get(setId);
    if (!setName) continue; // unknown or Pocket set
    const text = pcSetTextFor(setName);
    const localNum = c.localId.replace(/^[A-Za-z]+/, '');
    const bucket = parseInt(localNum, 10) === parseInt(num, 10) ? exact : loose;
    const existing = exact.find((x) => x.text === text) ?? loose.find((x) => x.text === text);
    if (existing) {
      if (!existing.localIds.includes(c.localId)) existing.localIds.push(c.localId);
    } else {
      bucket.push({ text, localIds: [c.localId] });
    }
  }
  const out = [...exact, ...loose].slice(0, MAX_CANDIDATE_SETS);
  if (out.length > 0) await cacheSet(key, out, TTL_TCGDEX);
  return out;
}

/** Set-less search: TCGdex candidate sets -> PriceCharting listing scan. */
async function searchViaCandidateSets(sq: StructuredQuery): Promise<SearchResult[]> {
  if (sq.game !== 'pokemon' || sq.lang || !sq.name || !sq.number) return [];
  const candidates = await tcgdexCandidateSets(sq.name, sq.number);
  if (candidates.length === 0) return [];
  const index = await getSetIndex('pokemon');
  const tried = new Set<string>();
  for (const cand of candidates) {
    const set = findSet(index, cand.text, null);
    if (!set || tried.has(set.slug)) continue;
    tried.add(set.slug);
    const results = await scanSetListing(sq, set, cand.localIds);
    if (results.length > 0) return results;
  }
  return [];
}

// ───── Query Variants ─────
// Alternative queries if the original doesn't match. Ordered by hit rate, and
// capped at MAX_VARIANTS by searchCard — each variant can cost two scrape
// requests, so a long tail of variants is exactly what got us rate-limited.

function buildQueryVariants(query: string): string[] {
  const variants: string[] = [query];
  const lower = query.toLowerCase();

  const PREFIX_RE = /^((?:pokemon|magic the gathering|yugioh)\s+(?:japanese\s+|korean\s+|chinese\s+|german\s+|french\s+)?)/i;

  // ── High-confidence: game + language + name + number, set name dropped ──
  // E.g. "pokemon japanese Mew (JP) 005/038 Ruler of the Black Flame Deck Build Box"
  //   → "pokemon japanese Mew (JP) 005/038", then "... 005"
  // Set names containing "Box", "Deck", etc. pollute results.
  const nameNum = query.match(
    /^((?:pokemon|magic the gathering|yugioh)\s+(?:japanese\s+|korean\s+|chinese\s+|german\s+|french\s+)?)(.+?)\s+(\d{1,4}(?:\/\d{1,4})?)\s+\S/i
  );
  if (nameNum) {
    const prefix = nameNum[1];
    const name = nameNum[2];
    const fullNum = nameNum[3];
    const shortNum = fullNum.replace(/\/\d+$/, '');
    variants.push(`${prefix}${name} ${fullNum}`.trim());
    if (shortNum !== fullNum) variants.push(`${prefix}${name} ${shortNum}`.trim());
    // "name + number" only — how humans search PriceCharting ("slowpoke 116")
    variants.push(`${name} ${shortNum}`.trim());
  }

  // ── Naming rewrites (only when applicable, so they stay near the front) ──
  if (/\bmega\b/i.test(lower)) {
    variants.push(query.replace(/\bmega\s+/i, 'M ').replace(/\bex\b/i, 'EX')); // "Mega X ex" → "M X-EX"
  }
  if (/\bvmax\b/i.test(lower)) variants.push(query.replace(/\bVMAX\b/gi, 'V-MAX'));
  if (/\bvstar\b/i.test(lower)) variants.push(query.replace(/\bVSTAR\b/gi, 'V-STAR'));
  if (query.includes("'") || query.includes('’')) {
    variants.push(query.replace(/['’]/g, '')); // "Team Rocket's" → "Team Rockets"
  }

  // ── "008/025" → "008" (PriceCharting chokes on the slash form) ──
  const withoutSlashPart = query.replace(/\b(\d{1,4})\/\d{1,4}\b/g, '$1');
  if (withoutSlashPart !== query) variants.push(withoutSlashPart);

  // ── Drop the game prefix ──
  const stripped = query.replace(PREFIX_RE, '');
  if (stripped !== query) variants.push(stripped);

  // ── Simplified: no parentheticals, no numbers ──
  const simplified = query
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*#?\d{1,4}(?:\/\d{1,4})?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (simplified !== query && simplified.length > 2) variants.push(simplified);

  return [...new Set(variants)];
}

// ───── Combined search ─────

function keepSingleCards(query: string, results: SearchResult[]): SearchResult[] {
  // This tool prices individual graded cards — never boxes, packs, decks, tins.
  const singles = results.filter((r) => !looksLikeSealed(r.title, r.url));
  return singles.length > 0 ? rankResults(query, singles) : [];
}

async function searchCard(query: string, sq: StructuredQuery): Promise<SearchResult[]> {
  const cacheKey = cacheKeyForQuery(query);
  const cached = await cacheGet<SearchResult[]>(cacheKey);
  if (cached) return cached;

  const variants = buildQueryVariants(query).slice(0, MAX_VARIANTS);
  let found: SearchResult[] = [];
  let setResolved = false;

  if (apiEnabled) {
    // Official API: no IP limits, so trying every variant is cheap.
    for (const variant of variants) {
      found = keepSingleCards(query, await apiSearch(variant));
      if (found.length > 0) break;
    }
  } else {
    // Set-code numbers (FB10-059, OP05-119, BT12-001) identify the set by themselves.
    if (isSetCodeNumber(sq.number)) {
      found = await searchViaSetCode(sq);
      setResolved = true; // the code either resolves or the card is genuinely not listed
    }

    // Primary: set listing pages (open, not challenged). Needs game + set.
    if (found.length === 0 && !setResolved) {
      const viaSet = await searchViaSetListing(sq);
      found = viaSet.results;
      setResolved = viaSet.setResolved;
    }

    // No Set given / not mappable: let TCGdex tell us which sets hold this
    // name + number, then scan those listings.
    if (found.length === 0 && !setResolved) {
      found = await searchViaCandidateSets(sq);
      if (found.length > 0) setResolved = true;
    }
  }

  // Google (official Custom Search API), once per lookup, before we touch the
  // challenged search endpoints.
  if (found.length === 0) {
    found = keepSingleCards(query, await searchViaGoogleApi(query));
  }

  if (found.length === 0 && !apiEnabled && !setResolved) {
    // Last resort, only when we couldn't even resolve the set (a full scan of
    // the right set with no hit is a genuine "not found"): the legacy search
    // endpoints. These currently answer with a Cloudflare challenge
    // (403 -> UpstreamError 'blocked') from datacenter IPs.
    try {
      found = await searchViaLegacyEndpoints(query, variants);
    } catch (err) {
      if (err instanceof UpstreamError) {
        // Only the search endpoint is challenged; card and set pages still work.
        // That is a per-card "can't find it this way", not a global block.
        err.searchOnly = true;
        err.hint = 'PriceCharting search is bot-protected. Fill in the card\'s Set (and Card #) so it can be found from the set list instead.';
      }
      throw err;
    }
  }

  await cacheSet(cacheKey, found, found.length > 0 ? TTL_SEARCH : TTL_SEARCH_MISS);
  return found;
}

async function searchViaLegacyEndpoints(query: string, variants: string[]): Promise<SearchResult[]> {
  let found: SearchResult[] = [];
  {
    for (const variant of variants) {
      try {
        // Cheap JSON suggestions first; the full search page only if that misses.
        let results = await searchPriceChartingSuggestions(variant);
        if (results.length === 0) results = await searchPriceChartingPage(variant);
        found = keepSingleCards(query, results);
        if (found.length > 0) break;
      } catch (err) {
        if (err instanceof UpstreamError) throw err; // every further variant would fail too
        // Anything else: try the next variant
      }
    }
  }
  return found;
}


// ───── Grade table parsing ─────

// PriceCharting's card page includes an "additional price points" table with a
// row per grade (Ungraded, Grade 1 … Grade 9.5, PSA 10, etc.). The headline
// chart_data only covers 6 buckets, so this table is the only source for the
// low grades (PSA 1–6). Returns whatever rows it can find.
function parseGradeTable(html: string): Partial<Omit<PriceResult, 'url'>> | null {
  const idx = html.indexOf('>Grade 1<');
  if (idx === -1) return null;
  const start = html.lastIndexOf('<table', idx);
  const end = html.indexOf('</table>', idx);
  if (start === -1 || end === -1) return null;

  const tbl = html.slice(start, end);
  const map: Record<string, number> = {};
  const re = /<td>([^<]+)<\/td>\s*<td class="price[^"]*">\s*\$?([0-9,]+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tbl)) !== null) {
    map[m[1].trim().toLowerCase()] = parseFloat(m[2].replace(/,/g, '')) || 0;
  }
  const g = (k: string): number => map[k] ?? 0;
  return {
    raw: g('ungraded'),
    grade1: g('grade 1'), grade2: g('grade 2'), grade3: g('grade 3'),
    grade4: g('grade 4'), grade5: g('grade 5'), grade6: g('grade 6'),
    grade7: g('grade 7'), grade8: g('grade 8'), grade9: g('grade 9'),
    grade9_5: g('grade 9.5'), psa10: g('psa 10'),
    tag10: g('tag 10'), tag10pristine: g('tag 10 pristine'),
    bgs10: g('bgs 10'), bgs10black: g('bgs 10 black'),
    cgc10pristine: g('cgc 10 pristine'), ace10: g('ace 10'),
  };
}


/** Fetch the card page once and parse every grade we can find (grade table + chart_data). */
async function scrapePageGrades(cardPath: string): Promise<{ url: string; grades: Grades }> {
  const url = cardPath.startsWith('http') ? cardPath : `https://www.pricecharting.com${cardPath}`;
  const resp = await scrapeFetch(url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();
  // A search-products URL redirects to the real card page — keep that.
  const finalUrl = resp.url && /\/game\//.test(resp.url) ? resp.url : url;

  const table = parseGradeTable(html);

  let chart: Partial<Grades> = {};
  const chartMatch = html.match(/VGPC\.chart_data\s*=\s*(\{[\s\S]*?\});/);
  if (chartMatch) {
    try {
      const data = JSON.parse(chartMatch[1]);
      const getLatest = (arr: number[][] | undefined): number => {
        if (!arr || arr.length === 0) return 0;
        const last = arr[arr.length - 1];
        return last ? last[1] / 100 : 0; // cents → dollars
      };
      chart = {
        raw: getLatest(data.used),
        grade7: getLatest(data.cib),
        grade8: getLatest(data.new),
        grade9: getLatest(data.graded),
        grade9_5: getLatest(data.boxonly),
        psa10: getLatest(data.manualonly),
      };
    } catch { /* fall through to table / regex */ }
  }

  if (!table && !chartMatch) {
    const { url: _u, ...grades } = extractTablePrices(html, finalUrl);
    return { url: finalUrl, grades };
  }

  const grades = { ...EMPTY_GRADES };
  for (const key of Object.keys(grades) as (keyof Grades)[]) {
    grades[key] = (table?.[key] || chart[key] || 0) as number;
  }
  return { url: finalUrl, grades };
}

async function fetchPrices(match: SearchResult): Promise<PriceResult> {
  const cacheKey = cacheKeyForPrices(match.id ? `api:${match.id}` : match.url);
  const cached = await cacheGet<PriceResult>(cacheKey);
  if (cached) return cached;

  let result: PriceResult;

  if (apiEnabled && match.id) {
    const api = await apiPrices(match.id);
    if (!api) throw new Error(`PriceCharting API returned no prices for product ${match.id}`);
    result = { ...EMPTY_GRADES, ...api, url: `https://www.pricecharting.com${match.url}` };

    // PSA 1–6 + premium 10s: opt-in page scrape, best effort — never fail the lookup.
    if (API_SCRAPE_GRADES) {
      try {
        const page = await scrapePageGrades(match.url);
        result.url = page.url;
        for (const key of Object.keys(EMPTY_GRADES) as (keyof Grades)[]) {
          if (!result[key] && page.grades[key]) result[key] = page.grades[key];
        }
      } catch { /* API prices are still good */ }
    }
  } else {
    const page = await scrapePageGrades(match.url);
    result = { ...page.grades, url: page.url };
  }

  await cacheSet(cacheKey, result, TTL_PRICES);
  return result;
}

// ───── Fallback: extract from HTML table ─────

function extractTablePrices(html: string, url: string): PriceResult {
  const pricePattern = /\$([0-9,]+(?:\.[0-9]{2})?)/g;
  const prices: number[] = [];
  let m;
  while ((m = pricePattern.exec(html)) !== null && prices.length < 20) {
    prices.push(parseFloat(m[1].replace(/,/g, '')));
  }

  return {
    raw: prices[0] ?? 0,
    grade1: 0, grade2: 0, grade3: 0, grade4: 0, grade5: 0, grade6: 0,
    grade7: prices[1] ?? 0,
    grade8: prices[2] ?? 0,
    grade9: prices[3] ?? 0,
    grade9_5: prices[4] ?? 0,
    psa10: prices[5] ?? 0,
    tag10: 0, tag10pristine: 0, bgs10: 0, bgs10black: 0, cgc10pristine: 0, ace10: 0,
    url,
  };
}

// ───── API Handler ─────

function setEdgeCache(res: VercelResponse, maxAge: number) {
  // Vercel's CDN caches function GET responses that carry s-maxage — repeat
  // lookups for the same query never reach this function, let alone PriceCharting.
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
}

function sendUpstreamError(res: VercelResponse, err: UpstreamError) {
  res.setHeader('Cache-Control', 'no-store');
  if (err.searchOnly) {
    // Deterministic per-card miss: report as not found (no retry, no batch stop).
    return res.status(404).json({
      error: `No match. ${err.hint ?? 'PriceCharting search is bot-protected; add the card\'s Set.'}`,
      kind: 'search-blocked',
    });
  }
  res.setHeader('Retry-After', String(err.retryAfter));
  const base = err.kind === 'rate-limited'
    ? `PriceCharting is rate limiting us right now. Please wait ${err.retryAfter}s and try again.`
    : `PriceCharting blocked the request (bot protection, HTTP ${err.status}). Please wait a minute and try again.`;
  const message = err.hint ? `${base} ${err.hint}` : base;
  return res.status(429).json({ error: message, kind: err.kind, host: err.host, retryAfter: err.retryAfter });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, path, mode } = req.query;

  try {
    // Mode 1: Direct price fetch from a known card path / URL
    if (mode === 'prices' && typeof path === 'string') {
      const prices = await fetchPrices({ url: path, title: '' });
      setEdgeCache(res, EDGE_MAX_AGE);
      return res.status(200).json(prices);
    }

    // Mode 2: Search for cards
    if (typeof q === 'string' && q.trim()) {
      const results = await searchCard(q.trim(), structuredFromParams(req.query, q.trim()));

      if (mode === 'search') {
        setEdgeCache(res, results.length > 0 ? EDGE_MAX_AGE : EDGE_MISS_MAX_AGE);
        return res.status(200).json({ results });
      }

      if (results.length === 0) {
        setEdgeCache(res, EDGE_MISS_MAX_AGE);
        return res.status(404).json({ error: 'No cards found', query: q });
      }

      const prices = await fetchPrices(results[0]);
      setEdgeCache(res, EDGE_MAX_AGE);
      return res.status(200).json({
        ...prices,
        matchedTitle: results[0].title,
        allResults: results.slice(0, 5).map(({ title, url }) => ({ title, url })),
        source: apiEnabled ? 'api' : 'scrape',
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'Missing query parameter: q or path' });
  } catch (err: unknown) {
    if (err instanceof UpstreamError) return sendUpstreamError(res, err);
    res.setHeader('Cache-Control', 'no-store');
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
