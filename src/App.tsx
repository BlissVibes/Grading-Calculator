import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GradingCard, GradingCompany, GradeNumber, TenVariantKey, AppSettings, Submission } from './types';
import { DEFAULT_SETTINGS, PREMIUM_TENS } from './types';
import { parseImport } from './csvParser';
import { calculateAll } from './gradingCalculator';
import { lookupCard, lookupBatch, applyPricesToCard, detectLanguage, fieldsFromMatch } from './priceLookup';
import SiteHeader from './components/SiteHeader';
import type { LookupStatus } from './priceLookup';
import { isStampedMatch } from './pokemonCenterCards';
import FileDropZone from './components/FileDropZone';
import CompanySelector from './components/CompanySelector';
import CardTable from './components/CardTable';
import SummaryBar from './components/SummaryBar';
import CompanyComparison from './components/CompanyComparison';
import SettingsPanel from './components/SettingsPanel';
import Changelog from './components/Changelog';
import SubmissionsPanel from './components/SubmissionsPanel';
import AdSlots from './components/AdSlots';

const STORAGE_CARDS = 'gc_cards';
const STORAGE_SETTINGS = 'gc_settings';
const STORAGE_SUBMISSIONS = 'gc_submissions';
const STORAGE_ACTIVE_SUB = 'gc_active_submission';
const ALL = 'all';

function newId(): string { return crypto.randomUUID(); }

function loadSubmissions(): Submission[] {
  try {
    const raw = localStorage.getItem(STORAGE_SUBMISSIONS);
    return raw ? (JSON.parse(raw) as Submission[]) : [];
  } catch { return []; }
}

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
    const s: AppSettings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    // One-time: default the grading company to PSA for users who never set one
    if (!localStorage.getItem('gc_company_migrated')) {
      if (s.defaultCompany == null) s.defaultCompany = 'PSA';
      localStorage.setItem('gc_company_migrated', '1');
    }
    // One-time: EXPRESS20 is a flat $20 for Express (was seeded as 20% off)
    if (!localStorage.getItem('gc_promo_express20_v2')) {
      const pc = s.promoCodes?.find((p) => p.id === 'psg-express20');
      if (pc && pc.type === 'percent' && pc.value === 20) { pc.type = 'flat'; pc.value = 20; }
      localStorage.setItem('gc_promo_express20_v2', '1');
    }
    return s;
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
  const [submissions, setSubmissions] = useState<Submission[]>(loadSubmissions);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string>(
    () => localStorage.getItem(STORAGE_ACTIVE_SUB) || ALL,
  );

  // Persist submissions + active selection
  useEffect(() => { localStorage.setItem(STORAGE_SUBMISSIONS, JSON.stringify(submissions)); }, [submissions]);
  useEffect(() => { localStorage.setItem(STORAGE_ACTIVE_SUB, activeSubmissionId); }, [activeSubmissionId]);

  // Migration: ensure at least one submission exists, each has a default company,
  // and every card belongs to a submission.
  useEffect(() => {
    setSubmissions((subs) => {
      let next = subs;
      if (next.length === 0) {
        next = [{ id: newId(), name: 'Submission #1', defaultCompany: settings.defaultCompany ?? 'PSA' }];
      } else if (next.some((s) => s.defaultCompany === undefined)) {
        next = next.map((s) => (s.defaultCompany === undefined ? { ...s, defaultCompany: settings.defaultCompany ?? 'PSA' } : s));
      }
      const firstId = next[0].id;
      const known = new Set(next.map((s) => s.id));
      setCards((prev) => {
        let changed = false;
        const mapped = prev.map((c) => {
          if (!c.submissionId || !known.has(c.submissionId)) { changed = true; return { ...c, submissionId: firstId }; }
          return c;
        });
        return changed ? mapped : prev;
      });
      return next === subs ? subs : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The submission new/imported cards land in (active one, or the first if "All")
  const targetSubmissionId = activeSubmissionId !== ALL
    ? activeSubmissionId
    : (submissions[0]?.id ?? '');
  // New cards default to that submission's grading company (falling back to global)
  const targetCompany = submissions.find((s) => s.id === targetSubmissionId)?.defaultCompany ?? settings.defaultCompany;

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

  // Cards/calcs scoped to the active submission (or all)
  const viewCards = useMemo(
    () => (activeSubmissionId === ALL ? cards : cards.filter((c) => c.submissionId === activeSubmissionId)),
    [cards, activeSubmissionId],
  );
  const viewCalcs = useMemo(() => {
    const ids = new Set(viewCards.map((c) => c.id));
    return calculations.filter((c) => ids.has(c.cardId));
  }, [calculations, viewCards]);

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
      company: targetCompany,
      language: c.language || detectLanguage(c.cardName) || settings.defaultLanguage,
      submissionId: targetSubmissionId,
    }));
    setCards((prev) => [...prev, ...withDefaults]);
  }, [targetCompany, settings.defaultLanguage, targetSubmissionId]);

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
    // Apply the default expected grade. A premium "10+" default (e.g. Black
    // Label) also points the card at its grader, so the premium actually values.
    const deg = settings.defaultExpectedGrade ?? 10;
    let targetGrade: GradeNumber = 10;
    let tenVariant: TenVariantKey | null = null;
    let company = targetCompany;
    if (typeof deg === 'number') {
      targetGrade = deg;
    } else {
      const prem = PREMIUM_TENS.find((p) => p.key === deg);
      if (prem) {
        targetGrade = 10;
        tenVariant = prem.key;
        company = prem.company;
      }
    }
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
      targetGrade,
      tenVariant,
      quantity: 1,
      includeInTotal: true,
      company,
      serviceLevel: null,
      customGradingFee: null,
      noGrading: false,
      scoring: false,
      pokemonCenter: false,
      notes: '',
      source: 'manual',
      submissionId: targetSubmissionId,
    };
    // Stage the card in a draft area above the table — it isn't added until the
    // user fills it in, optionally searches prices, and confirms.
    setDraftCard(newCard);
    setDraftLookupStatus(undefined);
  }, [targetCompany, settings.defaultLanguage, settings.defaultExpectedGrade, targetSubmissionId]);

  // ───── Submissions ─────

  const createSubmission = useCallback((name: string, defaultCompany: GradingCompany | null) => {
    const id = newId();
    setSubmissions((prev) => [
      ...prev,
      { id, name: name.trim() || `Submission #${prev.length + 1}`, defaultCompany },
    ]);
    setActiveSubmissionId(id);
  }, []);

  const updateSubmission = useCallback((id: string, patch: Partial<Submission>) => {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteSubmission = useCallback((id: string) => {
    setSubmissions((prev) => {
      if (prev.length <= 1) return prev;   // keep at least one
      const remaining = prev.filter((s) => s.id !== id);
      const fallback = remaining[0].id;
      // Move the deleted submission's cards to the first remaining submission
      setCards((cs) => cs.map((c) => (c.submissionId === id ? { ...c, submissionId: fallback } : c)));
      setActiveSubmissionId((cur) => (cur === id ? fallback : cur));
      return remaining;
    });
  }, []);

  // Duplicate a submission and all of its cards into a brand-new submission.
  const copySubmission = useCallback((sourceId: string, newName: string) => {
    const newSubId = newId();
    setSubmissions((prev) => {
      const source = prev.find((s) => s.id === sourceId);
      if (!source) return prev;
      const idx = prev.findIndex((s) => s.id === sourceId);
      const copy: Submission = { id: newSubId, name: newName.trim() || `${source.name} (copy)`, defaultCompany: source.defaultCompany };
      // Insert the copy right after the source for an intuitive ordering.
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setCards((cs) => {
      const clones = cs
        .filter((c) => c.submissionId === sourceId)
        .map((c) => ({ ...c, id: crypto.randomUUID(), submissionId: newSubId }));
      return [...cs, ...clones];
    });
    setActiveSubmissionId(newSubId);
  }, []);

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
        // Fill empty Set / Card # fields from the match so the user can confirm
        // the right card was found.
        const filled = fieldsFromMatch(card, result);
        setDraftCard((d) => (d ? {
          ...d, ...updates,
          set: filled.set ?? d.set,
          cardNumber: filled.number ?? d.cardNumber,
          priceChartingUrl: result.url || d.priceChartingUrl,
          priceChartingTitle: result.matchedTitle || d.priceChartingTitle,
          pokemonCenter: stamped ? true : d.pokemonCenter,
        } : d));
        setDraftLookupStatus({ cardId: card.id, status: 'done', result, filled });
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
        // Fill empty Set / Card # fields from the match so the user can confirm
        // the right card was found.
        const filled = fieldsFromMatch(card, result);
        setCards((prev) => prev.map((c) => (c.id === card.id ? {
          ...c, ...updates,
          set: filled.set ?? c.set,
          cardNumber: filled.number ?? c.cardNumber,
          priceChartingUrl: result.url || c.priceChartingUrl,
          priceChartingTitle: result.matchedTitle || c.priceChartingTitle,
          pokemonCenter: stamped ? true : c.pokemonCenter,
        } : c)));

        setLookupStatuses((prev) => {
          const next = new Map(prev);
          next.set(card.id, { cardId: card.id, status: 'done', result, filled });
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
    const cardsToLookup = viewCards.filter((c) => c.cardName.trim());
    if (cardsToLookup.length === 0) return;

    setLookupInProgress(true);

    await lookupBatch(cardsToLookup, (status) => {
      // If we got results, apply them and record which empty fields were filled.
      if (status.status === 'done' && status.result) {
        const result = status.result;
        const card = cardsToLookup.find((c) => c.id === status.cardId);
        const filled = card ? fieldsFromMatch(card, result) : {};
        setCards((prev) =>
          prev.map((c) => {
            if (c.id !== status.cardId) return c;
            const updates = applyPricesToCard(c, result);
            const f = fieldsFromMatch(c, result);
            return {
              ...c, ...updates,
              set: f.set ?? c.set,
              cardNumber: f.number ?? c.cardNumber,
              priceChartingUrl: result.url || c.priceChartingUrl,
              priceChartingTitle: result.matchedTitle || c.priceChartingTitle,
              pokemonCenter: isStampedMatch(result.matchedTitle, result.url) ? true : c.pokemonCenter,
            };
          })
        );
        setLookupStatuses((prev) => {
          const next = new Map(prev);
          next.set(status.cardId, { ...status, filled });
          return next;
        });
      } else {
        setLookupStatuses((prev) => {
          const next = new Map(prev);
          next.set(status.cardId, status);
          return next;
        });
      }
    });

    setLookupInProgress(false);
  }, [viewCards]);

  if (route === '/changelog') {
    return <Changelog onBack={() => navigate('/')} />;
  }

  return (
    <>
      <SiteHeader />
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
        {/* File Import + Grading Submissions */}
        <div className="import-row">
          <FileDropZone
            onImport={handleImport}
            onClearAll={() => {
              const ids = new Set(viewCards.map((c) => c.id));
              setCards((prev) => prev.filter((c) => !ids.has(c.id)));
              setLookupStatuses(new Map());
            }}
            hasCards={viewCards.length > 0}
          />
          <SubmissionsPanel
            submissions={submissions}
            activeId={activeSubmissionId}
            cards={cards}
            calculations={calculations}
            settings={settings}
            onSelect={setActiveSubmissionId}
            onCreate={createSubmission}
            onUpdate={updateSubmission}
            onDelete={deleteSubmission}
            onCopy={copySubmission}
          />
        </div>

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
          globalCustomFee={settings.globalCustomGradingFee}
          onCompanyChange={handleCompanyChange}
          onServiceLevelChange={handleServiceLevelChange}
          onApplyToAll={handleApplyToAll}
          onGlobalCustomFeeChange={(fee) =>
            setSettings((prev) => ({ ...prev, globalCustomGradingFee: fee }))
          }
        />

        {/* Summary */}
        {viewCards.length > 0 && (
          <SummaryBar
            cards={viewCards}
            calculations={viewCalcs}
            deductRawFromProfit={settings.deductRawFromProfit !== false}
            onToggleDeductRaw={(next) => setSettings((prev) => ({ ...prev, deductRawFromProfit: next }))}
          />
        )}

        {/* Card Table */}
        <CardTable
          cards={viewCards}
          calculations={viewCalcs}
          settings={settings}
          lookupStatuses={lookupStatuses}
          onUpdateCard={updateCard}
          onUpdateSettings={setSettings}
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
        {viewCards.length > 0 && (
          <CompanyComparison cards={viewCards} settings={settings} />
        )}

        <AdSlots />
      </main>
      </div>
    </>
  );
}
