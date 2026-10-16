// English interface texts (cf. src/i18n/index.js). Same keys as fr.js.
export default {
  language: {
    label: 'Language',
    fr: 'Français',
    en: 'English',
  },

  common: {
    back: 'Back',
    next: 'Next',
    loading: 'Loading…',
    comingSoon: 'Coming soon',
    close: 'Close',
    cancel: 'Cancel',
    gotIt: 'Got it',
  },

  errors: {
    'not-found': 'This game does not exist (anymore).',
    'bad-passcode': 'Wrong passcode.',
    'room-full': 'This room is already full.',
    'side-taken': 'This side is already taken by another player.',
    'already-started': 'This game has already started.',
    'not-started': 'The game has not started yet.',
    'bad-name': 'Invalid nickname (1 to 40 characters).',
    'bad-side': 'Invalid side.',
    'too-many-games': 'Too many games running on the server: try again later.',
    'unknown-error': 'Unknown server error.',
  },

  settings: {
    scenarioHistorical: 'Historical',
    party: { libre: 'Free', assiste: 'Assisted' },
    timing: { libre: 'Untimed', limite: 'Limited', blitz: 'Blitz' },
    timingHint: {
      limite: 'Suggested: 4 to 8 minutes per turn',
      blitz: 'Suggested: 40 to 60 minutes',
    },
    timingLocked: 'The clock runs during the Movement phase: only available in Assisted games.',
  },

  summary: {
    scenario: 'Scenario: {name}',
    weatherOn: 'Weather on',
    party: 'Mode: {name}',
    timing: 'Timing: {name}',
  },

  setup: {
    stepOf: 'Step {step} / {total}',
    chooseModule: '1. Choose the module',
    chooseScenario: '2. Choose the scenario',
    options: '3. Options',
    gameMode: '4. Game mode',
    party: 'Mode',
    timing: 'Timing',
    weather: 'Weather',
    weatherNotYet: 'Weather rules are not applied by the engine yet.',
    weatherRequired: 'Required for this scenario.',
    limitedDuration: 'Length of the movement phase (minutes)',
    blitzDuration: 'Total movement time per player (minutes)',
    loadingModule: 'Loading the module…',
    moduleLoadError: 'Unable to load this module.',
  },

  createGame: {
    title: 'Create an online game',
    playerCount: '5. Number of players',
    playerRange: 'Between {min} and {max} players for this module.',
    creating: 'Creating…',
    create: 'Create the game',
  },

  localGame: {
    title: 'Local game',
    start: 'Start the game',
  },

  gamesList: {
    title: 'Open games',
    localGame: 'Local game',
    createGame: 'Create a game',
    created: 'Game created! Passcode for room {room}: {passcode} — share it with the other players.',
    players: '{count} / {max} players',
    status: { lobby: 'waiting', started: 'in progress' },
    variants: 'Variants: {list}',
    empty: 'No game in progress. Create one!',
  },

  lobby: {
    backToGames: 'Back to games',
    loadingGame: 'Loading the game…',
    replayWarning: 'This save was played with different settings from this online game: it cannot be resumed here.',
    genericSide: 'Side {n}',
    nickname: 'Nickname',
    side: 'Side',
    taken: 'taken',
    passcode: 'Passcode',
    joining: 'Connecting…',
    join: 'Join the room',
    waiting: 'Waiting for the other players… ({count} / {max})',
    started: 'The game has started!',
    you: 'you',
    online: 'online',
    offline: 'offline',
  },



  eliminated: {
    empty: 'No unit eliminated.',
    hint: 'Right-click a counter to put it back into the reinforcements.',
  },

  reinforcements: {
    arrivesOnTurn: 'Arrives on turn {turn}',
    notThisPhase: 'Cannot enter play during this phase',
    empty: 'All reinforcements are on the map.',
    turn: 'Turn {turn}',
    setup: 'Setup',
    unlimited: 'Unlimited supply',
    hintDrag: 'Drag a counter onto the map to place it freely, or click it then click one of the entry hexes highlighted in orange.',
    hintClick: 'Click a counter then click one of the entry hexes highlighted in orange on the map.',
  },

  moveTimer: {
    label: 'Movement',
    title: 'Time left for the Movement phase',
  },


  turnTracker: {
    nextTurn: 'Next turn',
  },



  dice: {
    result: 'Result:',
    roll: 'Roll the die',
    reroll: 'Roll again',
  },

  phaseBlocked: {
    title: 'Cannot change phase',
    stacks: 'Several friendly units share the same hex. Move one of them before ending the Movement phase:',
  },


  bugReport: {
    intro: 'An export of the game will be made and put into a GitHub bug report. You need a GitHub account to continue.',
    quick: 'Reporting the bug only takes a moment, and you can resume your game afterwards.',
    lastMoves: 'The export will only contain the last {count} moves, so make sure your problem is among them, or describe the steps to reproduce it.',
    fullGame: 'The full game will be downloaded ({file}): drop this file into the GitHub report, it lets us reproduce the problem.',
    titlePlaceholder: 'A short title',
    descriptionPlaceholder: 'What happened',
    exportFailed: 'The game export could not be prepared: describe the problem in detail.',
    exportTrimmed: 'To fit in the report, the export only contains the last {count} moves.',
    descriptionCut: 'Description too long: it will be truncated in the report.',
    submit: 'Submit',
  },

  calibration: {
    title: 'Grid calibration',
    originX: 'origin X (center of the 1st hex)',
    originY: 'origin Y (center of the 1st hex)',
    colStep: 'column step',
    radius: 'horizontal radius a',
    rowStep: 'row step (2·b)',
    cols: 'columns',
    rows: 'rows',
    strokeWidth: 'stroke — width',
    strokeOpacity: 'stroke — opacity',
    strokeColor: 'stroke color',
    reset: 'reset to defaults',
    copy: 'copy the JSON config',
    copied: 'copied ✓',
    hint: 'SVG frame = native pixels of the image ({width}×{height}); once the alignment is right, these values can be reused as-is in the module JSON. Zoom on a corner of the map (e.g. the first hex "0101" top left) and adjust x0/y0/colStep/a/rowStep until the drawn polygons match the printed hexagons. Odd columns (2nd, 4th…) are shifted by +row_step/2, already applied.',
  },

  journal: {
    events: '{n} event | {n} events',
    restartedInMode: 'The game was restarted in {mode} mode, the one of the save.',
    autosaveResumed: 'Autosave resumed: {events}.',
    loadedCount: 'Log loaded: {events}.',
    notAList: 'the file does not contain a list of events',
    otherModule: 'this log belongs to another module ({module})',
    loadError: 'Unable to load this log: {reason}',
    fromStart: 'From the start',
    latestFirst: 'Latest first',
    save: 'Save (JSON)',
    load: 'Load a log',
    autosave: 'Autosave: {label}',
    shared: 'Log shared between the players, saved on the server.',
    found: 'A game in progress was found ({label}).',
    foundWithMode: 'A game in progress was found ({label}, {mode} mode).',
    resume: 'Resume',
    ignore: 'Ignore',
    empty: 'No event yet.',
    clear: 'Clear the log',
    loaded: 'Log loaded',
    loadErrorTitle: 'Loading error',
  },


  phases: {
    setup: 'Setup',
    movement: 'Movement',
  },

  tabs: {
    reinforcements: 'Reinforcements',
    sideReinforcements: '{Side} reinforcements',
    searchBag: 'Search cup',
    eliminated: 'Eliminated units',
    journal: 'Log',
  },

  searchBag: {
    total: '{left} of {total} chits in the cup',
    hint: 'Drawn chits only go back in on the "all returned" turns of the track (at night).',
  },

  sighting: {
    noContact: 'No contact',
    noTF: 'No TF',
    carrierTF: 'Carrier TF',
    fleetTF: 'Fleet TF',
  },

  recon: {
    toast: 'Reconnaissance in {hex}: {sighting}',
    toastRemoved: 'Reconnaissance in {hex}: {sighting} — dummy detected, removed from play',
    skipTitle: 'Reconnaissance not finished',
    skipMessage: '{n} Japanese reconnaissance is still to do. Skip the phase anyway? | {n} Japanese reconnaissances are still to do. Skip the phase anyway?',
    skipConfirm: 'Skip anyway',
  },
  setupCheck: {
    shortTitle: 'Incomplete setup',
    short: 'Only {count} task forces (dummies included) out of {total} have been placed. Start the game anyway?',
    confirm: 'Start anyway',
    excessTitle: 'Too many task forces',
    excess: '{count} task forces (dummies included) have been placed, but at most {total} are allowed. Remove {extra} of them (right-click the counter, "Put the counter back") before starting.',
  },
  noMove: {
    title: 'No movement',
    message: 'No unit was moved during this movement phase. End the phase anyway?',
    confirm: 'End anyway',
  },

  menu: {
    reconReport: 'Reconnaissance report',
    putBack: 'Put the counter back',
    eliminate: 'Eliminated',
    cancelMove: 'Cancel the move',
    restack: 'Change the stacking order',
  },

  stack: {
    title: 'Hex {hex} — {n} counters',
    placed: 'Turn {turn}',
    placedAt: 'Turn {turn} · {time}',
    partiallyDetected: 'Fleet partially detected',
  },


  gameEnd: {
    title: 'Game over',
    bravo: 'Congratulations, victory for the {side}!',
    draw: 'Draw: both sides are level on points.',
    byConcession: 'The {side} conceded the game.',
    byTime: 'The {side} ran out of time.',
    confirmTitle: 'Concede the game',
    confirmMessage: 'The {side} give up the game and hand it to their opponent. This cannot be undone.',
    concede: 'Concede',
  },

  timeUp: {
    title: 'Time is up',
    limited: 'The time allowed for the Movement phase is over: you can no longer move any unit. Go on to the next phase.',
    blitz: 'The movement time of the “{side}” side is over: this side loses the game.',
    youLost: 'You lost.',
    youWon: 'You won!',
  },

  unitStack: {
    title: 'Move not finished',
    message: 'This unit shares its hex with a friendly unit. Move it (or cancel its move) before switching to another unit:',
  },

  log: {
    deployment: 'Initial deployment',
    turn: 'Turn {turn} — {side}',
    turnPhase: 'Turn {turn} — {phase}: {side}',
    turnPhaseRoll: 'Turn {turn} — {phase}',
    dummyUnmasked: 'dummy unmasked by reconnaissance',
    raid: 'Japanese air raid on {unit} in {hex}: {raiders}',
    dummyReinforce: 'Night: {n} Japanese TF undetected joins the map in {hexes} | Night: {n} Japanese TF undetected join the map in {hexes}',
    searchRefill: 'Night: {total} search chit goes back in the cup ({detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost) | Night: {total} search chits go back in the cup ({detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost)',
    searchHidden: '{side} reconnaissance from {from} in {hex} ({unit}): {sighting}',
    reconCarrier: 'a carrier',
    search: '{side} reconnaissance from {from} in {hex} ({unit}): {result} → {sighting} (cup: {detected} Detected!, {misdirect} Misdirect, {contactLost} Contact Lost)',
    rollOrder: '{phase} — order by die roll: {rolls} → {side} plays first',
    reroll: ', tie, reroll: ',
    phase: 'Phase: {name}',
    dice: 'Die roll: {value}',
    moveCancelled: '{unit}: move cancelled, back to {hex}',
    moves: '{unit} moves to {hex}',
    moved: '{unit} moved from {from} to {to}',
    enters: '{unit} enters play at {hex}',
    congestion: 'entry hex already used (entry #{rank} this turn): cost ×{rank} = {cost} MP instead of {base}',
    returned: '{unit} put back into the reinforcements',
    eliminated: '{unit} eliminated',
    timeUp: 'Time is up — {side} loses the game',
    conceded: '{side} concede the game',
  },

  phaseButton: {
    newPhase: 'Next phase',
    newTurn: 'New turn',
    otherPlayer: 'Other player',
  },



  toolbar: {
    gameOverTag: 'Game over — {side} loses on time',
    concede: 'Concede the game',
    concedeTitle: 'Give up the game: your opponent wins it',
    gameSummary: 'Game summary',
    gameSummaryTitle: 'See the winner of the game again',
    gridDisabled: 'Grid disabled in free play',
    grid: 'grid',
    coordinates: 'coordinates',
    calibration: 'calibration',
    debug: 'debug',
    hideCounters: 'Hide counters',
    showCounters: 'Show counters',
    undo: '↩ Undo',
    hideDie: 'Hide die',
    showDie: 'Show die',
    bugReportTitle: 'Open a bug report on GitHub, with an export of the game',
    bugReport: 'Report a bug',
    replayStep: 'Replay: step one line forward',
    replayEnd: 'Fast forward: go to the end',
    help: 'Help',
    helpTitle: 'Interface guide',
  },


  guide: {
    stepOf: 'Step {step} / {total}',
    previous: 'Previous',
    finish: 'Done',
    intro: 'Welcome! This guide walks you through the game screen in a few steps. You are playing in {mode} mode. You can reopen it at any time with the "?" button in the toolbar.',
    toolbar: {
      title: 'The top bar',
      lead: 'At the top of the screen, everything about where the game stands.',
      turn: { term: 'Turn track', text: 'The current turn and the side to play. Only the active side can move its units.' },
      phases: { term: 'Phases and "next" button', text: 'Below the track, the phases of the turn. The button moves to the next phase, then to the next side: it is refused while units are still stacked.' },
      next: { term: '"Next" button', text: 'Moves the turn track one step forward once a side has finished playing.' },
      timer: { term: 'Timer', text: 'Shown only when the game uses Limited or Blitz timing.' },
    },
    map: {
      title: 'The map',
      lead: 'In the middle, the map and its counters.',
      zoom: { term: 'Zoom', text: 'Mouse wheel, or the − / + buttons at the top right.' },
      pan: { term: 'Scroll', text: 'Hold the right mouse button and drag to scroll the map.' },
      stack: { term: 'Stacks', text: 'Hover a stacked counter to see every counter in the hex at full size.' },
    },
    units: {
      title: 'Playing your units',
      lead: 'How to move counters and act on them.',
      select: { term: 'Moving a unit', text: 'Click one of your units to select it, then click the destination hex.' },
      highlight: { term: 'Highlighted hexes', text: 'Hexes reachable with the remaining movement points are highlighted. The same goes for the entry hexes of a selected reinforcement.' },
      drag: { term: 'Moving a counter', text: 'Drag and drop a counter on the map, or from the reinforcements panel. No rule is checked: applying them is up to you.' },
      menu: { term: 'Counter menu', text: 'Right-click a counter to put it back in the reinforcements, eliminate it, or cancel its move.' },
      undo: { term: 'Undo', text: 'Cancels the last move during the Movement phase.' },
    },
    panel: {
      title: 'The side panel',
      lead: 'On the right edge, tabs open on click.',
      reinforcements: { term: 'Reinforcements', text: 'One tab per side, with the incoming units and their entry turn.' },
      eliminated: { term: 'Eliminated units', text: 'Counters removed from the map.' },
      journal: { term: 'Journal', text: 'Every action of the game, saved automatically. You can save, load or replay a game from it.' },
    },
    tools: {
      title: 'Tools',
      lead: 'On the right of the top bar, a few handy buttons.',
      die: { term: 'Die', text: 'A die to roll yourself.' },
      display: { term: 'Display', text: 'Hide the counters to see the terrain, show the hex coordinates.' },
      bug: { term: 'Report a bug', text: 'Opens a GitHub report pre-filled with an export of the game.' },
      help: { term: 'Help "?"', text: 'Reopens this guide.' },
    },
  },
}
