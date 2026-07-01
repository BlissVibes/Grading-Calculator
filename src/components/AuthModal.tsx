import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendSignInLinkToEmail,
} from 'firebase/auth'
import { auth } from '../config/firebase'
import './AuthModal.css'

// Plain-CSS port of the main site's AuthModal so the tools carry the SAME
// sign-in options (Google + email/password + passwordless email link). Because
// the tools serve same-origin under the main domain, they share the site's
// Firebase session AND can reach the site's guarded /api/request-signin-link.

// ── Global opener ─────────────────────────────────────────────────────────────
type Opener = () => void
const openers = new Set<Opener>()
export function openAuthModal(): void {
  openers.forEach((o) => o())
}

const EMAIL_LINK_STORAGE_KEY = 'sc_email_for_signin'

// Complete a passwordless email-link sign-in if the current URL is one. Call
// once on load (SiteHeader does). Cleans the one-time code out of the URL.
export async function completeEmailLinkSignIn(): Promise<boolean> {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false
  let email: string | null = null
  try { email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) } catch { /* ignore */ }
  if (!email) email = window.prompt('Confirm your email to finish signing in') || null
  if (!email) return false
  await signInWithEmailLink(auth, email, window.location.href)
  try { window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY) } catch { /* ignore */ }
  try {
    const url = new URL(window.location.href)
    for (const p of ['oobCode', 'apiKey', 'mode', 'lang', 'continueUrl']) url.searchParams.delete(p)
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash)
  } catch { /* ignore */ }
  return true
}

type Mode = 'signin' | 'signup'

function friendlyError(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  switch (code) {
    case 'auth/invalid-email': return 'That email address looks invalid.'
    case 'auth/missing-password': return 'Enter your password.'
    case 'auth/weak-password': return 'Password is too weak — use at least 6 characters.'
    case 'auth/email-already-in-use': return 'That email is already registered — try signing in instead.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Incorrect email or password.'
    case 'auth/account-exists-with-different-credential': return 'That email is registered with Google — continue with Google.'
    case 'auth/too-many-requests': return 'Too many attempts — please wait a bit and try again.'
    case 'auth/network-request-failed': return 'Network error — check your connection and retry.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return ''
    default:
      if (e instanceof Error && e.message) return e.message
      return 'Something went wrong — please try again.'
  }
}

async function requestSignInLink(email: string): Promise<void> {
  // Folded into /api/redeem-promo (action dispatch) on the main site to stay
  // under the Vercel Hobby-plan 12-function limit; reached same-origin via the
  // proxy. Absolute path so it hits the main domain, not the tool's base path.
  const res = await fetch('/api/redeem-promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signin-link', email }),
  })
  let data: { ok?: boolean; message?: string } = {}
  try { data = await res.json() } catch { /* ignore */ }
  if (!res.ok || !data.ok) throw new Error(data.message || 'Could not send a sign-in link — try again.')
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}${import.meta.env.BASE_URL}`,
    handleCodeInApp: true,
  })
  try { window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email) } catch { /* ignore */ }
}

// Send the branded verification email via the site's Resend endpoint (reached
// same-origin behind the proxy); fall back to Firebase's built-in email if it
// isn't configured or errors, so a new user always gets a verification email.
async function sendVerificationEmail(user: import('firebase/auth').User): Promise<void> {
  try {
    const token = await user.getIdToken()
    const res = await fetch('/api/send-verify-email', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return
  } catch {
    // fall through to Firebase's built-in email
  }
  try { await sendEmailVerification(user) } catch { /* non-fatal */ }
}

export default function AuthModal() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const o = () => {
      setOpen(true); setMode('signin'); setError(null); setSuccess(null); setPassword('')
    }
    openers.add(o)
    return () => { openers.delete(o) }
  }, [])

  const close = () => {
    setOpen(false); setBusy(false); setError(null); setSuccess(null); setPassword('')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const doGoogle = async () => {
    setBusy(true); setError(null)
    try { await signInWithPopup(auth, new GoogleAuthProvider()); close() }
    catch (e) { const m = friendlyError(e); if (m) setError(m); setBusy(false) }
  }

  const doEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await sendVerificationEmail(cred.user)
        setSuccess(
          `You're signed in! We emailed a verification link to ${email.trim()}. ` +
          `Verify it to enable passwordless "email me a link" sign-in later.`,
        )
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
        close()
      }
    } catch (err) { const m = friendlyError(err); if (m) setError(m); setBusy(false) }
  }

  const doForgot = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap “Forgot password”.'); return }
    setBusy(true); setError(null)
    try { await sendPasswordResetEmail(auth, email.trim()); setSuccess(`Password reset email sent to ${email.trim()}.`) }
    catch (err) { const m = friendlyError(err); if (m) setError(m); setBusy(false) }
  }

  const doEmailLink = async () => {
    if (!email.trim()) { setError('Enter your email first, then request a sign-in link.'); return }
    setBusy(true); setError(null)
    try { await requestSignInLink(email.trim()); setSuccess(`Check your inbox — we sent a one-time sign-in link to ${email.trim()}.`) }
    catch (err) { const m = friendlyError(err); if (m) setError(m); setBusy(false) }
  }

  return (
    <div className="am__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="am__card">
        <div className="am__head">
          <h2 className="am__title">
            {success ? 'Almost there' : mode === 'signup' ? 'Create your account' : 'Sign in'}
          </h2>
          <button className="am__close" onClick={close} aria-label="Close">&times;</button>
        </div>

        {success ? (
          <div className="am__success">
            <p>{success}</p>
            <button className="am__primary" onClick={close}>Got it</button>
          </div>
        ) : (
          <>
            <button className="am__google" onClick={doGoogle} disabled={busy}>
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <div className="am__or"><span>or</span></div>

            <form onSubmit={doEmailPassword} className="am__form">
              <input
                type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="am__input"
              />
              <input
                type="password" required minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Choose a password (6+ characters)' : 'Password'} className="am__input"
              />
              {error && <p className="am__error">{error}</p>}
              <button type="submit" className="am__primary" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <div className="am__row">
              <button className="am__link" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null) }}>
                {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
              </button>
              {mode === 'signin' && (
                <button className="am__muted" onClick={doForgot} disabled={busy}>Forgot password?</button>
              )}
            </div>

            {mode === 'signin' && (
              <button className="am__linkfull" onClick={doEmailLink} disabled={busy}>
                Prefer a link? <span className="am__accent">Email me a one-time sign-in link</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
