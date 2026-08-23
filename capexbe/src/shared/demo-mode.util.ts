/** Local demo / LAN preview — set CAPEX_DEMO_MODE=true in capexbe/.env only. */
export function isDemoMode(): boolean {
  return process.env.CAPEX_DEMO_MODE === 'true';
}

/** One-click local enter — never in production builds. */
export function isLocalDevEnterAllowed(): boolean {
  return isDemoMode() && process.env.NODE_ENV !== 'production';
}

/** Default: Wahyu local account on VPS DB. Override with LOCAL_DEV_ENTER_EMAIL. */
export function getLocalDevEnterEmail(): string {
  return (
    process.env.LOCAL_DEV_ENTER_EMAIL ||
    process.env.DEMO_LOGIN_EMAIL ||
    'wahyu.pratama760001@siloamhospitals.com'
  )
    .trim()
    .toLowerCase();
}

/** Private LAN origins for demo (192.168.x.x, 10.x, 172.16–31.x, localhost). */
export function isDemoLanOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    origin,
  );
}
