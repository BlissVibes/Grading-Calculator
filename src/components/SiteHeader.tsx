import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../config/firebase'
import type { SubData } from '../services/entitlements'
import { isProActive } from '../services/entitlements'
import {
  getAccountInfo,
  effectiveTier,
  tierLabel,
  createCheckoutSession,
  createPortalSession,
  redeemPromoCode,
} from '../services/account'
import AuthModal, { openAuthModal, completeEmailLinkSignIn } from './AuthModal'
import './SiteHeader.css'

// Shared ShinyCardboard site header, ported to plain CSS so the two tools carry
// the SAME top nav AND the SAME account menu as the main site — full visual +
// functional parity (logo, tier/VIP badges, Upgrade, Manage subscription, Beta
// link, promo redemption, Donate, Sign out). All links are same-origin routes
// served by the Vercel proxy, so plain <a> (full-page navigation) is correct.
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/grading', label: 'Card Grading' },
]
const TOOLS = [
  { href: '/calculator', label: 'Grading Calculator' },
  { href: '/portfolio', label: 'Portfolio Comparison' },
]

const ADMIN_EMAIL = 'markwilson.vfx@gmail.com'
const BETA_SITE_URL = 'https://beta.shinycardboard.win'
const PAYPAL_DONATE_URL =
  'https://www.paypal.com/donate?business=markwilson713%40gmail.com&currency_code=USD'

const EMPTY_SUB: SubData = { status: null, plan: null, currentPeriodEnd: null }

function initial(u: User): string {
  return (u.displayName || u.email || '?').charAt(0).toUpperCase()
}

export default function SiteHeader() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [sub, setSub] = useState<SubData>(EMPTY_SUB)
  const [isVip, setIsVip] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [betaAccess, setBetaAccess] = useState(false)
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [managing, setManaging] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  // Finish a passwordless email-link sign-in if we arrived via one.
  useEffect(() => { void completeEmailLinkSignIn().catch(() => {}) }, [])

  // On login: claim Launch VIP (idempotent, server-side) then load the account
  // snapshot that drives the whole menu. The endpoints live on the main site,
  // reached same-origin behind the proxy.
  useEffect(() => {
    if (!user) {
      setSub(EMPTY_SUB); setIsVip(false); setIsAdmin(false)
      setBetaAccess(false); setStripeCustomerId(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const token = await user.getIdToken()
        await fetch('/api/redeem-promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'claim-vip' }),
        })
      } catch { /* non-fatal */ }
      const info = await getAccountInfo(user.uid)
      if (cancelled) return
      setSub(info.sub)
      setIsVip(info.launchVip)
      setIsAdmin(info.isAdmin || user.email?.toLowerCase() === ADMIN_EMAIL)
      setBetaAccess(info.betaAccess)
      setStripeCustomerId(info.stripeCustomerId)
    })()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setToolsOpen(false)
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))
  const onTools = TOOLS.some((t) => path.startsWith(t.href))
  // Show a BETA badge on the beta channel (served under beta.shinycardboard.win).
  const isBeta = typeof window !== 'undefined' && window.location.hostname.startsWith('beta.')

  const isPro = isProActive(sub)
  const tier = effectiveTier(sub)
  const isSilver = tier === 'silver'
  const label = tierLabel(sub)
  const betaEligible = isAdmin || betaAccess || tier === 'gold' || tier === 'platinum'
  const showBetaLink = betaEligible && !isBeta
  const hasStripeCustomer = !!stripeCustomerId

  const signIn = () => { setMenuOpen(false); openAuthModal() }
  const doSignOut = () => {
    setUserOpen(false); setMenuOpen(false)
    void signOut(auth)
  }
  const handleUpgrade = async () => {
    if (!user || !user.email) return
    setUpgrading(true)
    try {
      const url = await createCheckoutSession(user.uid, user.email)
      window.location.href = url
    } catch { setUpgrading(false) }
  }
  const handleManage = async () => {
    setManaging(true)
    try {
      const url = await createPortalSession()
      window.location.href = url
    } catch { setManaging(false) }
  }

  const tierBadge = isPro && (
    <span className={`sh__tier ${isSilver ? 'sh__tier--silver' : 'sh__tier--pro'}`}>
      {isSilver ? 'SILVER' : 'PRO'}
    </span>
  )

  // Upgrade / tier rows shared by the desktop dropdown and the mobile menu.
  const accountActions = (
    <>
      {showBetaLink && (
        <a href={BETA_SITE_URL} className="sh__amber">⚡ Beta site</a>
      )}
      {!isPro && (
        <button onClick={handleUpgrade} disabled={upgrading} className="sh__amber">
          {upgrading ? 'Redirecting...' : 'Upgrade to Pro - $4.99/mo'}
        </button>
      )}
      {isPro && (
        <>
          <div className="sh__tierrow">✓ {label || 'Pro subscriber'}</div>
          {isSilver && (
            <button onClick={handleUpgrade} disabled={upgrading} className="sh__amber">
              {upgrading ? 'Redirecting...' : 'Upgrade to Pro Gold'}
            </button>
          )}
          {hasStripeCustomer && (
            <button onClick={handleManage} disabled={managing}>
              {managing ? 'Opening...' : 'Manage subscription'}
            </button>
          )}
        </>
      )}
      <PromoRow open={promoOpen} setOpen={setPromoOpen} signedIn={!!user} />
      <a href={PAYPAL_DONATE_URL} target="_blank" rel="noopener noreferrer" className="sh__donate">
        ♥ Donate
      </a>
    </>
  )

  return (
    <>
    <AuthModal />
    <header className="sh">
      <div className="sh__inner" ref={barRef}>
        <div className="sh__brand">
          <a className="sh__logo" href="/">
            <img className="sh__logo-img" src={`${import.meta.env.BASE_URL}header-logo.png`} alt="Shiny Cardboard" />
          </a>
          {isBeta && <span className="sh__beta">Beta</span>}
        </div>

        {/* Desktop nav */}
        <nav className="sh__nav">
          {NAV.map((l) => (
            <a key={l.href} href={l.href} className={`sh__link${isActive(l.href) ? ' is-active' : ''}`}>
              {l.label}
            </a>
          ))}

          <div className="sh__dd">
            <button className={`sh__link${onTools ? ' is-active' : ''}`} onClick={() => setToolsOpen((o) => !o)}>
              Tools <span className={`sh__caret${toolsOpen ? ' open' : ''}`}>▾</span>
            </button>
            {toolsOpen && (
              <div className="sh__menu">
                {TOOLS.map((t) => (
                  <a key={t.href} href={t.href} className={path.startsWith(t.href) ? 'is-active' : ''}>
                    {t.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {user ? (
            <div className="sh__dd">
              <button className="sh__user" onClick={() => setUserOpen((o) => !o)} aria-label="Account">
                {user.photoURL ? (
                  <img className="sh__avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="sh__avatar sh__avatar--fallback">{initial(user)}</span>
                )}
                <span className="sh__uname">{user.displayName || user.email}</span>
                {isVip && <span className="sh__vip">VIP</span>}
                {tierBadge}
              </button>
              {userOpen && (
                <div className="sh__menu sh__menu--wide">
                  <div className="sh__userinfo">
                    <div className="sh__uirow">
                      <span className="sh__uiname">{user.displayName || user.email}</span>
                      {isVip && <span className="sh__vip">VIP</span>}
                    </div>
                    {user.displayName && <div className="sh__uimail">{user.email}</div>}
                    {isVip && <div className="sh__viprow">Launch VIP - founding member</div>}
                  </div>
                  {accountActions}
                  <button onClick={doSignOut}>Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <button className="sh__signin" onClick={signIn}>Sign in</button>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button className="sh__burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sh__mobile">
          {user ? (
            <div className="sh__mobileuser">
              {user.photoURL ? (
                <img className="sh__avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="sh__avatar sh__avatar--fallback">{initial(user)}</span>
              )}
              <div className="sh__mobileuser-info">
                <div className="sh__uirow">
                  <span className="sh__uiname">{user.displayName || user.email}</span>
                  {isVip && <span className="sh__vip">VIP</span>}
                  {tierBadge}
                </div>
                {user.displayName && <div className="sh__uimail">{user.email}</div>}
                {isVip && <div className="sh__viprow">Launch VIP - founding member</div>}
              </div>
            </div>
          ) : (
            <button onClick={signIn}>Sign in</button>
          )}

          {NAV.map((l) => (
            <a key={l.href} href={l.href} className={isActive(l.href) ? 'is-active' : ''}>
              {l.label}
            </a>
          ))}
          <div className="sh__mobile-label">Tools</div>
          {TOOLS.map((t) => (
            <a key={t.href} href={t.href} className={`sh__indent${path.startsWith(t.href) ? ' is-active' : ''}`}>
              {t.label}
            </a>
          ))}
          {user && (
            <>
              <div className="sh__mobile-sep" />
              {accountActions}
              <button onClick={doSignOut}>Sign out</button>
            </>
          )}
        </div>
      )}
    </header>
    </>
  )
}

// Collapsible "Have a promo code?" row + input, matching the main site's
// PromoCodeInput (menu variant) but in plain CSS. Redeems via the same endpoint.
function PromoRow({ open, setOpen, signedIn }: { open: boolean; setOpen: (v: boolean) => void; signedIn: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const redeem = async () => {
    if (!code.trim()) return
    setBusy(true); setMsg(null)
    try {
      const r = await redeemPromoCode(code)
      if (r.success) {
        setMsg({ ok: true, text: r.unlockSummary || r.message })
        setCode('')
      } else {
        setMsg({ ok: false, text: r.message })
      }
    } catch {
      setMsg({ ok: false, text: 'Failed to redeem code. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sh__promo">
      <button className="sh__promo-toggle" onClick={() => setOpen(!open)}>
        <span>🏷 Have a promo code?</span>
        <span className={`sh__caret${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="sh__promo-body">
          <div className="sh__promo-row">
            <input
              className="sh__promo-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void redeem() }}
              placeholder="Enter code"
              maxLength={20}
            />
            <button className="sh__promo-btn" onClick={redeem} disabled={!code.trim() || busy}>
              {busy ? '...' : 'Redeem'}
            </button>
          </div>
          {!signedIn && <p className="sh__promo-hint">Sign in required to redeem codes</p>}
          {msg && <p className={msg.ok ? 'sh__promo-ok' : 'sh__promo-err'}>{msg.text}</p>}
        </div>
      )}
    </div>
  )
}
