import type { GradingCard, CardCalculation, GradeNumber, AppSettings } from './types';

// ───── Sort Options ─────

export type ExportSortKey =
  | 'g10-price' | 'g9-price'
  | 'g10-profit' | 'g9-profit'
  | 'g10-mult' | 'g9-mult'
  | 'name' | 'paid' | 'raw';

export const EXPORT_SORT_OPTIONS: { key: ExportSortKey; label: string }[] = [
  { key: 'g10-price', label: 'Grade 10 Price (high → low)' },
  { key: 'g10-profit', label: 'Grade 10 Profit (high → low)' },
  { key: 'g10-mult', label: 'Grade 10 Multiplier (high → low)' },
  { key: 'g9-price', label: 'Grade 9 Price (high → low)' },
  { key: 'g9-profit', label: 'Grade 9 Profit (high → low)' },
  { key: 'g9-mult', label: 'Grade 9 Multiplier (high → low)' },
  { key: 'raw', label: 'Raw Price (high → low)' },
  { key: 'paid', label: 'Price Paid (high → low)' },
  { key: 'name', label: 'Card Name (A → Z)' },
];

// ───── Sort Logic ─────

function sortCards(
  cards: GradingCard[],
  calcs: CardCalculation[],
  sortKey: ExportSortKey,
): GradingCard[] {
  const calcMap = new Map(calcs.map((c) => [c.cardId, c]));

  const getGrade = (cardId: string, grade: GradeNumber) =>
    calcMap.get(cardId)?.grades.find((g) => g.grade === grade);

  return [...cards].sort((a, b) => {
    switch (sortKey) {
      case 'g10-price': return (b.gradeValues[10] ?? 0) - (a.gradeValues[10] ?? 0);
      case 'g9-price': return (b.gradeValues[9] ?? 0) - (a.gradeValues[9] ?? 0);
      case 'g10-profit': return (getGrade(b.id, 10)?.profit ?? 0) - (getGrade(a.id, 10)?.profit ?? 0);
      case 'g9-profit': return (getGrade(b.id, 9)?.profit ?? 0) - (getGrade(a.id, 9)?.profit ?? 0);
      case 'g10-mult': return (getGrade(b.id, 10)?.multiplier ?? 0) - (getGrade(a.id, 10)?.multiplier ?? 0);
      case 'g9-mult': return (getGrade(b.id, 9)?.multiplier ?? 0) - (getGrade(a.id, 9)?.multiplier ?? 0);
      case 'raw': return (b.rawPrice ?? 0) - (a.rawPrice ?? 0);
      case 'paid': return (b.pricePaid ?? 0) - (a.pricePaid ?? 0);
      case 'name': return a.cardName.localeCompare(b.cardName);
      default: return 0;
    }
  });
}

// ───── CSV Escape ─────

function esc(value: string | number | undefined): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function money(n: number | undefined): string {
  return (n ?? 0).toFixed(2);
}

// ───── Export ─────

export function exportCSV(
  cards: GradingCard[],
  calcs: CardCalculation[],
  settings: AppSettings,
  sortKey: ExportSortKey = 'g10-price',
): string {
  const calcMap = new Map(calcs.map((c) => [c.cardId, c]));
  const sorted = sortCards(cards, calcs, sortKey);

  const getGrade = (cardId: string, grade: GradeNumber) =>
    calcMap.get(cardId)?.grades.find((g) => g.grade === grade);

  // Collectr-compatible headers (these columns must stay in this order)
  const collectrHeaders = [
    'Product Name',
    'Category',
    'Set',
    'Card Number',
    'Average Cost Paid',
    'Market Price',
    'Quantity',
    'Notes',
  ];

  // Our extra headers (appended after Collectr columns — Collectr ignores these)
  const extraHeaders = [
    'Language',
    'Grade 9 Price',
    'Grade 10 Price',
    'Grade 9 Profit',
    'Grade 10 Profit',
    'Grade 9 Multiplier',
    'Grade 10 Multiplier',
    'Grading Company',
    'Service Level',
    'Grading Fee (G10)',
    'Upcharge (G10)',
    'Total Cost (G10)',
    'PriceCharting Match',
    'PriceCharting URL',
    'Pokemon Center',
  ];

  const allHeaders = [...collectrHeaders, ...extraHeaders];

  const rows = sorted.map((card) => {
    const g9 = getGrade(card.id, 9);
    const g10 = getGrade(card.id, 10);
    const calc = calcMap.get(card.id);
    const company = card.company ?? settings.defaultCompany ?? '';
    const serviceLevel = card.serviceLevel ??
      (settings.defaultCompany ? settings.defaultServiceLevel[settings.defaultCompany] : '') ?? '';

    // Collectr columns
    const collectrCols = [
      esc(card.cardName),
      esc(card.cardGame),
      esc(card.set),
      esc(card.cardNumber),
      money(card.pricePaid),
      money(card.rawPrice),
      String(card.quantity),
      esc(card.notes),
    ];

    // Our extra columns
    const extraCols = [
      esc(card.language || 'EN'),
      money(card.gradeValues[9]),
      money(card.gradeValues[10]),
      money(g9?.profit),
      money(g10?.profit),
      (g9?.multiplier ?? 0).toFixed(2),
      (g10?.multiplier ?? 0).toFixed(2),
      esc(company),
      esc(serviceLevel),
      money(g10?.gradingFee),
      money(g10?.upcharge),
      money(g10?.totalCost),
      esc(card.priceChartingTitle ?? ''),
      esc(card.priceChartingUrl ?? ''),
      card.pokemonCenter ? 'Yes' : '',
    ];

    return [...collectrCols, ...extraCols].join(',');
  });

  return [allHeaders.join(','), ...rows].join('\n');
}

// ───── Download trigger ─────

export function downloadCSV(csvContent: string, filename: string = 'grading-export.csv') {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
