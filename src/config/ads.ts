/**
 * Adsterra display banner units (no-approval network used NOW for real banners).
 * iframe banners load from highperformanceformat.com; the native banner loads
 * its own async invoke.js into a fixed container id.
 *
 * CHANNEL-AWARE KEYS: Adsterra ad units are tied to the approved domain they were
 * created under, so beta.shinycardboard.win needs its OWN unit keys, separate
 * from production's. We keep BOTH sets here and pick by hostname at runtime — so
 * the SAME code deploys to beta and production unchanged; only the keys differ.
 *
 * Keys mirror the ShinyCardboard website's src/config/ads.ts. AdSense config is
 * intentionally omitted — these apps only use Adsterra.
 */
export interface AdsterraUnit {
  key: string
  width: number
  height: number
}

export interface AdsterraNativeUnit {
  container: string
  src: string
}

export interface AdsterraSet {
  leaderboard: AdsterraUnit
  mobileLeaderboard: AdsterraUnit
  rectangle: AdsterraUnit
  native: AdsterraNativeUnit
}

// Production units (serve on shinycardboard.win — the approved domain).
const PROD: AdsterraSet = {
  leaderboard: { key: '9a9f39e533f81d1d30d429d380855268', width: 728, height: 90 },
  mobileLeaderboard: { key: 'c3c5d0facc6c264d28e693a6997cc277', width: 320, height: 50 },
  rectangle: { key: '52b08311c6e33b410f0ef606ab7da39f', width: 300, height: 250 },
  native: {
    container: 'container-aecf2c7694ec0278a0bf97589c5ff309',
    src: 'https://pl29887474.effectivecpmnetwork.com/aecf2c7694ec0278a0bf97589c5ff309/invoke.js',
  },
}

// Beta units (serve on beta.shinycardboard.win — added separately in Adsterra).
const BETA: AdsterraSet = {
  leaderboard: { key: 'a01eaa0249ac21071fc546276a148b65', width: 728, height: 90 },
  mobileLeaderboard: { key: '4231c9f58334403c35211dc6f2d74dcd', width: 320, height: 50 },
  rectangle: { key: '8730bdf8c8a282ebb2d98492ab0323ea', width: 300, height: 250 },
  native: {
    container: 'container-4a0bb410e592a7724dd5674479ad7dd4',
    src: 'https://pl30158823.effectivecpmnetwork.com/4a0bb410e592a7724dd5674479ad7dd4/invoke.js',
  },
}

// Adsterra validates by the serving domain, so select on hostname (not the
// ?beta opt-in): the beta keys only serve on the beta subdomain.
const isBetaHost = typeof window !== 'undefined' && window.location.hostname.startsWith('beta.')

export const ADSTERRA: AdsterraSet = isBetaHost ? BETA : PROD
