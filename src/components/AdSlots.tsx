import { useCallback, useEffect, useState } from 'react'
import useAdFree from '../hooks/useAdFree'
import { ADSTERRA } from '../config/ads'
import { AdsterraBanner } from './AdsterraBanner'
import { AdsterraNative } from './AdsterraNative'

// Match the main site's ad row: STACKED on mobile, side-by-side on desktop
// (min-width: 768px === Tailwind's `md`). Read synchronously so we don't flip
// layout after first paint.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}

/**
 * The bottom-of-page ad row. Ad-free (unlimited-tier) users see nothing; everyone
 * else — signed out, free, or Silver — sees a native banner alongside a 300x250
 * rectangle. Ported to inline styles (no Tailwind in these apps).
 *
 * Layout mirrors the main site's `flex-col md:flex-row`: the ads STACK on mobile
 * (native full-width on top, rectangle centered below) and sit side-by-side on
 * desktop. The old always-row layout crushed the native ad into a narrow column
 * beside the rectangle on phones.
 *
 * Each ad reports whether it actually filled (Adsterra frequently serves nothing
 * on unapproved domains / VPN IPs / no inventory). The separator + spacing only
 * appear once at least one ad fills, so an empty row shows nothing at all rather
 * than a blank white box with a divider line.
 */
export default function AdSlots() {
  const adFree = useAdFree()
  const isDesktop = useIsDesktop()
  const [nativeFilled, setNativeFilled] = useState(false)
  const [bannerFilled, setBannerFilled] = useState(false)
  // Stable callbacks so the ad components' message-listener effects don't
  // re-subscribe on every host re-render (which happens on every keystroke).
  const onNative = useCallback(() => setNativeFilled(true), [])
  const onBanner = useCallback(() => setBannerFilled(true), [])

  if (adFree) return null

  const anyFilled = nativeFilled || bannerFilled

  return (
    <div
      style={{
        // Only take up space / draw the divider once something actually renders.
        marginTop: anyFilled ? '2rem' : 0,
        paddingTop: anyFilled ? '1rem' : 0,
        borderTop: anyFilled ? '1px solid #1f2937' : 'none',
        display: 'flex',
        flexDirection: isDesktop ? 'row' : 'column',
        gap: '1.5rem',
        justifyContent: 'center',
        alignItems: isDesktop ? 'flex-start' : 'center',
      }}
    >
      <div style={isDesktop ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
        <AdsterraNative onLoaded={onNative} />
      </div>
      <div style={{ flexShrink: 0 }}>
        <AdsterraBanner unit={ADSTERRA.rectangle} onLoaded={onBanner} />
      </div>
    </div>
  )
}
