import { useEffect, useState } from 'react'
import type { AdsterraUnit } from '../config/ads'

/**
 * Adsterra iframe banner.
 *
 * Adsterra's stock snippet sets a GLOBAL `atOptions` + uses document.write,
 * which clobbers across multiple units and fights React's DOM. We instead give
 * each banner its own isolated <iframe srcDoc>, so every unit has its own
 * atOptions and document context. Reliable, no global collisions.
 *
 * Ported from the ShinyCardboard website. These apps DON'T use Tailwind, so
 * every className has been replaced with an inline style object. The production
 * ad logic (srcDoc builder, iframe sandbox, scrolling="no") is byte-for-byte
 * identical to the website version.
 */

function buildSrcDoc({ key, width, height }: AdsterraUnit): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>',
    '<script type="text/javascript">',
    `atOptions={'key':'${key}','format':'iframe','height':${height},'width':${width},'params':{}};`,
    '<\/script>',
    `<script type="text/javascript" src="https://www.highperformanceformat.com/${key}/invoke.js"><\/script>`,
    '</body></html>',
  ].join('')
}

export function AdsterraBanner({ unit, className = '' }: { unit: AdsterraUnit; className?: string }) {
  if (import.meta.env.DEV) {
    return (
      <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: unit.width,
            height: unit.height,
            border: '1px dashed #4b5563',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          Adsterra {unit.width}×{unit.height}
        </div>
      </div>
    )
  }

  return (
    <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
      <iframe
        title="Advertisement"
        width={unit.width}
        height={unit.height}
        scrolling="no"
        srcDoc={buildSrcDoc(unit)}
        // Confine Adsterra to this iframe: it can't touch your page (no
        // `allow-same-origin`) or redirect it (no `allow-top-navigation`), so a
        // tap on YOUR content never opens a tab. A click ON the ad may open its
        // link (`allow-popups`) — a legit click-through, not a sitewide popunder.
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        style={{ border: 'none', width: unit.width, height: unit.height, overflow: 'hidden', display: 'block' }}
      />
    </div>
  )
}

/**
 * Picks the desktop or mobile unit based on viewport so we never load a hidden
 * banner (which would burn an impression with no view). Initial value is read
 * synchronously to avoid a desktop→mobile double-load on first paint.
 */
export function ResponsiveAdsterraBanner({
  desktop,
  mobile,
  className = '',
}: {
  desktop: AdsterraUnit
  mobile: AdsterraUnit
  className?: string
}) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return <AdsterraBanner unit={isMobile ? mobile : desktop} className={className} />
}

export default AdsterraBanner
