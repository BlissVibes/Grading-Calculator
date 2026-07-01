import { doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

// Minimal, faithful port of the website's subscription logic (see the site's
// subscriptionService.ts + tiers.ts). Only the pieces these apps need: read the
// user's subscription from Firestore and decide (a) whether Pro is active and
// (b) whether they should be ad-free. Kept intentionally small.

export type SubData = {
  status: string | null
  plan: string | null
  currentPeriodEnd: string | null
}

const EMPTY: SubData = {
  status: null,
  plan: null,
  currentPeriodEnd: null,
}

// Read the user's subscription doc from Firestore. Mirrors the website's field
// mapping: subscriptionStatus -> status, subscriptionPlan -> plan,
// subscriptionPeriodEnd -> currentPeriodEnd. Returns nulls on missing/error.
export async function getSubscription(uid: string): Promise<SubData> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return EMPTY
    const data = snap.data()
    return {
      status: data.subscriptionStatus || null,
      plan: data.subscriptionPlan || null,
      currentPeriodEnd: data.subscriptionPeriodEnd || null,
    }
  } catch {
    return EMPTY
  }
}

// True if the account has an active paid plan that hasn't expired. Mirrors the
// website's isProSubscriber().
export function isProActive(sub: SubData): boolean {
  return (
    sub.status === 'active' &&
    !!sub.plan &&
    (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date())
  )
}

// True only for the unlimited tiers (Gold, Platinum, or legacy Pro). CRITICAL:
// Silver is a PAID tier but STILL sees ads, so isAdFree is FALSE for silver —
// this mirrors the site hiding ads only for the unlimited tiers.
export function isAdFree(sub: SubData): boolean {
  if (!isProActive(sub)) return false
  return sub.plan === 'gold' || sub.plan === 'platinum' || sub.plan === 'pro'
}
