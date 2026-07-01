import useAdFree from '../hooks/useAdFree'
import { ADSTERRA } from '../config/ads'
import { AdsterraBanner } from './AdsterraBanner'
import { AdsterraNative } from './AdsterraNative'

/**
 * The bottom-of-page ad row. Ad-free (unlimited-tier) users see nothing; everyone
 * else — signed out, free, or Silver — sees a native banner alongside a 300x250
 * rectangle. Ported to inline styles (no Tailwind in these apps).
 */
export default function AdSlots() {
  const adFree = useAdFree()
  if (adFree) return null

  return (
    <div
      style={{
        marginTop: '2rem',
        paddingTop: '1rem',
        borderTop: '1px solid #1f2937',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <AdsterraNative />
      </div>
      <div style={{ flexShrink: 0 }}>
        <AdsterraBanner unit={ADSTERRA.rectangle} />
      </div>
    </div>
  )
}
