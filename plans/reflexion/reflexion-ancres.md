# Réflexion — Ancres temporelles : les sortir du fichier d'entretien

> Document de **réflexion**, pas un plan d'exécution — sur le modèle de
> [reflexion-chunking.md](reflexion-chunking.md). Il cadre une question ouverte
> sans proposer de chantier : les ancres `{pos, t}` sont aujourd'hui la troisième
> source de poids d'un fichier d'entretien, et leur densité est un choix fait
> ailleurs, par l'outil de transcription.
>
> **Statut : idée conservée, aucun besoin confirmé, aucune écriture prévue.** Le
> document garde la matière (mesures, options, points durs) pour pouvoir décider
> vite le jour où le besoin se confirme. Le relevé du plafond de lecture GitLab
> qui a motivé cette réflexion est dans
> [plan-gitlab-suite.md § 15.5](../encours/plan-gitlab-suite.md).

## 1. Le fait brut, mesuré

Trois mesures prises sur des fichiers réels, et non estimées :

| Poste dans un entretien | Coût sur disque | Source |
|---|---|---|
| texte | 6 octets par mot | `ent-l9r31p9z.json` : 999 mots |
| structure des tours de parole | ~350 octets par tour | 39 tours dans le même fichier |
| **ancres temporelles** | **51 octets par ancre** | 185 ancres, 9,2 Kio |
| codages | ~190 octets chacun | 19 codages, 3,5 Kio |
| indentation du JSON | facteur **1,68** | `corpusStore.ts:375`, `JSON.stringify(obj, null, 2)` |

Les 27,4 Kio de ce fichier — quatre minutes d'entretien — se répartissent en 21 %
de texte, **27 % d'ancres**, 13 % de codages et le reste en structure et
indentation. Avec les sous-titres du banc (`CorpusTest/srt` : 17 à 27 cues par
minute, soit une ancre toutes les trois secondes), la projection sur un entretien de
2 h 30 donne **567 Kio**, dont environ 155 Kio d'ancres.

Conséquence immédiate, déjà écrite dans le plan GitLab : la limite de lecture de
256 Kio de réponse, soit 192 Kio de fichier, est franchie **vers une heure
d'entretien**, pas vers trente pages. Ce n'est pas un problème propre à GitLab —
c'est une propriété du format.

## 2. Le déclencheur n'est pas la taille, c'est la croissance

La taille seule ne justifie rien : un entretien d'une heure tient dans un fichier
ordinaire. Ce qui pose question est le **coefficient** entre la finesse visée et la
taille du fichier. Sur 2 h 30, à 30 000 mots et 414 Kio de base :

| Densité d'ancres | Nombre d'ancres | Fichier | Réponse base64 | Plafond de 2 Mio |
|---|---|---|---|---|
| 1 / 3 s (actuel) | 3 000 | 567 Kio | 756 Kio | tient |
| 1 / 1 s | 9 000 | 873 Kio | 1,1 Mio | tient |
| 1 / 0,5 s | 18 000 | 1,3 Mio | 1,8 Mio | limite |
| 1 par mot | 30 000 | 1,9 Mio | 2,6 Mio | dépassé |

Le point à retenir n'est pas le seuil mais sa pente : **multiplier la densité par
quatre multiplie le fichier par 2,6**, alors que le texte ne change pas. Tout ce qui
est dimensionné pour l'audio — le plafond de lecture, le plan de commit, le volume
du miroir — devrait alors être redimensionné à chaque amélioration de la synchro.

Le plafond de lecture n'est d'ailleurs pas le plus contraignant des deux. La
publication est plafonnée par la **taille du plan de commit**, 1 500 000 octets
(`gitlab/publication.ts:55`) : un entretien de 1,9 Mio dépasse cette borne et ne peut
donc pas être publié du tout, même lu. Relever la seule limite de lecture laisserait
un corpus qu'on peut ouvrir et qu'on ne peut plus enregistrer. Les deux plafonds
doivent être lus ensemble, et c'est le second qui fixe la taille maximale réelle d'un
entretien collaboratif.

Il faut noter que **le runtime est déjà prêt** : `shared/entretien/audio.ts` acte des
invariants de performance « pour ~30 000 ancres word-level », avec des lookups en
dichotomie et une projection en mémoire qui n'est jamais persistée. Ce qui ne suit
pas, c'est la persistance. L'écart n'est donc pas entre l'intention et l'existant,
il est entre l'intention et le **format**.

## 3. Ce qui casse vraiment, et ce qui ne casse pas

Une intuition naturelle mérite d'être vérifiée avant d'écrire quoi que ce soit. Le
tableau est établi en suivant les trois chemins d'un entretien réel : le local, le
miroir WebDAV et la publication GitLab.

| Effet d'ancres plus fines | Verdict | Pourquoi |
|---|---|---|
| **Plafond de publication** | **bloque** | le plan de commit est borné à 1 500 000 octets : au-delà, l'entretien ne peut plus être enregistré du tout |
| **Volume de la publication périodique** | **casse, et c'est le vrai coût distant** | la session renvoie le **fichier entier** à chaque cycle de deux minutes, ancres comprises. Un entretien à 1,9 Mio représente ~57 Mio par heure et par poste en édition, sur WebDAV comme sur GitLab, où c'est en plus un commit par cycle |
| **Sémantique des exports** | **casse, et c'est le point sérieux** | `shared/export/projectionEntretien.ts:9` fait des ancres la « source de vérité unique du découpage en segments » : un segment `.lblseg` par intervalle d'ancres. Une ancre par mot produirait des dizaines de milliers de segments |
| Copie de divergence et reprise manuelle | **casse** | la copie emporte le fichier entier ; à 2 Mio, elle devient pénible à ouvrir et à comparer |
| Défilement automatique du lecteur | **gêne, et se corrige en cinq lignes** | `useSynchroAudio.ts` déclenche un `scrollIntoView` à chaque changement de plage. Toutes les trois secondes, c'est un défilement ; à la mot, la plage change deux à trois fois par seconde et le suivi devient un tremblement. Il suffit de ne défiler que si la plage sort du viewport |
| Agrégations du corpus (matrice, décomptes, inventaire des notes) | **pèse** | `corpusStore.chargerEntretiens()` parse **tous** les entretiens à chaque calcul. Un corpus de trente entretiens passe de 8 Mio de JSON à 57 Mio, donc à quelques centaines de mégaoctets d'objets. Le remède est dans `corpusModel` — un comptage en flux — et n'appartient pas au sujet des ancres |
| Surface de conflit entre collègues | **ne change pas** | un conflit vient d'une publication, pas de sa taille : le nombre d'occasions est identique. C'est le volume qui augmente, pas la fréquence des refus |
| Performance à la lecture | **ne change pas** | projection mémoïsée et recherche en dichotomie, déjà actées pour 30 000 ancres ; le tick ne fait rien si la plage ne bouge pas |
| Remap des positions à l'édition | **ne change pas** | le mécanisme existe déjà et vaut pour les annotations comme pour les ancres |

Deux conclusions. D'abord, ce qui casse le plus n'est ni le conflit ni la
performance : c'est l'**explosion du nombre de segments à l'export**, qui est un
changement de sémantique, et le **volume de publication périodique**, qui est le
seul poste que la densité multiplie en continu. Ensuite, tout ce qui est pensé comme
un problème de concurrence n'en est pas un : le coût est proportionnel au volume
transféré, pas au nombre de publications.

## 4. La découverte qui commande : un tableau, deux rôles

Le tableau `ancres` sert aujourd'hui deux besoins qui n'en font pas un :

| Rôle | Densité souhaitée | Où il agit |
|---|---|---|
| **la mesure** — connaître le temps d'un point du texte | la plus fine possible, pour un suivi du lecteur précis | `useSynchroAudio.ts`, surlignage et position de lecture |
| **le découpage** — décider des bornes d'un segment d'export | sémantique : un segment par idée, pas par seconde | `projectionEntretien.ts`, segments `.lblseg` et projections d'export |

Les deux densités souhaitées sont **différentes**, et c'est exactement pour ça que la
question « comment stocker les ancres » est mal posée. Un entretien codé veut peu de
bornes de segment ; un lecteur veut beaucoup de points de mesure. Les confondre
dans un tableau unique oblige à choisir une densité qui sert les deux médiocrement.

**C'est là qu'est le vrai chantier éventuel** : deux jeux de données distincts,
dont un seul est partagé. Le reste du document est de la logistique.

## 5. La question de fond : donnée du corpus ou index local ?

Avant de choisir un stockage, il faut trancher ce que les ancres **sont** :

- **une donnée du corpus** — partagée, versionnée, garantie par la garde
  `last_commit_id` du fichier d'entretien ;
- **un index local**, dérivé de l'audio et du SRT de chaque poste, comme le sont
  aujourd'hui l'association audio locale (`audio-locaux.json`) et la retombée des
  PNG.

Le point dur est connu et documenté : `Ancre.pos` est une **position ProseMirror**,
remappée à chaque transaction. Le format la sérialise **atomiquement avec le
document**, et le commentaire est explicite : positions valides « par construction à
la relecture (pas de réindexation) » (`shared/entretien/annotation.ts`). C'est
aujourd'hui une garantie réelle.

La dissocier en deux fichiers supprime cette garantie et en invente une autre : deux
fichiers, deux gardes `last_commit_id`, et une cohérence à reconstruire — l'ancre
`pos` d'un fichier devenu stale ne désigne plus rien, silencieusement. **C'est
l'argument le plus fort contre l'option la plus évidente** (un fichier d'ancres
dédié dans le dépôt), et il est antérieur à toute question de taille.

Second point, plusais peut-être celui qui tranche. **Le corpus ne contient pas
l'audio** : le dossier `audio/` est un reliquat des formats v2, les corpus v3 n'en
ont pas, et `meta.audioRef` est un chemin absolu vers un fichier du poste. Les
médias partagés ne sont pas implémentés sur GitLab. Les ancres sont donc la seule
trace persistée du minutage d'un son que le dépôt ne détient pas — ce qui est peu
cohérent (partager le minutage sans partager le son) et fragile (à la relecture,
personne ne sait d'où viennent ces temps).

Ce constat a une conséquence directe sur le besoin de finesse. **Un couplage
son/texte serré sert celui qui écoute**, sur le poste qui possède l'audio et son SRT :
c'est le linguiste, devant son lecteur, pas un collaborateur qui consulte une
transcription. Les ancres fines ne sont donc pas, par nature, une donnée à partager :
elles sont un index de travail local. C'est ce qui fait de l'option B une
description du besoin plutôt qu'un compromis subi, et c'est pourquoi l'option E —
mesurer finement en local, découper explicitement dans le corpus — est celle qui
sert les deux publics.

## 6. Options

| Option | Préserve | Casse | Coût | Réversible |
|---|---|---|---|---|
| **A. Fichier d'ancres dédié dans le dépôt** | le partage, la version | **la cohérence des positions** (§ 5) | migration, seconde garde, seconde lecture à l'ouverture, deux écritures par édition | oui, mais il faut migrer les corpus existants |
| **B. Index local** (comme `audio-locaux.json`) | la simplicité du format, la croissance | le partage : chacun réimporte son SRT | faible, mais un collaborateur sans SRT perd la synchro | oui, totalement |
| **C. Encodage compact** (positions en delta, tableau plat) | tout : même fichier, même partage | rien — sauf la lisibilité du fichier et du débogage | un jour de format, une migration, une lecture de plus | partiellement |
| **D. Recalcul à l'ouverture** à partir du SRT | la fraîcheur par construction | la disponibilité hors ligne, le coût CPU d'un recalcul par ouverture | dépend de la disponibilité d'un alignement forcé | oui |
| **E. Séparer les rôles** (§ 4) : mesure locale dense, découpage partagé explicite | les deux usages avec la bonne densité | rien d'existant, mais introduit un concept neuf | le plus gros des cinq, et le seul qui résolve la vraie question | oui |

Deux remarques d’ordre. **C** ne résout pas la croissance, il la retarde d'un facteur
trois ou quatre : utile comme mesure d'attente, insuffisant comme solution, et sans
effet sur la borne de publication, qui reste à 1 500 000 octets de plan. **B** et
**E** ne s'excluent pas — un index local dense plus un découpage partagé et clairsemé
est la configuration que la réflexion pointe depuis le § 4, et celle que le § 5
recommande.

## 7. Ce qu'il faudrait mesurer avant de choisir

Rien de tout cela ne mérite d'être écrit avant d'avoir répondu à quatre questions,
dont trois sont des relevés de code et une une mesure utilisateur :

1. **Quelles fonctionnalités lisent réellement les ancres, et à quelle précision ?**
   Un relevé des appels à `projeterAncres`, `tempsAuPoint` et `plageCourante` — dont
   `useSynchroAudio.ts` et les projections d'export — pour distinguer ce qui réclame
   la finesse et ce qui aligne le segment.
2. **Qu'apporte réellement une ancre à 0,5 s ?** Question utilisateur, pas technique :
   la lecture d'un entretien est-elle visiblement moins précise à une ancre toutes les
   trois secondes ? Si la réponse est non, la croissance ne sert personne.
3. **Combien de réimports de SRT par semaine ?** Une densité fine ne coûte cher que
   si les ancres changent souvent ; un réimport par entretien et par mois est un
   non-événement.
4. **Quel est le coût d'une migration de format ?** `formatVersion` permet de
  détecter l'ancien schéma, mais il faut savoir combien de corpus existants sont
   concernés et si un `.sonal` importé aujourd'hui doit rester lisible après la
   migration.

## 8. Le pansement, indépendant de la décision

Une action de dix minutes vaut dans **tous** les scénarios ci-dessus, y compris si
la décision est de ne rien changer : **filtrer les ancres à l'import** pour ne pas
descendre sous une ancre toutes les cinq ou six secondes. L'import
(`formatSonal/importSonal.ts:320`) pousse aujourd'hui deux ancres par sous-titre,
sans aucun filtre. Comme le lecteur interpole linéairement entre ancres, la densité
est un confort et non une correction : diviser le nombre d'ancres par deux retire
environ un quart du fichier d'un entretien, sans changer le format, sans changer la
lecture, et sans préempter la décision de fond.

C'est aussi, au passage, un retour sur la cause : la granularité actuelle est
héritée de l'outil de reconnaissance vocale, pas d'un besoin de Sonal.

## 9. Condition de réouverture

Ce document n'est rouvert que si l'un de ces trois faits se produit :

- **le besoin de finesse** : la lecture de l'audio ou la localisation dans l'audio
  devient un usage premier, et une ancre toutes les trois secondes se révèle
  insuffisante ;
- **la taille** : les corpus du pilote dépassent régulièrement une heure d'entretien
  sur GitLab, et le relevé du plafond de lecture ne suffit plus ;
- **l'export** : le découpage en segments des `.lblseg` ne convient plus à un usage
  réel, ce qui rendrait le tableau `ancres` trop dense pour la seule mesure.

Tant qu'aucun de ces trois n'est établi, le bon rapport coût/bénéfice est le
pansement du § 8, et le reste attend.
