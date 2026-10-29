# Generic Wargame

Moteur générique de wargame hexagonal, jouable **en local** (un navigateur pour
tous les camps) ou **en ligne** (une room par partie, un joueur par camp).

- **Front** : Vue 3 + Vite (`src/`). Le plateau, la grille d'hex, le zoom/pan,
  les pions et toutes les règles vivent dans un composant réutilisable
  (`HexMap.vue`) et ses composables (`src/lib/`).
- **Serveur** (parties en ligne) : Node + Express + Socket.IO (`server/`). Il
  ne connaît ni les règles ni les pions : il conserve l'état d'une room
  (positions, tour, phase, pendules, journal partagé) et le rediffuse.
- **Modules** : chaque **boîte de jeu** (carte, pions, terrain, camps, tours…)
  est un dossier JSON servi statiquement (`public/modules/<id>/`),
  interchangeable sans toucher au moteur.

## Modules disponibles

`public/modules/index.json` liste les modules ; un seul :
- **Coral Sea** (*Battle of the Coral Sea* — 7-8 mai 1942) : carte hexagonale
  33 × 19, task forces japonaises (TF 1, 2, 3, 7, 8, 10 et leurres Dummy) et
  task forces américaines posées à la mise en place, marqueurs de recherche
  (Detected!, Contact Lost, Misdirect). Seuls les leurres japonais sont posés
  au départ ; le moteur joue le camp japonais (cf. `src/lib/useCoralSea.js`).
  Pas encore de combat. Règles de mouvement : cf.
  `documentations/regles-de-mouvement.md`.

## Modes de jeu

Choisis à la création de la partie (accueil `SoloHome.vue` : scénario, puis
mode de jeu, avec la case « Jouer en ligne » pour deux joueurs) — cf.
`src/lib/gameSettings.js`.

| Réglage | Valeurs | Effet |
|---|---|---|
| Scénario | Ceux du module — Coral Sea : Scenario 5 : Bataille de la mer de Corail | Déploiement |
| Météo | *bientôt disponible* | — (pas encore appliquée par le moteur) |
| Mode de jeu | **Deux joueurs en double aveugle** / **Contre l'IA, avec leurres** / *Contre l'IA, en aveugle* | Voir ci-dessous |
| Timing | Libre / **Limité** / **Blitz** | Chronomètre de la phase de Mouvement — partie Assistée uniquement |

**Modes de jeu** (cf. `PARTY_OPTIONS`) :
- **Deux joueurs en double aveugle** (`duel`) — *en cours* : deux joueurs sur
  le même écran, à tour de rôle, sans IA ni leurres ; chaque camp ne voit
  que ses forces (pions, onglet de renforts, journal, unités éliminées), et
  un écran de passage s'affiche à chaque changement de camp. Fait : la mise
  en place, camp par camp (le Japonais puis l'Américain, chacun ses 13 task
  forces), au glisser-déposer seulement, dans la zone du camp déclarée par
  le scénario (`duel.setup`), marquée sur la carte par un dégradé de 5 px au
  bord de chaque hex ; un pion posé se redéplace dans la zone, ou retourne
  au panneau en l'y lâchant ; pas de menu au clic droit, et rien n'oblige à
  poser toutes ses task forces. Ensuite, deux phases seulement (`duel.phases`
  du scénario) : Mouvement — 1 ou 2 hex par tour selon la piste, au clic,
  sans autre contrainte que celles de la carte — côtes et récifs
  infranchissables (`terrain.seaBarriers`), hex coupés par une île
  (`seaPassages`) — : ni ZOC, ni hex interdit par l'ennemi, ni allure de
  transport ; la trace de chaque task force reste affichée, une couleur
  par task force et un rond entre deux tours ; une task force qui arrive
  au contact d'une task force ennemie (même hex, ou adjacente sans barrière)
  la découvre — une modale le signale, le pion ennemi apparaît sur sa
  carte jusqu'à la nuit suivante, et le mouvement peut continuer ; le
  contact est réciproque, signalé à l'adversaire au début de son tour
  suivant (entrée `contact` du journal) — et Reconnaissance : le joueur
  actif désigne au clic ses hex de reco (`duel.recon` du scénario : 2 par
  porte-avions japonais, 3 par porte-avions américain sur la carte, à 8 hex
  ou moins de l'un d'eux), chacun couvrant une zone de 7 hex (lui et ses 6
  voisins) ; « Décollage » tire aussitôt un chit par zone
  (avec remise) : Detected! pose un pion « Sighted » conforme sur chaque
  task force ennemie de la zone, Misdirect le pion inverse (porte-avions ↔
  flotte) — ou, dans une zone vide, un leurre porte-avions ou flotte à pile
  ou face sur l'un de ses hex —, Contact Lost rien. Ces pions, sur la seule
  carte du joueur, ne suivent pas les task forces et tombent à la phase de
  Mouvement suivante ; chaque repérage, vrai ou faux, laisse sur l'hex un
  triangle de la couleur du camp vu, pour toute la partie, dont la bulle
  d'aide résume ce qu'on y a vu et à quel tour (entrée `duelRecon` du
  journal — en mode debug, le journal indique aussi le chit tiré pour
  chaque zone). L'adversaire voit ses task forces survolées par cette
  reconnaissance bordées de jaune, quel qu'en soit le résultat, jusqu'à la
  reconnaissance suivante ou la nuit, et une modale le lui signale au début
  de son tour suivant. Aucune composition de flotte : on déplace et on
  recherche les task forces. **En ligne** (case « Jouer en ligne ») : chaque
  joueur sur son écran, par le serveur des parties (cf. « Parties en
  ligne ») — mêmes règles, sans écran de passage : chacun ne voit que son
  camp de bout en bout (pas de mode debug en ligne), un
  bandeau l'avertit quand la main est à l'adversaire, et la modale de ce
  qu'il a subi s'ouvre quand elle lui revient ;
- **Contre l'IA, avec leurres** (partie Assistée, `assiste`) : l'IA joue le
  Japonais, ses task forces sur la carte parmi des leurres ;
- *Contre l'IA, en aveugle* — *bientôt disponible* : les forces de l'IA hors
  de la carte tant qu'elles ne sont pas repérées.

L'ancien mode *Libre* (bac à sable sans règles) n'est plus proposé : une
sauvegarde ou une URL qui le demande s'ouvre en partie Assistée. Le moteur
sait encore jouer sans garde-fous (`assisted = false`, cf.
`src/lib/useAssisted.js`).

**Partie Assistée** : l'application applique les règles.
- grille affichable, sélection au clic, contrôle limité au camp dont c'est le
  tour ;
- tour joué dans les phases déclarées par le module (cf. `turnStructure`) ;
  seule la phase de Mouvement déplace des pions ;
- points de mouvement (1 MP par hex), arêtes infranchissables, hex coupés par
  une île, zones de contrôle, empilement (une unité par hex en fin de
  mouvement), congestion des hex d'entrée des renforts, retour arrière et
  annulation de mouvement ;
- renforts : une unité entre en jeu à partir de son tour d'arrivée et peut
  attendre ;
- règles particulières au module (cf. `src/lib/useCoralSea.js` : leurres
  japonais au rôle secret, hex-objectifs du moteur, reconnaissance et
  repérage).

**Timings** (partie Assistée) : *Limité* accorde N minutes à **chaque** phase
de Mouvement (compte à rebours, clignote sous 20 s ; à zéro, le mouvement
s'arrête — il ne reste qu'à passer à la phase suivante) ; *Blitz*
donne à chaque camp un temps total pour toutes ses phases de Mouvement
(pendule d'échecs, une par camp, toujours visible) — à zéro, le camp **perd
la partie**.

## Journal de partie

Onglet « Journal » du panneau latéral (`JournalPanel.vue`) : chaque évènement
(déploiement, tour, phase, déplacement avec MP, entrée en jeu, recherche,
élimination…) y est inscrit avec de quoi le **rejouer**. En mode **debug**, il
montre aussi, sur fond rouge japonais, la décision de l'IA pour chaque task
force qu'elle déplace et chaque hex qu'elle choisit d'explorer en
reconnaissance : le chemin suivi dans son arbre de décision (cf.
`src/lib/coralSea/scenarios/scenario-5/movementTree.js` et `reconTree.js`) et ce qu'elle en conclut. Ces entrées sont
toujours enregistrées (export, rapport de bug), mais cachées hors debug.
- **Local** : sauvegarde automatique (navigateur) proposée en reprise au
  chargement suivant ; export/import JSON ; lecteur de rejeu (pas à pas ou
  avance rapide). Une sauvegarde faite avec d'autres réglages relance la
  partie avec les siens.
- **En ligne** : journal **partagé**, conservé par le serveur et identique
  chez tous les joueurs (déploiement tiré une seule fois, éliminations,
  retours arrière…) ; un joueur qui recharge la page ou se reconnecte est
  réaligné sur le serveur. Export JSON toujours possible.

**Signaler un bug** (bouton de la barre d'outils du plateau,
`BugReportModal.vue`, `src/lib/bugReport.js`) : ouvre la création d'un ticket
GitHub pré-rempli (titre, description, contexte de la partie, 30 derniers
coups en clair). Le joueur le valide avec son propre compte GitHub. Le ticket
joint aussi un **export** compressé : état de la carte et 30 derniers coups
avec leurs données. Pour le lire :
`node scripts/decode-bug-report.mjs <export>`. Le dépôt cible se change avec
`VITE_GITHUB_REPO`.

## Parties en ligne

Deux joueurs en double aveugle uniquement : sur l'accueil, cocher « Jouer en
ligne » sous ce mode, puis « Créer la partie » — la partie est créée sur le
serveur (`POST /api/games`) et le créateur arrive dans son salon,
`/room/:id` (`RoomLobby.vue`). Il y choisit pseudo et camp, puis copie le
**lien d'invitation** (`/room/:id?code=…`, code d'accès compris) pour son
adversaire, qui n'a plus qu'à choisir son pseudo et prend le camp restant.
La partie démarre dès que les deux camps sont pris ; le bandeau du plateau
indique qui est en ligne. Le serveur **refuse tout coup du joueur qui n'a
pas la main** ; l'interface bloque de même les actions hors tour. Les
identifiants du joueur restent dans son navigateur : une page rechargée ou
une connexion coupée le remet à sa place, la partie reconstituée par le
journal partagé.

**Le serveur arbitre le double aveugle** (`server/src/duel.js`) : il garde
les vraies positions et n'envoie à chaque navigateur que ce que son camp a
le droit de voir — les forces adverses n'y arrivent jamais, ce que la
console du navigateur ne peut donc pas trahir.
- À la création, il lit le module sur le site du jeu (`server/src/modules.js`)
  et en tire lui-même la séquence des camps, pas par pas.
- Mouvements : un coup ne part qu'au camp du pion, et à l'adversaire tant
  qu'il l'a découvert. Le serveur cherche le contact après chaque pas et
  l'annonce aux deux camps (entrée `contact`, avec la position des task
  forces dévoilées) ; un joueur qui recharge sa page retrouve les task
  forces adverses qu'il voit encore, à leur place.
- Reconnaissance : le joueur envoie ses hex de reco (`game:recon`) ; le
  serveur vérifie phase, portée et quota, **tire les chits** et envoie au
  chercheur ses seuls pions « Sighted » (ni chit, ni task forces des zones),
  à l'adversaire ses seules task forces survolées.
- Journal : chaque entrée d'un joueur ne se montre qu'à son camp (`visibleTo`),
  sauf tours, phases, déploiement et fin de partie ; contact et reconnaissance
  ne s'écrivent que par le serveur, et chaque joueur les rédige dans sa
  langue. En ligne, pas de mode debug.

Les règles que les deux camps comparent (contact, zones de reco, chits,
nuit) vivent dans `shared/duelRules.js`, utilisé à l'identique par le jeu
(duel sur un seul écran) et par le serveur. Le serveur ne vérifie pas encore
la légalité des mouvements (allure, côtes) : un navigateur modifié pourrait
déplacer ses task forces au-delà des règles — mais pas voir celles de
l'adversaire.

## Langue de l'interface

Sélecteur **FR / EN** dans la barre d'outils du plateau et en haut des autres
écrans (`LanguageSwitcher.vue`). Par défaut, la langue du navigateur
(français s'il le demande, anglais sinon) ; le choix du joueur est ensuite
mémorisé. Les textes vivent dans `src/i18n/fr.js` et `src/i18n/en.js`
(vue-i18n), avec les mêmes clés.
- Le **journal** reste dans la langue où il a été écrit : chaque ligne est
  rédigée dans la langue en cours au moment de l'évènement.
- Les noms d'**unités** et de **lieux** ne sont pas traduits.
- Les autres libellés d'un module (camps, scénarios, phases…) sont écrits en
  français dans son JSON ; leur traduction se donne dans son dictionnaire
  `i18n` (cf. ci-dessous). Les onglets de renforts s'y traduisent aussi en
  entier (`"Renfort américains": "US reinforcements"`).

## Anatomie d'un module

```
public/modules/<id>/
├── <id>.json          # tout ce qui suit
├── fleet-<camp>.json  # catalogues de navires (cf. `fleets`)
├── favicon.ico
└── images/            # carte, marqueurs, tables, counters/<faction>/*.png
```

Champs du JSON (cf. `coral-sea.json`) :

| Champ | Contenu |
|---|---|
| `boardGame`, `name`, `favicon` | Identité (titre de page, icône d'onglet) |
| `i18n` | Traductions des libellés du module, par langue et indexées par le texte français : `{"en": {"Américains": "Americans"}}` — un libellé absent reste en français (cf. `src/i18n/index.js::mt`) |
| `map` | `url`, `imageWidth/Height`, `cols`, `rows`, `evenColMinus` (colonnes décalées amputées d'une ligne), `removedHexes`, `calibration` (x0/y0/colStep/a/rowStep, en pixels de l'image) |
| `fleets` | Catalogues de navires, un fichier par camp (`{ "ijn": ".../fleet-ijn.json", "usn": ".../fleet-usn.json" }`), chargés avec le module (cf. `src/lib/moduleLoader.js`) : chaque navire avec ses faces intacte et endommagée (défense AA, durabilité, puissance de feu, image) ; les ordres de bataille des scénarios y piochent par id. `fleet-usn.json` réunit les marines alliées (`navy` : `usn`, `rn`, `ran`, `rnln`) |
| `scenarios` | Scénarios proposés : `id`, `label`, `deployment` (`setup` — seul mode appliqué par le moteur ; `free` : bientôt), `weather` (`required` / `optional`) — cf. `src/lib/gameSettings.js` ; `orderOfBattle` (par camp, groupes `{ id, name, ships }` pris dans `fleets` — `{ ship, count }` pour plusieurs pions ; les task forces alliées sont composées par le joueur, pions de l'ordre de bataille posés sur le support de chacune — cf. `src/components/TaskForceComposer.vue`, entrée `alliedFleet` du journal ; le Japonais en estime la défense AA par des moyennes) et `formations` (task forces japonaises tirées au coup d'envoi) ; `duel` (mode deux joueurs : `phases`, ids des phases jouées après la mise en place ; `setup`, par camp, `{ hexes, color }` — zone de mise en place en notation `setup`, cf. `src/lib/setup.js::zoneCells`, et couleur CSS de son dégradé ; `recon`, `{ role, range, zones: { camp: n } }` — chaque task force de rôle `role` sur la carte désigne `n` hex de reco à `range` hex ou moins d'elle) |
| `turnStructure` | `phases: [{ id, label, kind?, order?, shared? }]` : les phases du tour (`kind: "movement"` pour celle où l'on déplace des pions, sinon simple jalon ; `order: "roll"` pour un ordre des camps tiré au dé ; `shared: true` pour une phase jouée une seule fois pour tous les camps, au camp qui a l'initiative — ex. le Combat naval). Sans liste, une seule phase de Mouvement — cf. `src/lib/rules.js` |
| `rules` | Paramètres des règles génériques : `stackingLimit` (nombre, ou `"none"` si le jeu n'a pas de règle d'empilement ; ou par camp : `{ "ijn": 1, "usn": "none" }`), `zoc` (`lockIfStarting`, `stopOnEntry`), `entryCongestion` (`multiply` / `none`), et les valeurs des règles particulières du module — cf. `src/lib/rules.js` |
| `airStrike` | Frappe aéronavale : `die`, `antiAir` (Anti-Air Chart : `[bonus, malus]` par dé et colonne de défense AA — celle de la cible et de ses voisins sur le support de sa task force) et `airToSurface` (Air-to-Surface Chart : dégâts par ligne d6 + bonus + modificateur et colonne de puissance anti-ship diminuée du malus — à gauche de la 1re colonne, pas d'attaque), chacun avec `min` et `columns` (`{ max, label }`) ; `airToSurface.rowModifiers` (`dock`, `landBase` : -2) — cf. `src/lib/airStrike.js` (résolution, probabilités exactes, résultat selon la durabilité du navire) |
| `sides` | Camps jouables → factions (`{"ijn": ["ijn", "markers"], "usn": ["usn", "markers"]}`) |
| `turnTrack` | `turns`, `order` des camps, libellé, marqueur (et `color`, toute valeur CSS — ex. `var(--c-ijn)` : liseré d'initiative et onglet du camp dans le panneau latéral) de chaque camp ; facultatifs : `interleaved` (phases entremêlées : chaque phase est jouée par tous les camps avant la suivante), `turnInfo` (par tour : `time`, `initiative`, `movement`, `skipPhases`, `conditions`), `periods` (bandeaux Nuit/Jour...), `conditions` (lignes affichées) et `setup` (`{ side, label, short }` : étape de mise en place du camp `side` avant le tour 1) — cf. `shared/turnTrack.js` |
| `terrain` | Les couches d'arêtes (`seaBarriers`… : listes `"AAAA-BBBB"`) et `edges`, qui déclare ce que vaut chaque couche (infranchissable, coupe la ZOC) et l'ordre de priorité quand plusieurs se superposent — cf. `shared/edges.js` ; `edges.passages` nomme en plus la couche des hex coupés par une île (`{ "CCRR": { "couleur": [côtés] } }` : on ne ressort que par un côté de la couleur du côté d'entrée) — cf. `src/lib/passages.js` |
| `counters` | Par faction : `id`, `name`, `code`, `type`, `role`, `mov`, `src`, `turn` d'arrivée (`0` : posé à la mise en place, cf. `turnTrack.setup`), `setup`, `multiple` (`true` : pion en nombre illimité, qui reste dans le panneau après chaque pose — ex. leurres) |

`setup` (hex d'entrée) : `"0604"` (cet hex), `"0901-2301"` (plage de bord de
carte), `"*"` (n'importe quel hex de la carte, jamais posé d'office). Un pion
`type: "marker"` n'est pas une unité (cf. `src/lib/units.js`).

La **calibration** pixel de la grille (`map.calibration`) est ajustable en
direct via le panneau « calibration » ; `shared/calibration.js` ne garde
qu'un repli pour un module qui n'en déclarerait pas.

Les **règles particulières** d'un module (ce qu'aucun champ du JSON ne sait
exprimer) vivent dans un composable dédié inscrit dans le registre
`src/lib/moduleRules.js` — `src/lib/useCoralSea.js` sert de patron.

## Organisation du code

```
src/
├── views/        SoloHome (accueil, création de partie), DemoPlay (plateau local), RoomLobby (salon et plateau en ligne)
├── i18n/         textes de l'interface (fr.js, en.js), langue courante, libellés des modules
├── components/   HexMap (plateau et orchestration), TurnTracker, Counter,
│                 ReinforcementsPanel, EliminatedPanel, SearchBagPanel, JournalPanel, SidePanel,
│                 PhaseBlockedModal, GameEndModal, MoveTimer, RollModal, Toast, StackPopup,
│                 CalibrationPanel, ContextMenu, GameSetupSteps, LanguageSwitcher
└── lib/
    ├── useAssisted.js   mode Assisté : phases, MP, arêtes, ZOC, empilement, congestion
    ├── autoMove.js      plus court chemin d'un pion qui marche seul vers son hex-objectif
    ├── airStrike.js     frappe aéronavale (module.airStrike) : résolution et probabilités exactes
    ├── moduleRules.js   registre des règles particulières par module
    ├── useCoralSea.js   règles particulières du module Coral Sea (patron pour d'autres modules)
    ├── coralSea/        moteurs de chaque scénario Coral Sea (scenarios/scenario-N/ : flottes, placement,
    │                    déplacement, repérage, et leurs arbres de décision), outils communs (shared.js)
    ├── navalCombat.js   combat de surface (module.navalCombat) : tableau, tireurs, meilleur plan de tir
    ├── ai/              IA symbolique du camp japonais : moteur d'arbre de décision (decisionTree.js),
    │                    ce que sait le Japonais (coralSeaPerception.js)
    ├── rules.js         paramètres des règles génériques (module.rules), structure du tour (module.turnStructure)
    ├── setup.js         notation `setup` des pions (hex, plage, n'importe où)
    ├── passages.js      hex coupés par une île : côtés coloriés, sortie selon le côté d'entrée
    ├── useDebug.js      affichages de debug (coûts, portée, congestion)
    ├── units.js         qu'est-ce qu'une unité / un marqueur
    ├── hex.js, mapShape.js, calibration.js, edges.js, turnTrack.js   renvois vers shared/
    ├── gameSettings.js, journalStorage.js    réglages de partie, sauvegarde/reprise
    └── api.js, socket.js                     accès au serveur
shared/           code commun au jeu et au serveur — JavaScript pur, ni Vue ni i18n
├── hex.js, mapShape.js, calibration.js   géométrie de la grille
├── edges.js      nature des hexsides (terrain.edges) : franchissement, ZOC
├── turnTrack.js  piste de tour détaillée (initiative, détail et conditions par tour, mise en place)
└── duelRules.js  double aveugle : contact, zones de reco, chits, nuit
server/src/
├── index.js      Express + Socket.IO, purge périodique des parties
├── rooms.js      état des rooms (en mémoire), contrôle de tour, journal partagé et sa visibilité
├── socket.js     évènements temps réel (join, move, turn, phase, log, deploy, over, recon)
├── duel.js       arbitre du double aveugle en ligne
├── modules.js    lecture des modules sur le site du jeu
├── errors.js     erreurs renvoyées au client
└── routes/games.js   API REST : créer / lister / lire une partie
```

## Développement

```sh
npm install                 # front
(cd server && npm install)  # serveur

npm run dev                 # front sur http://localhost:5173
(cd server && npm run dev)  # serveur sur http://localhost:3001 (rechargé à chaque modification)

npm run build               # build de production (mode production, cf. .env.production)
npm run preview
```

Variables d'environnement : `VITE_API_URL` (front → URL du serveur, défaut
`http://localhost:3001`) ; `PORT`, `CLIENT_ORIGIN` et `MODULES_URL`
(serveur : port, origine autorisée du front, adresse du site où lire les
modules — défauts `3001`, `http://localhost:5173` et `CLIENT_ORIGIN`). Le
serveur lit les modules sur le site : en local, le front doit tourner pour
créer une partie en ligne.

## Mise en production

Task Force est servi sur **https://taskforce.gameboxheroes.fr/**. Le front
(`dist/`) et le serveur se déploient séparément ; une modification qui touche
les deux se déploie **serveur d'abord**.
- **Front** : `npm run build` (lit `.env.production`, non versionné :
  `VITE_API_URL=https://taskforce.gameboxheroes.fr`, sans port), puis copier
  tout `dist/`, `.htaccess` compris. `public/.htaccess` relaie `/api` et
  `/socket.io` vers le serveur Node sur le **port 8081** — le 8080 restant
  au serveur de generic-wargame (`rooms.gameboxheroes.fr`) — et assure le
  repli SPA.
- **Serveur** : copier `server/` (sans `node_modules/`) **et `shared/`** côte
  à côte dans un même dossier du VPS — le serveur importe `../../shared/` —,
  puis `npm install --omit=dev` dans `server/` et le lancer avec
  `PORT=8081 CLIENT_ORIGIN=https://taskforce.gameboxheroes.fr`
  (`node src/index.js`, ou un processus pm2 à part). Contrôle :
  `curl http://127.0.0.1:8081/api/health` → `{"ok":true}`.

Prérequis : Node `^22.18.0` ou `>=24.12.0` (voir `engines`).

Le serveur garde tout **en mémoire** : les parties disparaissent à son
redémarrage, et les rooms abandonnées sont purgées (6 h sans joueur pour une
room jamais lancée, 72 h pour une partie lancée).

## Scripts

`scripts/decode-bug-report.mjs` décode un rapport de bug exporté par
l'application.

## Limites connues

- « Placement libre » (déploiement `free`) et « Météo » sont proposés grisés :
  le moteur ne les applique pas encore.
- Certaines règles restent propres à un module et vivent donc dans son
  composable de règles particulières (`src/lib/useCoralSea.js`).
- Pas encore de combat (ni naval, ni aérien) : les phases correspondantes de
  la mer de Corail ne sont que des jalons du tour.
- Pas de suite de tests automatisée dans le dépôt (les vérifications se font
  par scripts ad hoc et navigateur automatisé).
