# Plan — Opérations sur les thématiques au niveau du corpus

> **Objet.** Remplacer, dans l'onglet **Thèmes** du corpus, la liste des
> entretiens située à droite par un atelier permettant de transférer, fusionner
> et diviser des thématiques.
>
> **Déploiement retenu.** Le parcours complet est livré d'abord sur les corpus
> locaux. GitLab traite les entretiens un par un, puis supprime éventuellement
> la source par une décision finale à gardes légères, après qualification.
> WebDAV reçoit d'abord les réaffectations sans suppression de la source, avec
> un résultat partiel explicite et relançable.
>
> **Garantie retenue.** Une opération ne laisse jamais volontairement de
> référence pendante. Une exécution incomplète ou dont le résultat n'est pas
> connu est nommée et peut être reprise ou réconciliée. L'atomicité stricte
> n'est annoncée que lorsqu'elle est réellement fournie par le stockage.

---

## 0. Prérequis GitLab désormais réalisés

`plan-gitlab-gardes-legeres.md` est réalisé. Le présent plan s'appuie donc sur :

- l'action métier `garde`, compilée en `chmod` sans contenu et sans changement
  du mode exécutable observé ;
- la protection atomique par `last_commit_id`, qualifiée sur GitLab CE 18.11 ;
- la limite commune de **250 actions**, mutations de bail comprises, et de
  **2 Mio pour le corps HTTP complet** ;
- le journal version 4, la réconciliation des gardes au SHA du commit et leur
  revalidation par HEAD après un refus 400/409 ;
- la confirmation et l'attente indéterminée des opérations globales GitLab dans
  `src/renderer/operationGlobaleCorpus.ts`.

Ces acquis protègent les entretiens **lus mais inchangés** sans republier leurs
transcriptions. Ils ne rendent pas légères les réaffectations : chaque entretien
modifié reste une action `update` avec son contenu complet et son propre bail.
La lecture et la validation des contenus restent nécessaires dans les deux cas.

Les lots de valeurs et de pseudonymisation GitLab traitent déjà les entretiens
un par un dans `src/main/gitlab/contexte.ts`. Le présent plan reprend ce modèle
pour les thèmes : **atomicité par entretien, pas atomicité globale du lot**.
Les succès restent acquis et les échecs sont nommés et relançables.

Le maximum existant de 248 sources concerne un commit composé de `corpus.json`,
248 gardes et un bail corpus. Il borne la **suppression finale de la source**,
pas le nombre d'entretiens réaffectés avec source conservée. Le publieur et le
journal restent limités à un ou deux droits : aucune extension multi-droits
n'est nécessaire ici, chaque phase n'utilisant qu'un seul bail court.
Un suivi durable du lot reste à ajouter au-dessus des journaux de publication.

---

## 1. Modèle existant et frontières

| Besoin | Point d'ancrage actuel |
|---|---|
| Arbre, couleurs et compteurs d'usages | `src/renderer/components/corpus/Corpus.vue` et `useThemesCorpus.ts` |
| Création et édition du codebook | `EditionThemes.vue` et `src/shared/corpus/categories.ts` |
| Comptage des codages | `src/shared/corpus/requetes.ts` |
| Annotation de codage | `src/shared/entretien/annotation.ts` : `type: 'codage'`, `code` = id de catégorie |
| Transaction locale multi-fichiers reprenable | `src/main/transactionsFichiers.ts`, opération `remplacement` |
| Transactions composites WebDAV | `src/main/distant/transactions.ts` |
| Transactions gardées GitLab | `src/main/gitlab/transactions.ts` et `publication.ts` |
| Lots GitLab entretien par entretien | `src/main/gitlab/contexte.ts` : valeurs et pseudonymisation |
| Classement des gestes | `src/main/gitlab/politiqueGestes.ts` |
| Écran de lot avec état local | `PseudonymisationCorpus.vue` |

### 1.1 Références vers une thématique

Une catégorie du codebook est référencée par deux mécanismes distincts :

- les annotations `codage`, par leur champ `code` ;
- les sous-thèmes, par leur champ `parent` dans le codebook.

`RegleAnon.categorie` n'est **pas** une référence au codebook. C'est une
étiquette libre de pseudonymisation, par exemple `PER`, `LOC` ou `ORG`. Les
opérations de ce plan ne la lisent et ne la modifient jamais.

Les recueils, les CAS, les notes et le tableau de bord ne référencent pas les
identifiants du codebook.

### 1.2 Seuls les codages sont réaffectés

Les trois types d'annotation partagent le même tableau, mais seule l'annotation
`codage` participe aux opérations :

| Type | Traitement |
|---|---|
| `codage` | compté, réaffecté ou dédupliqué si `code === source` |
| `anon` | jamais modifié, même sur une plage identique |
| `commentaire` | jamais modifié, même sur une plage identique |

Toute recherche passe donc par :

```ts
a.type === 'codage' && a.code === source
```

Une annotation orpheline (`from >= to`) reste un codage à répartir. Elle est
comptée et affichée sans extrait.

---

## 2. Sémantique des trois gestes

### 2.1 Transférer

- Tous les codages de la source présents dans l'instantané validé deviennent des
  codages de la cible.
- La conservation de la source est proposée par une case cochée par défaut.
- Si cette case est décochée, la source est retirée après les réaffectations et
  ses enfants directs sont promus vers son ancien parent.
- La cible peut être une catégorie existante ou une nouvelle catégorie.
- Quand la source est conservée, sa hiérarchie ne change pas.

La fusion reste distincte : elle déplace les enfants directs de la source vers
la cible au lieu de les promouvoir vers l'ancien parent.

### 2.2 Fusionner

- Tous les codages de la source deviennent des codages de la cible.
- La source disparaît du codebook.
- Les enfants directs de la source deviennent des enfants de la cible.
- Une cible située dans le sous-arbre de la source est refusée afin d'éviter un
  cycle.
- La cible conserve sa propre position dans l'arbre.

Le récapitulatif annonce le nombre de codages réaffectés, de doublons supprimés
et de sous-thèmes déplacés. Sur GitLab, la source et sa hiérarchie restent
présentes pendant les réaffectations ; sa suppression et le déplacement de ses
enfants ne sont appliqués qu'à la finalisation. Une fusion partielle conserve
la source et les réaffectations déjà réussies.

### 2.3 Diviser

- Deux à quatre nouvelles catégories sont préparées.
- Chaque codage de la source peut être envoyé vers une seule de ces catégories.
- Les codages non répartis restent sur la source.
- La source ne peut être supprimée que lorsque tous ses codages, y compris les
  orphelins, ont une destination.

Hiérarchie des nouvelles catégories :

- source conservée : la source est leur parent par défaut ;
- source supprimée : l'ancien parent de la source est leur parent par défaut.

Le parent final est calculé directement. Les catégories ne sont pas créées sous
une source destinée à être supprimée pour être ensuite promues. Sur GitLab, si
la finalisation échoue, la source reste présente et les nouvelles catégories
conservent ces parents déjà valides.

### 2.4 Déduplication

Un doublon est un codage cible déjà présent sur la plage exacte :

```ts
a.type === 'codage'
  && a.code === cible
  && a.from === source.from
  && a.to === source.to
```

Dans ce cas :

- le codage cible existant est conservé ;
- le codage source est retiré ;
- les annotations `anon` et `commentaire` restent intactes ;
- le résultat compte séparément les codages réaffectés et les doublons retirés.

L'opération ne nettoie pas les anciens doublons sans rapport avec la source.

---

## 3. Contrats métier et IPC

Les types purs vivent dans `src/shared/corpus/themes.ts`. Le module n'importe ni
I/O ni Electron.

### 3.1 Cibles et commandes

```ts
export interface NouvelleDestinationTheme {
  type: 'nouvelle'
  token: string
  nom: string
  parent: string | null
  couleur?: string
  taille?: number
}

export type DestinationTheme =
  | { type: 'existante'; id: string }
  | NouvelleDestinationTheme

export interface ReferenceCodage {
  entretienId: string
  annotationId: string
}

export type DemandeOperationTheme =
  | {
      type: 'transfert'
      source: string
      cible: DestinationTheme
      conserverSource: boolean
    }
  | {
      type: 'fusion'
      source: string
      cible: string
    }
  | {
      type: 'division'
      source: string
      cibles: NouvelleDestinationTheme[]
      choix: Array<{
        codage: ReferenceCodage
        destination: string
      }>
      effacerSource: boolean
    }
```

`destination` désigne soit l'id d'une catégorie existante, soit le `token` d'une
nouvelle catégorie. Les ids définitifs sont générés dans le main pendant la
préparation. Sur GitLab, leur correspondance avec les tokens est journalisée
avant toute création distante et réutilisée lors des reprises.

`annotationId` n'est jamais utilisé seul comme identité corpus. Les ids sont
opaques, mais leur génération actuelle ne garantit pas leur unicité entre deux
entretiens.

### 3.2 Fonctions pures

Le module expose au minimum :

- `inventorierCodagesTheme(entretien, themeId)` ;
- `appliquerReaffectationsTheme(entretien, planEntretien)` ;
- `preparerDefinitionsOperationTheme(corpus, demande, genId)` ;
- `verifierDemandeOperationTheme(corpus, demande)` ;
- `deplacerEnfantsApresFusion(corpus, source, cible)`.

Les validations refusent notamment :

- source absente ;
- cible absente ou égale à la source ;
- tokens dupliqués ;
- division hors de la borne 2 à 4 ;
- choix vers une destination inconnue ;
- même codage présent plusieurs fois dans les choix ;
- cible de fusion descendante de la source ;
- suppression de la source avec des codages non répartis.

Ces contrôles sont exécutés dans le main. Le grisage du renderer n'est jamais
une garde métier.

### 3.3 Aperçu versionné

L'aperçu est préparé dans le main à partir de contenus cohérents pour le
fournisseur. Il produit un identifiant temporaire et un manifeste des codages
observés.

```ts
export interface ApercuOperationTheme {
  operationId: string
  source: string
  parEntretien: Array<{
    id: string
    titre: string
    passages: number
    orphelins: number
    aModifier: boolean
  }>
  disponibiliteGitLab?: {
    observeLe: string
    entretiens: Array<{
      id: string
      etat: 'libre-observe' | 'tenu-autrui' | 'session-locale' | 'inconnu'
      detenteur?: string
      expireLe?: string
      motif?: string
    }>
  }
  totaux: {
    entretiens: number
    passages: number
    orphelins: number
    doublonsPrevisibles: number
    sousThemesDeplaces?: number
  }
  faisable: boolean
  motif?: string
  obstacles: Array<{
    phase: 'definitions' | 'entretiens' | 'finalisation'
    entretienId?: string
    motif: string
  }>
}
```

Le cache d'aperçu :

- appartient au main ;
- est borné et expire ;
- est vidé au changement de corpus ;
- conserve les références et extraits nécessaires à la répartition ;
- ne constitue jamais une autorisation d'écriture.

L'exécution relit les contenus frais. En local, toute différence pertinente
avec le manifeste refuse l'opération entière et demande un nouvel aperçu.
Sur GitLab et WebDAV, l'obsolescence est signalée pour l'entretien concerné,
sans masquer ni annuler les succès des autres entretiens. Une modification des
définitions nécessaires peut arrêter la suite du lot, sans annuler les succès.

Une reprise recalcule un aperçu des codages restant sur la source et conserve
les destinations déjà créées. Les choix de division devenus obsolètes sont
redemandés ; un codage nouveau ou déplacé ne reçoit jamais une destination
inventée automatiquement.

La liste `aModifier` est calculée dans le main à partir du plan de mutation,
pas de tous les entretiens contenant la source ou la cible. Pour une division,
elle est recalculée lorsque les choix changent et avant la confirmation.
`disponibiliteGitLab` ne porte que sur ces entretiens ; son horodatage rappelle
que l'observation n'est pas une réservation. Un entretien verrouillé peut être
lisible : distinguer l'indisponibilité du contenu et le refus possible d'écriture.

### 3.4 Entrées IPC

| Entrée | Rôle |
|---|---|
| `corpus:analyserOperationTheme` | prépare ou actualise l'aperçu, sa faisabilité et les verrous des entretiens à modifier |
| `corpus:detailsOperationTheme` | retourne les codages et extraits d'un entretien du même aperçu |
| `corpus:executerOperationTheme` | exécute une demande liée à l'aperçu |
| `corpus:reprendreOperationTheme` | reprend un lot GitLab journalisé avec un aperçu frais et les choix validés |
| `corpus:progressionOperationTheme` | événement de progression associé à `operationId` |

Le preload expose aussi une fonction de désabonnement à la progression, sur le
modèle des transferts distants. Sur GitLab, l'événement indique la phase
(`definitions`, `entretiens`, `finalisation`), le nombre d'entretiens terminés
et le total prévu ; il distingue succès et échecs. La lecture finale et chaque
commit restent des attentes indéterminées, sans pourcentage temporel fictif.
Le main valide le corpus, les destinations persistées et le lien entre le lot
et le nouvel aperçu avant d'accepter une reprise.

L'exécution et la reprise acceptent une option explicite :

```ts
export interface OptionsExecutionOperationTheme {
  entretiens: 'tous-prevus' | 'observes-libres'
}
```

`tous-prevus` tente chaque entretien prévu, avec les contrôles réels de bail.
`observes-libres` ne traite que les entretiens observés libres dans l'aperçu
confirmé. Le main déduit lui-même ce sous-ensemble ; une liste d'ids fournie par
le renderer ne peut pas étendre le périmètre. Les entretiens différés restent
dans le suivi du lot et apparaissent dans le bilan avec un motif distinct d'un
refus d'acquisition. Cette option ne réduit jamais l'inventaire de finalisation.

### 3.5 Résultats

```ts
export interface BilanLotTheme {
  reussis: Array<{ id: string; reaffectes: number; doublonsSupprimes: number }>
  echecs: Array<{ id: string; motif: string }>
  ciblesCreees: Array<{ token: string; id: string }>
  sourceConservee: boolean | null
  finalisation: 'non-demandee' | 'a-faire' | 'bloquee' | 'indeterminee' | 'terminee'
  motifFinalisation?: string
}

export type ResultatOperationTheme =
  | {
      statut: 'appliquee'
      corpus: CorpusFichier
      entretiens: number
      reaffectes: number
      doublonsSupprimes: number
    }
  | {
      statut: 'partielle'
      operationId: string
      corpus: CorpusFichier
      bilan: BilanLotTheme
    }
  | {
      statut: 'non-appliquee'
      motif: string
    }
  | {
      statut: 'indeterminee'
      operationId: string
      motif: string
      bilan?: BilanLotTheme
    }
```

`partielle` couvre les lots WebDAV et GitLab dont l'issue est connue mais qui
restent incomplets, y compris une suppression finale GitLab bloquée après des
réaffectations réussies. Le bilan expose aussi les catégories créées même si
aucun entretien n'a pu être modifié. Une suppression demandée n'est déclarée
`appliquee` que lorsque sa finalisation est confirmée.

`indeterminee` couvre une publication dont la réponse a été perdue ou une
réconciliation inachevée. Sur GitLab, son bilan des étapes certaines est fourni
sans classer l'étape inconnue comme un échec ; le lot s'arrête et doit être
réconcilié avant de reprendre. Si la suppression finale est indéterminée,
`sourceConservee` vaut `null` : le résultat ne prétend connaître ni sa présence
ni sa suppression. `non-appliquee` n'est utilisé que si aucun effet
n'a été confirmé et qu'aucune publication n'est indéterminée. Une erreur
technique après un succès ne doit pas faire perdre le suivi durable du lot.

---

## 4. Fraîcheur et fichiers concernés

### 4.1 Inventaire strict

L'analyse ne réutilise pas `chargerEntretiens()` lorsque cette méthode ignore un
fichier absent. Elle construit un inventaire qui nomme :

- les membres absents ;
- les fichiers illisibles ;
- les versions non supportées ;
- les entretiens trop volumineux pour le fournisseur.

Un fichier indisponible bloque toute opération locale. Sur GitLab et WebDAV,
il est présenté comme un échec explicite et n'est jamais compté comme zéro
usage ; les entretiens disponibles peuvent être réaffectés sans supprimer la
source. Sur GitLab, tout membre indisponible bloque la finalisation destructive.

### 4.2 Source conservée

Le geste porte sur les entretiens où la source apparaît dans l'instantané de
l'aperçu. Une nouvelle annotation concurrente peut rester sur la source : la
source existe encore, donc aucune référence pendante n'est créée.

### 4.3 Source supprimée

Retirer la définition exige une protection plus large. Un entretien qui
n'utilisait pas la source au moment de l'aperçu pourrait sinon publier une
nouvelle référence pendant l'opération.

Pour une fusion, un transfert sans conservation ou une division avec suppression :

- le local travaille dans sa transaction multi-fichiers ;
- GitLab conserve la source pendant les écritures individuelles, puis relit
  tout le membership frais sous le bail corpus ; la suppression n'est publiée
  que si aucun codage ne la référence, avec une garde légère par entretien ;
- WebDAV ne propose pas encore ce parcours.

---

## 5. Capacités et classement des gestes

Les trois gestes visibles sont classés séparément. Les variantes destructives
du transfert et de la division possèdent leur propre garde, car
`PORTEE_PAR_GESTE` associe une seule portée statique à chaque geste :

- `theme.transferer` ;
- `theme.transferer-supprimer-source`, garde supplémentaire lorsque
  `conserverSource === false` ;
- `theme.fusionner` ;
- `theme.diviser` ;
- `theme.diviser-supprimer-source`, garde supplémentaire lorsque
  `effacerSource === true`.

Deux portées sont ajoutées :

- `themes-reaffectation` : création éventuelle de définitions et modification
  de plusieurs entretiens, source conservée ;
- `themes-reaffectation-suppression` : même opération avec retrait de la source.

Attribution après qualification :

| Fournisseur | Réaffectation | Suppression de la source |
|---|---:|---:|
| Local | oui | oui |
| WebDAV | oui, résultat partiel possible | non |
| GitLab | oui, résultat partiel possible | oui, finalisation gardée |

Capacités publiques :

```ts
transfertThemes: boolean
divisionThemes: boolean
fusionThemes: boolean
suppressionSourceThemes: boolean
```

`divisionThemes` est déduite de `theme.diviser`.
`suppressionSourceThemes` est déduite de
`theme.diviser-supprimer-source`. Le handler exige cette seconde garde avant
toute préparation lorsque `effacerSource` vaut `true`.

Le renderer ne teste jamais directement le fournisseur. Sur WebDAV, la division
est proposée sans case d'effacement. La fusion est grisée avec une explication.

Le classement des gestes et les capacités sont ajoutés avant les handlers IPC,
afin qu'aucune étape intermédiaire ne dépende d'un geste encore inconnu.

---

## 6. Architecture locale

### 6.1 Préparation

Le store :

1. relit strictement le corpus et les entretiens du membership ;
2. valide le manifeste ;
3. résout les nouvelles catégories et leurs ids ;
4. calcule tous les contenus candidats en mémoire ;
5. vérifie les références des candidats ;
6. construit un plan de transaction de fichiers.

### 6.2 Transaction reprenable

`TransactionsFichiersCorpus` est réutilisé. Son opération `remplacement` est
étendue pour accepter, lorsque nécessaire, un corpus intermédiaire :

```ts
interface PlanRemplacementEntretiens {
  operation: 'remplacement'
  id: string
  corpusAvant: CorpusFichier
  corpusIntermediaire?: CorpusFichier
  corpusApres: CorpusFichier
  entretiens: Array<{
    id: string
    avant: EntretienFichier
    apres: EntretienFichier
  }>
  ordre?: 'entretiens-puis-corpus' | 'corpus-puis-entretiens'
}
```

Séquences :

| Cas | Ordre |
|---|---|
| transfert vers une cible existante, source conservée | entretiens uniquement |
| transfert ou division créant des cibles, source conservée | corpus puis entretiens |
| fusion ou transfert vers une cible existante avec suppression | entretiens puis corpus final |
| transfert ou division créant des cibles et supprimant la source | corpus intermédiaire, entretiens, corpus final |

Le journal contient l'intention complète. À l'ouverture suivante, la reprise se
termine avant que le corpus soit exposé au renderer. Aucun état inconnu n'est
écrasé.

---

## 7. Architecture WebDAV

### 7.1 Périmètre initial

WebDAV prend en charge :

- le transfert avec source conservée ;
- la division avec source conservée.

La fusion et l'effacement de la source après division restent indisponibles. Ce
choix évite de présenter une compensation multi-fichiers comme une transaction
atomique.

### 7.2 Exécution par entretien

Les nouvelles catégories sont d'abord créées sous le verrou court de
`corpus.json`. Elles restent valides même si aucun entretien n'est ensuite
modifié.

Chaque entretien suit ensuite une transaction courte indépendante :

1. acquisition de son verrou ;
2. GET frais ;
3. comparaison avec le manifeste de cet entretien ;
4. mutation pure ;
5. PUT conditionnel ;
6. mise à jour du miroir ;
7. libération en `finally`.

Les traitements sont séquentiels et publient leur progression. Une session ou
un verrou concurrent produit un échec nommé pour cet entretien sans annuler les
succès précédents.

Une relance recalcule un aperçu sur l'état courant et ne traite que les codages
restant sur la source. La déduplication rend la réaffectation idempotente.

### 7.3 Résultat partiel

L'interface affiche séparément :

- les entretiens modifiés ;
- les entretiens refusés ou devenus obsolètes ;
- les catégories éventuellement créées ;
- l'action « Recalculer et reprendre ».

La source reste présente, de sorte qu'un résultat partiel demeure cohérent.

Une évolution ultérieure vers la fusion WebDAV nécessitera un plan séparé :
verrous de masse avec battements, journal distant, reprise après crash et
qualification multi-postes.

---

## 8. Architecture GitLab

### 8.1 Capacités et vérification ciblée avant lancement

Réutiliser les transactions courtes et les gardes légères déjà qualifiées.
Les deux nouvelles portées ont été ajoutées à `PORTEEES_OVERTES_GITLAB` après
qualification du lot reprenable et de sa finalisation à deux comptes.
Il n'y a ni commit global de réaffectation ni acquisition de baux de masse.

Avant confirmation, le main :

1. inventorie les codages et calcule les entretiens réellement à modifier ;
2. pour une division, tient compte des choix effectifs, pas seulement des usages
   de la source ;
3. observe les baux distants et filtre leur résultat sur ce périmètre ;
4. ajoute les sessions de ce poste, masquées par l'observation publique existante ;
5. retourne les états, détenteurs connus et date d'observation dans l'aperçu.

Réutiliser l'observation de `ContexteGitLab` plutôt que les seuls badges du
renderer ; si l'API liste tous les baux, cela n'élargit pas le périmètre contrôlé.
Ne pas utiliser `verifierCorpusCalme()`, qui impose la fermeture de tout le
corpus, et ne pas acquérir de bail pour tester la disponibilité.

Une observation en panne ou incomplète produit `inconnu`, jamais `libre-observe`.
Un bail expiré ou ambigu est interprété selon les règles de coordination
existantes ; un poste utilisant le même compte n'est pas assimilé à une session
locale libre. L'état libre signifie seulement qu'aucun obstacle n'a été observé.

L'utilisateur peut attendre et actualiser sans effet distant, ou confirmer le
traitement des seuls entretiens observés libres. Les autres sont différés et
restent à reprendre. S'il n'y a aucun entretien libre parmi ceux à modifier,
ne pas créer les destinations pour lancer un lot qui ne pourrait rien traiter.
Un geste ne nécessitant aucune écriture d'entretien peut néanmoins poursuivre
sa préparation ou sa finalisation, selon ses autres contrôles.

La consultation n'est **ni une garantie ni une réservation**. Un verrou peut
apparaître après l'aperçu : l'acquisition du bail avant chaque écriture reste
obligatoire. Les entretiens hors du sous-ensemble confirmé ne sont pas ajoutés
silencieusement au lot s'ils se libèrent entre-temps. La reprise actualise leur
état et demande une nouvelle confirmation.

### 8.2 Préparation des définitions

1. Valider l'aperçu, la demande et l'option de lancement dans le main ; déduire
   les entretiens sélectionnés et différés, puis créer le suivi durable du lot.
2. Générer et conserver la correspondance tokens/ids des nouvelles catégories.
3. Si nécessaire, prendre le bail corpus, relire les définitions fraîches,
   vérifier source, destinations et hiérarchie, puis créer les catégories dans
   un commit court et journalisé.
4. Installer les définitions uniquement après confirmation, puis libérer le bail.

La source reste présente et ses enfants ne sont pas déplacés à cette étape.
Les catégories créées restent valides même si aucun entretien n'est ensuite
modifié. Aucun bail corpus n'est détenu pendant tout le lot. Si la préparation
est refusée, aucune réaffectation n'est lancée ; si son résultat est inconnu,
il est réconcilié avant de continuer, sans recréer les destinations.

### 8.3 Réaffectation entretien par entretien

Pour chaque entretien sélectionné à la confirmation, dans un ordre stable :

1. refuser une session locale concernée, sans publication implicite ;
2. acquérir son seul bail court, ou nommer le refus s'il est déjà tenu ;
3. résoudre un SHA et lire l'entretien et `corpus.json` sur ce même instantané ;
4. vérifier les définitions requises et le manifeste de cet entretien ;
5. appliquer les réaffectations et déduplications, puis vérifier les références ;
6. publier un commit contenant le candidat complet de **cet entretien**, une
   garde légère de `corpus.json` et la transition de son bail ;
7. installer le miroir après confirmation et enregistrer le succès du lot ;
8. libérer le bail après une issue certaine ; un droit suspendu reste soumis
   à la réconciliation existante.

Un entretien sans changement ne produit pas de commit de données. Un refus de
bail, une obsolescence ou une borne individuelle produit un échec nommé ; les
entretiens suivants peuvent être traités et les succès précédents restent
acquis. Une disparition de la source ou d'une destination invalide la suite
du lot et demande un aperçu frais. Les changements indépendants de définitions
peuvent utiliser le mécanisme existant de relecture bornée, sans écraser une
modification concurrente de l'entretien.

Une réponse de publication inconnue **arrête le lot** : ni l'entretien concerné
ni les suivants ne sont rejoués avant réconciliation. Les transactions sont
séquentielles, avec progression réelle du nombre d'entretiens terminés.

### 8.4 Suppression finale de la source

Pour une fusion, un transfert sans conservation ou une division avec
suppression, ne finaliser qu'après la confirmation de toutes les étapes requises
et sans échec restant à résoudre.
La finalisation utilise un seul bail corpus :

1. résoudre un nouveau SHA après acquisition du bail ;
2. relire `corpus.json` et **tous les entretiens du membership frais** à ce SHA ;
3. refuser si un membre est absent, illisible ou hors des bornes de lecture,
   ou si un codage, même orphelin, référence encore la source ;
4. revalider source, destinations et hiérarchie ; pour une fusion, déplacer
   les enfants directs observés sur cette base fraîche vers la cible ;
5. vérifier le codebook final et publier sa modification, une garde légère
   par entretien et la transition du bail corpus dans un commit atomique ;
6. installer le miroir et marquer la finalisation terminée après confirmation.

Aucun contenu d'entretien n'est publié à cette étape et aucun bail d'entretien
n'est acquis. Les verrous des entretiens seulement vérifiés ne sont pas des
obstacles de lancement et leur liberté n'est pas une condition de finalisation.
Un entretien peut rester ouvert ailleurs ; sa publication entre
la lecture et le commit périme sa garde et refuse **la finalisation seule**.
Les réaffectations précédentes ne sont pas annulées, la source reste présente
et le résultat est partiel. Une nouvelle référence découverte demande un aperçu
et, pour une division, un choix explicite ; elle n'est pas réaffectée au hasard.

Une publication de session ultérieure doit toujours valider ses références sur
les définitions fraîches et garder `corpus.json`. Une ancienne copie référençant
la source supprimée est refusée, jamais publiée comme référence pendante.
Une finalisation au résultat inconnu reste bloquante pour les mutations de
corpus selon le journal existant et doit être réconciliée avant toute reprise.

### 8.5 Bornes et faisabilité

La borne de **2 Mio porte sur chaque corps HTTP complet**, non sur la somme
des entretiens du lot. Chaque candidat d'entretien est néanmoins envoyé en
entier ; la limite de lecture et le coût de l'échappement JSON subsistent.
Les commits de création des catégories et de finalisation ont aussi leur
propre contrôle de taille. Le publieur conserve ses contrôles définitifs à
250 actions et de durée restante du bail.

Un commit de réaffectation comporte normalement trois actions : entretien,
garde corpus, transition du bail. Le nombre total d'entretiens à réaffecter
n'est pas borné à 124 ou 248 par cette cardinalité par commit.

La finalisation comporte `N + 2` actions pour `N` membres : corpus, `N` gardes,
bail. **La suppression de source reste donc limitée à 248 membres**, sans cumul
de leurs transcriptions. Si ce dépassement est connu dès l'aperçu, la fusion ou
une opération destructive est déclarée infaisable avant toute écriture ; le
transfert et la division avec source conservée restent possibles. Si le
membership grandit pendant le lot, la finalisation est bloquée avec un bilan
partiel et la source conservée. Ne jamais découper cette décision de suppression
ni réduire silencieusement son inventaire pour contourner la limite.

L'aperçu distingue obstacles par entretien et obstacles à la finalisation.
Le main revérifie les bornes sur les bases fraîches. Mesurer le coût cumulé des
transactions courtes, le nombre de commits et la finalisation ; les mesures
existantes des 248 gardes ne préjugent pas de la durée d'un lot d'écritures.

### 8.6 Suivi durable et reprise

Ajouter un journal de lot versionné distinct du journal de chaque publication.
Il conserve l'identité du corpus distant, la demande validée, les destinations
résolues, les manifestes utiles, l'option de lancement, les entretiens sélectionnés
ou différés et leurs motifs, les compteurs confirmés par entretien et la phase
courante. Avant chaque envoi, persister le lien vers l'identifiant de la
publication journalisée ; après confirmation, persister son issue avant de
passer à la suivante.

Après un arrêt, réconcilier d'abord les publications en cours avec les mécanismes
existants. Une réponse perdue après création, réaffectation ou finalisation
n'autorise ni rejeu aveugle ni nouveau tirage d'ids. Un arrêt entre confirmation
et enregistrement du succès est réparé à partir du journal et de la preuve du
commit, sans compter deux fois l'étape. Conserver cette preuve jusqu'à ce que le
suivi du lot soit durablement mis à jour.

La reprise explicite recalcule un aperçu sur l'état courant, conserve les cibles
déjà créées et traite les codages restant sur la source. Elle redemande les
choix de division obsolètes et revalide les définitions. Les écritures confirmées
ne sont jamais annulées par compensation. Le cache temporaire d'aperçu ne tient
pas lieu de journal ; un lot incomplet reste visible après redémarrage, sans
bloquer globalement le corpus lorsque toutes ses publications sont certaines.
La fin confirmée clôt le suivi ; une entrée indéterminée n'est jamais supprimée
pour permettre un nouveau lancement.

---

## 9. Interface

### 9.1 Assemblage dans `Corpus.vue`

Lorsque l'onglet Thèmes est actif :

- la colonne gauche conserve l'arbre, les couleurs, les compteurs et le crayon ;
- la colonne droite affiche `ThemesOpsCorpus.vue` à la place des cartes
  d'entretiens ;
- le composant reste monté pendant un aller-retour dans un entretien, comme les
  autres outils de corpus.

Les autres onglets conservent la colonne d'entretiens actuelle.

### 9.2 Cartes d'opération

Trois cartes sont présentées :

- **Transférer une thématique** ;
- **Fusionner deux thématiques** ;
- **Diviser une thématique**.

Chaque carte suit sa propre capacité. Un geste indisponible reste visible avec
son motif, plutôt que de disparaître.

Les modales ont deux étapes : choix, puis aperçu. Elles affichent :

- nombre de passages et d'entretiens ;
- nombre d'orphelins ;
- doublons prévisibles ;
- sous-thèmes déplacés pour une fusion ;
- fichiers indisponibles ;
- coût et bornes du fournisseur ;
- disponibilité observée des seuls entretiens à modifier, avec date d'observation,
  titres, détenteurs connus, sessions locales et états inconnus.

Pour GitLab, le récapitulatif peut annoncer :

> 12 entretiens à modifier : 10 observés libres, 2 ouverts par d'autres utilisateurs.

Les sessions locales et les états inconnus sont comptés séparément, sans les
présenter comme libres. En cas d'obstacle, proposer :

- **Attendre et actualiser** : relire les observations et recalculer l'aperçu
  si les contenus ou les choix ont changé, sans création ni écriture distante ;
- **Traiter les entretiens disponibles** : confirmer explicitement le
  sous-ensemble observé libre, avec bilan partiel et reprise des autres.

Lorsque aucun entretien à modifier n'est observé libre, désactiver ce second
choix. Un message rappelle que la disponibilité peut changer et que chaque bail
sera vérifié avant écriture. Pour un transfert, une fusion ou une division
destructive, annoncer que la source reste présente tant que des traitements sont différés
ou refusés, ou que la finalisation n'est pas confirmée. Une observation des
verrous indisponible ne fait jamais afficher « tous libres ».

### 9.3 Écran de répartition

`RepartitionTheme.vue` reprend l'accordéon de la pseudonymisation :

- un entretien déplié à la fois ;
- détails chargés par `detailsOperationTheme` ;
- état local jusqu'à la validation ;
- une colonne par destination ;
- commande « tout attribuer » pour l'entretien ouvert ;
- raccourcis `1` à `4` sur la ligne sélectionnée ;
- section distincte pour les passages sans texte.

L'écran n'ouvre pas automatiquement une session d'entretien. Il affiche un
extrait élargi dans le panneau. Un éventuel bouton « Consulter l'entretien »
invalide clairement l'aperçu et impose de le recalculer après le retour.

Lorsque la suppression est disponible et demandée, le bouton reste désactivé
tant qu'un codage du manifeste n'a pas de destination. Après modification des
choix, recalculer le périmètre des entretiens à écrire et actualiser leur
disponibilité avant la confirmation ; les choix de répartition restent conservés
si les contenus sont toujours valides.

### 9.4 Exécution

Pendant l'opération :

- les contrôles de modification sont désactivés ;
- la progression est affichée par `operationId`, avec entretiens terminés et
  total prévu pour les lots GitLab et WebDAV ;
- sur GitLab, la phase finale est distinguée des réaffectations, avec une attente
  indéterminée pendant sa vérification et chaque commit ;
- aucun bouton d'interruption n'est proposé pendant un commit ou un PUT ;
- quitter le panneau ne transforme pas un résultat inconnu en échec.

Adapter le lanceur commun et sa garde anti-double-lancement au lot GitLab ;
ne pas réutiliser tel quel le message annonçant un refus de toute l'opération
sur publication concurrente. La confirmation précise que les entretiens sont
traités un par un, que les succès restent acquis et que la source reste présente
si la finalisation échoue. Le récapitulatif sert de confirmation, sans doublon.
Le panneau suit les capacités et les résultats, pas directement le fournisseur.

Après un résultat partiel distant, afficher les succès, les refus, les cibles
créées et l'état de la suppression finale. Proposer « Recalculer et reprendre »
ou « Réessayer la finalisation » selon ce qui reste à faire. Un résultat inconnu
propose d'abord la réconciliation, pas une relance. Les lots GitLab incomplets
restent consultables après redémarrage.

Après tout résultat ayant modifié au moins un fichier, y compris un résultat
partiel GitLab ou WebDAV, le renderer appelle `majCodebook` puis `rafraichirUsages`, qui
recalcule également `resumesThematiques`.

---

## 10. Étapes d'implémentation

### Avancement

- [x] Étape 1 : contrat retenu reporté dans `synthese-corpus-onglets.md`.
- [x] Étape 2 : portées, quatre gestes et capacités publiques ajoutés ;
  GitLab ouvre les deux portées après qualification ; WebDAV ouvre seulement
  le transfert et la division avec source conservée.
- [x] Étape 3 : cœur pur dans `src/shared/corpus/themes.ts`, exporté par
  l'agrégat corpus et couvert par `test/themes.test.ts`.
- [x] Étape 4, partie locale : cache main borné et expirant, inventaire strict,
  détails avec extraits, empreintes et périmètre réel d'écriture.
- [x] Étape 4, partie WebDAV : GET avec ETag apparié, corpus stable pendant
  l’inventaire, membres indisponibles nommés, cache et détails sans repli miroir.
- [x] Étape 4, backend GitLab : corpus et membres au même SHA, lecture avec
  garde bornée, observations ciblées des baux et sessions locales ajoutées,
  cache borné et détails sans repli miroir. Qualification réelle de lecture
  réussie à deux comptes après renouvellement des jetons ; aucune capacité
  d’écriture n’est ouverte.
- [x] Étape 5, backend local : transaction avec corpus intermédiaire, parcours
  transfert/fusion/division et gardes de fraîcheur branchés au main/IPC.
- [x] Étape 6, partie locale : atelier, modales, aperçu confirmé, accordéon,
  répartition manuelle, orphelins et raccourcis ; bilan et actualisation des usages.
- [x] Étape 6, partie WebDAV : confirmation séquentielle, bilan des succès,
  refus, inconnus et non-traités, suivi persistant, reprise et vérification explicites.
- [x] Étape 6, partie GitLab : observations de baux, confirmation du
  sous-ensemble disponible, reprise des lots et réconciliation.
- [x] Étape 7 : publication WebDAV courte par entretien, distinction des réponses
  perdues, bilan partiel et reprise conservant les destinations ; qualification A/B.
- [x] Étape 10, parties locale et WebDAV : documentation utilisateur et développeur.
- [x] Étapes 8 et 9 : lots GitLab journalisés, finalisation protégée,
  interface et qualification réelle à deux comptes.

Le cœur pur sépare la validation des définitions de la couverture des choix :
`verifierRepartitionOperationTheme` exige l'inventaire complet pour autoriser
une division destructive. La préparation crée les destinations sans retirer
la source ; la finalisation travaille sur l'inventaire frais des codages restants.
Ces fonctions ne fournissent à elles seules aucune garantie de stockage.
Le backend local est désormais branché avec analyse, détails, exécution et
progression ; le preload et `env.d.ts` correspondent aux handlers.
Le local refuse toute obsolescence des fichiers avant génération des destinations.
Une suppression garde également les entretiens lus mais inchangés dans le plan
transactionnel, sans les réécrire. Le cache est vidé lors d'une bascule de corpus.

Le journal multi-fichiers utilise la version 2 pour une intention avec corpus
intermédiaire et continue à lire les anciens journaux version 1. Les coupures
après chaque écriture sont testées, ainsi que la reprise avant exposition et le
refus d'un état inconnu. Une erreur avec journal restant retourne `indeterminee`,
sans autoriser un nouveau lancement avant reprise. Les ateliers local, WebDAV et GitLab
sont livrés. Les lectures et publications WebDAV
utilisent le serveur ; aucun handler ne se rabat sur le seul miroir. Documentation technique :
`docs/dev/operations-themes.md`.

Le composant reste monté pendant la consultation ; celle-ci invalide l’aperçu.
Les réponses tardives ne rétablissent pas une confirmation périmée. Une analyse
neuve redemande les choix obsolètes. La révision d’application du corpus efface
l’atelier lors d’une bascule. Le lanceur global conserve sa garde et utilise le
récapitulatif comme confirmation unique. Les résultats appliqués ou partiels
actualisent codebook, usages et résumés ; un résultat inconnu bloque la relance.

Vérifications : `npm run typecheck`, `npm run build` et
`vitest run test/*.test.ts test/gitlab/politiqueGestes.test.ts`
(97 fichiers, 1 253 tests réussis). Sept suites WebDAV supplémentaires :
198 tests réussis. E2E Electron locaux : 18 scénarios réussis
(`themes-operations.e2e.ts`, `themes.e2e.ts`, `multi-corpus.e2e.ts`). Les tests HTML
historiques émettent des avertissements d’annulation de chargements CSS dans
Happy DOM, sans échec de test.

Les aperçus WebDAV sont branchés au contexte et à l’IPC d’analyse et de détails.
Le texte et l’ETag viennent du même GET ; le corpus est relu après les membres,
avec refus si son contenu ou son ETag a changé. Cette cohérence par fichier ne
constitue pas un instantané atomique global. Les fichiers indisponibles sont
nommés ; seuls les défauts de définitions ou de choix bloquent la préparation
avec source conservée. Les adaptations restent en mémoire, sans session,
verrou ni écriture. Le cache est vidé à la fermeture et ignore les réponses
obsolètes. L’IPC d’exécution publie désormais uniquement les variantes avec
source conservée. Les capacités de transfert et division WebDAV sont ouvertes ;
fusion et suppression de source restent fermées.

Qualification de lecture : deux tests passent sur les bancs Nextcloud A et B,
avec GET/ETag, fichier absent, lecture partagée à deux comptes et absence
d’écriture d’analyse (`test/webdav/themes-apercus-nextcloud.test.ts`).
Deux autres tests qualifient publication et reprise à deux comptes : verrou natif
sur A, conditionnel sur B, refus d’un tiers, succès acquis et destinations stables
(`test/webdav/themes-publication-nextcloud.test.ts`). Les GET appariés demandent
`Accept-Encoding: identity` : les ETags de représentation gzip provoquaient un
412 lors des PUT sur les deux bancs et ne sont pas transformés artificiellement.

La publication relit chaque entretien sous un verrou court indépendant, compare
son empreinte au manifeste et vérifie les références avant le PUT conditionnel.
Une session locale active ou récupérable est refusée sans publication implicite.
Le journal `.themes-webdav.json`, lié à l’URL du corpus, persiste les destinations,
les tentatives, les succès et l’intention exacte avant tout envoi. Les refus
certains sont nommés ; une réponse inconnue arrête le lot. Un ancien contenu ne
prouve pas l’absence de publication. La vérification explicite n’envoie aucun PUT
de données ; seules les publications confirmées autorisent la reprise. Les
codages encore sur la source sont réinventoriés avec les mêmes destinations,
et les choix de division sont redemandés. Un suivi certain peut être clôturé
sans annulation ; un suivi inconnu ne peut pas l’être.

L’atelier retrouve les lots incomplets après redémarrage, distingue les publications
inconnues des entretiens non traités et bloque un nouvel envoi non confirmé.
Les tests de composable et de composant couvrent ce parcours, la confirmation
séquentielle et les réponses tardives. Aucune atomicité globale n’est annoncée.

Les aperçus GitLab sont branchés à leur contexte et à l’IPC de lecture. Un SHA
est résolu par analyse : corpus,
membres et baux ciblés sont lus à ce même commit, même si la tête avance.
Seuls les entretiens effectivement modifiés sont observés ; un entretien seulement
vérifié pour la finalisation n’impose pas sa fermeture. Les sessions de ce poste
et les chemins récupérables sont ajoutés aux badges publics. Un bail illisible,
un badge incomplet ou une panne produisent `inconnu`, jamais `libre-observe`.
Aucune acquisition ni installation de miroir n’est effectuée par l’analyse.

Les obstacles de finalisation sont conservés dans le cache : membre indisponible
ou plus de 248 membres rendent une suppression infaisable. Cette borne n’est pas
un plafond du nombre d’entretiens d’un transfert. L’absence d’entretien libre
bloque un lot nécessitant des réaffectations ; un plan sans mutation d’entretien
ne lit aucun bail. Les observations complètent le cache dans sa borne mémoire.
Vingt tests simulés couvrent ces règles (`test/gitlab/apercusThemes.test.ts`).
La régression complète du 8 octobre 2026 donne 1 869 tests réussis (137 fichiers),
avec les qualifications réelles désactivées sans configuration. Le test réel à deux
comptes (`qualificationApercusThemes.test.ts`) passe après préparation du banc et
renouvellement des trois jetons expirés. Il confirme le SHA unique, les observations
ciblées et l’absence de commit d’analyse ou de repli miroir. Les anciens jetons
sont révoqués ; leurs remplaçants gardent les mêmes droits et expirent le 6 janvier
2027. Les écritures ont ensuite été qualifiées et les deux portées GitLab ouvertes.

Le lot GitLab possède un journal local distinct du journal de publication. Les
ids de destinations, entretiens sélectionnés ou différés, compteurs et candidats
en cours survivent aux reprises. Chaque entretien est publié sous son bail court,
avec une garde légère de `corpus.json`. La suppression finale relit tout le
membership au même SHA et publie le codebook final avec une garde par membre.
Les refus certains conservent les succès ; une réponse inconnue arrête le lot
jusqu’à sa réconciliation sans rejeu.

Qualification d’écriture réelle : `qualificationThemes.test.ts` passe à deux
comptes sur GitLab CE 18.11. Un entretien tenu est traité comme différé puis
repris après libération. Une référence concurrente publiée entre la lecture et
le commit de finalisation refuse cette seule étape ; la source reste présente,
puis une reprise réaffecte la référence et termine la fusion. Les tests simulés
couvrent aussi les réponses perdues après création, réaffectation et finalisation,
avec ids stables et absence de rejeu. La campagne GitLab configurée donne
454 tests réussis et deux sauts réservés aux campagnes longues ; `typecheck`, le
build de production et les 16 E2E de l’atelier et des thèmes passent également.

### Séquence

1. **Décisions et documentation de référence.** Mettre à jour
   `synthese-corpus-onglets.md` avec le contrat local, GitLab et WebDAV retenu.
2. **Gestes et capacités.** Ajouter les portées, gestes et capacités avant les
   handlers.
3. **Cœur pur.** Ajouter les types, validations, inventaires, réaffectations,
   déduplication et transformations de hiérarchie.
4. **Aperçu versionné.** Ajouter le cache main, les détails et les empreintes,
   le périmètre réel d'écriture et l'observation ciblée des verrous GitLab.
5. **Transaction locale.** Étendre `TransactionsFichiersCorpus` avec le corpus
   intermédiaire et livrer le parcours local complet.
6. **Interface.** Ajouter le panneau, les modales et l'accordéon de répartition.
7. **WebDAV limité.** Ajouter transfert et division sans suppression, avec
   résultats partiels et reprise.
8. **GitLab.** Réutiliser les transactions courtes et les gardes légères,
   ajouter préparation des destinations, journal de lot, progression, résultats
   partiels, reprise et suppression finale gardée. Ne pas étendre les droits
   simultanés ni agréger les transcriptions dans un commit global.
9. **Qualification GitLab.** Tester à deux comptes les lots et leur finalisation,
   les arrêts et réponses perdues à chaque phase ; mesurer les coûts et ouvrir
   les portées seulement après succès.
10. **Documentation utilisateur et développeur.** Documenter les différences de
    garantie entre fournisseurs.

---

## 11. Tests

### 11.1 Cœur pur

Nouveau fichier `test/themes.test.ts` :

- transfert, fusion et division ;
- codages orphelins ;
- chevauchements ;
- déduplication exacte ;
- annotations `anon` et `commentaire` inchangées ;
- collision du même `annotationId` dans deux entretiens ;
- tokens de nouvelles catégories ;
- source ou cible inconnue ;
- source égale à la cible ;
- cible descendante lors d'une fusion ;
- choix dupliqué ou destination inconnue ;
- suppression avec codages non répartis ;
- déplacement des enfants de la source vers la cible.

### 11.2 Aperçu et IPC

- aperçu expiré ou appartenant à un autre corpus ;
- annotation ajoutée, supprimée ou déplacée après l'aperçu ;
- entretien absent, illisible ou non supporté ;
- nouvelle catégorie générée uniquement dans le main ;
- correspondance preload, handlers et `env.d.ts` ;
- progression associée au bon `operationId`, avec phases et compteurs GitLab ;
- confirmation du caractère partiel possible du lot, anti-double-lancement et
  attente finale indéterminée, sans double confirmation ;
- bilan conservant les succès lors d'un refus ou d'une publication inconnue ;
- reprise liée au bon corpus et aux destinations persistées ;
- périmètre de disponibilité limité aux mutations effectives, recalculé après
  changement des choix de division ;
- titres, détenteurs, sessions locales, états inconnus et horodatage affichés ;
- attendre/actualiser sans effet distant ; choix explicite du sous-ensemble libre ;
- absence d'entretien libre : lancement partiel désactivé, sans création de cible ;
- options de lancement et sous-ensemble validés dans le main, pas d'extension
  du périmètre par l'IPC direct ;
- rafraîchissement des usages après un résultat partiel GitLab ou WebDAV.

### 11.3 Local

Dans `test/transactionsFichiers.test.ts` et `test/corpusStore.test.ts` :

- ordre corpus puis entretiens ;
- ordre entretiens puis corpus ;
- corpus intermédiaire puis corpus final ;
- arrêt après chaque écriture et reprise au démarrage ;
- refus si un fichier a un état inconnu ;
- aucun fichier exposé au renderer avant la reprise ;
- rafraîchissement du codebook, des usages et des résumés.

### 11.4 WebDAV

- création des cibles avant les premières réaffectations ;
- un verrou court par entretien ;
- GET frais et PUT conditionnel ;
- libération en `finally` ;
- succès partiel nommé ;
- entretien devenu obsolète ;
- session locale ou verrou concurrent signalé ;
- relance limitée aux codages restant sur la source ;
- source toujours conservée ;
- fusion et effacement refusés par la politique et par l'IPC direct.

### 11.5 GitLab simulé

- création des destinations confirmée avant les réaffectations, ids stables en reprise ;
- un seul bail court à la fois, sans bail corpus détenu pendant le lot ;
- commit de réaffectation contenant un seul entretien, garde corpus et bail ;
- observation ciblée : un verrou hors du périmètre d'écriture ne bloque rien ;
- baux du même compte sur un autre poste détectés, sessions locales comptées à part ;
- observation en panne ou incomplète : état inconnu, jamais faux libre ;
- aperçu sans acquisition de bail, sous-ensemble confirmé respecté et différés
  conservés dans le journal et le bilan ;
- verrou apparu après l'aperçu libre : acquisition refusée, aucun écrasement ;
- verrou libéré après l'aperçu : entretien différé non ajouté sans confirmation ;
- reprise actualisant les verrous et conservant les destinations existantes ;
- refus d'une session locale sans publication implicite ;
- lot mêlé : succès conservés, bail tenu ou manifeste obsolète nommés par entretien ;
- catégories créées mais tous les entretiens refusés : bilan partiel explicite ;
- somme des candidats supérieure à 2 Mio acceptée si chaque publication tient
  dans sa borne ; un candidat individuel trop gros refusé sans annuler les autres ;
- transfert avec plus de 248 entretiens sans borne artificielle de lot ;
- source et enfants conservés pendant une fusion incomplète ;
- division reprise vers les cibles existantes, sans recréation ni choix inventé ;
- finalisation relisant tout le membership frais, orphelins compris ;
- nouvelle référence, membre indisponible ou échec restant : source non supprimée ;
- source ou cible supprimée, ou hiérarchie devenue invalide : pas d'écrasement ;
- finalisation à 248 membres acceptée, à 249 refusée avant écritures si prévisible ;
- membership agrandi pendant le lot : suppression bloquée, succès conservés ;
- entretien ouvert ailleurs permis lors de la finalisation, mais publication
  concurrente ou mode changé refusant ce commit seul ;
- suppression et déplacement des enfants atomiques, gardes sans contenu et sans
  bail d'entretien ; références d'une ancienne session refusées après suppression ;
- réponse perdue à chaque phase : arrêt du lot et réconciliation sans rejeu ;
- crash entre confirmation et enregistrement du succès : preuve conservée,
  compteurs et destinations non dupliqués ;
- reprise du journal de lot après redémarrage et expiration du cache d'aperçu ;
- journal de publication existant réutilisé, HEAD au SHA exact pour la finalisation.

### 11.6 Qualification GitLab

Nouveau banc `test/gitlab/qualificationThemes.test.ts` :

- aperçu à deux comptes affichant le détenteur d'un entretien concerné, sans
  bloquer sur un entretien tenu hors du périmètre ;
- choix des seuls entretiens observés libres, différés nommés puis repris ;
- verrou acquis après l'aperçu et libéré avant la reprise : contrôles réels prouvés ;
- transfert et division à deux comptes, lot mêlé avec un entretien tenu ;
- volume cumulé supérieur à 2 Mio réparti en plusieurs publications valides ;
- conflit entre aperçu et mutation d'un entretien, succès précédents conservés ;
- fusion progressive puis suppression finale protégée par tout le membership ;
- nouvelle référence pendant le lot et publication pendant la finalisation ;
- session ancienne refusée si elle republie une référence supprimée ;
- limites individuelles de lecture/publication et finalisation à 248/249 membres ;
- perte de réponse après création, réaffectation et suppression finale ;
- crash et reprise sans recréation des cibles ni double comptage des succès ;
- expiration d'un bail court et reprise après réconciliation ;
- mesure des lectures, commits par entretien, durée totale et finalisation,
  sans extrapoler les mesures des 248 gardes à tout le lot.

---

## 12. Documentation à mettre à jour

- `plans/encours/synthese-corpus-onglets.md` : remplacer l'énoncé général par
  les garanties distinctes retenues pour local, WebDAV et GitLab.
- `docs/dev/gestes-fournisseur.md` : nouvelles portées et capacités.
- `docs/dev/gitlab.md` : transactions par entretien, finalisation gardée, bornes,
  journaux de lot/publication, résultats partiels et qualification.
- `docs/dev/multi-utilisateur.md` : résultats partiels GitLab/WebDAV, reprise et
  suppression finale GitLab ; suppressions WebDAV indisponibles.
- `docs/user/multi-utilisateur.md` : différences visibles entre fournisseurs.
- `docs/user/vue-corpus.md` : panneau, gestes, aperçu et répartition.

---

## 13. Hors périmètre

- Re-pointage de `RegleAnon.categorie`.
- Nettoyage général des doublons historiques.
- Annulation par le Journal du corpus.
- Fusion WebDAV tant qu'un protocole distant reprenable n'est pas conçu et
  qualifié.
- Assistance automatique ou IA pour proposer une répartition.
