# Grading Calculator

A web app to calculate grading profits, fees & upcharges for PSA, TAG, Beckett, ARS, and CGC. Includes automatic price lookup from PriceCharting.

## Features

- **Profit Calculator**: Calculate ROI and multipliers for graded cards
- **Multi-Company Support**: Compare fees/upcharges across PSA, TAG, Beckett, ARS, CGC
- **CSV Import**: Import card lists from spreadsheets
- **Price Lookup**: Auto-fetch raw and graded prices from PriceCharting
- **Dark Mode**: Toggle between light and dark themes
- **Local Storage**: All data saved to your browser

## Deployment (Vercel)

### Prerequisites
- Vercel account (free at vercel.com)
- Git repository

### Deploy

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy from the project directory:
   ```bash
   vercel
   ```

3. Follow the prompts and link to your GitHub repo for automatic deployments

The serverless API (`/api/price-lookup`) handles PriceCharting lookups on deployment.
It works with no configuration (scraping mode). PriceCharting's search endpoint is
behind a Cloudflare bot challenge for datacenter IPs (HTTP 403), but card pages,
set listings (`/console/<set>`) and the category index stay open, so scraping mode
resolves the card's **Set** to its listing page and finds the card there. Cards
need a Set (and ideally a Card #) to be found; without a Set the function falls
back to the challenged search endpoint (or Google, if configured). The following
optional environment variables (set them on the Vercel project) make it more
robust. All are optional and can be combined.

| Variable | Effect |
| --- | --- |
| `PRICECHARTING_API_TOKEN` | Use the official PriceCharting API (token-authenticated, not subject to the IP-based scraping limits). Search + headline grades (Ungraded, 7, 8, 9, 9.5, PSA 10, BGS 10) come from the API and no page is scraped. |
| `PRICECHARTING_API_SCRAPE_GRADES` | `1` to additionally scrape the card page once (cached) in API mode for PSA 1-6 and the premium 10s (Black Label, CGC/TAG Pristine, ACE). Off by default because that one request still carries the 403 risk. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared cache (search results 7 days, prices 12 hours) plus a global 1 request/second limiter across all function instances. Vercel KV's `KV_REST_API_URL` / `KV_REST_API_TOKEN` are accepted too. |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | Google Custom Search JSON API as the last-resort search fallback (a Programmable Search Engine restricted to `pricecharting.com`). Runs once per lookup, only when PriceCharting search finds nothing. 100 queries/day are free. |

Successful responses also carry `Cache-Control: s-maxage`, so Vercel's edge serves
repeat lookups without invoking the function at all.

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build locally
```
