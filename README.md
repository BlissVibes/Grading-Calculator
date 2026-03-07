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

The serverless API (`/api/price-lookup`) automatically handles PriceCharting scraping on deployment.

## Development

```bash
npm install
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build locally
```
