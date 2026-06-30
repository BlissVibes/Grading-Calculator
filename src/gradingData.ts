import type { CompanyFeeStructure } from './types';

// ───── PSA Fee Structure ─────
// Source: PSA official pricing, effective February 2026.
// NOTE: PSA does NOT charge a flat additive "upcharge". Instead, the service
// level is gated by the card's value: if a card's post-grade value exceeds the
// value cap of the tier it was submitted under, PSA re-tiers it and you pay the
// DIFFERENCE in price between tiers. That tier-bump upcharge is computed in
// gradingCalculator (estimatePsaUpcharge / per-grade upcharge), so the
// valueUpcharges array below is intentionally zeroed for PSA.

export const PSA_FEES: CompanyFeeStructure = {
  company: 'PSA',
  serviceLevels: [
    {
      id: 'value-bulk',
      name: 'Value Bulk',
      baseFee: 24.99,
      turnaround: '95 business days',
      minCards: 20,
      maxDeclaredValue: 500,
    },
    {
      id: 'value',
      name: 'Value',
      baseFee: 32.99,
      turnaround: '75 business days',
      maxDeclaredValue: 500,
    },
    {
      id: 'value-plus',
      name: 'Value Plus',
      baseFee: 49.99,
      turnaround: '45 business days',
      maxDeclaredValue: 500,
    },
    {
      id: 'value-max',
      name: 'Value Max',
      baseFee: 64.99,
      turnaround: '30 business days',
      maxDeclaredValue: 1000,
    },
    {
      id: 'regular',
      name: 'Regular',
      baseFee: 79.99,
      turnaround: '20 business days',
      maxDeclaredValue: 1500,
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 149,
      turnaround: '15 business days',
      maxDeclaredValue: 2500,
    },
    {
      id: 'super-express',
      name: 'Super Express',
      baseFee: 299,
      turnaround: '7 business days',
      maxDeclaredValue: 5000,
    },
    {
      id: 'walk-through',
      name: 'Walk Through',
      baseFee: 599,
      turnaround: '7 business days',
      maxDeclaredValue: 10000,
    },
  ],
  // PSA upcharges are tier-bumps, not flat fees — see note above. Zeroed here.
  valueUpcharges: [
    { minValue: 0, maxValue: null, fee: 0 },
  ],
  shippingEstimate: 15,
  pricingUrl: 'https://www.psacard.com/services/tradingcardgrading',
};

// Tiers PSA actually re-bills a card to when its value exceeds the submitted
// tier's cap. Excludes the club-only "Value Bulk" discount — a re-tier always
// lands on the cheapest STANDARD tier whose cap covers the value. Ordered by cap.
export const PSA_RETIER_LADDER: { id: string; name: string; baseFee: number; maxValue: number }[] = [
  { id: 'value', name: 'Value', baseFee: 32.99, maxValue: 500 },
  { id: 'value-max', name: 'Value Max', baseFee: 64.99, maxValue: 1000 },
  { id: 'regular', name: 'Regular', baseFee: 79.99, maxValue: 1500 },
  { id: 'express', name: 'Express', baseFee: 149, maxValue: 2500 },
  { id: 'super-express', name: 'Super Express', baseFee: 299, maxValue: 5000 },
  { id: 'walk-through', name: 'Walk Through', baseFee: 599, maxValue: 10000 },
];

// ───── TAG Fee Structure ─────
// Technical Authentication & Grading

export const TAG_FEES: CompanyFeeStructure = {
  company: 'TAG',
  serviceLevels: [
    {
      id: 'basic',
      name: 'Basic',
      baseFee: 22,
      turnaround: '45+ business days',
      minCards: 10,
    },
    {
      id: 'standard',
      name: 'Standard',
      baseFee: 39,
      turnaround: '30 business days',
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 59,
      turnaround: '15 business days',
    },
    {
      id: 'priority',
      name: 'Priority',
      baseFee: 149,
      turnaround: '5 business days',
    },
    {
      id: 'walk-through',
      name: 'Walkthrough',
      baseFee: 299,
      turnaround: '2-3 business days',
      maxDeclaredValue: 5000,
    },
  ],
  // TAG prices by service tier only — no separate value-based upcharges.
  valueUpcharges: [
    { minValue: 0, maxValue: null, fee: 0 },
  ],
  shippingEstimate: 12,
  pricingUrl: 'https://taggrading.com/pages/pricing',
};

// ───── Beckett (BGS/BVG) Fee Structure ─────

export const BECKETT_FEES: CompanyFeeStructure = {
  company: 'Beckett',
  serviceLevels: [
    {
      id: 'economy',
      name: 'Economy',
      baseFee: 20,
      turnaround: '60-120+ business days',
      maxDeclaredValue: 499,
    },
    {
      id: 'standard',
      name: 'Standard',
      baseFee: 50,
      turnaround: '30-60 business days',
      maxDeclaredValue: 999,
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 100,
      turnaround: '15-25 business days',
      maxDeclaredValue: 4999,
    },
    {
      id: 'rush',
      name: 'Rush',
      baseFee: 150,
      turnaround: '5-10 business days',
      maxDeclaredValue: 9999,
    },
    {
      id: 'premium',
      name: 'Premium',
      baseFee: 250,
      turnaround: '1-5 business days',
      maxDeclaredValue: 24999,
    },
  ],
  // BGS prices by service tier; declared value sets the minimum tier (cards are
  // reclassified upward if value exceeds the cap) rather than a flat add-on.
  valueUpcharges: [
    { minValue: 0, maxValue: null, fee: 0 },
  ],
  shippingEstimate: 15,
  pricingUrl: 'https://www.beckett.com/grading/card-grading-pricing',
};

// ───── ARS (Authentic Restoration & Sealing) Fee Structure ─────

export const ARS_FEES: CompanyFeeStructure = {
  company: 'ARS',
  serviceLevels: [
    {
      id: 'bulk',
      name: 'Bulk',
      baseFee: 15,
      turnaround: '90+ business days',
      minCards: 25,
      maxDeclaredValue: 499,
    },
    {
      id: 'standard',
      name: 'Standard',
      baseFee: 25,
      turnaround: '45 business days',
      maxDeclaredValue: 499,
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 50,
      turnaround: '15 business days',
      maxDeclaredValue: 999,
    },
    {
      id: 'premium',
      name: 'Premium',
      baseFee: 100,
      turnaround: '5 business days',
      maxDeclaredValue: 2499,
    },
  ],
  valueUpcharges: [
    { minValue: 0, maxValue: 499, fee: 0 },
    { minValue: 500, maxValue: 999, fee: 30 },
    { minValue: 1000, maxValue: 2499, fee: 60 },
    { minValue: 2500, maxValue: null, fee: 100 },
  ],
  shippingEstimate: 12,
  pricingUrl: 'https://www.arsgrading.com/pricing',
};

// ───── CGC Fee Structure ─────

export const CGC_FEES: CompanyFeeStructure = {
  company: 'CGC',
  serviceLevels: [
    {
      id: 'bulk',
      name: 'Bulk',
      baseFee: 17,
      turnaround: '120 business days',
      minCards: 25,
      maxDeclaredValue: 500,
    },
    {
      id: 'economy',
      name: 'Economy',
      baseFee: 20,
      turnaround: '65 business days',
      maxDeclaredValue: 1000,
    },
    {
      id: 'standard',
      name: 'Standard',
      baseFee: 55,
      turnaround: '10 business days',
      maxDeclaredValue: 3000,
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 100,
      turnaround: '5 business days',
      maxDeclaredValue: 10000,
    },
    {
      id: 'walk-through',
      name: 'Walk Through',
      baseFee: 300,
      turnaround: '2 business days',
      maxDeclaredValue: 100000,
    },
  ],
  // CGC prices by tier; declared value sets the minimum tier rather than a flat
  // add-on. (Above $100k, the Unlimited Value tier is $300 + 1% of FMV.)
  valueUpcharges: [
    { minValue: 0, maxValue: null, fee: 0 },
  ],
  shippingEstimate: 14,
  pricingUrl: 'https://www.cgccards.com/submit/services-fees/cgc-grading/',
};

// ───── PSG (Premier Card Grading) Fee Structure ─────
// Source: premiercardgrading.com/pages/pricing-services (2026). Flat per-card
// pricing with no value-based upcharges — only insurance caps differ by tier.
// (Authentication, $12.95, is excluded: it certifies altered/signed cards
// rather than assigning a numeric grade.)

export const PSG_FEES: CompanyFeeStructure = {
  company: 'PSG',
  serviceLevels: [
    {
      id: 'bulk',
      name: 'Bulk 50+',
      baseFee: 14.95,
      turnaround: '8–12 weeks',
      minCards: 50,
      maxDeclaredValue: 250,
    },
    {
      id: 'standard',
      name: 'Standard',
      baseFee: 19.95,
      turnaround: '4–6 weeks',
      maxDeclaredValue: 250,
    },
    {
      id: 'express',
      name: 'Express',
      baseFee: 49.95,
      turnaround: '7–10 business days',
      maxDeclaredValue: 10000,
    },
  ],
  // PSG has no value-based upcharges — flat fee regardless of card value.
  valueUpcharges: [
    { minValue: 0, maxValue: null, fee: 0 },
  ],
  pricingUrl: 'https://premiercardgrading.com/pages/pricing-services',
};

// ───── All companies map ─────

import type { GradingCompany } from './types';

export const COMPANY_FEES: Record<GradingCompany, CompanyFeeStructure> = {
  PSA: PSA_FEES,
  TAG: TAG_FEES,
  Beckett: BECKETT_FEES,
  ARS: ARS_FEES,
  CGC: CGC_FEES,
  PSG: PSG_FEES,
};
