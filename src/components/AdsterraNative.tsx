import { useEffect, useRef, useState } from 'react'
import { ADSTERRA } from '../config/ads'

/**
 * Adsterra Native Banner — contained + fill-detecting.
 *
 * Runs inside a sandboxed iframe: the ad is confined to this box and CANNOT
 * touch your page, read cookies/DOM (no `allow-same-origin`), or redirect the
 * page (no `allow-top-navigation`). It MAY open its own link in a new tab when
 * the user actually clicks the ad (`allow-popups`) — a legit click-through, not
 * a sitewide popunder. The iframe reports its content height via postMessage.
 *
 * Fill detection: Adsterra often serves nothing (unapproved domain, no geo
 * inventory, VPN/datacenter IP, ad blocker), leaving an empty box. If the
 * reported height stays below FILL_THRESHOLD we collapse the slot to nothing
 * instead of showing a blank white rectangle.
 *
 * Ported from the ShinyCardboard website (inline styles — no Tailwind here).
 */

const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
const RESIZE_MSG = 'sc-native-resize'
// A real native ad is well over this; an empty response leaves a near-zero body.
const FILL_THRESHOLD = 40

function buildSrcDoc(): string {
  const { container, src } = ADSTERRA.native
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:transparent}</style></head><body>',
    `<div id="${container}"></div>`,
    `<script async data-cfasync="false" src="${src}"><\/script>`,
    // Report our content height so the parent can size (and hide) the slot.
    '<script>',
    `function p(){try{parent.postMessage({t:'${RESIZE_MSG}',h:document.body.scrollHeight},'*')}catch(e){}}`,
    'try{new ResizeObserver(p).observe(document.body)}catch(e){}',
    "window.addEventListener('load',p);setInterval(p,1000);",
    '<\/script>',
    '</body></html>',
  ].join('')
}

export function AdsterraNative({
  className = '',
  onLoaded,
}: {
  className?: string
  onLoaded?: (loaded: boolean) => void
}) {
  // Render the iframe tall enough for the ad to lay out and measure, but keep
  // the wrapper collapsed until we know it actually filled.
  const [height, setHeight] = useState(250)
  const [filled, setFilled] = useState(false)
  const notified = useRef(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    function onMsg(e: MessageEvent) {
      const d = e.data as { t?: string; h?: number } | null
      if (d && d.t === RESIZE_MSG && typeof d.h === 'number' && d.h >= FILL_THRESHOLD) {
        setHeight(Math.min(Math.ceil(d.h), 1000))
        if (!notified.current) {
          notified.current = true
          setFilled(true)
          onLoaded?.(true)
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [onLoaded])

  if (import.meta.env.DEV) {
    return (
      <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            border: '1px dashed #4b5563',
            borderRadius: 4,
            padding: '24px 32px',
            color: '#6b7280',
            fontSize: 12,
            fontFamily: 'monospace',
          }}
        >
          Adsterra Native Banner (sandboxed)
        </div>
      </div>
    )
  }

  return (
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
        title="Sponsored"
        sandbox={SANDBOX}
        srcDoc={buildSrcDoc()}
        scrolling="no"
        style={{ border: 'none', width: '100%', height, display: 'block', overflow: 'hidden' }}
      />
    </div>
  )
}

export default AdsterraNative
