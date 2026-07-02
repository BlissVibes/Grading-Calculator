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
 * UX: the ads are pushed well BELOW the functional UI (extra gap, more on mobile)
 * and wrapped in an outlined, labelled box ("Ads Help Us Pay the Bills") so it's
 * obvious the images below the tool are advertisements, not part of the app. The
 * box + label + spacing only appear once a real ad actually fills — Adsterra
 * frequently serves nothing (unapproved domain, no inventory, VPN/datacenter IP),
 * and an empty labelled box would look broken.
 *
 * Layout mirrors the main site's `flex-col md:flex-row`: the ads STACK on mobile
 * (native full-width on top, rectangle centered below) and sit side-by-side on
 * desktop.
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
        // Push the ad block well clear of the functional UI so it's never mistaken
        // for part of the tool — with extra breathing room on mobile.
        marginTop: anyFilled ? (isDesktop ? '6rem' : '7rem') : 0,
      }}
    >
      <div
        style={{
          // Outlined "these are ads" box — only drawn once a real ad fills.
          border: anyFilled ? '1px solid #2d3148' : 'none',
          borderRadius: anyFilled ? '0.75rem' : 0,
          background: anyFilled ? 'rgba(26, 26, 46, 0.4)' : 'transparent',
          padding: anyFilled ? '0.75rem 1rem 1rem' : 0,
        }}
      >
        {anyFilled && (
          <div
            style={{
              textAlign: 'center',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: '#8b90a8',
              marginBottom: '0.85rem',
            }}
          >
            💛 Ads Help Us Pay the Bills
          </div>
        )}
        <div
          style={{
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
      </div>
    </div>
  )
}
