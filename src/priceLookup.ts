import type { GradingCard, GradeNumber } from './types';

// ───── Types ─────

export interface PriceLookupResult {
  raw: number;
  grade7: number;
  grade8: number;
  grade9: number;
  grade9_5: number;
  psa10: number;
  url: string;
  matchedTitle?: string;
  allResults?: { title: string; url: string }[];
}

export interface LookupStatus {
  cardId: string;
  status: 'pending' | 'loading' | 'done' | 'error' | 'not-found';
  result?: PriceLookupResult;
  error?: string;
}

// ───── API Base URL ─────
// In development, Vercel dev serves API routes from the same origin.
// In production, the API is at the same domain.
// For local dev without Vercel, we fall back to a CORS proxy approach.

function getApiBase(): string {
  // If running on Vercel (production or preview), API is same origin
  if (window.location.hostname.includes('vercel.app') || window.location.hostname === 'localhost') {
    return '';
  }
  // GitHub Pages or other static hosts can't call /api directly
  // User would need to set a custom API URL in that case
  return localStorage.getItem('gc_api_base') || '';
}

// ───── Rate Limiter ─────
// PriceCharting is polite at ~1 req/sec. We use 1.2s gap to be safe.

class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private delayMs: number;

  constructor(delayMs = 1200) {
    this.delayMs = delayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
    }

    this.running = false;
  }

  clear() {
    this.queue = [];
  }
}

const limiter = new RateLimiter(2000);

// ───── Language Detection ─────
// Detect card language from name using Unicode script ranges and explicit codes

const KNOWN_LANG_CODES = new Set(['EN', 'JP', 'KR', 'CN', 'DE', 'FR', 'IT', 'ES', 'PT', 'NL', 'PL', 'RU', 'TH', 'ID']);

export function detectLanguage(name: string): string {
  if (!name) return 'EN';

  // Explicit (XX) code takes highest priority
  const matches = [...name.matchAll(/\(([A-Z]{2,3})\)/g)];
  for (const m of [...matches].reverse()) {
    if (KNOWN_LANG_CODES.has(m[1])) return m[1];
  }

  // Hiragana or Katakana → Japanese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(name)) return 'JP';
  // Hangul → Korean
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(name)) return 'KR';
  // CJK ideographs without kana → Chinese
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(name)) return 'CN';

  return 'EN';
}

// ───── Query Builder ─────
// Build the best search query from card data

function buildQuery(card: GradingCard): string {
  const parts: string[] = [];

  // Card name is most important — preserve parenthetical info like (Full Art), (JP)
  if (card.cardName) {
    const name = card.cardName.replace(/\s+/g, ' ').trim();
    parts.push(name);
  }

  // Card number helps disambiguate
  if (card.cardNumber) {
    parts.push(card.cardNumber);
  }

  // Set name for context
  if (card.set) {
    parts.push(card.set);
  }

  // Card game helps disambiguate on PriceCharting (e.g. "pokemon" prefix)
  if (card.cardGame) {
    // PriceCharting uses simplified game names
    const gameMap: Record<string, string> = {
      'Pokémon': 'pokemon',
      'Magic: The Gathering': 'magic the gathering',
      'Yu-Gi-Oh!': 'yugioh',
    };
    const mapped = gameMap[card.cardGame];
    if (mapped) parts.unshift(mapped);
  }

  // Include language keyword for non-English cards so PriceCharting returns
  // results from the correct language category (e.g. pokemon-japanese-*)
  const lang = card.language || detectLanguage(card.cardName);
  if (lang && lang !== 'EN') {
    const langWordMap: Record<string, string> = {
      JP: 'japanese',
      KR: 'korean',
      CN: 'chinese',
      DE: 'german',
      FR: 'french',
      IT: 'italian',
      ES: 'spanish',
      PT: 'portuguese',
    };
    const langWord = langWordMap[lang];
    // Insert language after game prefix (index 1) so query is e.g. "pokemon japanese Kingdra ex #131"
    if (langWord) parts.splice(1, 0, langWord);
  }

  return parts.join(' ');
}

// ───── Single Card Lookup ─────

export async function lookupCard(card: GradingCard): Promise<PriceLookupResult> {
  const query = buildQuery(card);
  if (!query) throw new Error('No card name to search for');

  const apiBase = getApiBase();
  const url = `${apiBase}/api/price-lookup?q=${encodeURIComponent(query)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `Lookup failed: ${resp.status}`);
  }

  return resp.json();
}

// ───── Apply Prices to Card ─────

export function applyPricesToCard(
  card: GradingCard,
  prices: PriceLookupResult,
): Partial<GradingCard> {
  const gradeValues: Partial<Record<GradeNumber, number>> = { ...card.gradeValues };

  // Only fill in values that are > 0 from PriceCharting
  // and don't overwrite user-entered values unless they're 0
  if (prices.raw > 0 && !card.rawPrice) {
    // rawPrice field
  }
  if (prices.grade9 > 0) gradeValues[9] = prices.grade9;
  if (prices.psa10 > 0) gradeValues[10] = prices.psa10;
  if (prices.grade9_5 > 0) gradeValues[9.5] = prices.grade9_5;
  if (prices.grade8 > 0) gradeValues[8] = prices.grade8;
  if (prices.grade7 > 0) gradeValues[7] = prices.grade7;

  return {
    rawPrice: prices.raw > 0 ? prices.raw : card.rawPrice,
    gradeValues,
  };
}

// ───── Batch Lookup with Rate Limiting ─────

export async function lookupBatch(
  cards: GradingCard[],
  onProgress: (status: LookupStatus) => void,
): Promise<void> {
  // Clear any pending lookups
  limiter.clear();

  for (const card of cards) {
    if (!card.cardName) {
      onProgress({ cardId: card.id, status: 'error', error: 'No card name' });
      continue;
    }

    onProgress({ cardId: card.id, status: 'loading' });

    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        const result = await limiter.enqueue(() => lookupCard(card));

        if (result.raw === 0 && result.grade9 === 0 && result.psa10 === 0) {
          onProgress({ cardId: card.id, status: 'not-found', result });
        } else {
          onProgress({ cardId: card.id, status: 'done', result });
        }
        break; // success — exit retry loop
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Lookup failed';

        // If rate limited, pause and retry
        if (message.includes('429') || message.includes('Rate limit')) {
          retries++;
          if (retries <= maxRetries) {
            // Exponential backoff: 5s, 10s
            await new Promise((r) => setTimeout(r, 5000 * retries));
            continue;
          }
        }

        onProgress({ cardId: card.id, status: 'error', error: message });
        break;
      }
    }
  }
}

// ───── Fetch from specific PriceCharting URL ─────

export async function lookupByPath(path: string): Promise<PriceLookupResult> {
  const apiBase = getApiBase();
  const url = `${apiBase}/api/price-lookup?mode=prices&path=${encodeURIComponent(path)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `Lookup failed: ${resp.status}`);
  }

  return resp.json();
}
