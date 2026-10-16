// Textes de l'interface en français (cf. src/i18n/index.js). Mêmes clés que
// en.js. Dans les messages, `{nom}` est un paramètre ; `@`, `|`, `{` et `}`
// littéraux s'écrivent `{'@'}`, `{'|'}`, `{'{'}` et `{'}'}`.
export default {
  language: {
    label: 'Langue',
    fr: 'Français',
    en: 'English',
  },

  common: {
    back: 'Retour',
    next: 'Suivant',
    loading: 'Chargement…',
    comingSoon: 'Bientôt disponible',
    close: 'Fermer',
    cancel: 'Annuler',
    gotIt: 'Compris',
  },

  errors: {
    'not-found': "Cette partie n'existe pas (ou plus).",
    'bad-passcode': "Code d'accès incorrect.",
    'room-full': 'Cette room est déjà complète.',
    'side-taken': 'Ce camp est déjà pris par un autre joueur.',
    'already-started': 'Cette partie a déjà commencé.',
    'not-started': "La partie n'a pas encore commencé.",
    'bad-name': 'Pseudo invalide (1 à 40 caractères).',
    'bad-side': 'Camp invalide.',
    'too-many-games': 'Trop de parties en cours sur le serveur : réessaie plus tard.',
    'unknown-error': 'Erreur inconnue du serveur.',
  },

  settings: {
    scenarioHistorical: 'Historique',
    party: { libre: 'Libre', assiste: 'Assisté' },
    timing: { libre: 'Libre', limite: 'Limité', blitz: 'Blitz' },
    timingHint: {
      limite: 'Conseillé : 4 à 8 minutes / tour',
      blitz: 'Conseillé : 40 à 60 minutes',
    },
    timingLocked: 'Le chronomètre porte sur la phase de Mouvement : disponible en partie Assistée uniquement.',
  },

  summary: {
    scenario: 'Scénario : {name}',
    weatherOn: 'Météo activée',
    party: 'Partie {name}',
    timing: 'Timing {name}',
  },

  setup: {
    stepOf: 'Étape {step} / {total}',
    chooseModule: '1. Choisir le module',
    chooseScenario: '2. Choisir le scénario',
    options: '3. Options',
    gameMode: '4. Mode de jeu',
    party: 'Partie',
    timing: 'Timing',
    weather: 'Météo',
    weatherNotYet: 'Les règles de météo ne sont pas encore appliquées par le moteur.',
    weatherRequired: 'Obligatoire pour ce scénario.',
    limitedDuration: 'Durée de la phase de mouvement (minutes)',
    blitzDuration: 'Temps total de mouvement par joueur (minutes)',
    loadingModule: 'Chargement du module…',
    moduleLoadError: 'Impossible de charger ce module.',
  },

  createGame: {
    title: 'Créer une partie en ligne',
    playerCount: '5. Nombre de joueurs',
    playerRange: 'Entre {min} et {max} joueurs pour ce module.',
    creating: 'Création…',
    create: 'Créer la partie',
  },

  localGame: {
    title: 'Partie en local',
    start: 'Lancer la partie',
  },

  gamesList: {
    title: 'Parties en cours',
    localGame: 'Partie en local',
    createGame: 'Créer une partie',
    created: "Partie créée ! Code d'accès pour la room {room} : {passcode} — transmets-le aux autres joueurs.",
    players: '{count} / {max} joueurs',
    status: { lobby: 'en attente', started: 'en cours' },
    variants: 'Variantes : {list}',
    empty: 'Aucune partie en cours. Crée-en une !',
  },

  lobby: {
    backToGames: 'Retour aux parties',
    loadingGame: 'Chargement de la partie…',
    replayWarning: "Cette sauvegarde a été jouée avec d'autres réglages que cette partie en ligne : impossible de la reprendre ici.",
    genericSide: 'Camp {n}',
    nickname: 'Pseudo',
    side: 'Camp',
    taken: 'pris',
    passcode: "Code d'accès",
    joining: 'Connexion…',
    join: 'Rejoindre la room',
    waiting: 'En attente des autres joueurs… ({count} / {max})',
    started: 'La partie est lancée !',
    you: 'vous',
    online: 'en ligne',
    offline: 'hors ligne',
  },



  eliminated: {
    empty: 'Aucune unité éliminée.',
    hint: 'Clic droit sur un pion pour le replacer dans les renforts.',
  },

  reinforcements: {
    arrivesOnTurn: 'Arrive au tour {turn}',
    notThisPhase: 'Ne peut pas entrer en jeu pendant cette phase',
    empty: 'Tous les renforts sont sur la carte.',
    turn: 'Tour {turn}',
    setup: 'Mise en place',
    unlimited: 'En nombre illimité',
    hintDrag: "Glisser un pion sur la carte pour le poser librement, ou cliquer dessus puis cliquer un des hex d'entrée surlignés en orange.",
    hintClick: "Cliquer un pion puis cliquer un des hex d'entrée surlignés en orange sur la carte.",
  },

  moveTimer: {
    label: 'Mouvement',
    title: 'Temps restant pour la phase de Mouvement',
  },


  turnTracker: {
    nextTurn: 'Tour suivant',
  },



  dice: {
    result: 'Résultat :',
    roll: 'Lancer le dé',
    reroll: 'Relancer',
  },

  phaseBlocked: {
    title: 'Impossible de changer de phase',
    stacks: 'Plusieurs unités amies occupent le même hex. Déplacez-en une avant de terminer la phase Mouvement :',
  },


  bugReport: {
    intro: 'Un export du jeu sera réalisé, et placé dans un rapport de bug GitHub. Il vous faut un compte GitHub pour poursuivre.',
    quick: "Cela ne vous prendra qu'un instant de signaler le bug et vous pourrez reprendre votre partie ensuite.",
    lastMoves: "L'export ne contiendra que les {count} derniers coups, donc assurez-vous que votre problème s'y trouve, ou bien détaillez la marche à suivre pour le reproduire.",
    fullGame: "La partie complète sera téléchargée ({file}) : glissez ce fichier dans le rapport GitHub, il permet de reproduire le problème.",
    titlePlaceholder: 'Un titre concis',
    descriptionPlaceholder: "Ce qu'il s'est passé",
    exportFailed: "L'export du jeu n'a pas pu être préparé : décrivez le problème en détail.",
    exportTrimmed: "Pour tenir dans le rapport, l'export ne contient que les {count} derniers coups.",
    descriptionCut: 'Description trop longue : elle sera tronquée dans le rapport.',
    submit: 'Soumettre',
  },

  calibration: {
    title: 'Calibration de la grille',
    originX: 'origine X (centre du 1er hex)',
    originY: 'origine Y (centre du 1er hex)',
    colStep: 'pas colonne',
    radius: 'rayon horizontal a',
    rowStep: 'pas ligne (2·b)',
    cols: 'colonnes',
    rows: 'lignes',
    strokeWidth: 'trait — épaisseur',
    strokeOpacity: 'trait — opacité',
    strokeColor: 'couleur trait',
    reset: 'réinitialiser défauts',
    copy: 'copier la config JSON',
    copied: 'copié ✓',
    hint: "Repère SVG = pixels natifs de l'image ({width}×{height}), ces valeurs sont directement réutilisables dans le JSON du module une fois l'alignement satisfaisant. Zoomez sur un coin de la carte (ex. le premier hex \"0101\" en haut à gauche) et ajustez x0/y0/colStep/a/rowStep jusqu'à ce que les polygones tracés collent aux hexagones imprimés. Décalage des colonnes impaires (2e, 4e…) = +pas_ligne/2, déjà appliqué.",
  },

  journal: {
    events: '{n} évènement | {n} évènements',
    restartedInMode: 'La partie a été relancée en mode {mode}, celui de la sauvegarde.',
    autosaveResumed: 'Sauvegarde auto reprise : {events}.',
    loadedCount: 'Journal chargé : {events}.',
    notAList: "le fichier ne contient pas une liste d'évènements",
    otherModule: 'ce journal appartient à un autre module ({module})',
    loadError: 'Impossible de charger ce journal : {reason}',
    fromStart: 'Depuis le début',
    latestFirst: 'Position courante',
    save: 'Enregistrer (JSON)',
    load: 'Charger un journal',
    autosave: 'Sauvegarde auto : {label}',
    shared: 'Journal partagé entre les joueurs, enregistré sur le serveur.',
    found: 'Une partie en cours a été trouvée ({label}).',
    foundWithMode: 'Une partie en cours a été trouvée ({label}, mode {mode}).',
    resume: 'Reprendre',
    ignore: 'Ignorer',
    empty: "Aucun évènement pour l'instant.",
    clear: 'Vider le journal',
    loaded: 'Journal chargé',
    loadErrorTitle: 'Erreur de chargement',
  },


  phases: {
    setup: 'Mise en place',
    movement: 'Mouvement',
  },

  tabs: {
    reinforcements: 'Renforts',
    sideReinforcements: 'Renfort {side}',
    searchBag: 'Tasse de recherche',
    eliminated: 'Unités éliminées',
    journal: 'Journal',
  },

  searchBag: {
    total: '{left} chits sur {total} dans la tasse',
    hint: "Les chits tirés n'y retournent qu'aux tours « Tous rendus » de la piste (la nuit).",
  },

  sighting: {
    noContact: 'Pas de contact',
    noTF: 'Pas de TF',
    carrierTF: 'Carrier TF',
    fleetTF: 'Fleet TF',
  },

  recon: {
    toast: 'Reconnaissance en {hex} : {sighting}',
    toastRemoved: 'Reconnaissance en {hex} : {sighting} — leurre détecté, retiré du jeu',
    skipTitle: 'Reconnaissance inachevée',
    skipMessage: 'Il reste {n} reconnaissance japonaise à faire. Passer la phase quand même ? | Il reste {n} reconnaissances japonaises à faire. Passer la phase quand même ?',
    skipConfirm: 'Passer quand même',
  },
  setupCheck: {
    shortTitle: 'Mise en place incomplète',
    short: "Seulement {count} task forces (leurres compris) sur {total} sont posées. Commencer la partie quand même ?",
    confirm: 'Commencer quand même',
    excessTitle: 'Trop de task forces',
    excess: "{count} task forces (leurres compris) sont posées, pour {total} au plus. Retirez-en {extra} (clic droit sur le pion, « Replacer le pion ») avant de commencer.",
  },
  noMove: {
    title: 'Aucun mouvement',
    message: "Aucune unité n'a été déplacée pendant cette phase de mouvement. Terminer la phase quand même ?",
    confirm: 'Terminer quand même',
  },

  menu: {
    reconReport: 'Rapport de reconnaissance',
    putBack: 'Replacer le pion',
    eliminate: 'Éliminé',
    cancelMove: 'Annuler le mouvement',
    restack: "Changer l'ordre de l'empilement",
  },

  stack: {
    title: 'Hex {hex} — {n} pions',
    placed: 'Tour {turn}',
    placedAt: 'Tour {turn} · {time}',
    partiallyDetected: 'Flotte partiellement détectée',
  },


  gameEnd: {
    title: 'Fin de la partie',
    bravo: 'Bravo, victoire des {side} !',
    draw: 'Match nul : les deux camps sont à égalité de points.',
    byConcession: '{side} a concédé la partie.',
    byTime: 'Le temps de {side} est écoulé.',
    confirmTitle: 'Concéder la partie',
    confirmMessage: 'Les {side} abandonnent la partie et la donnent à leur adversaire. Cette décision est définitive.',
    concede: 'Concéder',
  },

  timeUp: {
    title: 'Temps imparti terminé',
    limited: "Le temps accordé pour la phase de Mouvement est écoulé : vous ne pouvez plus déplacer d'unité. Passez à la phase suivante.",
    blitz: 'Le temps de mouvement du camp « {side} » est écoulé : ce camp perd la partie.',
    youLost: 'Vous avez perdu.',
    youWon: 'Vous avez gagné !',
  },

  unitStack: {
    title: 'Mouvement non terminé',
    message: 'Cette unité partage son hex avec une unité amie. Déplacez-la (ou annulez son mouvement) avant de passer à une autre unité :',
  },

  log: {
    deployment: 'Déploiement initial',
    turn: 'Tour {turn} — {side}',
    turnPhase: 'Tour {turn} — {phase} : {side}',
    turnPhaseRoll: 'Tour {turn} — {phase}',
    dummyUnmasked: 'leurre démasqué par la reconnaissance',
    raid: 'Raid aérien japonais sur {unit} en {hex} : {raiders}',
    dummyReinforce: 'Nuit : {n} TF undetected japonaise rejoint la carte en {hexes} | Nuit : {n} TF undetected japonaises rejoignent la carte en {hexes}',
    searchRefill: 'Nuit : {total} chit de recherche retourne dans la tasse ({detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost) | Nuit : {total} chits de recherche retournent dans la tasse ({detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost)',
    searchHidden: 'Reconnaissance {side} depuis {from} en {hex} ({unit}) : {sighting}',
    reconCarrier: 'un porte-avions',
    search: 'Reconnaissance {side} depuis {from} en {hex} ({unit}) : {result} → {sighting} (tasse : {detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost)',
    rollOrder: '{phase} — ordre au dé : {rolls} → {side} joue en premier',
    reroll: ', égalité, relance : ',
    phase: 'Phase : {name}',
    dice: 'Lancer de dé : {value}',
    moveCancelled: '{unit} : mouvement annulé, retour en {hex}',
    moves: '{unit} se déplace vers {hex}',
    moved: '{unit} déplacé de {from} vers {to}',
    enters: '{unit} entre en jeu en {hex}',
    congestion: "hex d'entrée déjà utilisé ({rank}e entrée ce tour) : coût ×{rank} = {cost} MP au lieu de {base}",
    returned: '{unit} replacé dans les renforts',
    eliminated: '{unit} éliminé',
    timeUp: 'Temps écoulé — {side} perd la partie',
    conceded: '{side} concède la partie',
  },

  phaseButton: {
    newPhase: 'Nouvelle phase',
    newTurn: 'Nouveau tour',
    otherPlayer: 'Autre joueur',
  },



  toolbar: {
    gameOverTag: 'Partie terminée — {side} perd au temps',
    concede: 'Concéder la partie',
    concedeTitle: 'Abandonner la partie : votre adversaire la remporte',
    gameSummary: 'Bilan de la partie',
    gameSummaryTitle: 'Revoir le vainqueur de la partie',
    gridDisabled: 'Grille désactivée en partie libre',
    grid: 'grille',
    coordinates: 'coordonnées',
    calibration: 'calibration',
    debug: 'debug',
    hideCounters: 'Cacher les pions',
    showCounters: 'Afficher les pions',
    undo: '↩ Retour arrière',
    hideDie: 'Cacher le dé',
    showDie: 'Afficher le dé',
    bugReportTitle: 'Ouvrir un rapport de bug sur GitHub, avec un export de la partie',
    bugReport: 'Signaler un bug',
    replayStep: 'Lecture : avancer d\'une ligne',
    replayEnd: 'Avance rapide : aller à la fin',
    help: 'Aide',
    helpTitle: "Guide de l'interface",
  },


  guide: {
    stepOf: 'Étape {step} / {total}',
    previous: 'Précédent',
    finish: 'Terminer',
    intro: "Bienvenue ! Ce guide présente l'écran de jeu en quelques étapes. Vous jouez en mode {mode}. Vous pourrez le rouvrir à tout moment avec le bouton « ? » de la barre d'outils.",
    toolbar: {
      title: 'La barre du haut',
      lead: "En haut de l'écran, tout ce qui décrit où en est la partie.",
      turn: { term: 'Piste des tours', text: 'Le tour en cours et le camp qui joue. Seul le camp actif peut déplacer ses unités.' },
      phases: { term: 'Phases et bouton « suivant »', text: 'Sous la piste, les phases du tour. Le bouton passe à la phase suivante, puis au camp suivant : il est refusé tant qu’il reste des unités empilées.' },
      next: { term: 'Bouton « suivant »', text: "Fait avancer la piste des tours d'un pas quand un camp a fini de jouer." },
      timer: { term: 'Chronomètre', text: 'Affiché seulement si la partie a un timing Limité ou Blitz.' },
    },
    map: {
      title: 'La carte',
      lead: 'Au centre, la carte et ses pions.',
      zoom: { term: 'Zoom', text: 'Molette de la souris, ou boutons − / + en haut à droite.' },
      pan: { term: 'Se déplacer', text: 'Maintenez le clic droit enfoncé et faites glisser pour faire défiler la carte.' },
      stack: { term: 'Piles de pions', text: "Survolez un pion empilé pour voir en grand tous les pions de l'hex." },
    },
    units: {
      title: 'Jouer ses unités',
      lead: 'Comment déplacer les pions et agir sur eux.',
      select: { term: 'Déplacer une unité', text: "Cliquez sur une de vos unités pour la sélectionner, puis cliquez sur l'hex de destination." },
      highlight: { term: 'Hex surlignés', text: "Les hex atteignables avec les points de mouvement restants sont mis en évidence. Il en va de même pour les hex d'entrée d'un renfort sélectionné." },
      drag: { term: 'Déplacer un pion', text: 'Glissez-déposez un pion sur la carte, ou depuis le panneau des renforts. Aucune règle n’est vérifiée : à vous de les appliquer.' },
      menu: { term: 'Menu du pion', text: "Clic droit sur un pion : le replacer dans les renforts, l'éliminer, ou annuler son mouvement." },
      undo: { term: 'Retour arrière', text: 'Annule le dernier mouvement pendant la phase Mouvement.' },
    },
    panel: {
      title: 'Le panneau latéral',
      lead: "Sur le bord droit, des onglets s'ouvrent au clic.",
      reinforcements: { term: 'Renforts', text: "Un onglet par camp, avec les unités qui arrivent et leur tour d'entrée." },
      eliminated: { term: 'Unités éliminées', text: 'Les pions retirés de la carte.' },
      journal: { term: 'Journal', text: 'Chaque action de la partie, enregistrée automatiquement. On peut y sauvegarder, charger ou rejouer une partie.' },
    },
    tools: {
      title: 'Les outils',
      lead: 'À droite de la barre du haut, quelques boutons utiles.',
      die: { term: 'Dé', text: 'Un dé à lancer soi-même.' },
      display: { term: 'Affichage', text: 'Masquer les pions pour voir le terrain, afficher les coordonnées des hex.' },
      bug: { term: 'Signaler un bug', text: 'Ouvre un rapport GitHub pré-rempli avec un export de la partie.' },
      help: { term: 'Aide « ? »', text: 'Rouvre ce guide.' },
    },
  },
}
