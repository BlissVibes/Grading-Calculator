import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GradingCard, GradingCompany, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { parseImport } from './csvParser';
import { calculateAll } from './gradingCalculator';
import { lookupCard, lookupBatch, applyPricesToCard } from './priceLookup';
import type { LookupStatus } from './priceLookup';
import FileDropZone from './components/FileDropZone';
import CompanySelector from './components/CompanySelector';
import CardTable from './components/CardTable';
import SummaryBar from './components/SummaryBar';
import CompanyComparison from './components/CompanyComparison';
import SettingsPanel from './components/SettingsPanel';

const STORAGE_CARDS = 'gc_cards';
const STORAGE_SETTINGS = 'gc_settings';

function loadCards(): GradingCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_CARDS);
    return raw ? JSON.parse(raw) : [];
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
    // Apply default company to imported cards
    const withDefaults = imported.map((c) => ({
      ...c,
      company: settings.defaultCompany,
    }));
    setCards((prev) => [...prev, ...withDefaults]);
  }, [settings.defaultCompany]);

  // Card CRUD
  const updateCard = useCallback((id: string, updates: Partial<GradingCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addCard = useCallback(() => {
    const newCard: GradingCard = {
      id: crypto.randomUUID(),
      cardName: '',
      cardGame: 'Pokémon',
      cardNumber: '',
      set: '',
      pricePaid: 0,
      rawPrice: 0,
      gradeValues: {},
      quantity: 1,
      company: settings.defaultCompany,
      serviceLevel: null,
      noGrading: false,
      scoring: false,
      notes: '',
      source: 'manual',
    };
    setCards((prev) => [...prev, newCard]);
  }, [settings.defaultCompany]);

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
        // Apply prices to card
        const updates = applyPricesToCard(card, result);
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...updates } : c)));

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
            return { ...c, ...updates };
          })
        );
      }
    });

    setLookupInProgress(false);
  }, [cards]);

  return (
    <div className="app">
      <SettingsPanel settings={settings} onUpdate={setSettings} />

      <header className="app-header">
        <img src="/logo.svg" alt="Grading Calculator Logo" className="app-logo" />
        <h1 className="app-title">Grading Calculator</h1>
        <p className="app-byline">by BlissVibes</p>
        <p className="app-version">v0.1.2.2</p>
        <p className="app-subtitle">
          Calculate grading profits, fees & upcharges for PSA, TAG, Beckett, ARS, and CGC
        </p>
      </header>

      <main className="app-main">
        {/* File Import */}
        <FileDropZone onImport={handleImport} />

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
          onLookupCard={handleLookupCard}
          onLookupAll={handleLookupAll}
          lookupInProgress={lookupInProgress}
        />

        {/* Company Comparison */}
        {cards.length > 0 && (
          <CompanyComparison cards={cards} settings={settings} />
        )}
      </main>
    </div>
  );
}
