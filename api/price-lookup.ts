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

// ───── Search via PriceCharting directly ─────

async function searchPriceCharting(query: string): Promise<SearchResult[]> {
  const url = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!resp.ok) return [];
  const html = await resp.text();

  const results: SearchResult[] = [];
  const re = /<td\s+class="title">\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({
      url: m[1],
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
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

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

// ───── Combined search: PriceCharting first, Google fallback ─────

async function searchCard(query: string): Promise<SearchResult[]> {
  // Try PriceCharting directly first
  let results = await searchPriceCharting(query);

  // If PriceCharting search failed, use Google as fallback
  if (results.length === 0) {
    results = await searchViaGoogle(query);
  }

  return results;
}

// ───── Fetch prices from a card detail page ─────

async function fetchPrices(cardPath: string): Promise<PriceResult> {
  // Handle both full URLs and paths
  const url = cardPath.startsWith('http')
    ? cardPath
    : `https://www.pricecharting.com${cardPath}`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
