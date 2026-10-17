import { createRouter, createWebHistory } from 'vue-router'
import SoloHome from '../views/SoloHome.vue'
import DemoPlay from '../views/DemoPlay.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: SoloHome },
    { path: '/demo', name: 'demo-play', component: DemoPlay },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
