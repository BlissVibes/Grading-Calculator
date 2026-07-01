import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../config/firebase'
import AuthModal, { openAuthModal, completeEmailLinkSignIn } from './AuthModal'
import './SiteHeader.css'

// Shared ShinyCardboard site header, ported to plain CSS so the two tools carry
// the SAME top nav as the main site — navigation between pages stays fluid.
// All links are same-origin routes served by the Vercel proxy, so plain <a>
// (full-page navigation across the separately-deployed apps) is correct.
const NAV = [
  { href: '/', label: 'Home' },
  { href: '/grading', label: 'Card Grading' },
]
const TOOLS = [
  { href: '/calculator', label: 'Grading Calculator' },
  { href: '/portfolio', label: 'Portfolio Comparison' },
]

function initial(u: User): string {
  return (u.displayName || u.email || '?').charAt(0).toUpperCase()
}

export default function SiteHeader() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  // Finish a passwordless email-link sign-in if we arrived via one.
  useEffect(() => { void completeEmailLinkSignIn().catch(() => {}) }, [])

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

  const signIn = () => {
    setMenuOpen(false)
    openAuthModal()
  }
  const doSignOut = () => {
    setUserOpen(false)
    setMenuOpen(false)
    void signOut(auth)
  }

  return (
    <>
    <AuthModal />
    <header className="sh">
      <div className="sh__inner" ref={barRef}>
        <div className="sh__brand">
          <a className="sh__logo" href="/">Shiny Cardboard</a>
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
              </button>
              {userOpen && (
                <div className="sh__menu">
                  <div className="sh__userinfo">{user.displayName || user.email}</div>
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
          <div className="sh__mobile-sep" />
          {user ? (
            <button onClick={doSignOut}>Sign out ({user.displayName || user.email})</button>
          ) : (
            <button onClick={signIn}>Sign in</button>
          )}
        </div>
      )}
    </header>
    </>
  )
}
