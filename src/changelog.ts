// ───── Changelog ─────
// Human-readable history of notable changes. Newest first. Times are local to
// when the change was committed. Add a new entry at the top of CHANGELOG with
// each release/merge.

export interface ChangeItem {
  time?: string;   // e.g. "19:01" — optional clock time
  text: string;
}

export interface ChangelogRelease {
  version?: string;   // app version this shipped under, if tagged
  date: string;       // display date, e.g. "June 29, 2026"
  items: ChangeItem[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '1.4.0.2',
    date: 'June 30, 2026',
    items: [
      { text: 'Removed the "owed now at raw value" line from the Upcharges box — upcharges are always assessed on the graded value, so the raw-value figure was misleading.' },
    ],
  },
  {
    version: '1.4.0.1',
    date: 'June 30, 2026',
    items: [
      { text: 'Added a "Raw Card Cost" bubble to the summary header showing how much raw card cost is being deducted from profit. It has a "Remove from profit" checkbox (on by default) — uncheck it to see the grading profit without the cost of the raw cards.' },
    ],
  },
  {
    version: '1.4.0.0',
    date: 'June 30, 2026',
    items: [
      { text: 'Version 1.4 — a cleanup-and-polish milestone rolling up the recent UI work: the split summary bubbles (Submission Fees / Upcharges / Total Grading Charges), 2026 grader fees, the "Custom $" toolbar price, the unified dollar steppers with theme-aware arrows, and the PKC stamp fix.' },
      { text: 'Multiplier badges now have a silver tier: over 5x shows a brushed-silver plaque, over 10x the gold plaque, and over 20x the cosmos badge.' },
    ],
  },
  {
    version: '0.1.3.6.15',
    date: 'June 30, 2026',
    items: [
      { text: 'Moved the quantity stepper arrows flush against the number box.' },
    ],
  },
  {
    version: '0.1.3.6.14',
    date: 'June 30, 2026',
    items: [
      { text: 'Stepper arrows now adapt to the theme: dark mode uses a dark-purple button with a near-white arrow, while light mode keeps the light-purple button with a dark-purple arrow.' },
    ],
  },
  {
    version: '0.1.3.6.13',
    date: 'June 30, 2026',
    items: [
      { text: 'Tightened the quantity stepper: smaller up/down arrows sitting closer to the number.' },
    ],
  },
  {
    version: '0.1.3.6.12',
    date: 'June 30, 2026',
    items: [
      { text: 'Every dollar field (price paid, raw price, each grade-price column, the expected price, and custom grading prices) now uses the same up/down arrow buttons as the quantity stepper instead of the browser\'s native spinner.' },
      { text: 'On those dollar fields the arrows stay hidden until you click into the box, and clicking them jumps the value to the nearest whole dollar. The quantity column keeps its always-visible stepper.' },
      { text: 'The browser\'s default number-spinner arrows are now hidden on every numeric field across the site.' },
    ],
  },
  {
    version: '0.1.3.6.11',
    date: 'June 30, 2026',
    items: [
      { text: 'Clarified the Upcharges box: the headline now reads "at expected grade", and the secondary line is labelled "owed now at raw value" so it\'s clear it\'s the upcharge based on the card\'s current ungraded value (often $0) versus the projected upcharge once it grades up.' },
    ],
  },
  {
    version: '0.1.3.6.10',
    date: 'June 30, 2026',
    items: [
      { text: 'The PKC (Pokémon Center) stamp button now appears only on cards that actually have a known stamped variant (or one already marked/detected as stamped). The faded "ghost" button that showed on every other Pokémon card is gone.' },
    ],
  },
  {
    version: '0.1.3.6.9',
    date: 'June 30, 2026',
    items: [
      { text: 'Reworked the summary header into separate bubbles: Submission Fees, Upcharges, and a Total Grading Charges total. The total now includes the value-based upcharge owed at each card\'s expected grade (so a card valued at grade 10 counts its grade-10 upcharge). Total Invested and Best Grade Profit boxes were tightened to fit their numbers.' },
      { text: 'Added a "Custom $" button to the grading-company toolbar to set your own flat grading price for every card on a default tier (the same global override that lived in Settings).' },
      { text: 'The per-card comparison now shows an editable "expected price" next to the grade selector, so you can value a card at a grade even when that grade isn\'t a visible column.' },
      { text: 'Updated TAG, Beckett (BGS), and CGC fee tiers to 2026 pricing. TAG: Basic $22 (10-card min), Standard $39, Express $59, Priority $149, Walkthrough $299. BGS: Economy $20, Standard $50, Express $100, Rush $150, Premium $250. CGC: Bulk $17 (25-card min), Economy $20, Standard $55, Express $100, Walk Through $300. These graders price by tier (declared value sets the minimum tier) rather than flat value add-ons.' },
    ],
  },
  {
    version: '0.1.3.6.8',
    date: 'June 30, 2026',
    items: [
      { text: 'The per-card comparison is now interactive: click a company to grade with it (it syncs the company dropdown). Your pick is outlined green, the best value purple.' },
      { text: 'The comparison’s grade buttons now set an "expected grade" for the card: grade columns above it grey out, and the summary totals value the card at that grade.' },
    ],
  },
  {
    version: '0.1.3.6.7',
    date: 'June 30, 2026',
    items: [
      { text: 'Grading Submissions (beta): group cards into named batches you ship to graders. One submission is active at a time and drives the table; an "All Submissions" view shows the combined total. Per-submission profit and card counts show on each batch, and tier minimums (e.g. PSA Value Bulk’s 20) are flagged as qualifying or short.' },
      { text: 'Each submission has its own default grading company (chosen when you create it); cards added to that batch default to it. The app now defaults to PSA on a fresh start.' },
      { text: 'Added Premier Card Grading (PSG) as a grading company — Bulk 50+ ($14.95), Standard ($19.95), Express ($49.95), no value upcharges. Removed the "None" company option.' },
      { text: 'Replaced the Scoring column with an Upcharge column that shows each card’s tier/upcharge guidance (extra cost if it needs a higher tier, "consider Express/Walk Through", avoided upcharge, or overpaying).' },
      { text: 'Changing a card’s company now resets its service level to that company’s default, so the tier and calculation follow the new company.' },
      { text: 'Added grader promo codes in Settings: each code is a % off or a flat price, scoped to a grader and (optionally) a tier. Toggle one on and it applies to that grader\'s fees in the calculations and comparison. Seeded the known PSG codes (PSASUX → flat $17 Standard, EXPRESS20 → flat $20 Express), off by default.' },
    ],
  },
  {
    version: '0.1.3.6.6',
    date: 'June 30, 2026',
    items: [
      { text: 'Price lookup now also captures premium "10" grades — Beckett Black Label, CGC Pristine, TAG 10, SGC 10, ACE 10 — from the same page.' },
      { text: 'Added a per-card "10 ▸" selector to value a card at one of those premium grades. PSA 10 stays the default; the premium is opt-in.' },
    ],
  },
  {
    version: '0.1.3.6.5',
    date: 'June 29, 2026',
    items: [
      { text: 'Added a "Grades" button to the toolbar to show/hide grade columns (1–10) without opening Settings.' },
      { text: 'The per-card comparison now has quick 10 / 9 buttons plus an "8 or lower" dropdown (grades 8–1) that feeds the calculation.' },
      { text: 'Price lookup now pulls low grades (PSA 1–6) from PriceCharting’s full grade table, so e.g. a PSA 1 Base Set Charizard now populates.' },
    ],
  },
  {
    version: '0.1.3.6.4',
    date: 'June 29, 2026',
    items: [
      { text: 'The build now fails unless this changelog has an entry for the current version — so every versioned release that reaches the site is recorded here.' },
    ],
  },
  {
    version: '0.1.3.6.3',
    date: 'June 29, 2026',
    items: [
      { text: 'Added this Changelog page, linked from the bottom of the Settings panel.' },
    ],
  },
  {
    version: '0.1.3.6.2',
    date: 'June 29, 2026',
    items: [
      { time: '19:01', text: 'New "compose before adding" flow — Add Card now stages a card in a highlighted row above the table so you can fill it in, search prices, and review before confirming.' },
      { time: '19:01', text: 'Pokémon Center (PKC) stamp button now shows by default only on cards that actually have a stamped variant (27-card list from PriceCharting); other Pokémon get a faded affordance, and a price-search match auto-enables it.' },
      { time: '19:01', text: 'Multiplier column art — 10x+ shows as a shiny gold plaque, 20x+ as a cosmos-themed glowing button.' },
      { time: '18:38', text: 'Combined the fee stats into one Grading Cost box (current total, with current vs potential top-grade upcharges broken out); compacted Total Cards and Avg Multiplier.' },
      { time: '18:32', text: 'Custom quantity stepper with styled up/down buttons; the down arrow is hidden at quantity 1.' },
      { time: '18:24', text: 'Show the per-card "avoided upcharge" so the value of submitting at a higher tier is visible.' },
      { time: '18:21', text: 'Split grading fees into Submission Fees and Estimated Upcharges.' },
      { time: '08:34', text: 'Added custom grading prices (global + per-card), corrected PSA pricing to the February 2026 chart, and added an accurate tier-bump upcharge estimator with an "consider Express" recommendation.' },
      { time: '07:55', text: 'Clarified that Best Grade Profit is shown after grading fees.' },
      { time: '07:45', text: 'Fixed price lookup matching the wrong card for language-tagged names (e.g. "Armored Mewtwo (JP)").' },
      { time: '07:40', text: 'Added per-card Quantity and an include-in-totals checkbox, with Select All / Clear All.' },
      { time: '07:24', text: 'Moved the delete button to the left, next to each card’s name.' },
    ],
  },
  {
    version: '0.1.3.6',
    date: 'March 14, 2026',
    items: [
      { text: 'Hardened price lookup: bulletproof sealed-product filtering and full card-number search; a card-number mismatch is now disqualifying.' },
    ],
  },
  {
    version: '0.1.3.5',
    date: 'March 13, 2026',
    items: [
      { text: 'eBay search now includes the grading company and grade 10.' },
    ],
  },
  {
    version: '0.1.3.4',
    date: 'March 13, 2026',
    items: [
      { text: 'Fixed lookup button visibility, moved the eBay link, and added Clear All.' },
    ],
  },
  {
    version: '0.1.3.3',
    date: 'March 13, 2026',
    items: [
      { text: 'Added an eBay sold-listings button on each card row.' },
    ],
  },
  {
    version: '0.1.3.2',
    date: 'March 13, 2026',
    items: [
      { text: 'Added CSV export with a Collectr-compatible layout.' },
    ],
  },
  {
    version: '0.1.3.1',
    date: 'March 13, 2026',
    items: [
      { text: 'Added a company fee-info popover.' },
    ],
  },
];
