import express, { Router } from 'express'
import { RoomError, createGame, listGames, toSummary, toPublic } from '../rooms.js'
import { loadModule } from '../modules.js'
import { createDuelReferee } from '../duel.js'
import { findGame, restoreFromSave } from '../persistence.js'

/** Code d'erreur renvoyé au client pour `err`, levée en relisant une
 *  partie sauvegardée — et le statut HTTP qui va avec. */
function savedGameError(err) {
  if (!(err instanceof RoomError)) {
    console.error(err)
    return [500, 'unknown-error']
  }
  return [['module-unavailable', 'too-many-games'].includes(err.code) ? 503 : 400, err.code]
}

export const gamesRouter = Router()

gamesRouter.post('/', async (req, res) => {
  const { moduleId, scenarioId, variants, settings, maxPlayers, turnOrder } = req.body ?? {}

  if (typeof moduleId !== 'string' || !moduleId) {
    return res.status(400).json({ error: 'moduleId is required' })
  }
  if (typeof scenarioId !== 'string' || !scenarioId) {
    return res.status(400).json({ error: 'scenarioId is required' })
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 8) {
    return res.status(400).json({ error: 'maxPlayers must be an integer between 1 and 8' })
  }

  // Deux joueurs en double aveugle : partie arbitrée par le serveur (cf.
  // duel.js), qui lit pour cela les règles du module sur le site du jeu.
  let referee = null
  if (settings?.party === 'duel') {
    try {
      referee = createDuelReferee(await loadModule(moduleId), scenarioId)
    } catch (err) {
      console.error(`Module ${moduleId} illisible :`, err.message)
      return res.status(503).json({ error: 'module-unavailable' })
    }
    if (!referee) return res.status(400).json({ error: 'no-duel' })
  }

  let game
  try {
    game = createGame({ moduleId, scenarioId, variants, settings, maxPlayers, turnOrder, referee })
  } catch (err) {
    // Trop de parties en mémoire (cf. rooms.js::MAX_GAMES) : le serveur est
    // plein, pas la requête fautive.
    if (err.code === 'too-many-games') return res.status(503).json({ error: 'too-many-games' })
    console.error(err)
    return res.status(500).json({ error: 'unknown-error' })
  }

  // Passcode is only ever returned here, right after creation, so the
  // creator can share it with the other players.
  res.status(201).json({ ...toSummary(game), passcode: game.passcode })
})

gamesRouter.get('/', (req, res) => {
  res.json(listGames())
})

// Reprise d'une sauvegarde téléchargée par un joueur (cf. persistence.js::
// restoreFromSave) : le fichier tel quel, en texte.
gamesRouter.post('/restore', express.text({ type: '*/*', limit: '16mb' }), async (req, res) => {
  try {
    res.json(await restoreFromSave(req.body))
  } catch (err) {
    const [status, error] = savedGameError(err)
    res.status(status).json({ error })
  }
})

gamesRouter.get('/:id', async (req, res) => {
  let game
  try {
    // Partie sortie de la mémoire (redémarrage, abandon) : relue du disque.
    game = await findGame(req.params.id)
  } catch (err) {
    const [status, error] = savedGameError(err)
    return res.status(status).json({ error })
  }
  if (!game) return res.status(404).json({ error: 'not-found' })
  res.json(toPublic(game))
})
