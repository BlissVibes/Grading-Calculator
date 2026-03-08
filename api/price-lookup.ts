import type { VercelRequest, VercelResponse } from '@vercel/node';

// ───── Types ─────

interface PriceResult {
  raw: number;
  grade7: number;
  grade8: number;
  grade9: number;
  grade9_5: number;
  psa10: number;
  url: string;
}

interface SearchResult {
  title: string;
  url: string;
}

// ───── Rate-limit / block detection ─────

class RateLimitError extends Error {
  constructor(status: number) {
    super(`Rate limited (${status})`);
    this.name = 'RateLimitError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Simple server-side delay between external requests
let lastFetchTime = 0;
const MIN_FETCH_GAP_MS = 800; // 800ms between requests to PriceCharting

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_FETCH_GAP_MS) {
    await sleep(MIN_FETCH_GAP_MS - elapsed);
  }
  lastFetchTime = Date.now();

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Detect rate limiting / blocking — propagate so we stop retrying
  if (resp.status === 403 || resp.status === 429 || resp.status === 503) {
    throw new RateLimitError(resp.status);
  }

  return resp;
}

// ───── Search via PriceCharting directly ─────

async function searchPriceCharting(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
  const resp = await throttledFetch(url);

  if (!resp.ok) return [];
  const html = await resp.text();

  const results: SearchResult[] = [];
  const re = /<td\s+class="title">\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    // Decode HTML entities in the URL (e.g. &amp; → &) so the path is valid
    const decodedUrl = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    results.push({
      url: decodedUrl,
      title: m[2].trim(),
    });
  }

  return results;
}

// ───── Fallback: Search via Google ─────
// Google search with "site:pricecharting.com" reliably finds the right card

async function searchViaGoogle(query: string): Promise<SearchResult[]> {
  const googleQuery = `site:pricecharting.com ${query}`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}&num=5`;
  const resp = await throttledFetch(url);

  if (!resp.ok) return [];
  const html = await resp.text();

  // Extract PriceCharting URLs from Google results
  // Google wraps links in <a href="/url?q=https://www.pricecharting.com/...&...">
  const results: SearchResult[] = [];
  const re = /href="\/url\?q=(https?:\/\/www\.pricecharting\.com\/game\/[^&"]+)[&"]/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const fullUrl = decodeURIComponent(m[1]);
    // Extract path from full URL
    const path = fullUrl.replace('https://www.pricecharting.com', '');
    // Build a title from the path: /game/pokemon-base-set/charizard → charizard
    const segments = path.split('/');
    const title = segments[segments.length - 1]
      ?.replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

    // Skip duplicate URLs
    if (!results.some((r) => r.url === path)) {
      results.push({ url: path, title });
    }
  }

  // Also try matching direct hrefs to pricecharting.com (some Google formats)
  if (results.length === 0) {
    const re2 = /href="(https?:\/\/www\.pricecharting\.com\/game\/[^"]+)"/gi;
    while ((m = re2.exec(html)) !== null) {
      const fullUrl = decodeURIComponent(m[1]);
      const path = fullUrl.replace('https://www.pricecharting.com', '');
      const segments = path.split('/');
      const title = segments[segments.length - 1]
        ?.replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

      if (!results.some((r) => r.url === path)) {
        results.push({ url: path, title });
      }
    }
  }

  return results;
}

// ───── Relevance Scoring ─────
// Score how well a search result title matches the original query

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
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
const SEALED_KEYWORDS = ['pack', 'booster', 'box', 'collection', 'tin', 'bundle', 'deck', 'set box', 'promo pack'];

function looksLikeSealed(title: string): boolean {
  const t = title.toLowerCase();
  if (SEALED_KEYWORDS.some((kw) => t.includes(kw))) return true;
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

function scoreResult(query: string, resultTitle: string): number {
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
  const cardNamePart = qTokens.filter((t) => !/^\d+$/.test(t) && !['pokemon', 'magic', 'yugioh', 'the', 'gathering', 'japanese', 'korean', 'chinese'].includes(t));
  const cardNameStr = cardNamePart.join(' ');
  if (cardNameStr && tNorm.includes(cardNameStr)) {
    score += 20; // card name appears as substring in title
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
        score -= 80;  // WRONG card number (e.g. #271 vs #002)
      }
    }
    // No number in result title at all — mild penalty
    // (some PriceCharting titles omit the number)
    else {
      score -= 10;
    }

    // Sealed product penalty on top of number mismatch
    if (looksLikeSealed(resultTitle)) {
      score -= 50;
    }
  } else if (looksLikeSealed(resultTitle)) {
    // Even without a card number, slightly penalise sealed products
    score -= 15;
  }

  return score;
}

function rankResults(query: string, results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;

  return [...results].sort((a, b) => {
    // Score against title AND URL slug (PriceCharting URLs contain the card identifier)
    const slugA = a.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const slugB = b.url.split('/').pop()?.replace(/-/g, ' ') ?? '';
    const scoreA = Math.max(scoreResult(query, a.title), scoreResult(query, slugA));
    const scoreB = Math.max(scoreResult(query, b.title), scoreResult(query, slugB));
    return scoreB - scoreA;
  });
}

// ───── Query Variants ─────
// Generate alternative queries if the original doesn't match

function buildQueryVariants(query: string): string[] {
  const variants: string[] = [query];
  const lower = query.toLowerCase();

  // ── Card number formats: "008/025", "#131", "131/200" ──
  // PriceCharting often chokes on "008/025" — try without the /setSize part
  const withoutSlashPart = query.replace(/\b(\d{1,4})\/\d{1,4}\b/g, '$1');
  if (withoutSlashPart !== query) {
    variants.push(withoutSlashPart); // "Surfing Pikachu 008 [set]" instead of "008/025"
  }

  // Strip game name prefix for a simpler query
  const stripped = query.replace(/^(pokemon|magic the gathering|yugioh)\s+/i, '');
  if (stripped !== query) variants.push(stripped);

  // "Mega X ex" → "M X-EX" (PriceCharting naming)
  if (/\bmega\b/i.test(lower)) {
    variants.push(query.replace(/\bmega\s+/i, 'M ').replace(/\bex\b/i, 'EX'));
  }

  // "VMAX" → "V-MAX" variant
  if (/\bvmax\b/i.test(lower)) {
    variants.push(query.replace(/\bVMAX\b/gi, 'V-MAX'));
  }

  // "VSTAR" → "V-STAR" variant
  if (/\bvstar\b/i.test(lower)) {
    variants.push(query.replace(/\bVSTAR\b/gi, 'V-STAR'));
  }

  // Try without apostrophes: "Team Rocket's" → "Team Rockets"
  if (query.includes("'") || query.includes('\u2019')) {
    variants.push(query.replace(/['\u2019]/g, ''));
  }

  // Try with simplified name: drop parenthetical and card numbers (anywhere in query)
  const simplified = query
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*#?\d{1,4}(?:\/\d{1,4})?\s*/g, ' ')  // strip card numbers anywhere
    .replace(/\s+/g, ' ')
    .trim();
  if (simplified !== query && simplified.length > 2) {
    variants.push(simplified);
  }

  // Deduplicate
  return [...new Set(variants)];
}

// ───── Combined search: PriceCharting first, Google fallback, with retries ─────

async function searchCard(query: string): Promise<SearchResult[]> {
  const variants = buildQueryVariants(query);

  for (const variant of variants) {
    try {
      // Try PriceCharting directly first
      let results = await searchPriceCharting(variant);

      // If PriceCharting search failed, use Google as fallback
      if (results.length === 0) {
        results = await searchViaGoogle(variant);
      }

      if (results.length > 0) {
        // Rank results by relevance to the ORIGINAL query
        return rankResults(query, results);
      }
    } catch (err) {
      // If rate-limited, stop trying more variants — they'll all fail
      if (err instanceof RateLimitError) throw err;
      // Other errors: try next variant
    }
  }

  return [];
}

// ───── Fetch prices from a card detail page ─────

async function fetchPrices(cardPath: string): Promise<PriceResult> {
  // Handle both full URLs and paths
  const url = cardPath.startsWith('http')
    ? cardPath
    : `https://www.pricecharting.com${cardPath}`;

  const resp = await throttledFetch(url);

  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();

  // Extract VGPC.chart_data JSON from the page
  const chartMatch = html.match(/VGPC\.chart_data\s*=\s*(\{[\s\S]*?\});/);
  if (!chartMatch) {
    return extractTablePrices(html, url);
  }

  try {
    const data = JSON.parse(chartMatch[1]);

    const getLatest = (arr: number[][] | undefined): number => {
      if (!arr || arr.length === 0) return 0;
      const last = arr[arr.length - 1];
      return last ? last[1] / 100 : 0; // cents → dollars
    };

    return {
      raw: getLatest(data.used),
      grade7: getLatest(data.cib),
      grade8: getLatest(data.new),
      grade9: getLatest(data.graded),
      grade9_5: getLatest(data.boxonly),
      psa10: getLatest(data.manualonly),
      url,
    };
  } catch {
    return extractTablePrices(html, url);
  }
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
    grade7: prices[1] ?? 0,
    grade8: prices[2] ?? 0,
    grade9: prices[3] ?? 0,
    grade9_5: prices[4] ?? 0,
    psa10: prices[5] ?? 0,
    url,
  };
}

// ───── API Handler ─────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, path, mode } = req.query;

  try {
    // Mode 1: Direct price fetch from a known card path
    if (mode === 'prices' && typeof path === 'string') {
      const prices = await fetchPrices(path);
      return res.status(200).json(prices);
    }

    // Mode 2: Search for cards
    if (typeof q === 'string' && q.trim()) {
      const results = await searchCard(q.trim());

      if (mode === 'search') {
        return res.status(200).json({ results });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'No cards found', query: q });
      }

      const prices = await fetchPrices(results[0].url);
      return res.status(200).json({
        ...prices,
        matchedTitle: results[0].title,
        allResults: results.slice(0, 5),
      });
    }

    return res.status(400).json({ error: 'Missing query parameter: q or path' });
  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      return res.status(429).json({ error: 'Rate limited by PriceCharting. Please wait a moment and try again.' });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
