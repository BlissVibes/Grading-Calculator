import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import type { SubData } from './entitlements'
import { isProActive } from './entitlements'

// Account helpers that bring the tool headers to full parity with the main
// site's Navbar (tier label + badge, profile flags, Stripe checkout/portal,
// promo redemption). Everything is reached same-origin behind the proxy, so the
// tools call the SAME /api/stripe and /api/redeem-promo endpoints as the hub.

export type EffTier = 'free' | 'silver' | 'gold' | 'platinum'

// Mirrors the site's tiers.ts effectiveTier (legacy 'pro' -> gold).
export function effectiveTier(sub: SubData): EffTier {
  if (isProActive(sub) && sub.plan) {
    if (sub.plan === 'platinum') return 'platinum'
    if (sub.plan === 'silver') return 'silver'
    return 'gold'
  }
  return 'free'
}

// Display label for the active tier (null if not subscribed). Mirrors
// subscriptionService.getTierLabel.
export function tierLabel(sub: SubData): string | null {
  if (!isProActive(sub)) return null
  if (sub.plan === 'platinum') return 'Pro Platinum'
  if (sub.plan === 'silver') return 'Silver'
  return 'Pro Gold'
}

export interface AccountInfo {
  sub: SubData
  isAdmin: boolean
  betaAccess: boolean
  launchVip: boolean
  stripeCustomerId: string | null
}

const EMPTY_ACCOUNT: AccountInfo = {
  sub: { status: null, plan: null, currentPeriodEnd: null },
  isAdmin: false,
  betaAccess: false,
  launchVip: false,
  stripeCustomerId: null,
}

// One Firestore read powering the whole header: subscription + profile flags +
// Stripe customer id (for "Manage subscription"). Mirrors the site's split
// getSubscription()/getUserProfile() but in a single doc read.
export async function getAccountInfo(uid: string): Promise<AccountInfo> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return EMPTY_ACCOUNT
    const d = snap.data()
    return {
      sub: {
        status: d.subscriptionStatus || null,
        plan: d.subscriptionPlan || null,
        currentPeriodEnd: d.subscriptionPeriodEnd || null,
      },
      isAdmin: d.isAdmin === true,
      betaAccess: d.betaAccess === true,
      launchVip: d.launchVip === true,
      stripeCustomerId: d.stripeCustomerId || null,
    }
  } catch {
    return EMPTY_ACCOUNT
  }
}

// Start a Stripe Checkout for a Pro subscription. Same contract as the site's
// subscriptionService.createCheckoutSession.
export async function createCheckoutSession(uid: string, email: string): Promise<string> {
  const res = await fetch('/api/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create-checkout', userId: uid, email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || 'Failed to create checkout')
  }
  const { url } = await res.json()
  return url
}

// Open the Stripe Customer Portal (manage/cancel). Same contract as the site's
// subscriptionService.createPortalSession.
export async function createPortalSession(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in required')
  const token = await user.getIdToken()
  const res = await fetch('/api/stripe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'create-portal' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || 'Failed to open billing portal')
  }
  const { url } = await res.json()
  return url
}

export interface RedeemResult {
  success: boolean
  message: string
  freeGrades?: number
  redemptionMessage?: string | null
  unlockSummary?: string
}

// Redeem a promo code via the hub's guarded endpoint (Admin SDK validates + caps
// server-side). Mirrors the site's promoService.redeemPromoCode.
export async function redeemPromoCode(code: string): Promise<RedeemResult> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return { success: false, message: 'Enter a promo code' }
  const user = auth.currentUser
  if (!user) return { success: false, message: 'Sign in required to redeem promo codes' }
  let token: string
  try {
    token = await user.getIdToken()
  } catch {
    return { success: false, message: 'Could not verify your session - try signing in again' }
  }
  let res: Response
  try {
    res = await fetch('/api/redeem-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: normalized }),
    })
  } catch {
    return { success: false, message: 'Network error - please try again' }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { success: false, message: data.error || 'Failed to redeem code' }
  return data as RedeemResult
}
