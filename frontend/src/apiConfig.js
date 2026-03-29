/**
 * In dev, Vite proxies /api, /v1, /ws to the backend (see vite.config.js).
 * For production build against a remote API, set VITE_API_ORIGIN e.g. http://localhost:8001
 */
const origin = import.meta.env.VITE_API_ORIGIN || ''

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${origin}${p}`
}

export function wsUrl(path = '/ws') {
  const p = path.startsWith('/') ? path : `/${path}`
  if (origin) {
    const u = new URL(origin.replace(/^http/, 'ws'))
    u.pathname = p
    return u.toString()
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${p}`
}
