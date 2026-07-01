/**
 * Adsterra display banner units (no-approval network used NOW for real banners).
 * iframe banners load from highperformanceformat.com; the native banner loads
 * its own async invoke.js into a fixed container id.
 *
 * The key strings + dimensions here are copied EXACTLY from the ShinyCardboard
 * website's src/config/ads.ts so both surfaces serve the same ad units. AdSense
 * config is intentionally omitted — these apps only use Adsterra.
 */
export interface AdsterraUnit {
  key: string
  width: number
  height: number
}

export const ADSTERRA = {
  /** 728x90 desktop leaderboard */
  leaderboard: { key: '9a9f39e533f81d1d30d429d380855268', width: 728, height: 90 } as AdsterraUnit,
  /** 320x50 mobile leaderboard */
  mobileLeaderboard: { key: 'c3c5d0facc6c264d28e693a6997cc277', width: 320, height: 50 } as AdsterraUnit,
  /** 300x250 medium rectangle (primary; also the head of the rotation pool) */
  rectangle: { key: '52b08311c6e33b410f0ef606ab7da39f', width: 300, height: 250 } as AdsterraUnit,
  /** Native banner (async, renders into its own container div) */
  native: {
    container: 'container-aecf2c7694ec0278a0bf97589c5ff309',
    src: 'https://pl29887474.effectivecpmnetwork.com/aecf2c7694ec0278a0bf97589c5ff309/invoke.js',
  },
} as const
