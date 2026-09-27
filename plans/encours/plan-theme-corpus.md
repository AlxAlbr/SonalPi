# Plan — Opérations sur les thématiques au niveau du corpus

> **Objet.** Remplacer, dans l'onglet **Thèmes** du corpus, la liste des
> entretiens située à droite par un atelier permettant de transférer, fusionner
> et diviser des thématiques.
>
> **Déploiement retenu.** Le parcours complet est livré d'abord sur les corpus
> locaux. GitLab l'obtient après qualification de sa transaction atomique.
> WebDAV reçoit d'abord les réaffectations sans suppression de la source, avec
> un résultat partiel explicite et relançable.
>
> **Garantie retenue.** Une opération ne laisse jamais volontairement de
> référence pendante. Une exécution incomplète ou dont le résultat n'est pas
> connu est nommée et peut être reprise ou réconciliée. L'atomicité stricte
> n'est annoncée que lorsqu'elle est réellement fournie par le stockage.

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
- La source reste dans le codebook, même lorsqu'elle devient vide.
- La cible peut être une catégorie existante ou une nouvelle catégorie.
- La hiérarchie de la source ne change pas.

Le transfert ne propose pas de case d'effacement. Le geste qui réaffecte puis
supprime une source est la fusion.

### 2.2 Fusionner

- Tous les codages de la source deviennent des codages de la cible.
- La source disparaît du codebook.
- Les enfants directs de la source deviennent des enfants de la cible.
- Une cible située dans le sous-arbre de la source est refusée afin d'éviter un
  cycle.
- La cible conserve sa propre position dans l'arbre.

Le récapitulatif annonce le nombre de codages réaffectés, de doublons supprimés
et de sous-thèmes déplacés.

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
une source destinée à être supprimée pour être ensuite promues.

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
transaction.

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
  }>
  totaux: {
    entretiens: number
    passages: number
    orphelins: number
    doublonsPrevisibles: number
  }
  faisable: boolean
  motif?: string
}
```

Le cache d'aperçu :

- appartient au main ;
- est borné et expire ;
- est vidé au changement de corpus ;
- conserve les références et extraits nécessaires à la répartition ;
- ne constitue jamais une autorisation d'écriture.

L'exécution relit les contenus frais. En local et sur GitLab, toute différence
pertinente avec le manifeste refuse l'opération entière et demande un nouvel
aperçu. Sur WebDAV, l'obsolescence est signalée pour l'entretien concerné sans
masquer le résultat des autres entretiens.

### 3.4 Entrées IPC

| Entrée | Rôle |
|---|---|
| `corpus:analyserOperationTheme` | prépare l'aperçu et sa faisabilité |
| `corpus:detailsOperationTheme` | retourne les codages et extraits d'un entretien du même aperçu |
| `corpus:executerOperationTheme` | exécute une demande liée à l'aperçu |
| `corpus:progressionOperationTheme` | événement de progression associé à `operationId` |

Le preload expose aussi une fonction de désabonnement à la progression, sur le
modèle des transferts distants.

### 3.5 Résultats

```ts
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
      corpus: CorpusFichier
      reussis: Array<{ id: string; reaffectes: number; doublonsSupprimes: number }>
      echecs: Array<{ id: string; motif: string }>
    }
  | {
      statut: 'non-appliquee'
      motif: string
    }
  | {
      statut: 'indeterminee'
      operationId: string
      motif: string
    }
```

`partielle` est réservé au parcours WebDAV sans suppression de source.
`indeterminee` couvre une publication dont la réponse a été perdue ou une
réconciliation inachevée. Une erreur technique inattendue peut toujours lever
une exception IPC.

---

## 4. Fraîcheur et fichiers concernés

### 4.1 Inventaire strict

L'analyse ne réutilise pas `chargerEntretiens()` lorsque cette méthode ignore un
fichier absent. Elle construit un inventaire qui nomme :

- les membres absents ;
- les fichiers illisibles ;
- les versions non supportées ;
- les entretiens trop volumineux pour le fournisseur.

Un fichier indisponible bloque toute opération locale ou GitLab. Sur WebDAV, il
est présenté comme un échec explicite et n'est jamais compté comme zéro usage.

### 4.2 Source conservée

Le geste porte sur les entretiens où la source apparaît dans l'instantané de
l'aperçu. Une nouvelle annotation concurrente peut rester sur la source : la
source existe encore, donc aucune référence pendante n'est créée.

### 4.3 Source supprimée

Retirer la définition exige une protection plus large. Un entretien qui
n'utilisait pas la source au moment de l'aperçu pourrait sinon publier une
nouvelle référence pendant l'opération.

Pour une fusion ou une division avec suppression :

- le local travaille dans sa transaction multi-fichiers ;
- GitLab acquiert les droits nécessaires sur tout le membership et relit une
  base fraîche ;
- WebDAV ne propose pas encore ce parcours.

---

## 5. Capacités et classement des gestes

Les trois gestes visibles sont classés séparément. La variante destructive de
la division possède sa propre garde, car `PORTEE_PAR_GESTE` associe une seule
portée statique à chaque geste :

- `theme.transferer` ;
- `theme.fusionner` ;
- `theme.diviser` ;
- `theme.diviser-supprimer-source`, garde supplémentaire lorsque
  `effacerSource === true`.

Deux portées sont ajoutées :

- `themes-reaffectation` : création éventuelle de définitions et modification
  de plusieurs entretiens, source conservée ;
- `themes-reaffectation-suppression` : même opération avec retrait de la source.

Attribution initiale :

| Fournisseur | Réaffectation | Suppression de la source |
|---|---:|---:|
| Local | oui | oui |
| WebDAV | oui, résultat partiel possible | non |
| GitLab | non jusqu'à qualification | non jusqu'à qualification |

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
| transfert vers une cible existante | entretiens uniquement |
| transfert ou division créant des cibles, source conservée | corpus puis entretiens |
| fusion vers une cible existante | entretiens puis corpus final |
| division créant des cibles et supprimant la source | corpus intermédiaire, entretiens, corpus final |

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

### 8.1 Capacité fermée jusqu'à qualification

Les méthodes GitLab sont écrites et testées sur le dépôt simulé, mais les deux
nouvelles portées restent absentes de `PORTEEES_OVERTES_GITLAB` jusqu'à la
qualification à deux comptes.

### 8.2 Décision gardée

Le parcours est :

1. aperçu sans droit sur un SHA résolu ;
2. refus des sessions locales concernées ;
3. acquisition du bail corpus ;
4. acquisition des baux d'entretien dans l'ordre canonique ;
5. résolution d'un nouveau SHA et relecture fraîche ;
6. comparaison avec le manifeste ;
7. mutation pure et vérification des références ;
8. publication en un seul commit ;
9. installation du miroir après confirmation ;
10. libération des droits en ordre inverse.

Pour un transfert ou une division avec source conservée, les baux portent sur
les entretiens concernés. Pour une suppression de source, ils couvrent tout le
membership afin qu'aucune nouvelle référence ne soit publiée pendant la
décision.

Un entretien tenu par un collègue fait échouer l'opération avant le commit de
données. Une session tenue par ce poste est également un refus : elle n'est pas
publiée implicitement par l'opération.

### 8.3 Publication et bornes

Le commit contient :

- le candidat de `corpus.json` lorsqu'il change ;
- les entretiens modifiés sous leur `last_commit_id` ;
- les transitions des droits participant à la publication.

Les limites sont calculées sur le plan réel :

- nombre total d'actions, transitions comprises ;
- taille UTF-8 du corps HTTP complet ;
- limite effective de lecture gardée de chaque entretien ;
- durée restante des baux avant la publication.

Le plan ne promet ni 98 ni 49 entretiens de manière générale. Le nombre accepté
dépend du nombre d'entretiens modifiés, du nombre de droits et de la taille des
contenus. L'aperçu annonce la borne calculée et nomme le premier obstacle.

Un résultat de publication inconnu reste journalisé et retourne
`indeterminee`. Toute opération de définitions suivante est refusée jusqu'à la
réconciliation existante.

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
- coût et bornes du fournisseur.

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
tant qu'un codage du manifeste n'a pas de destination.

### 9.4 Exécution

Pendant l'opération :

- les contrôles de modification sont désactivés ;
- la progression est affichée par `operationId` ;
- aucun bouton d'interruption n'est proposé pendant un commit ou un PUT ;
- quitter le panneau ne transforme pas un résultat inconnu en échec.

Après tout résultat ayant modifié au moins un fichier, y compris un résultat
partiel WebDAV, le renderer appelle `majCodebook` puis `rafraichirUsages`, qui
recalcule également `resumesThematiques`.

---

## 10. Étapes d'implémentation

1. **Décisions et documentation de référence.** Mettre à jour
   `synthese-corpus-onglets.md` avec le contrat local, GitLab et WebDAV retenu.
2. **Gestes et capacités.** Ajouter les portées, gestes et capacités avant les
   handlers.
3. **Cœur pur.** Ajouter les types, validations, inventaires, réaffectations,
   déduplication et transformations de hiérarchie.
4. **Aperçu versionné.** Ajouter le cache main, les détails et les empreintes.
5. **Transaction locale.** Étendre `TransactionsFichiersCorpus` avec le corpus
   intermédiaire et livrer le parcours local complet.
6. **Interface.** Ajouter le panneau, les modales et l'accordéon de répartition.
7. **WebDAV limité.** Ajouter transfert et division sans suppression, avec
   résultats partiels et reprise.
8. **GitLab fermé.** Implémenter la transaction multi-droits et ses bornes sans
   ouvrir les capacités.
9. **Qualification GitLab.** Tester à deux comptes, mesurer les coûts et ouvrir
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
- progression associée au bon `operationId`.

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

- baux acquis dans l'ordre canonique et libérés en ordre inverse ;
- aucun commit de données si un bail manque ;
- refus d'une session locale concernée ;
- commit unique pour le corpus et les entretiens ;
- transitions de tous les droits attendus ;
- manifeste obsolète ;
- contrôle de tout le membership avant suppression de source ;
- limites calculées sur le nombre réel d'actions et la taille du corps ;
- résultat inconnu journalisé puis réconcilié.

### 11.6 Qualification GitLab

Nouveau banc `test/gitlab/qualificationThemes.test.ts` :

- transfert concurrent à deux comptes ;
- refus d'un entretien tenu ;
- fusion avec protection du membership ;
- conflit entre aperçu et décision ;
- limites autour du maximum réellement mesuré ;
- réponse perdue après commit ;
- expiration d'un bail pendant la préparation ;
- reprise après réconciliation.

---

## 12. Documentation à mettre à jour

- `plans/encours/synthese-corpus-onglets.md` : remplacer l'énoncé général par
  les garanties distinctes retenues pour local, WebDAV et GitLab.
- `docs/dev/gestes-fournisseur.md` : nouvelles portées et capacités.
- `docs/dev/gitlab.md` : baux, commit, bornes, résultat inconnu et
  qualification.
- `docs/dev/multi-utilisateur.md` : résultat partiel WebDAV et refus des
  suppressions de source.
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
