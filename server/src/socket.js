import { RoomError, getGame, joinGame, recordMove, advanceTurn, recordPhase, recordConcession, appendJournal, removeJournal, recordDeployment, isPlayersTurn, mayLog, setPlayerConnectionBySocket, toPublic, journalFor, refereeMove, recordRecon } from './rooms.js'
import { findGame, saveFor } from './persistence.js'

// Salons Socket.IO : toute la partie, et chaque camp à part — ce qu'un camp
// seul doit voir en double aveugle arbitré (cf. duel.js) ne part que dans le
// sien.
const gameRoom = (gameId) => `game:${gameId}`
const sideRoom = (gameId, side) => `game:${gameId}:side:${side}`
/** Salon d'une entrée du journal : son camp si elle n'est visible que de
 *  lui (cf. rooms.js, `visibleTo`), sinon toute la partie. */
const roomOfEntry = (gameId, entry) => (entry.visibleTo ? sideRoom(gameId, entry.visibleTo) : gameRoom(gameId))

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('game:join', async ({ gameId, passcode, playerId, name, side } = {}, ack) => {
      try {
        // Partie sortie de la mémoire (redémarrage, abandon) : relue du disque.
        await findGame(gameId)
        const { game, playerId: resolvedPlayerId } = joinGame(gameId, {
          passcode,
          playerId,
          name,
          side,
          socketId: socket.id,
        })
        const player = game.players.get(resolvedPlayerId)

        socket.join(gameRoom(gameId))
        socket.join(sideRoom(gameId, player.side))
        socket.data.gameId = gameId
        socket.data.playerId = resolvedPlayerId

        const publicRoom = toPublic(game)
        // Journal partagé : seulement pour le joueur qui (re)joint (trop
        // volumineux pour les `room:update` diffusés à tous) — en double
        // aveugle arbitré, ce que son camp en voit, et les pions adverses
        // qu'il voit encore (cf. duel.js::revealedFor).
        ack?.({
          ok: true, playerId: resolvedPlayerId, room: publicRoom, journal: journalFor(game, player.side),
          revealed: game.referee ? game.referee.revealedFor(game, player.side) : {},
        })
        io.to(gameRoom(gameId)).emit('room:update', publicRoom)
        if (game.status === 'started') {
          io.to(gameRoom(gameId)).emit('room:started', publicRoom)
        }
      } catch (err) {
        const code = err instanceof RoomError ? err.code : 'unknown-error'
        ack?.({ ok: false, error: code })
      }
    })

    // Sauvegarde de la partie pour le joueur de ce socket (cf. persistence.js::
    // saveFor) : chiffrée, il la garde sans pouvoir la lire, et la rendra au
    // serveur si celui-ci a perdu la partie.
    socket.on('game:save', ({ gameId } = {}, ack) => {
      const game = socket.data.gameId === gameId ? getGame(gameId) : null
      if (!game) return ack?.({ ok: false, error: 'not-found' })
      ack?.({ ok: true, save: saveFor(game, socket.data.playerId) })
    })

    /** Le joueur de ce socket a-t-il rejoint `gameId` ET la main dans
     *  cette partie (cf. rooms.js::isPlayersTurn) ? Garde commune à tout ce
     *  qui modifie la partie — évite aussi qu'un client injecte des coups
     *  dans une room qu'il n'a jamais rejointe. */
    function hasTurn(gameId) {
      if (socket.data.gameId !== gameId) return false
      const game = getGame(gameId)
      return !!game && isPlayersTurn(game, socket.data.playerId)
    }

    /** Camp du joueur de ce socket dans la partie qu'il a rejointe. */
    function ownSide() {
      return getGame(socket.data.gameId)?.players.get(socket.data.playerId)?.side ?? null
    }

    socket.on('game:move', ({ gameId, counterId, col, row } = {}) => {
      if (!hasTurn(gameId)) return
      try {
        const game = recordMove(gameId, { counterId, col, row }, ownSide())
        if (!game.referee) {
          io.to(gameRoom(gameId)).emit('game:move', { counterId, col, row })
          return
        }
        // Double aveugle arbitré : le coup ne part qu'aux camps qui voient ce
        // pion — le sien, et l'adversaire qui l'a découvert —, puis l'arbitre
        // cherche un contact, annoncé aux deux camps.
        for (const side of game.referee.audienceOf(game, String(counterId))) {
          io.to(sideRoom(gameId, side)).emit('game:move', { counterId, col, row })
        }
        const contact = refereeMove(game, counterId)
        if (contact) io.to(gameRoom(gameId)).emit('game:log', { entry: contact })
      } catch {
        // Partie pas encore lancée ou déjà supprimée, coup invalide : on ignore.
      }
    })

    socket.on('game:turn', ({ gameId } = {}) => {
      if (!hasTurn(gameId)) return
      try {
        const game = advanceTurn(gameId)
        io.to(gameRoom(gameId)).emit('game:turn', { turnStep: game.turnStep })
      } catch {
        // Partie pas encore lancée ou déjà supprimée : on ignore silencieusement.
      }
    })

    socket.on('game:phase', ({ gameId, phase, step } = {}) => {
      // Rediffusé aux AUTRES joueurs seulement : l'émetteur a déjà changé de
      // phase localement.
      if (!hasTurn(gameId)) return
      try {
        recordPhase(gameId, { phase, step })
        socket.to(gameRoom(gameId)).emit('game:phase', { phase, step })
      } catch {
        // Partie pas lancée, phase invalide ou pas déjà dépassé : on ignore.
      }
    })

    socket.on('game:over', ({ gameId, loser, text, t } = {}) => {
      // Un camp concède (même hors de son tour). Diffusé à TOUS (émetteur
      // compris) une seule fois, à la première annonce — avec l'entrée de
      // journal correspondante, inscrite par le serveur.
      if (socket.data.gameId !== gameId) return
      try {
        const recorded = recordConcession(gameId, { loser, text, t, playerId: socket.data.playerId })
        if (recorded) {
          io.to(gameRoom(gameId)).emit('game:over', { loser })
          io.to(gameRoom(gameId)).emit('game:log', { entry: recorded.entry })
        }
      } catch {
        // Partie pas lancée, concession d'un autre camp que le sien, ou
        // annonce invalide : on ignore.
      }
    })

    socket.on('game:log', ({ gameId, entry } = {}) => {
      // Journal partagé : conservé puis transmis aux AUTRES joueurs qui
      // peuvent le voir (l'émetteur l'a déjà dans son journal). Réservé au
      // joueur qui a la main — à une exception près, cf. rooms.js::mayLog.
      if (socket.data.gameId !== gameId) return
      const game = getGame(gameId)
      if (!game || !mayLog(game, socket.data.playerId, entry)) return
      try {
        const clean = appendJournal(gameId, entry, ownSide())
        if (clean) socket.to(roomOfEntry(gameId, clean)).emit('game:log', { entry: clean })
      } catch {
        // Partie pas lancée ou terminée, entrée invalide : on ignore.
      }
    })

    socket.on('game:unlog', ({ gameId, uid } = {}) => {
      if (!hasTurn(gameId)) return
      try {
        const removed = removeJournal(gameId, uid, ownSide())
        if (removed) socket.to(roomOfEntry(gameId, removed)).emit('game:unlog', { uid })
      } catch {
        // Partie pas lancée : on ignore.
      }
    })

    socket.on('game:deploy', ({ gameId, entry, turnEntry } = {}, ack) => {
      // Déploiement initial (+ tour de départ) : le premier proposé fait foi,
      // renvoyé à l'émetteur (ack) et transmis aux autres joueurs s'il est
      // nouveau.
      if (socket.data.gameId !== gameId) return ack?.({ ok: false })
      try {
        const recorded = recordDeployment(gameId, entry, turnEntry)
        if (recorded.created) {
          for (const logged of recorded.entries) socket.to(gameRoom(gameId)).emit('game:log', { entry: logged })
        }
        ack?.({ ok: true, entries: recorded.entries })
      } catch {
        ack?.({ ok: false })
      }
    })

    // --- Reconnaissance en double aveugle arbitré (cf. duel.js::recon) : le
    // joueur actif envoie ses hex de reco ; l'arbitre tire les chits et
    // envoie à chaque camp sa propre entrée du journal.
    socket.on('game:recon', ({ gameId, step, centers } = {}, ack) => {
      if (!hasTurn(gameId)) return ack?.({ ok: false, error: 'not-your-turn' })
      try {
        const { searcher, target } = recordRecon(gameId, ownSide(), { step, centers })
        io.to(roomOfEntry(gameId, searcher)).emit('game:log', { entry: searcher })
        io.to(roomOfEntry(gameId, target)).emit('game:log', { entry: target })
        ack?.({ ok: true })
      } catch (err) {
        ack?.({ ok: false, error: err instanceof RoomError ? err.code : 'unknown-error' })
      }
    })

    socket.on('disconnect', () => {
      const game = setPlayerConnectionBySocket(socket.id, false)
      if (game) {
        io.to(gameRoom(game.id)).emit('room:update', toPublic(game))
      }
    })
  })
}
