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

Choisis à la création de la partie (assistant en 4 étapes en local, 5 en ligne
avec le nombre de joueurs) — cf. `src/lib/gameSettings.js`.

| Réglage | Valeurs | Effet |
|---|---|---|
| Scénario | Ceux du module — Coral Sea : Scenario 5 : Bataille de la mer de Corail | Déploiement |
| Météo | *bientôt disponible* | — (pas encore appliquée par le moteur) |
| Partie | **Libre** / **Assisté** | Voir ci-dessous |
| Timing | Libre / **Limité** / **Blitz** | Chronomètre de la phase de Mouvement — partie Assistée uniquement |

**Partie Libre** : un bac à sable. Glisser-déposer libre de tous les pions,
aucune restriction de tour ni de règle, dé libre.

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
`src/lib/ai/coralSeaTrees.js`) et ce qu'elle en conclut. Ces entrées sont
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

`/` liste les parties, `/create` en crée une (code d'accès affiché une seule
fois), `/room/:id` la rejoint (pseudo, camp, code). La partie démarre quand
tous les sièges sont pris. Le serveur reçoit l'ordre des camps à la création
et **refuse tout coup du joueur qui n'a pas la main** ; l'interface bloque de
même les actions hors tour. La liste des joueurs indique qui est en ligne.

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
├── favicon.ico
└── images/            # carte, marqueurs, tables, counters/<faction>/*.png
```

Champs du JSON (cf. `coral-sea.json`) :

| Champ | Contenu |
|---|---|
| `boardGame`, `name`, `favicon` | Identité (titre de page, icône d'onglet) |
| `i18n` | Traductions des libellés du module, par langue et indexées par le texte français : `{"en": {"Américains": "Americans"}}` — un libellé absent reste en français (cf. `src/i18n/index.js::mt`) |
| `map` | `url`, `imageWidth/Height`, `cols`, `rows`, `evenColMinus` (colonnes décalées amputées d'une ligne), `removedHexes`, `calibration` (x0/y0/colStep/a/rowStep, en pixels de l'image) |
| `scenarios` | Scénarios proposés : `id`, `label`, `deployment` (`setup` — seul mode appliqué par le moteur ; `free` : bientôt), `weather` (`required` / `optional`) — cf. `src/lib/gameSettings.js` |
| `turnStructure` | `phases: [{ id, label, kind?, order? }]` : les phases du tour (`kind: "movement"` pour celle où l'on déplace des pions, sinon simple jalon ; `order: "roll"` pour un ordre des camps tiré au dé). Sans liste, une seule phase de Mouvement — cf. `src/lib/rules.js` |
| `rules` | Paramètres des règles génériques : `stackingLimit` (nombre, ou `"none"` si le jeu n'a pas de règle d'empilement ; ou par camp : `{ "ijn": 1, "usn": "none" }`), `zoc` (`lockIfStarting`, `stopOnEntry`), `entryCongestion` (`multiply` / `none`), et les valeurs des règles particulières du module — cf. `src/lib/rules.js` |
| `airStrike` | Frappe aéronavale : `die`, `antiAir` (Anti-Air Chart : `[bonus, malus]` par dé et colonne de défense AA — celle de la cible et de ses voisins sur le support de sa task force) et `airToSurface` (Air-to-Surface Chart : dégâts par ligne d6 + bonus + modificateur et colonne de puissance anti-ship diminuée du malus — à gauche de la 1re colonne, pas d'attaque), chacun avec `min` et `columns` (`{ max, label }`) ; `airToSurface.rowModifiers` (`dock`, `landBase` : -2) — cf. `src/lib/airStrike.js` (résolution, probabilités exactes, résultat selon la durabilité du navire) |
| `sides` | Camps jouables → factions (`{"ijn": ["ijn", "markers"], "usn": ["usn", "markers"]}`) |
| `turnTrack` | `turns`, `order` des camps, libellé, marqueur (et `color`) de chaque camp ; facultatifs : `interleaved` (phases entremêlées : chaque phase est jouée par tous les camps avant la suivante), `turnInfo` (par tour : `time`, `initiative`, `movement`, `skipPhases`, `conditions`), `periods` (bandeaux Nuit/Jour...), `conditions` (lignes affichées) et `setup` (`{ side, label, short }` : étape de mise en place du camp `side` avant le tour 1) — cf. `src/lib/turnTrack.js` |
| `terrain` | Les couches d'arêtes (`seaBarriers`… : listes `"AAAA-BBBB"`) et `edges`, qui déclare ce que vaut chaque couche (infranchissable, coupe la ZOC) et l'ordre de priorité quand plusieurs se superposent — cf. `src/lib/edges.js` ; `edges.passages` nomme en plus la couche des hex coupés par une île (`{ "CCRR": { "couleur": [côtés] } }` : on ne ressort que par un côté de la couleur du côté d'entrée) — cf. `src/lib/passages.js` |
| `counters` | Par faction : `id`, `name`, `code`, `type`, `role`, `mov`, `src`, `turn` d'arrivée (`0` : posé à la mise en place, cf. `turnTrack.setup`), `setup`, `multiple` (`true` : pion en nombre illimité, qui reste dans le panneau après chaque pose — ex. leurres) |

`setup` (hex d'entrée) : `"0604"` (cet hex), `"0901-2301"` (plage de bord de
carte), `"*"` (n'importe quel hex de la carte, jamais posé d'office). Un pion
`type: "marker"` n'est pas une unité (cf. `src/lib/units.js`).

La **calibration** pixel de la grille (`map.calibration`) est ajustable en
direct via le panneau « calibration » ; `src/lib/calibration.js` ne garde
qu'un repli pour un module qui n'en déclarerait pas.

Les **règles particulières** d'un module (ce qu'aucun champ du JSON ne sait
exprimer) vivent dans un composable dédié inscrit dans le registre
`src/lib/moduleRules.js` — `src/lib/useCoralSea.js` sert de patron.

## Organisation du code

```
src/
├── views/        GamesList, CreateGame, LocalGameSetup, DemoPlay (plateau local), RoomLobby (plateau en ligne)
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
    ├── ai/              IA symbolique du camp japonais : moteur d'arbre de décision (decisionTree.js),
    │                    ce que sait le Japonais (coralSeaPerception.js), arbres et réglages (coralSeaTrees.js)
    ├── rules.js         paramètres des règles génériques (module.rules), structure du tour (module.turnStructure)
    ├── turnTrack.js     piste de tour détaillée (initiative, détail et conditions par tour, mise en place)
    ├── setup.js         notation `setup` des pions (hex, plage, n'importe où)
    ├── edges.js         nature des hexsides (terrain.edges) : franchissement, ZOC
    ├── passages.js      hex coupés par une île : côtés coloriés, sortie selon le côté d'entrée
    ├── useDebug.js      affichages de debug (coûts, portée, congestion)
    ├── units.js         qu'est-ce qu'une unité / un marqueur
    ├── hex.js, mapShape.js, calibration.js   géométrie de la grille
    ├── gameSettings.js, journalStorage.js    réglages de partie, sauvegarde/reprise
    └── api.js, socket.js                     accès au serveur
server/src/
├── index.js      Express + Socket.IO, purge périodique des parties
├── rooms.js      état des rooms (en mémoire), contrôle de tour, journal partagé
├── socket.js     évènements temps réel (join, move, turn, phase, log, deploy, over)
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
`http://localhost:3001`) ; `PORT` et `CLIENT_ORIGIN` (serveur, défauts `3001`
et `http://localhost:5173`). Pour un hébergement Apache, `public/.htaccess`
relaie `/api` et `/socket.io` vers le serveur Node (port 8080) et assure le
repli SPA.

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
