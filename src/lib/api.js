// Accès REST au serveur des parties en ligne (cf. server/src/routes/games.js).
// Les échanges en cours de partie passent, eux, par le WebSocket (cf.
// socket.js).

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function request(path, options) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    // Serveur éteint ou injoignable : un code que l'interface sait traduire
    // (cf. i18n/index.js::errorMessage).
    throw new Error('unreachable')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function createGame({ moduleId, scenarioId, variants, settings, maxPlayers, turnOrder }) {
  return request('/api/games', {
    method: 'POST',
    body: JSON.stringify({ moduleId, scenarioId, variants, settings, maxPlayers, turnOrder }),
  })
}

export function getGame(id) {
  return request(`/api/games/${encodeURIComponent(id)}`)
}
