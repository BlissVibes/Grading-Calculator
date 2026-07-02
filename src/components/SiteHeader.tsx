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

// Account-menu icons + colors, matched EXACTLY to the main site's Navbar so every
// page shows the same coloured glyphs (green tier check, purple tag/link, yellow
// heart, amber upgrade/beta, gray gear/sign-out).
const IC = {
  bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
  star: 'M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  gear: [
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  ],
  tag: 'M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 8V4a1 1 0 011-1z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  signout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
} as const

function MenuIcon({ d, color, fill = false }: { d: string | readonly string[]; color: string; fill?: boolean }) {
  const paths = Array.isArray(d) ? d : [d as string]
  return (
    <svg
      className="sh__mi"
      viewBox="0 0 24 24"
      style={{ color }}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  )
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
  const [socialsOpen, setSocialsOpen] = useState(false)
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
  // Show a BETA badge on the beta channel. The beta site proxies the tools
  // same-origin, so the browser host is the beta site's host — which is either
  // the custom subdomain (beta.shinycardboard.win) OR Vercel's git-beta preview
  // host. Match both so the badge stays in parity with the hub's IS_BETA.
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isBeta = host.startsWith('beta.') || host.includes('git-beta')

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
        <a href={BETA_SITE_URL} className="sh__amber"><MenuIcon d={IC.bolt} color="#fcd34d" />Beta site</a>
      )}
      {!isPro && (
        <button onClick={handleUpgrade} disabled={upgrading} className="sh__amber">
          <MenuIcon d={IC.star} color="#fbbf24" fill />
          {upgrading ? 'Redirecting...' : 'Upgrade to Pro - $4.99/mo'}
        </button>
      )}
      {isPro && (
        <>
          <div className="sh__tierrow"><MenuIcon d={IC.check} color="#4ade80" />{label || 'Pro subscriber'}</div>
          {isSilver && (
            <button onClick={handleUpgrade} disabled={upgrading} className="sh__amber">
              <MenuIcon d={IC.star} color="#fbbf24" fill />
              {upgrading ? 'Redirecting...' : 'Upgrade to Pro Gold'}
            </button>
          )}
          {hasStripeCustomer && (
            <button onClick={handleManage} disabled={managing}>
              <MenuIcon d={IC.gear} color="#9ca3af" />
              {managing ? 'Opening...' : 'Manage subscription'}
            </button>
          )}
        </>
      )}
      <PromoRow open={promoOpen} setOpen={setPromoOpen} signedIn={!!user} />
      <a href={PAYPAL_DONATE_URL} target="_blank" rel="noopener noreferrer" className="sh__donate">
        <MenuIcon d={IC.heart} color="#facc15" fill />Donate
      </a>
      <SocialsRow open={socialsOpen} setOpen={setSocialsOpen} />
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
                  <button onClick={doSignOut}><MenuIcon d={IC.signout} color="#9ca3af" />Sign out</button>
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
              <button onClick={doSignOut}><MenuIcon d={IC.signout} color="#9ca3af" />Sign out</button>
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
        <span className="sh__milabel"><MenuIcon d={IC.tag} color="#8b5cf6" />Have a promo code?</span>
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

// Our socials. Entries flagged `hidden` are WIRED (data + icon ready) but not
// shown yet — set `hidden: false` (and confirm the handle) to reveal one. Only
// Instagram + X are live for now. Keep this list in sync with the main site's
// Navbar so every account menu across the ecosystem looks and works the same.
type Social = { label: string; href: string; hidden: boolean; path: string }
const SOCIALS: Social[] = [
  {
    label: 'Instagram',
    href: 'https://instagram.com/shinycardboard.win',
    hidden: false,
    path: 'M12 2.2c-2.7 0-3 .01-4.06.06-1.06.05-1.79.22-2.42.46-.65.26-1.2.6-1.76 1.15-.55.55-.89 1.1-1.15 1.76-.24.63-.41 1.36-.46 2.42C2.21 9.11 2.2 9.4 2.2 12s.01 2.89.06 3.95c.05 1.06.22 1.79.46 2.42.26.65.6 1.2 1.15 1.76.55.55 1.1.89 1.76 1.15.63.24 1.36.41 2.42.46 1.06.05 1.36.06 4.06.06s2.89-.01 3.95-.06c1.06-.05 1.79-.22 2.42-.46.65-.26 1.2-.6 1.76-1.15.55-.55.89-1.1 1.15-1.76.24-.63.41-1.36.46-2.42.05-1.06.06-1.36.06-4.06s-.01-2.89-.06-3.95c-.05-1.06-.22-1.79-.46-2.42-.26-.65-.6-1.2-1.15-1.76-.55-.55-1.1-.89-1.76-1.15-.63-.24-1.36-.41-2.42-.46C14.89 2.21 14.6 2.2 12 2.2zm0 1.8c2.67 0 2.98.01 4.03.06.97.04 1.5.21 1.85.34.47.18.8.4 1.15.75.35.35.57.68.75 1.15.13.35.3.88.34 1.85.05 1.05.06 1.36.06 4.03s-.01 2.98-.06 4.03c-.04.97-.21 1.5-.34 1.85-.18.47-.4.8-.75 1.15-.35.35-.68.57-1.15.75-.35.13-.88.3-1.85.34-1.05.05-1.36.06-4.03.06s-2.98-.01-4.03-.06c-.97-.04-1.5-.21-1.85-.34-.47-.18-.8-.4-1.15-.75-.35-.35-.57-.68-.75-1.15-.13-.35-.3-.88-.34-1.85C4.01 14.98 4 14.67 4 12s.01-2.98.06-4.03c.04-.97.21-1.5.34-1.85.18-.47.4-.8.75-1.15.35-.35.68-.57 1.15-.75.35-.13.88-.3 1.85-.34C9.02 4.01 9.33 4 12 4zm0 3.06A4.94 4.94 0 1012 16.94 4.94 4.94 0 0012 7.06zm0 8.14A3.2 3.2 0 1112 8.8a3.2 3.2 0 010 6.4zm5.14-8.34a1.15 1.15 0 11-2.3 0 1.15 1.15 0 012.3 0z',
  },
  {
    label: 'X',
    href: 'https://x.com/shinycardboard_',
    hidden: false,
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.658l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z',
  },
  // ── Wired but hidden (flip hidden:false + confirm the handle to reveal) ──
  {
    label: 'TikTok',
    href: 'https://tiktok.com/@shinycardboard.win',
    hidden: true,
    path: 'M16.6 5.82a4.28 4.28 0 01-1.05-2.82h-3.3v13.05a2.59 2.59 0 01-2.59 2.5 2.59 2.59 0 01-2.59-2.59 2.59 2.59 0 013.4-2.46V7.72a5.88 5.88 0 00-6.9 5.79 5.88 5.88 0 0011.76 0V8.3a7.5 7.5 0 004.4 1.42V6.42a4.28 4.28 0 01-1.54-.6z',
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@shinycardboard',
    hidden: true,
    path: 'M23.5 6.51a2.78 2.78 0 00-1.96-1.96C19.8 4.08 12 4.08 12 4.08s-7.8 0-9.54.47A2.78 2.78 0 00.5 6.51 29 29 0 000 12a29 29 0 00.5 5.49 2.78 2.78 0 001.96 1.96c1.74.47 9.54.47 9.54.47s7.8 0 9.54-.47a2.78 2.78 0 001.96-1.96A29 29 0 0024 12a29 29 0 00-.5-5.49zM9.6 15.4V8.6l6 3.4-6 3.4z',
  },
  {
    label: 'Twitch',
    href: 'https://twitch.tv/shinycardboard',
    hidden: true,
    path: 'M2.15 0L.54 4.12v16.83h5.73V24h3.22l3.05-3.05h4.66L23.46 14.5V0H2.15zm19.16 13.61l-3.58 3.58h-5.73l-3.05 3.05v-3.05H4.51V2.15h16.8v11.46zM17.46 6.34h-2.15v6.19h2.15V6.34zm-5.73 0H9.58v6.19h2.15V6.34z',
  },
  {
    label: 'Kick',
    href: 'https://kick.com/shinycardboard',
    hidden: true,
    path: 'M1.5 0h7.5v4.5h2.25V2.25h2.25V0H24v9h-2.25v2.25H19.5v1.5h2.25V15H24v9h-8.25v-2.25H13.5V19.5h-2.25V24H1.5V0z',
  },
]

// Collapsible "Our socials" row: an inline sub-list of social links inside the
// account menu, under Donate. Renders nothing if no socials are currently shown.
function SocialsRow({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const visible = SOCIALS.filter((s) => !s.hidden)
  if (visible.length === 0) return null
  return (
    <div className="sh__promo">
      <button className="sh__promo-toggle" onClick={() => setOpen(!open)}>
        <span className="sh__milabel"><MenuIcon d={IC.link} color="#8b5cf6" />Our socials</span>
        <span className={`sh__caret${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="sh__socials">
          {visible.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="sh__social">
              <svg className="sh__social-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={s.path} />
              </svg>
              {s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
