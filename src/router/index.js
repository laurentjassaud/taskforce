import { createRouter, createWebHistory } from 'vue-router'
import SoloHome from '../views/SoloHome.vue'
import DemoPlay from '../views/DemoPlay.vue'
import RoomLobby from '../views/RoomLobby.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: SoloHome },
    { path: '/demo', name: 'demo-play', component: DemoPlay },
    // Partie en ligne à deux joueurs : salon, puis plateau (cf. RoomLobby.vue).
    { path: '/room/:id', name: 'room-lobby', component: RoomLobby, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
