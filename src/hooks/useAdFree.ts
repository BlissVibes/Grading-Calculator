import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../config/firebase'
import { getSubscription, isAdFree } from '../services/entitlements'

/**
 * Returns true when the current user is on an unlimited (ad-free) tier and ads
 * should be hidden. Defaults to FALSE — i.e. SHOW ads — when signed out, while
 * loading, or on any error. Silver (paid but ad-supported) stays false.
 *
 * Subscribes to auth changes and re-checks the subscription whenever the signed
 * in user changes. The auth listener is cleaned up on unmount, and results from
 * a stale async lookup are ignored if the user changed mid-flight.
 */
export default function useAdFree(): boolean {
  const [adFree, setAdFree] = useState(false)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (!cancelled) setAdFree(false)
        return
      }
      getSubscription(user.uid)
        .then((sub) => {
          if (!cancelled) setAdFree(isAdFree(sub))
        })
        .catch(() => {
          if (!cancelled) setAdFree(false)
        })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return adFree
}
