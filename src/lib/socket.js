import { io } from 'socket.io-client'
import { API_URL } from './api.js'

let socket = null

// Une seule connexion WebSocket pour toute l'app — les vues la partagent
// plutôt que d'en ouvrir une nouvelle à chaque navigation.
export function getSocket() {
  if (!socket) socket = io(API_URL)
  return socket
}
