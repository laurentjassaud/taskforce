<script setup>
// Modale "composition d'une task force alliée" : le joueur pose les pions
// navires de son ordre de bataille sur le support de sa task force —
// "Carrier TF" (porte-avions au centre, escortes autour) ou "Fleet TF"
// (cases numérotées). Ouverte par HexMap.vue::openAlliedFleet (clic sur la
// task force à la mise en place et à la phase Administrative, ou menu du
// pion) ; en dehors de ces moments, elle ne fait que montrer la
// composition (`editable` faux).
// Poser : cliquer un pion de la réserve puis une case, ou le glisser ; un
// pion posé se déplace de même (échange avec l'occupant de la case), et
// revient à la réserve par "Retirer" ou en le glissant sur elle. Rien n'est
// enregistré avant "Valider" (évènement `save`, cf. lib/useCoralSea.js::
// setAlliedFleet).
// Avions du porte-avions posé (cf. useCoralSea.js::alliedDeck) : ils
// arrivent avec lui, rangés par défaut ; le joueur les déplace de même
// entre les 4 cases Ready et les zones du support — Reserve, C.A.P.,
// "Landing from Map", "Landing from C.A.P." (celles que le support a). À sa
// phase d'Opérations aériennes (`airEditable`), seuls les avions bougent.
// Raid japonais sur cette task force (`raid`, cf. HexMap.vue::showRaid) : en
// lecture seule, chaque navire visé porte le numéro de son attaque, et la
// colonne de droite montre, attaque par attaque, le navire et les pions des
// avions japonais qui le frappent (groupe par groupe), puis leur escorte.
// Elle ne se ferme alors QUE par "Terminer le raid" : ni ×, ni clic hors de
// la modale, ni Échap — le joueur doit d'abord y reporter ses pertes.
// Pertes des avions (cf. useCoralSea.js::planeStateOf) : au clic droit sur
// n'importe quel avion — du porte-avions comme du raid —, quand le joueur
// peut poser des dommages (évènement `planeState`) ; un avion éliminé
// quitte le pont et rejoint la liste sous le support.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  title: { type: String, required: true },
  // Support : 'carrier' ou 'fleet' (cf. useCoralSea.js::alliedFleet).
  kind: { type: String, required: true },
  // Supports : `{ carrier, fleet }` (cf. useCoralSea.js::ALLIED_FLEET_DISPLAYS).
  displays: { type: Object, required: true },
  // Cases du support, dans l'ordre (cf. useCoralSea.js::displayCells).
  cellIds: { type: Array, required: true },
  // Composition actuelle : case -> clé de pion navire.
  cells: { type: Object, required: true },
  // Pions de l'ordre de bataille, par groupe (cf. useCoralSea.js::alliedGroups).
  groups: { type: Array, required: true },
  // Pions posés sur une AUTRE task force : clé -> nom de cette task force.
  elsewhere: { type: Map, default: () => new Map() },
  // `fits(type, case)` : ce navire peut-il aller dans cette case ?
  fits: { type: Function, required: true },
  // Cases Ready du support "Carrier TF" (cf. useCoralSea.js::READY_CELLS).
  airCellIds: { type: Array, default: () => [] },
  // `deckOf(clé du porte-avions)` : ses avions, et leur mise en place par
  // défaut — `{ planes, ready, reserve }` (cf. useCoralSea.js::alliedDeck).
  deckOf: { type: Function, default: () => ({ planes: [], ready: [], reserve: [] }) },
  editable: { type: Boolean, default: false },
  // Avions seuls déplaçables, navires figés (cf. HexMap.vue, phase
  // d'Opérations aériennes du joueur). `editable` les rend déplaçables aussi.
  airEditable: { type: Boolean, default: false },
  // Dommages possibles : état -> `{ reduced, marker }` (cf.
  // useCoralSea.js::SHIP_DAMAGE), ceux d'un navire (`damageOf(clé)`), et le
  // joueur peut-il les changer (au clic droit, à tout moment, composition
  // modifiable ou non) ?
  damages: { type: Object, default: null },
  damageOf: { type: Function, default: () => 'none' },
  damageEditable: { type: Boolean, default: false },
  // Pertes possibles d'un avion (cf. useCoralSea.js::PLANE_STATES), et
  // celles d'un avion (`planeStateOf(clé)`) ; changées comme les dommages.
  planeStates: { type: Array, default: null },
  planeStateOf: { type: Function, default: () => 'none' },
  // Raid japonais à montrer (cf. lib/useCoralSea.js::raidPlan) : `{ planes,
  // attacks, expectedPoints, raiders }` — `raiders`, noms des pions de raid.
  raid: { type: Object, default: null },
})

const emit = defineEmits(['save', 'close', 'damage', 'planeState'])
const { t, locale } = useI18n()

// Part de la hauteur d'une case qu'occupe un pion, et, sur "Fleet TF", sa
// marge gauche (px de l'image) qui laisse lisible le numéro de la case —
// comme FleetDisplayModal.vue.
const SHIP_FILL = 0.88
const FLEET_INSET = 44

// Pion avion (carré) : part de la hauteur d'une case qu'il occupe — toute,
// ses scans ayant déjà leur marge et leur ombre (cf. FleetDisplayModal.vue).
const PLANE_FILL = 1

const display = computed(() => props.displays[props.kind])
const ships = computed(() => new Map(props.groups.flatMap((group) => group.ships).map((ship) => [ship.key, ship])))

// Cases des avions : 'ready0'... (les Ready, dans le brouillon `draft`) et,
// pour les zones à plusieurs avions, zone + rang — 'reserve0', 'cap0',
// 'landingMap0', 'landingCap0'..., écrits seulement à l'enregistrement :
// dans le brouillon, un avion est dans la zone que lui donne `airZones`,
// et en Reserve s'il n'est ni en Ready ni dans une zone.
const ZONE_CELL = /^(reserve|cap|landingMap|landingCap)(\d+)$/
const isZoneCell = (cell) => ZONE_CELL.test(cell)
const isReadyCell = (cell) => props.airCellIds.includes(cell)
const withoutZones = (cells) => Object.fromEntries(Object.entries(cells).filter(([cell]) => !isZoneCell(cell)))
/** Avion -> zone (hors Reserve) des cases `cells`. */
const zonesOf = (cells) => Object.fromEntries(Object.entries(cells).flatMap(([cell, key]) => {
  const zone = ZONE_CELL.exec(cell)?.[1]
  return zone && zone !== 'reserve' ? [[key, zone]] : []
}))
// Zones du support, et la case de l'image qui porte chacune (cf.
// useCoralSea.js::ALLIED_FLEET_DISPLAYS) — bande ou case carrée.
const ZONES = [
  { zone: 'reserve', box: 'reserve', band: true },
  { zone: 'cap', box: 'cap', band: true },
  { zone: 'landingMap', box: 'landing', band: false },
  { zone: 'landingCap', box: 'landingCap', band: false },
]

const draft = ref(withoutZones(props.cells))
const airZones = ref(zonesOf(props.cells))
const selected = ref(null) // clé du pion choisi, ou null
const warning = ref('')
const canMovePlanes = computed(() => props.editable || props.airEditable)

const placedKeys = computed(() => new Set(Object.values(draft.value)))
const cellOf = (key) => Object.keys(draft.value).find((cell) => draft.value[cell] === key) ?? null
const shipIn = (cell) => ships.value.get(draft.value[cell]) ?? null
const selectedShip = computed(() => ships.value.get(selected.value) ?? null)
const selectedCell = computed(() => (selected.value ? cellOf(selected.value) : null))
/** Le navire est-il coulé (hors jeu : ni posé, ni à poser) ? */
const isSunk = (ship) => !!props.damages?.[props.damageOf(ship.key)]?.sunk
const reserveOf = (group) => group.ships.filter((ship) => !placedKeys.value.has(ship.key) && !isSunk(ship))
const sunkShips = computed(() => props.groups.flatMap((group) => group.ships).filter(isSunk))

// Avions du porte-avions posé au centre.
const deck = computed(() => (props.airCellIds.length && draft.value.carrier ? props.deckOf(draft.value.carrier) : null))
const planes = computed(() => new Map((deck.value?.planes ?? []).map((plane) => [plane.key, plane])))
const planeIn = (cell) => planes.value.get(draft.value[cell]) ?? null
const selectedPlane = computed(() => planes.value.get(selected.value) ?? null)
/** Zone de l'avion `key` : 'ready', ou celle de `ZONES`. */
const planeZone = (key) => (placedKeys.value.has(key) ? 'ready' : airZones.value[key] ?? 'reserve')
/** Avions de la zone `zone`, dans l'ordre du groupe aérien. */
const planesIn = (zone) => (deck.value?.planes ?? []).filter((plane) => planeZone(plane.key) === zone)
// Zones que le support dessine, avec leurs avions.
const zones = computed(() => ZONES.filter(({ box }) => display.value[box]).map((entry) => ({ ...entry, planes: planesIn(entry.zone) })))
/** Cases avions du brouillon, zones écrites (cf. `save`). */
function withZones(cells) {
  const out = { ...cells }
  for (const { zone } of ZONES) planesIn(zone).forEach((plane, index) => { out[`${zone}${index}`] = plane.key })
  return out
}

// La Reserve se déduit du reste ; le rang dans une zone ne compte pas.
const signature = (cells) => Object.entries(cells).filter(([cell]) => !/^reserve\d+$/.test(cell))
  .map(([cell, key]) => (isZoneCell(cell) ? `${ZONE_CELL.exec(cell)[1]}:${key}` : `${cell}=${key}`)).sort().join()
const dirty = computed(() => signature(props.cells) !== signature(withZones(draft.value)))
const count = computed(() => [...placedKeys.value].filter((key) => ships.value.has(key)).length)

/** Case `cell` (px de l'image) en % du support. */
function cellRect(cell) {
  const { width, height } = display.value
  const box = props.kind === 'carrier'
    ? (cell === 'carrier' ? display.value.carrier : display.value.escorts[Number(cell.slice(6))])
    : display.value.slots[Number(cell.slice(4))]
  return {
    left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`,
    width: `${(box.w / width) * 100}%`, height: `${(box.h / height) * 100}%`,
    '--ship-h': `${SHIP_FILL * 100}%`,
    // Marge en % de la largeur du SUPPORT (référence des % de `padding`).
    '--inset': props.kind === 'fleet' ? `${(FLEET_INSET / width) * 100}%` : '0',
  }
}

/** Case Ready `cell`, en % du support. */
function readyRect(cell) {
  const { width, height } = display.value
  const box = display.value.ready[props.airCellIds.indexOf(cell)]
  return {
    left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`,
    width: `${(box.w / width) * 100}%`, height: `${(box.h / height) * 100}%`,
    '--plane-h': `${PLANE_FILL * 100}%`,
  }
}

/** Zone `entry` (cf. `zones`), en % du support. */
function zoneRect(entry) {
  const { width, height } = display.value
  const box = display.value[entry.box]
  return { left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`, width: `${(box.w / width) * 100}%`, height: `${(box.h / height) * 100}%` }
}
/** Place du `index`-ième avion de la zone `entry`, en % de la zone : sur une
 *  bande, côte à côte, centrés, resserrés s'ils n'y tiennent pas ; dans une
 *  case carrée, en grille (deux colonnes dès deux avions). */
function zonePlaneStyle(entry, index) {
  const box = display.value[entry.box]
  const count = entry.planes.length
  const pct = (x, y, w, h) => ({ left: `${(x / box.w) * 100}%`, top: `${(y / box.h) * 100}%`, width: `${(w / box.w) * 100}%`, height: `${(h / box.h) * 100}%` })
  if (entry.band) {
    const size = box.h * PLANE_FILL
    const step = count > 1 ? Math.min(size, (box.w - size) / (count - 1)) : 0
    const start = (box.w - (size + step * (count - 1))) / 2
    return pct(start + index * step, (box.h - size) / 2, size, size)
  }
  const columns = count > 1 ? 2 : 1
  const rows = Math.ceil(count / columns)
  const side = Math.min(box.w / columns, box.h / rows) * PLANE_FILL
  return pct((box.w - columns * side) / 2 + (index % columns) * side, (box.h - rows * side) / 2 + Math.floor(index / columns) * side, side, side)
}

/** Dommages du navire `ship` (cf. `damages`), ou `null` intact. */
const damageOfShip = (ship) => props.damages?.[props.damageOf(ship.key)] ?? null
/** Image du navire : sa face réduite s'il a des dommages qui la montrent. */
const faceOf = (ship) => (damageOfShip(ship)?.reduced && ship.reducedSrc) || ship.src
/** Pion de dommages posé sur le navire, ou `null`. */
const markerOf = (ship) => damageOfShip(ship)?.marker ?? null

// Menu des dommages d'un navire (clic droit) : `{ x, y, items }` ou `null`.
const damageMenu = ref(null)
function openDamageMenu(event, ship) {
  if (!props.damageEditable || !props.damages) return
  event.preventDefault()
  const current = props.damageOf(ship.key)
  damageMenu.value = {
    x: event.clientX,
    y: event.clientY,
    items: Object.keys(props.damages).map((state) => ({
      label: t(`damage.${state}`), disabled: state === current, title: state === current ? t('damage.current') : null,
      action: () => {
        emit('damage', { ship, state })
        // Coulé : il quitte aussi le brouillon (et ses avions avec lui).
        if (props.damages[state].sunk) unplace(ship.key)
      },
    })),
  }
}
function chooseDamage(action) {
  action()
  damageMenu.value = null
}

/** Même menu, pour les pertes d'un avion : intact, réduit, éliminé. */
function openPlaneMenu(event, plane) {
  if (!props.damageEditable || !props.planeStates) return
  event.preventDefault()
  const current = props.planeStateOf(plane.key)
  damageMenu.value = {
    x: event.clientX,
    y: event.clientY,
    items: props.planeStates.map((state) => ({
      label: t(`planeState.${state}`), disabled: state === current, title: state === current ? t('planeState.current') : null,
      action: () => {
        emit('planeState', { plane, state })
        if (selected.value === plane.key) selected.value = null
      },
    })),
  }
}

/** Avion `plane` tel qu'il se montre selon ses pertes : `{ src, tag,
 *  eliminated }` — `tag`, réduit sans face réduite au catalogue (son image
 *  ne le montre pas). Un avion du pont arrive déjà sur sa face réduite (cf.
 *  lib/airGroups.js::withPlaneStates) ; un avion du raid porte son image
 *  réduite (`reducedSrc`). */
function planeLook(plane) {
  const state = props.planeStateOf(plane.key)
  const turned = state === 'reduced' && plane.face !== 'reduced'
  const src = (turned && plane.reducedSrc) || plane.src
  return { src, tag: turned && !plane.reducedSrc, eliminated: state === 'eliminated' }
}
/** Libellé d'un avion, et ses pertes s'il en a. */
function planeTitle(plane) {
  const state = props.planeStateOf(plane.key)
  return planeLabel(plane) + (state === 'none' ? '' : ` — ${t(`planeState.${state}`)}`)
}

const label = (ship) => {
  const state = props.damageOf(ship.key)
  return `${ship.type} ${ship.name}` + (state === 'none' ? '' : ` — ${t(`damage.${state}`)}`)
}
const planeLabel = (plane) => [plane.mission, plane.name, plane.code].filter(Boolean).join(' ')

// Raid japonais : attaques numérotées, `{ n, cell, ship, target, groups:
// [{ planes, power }], points }` — `cell`, la case du navire visé (rien si
// le raid n'a visé qu'un navire estimé, la composition étant inconnue).
const points = (value) => value.toLocaleString(locale.value, { maximumFractionDigits: 1 })
const raidAttacks = computed(() => (props.raid?.attacks ?? []).map((attack, index) => {
  const ship = ships.value.get(attack.target.key) ?? null
  const target = ship ? label(ship)
    : attack.target.name ? [...new Set([attack.target.type, attack.target.name])].join(' ')
      : t(`log.raidTargets.${attack.target.role}`, { n: attack.target.index + 1 })
  const groups = attack.groups.map((group) => {
    const planes = group.map((plane) => props.raid.planes[plane]).filter(Boolean)
    return { planes, power: planes.reduce((sum, plane) => sum + (plane.attack ?? 0), 0) }
  })
  return { n: index + 1, cell: ship ? cellOf(ship.key) : null, ship, target, groups, points: points(attack.expectedPoints) }
}))
/** Chasseurs du raid, qui n'attaquent aucun navire. */
const raidEscorts = computed(() => {
  const used = new Set((props.raid?.attacks ?? []).flatMap((attack) => attack.groups.flat()))
  return (props.raid?.planes ?? []).filter((_, index) => !used.has(index))
})
/** Attaque qui vise le navire de la case `cell`, ou `null`. */
const raidOn = (cell) => raidAttacks.value.find((attack) => attack.cell === cell) ?? null
// Attaque survolée (dans la liste ou sur le support) : mise en avant des deux côtés.
const focusedAttack = ref(null)
const isTarget = (cell) => !!selectedShip.value && props.fits(selectedShip.value.type, cell) && draft.value[cell] !== selected.value
const isReadyTarget = (cell) => !!selectedPlane.value && draft.value[cell] !== selected.value
/** La zone `zone` peut-elle recevoir l'avion choisi (venu d'ailleurs) ? */
const isZoneTarget = (zone) => !!selectedPlane.value && planeZone(selected.value) !== zone

/** Pourquoi la case refuse ce navire : réservée au porte-avions, ou
 *  porte-avions hors de la case centrale. */
function wrongCell(cell) {
  warning.value = t(cell === 'carrier' ? 'alliedFleet.centerCell' : 'alliedFleet.carrierCell')
}

/** Pose le pion `key` dans la case `cell` : l'occupant prend sa place s'il
 *  venait d'une case où il va, sinon il revient à la réserve. */
function place(key, cell) {
  if (planes.value.has(key)) { placePlane(key, cell); return }
  const ship = ships.value.get(key)
  if (!ship) return
  if (isReadyCell(cell)) { warning.value = t('alliedFleet.readyCell'); return }
  if (!props.fits(ship.type, cell)) { wrongCell(cell); return }
  const next = { ...draft.value }
  const from = cellOf(key)
  const occupant = next[cell]
  next[cell] = key
  if (from && from !== cell) {
    if (occupant && props.fits(ships.value.get(occupant)?.type, from)) next[from] = occupant
    else delete next[from]
  }
  draft.value = withAir(next)
  selected.value = null
  warning.value = ''
}

/** Pose l'avion `key` dans la case Ready `cell` : l'occupant prend sa place
 *  s'il venait d'une autre case Ready, sinon il passe en Reserve. */
function placePlane(key, cell) {
  if (!isReadyCell(cell)) { warning.value = t('alliedFleet.planeCell'); return }
  const next = { ...draft.value }
  const from = cellOf(key)
  const occupant = next[cell]
  next[cell] = key
  if (from && from !== cell) {
    if (occupant) next[from] = occupant
    else delete next[from]
  }
  draft.value = next
  setZone(key, null)
  selected.value = null
  warning.value = ''
}

/** L'avion `key` (rangé ailleurs qu'en Ready) est dans la zone `zone`, ou
 *  `null` : en Ready, ou en Reserve. */
function setZone(key, zone) {
  const next = { ...airZones.value }
  if (zone && zone !== 'reserve') next[key] = zone
  else delete next[key]
  airZones.value = next
}

/** L'avion `key` va dans la zone `zone` (cf. `ZONES`) : il quitte sa case
 *  Ready s'il en avait une. */
function moveToZone(key, zone) {
  const cell = cellOf(key)
  if (cell) {
    const next = { ...draft.value }
    delete next[cell]
    draft.value = next
  }
  setZone(key, zone)
  selected.value = null
  warning.value = ''
}

/** Brouillon `next`, avions à jour : les avions suivent le porte-avions de
 *  la case centrale — un autre que lui quitte les Ready et les zones, et
 *  celui qui arrive amène les siens, rangés par défaut. */
function withAir(next) {
  const carrier = next.carrier ?? null
  if (carrier === (draft.value.carrier ?? null)) return next
  const out = Object.fromEntries(Object.entries(next).filter(([cell]) => !isReadyCell(cell)))
  if (carrier && props.airCellIds.length) props.deckOf(carrier).ready.forEach((plane, index) => { out[props.airCellIds[index]] = plane.key })
  airZones.value = {}
  return out
}

/** Clic sur une case : navire (composition modifiable) ou case Ready (avions
 *  déplaçables, cf. `canMovePlanes`). */
function onCell(cell) {
  if (!(isReadyCell(cell) ? canMovePlanes.value : props.editable)) return
  if (selected.value) {
    if (draft.value[cell] === selected.value) { selected.value = null; return }
    place(selected.value, cell)
  } else if (draft.value[cell]) {
    selected.value = draft.value[cell]
    warning.value = ''
  }
}

function toggle(key) {
  selected.value = selected.value === key ? null : key
  warning.value = ''
}

/** Le pion `key` (posé) revient à la réserve — un avion, en Reserve. */
function unplace(key) {
  if (planes.value.has(key)) { moveToZone(key, 'reserve'); return }
  const cell = cellOf(key)
  if (!cell) return
  const next = { ...draft.value }
  delete next[cell]
  draft.value = withAir(next)
  selected.value = null
}

/** Clic sur une zone : l'avion choisi, venu d'ailleurs, y passe. */
function onZone(zone) {
  if (canMovePlanes.value && isZoneTarget(zone)) moveToZone(selected.value, zone)
}

// Glisser-déposer : même chose qu'au clic.
function onDragStart(event, key) {
  if (!(planes.value.has(key) ? canMovePlanes.value : props.editable)) return
  selected.value = key
  warning.value = ''
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', key)
}
function onDragOver(event, cell) {
  const ship = selectedShip.value && !isReadyCell(cell) && props.fits(selectedShip.value.type, cell)
  if (ship || (selectedPlane.value && isReadyCell(cell))) event.preventDefault()
}
function onDrop(event, cell) {
  const key = event.dataTransfer.getData('text/plain') || selected.value
  if (key) place(key, cell)
}
function onReserveDrop(event) {
  const key = event.dataTransfer.getData('text/plain') || selected.value
  if (key) unplace(key)
}
function onZoneDragOver(event, zone) {
  if (isZoneTarget(zone)) event.preventDefault()
}
function onZoneDrop(event, zone) {
  const key = event.dataTransfer.getData('text/plain') || selected.value
  if (key && planes.value.has(key) && canMovePlanes.value) moveToZone(key, zone)
}

function save() {
  emit('save', withZones(draft.value))
}

const dialog = ref(null)
function onKey(event) {
  if (event.key !== 'Escape') return
  if (damageMenu.value) damageMenu.value = null
  else if (selected.value) selected.value = null
  else if (!props.raid) emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  dialog.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="tc-overlay" @click.self="!raid && emit('close')">
    <div ref="dialog" class="tc-modal" :class="[kind, { raid: !!raid }]" :style="{ '--board-ratio': display.width / display.height }" role="dialog" aria-modal="true" aria-labelledby="tc-title" tabindex="-1">
      <header class="tc-head">
        <h3 id="tc-title">{{ title }}</h3>
        <button v-if="!raid" type="button" class="tc-close" :aria-label="$t('common.close')" @click="emit('close')">×</button>
      </header>

      <div class="tc-body">
        <div class="tc-board" :style="{ aspectRatio: `${display.width} / ${display.height}` }">
          <img class="tc-support" :src="display.src" alt="" />
          <!-- Pas `disabled` hors composition : le clic droit (dommages) doit
               toujours atteindre le navire. -->
          <button v-for="cell in cellIds" :key="cell" type="button" class="tc-cell"
            :class="{ filled: !!draft[cell], target: isTarget(cell), chosen: !!draft[cell] && draft[cell] === selected,
              raided: !!raidOn(cell), focus: !!raidOn(cell) && raidOn(cell).n === focusedAttack }"
            :style="cellRect(cell)" :aria-disabled="!editable || null"
            :aria-label="shipIn(cell) ? label(shipIn(cell)) : $t('alliedFleet.emptyCell')"
            @click="onCell(cell)" @dragover="onDragOver($event, cell)" @drop.prevent="onDrop($event, cell)"
            @contextmenu="shipIn(cell) && openDamageMenu($event, shipIn(cell))"
            @mouseenter="focusedAttack = raidOn(cell)?.n ?? null" @mouseleave="focusedAttack = null">
            <span v-if="raidOn(cell)" class="tc-raid-badge tc-raid-on-ship">{{ raidOn(cell).n }}</span>
            <span v-if="shipIn(cell)" class="tc-ship-wrap">
              <img class="tc-ship" :src="faceOf(shipIn(cell))" :alt="label(shipIn(cell))"
                :title="label(shipIn(cell))" :draggable="editable" @dragstart="onDragStart($event, draft[cell])" />
              <img v-if="markerOf(shipIn(cell))" class="tc-marker" :src="markerOf(shipIn(cell)).src"
                :alt="markerOf(shipIn(cell)).name" draggable="false" />
            </span>
          </button>
          <!-- Avions du porte-avions : cases Ready, puis les zones (Reserve,
               C.A.P., Landing). Pas `disabled` non plus : le clic droit
               (pertes) doit les atteindre. -->
          <template v-if="deck">
            <button v-for="cell in airCellIds" :key="cell" type="button" class="tc-cell tc-ready"
              :class="{ filled: !!planeIn(cell), target: isReadyTarget(cell), chosen: !!draft[cell] && draft[cell] === selected }"
              :style="readyRect(cell)" :aria-disabled="!canMovePlanes || null"
              :aria-label="planeIn(cell) ? planeTitle(planeIn(cell)) : $t('alliedFleet.emptyReady')"
              @click="onCell(cell)" @dragover="onDragOver($event, cell)" @drop.prevent="onDrop($event, cell)"
              @contextmenu="planeIn(cell) && openPlaneMenu($event, planeIn(cell))">
              <img v-if="planeIn(cell)" class="tc-plane" :src="planeLook(planeIn(cell)).src" :alt="planeTitle(planeIn(cell))"
                :title="planeTitle(planeIn(cell))" :draggable="canMovePlanes" @dragstart="onDragStart($event, draft[cell])" />
              <span v-if="planeIn(cell) && planeLook(planeIn(cell)).tag" class="tc-plane-tag">{{ $t('planeState.tag') }}</span>
            </button>
            <div v-for="entry in zones" :key="entry.zone" class="tc-hangar" :class="{ target: isZoneTarget(entry.zone) }"
              :style="zoneRect(entry)" :aria-label="$t(`alliedFleet.zones.${entry.zone}`)"
              @click.self="onZone(entry.zone)" @dragover="onZoneDragOver($event, entry.zone)" @drop.prevent="onZoneDrop($event, entry.zone)">
              <button v-for="(plane, index) in entry.planes" :key="plane.key" type="button" class="tc-hangar-plane"
                :class="{ chosen: selected === plane.key }" :style="zonePlaneStyle(entry, index)" :aria-disabled="!canMovePlanes || null"
                :title="planeTitle(plane)" :draggable="canMovePlanes" @click="canMovePlanes && toggle(plane.key)" @dragstart="onDragStart($event, plane.key)"
                @contextmenu="openPlaneMenu($event, plane)">
                <img class="tc-plane" :src="planeLook(plane).src" :alt="planeTitle(plane)" draggable="false" />
                <span v-if="planeLook(plane).tag" class="tc-plane-tag">{{ $t('planeState.tag') }}</span>
              </button>
            </div>
          </template>
        </div>

        <section v-if="editable" class="tc-reserve" :aria-label="$t('alliedFleet.reserve')"
          @dragover.prevent @drop.prevent="onReserveDrop">
          <p class="tc-hint" :class="{ warn: !!warning }" aria-live="polite">{{ warning || $t('alliedFleet.hint') }}</p>
          <div v-for="group in groups" :key="group.id" class="tc-group">
            <h4>{{ group.name }}</h4>
            <div v-if="reserveOf(group).length" class="tc-ships">
              <button v-for="ship in reserveOf(group)" :key="ship.key" type="button" class="tc-pick"
                :class="{ chosen: selected === ship.key, elsewhere: elsewhere.has(ship.key) }"
                :title="elsewhere.has(ship.key) ? $t('alliedFleet.inTaskForce', { ship: label(ship), unit: elsewhere.get(ship.key) }) : label(ship)"
                draggable="true" @click="toggle(ship.key)" @dragstart="onDragStart($event, ship.key)">
                <img :src="faceOf(ship)" :alt="label(ship)" draggable="false" />
                <span v-if="elsewhere.has(ship.key)" class="tc-badge">{{ elsewhere.get(ship.key) }}</span>
              </button>
            </div>
            <p v-else class="tc-empty">{{ $t('alliedFleet.groupPlaced') }}</p>
          </div>
          <p v-if="sunkShips.length" class="tc-empty">{{ $t('damage.sunkList', { ships: sunkShips.map(label).join(', ') }) }}</p>
        </section>
        <section v-else-if="raid" class="tc-raid" :aria-label="$t('raidView.attacks')">
          <p class="tc-hint">{{ $t('raidView.hint', { raiders: raid.raiders }) }}</p>
          <ol class="tc-attacks">
            <li v-for="attack in raidAttacks" :key="attack.n" class="tc-attack" :class="{ focus: focusedAttack === attack.n }"
              @mouseenter="focusedAttack = attack.n" @mouseleave="focusedAttack = null">
              <div class="tc-attack-head">
                <span class="tc-raid-badge">{{ attack.n }}</span>
                <img v-if="attack.ship" class="tc-attack-ship" :src="faceOf(attack.ship)" alt="" />
                <span class="tc-attack-target">{{ attack.target }}</span>
                <span class="tc-attack-points">{{ $t('raidView.points', { points: attack.points }) }}</span>
              </div>
              <div class="tc-attack-groups">
                <div v-for="(group, index) in attack.groups" :key="index" class="tc-raid-group"
                  :title="$t('raidView.group', { n: index + 1, power: group.power })">
                  <span v-if="attack.groups.length > 1" class="tc-raid-group-label">{{ $t('raidView.group', { n: index + 1, power: group.power }) }}</span>
                  <span v-for="plane in group.planes" :key="plane.key" class="tc-raid-plane-wrap"
                    :class="{ eliminated: planeLook(plane).eliminated }" :title="planeTitle(plane)"
                    @contextmenu="openPlaneMenu($event, plane)">
                    <img v-if="plane.src" class="tc-raid-plane" :src="planeLook(plane).src" :alt="planeTitle(plane)" />
                    <span v-else class="tc-raid-plane-name">{{ planeTitle(plane) }}</span>
                    <span v-if="planeLook(plane).tag" class="tc-plane-tag">{{ $t('planeState.tag') }}</span>
                  </span>
                </div>
              </div>
            </li>
          </ol>
          <div v-if="raidEscorts.length" class="tc-raid-escort">
            <h4>{{ $t('raidView.escort') }}</h4>
            <div class="tc-raid-group">
              <span v-for="plane in raidEscorts" :key="plane.key" class="tc-raid-plane-wrap"
                :class="{ eliminated: planeLook(plane).eliminated }" :title="planeTitle(plane)"
                @contextmenu="openPlaneMenu($event, plane)">
                <img v-if="plane.src" class="tc-raid-plane" :src="planeLook(plane).src" :alt="planeTitle(plane)" />
                <span v-else class="tc-raid-plane-name">{{ planeTitle(plane) }}</span>
                <span v-if="planeLook(plane).tag" class="tc-plane-tag">{{ $t('planeState.tag') }}</span>
              </span>
            </div>
          </div>
          <p class="tc-raid-total">{{ $t('raidView.total', { points: points(raid.expectedPoints) }) }}</p>
          <p v-if="damageEditable && damages" class="tc-hint">{{ $t('raidView.damageHint') }}</p>
        </section>
        <div v-else-if="airEditable">
          <p class="tc-hint" :class="{ warn: !!warning }" aria-live="polite">{{ warning || $t('alliedFleet.airHint') }}</p>
          <p v-if="sunkShips.length" class="tc-empty">{{ $t('damage.sunkList', { ships: sunkShips.map(label).join(', ') }) }}</p>
        </div>
        <div v-else>
          <p class="tc-hint">{{ $t('alliedFleet.readOnly') }}</p>
          <p v-if="sunkShips.length" class="tc-empty">{{ $t('damage.sunkList', { ships: sunkShips.map(label).join(', ') }) }}</p>
        </div>
        <!-- Avions éliminés du porte-avions, sous le support : un clic droit
             les rétablit. -->
        <div v-if="deck?.lost?.length" class="tc-lost">
          <span class="tc-empty">{{ $t('planeState.lostList') }}</span>
          <span v-for="plane in deck.lost" :key="plane.key" class="tc-raid-plane-wrap eliminated" :title="planeTitle(plane)"
            @contextmenu="openPlaneMenu($event, plane)">
            <img class="tc-raid-plane" :src="plane.src" :alt="planeTitle(plane)" />
          </span>
        </div>
      </div>

      <footer class="tc-foot">
        <span class="tc-count">
          {{ $t('alliedFleet.count', { n: count }, count) }}<template v-if="damageEditable && damages"> · {{ $t('damage.hint') }}</template>
        </span>
        <template v-if="editable || airEditable">
          <button v-if="selectedPlane ? planeZone(selected) !== 'reserve' : selectedCell" type="button" class="tc-cancel" @click="unplace(selected)">
            {{ selectedPlane ? $t('alliedFleet.toReserve') : $t('alliedFleet.remove') }}
          </button>
          <button type="button" class="tc-cancel" @click="emit('close')">{{ $t('common.cancel') }}</button>
          <button type="button" class="tc-ok" :disabled="!dirty" @click="save">{{ $t('alliedFleet.save') }}</button>
        </template>
        <button v-else type="button" class="tc-ok" @click="emit('close')">{{ raid ? $t('raidView.end') : $t('common.close') }}</button>
      </footer>
    </div>
    <ContextMenu v-if="damageMenu" :left-px="damageMenu.x" :top-px="damageMenu.y" :items="damageMenu.items"
      @choose="chooseDamage" @close="damageMenu = null" />
  </div>
</template>

<style scoped>
.tc-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: color-mix(in srgb, var(--c-ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.tc-modal {
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  max-height: 100%;
  background: var(--c-paper);
  color: var(--c-panel-text);
  border-radius: var(--radius-12);
  border-top: 4px solid var(--c-usn);
  box-shadow: var(--shadow-modal);
  padding: 12px 16px 14px;
  outline: none;
  animation: tc-in 200ms var(--ease-out);
}

.tc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.tc-head h3 {
  margin: 0;
  font-size: var(--fs-md);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-usn);
}
.tc-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-white) 10%, transparent);
  color: inherit;
  font-size: var(--fs-lg);
  line-height: 1;
  cursor: pointer;
  transition: background-color 150ms ease, transform 120ms ease-out;
}
.tc-close:active {
  transform: scale(0.94);
}

/* Support porte-avions à gauche, réserve à droite ; "Fleet TF", très large,
   au-dessus de la réserve. */
.tc-body {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
}
.tc-modal.carrier .tc-body {
  grid-template-columns: minmax(0, min(500px, calc((100vh - 160px) * var(--board-ratio)))) minmax(0, 1fr);
  align-items: start;
}
@media (max-width: 760px) {
  .tc-modal.carrier .tc-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tc-board {
  position: relative;
  width: 100%;
  border-radius: var(--radius-6);
  overflow: hidden;
}
.tc-support {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.tc-cell {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-4);
  background: none;
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease;
}
.tc-modal.fleet .tc-cell {
  justify-content: flex-start;
  padding-left: var(--inset);
}
.tc-cell:disabled,
.tc-cell[aria-disabled='true'] {
  cursor: default;
}
.tc-cell.target {
  border-style: dashed;
  border-color: var(--c-green);
  background: color-mix(in srgb, var(--c-green) 18%, transparent);
}
.tc-cell.chosen {
  border-color: var(--c-gold);
}
/* Pion navire, et le pion de dommages posé dessus. */
.tc-ship-wrap {
  position: relative;
  display: block;
  height: var(--ship-h);
  aspect-ratio: 190 / 115;
  /* L'ombre du scan, en bas à droite, décentre le pion dans son image : on
     le recentre (cf. FleetDisplayModal.vue). */
  translate: 2.6% 4.3%;
}
.tc-ship {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px color-mix(in srgb, var(--c-ink) 40%, transparent));
  user-select: none;
  animation: tc-ship-in 220ms var(--ease-out);
}
/* Scan carré 125 × 125 px, ombre comprise : un peu à droite du centre du
   pion navire, pour laisser lisible son type. */
.tc-marker {
  position: absolute;
  /* Centre visible du pion marqueur (46 % de son scan) sur la hauteur du
     centre visible du navire (46 % de son scan). */
  top: 46%;
  left: 60%;
  height: 90%;
  aspect-ratio: 1;
  translate: -46% -46%;
  pointer-events: none;
  user-select: none;
  animation: tc-ship-in 220ms var(--ease-out);
}

/* Avions : un par case Ready ; dans la bande Reserve, côte à côte (place
   calculée, cf. `hangarStyle`). Scan 125 × 125 px : le pion est 5 px plus
   haut et plus à gauche que le centre de l'image. */
.tc-plane {
  display: block;
  height: var(--plane-h, 100%);
  aspect-ratio: 1;
  translate: 4% 4%;
  user-select: none;
  animation: tc-ship-in 220ms var(--ease-out);
}
.tc-hangar {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid transparent;
  border-radius: var(--radius-4);
  transition: border-color 150ms ease, background-color 150ms ease;
}
.tc-hangar.target {
  border-style: dashed;
  border-color: var(--c-green);
  background: color-mix(in srgb, var(--c-green) 18%, transparent);
  cursor: pointer;
}
.tc-hangar-plane {
  position: absolute;
  top: 0;
  height: 100%;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-4);
  background: none;
  cursor: pointer;
  transition: border-color 150ms ease;
}
.tc-hangar-plane[aria-disabled='true'] {
  cursor: default;
}
/* Avion réduit dont le catalogue n'a pas la face réduite : une pastille. */
.tc-plane-tag {
  position: absolute;
  right: 6%;
  bottom: 6%;
  min-width: 16px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: var(--radius-4);
  background: var(--c-gold);
  color: var(--c-ink);
  font-size: var(--fs-2xs);
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}
.tc-hangar-plane.chosen {
  border-color: var(--c-gold);
}
.tc-hangar-plane .tc-plane {
  height: 100%;
}

/* Raid japonais : couleurs du camp japonais, navires visés encadrés et
   numérotés, comme leur attaque dans la liste. */
.tc-modal.raid {
  border-top-color: var(--c-usn);
}
.tc-modal.raid .tc-head h3 {
  color: var(--c-usn);
}
.tc-cell.raided {
  border-color: var(--c-usn);
}
.tc-cell.raided.focus {
  background: color-mix(in srgb, var(--c-usn) 24%, transparent);
}
.tc-raid-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 11px;
  background: var(--c-usn);
  color: var(--c-white);
  font-size: var(--fs-xs);
  font-weight: 700;
}
.tc-raid-on-ship {
  position: absolute;
  top: 4%;
  left: 3%;
  z-index: 1;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--c-ink) 50%, transparent);
}
.tc-raid {
  min-width: 0;
}
.tc-attacks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tc-attack {
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--c-white) 12%, transparent);
  border-radius: var(--radius-6);
  transition: border-color 150ms ease, background-color 150ms ease;
}
.tc-attack.focus {
  border-color: var(--c-ijn);
  background: color-mix(in srgb, var(--c-ijn) 12%, transparent);
}
.tc-attack-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.tc-attack-ship {
  flex: none;
  height: 34px;
  aspect-ratio: 190 / 115;
  object-fit: contain;
}
.tc-attack-target {
  min-width: 0;
  font-size: var(--fs-sm);
  font-weight: 700;
}
.tc-attack-points {
  margin-left: auto;
  flex: none;
  font-size: var(--fs-xs);
  color: var(--c-steel);
}
.tc-attack-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tc-raid-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: var(--radius-4);
  background: color-mix(in srgb, var(--c-white) 6%, transparent);
}
.tc-raid-group-label {
  flex-basis: 100%;
  padding: 0 2px;
  font-size: var(--fs-2xs);
  color: var(--c-steel);
}
.tc-raid-plane-wrap {
  position: relative;
  display: inline-flex;
  cursor: context-menu;
  transition: opacity 150ms ease, filter 150ms ease;
}
.tc-raid-plane-wrap.eliminated {
  opacity: 0.4;
  filter: grayscale(1);
}
.tc-raid-plane {
  display: block;
  width: 52px;
  aspect-ratio: 1;
  user-select: none;
}
.tc-lost {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.tc-raid-plane-name {
  padding: 2px 6px;
  font-size: var(--fs-xs);
}
.tc-raid-escort {
  margin-top: 10px;
}
.tc-raid-escort h4 {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.tc-raid-escort .tc-raid-group {
  display: inline-flex;
}
.tc-raid-total {
  margin: 10px 0 6px;
  font-size: var(--fs-sm);
  font-weight: 700;
}

.tc-reserve {
  min-width: 0;
}
.tc-hint {
  margin: 0 0 8px;
  font-size: var(--fs-sm);
  color: var(--c-steel);
}
.tc-hint.warn {
  color: var(--c-gold);
}
.tc-group + .tc-group {
  margin-top: 10px;
}
.tc-group h4 {
  margin: 0 0 6px;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-panel-text);
}
.tc-ships {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tc-pick {
  position: relative;
  width: 96px;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: var(--radius-6);
  background: color-mix(in srgb, var(--c-white) 6%, transparent);
  cursor: grab;
  transition: border-color 150ms ease, background-color 150ms ease, transform 120ms ease-out;
}
.tc-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 190 / 115;
  object-fit: contain;
  user-select: none;
}
.tc-pick:active {
  transform: scale(0.97);
}
.tc-pick.chosen {
  border-color: var(--c-gold);
  background: color-mix(in srgb, var(--c-gold) 16%, transparent);
}
.tc-pick.elsewhere img {
  opacity: 0.5;
}
.tc-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: var(--radius-4);
  background: var(--c-panel);
  color: var(--c-usn);
  font-size: var(--fs-2xs);
  font-weight: 700;
}
@media (hover: hover) and (pointer: fine) {
  .tc-close:hover {
    background: color-mix(in srgb, var(--c-white) 20%, transparent);
  }
  .tc-cell:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--c-white) 40%, transparent);
  }
  .tc-pick:hover {
    background: color-mix(in srgb, var(--c-white) 14%, transparent);
  }
}
.tc-empty {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--c-steel);
}

.tc-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tc-count {
  margin-right: auto;
  font-size: var(--fs-sm);
  color: var(--c-steel);
}
.tc-cancel {
  border: 1px solid color-mix(in srgb, var(--c-white) 25%, transparent);
  background: transparent;
  color: var(--c-panel-text);
  font-size: var(--fs-sm);
  padding: 8px 16px;
  border-radius: var(--radius-8);
  cursor: pointer;
}
.tc-ok {
  border: none;
  background: var(--c-orange);
  color: var(--c-panel);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: var(--fs-sm);
  padding: 8px 20px;
  border-radius: var(--radius-8);
  cursor: pointer;
}
.tc-ok:disabled {
  opacity: 0.4;
  cursor: default;
}

@keyframes tc-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
@keyframes tc-ship-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tc-modal,
  .tc-ship {
    animation-name: tc-fade;
  }
}
@keyframes tc-fade {
  from {
    opacity: 0;
  }
}
</style>
