import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GradingCard, GradingCompany, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { parseImport } from './csvParser';
import { calculateAll } from './gradingCalculator';
import { lookupCard, lookupBatch, applyPricesToCard, detectLanguage } from './priceLookup';
import type { LookupStatus } from './priceLookup';
import { isStampedMatch } from './pokemonCenterCards';
import FileDropZone from './components/FileDropZone';
import CompanySelector from './components/CompanySelector';
import CardTable from './components/CardTable';
import SummaryBar from './components/SummaryBar';
import CompanyComparison from './components/CompanyComparison';
import SettingsPanel from './components/SettingsPanel';
import Changelog from './components/Changelog';

const STORAGE_CARDS = 'gc_cards';
const STORAGE_SETTINGS = 'gc_settings';

function loadCards(): GradingCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_CARDS);
    if (!raw) return [];
    const cards: GradingCard[] = JSON.parse(raw);
    // Backfill language for cards saved before language support was added
    for (const card of cards) {
      if (!card.language) {
        card.language = detectLanguage(card.cardName);
      }
      // Backfill include flag for cards saved before it was added (default: counted)
      if (card.includeInTotal === undefined) {
        card.includeInTotal = true;
      }
      // Backfill custom grading fee (null = use tier / global custom)
      if (card.customGradingFee === undefined) {
        card.customGradingFee = null;
      }
    }
    return cards;
  } catch { return []; }
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export default function App() {
  const [cards, setCards] = useState<GradingCard[]>(loadCards);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [errors, setErrors] = useState<string[]>([]);
  const [lookupStatuses, setLookupStatuses] = useState<Map<string, LookupStatus>>(new Map());
  const [lookupInProgress, setLookupInProgress] = useState(false);
  const [draftCard, setDraftCard] = useState<GradingCard | null>(null);
  const [draftLookupStatus, setDraftLookupStatus] = useState<LookupStatus | undefined>(undefined);

  // Lightweight client-side routing (SPA fallback handles /changelog on refresh)
  const [route, setRoute] = useState<string>(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setRoute(to);
    window.scrollTo(0, 0);
  }, []);

  // Persist
  useEffect(() => { localStorage.setItem(STORAGE_CARDS, JSON.stringify(cards)); }, [cards]);
  useEffect(() => { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); }, [settings]);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  }, [settings.darkMode]);

  // Calculate
  const calculations = useMemo(() => calculateAll(cards, settings), [cards, settings]);

  // Import handler
  const handleImport = useCallback((content: string, filename: string) => {
    const { cards: imported, error } = parseImport(content, filename);
    if (error) {
      setErrors((prev) => [...prev, error]);
      return;
    }
    // Apply default company and detect language for imported cards
    const withDefaults = imported.map((c) => ({
      ...c,
      company: settings.defaultCompany,
      language: c.language || detectLanguage(c.cardName) || settings.defaultLanguage,
    }));
    setCards((prev) => [...prev, ...withDefaults]);
  }, [settings.defaultCompany, settings.defaultLanguage]);

  // Card CRUD
  const updateCard = useCallback((id: string, updates: Partial<GradingCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const setAllIncluded = useCallback((included: boolean) => {
    setCards((prev) => prev.map((c) => ({ ...c, includeInTotal: included })));
  }, []);

  const addCard = useCallback(() => {
    const newCard: GradingCard = {
      id: crypto.randomUUID(),
      cardName: '',
      cardGame: 'Pokémon',
      cardNumber: '',
      set: '',
      language: settings.defaultLanguage ?? 'EN',
      pricePaid: 0,
      rawPrice: 0,
      gradeValues: {},
      quantity: 1,
      includeInTotal: true,
      company: settings.defaultCompany,
      serviceLevel: null,
      customGradingFee: null,
      noGrading: false,
      scoring: false,
      pokemonCenter: false,
      notes: '',
      source: 'manual',
    };
    // Stage the card in a draft area above the table — it isn't added until the
    // user fills it in, optionally searches prices, and confirms.
    setDraftCard(newCard);
    setDraftLookupStatus(undefined);
  }, [settings.defaultCompany, settings.defaultLanguage]);

  // ───── Draft card (compose before adding) ─────

  const updateDraft = useCallback((updates: Partial<GradingCard>) => {
    setDraftCard((d) => (d ? { ...d, ...updates } : d));
  }, []);

  const confirmDraft = useCallback(() => {
    setDraftCard((d) => {
      if (d && d.cardName.trim()) setCards((prev) => [...prev, d]);
      return null;
    });
    setDraftLookupStatus(undefined);
  }, []);

  const cancelDraft = useCallback(() => {
    setDraftCard(null);
    setDraftLookupStatus(undefined);
  }, []);

  const lookupDraft = useCallback(async () => {
    const card = draftCard;
    if (!card || !card.cardName.trim()) return;
    setDraftLookupStatus({ cardId: card.id, status: 'loading' });
    try {
      const result = await lookupCard(card);
      if (result.raw === 0 && result.grade9 === 0 && result.psa10 === 0) {
        setDraftLookupStatus({ cardId: card.id, status: 'not-found', result });
      } else {
        const updates = applyPricesToCard(card, result);
        const stamped = isStampedMatch(result.matchedTitle, result.url);
        setDraftCard((d) => (d ? {
          ...d, ...updates,
          priceChartingUrl: result.url || d.priceChartingUrl,
          priceChartingTitle: result.matchedTitle || d.priceChartingTitle,
          pokemonCenter: stamped ? true : d.pokemonCenter,
        } : d));
        setDraftLookupStatus({ cardId: card.id, status: 'done', result });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setDraftLookupStatus({ cardId: card.id, status: 'error', error: message });
    }
  }, [draftCard]);

  // Company selection
  const handleCompanyChange = useCallback((company: GradingCompany | null) => {
    setSettings((prev) => ({ ...prev, defaultCompany: company }));
  }, []);

  const handleServiceLevelChange = useCallback((level: string) => {
    setSettings((prev) => {
      if (!prev.defaultCompany) return prev;
      return {
        ...prev,
        defaultServiceLevel: { ...prev.defaultServiceLevel, [prev.defaultCompany]: level },
      };
    });
  }, []);

  const handleApplyToAll = useCallback(() => {
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        company: settings.defaultCompany,
        serviceLevel: settings.defaultCompany
          ? settings.defaultServiceLevel[settings.defaultCompany]
          : null,
      }))
    );
  }, [settings.defaultCompany, settings.defaultServiceLevel]);

  const currentServiceLevel = settings.defaultCompany
    ? settings.defaultServiceLevel[settings.defaultCompany]
    : '';

  // ───── Price Lookup ─────

  const handleLookupCard = useCallback(async (card: GradingCard) => {
    if (!card.cardName.trim()) return;

    setLookupStatuses((prev) => {
      const next = new Map(prev);
      next.set(card.id, { cardId: card.id, status: 'loading' });
      return next;
    });

    try {
      const result = await lookupCard(card);

      if (result.raw === 0 && result.grade9 === 0 && result.psa10 === 0) {
        setLookupStatuses((prev) => {
          const next = new Map(prev);
          next.set(card.id, { cardId: card.id, status: 'not-found', result });
          return next;
        });
      } else {
        // Apply prices to card and persist the matched card info for display after reload
        const updates = applyPricesToCard(card, result);
        const stamped = isStampedMatch(result.matchedTitle, result.url);
        setCards((prev) => prev.map((c) => (c.id === card.id ? {
          ...c, ...updates,
          priceChartingUrl: result.url || c.priceChartingUrl,
          priceChartingTitle: result.matchedTitle || c.priceChartingTitle,
          pokemonCenter: stamped ? true : c.pokemonCenter,
        } : c)));

        setLookupStatuses((prev) => {
          const next = new Map(prev);
          next.set(card.id, { cardId: card.id, status: 'done', result });
          return next;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setLookupStatuses((prev) => {
        const next = new Map(prev);
        next.set(card.id, { cardId: card.id, status: 'error', error: message });
        return next;
      });
    }
  }, []);

  const handleLookupAll = useCallback(async () => {
    const cardsToLookup = cards.filter((c) => c.cardName.trim());
    if (cardsToLookup.length === 0) return;

    setLookupInProgress(true);

    await lookupBatch(cardsToLookup, (status) => {
      setLookupStatuses((prev) => {
        const next = new Map(prev);
        next.set(status.cardId, status);
        return next;
      });

      // If we got results, apply them
      if (status.status === 'done' && status.result) {
        const result = status.result;
        setCards((prev) =>
          prev.map((c) => {
            if (c.id !== status.cardId) return c;
            const updates = applyPricesToCard(c, result);
            return {
              ...c, ...updates,
              priceChartingUrl: result.url || c.priceChartingUrl,
              priceChartingTitle: result.matchedTitle || c.priceChartingTitle,
              pokemonCenter: isStampedMatch(result.matchedTitle, result.url) ? true : c.pokemonCenter,
            };
          })
        );
      }
    });

    setLookupInProgress(false);
  }, [cards]);

  if (route === '/changelog') {
    return <Changelog onBack={() => navigate('/')} />;
  }

  return (
    <div className="app">
      <SettingsPanel settings={settings} onUpdate={setSettings} onOpenChangelog={() => navigate('/changelog')} />

      <header className="app-header">
        <img src="/logo.svg" alt="Grading Calculator Logo" className="app-logo" />
        <h1 className="app-title">Grading Calculator</h1>
        <p className="app-byline">by BlissVibes</p>
        <p className="app-version">v{__APP_VERSION__}</p>
        <p className="app-subtitle">
          Calculate grading profits, fees & upcharges for PSA, TAG, Beckett, ARS, and CGC
        </p>
      </header>

      <main className="app-main">
        {/* File Import */}
        <FileDropZone
          onImport={handleImport}
          onClearAll={() => { setCards([]); setLookupStatuses(new Map()); }}
          hasCards={cards.length > 0}
        />

        {/* Errors */}
        {errors.length > 0 && (
          <div className="error-list">
            {errors.map((err, i) => (
              <div key={i} className="error-item">
                {err}
                <button
                  style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  onClick={() => setErrors((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Company Selector */}
        <CompanySelector
          selectedCompany={settings.defaultCompany}
          selectedServiceLevel={currentServiceLevel}
          onCompanyChange={handleCompanyChange}
          onServiceLevelChange={handleServiceLevelChange}
          onApplyToAll={handleApplyToAll}
        />

        {/* Summary */}
        {cards.length > 0 && (
          <SummaryBar cards={cards} calculations={calculations} />
        )}

        {/* Card Table */}
        <CardTable
          cards={cards}
          calculations={calculations}
          settings={settings}
          lookupStatuses={lookupStatuses}
          onUpdateCard={updateCard}
          onDeleteCard={deleteCard}
          onAddCard={addCard}
          onSelectAll={() => setAllIncluded(true)}
          onClearSelection={() => setAllIncluded(false)}
          onLookupCard={handleLookupCard}
          onLookupAll={handleLookupAll}
          lookupInProgress={lookupInProgress}
          draftCard={draftCard}
          onUpdateDraft={updateDraft}
          onConfirmDraft={confirmDraft}
          onCancelDraft={cancelDraft}
          onLookupDraft={lookupDraft}
          draftLookupStatus={draftLookupStatus}
        />

        {/* Company Comparison */}
        {cards.length > 0 && (
          <CompanyComparison cards={cards} settings={settings} />
        )}
      </main>
    </div>
  );
}
