# Règles de mouvement

État des règles de mouvement en place au 14/10/2026, de la plus générale à la plus spécifique, suivi des contradictions relevées dans le modèle. Mis à jour après le retrait du code propre à Arnhem (combat, ponts, véhicules, terrains, aéroportés, points de victoire).

Sources lues : [useAssisted.js](../src/lib/useAssisted.js), [edges.js](../src/lib/edges.js), [passages.js](../src/lib/passages.js), [autoMove.js](../src/lib/autoMove.js), [rules.js](../src/lib/rules.js), [coral-sea.json](../public/modules/coral-sea/coral-sea.json), [useCoralSea.js](../src/lib/useCoralSea.js), [coralSeaTrees.js](../src/lib/ai/coralSeaTrees.js) (arbre de décision des mouvements particuliers), `runAutoMoves` dans [HexMap.vue](../src/components/HexMap.vue).

## 1. Règles du moteur, valables pour tous les modules

- **Mode Libre** : aucune règle, n'importe quel pion se glisse n'importe où. Tout ce qui suit ne vaut qu'en **mode Assisté**.
- **Qui bouge** : seul le camp actif déplace ses pions, et seulement pendant la phase de type « movement ». Dans les autres phases, on ne peut pas sélectionner de pion pour le déplacer.
- **Comment** : on clique le pion, puis un hex **adjacent**. On avance d'un hex par clic.
- **Potentiel de mouvement (MP)** : il est pris dans cet ordre de priorité :
  1. la règle particulière du module ;
  2. la piste de tour (`turnInfo.movement`) ;
  3. le `mov` du pion.

  Un pion sans aucune de ces valeurs a un mouvement illimité.
- **Remise à zéro des MP** : les MP ne se reportent jamais. Ils repartent à zéro à chaque changement de pas de la piste, donc à chaque créneau.
- **Coût d'entrée dans un hex** : toujours **1 MP**. Les modules ne déclarent plus de types de terrain ni d'arêtes à coût.
- **Arêtes** :
  - une arête `impassable` est fermée à tout le monde ;
  - une arête `blocksZoc` arrête la ZOC.
- **Hex coupés par une île** : on ne ressort que par un côté de la même couleur que le côté d'entrée. Un pion posé dans l'hex (sans côté d'entrée connu) peut en sortir par n'importe quel côté.
- **ZOC (zones de contrôle)** :
  - les 6 hex autour d'une unité ennemie sont sous sa ZOC, sauf à travers une arête `blocksZoc` ;
  - une unité qui **commence** son mouvement en ZOC ennemie ne bouge pas ;
  - une unité qui **entre** en ZOC ennemie s'y arrête.
- **Empilement** :
  - une unité ne termine jamais son mouvement au-delà de `stackingLimit` unités amies dans un hex — la limite de son camp, que le module peut déclarer camp par camp ;
  - la règle ne vise que les unités qui ont bougé, ou sont entrées en jeu, pendant la phase en cours : une pile formée avant (ex. à la mise en place) reste légale tant qu'aucune de ses unités ne bouge ;
  - on peut traverser un hex ami, à condition de pouvoir en repartir ;
  - exception : un ami qui n'a pas encore bougé (et qui peut encore partir) ne compte pas ;
  - on ne peut pas désélectionner une unité en surplus d'empilement ;
  - un contrôle en fin de phase bloque le passage à la phase suivante s'il reste un empilement.
- **Fin du mouvement d'une unité** : une unité qui a bougé puis qui est désélectionnée est verrouillée pour le reste du tour. Deux annulations restent possibles : « Retour arrière » (un pas) et « Annuler le mouvement » (retour au point de départ).
- **Renforts** :
  - ils entrent sur un hex de leur `setup` qui n'est ni occupé par l'ennemi, ni occupé par un ami figé en ZOC, ni un hex ami dont ils ne pourraient pas repartir ;
  - ils paient un coût d'entrée de 1 MP. Avec `entryCongestion: multiply`, la N-ième entrée par un même hex dans le même tour coûte N MP.
- **Sortie de carte** : impossible.

## 2. Paramètres de la mer de Corail (fichier JSON)

- **Terrain** : aucun type de terrain, chaque hex coûte 1 MP.
- **Barrières côtières** (`seaBarriers`, 126 arêtes) : elles sont infranchissables et coupent la ZOC.
- **Passages d'île** (`seaPassages`, 13 hex) : ils appliquent la règle des côtés colorés.
- **Empilement** : `stackingLimit: "none"` — aucune limite, pour aucun camp : les task forces japonaises, que le moteur déplace, ne se bloquent plus entre elles. La ZOC n'est pas déclarée, donc **ses valeurs par défaut s'appliquent : les deux règles sont actives**.
- **Potentiel** : 2 hex de nuit, 1 hex de jour, pour tous les camps.
- **Phases entremêlées** : on joue le Mouvement naval du camp qui a l'initiative, puis celui de l'autre camp. C'est la seule phase où l'on bouge.
- **Mise en place US** (tour 0) : les task forces se posent n'importe où sur la carte (`setup "*"`), sans aucun déplacement, et peuvent s'y empiler. Il en faut 12, leurres compris : avec moins, une modale demande si l'on commence quand même ; avec plus, une modale refuse de commencer.
- **Déploiement japonais** : seuls les 12 leurres sont posés au départ, tirés dans la bande 0601-2701.

## 3. Règles particulières de la mer de Corail ([useCoralSea.js](../src/lib/useCoralSea.js))

- **Formation japonaise** (`formations.ijn` du scénario) :
  - au coup d'envoi, l'appli tire seule, à chances égales, l'option 1 (6 task forces), l'option 2 (9 task forces) ou une formation aléatoire (7 ou 8 task forces) ;
  - chaque task force est portée en secret par un des 12 leurres ; les autres sont de vrais leurres ;
  - le comportement de chaque task force dépend de ses navires, lus dans le catalogue `fleet-ijn.json`.
- **Allure transport (AK)** :
  - elle vaut 1 hex si la piste coche « Mouvement AK », 0 sinon ;
  - concrètement : 1 hex de nuit (au lieu de 2), et 0 aux tours de jour pairs ;
  - elle concerne les task forces qui ont des AK, les leurres tirés « transport » à pile ou face, et les suiveurs d'une tête de groupe qui est un transport.
- **Le moteur joue les Japonais** :
  - il agit une seule fois par créneau, au début du Mouvement naval japonais : d'abord les meneurs, puis les suiveurs ;
  - le chemin est le plus court qui respecte les barrières et les passages ;
  - il n'entre jamais dans un hex ennemi et ne s'arrête jamais sur un hex ami ;
  - il est limité par les MP, et s'arrête dès que les règles refusent un pas (ZOC, par exemple).
- **Hex-objectifs** :
  - chaque meneur en tire un parmi `ijnArrivalHexes`, différent des autres tant que c'est possible ;
  - les task forces de porte-avions (TF1, TF2 et TF3) reçoivent des objectifs groupés, à 5 hex au plus d'un même centre.
- **Suiveurs** :
  - ils restent adjacents à leur meneur ;
  - si le meneur disparaît, le suiveur reprend son objectif et devient meneur à son tour.
- **Mouvements particuliers** (ils remplacent la marche vers l'objectif) :
  - avec des AK : elle reste à plus de 6 hex de toute task force alliée repérée ;
  - avec un CV ou un CVL : elle fonce jusqu'à 5 hex du « Sighted Carrier » le plus proche. La première arrivée attend les autres à 6 hex, pendant 2 tours au maximum ;
  - avec un CV ou un CVL, repérée, sans porte-avions allié repéré : elle reste à plus de 6 hex de toute unité alliée ;
  - rien que des DD : elle va jusqu'à la task force alliée non repérée la plus proche ;
  - les autres : elles vont jusqu'à la task force alliée repérée la plus proche.
- **Renfort de leurres** (tours 11 et 23) :
  - côté japonais, chaque leurre est posé sur l'hex de l'unité qu'il suivra, puis il s'en écarte ;
  - côté US, le joueur pose ses leurres sur ses propres task forces avant tout mouvement, jusqu'à 12 task forces sur la carte ; ils peuvent y rester empilés.

## 4. Contradictions internes

1. **Résolu — empilement à la mise en place US**. Le joueur pouvait empiler ses task forces à la mise en place, puis se retrouvait bloqué à la fin de son premier Mouvement. La règle d'empilement ne vise plus que les unités qui ont agi pendant la phase : une pile de mise en place reste légale tant qu'elle ne bouge pas.
   - Effet de bord : les leurres japonais d'un renfort, posés **sur** leur meneur, ne bloquent plus le joueur s'ils n'ont aucun hex libre où s'écarter. Ils restent alors empilés.

2. **La ZOC terrestre s'applique entre navires**. Les deux règles par défaut sont actives. Une task force US adjacente à un leurre japonais est figée, et le leurre aussi. Ce blocage mutuel peut durer jusqu'à ce qu'un « Detected! » retire le leurre. Le fait que les barrières soient déclarées `blocksZoc` suggère que c'est voulu, mais le blocage mutuel ressemble à un effet de bord. Par ailleurs, seule la ZOC empêche un joueur US d'entrer dans un hex ennemi : [canEnterHex](../src/lib/useAssisted.js#L789) ne teste pas si l'hex est occupé par l'ennemi. Si on désactive la ZOC, cette entrée deviendra possible.

3. **Résolu — l'en-tête de useCoralSea ne correspondait plus au code**. Il décrit maintenant les formations : autant de leurres porteurs que de task forces dans la formation tirée, les autres servant d'escortes (porte-avions d'abord), puis de faux groupe s'il en reste.

4. **Une même task force peut exister deux fois sur la carte**. Les vrais pions japonais TF1…TF13 (bande 0501-2701) restent posables depuis le panneau, alors que des leurres les portent déjà en secret. Le pion et son leurre recevraient chacun un objectif et un mouvement particulier. La reconnaissance dédoublonne déjà ce cas, mais pas le mouvement.

5. **Résolu — TF10 était un transport sans comportement de fuite**. Le comportement dépend désormais des navires : toute task force qui a des AK reste à l'écart des Alliés repérés.

Les points 2 et 4 dépendent de ce que prévoit la règle du jeu.

L'ancienne contradiction sur `hexForbidden` (règle documentée mais jamais implémentée) a disparu avec le retrait du code d'Arnhem.
