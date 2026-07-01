import { useEffect, useState } from 'react'
import { ADSTERRA } from '../config/ads'

/**
 * Adsterra Native Banner — contained.
 *
 * The native tag used to load as a script in the MAIN page context, so its
 * popunder code could open a new tab on a tap ANYWHERE on the site. We now run
 * it inside a sandboxed iframe: the ad is confined to this box and CANNOT touch
 * your page, read cookies/DOM (no `allow-same-origin`), or redirect the page
 * (no `allow-top-navigation`). It MAY open its own link in a new tab when the
 * user actually clicks the ad (`allow-popups`) — that's a legit click-through,
 * not a sitewide popunder. The iframe auto-sizes to the ad via postMessage.
 *
 * Ported from the ShinyCardboard website. These apps DON'T use Tailwind, so the
 * DEV placeholder className is replaced with an inline style object. The
 * production ad logic (srcDoc builder, sandbox, scrolling="no", and the
 * postMessage resize handshake) is byte-for-byte identical to the site version.
 */

// Confine the ad, but let a click ON the ad open its destination.
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
const RESIZE_MSG = 'sc-native-resize'

function buildSrcDoc(): string {
  const { container, src } = ADSTERRA.native
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:transparent}</style></head><body>',
    `<div id="${container}"></div>`,
    `<script async data-cfasync="false" src="${src}"><\/script>`,
    // Report our content height to the parent so it can size the iframe (the
    // parent can't measure an opaque-origin sandboxed iframe directly).
    '<script>',
    `function p(){try{parent.postMessage({t:'${RESIZE_MSG}',h:document.body.scrollHeight},'*')}catch(e){}}`,
    'try{new ResizeObserver(p).observe(document.body)}catch(e){}',
    "window.addEventListener('load',p);setInterval(p,1500);",
    '<\/script>',
    '</body></html>',
  ].join('')
}

export function AdsterraNative({ className = '' }: { className?: string }) {
  const [height, setHeight] = useState(140)

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { t?: string; h?: number } | null
      if (d && d.t === RESIZE_MSG && typeof d.h === 'number' && d.h > 0) {
        setHeight(Math.min(Math.max(Math.ceil(d.h), 60), 1000))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

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
    <div className={className} style={{ display: 'flex', justifyContent: 'center' }}>
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
