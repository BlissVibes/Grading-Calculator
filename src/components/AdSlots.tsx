import { useCallback, useState } from 'react'
import useAdFree from '../hooks/useAdFree'
import { ADSTERRA } from '../config/ads'
import { AdsterraBanner } from './AdsterraBanner'
import { AdsterraNative } from './AdsterraNative'

/**
 * The bottom-of-page ad row. Ad-free (unlimited-tier) users see nothing; everyone
 * else — signed out, free, or Silver — sees a native banner alongside a 300x250
 * rectangle. Ported to inline styles (no Tailwind in these apps).
 *
 * Each ad reports whether it actually filled (Adsterra frequently serves nothing
 * on unapproved domains / VPN IPs / no inventory). The separator + spacing only
 * appear once at least one ad fills, so an empty row shows nothing at all rather
 * than a blank white box with a divider line.
 */
export default function AdSlots() {
  const adFree = useAdFree()
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
        gap: '1rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <AdsterraNative onLoaded={onNative} />
      </div>
      <div style={{ flexShrink: 0 }}>
        <AdsterraBanner unit={ADSTERRA.rectangle} onLoaded={onBanner} />
      </div>
    </div>
  )
}
