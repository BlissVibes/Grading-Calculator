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
