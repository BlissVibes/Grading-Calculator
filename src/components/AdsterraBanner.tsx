import { useEffect, useRef, useState } from 'react'
import type { AdsterraUnit } from '../config/ads'

/**
 * Adsterra iframe banner.
 *
 * Adsterra's stock snippet sets a GLOBAL `atOptions` + uses document.write,
 * which clobbers across multiple units and fights React's DOM. We instead give
 * each banner its own isolated <iframe srcDoc>, so every unit has its own
 * atOptions and document context. Reliable, no global collisions.
 *
 * Fill detection: the srcDoc reports its real content height back via
 * postMessage. Adsterra frequently serves NOTHING (unapproved domain, no
 * inventory for the geo, VPN/datacenter IP, ad blocker) — which would otherwise
 * leave an empty white box. If the reported height stays below FILL_THRESHOLD we
 * treat the slot as unfilled and collapse it to nothing.
 *
 * Ported from the ShinyCardboard website (inline styles — these apps have no
 * Tailwind). The sandbox flags and srcDoc ad snippet match the site version.
 */

const RESIZE_MSG = 'sc-banner-resize'
// A real banner in these slots is tall (rectangle = 250). An empty Adsterra
// response leaves a near-zero body, so anything under this is "unfilled".
const FILL_THRESHOLD = 30

function buildSrcDoc({ key, width, height }: AdsterraUnit): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>',
    '<script type="text/javascript">',
    `atOptions={'key':'${key}','format':'iframe','height':${height},'width':${width},'params':{}};`,
    '<\/script>',
    `<script type="text/javascript" src="https://www.highperformanceformat.com/${key}/invoke.js"><\/script>`,
    // Report our content height so the parent can hide the slot if no ad fills
    // (it can't measure an opaque-origin sandboxed iframe directly).
    '<script>',
    `function p(){try{parent.postMessage({t:'${RESIZE_MSG}',k:'${key}',h:document.body.scrollHeight},'*')}catch(e){}}`,
    'try{new ResizeObserver(p).observe(document.body)}catch(e){}',
    "window.addEventListener('load',p);setInterval(p,1000);",
    '<\/script>',
    '</body></html>',
  ].join('')
}

export function AdsterraBanner({
  unit,
  className = '',
  onLoaded,
}: {
  unit: AdsterraUnit
  className?: string
  onLoaded?: (loaded: boolean) => void
}) {
  const [filled, setFilled] = useState(false)
  const notified = useRef(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    function onMsg(e: MessageEvent) {
      const d = e.data as { t?: string; k?: string; h?: number } | null
      if (d && d.t === RESIZE_MSG && d.k === unit.key && typeof d.h === 'number' && d.h >= FILL_THRESHOLD) {
        if (!notified.current) {
          notified.current = true
          setFilled(true)
          onLoaded?.(true)
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [unit.key, onLoaded])

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
    // While unfilled the wrapper is collapsed to 0 height and clips the iframe,
    // so an empty ad shows nothing — but the iframe stays mounted so its ad
    // script runs and can report a fill.
    <div
      className={className}
      style={{
        display: 'flex',
        justifyContent: 'center',
        height: filled ? undefined : 0,
        overflow: 'hidden',
      }}
    >
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
  onLoaded,
}: {
  desktop: AdsterraUnit
  mobile: AdsterraUnit
  className?: string
  onLoaded?: (loaded: boolean) => void
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

  return <AdsterraBanner unit={isMobile ? mobile : desktop} className={className} onLoaded={onLoaded} />
}

export default AdsterraBanner
