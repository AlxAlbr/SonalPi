# Pseudonymisation : adaptation des évolutions V1 à SonalPi V2

**Date :** 8 octobre 2026.  
**Statut :** décisions fonctionnelles validées ; implémentation incrémentale à engager.  
**Priorité :** rapprocher d’abord la présentation du tableau corpus de la V1, puis compléter les comportements sans réintroduire son architecture.

## 1. Objectif et méthode

La V1 de référence est le code actuellement présent dans `../SonalPi`, notamment `modules/Anonymisation/`. Ses derniers changements concernent entre autres le remplacement d’un pseudo corpus, la gestion des portées et l’export des tables de règles.

La comparaison ci-dessous repose sur la lecture du code V1/V2, des modèles, des transactions et des tests existants. **Ce n’est pas encore une recette visuelle dans les applications ni une campagne de tests.** Le guide V1 `anon.md` et certains commentaires V2 ne décrivent pas toujours exactement le code actuel : les comportements à conserver devront être figés par des exemples exécutables.

Deux livraisons distinctes sont proposées :

1. **Une première livraison visible et limitée** : tableau corpus à quatre colonnes, badges, légende, filtres et tri ; pas de nouvelle opération destructive.
2. **La mise à niveau fonctionnelle** : variantes, locuteurs, import/export de règles, renommage et transitions globales de portée, avec garanties locales et distantes.

Hors périmètre : détection automatique de personnes par IA/NER, anonymisation des médias, garantie d’anonymat, reproduction des caches HTML et des variables globales de la V1.

## 2. Comparaison : ce qui existe et ce qui manque

| Sujet | V1 actuelle | V2 actuelle | Évolution proposée |
|---|---|---|---|
| Tableau corpus | Quatre colonnes : entité originale, pseudo éditable, état corpus, actions | Sept colonnes : pastille, entité, pseudo, trois compteurs séparés, actions | Reprendre la hiérarchie visuelle V1 |
| Recherche et navigation | Recherche, filtre d’état, tri entité/pseudo, légende repliable | Recherche entité/pseudo/catégorie, détail à droite, séparateur redimensionnable, retour à l’occurrence | Ajouter filtres/tri/légende ; conserver les acquis V2 |
| État sans usage | Neutre, tiret | `non === 0` suffit actuellement à afficher « tout traité », même sans usage | Distinguer inutilisée, traitée, à traiter, résultat inconnu/périmé |
| Gestion depuis le corpus | Ajout, renommage, dissociation, suppression partout | Création surtout depuis l’entretien ; API de création disponible ; suppression refusée si la règle est utilisée | Ajouter des commandes explicites, pas contourner la garde existante |
| Variantes et alias | Deux pseudos maximum, choix par occurrence, remplacement ciblé ; multi-pseudo en lecture seule au corpus | Modèle `entite[]`/`pseudos[]`, menus et compteurs entretien déjà présents | Préserver les choix ; détail corpus avec pseudo réellement appliqué et compteurs par variante |
| Incluses | Le HTML plat impose une mémoire `data-pseudo-absorbe` | Des annotations imbriquées peuvent rester dans le modèle | Conserver les annotations V2 ; unifier leur interprétation, sans copier la mémoire DOM V1 |
| Portées | Brouillon/document/corpus ; dissociation et promotion pouvant toucher plusieurs entretiens | Brouillons locaux, annotations autonomes ou liées ; déliaison principalement locale | Ajouter les opérations globales avec inventaire et confirmation |
| Locuteurs | Suggestions issues des règles, confirmation/refus, choix de variante, indicateur corpus même sans occurrence textuelle | `Locuteur.pseudo` et `pseudoEtat`, rendu/export/import existants ; saisie directe et rapprochement facultatif par `Personne` | Conserver la séparation V2 : saisie dans le panneau Locuteurs, sans règle textuelle ni suivi dans le panneau Pseudonymisation |
| Tables de correspondance | JSON réimportable ; export corpus seul ou enrichi des entretiens, filtrable par thématique | Import `.sonal`/migration `.crp` présents, mais pas ce parcours dédié dans le panneau | Ajouter un export V2 typé et paramétrable, plus un export compatible V1 explicitement aplati |
| Exports pseudonymisés | Contrôle d’intégrité bloquant sur un marquage invalide ; nettoyage des libellés et métadonnées techniques | Plusieurs protections déjà présentes, rapport de pseudonymisation ; une annotation sans pseudo peut rester en clair avec avertissement | Auditer les sorties et imposer une revue guidée de chaque annotation invalide avant export |
| Collaboration | Orchestration propre aux fichiers/caches V1 | Local, WebDAV/Nextcloud et GitLab, sessions, droits et publications conditionnelles | Adapter chaque nouveau geste au fournisseur ; aucune écriture directe depuis Vue |

### Points précis à sécuriser, repérés dans le code V2

Ces points sont à transformer en tests de caractérisation avant correction :

- Le détail corpus affiche `regle.pseudos[0]` pour toute occurrence anonymisée, sans transporter sa variante réelle dans `OccurrenceScan`.
- `instructionsValiderAnon` réétiquette toutes les occurrences anonymisées de la ligne avec le pseudo reçu : une validation peut donc aplatir les choix de variantes.
- Scan agrégé, scan détaillé et compteurs entretien suivent des chemins distincts ; l’annotation englobante retenue et le recours au pseudo comme indice peuvent produire des différences.
- `poserDansPlages` interprète actuellement une liste vide comme « tout appliquer ». Un diff qui ne demande que des retraits/exceptions doit au contraire garantir **zéro pose non demandée**.
- Les positions du détail peuvent provenir d’un miroir plus ancien que l’entretien relu sous verrou. Elles ne constituent pas, seules, une preuve que la cible est encore la bonne.
- La sélection d’une autre règle réinitialise directement les changements locaux ; le dépliage recharge les détails. Étendre la garde existante à ces parcours et aux actualisations/tirages.
- Le bilan de validation reprend des compteurs d’intention du diff, alors que le résultat du lot ne fournit qu’un total par entretien. Afficher des nombres issus des mutations réellement obtenues.
- `construireTabAnon` exporte notamment `r.entite[0]` : vérifier la conservation de tous les alias, des portées locales et des catégories lors des échanges avec la V1.

## 3. Architecture cible : conserver la V2

### 3.1 Sources de vérité

- `corpus.json.reglesAnon` reste la source des **règles partagées**, identifiées par un ID stable. Ne pas reconstruire implicitement ces règles à l’ouverture du panneau depuis l’union des entretiens.
- Les annotations des fichiers d’entretien restent la source des **décisions par occurrence** : plage, état, pseudo choisi et éventuel lien `regle`.
- `Annotation.pseudo` doit rester capable de porter la variante réellement choisie. Ne pas le remplacer par une lecture systématique du premier pseudo corpus.
- Les annotations imbriquées sont conservées : le retrait d’une englobante peut révéler les décisions internes sans recréer artificiellement des occurrences.
- Les décisions sur les étiquettes restent dans les `Locuteur`. Ne pas fusionner identité transverse (`Personne`), règle de pseudonymisation et libellé local.
- Les inclusions, compteurs et états de scan sont **dérivés**. Aucun cache positionnel V1 n’est importé comme vérité.

**Point de conception important :** une dissociation globale doit conserver dans chaque entretien concerné la définition locale complète : alias ou variantes déclarés, y compris sans occurrence actuelle, et catégorie. L’invariant V1 est conservé : une règle peut être multi-alias avec un seul pseudo, ou mono-entité avec deux pseudos maximum, jamais les deux à la fois. Le modèle V2 actuel ne garantit pas toute cette mémoire locale. Inventorier ce qui peut être reconstruit depuis les annotations et `pseudosDeclares`, puis n’ajouter qu’une déclaration locale minimale, sans recopier un `tabAnon` complet et ses compteurs.

Les pseudonymes de locuteurs restent indépendants des règles textuelles. Ne pas ajouter de lien règle→locuteur. Le rapprochement facultatif par `Personne` peut proposer de reprendre ponctuellement le pseudo d’un autre entretien, sans synchronisation ultérieure.

### 3.2 Répartition des responsabilités

| Couche | Responsabilités |
|---|---|
| `src/shared/entretien/anon/` | Détection/classification commune, validation, renommage ciblé, conservation des variantes et incluses |
| `src/shared/entretien/locuteurs.ts` | Saisie directe des pseudonymes de locuteurs et reprise facultative lors d’un rapprochement de `Personne` |
| `src/shared/corpus/reglesAnon.ts`, `scanAnon.ts` | Règles, collisions d’alias, inventaires d’usage, résultats de scan et filtres purs |
| Nouveaux modules ciblés sous `src/shared/corpus/` | Préparation pure des commandes globales et conversion des tables de correspondance, si leur volume justifie une séparation |
| `src/main/corpusStore.ts` et services dédiés | Lecture fraîche, validation, préparation des fichiers et persistance |
| `src/main/distant/`, `src/main/gitlab/` | Droits, sessions, publication, reprise et résultats par fournisseur |
| `src/preload/index.ts`, `src/main/index.ts` | Contrats IPC typés et dispatch des commandes |
| Composables Vue | État d’édition, gardes, appels IPC, actualisation |
| Composants Vue | Rendu, accessibilité, interactions ; aucun moteur de mutation du corpus |

Extraire progressivement du gros `PseudonymisationCorpus.vue` une table, un rendu de badges et le détail d’une règle. Ne pas entreprendre une refonte générale des composables ou du store pour ce seul chantier.

## 4. Présentation cible du tableau corpus

### 4.1 Organisation

Conserver l’onglet corpus de la V2, sans reproduire une fenêtre plein écran indépendante :

```text
Pseudonymisation                Actualiser | Import règles | Export règles | ⚙

┌ Légende et aide repliables ──────────────────────┐
│ Filtre d’état | Rechercher… | N / total | Ajouter │
├────────────────┬────────────────┬─────────┬──────┤   Détail de la règle
│ Entité         │ Pseudonyme /   │ État   │Actions│   Entretiens / occurrences
│ originale ↕    │ remplacement ↕│ corpus │      │   texte uniquement
├────────────────┼────────────────┼─────────┼──────┤
│ Lyon           │ ville / cité  │ 🟢 🟠  │ 🔍 … │   Valider / Abandonner
└────────────────┴────────────────┴─────────┴──────┘
                    séparateur redimensionnable
```

Les boutons d’import, d’ajout, d’édition et d’actions globales sont raccordés dans leurs lots respectifs : **pas de faux contrôles actifs avant que le comportement soit disponible**.

### 4.2 Spécification visuelle

- **Entité originale** : texte gris italique, complet dans une infobulle ; au-delà de douze mots, présentation « six premiers […] six derniers » comme la V1. La valeur métier reste toujours entière.
- **Pseudonyme / remplacement** : bleu, gras, retour visuel à la ligne. Après raccordement du renommage : champ ajustant sa hauteur, validation par Entrée, annulation par Échap ; la perte de focus propose la validation, sans publication globale silencieuse.
- **État corpus** : badges regroupés, non nuls, verts pour les anonymisées, gris pour les exceptions, orange pour les restes à traiter. Variantes distinguées et nommées dans les infobulles ; incluses signalées sans gonfler les compteurs.
- **Actions** : loupe, puis dissociation et suppression quand elles sont disponibles ; badge de catégorie sous les boutons, à la manière de la V1.
- Fond orange s’il reste du texte à traiter ; vert si des usages textuels existent et sont résolus ; neutre si la règle est inutilisée. Un scan absent ou en erreur n’est jamais présenté comme un succès.
- La sélection est signalée par une bordure/accent, sans faire disparaître la couleur d’état.
- En-têtes fixes, défilements indépendants, actions atteignables ; taille calculée sur l’espace disponible plutôt que plafonnement systématique à `72vh / 760px`.
- Conserver le séparateur mémorisé et accessible au clavier, ainsi que la disposition verticale sur petit écran. Tester zoom, pseudos longs et badges à plusieurs chiffres.
- Boutons et badges ont des noms accessibles ; statut compréhensible sans la couleur ; tri avec `aria-sort` et usage clavier.

### 4.3 Filtres et comportement

- Tri français ascendant/descendant sur entité et pseudo, entité A→Z par défaut.
- Recherche sur les **valeurs complètes**, combinable avec le filtre d’état et les catégories déjà disponibles.
- Filtres : toutes, à traiter, avec exceptions, entièrement traitées, inutilisées, collisions de pseudo ; divergences seulement si elles sont réellement identifiées.
- Un pseudo partagé par deux entités est autorisé et signalé comme collision, sans proposition de fusion en alias. Deux variantes déclarées d’une règle ne sont pas un conflit.
- Afficher les règles avant la fin du scan lorsque possible ; état en attente, actualisation manuelle et indication de péremption. Conserver le dernier résultat lisible en cas d’échec.
- Filtrage et tri sans lecture des fichiers ; un changement de catégorie ne doit pas imposer un rescan complet des textes.
- Garder sélection, filtre, tri et défilement lors d’un aller-retour vers l’entretien. Toute perte potentielle d’édition passe par « Valider / Abandonner / Rester ».

## 5. Plan d’implémentation par lots

### Lot 0 — Fixer les contrats et la recette de référence

**Travaux**

- Préparer un petit corpus synthétique commun V1/V2 : une règle multi-alias, une autre à deux pseudos, pseudo partagé entre entités, exceptions, incluses, règle inutilisée, locuteur seul, règle locale et brouillon.
- Capturer le tableau V1 et sa cible V2 sur le même jeu de données, à largeur normale et réduite ; valider visuellement la proposition avant finition CSS.
- Écrire les tests de caractérisation des écarts listés en section 2.
- Encoder dans les contrats et exemples exécutables toutes les décisions validées en section 8, ainsi que les ajouts minimaux au format.

**Sortie attendue :** grille de parité acceptée, exemples reproductibles et règles de mutation explicites. Pas de copie de données réelles sensibles dans les fixtures.

### Lot 1 — Tableau corpus proche de la V1, sans mutation globale nouvelle

**Travaux**

- Recomposer les quatre colonnes, la barre filtre/recherche/compteur et la légende.
- Introduire un composant de badges réutilisable entre table et détail.
- Ajouter tri et filtres purs ; corriger l’état neutre des règles sans usage.
- Conserver les gardes, droits et états de chargement V2 ; étendre la garde aux changements de règle/détail et gérer les réponses asynchrones devenues obsolètes.
- Empêcher un scan démarré sur un ancien corpus de remplir le panneau après changement de corpus.

**Fichiers principaux :** `src/renderer/components/corpus/PseudonymisationCorpus.vue`, `src/renderer/composables/corpus/useAnonymisationCorpus.ts`, modules de présentation purs/tests associés.

**Acceptation :** présentation identifiable à la V1, aucun bouton inaccessible, aucune règle inutilisée verte par défaut, aucune modification en attente perdue en navigation. Les capacités absentes restent clairement absentes, pas simulées.

### Lot 2 — Cohérence du moteur et détail fiable

**Travaux**

- Mutualiser la classification des occurrences pour les scans agrégés/détaillés et les compteurs entretien, sans imposer les structures DOM de la V1.
- Retenir l’identité de l’entité et la couverture réelle, jamais la seule égalité de pseudo ; dédupliquer les matchs d’alias par plage.
- Transporter variante réelle, éventuelle annotation cible, cause d’inclusion et possibilité d’action dans le détail.
- Distinguer application des restes à traiter et renommage d’une variante. Valider une ligne ne doit pas réinitialiser les variantes existantes.
- Rendre explicite « toutes les occurrences » ; une liste vide signifie « aucune ». Calculer un diff complet cohérent, y compris exception retirée puis occurrence anonymisée dans la même validation.
- Vérifier version/empreinte et état attendu des cibles après lecture fraîche ; refuser les positions périmées plutôt que modifier une autre occurrence.
- Ajouter des résultats structurés par action et par entretien ; conserver les intentions en échec sans rejouer les succès.
- Protéger une exception interne par défaut. Avant de poser une annotation englobante, demander explicitement si elle doit la couvrir ; conserver l’exception imbriquée afin qu’elle réapparaisse si l’englobante est retirée.

**Fichiers principaux :** `src/shared/corpus/scanAnon.ts`, `src/shared/entretien/anon/{anonymisation,applicationMasse,compteursAnon,brouillonsAnon}.ts`, composable entretien, contrats de lot et leurs appelants main.

**Acceptation :** mêmes compteurs et variantes dans les deux vues ; aucune pose implicite lors d’un retrait ; cible périmée refusée ; aucune altération d’une autre entité partageant le pseudo ; exception interne jamais couverte sans confirmation.

### Lot 3 — Locuteurs indépendants et cohérence inter-entretiens

**Travaux**

- Conserver la saisie directe du pseudo dans le panneau Locuteurs. Le panneau Pseudonymisation et son scan restent strictement textuels.
- Conserver le rapprochement existant par `Personne` : lorsqu’un nom déjà rencontré est identifié, l’utilisateur peut reprendre ponctuellement le pseudonyme et le statut d’un autre entretien.
- Ne créer aucune règle corpus de locuteur et ne synchroniser aucun pseudo automatiquement après cette reprise.
- Préparer un inventaire pur des correspondances de locuteurs pour l’export : dédupliquer les mêmes couples nom/pseudo, conserver leur provenance et signaler les divergences entre entretiens.
- Exclure les pseudonymes de locuteurs des renommages, dissociations, suppressions et collisions de règles textuelles.
- Vérifier la persistance et les sorties existantes, y compris le cas d’un locuteur sans tour de parole.

**Fichiers principaux :** `src/shared/entretien/locuteurs.ts`, `src/shared/corpus/personnes.ts`, `useLocuteursEntretien.ts` et modules purs d’inventaire des correspondances.

**Acceptation :** la reprise d’un pseudo reste facultative et ponctuelle ; deux entretiens ne sont jamais modifiés par synchronisation implicite ; une divergence de pseudonyme pour une même `Personne` est visible à l’export.

### Lot 4 — Ajouter, importer et exporter les règles

**Travaux**

- Ajouter une règle depuis le corpus, y compris quand le tableau est vide. La création seule ne pseudonymise aucun texte : elle lance le scan et fait apparaître les occurrences à traiter.
- Mutualiser validation/déduplication : casse, alias, ensembles de pseudos, maximum de deux et collisions partielles d’alias ; ne pas abandonner silencieusement les alias non communs.
- Faire respecter l’invariant V1 : multi-alias avec un pseudo, ou mono-entité avec au plus deux pseudos. Une entrée combinant les deux est invalide et passe par une résolution explicite, avec choix assistés ; aucune troncature ni séparation silencieuse.
- Importer un ou plusieurs JSON avec aperçu : ajouts, identiques, divergences et lignes invalides. Pour une divergence, proposer « Ignorer », « Ajouter comme seconde variante » ou « Remplacer », avec « Ignorer » sélectionné par défaut.
- Accepter le format V1 `{entite_init, entite_pseudo, entite_pseudo_alt?, thematique?}` ; préserver les groupes d’alias et mapper les catégories.
- Pour les correspondances V2 de locuteurs, identifier les locuteurs de même nom, afficher un aperçu par entretien et n’appliquer leur pseudo qu’après confirmation. Ne jamais les convertir en règles textuelles.
- Concevoir la modale d’export autour de quatre choix :
  1. toutes les règles ou seulement les règles utilisées ;
  2. corpus uniquement ou corpus et entretiens ;
  3. texte, locuteurs, ou texte et locuteurs ;
  4. avec ou sans catégories disponibles.
- Rendre les choix conditionnels : « Locuteurs » implique la lecture des entretiens ; pour « Texte uniquement », le périmètre corpus ou corpus+entretiens reste libre. Afficher un aperçu avec les effectifs par provenance.
- Valeurs par défaut : règles utilisées, corpus+entretiens, texte+locuteurs et catégories présentes.
- Définir « utilisée » comme une correspondance produisant réellement un pseudo : occurrence textuelle valide, anonymisée et visible, ou pseudo de locuteur explicitement renseigné. Les occurrences à traiter, exceptions et annotations seulement masquées par une englobante ne comptent pas.
- Exporter par défaut un format V2 typé conservant les provenances `corpus`, `texte local` et `locuteur`. Proposer une action distincte « Export compatible V1 », aplatie et accompagnée d’un avertissement sur ses limites.
- Reconstruire les correspondances locales depuis les annotations, leur mémoire déclarative et les locuteurs, sans créer de règles corpus pour exporter. Autoriser ce périmètre même si le corpus n’a aucune règle partagée.
- Signaler les divergences entre entretiens au lieu de perdre silencieusement une variante. Dédupliquer les couples locuteur/pseudo identiques et afficher leurs nombres d’entretiens.
- Avertir que la table de correspondance contient les identités originales : ce n’est pas un fichier pseudonymisé à diffuser librement.

**Acceptation :** export V2→import V2 sans perte de provenance, d’alias, de variantes ni de catégories ; export V1 explicitement aplati ; annulation sans écriture ; import de règles sans mutation automatique des entretiens ; import de locuteurs uniquement après confirmation.

### Lot 5 — Renommage et gestion globale des portées

Créer des commandes distinctes, chacune précédée d’un inventaire frais :

| Commande | Effet attendu |
|---|---|
| Renommer une variante | Remplacer uniquement l’ancienne variante des usages textuels attribués à cette règle ; conserver états et portées, sans appliquer les occurrences en attente |
| Dissocier du corpus | Opération globale uniquement : convertir tous les usages concernés en définitions locales complètes, puis retirer la règle partagée |
| Supprimer partout | Retirer les décisions textuelles attribuées à la règle et restaurer leur texte ; préserver les décisions indépendantes et rendre compte des incluses révélées |
| Promouvoir au corpus | Inventorier les usages textuels locaux compatibles et proposer leur rattachement ; signaler les divergences et brouillons incomplets |

**Travaux**

- Préparer un aperçu avec entretiens, texte, exceptions, incluses, divergences et droits. Les locuteurs restent hors de ces commandes.
- Renommage `A/B → A/C` : seules les occurrences `B` deviennent `C` ; aucune nouvelle occurrence n’est traitée. Les exceptions restent dans leur état.
- Ajout/retrait de variante : commandes distinctes du renommage ambigu. Si une variante utilisée disparaît, inventorier ses usages et proposer explicitement leur repli sur la variante restante avant la suppression.
- La transition corpus→entretien depuis un entretien déclenche la même dissociation globale que le panneau corpus. Ne proposer aucun détachement du seul entretien ouvert.
- Lors d’une dissociation, conserver localement la définition complète valide — alias ou variantes et catégorie — même si une partie n’est pas utilisée dans un entretien donné.
- Refuser ou faire résoudre une collision avec une déclaration locale indépendante ; ne jamais la réécrire automatiquement.
- Prendre en compte l’entretien ouvert et ses changements non encore publiés : vider/valider l’autosave, utiliser les mécanismes de session existants, empêcher une sauvegarde tardive de republier l’ancienne règle.
- Brancher les boutons de ligne et partager les mêmes commandes avec les dialogues de conflit de l’entretien.

**Acceptation :** annuler ne modifie rien ; une opération n’applique pas les occurrences en attente ; choix de variantes conservés ; aucune dissociation locale isolée ; aucune référence pendante après suppression ; aucun pseudo de locuteur modifié ; bilan exact et reprise possible après interruption.

### Lot 6 — Compatibilité V1 et sécurité des sorties

**Travaux**

- Compléter import `.sonal`, migration `.crp` et export rééditable : alias complets, variantes déclarées, catégories, portées document/corpus/brouillon, locuteurs et états inclus.
- Traduire la mémoire d’absorption V1 vers des annotations V2 uniquement quand les données permettent une reconstruction fiable ; diagnostiquer les cas incomplets plutôt qu’inventer une occurrence.
- Ne pas réutiliser les anciens indices `matchPositions` ni les anciens nombres d’occurrences comme preuve d’application.
- Auditer TXT, HTML, SRT/VTT, DOCX, `.sonal`, export corpus, copie, extraits, synthèses et recueils réellement disponibles dans la V2.
- Vérifier la couverture d’une sélection coupant une annotation et la non-divulgation par attributs, tables sérialisées ou chemins média.
- Avant un export pseudonymisé, présenter chaque annotation invalide ou sans pseudo exploitable dans une revue guidée. Proposer « Laisser en clair » ou « Corriger la pseudonymisation » ; pour une plage orpheline, ouvrir l’entretien à proximité afin de sélectionner à nouveau le texte. L’export ne commence qu’après résolution explicite de tous les cas.
- Conserver les exceptions et noms volontairement en clair, ainsi que le rapport sur les champs libres ; ne pas prétendre pseudonymiser automatiquement notes, titres ou valeurs libres.
- Garder les recueils V2 à références de passages et leur `modeTexte`, plutôt que copier les instantanés plats de la V1. Distinguer les textes libres, qui ne se recalculent pas.
- Mettre à jour `docs/dev/modele-objet.md`, les guides utilisateur et les commentaires devenus inexacts.

**Acceptation :** allers-retours représentatifs sans perte silencieuse ; aucune mutation des sources par l’export ; défaut détecté avant toute écriture du lot pseudonymisé concerné.

## 6. Garanties des opérations globales : un lot ne vaut pas une transaction

L’écriture atomique d’un fichier ne rend pas atomique une modification de dix entretiens et du corpus. Ne pas réutiliser sans adaptation la boucle actuelle d’application de règles.

- **Commun** : inventaire → confirmation → revalidation des versions/droits → préparation → publication → bilan. Une évolution entre aperçu et validation impose un nouvel examen ou un refus explicite.
- **Local** : réutiliser les mécanismes de transactions de fichiers/journal et leur reprise. Préparer toutes les mutations avant écriture ; ne pas se contenter de sauvegardes `.bak` indépendantes.
- **GitLab** : enregistrer les nouveaux gestes dans `politiqueGestes.ts`, adapter contrats et services ; employer les gardes de versions et la publication multi-fichiers existantes lorsque compatibles avec les limites de taille et les sessions. Sinon refuser ou proposer un parcours de reprise explicite, jamais annoncer une atomicité inexistante.
- **WebDAV/Nextcloud** : aucune atomicité multi-fichiers présumée. Prévoir verrouillage canonique corpus→entretiens, relecture fraîche, écritures conditionnelles et journal de progression/reprise. Une compensation ne peut écraser une modification concurrente.
- **Suppression/dissociation** : la dissociation est globale, jamais limitée silencieusement à l’entretien ouvert. Ne retirer la définition qu’après préparation des définitions locales et contrôle de l’absence de références restantes. En cas d’échec partiel, conserver une situation récupérable et expliquer les étapes restantes.
- **Renommage** : définir la représentation cohérente pendant une éventuelle publication partielle. Toute opération globale reste désactivée, avec motif visible, sur un fournisseur tant que son protocole de version, publication et reprise n’est pas démontré par les tests.
- **Accès** : garde dans le main aussi bien que dans l’UI ; lecture seule/hors ligne/verrou tiers clairement expliqués. Lecture et export restent disponibles quand ils sont autorisés.
- **Confidentialité** : journaux et erreurs techniques sans texte d’entretien ni table de correspondance ; diagnostics par identifiants et positions.

## 7. Validation et tests

### Tests unitaires et de services

Étendre en priorité :

- `test/{anonymisation,scanAnon,compteursAnon,brouillonsAnon,pseudos,multiAlias,pseudonymisationCorpus}.test.ts` ;
- `test/{locuteurs,importSonal,migrationCrp,exportSonal,exportSonalGolden,pseudonymisationExport,exportSecu}.test.ts` ;
- `test/transactionsFichiers.test.ts`, `test/webdav/transactions.test.ts`, `test/gitlab/transactions.test.ts`.

Ajouter des suites ciblées pour le renommage, la dissociation/promotion et les tables de correspondance. Les scénarios du test V1 `tests/anonymisation-remplacement-corpus.test.cjs` servent de référence comportementale, pas de code à transplanter.

**Cas indispensables :**

1. Pour une entité unique, variantes `A / B → A / C`, permutation de leur ordre et validation sans changement.
2. Deux entités avec le même pseudo : seule la bonne est modifiée.
3. Alias qui se recouvrent partiellement ; aucune graphie libre perdue ; toute combinaison multi-alias + multi-pseudo est refusée ou soumise à résolution à l’import.
4. Annotation interne et englobante dans les deux ordres, confirmation avant couverture d’une exception, retrait de l’englobante et choix internes restaurés.
5. Locuteur sans tour de parole, reprise facultative du pseudo d’une même `Personne`, divergence entre entretiens et indépendance complète vis-à-vis des règles textuelles.
6. Diff vide, retrait seul, exception seule, exception→anonymisée ; aucune pose parasite.
7. Texte modifié entre scan et validation, règle modifiée après aperçu, résultat périmé reçu après changement de corpus.
8. Annulation, écriture échouée au deuxième entretien, réponse de publication perdue, reprise après redémarrage.
9. Réouverture et import/export avec règles locales, inutilisées, brouillons et incluses.
10. Recherche/tri sur texte complet et état neutre/inconnu correctement distingué.

### Interface et collaboration

- Étendre `e2e/anonymisation.e2e.ts` et les scénarios d’export/locuteurs.
- Captures contrôlées sur corpus synthétique : quatre colonnes, badges, multi-pseudo, entités longues, zoom, petit écran, lecture seule et erreur de scan.
- Tester changement de règle, repli/dépli, actualisation, sortie de l’onglet et aller-retour occurrence avec changements en attente.
- Tester deux utilisateurs : verrou tiers, modification concurrente, session locale sale, refus de version ; conserver les succès d’un lot indépendant sans masquer les échecs.
- Avant tout test réel GitLab/Nextcloud, appeler **`preparer_bancs_docker`** pour les seuls bancs requis. Aucun pull, provisioning ou boucle de readiness maison.

Commandes de base : `npm run typecheck`, tests Vitest ciblés, puis `npm test` et Playwright ciblé (`npm run test:e2e -- e2e/anonymisation.e2e.ts`). Les bancs réels se lancent séparément après préparation.

## 8. Décisions validées

1. **Présentation :** quatre colonnes et badges proches de la V1, dans l’onglet et la navigation V2.
2. **Multi-pseudo au corpus :** détail corpus en lecture seule pour l’application ; choix des variantes dans l’entretien. Le renommage global d’une variante reste une commande distincte et protégée.
3. **Invariant des règles :** multi-alias avec un pseudo, ou mono-entité avec deux pseudos maximum ; jamais les deux simultanément. Une donnée importée qui enfreint cette règle exige une résolution explicite.
4. **Locuteurs :** saisie directe dans le panneau Locuteurs, sans suggestion issue des règles textuelles. Le rapprochement par `Personne` peut proposer une reprise ponctuelle du pseudo existant, sans règle corpus ni synchronisation automatique.
5. **Indépendance des locuteurs :** renommage, dissociation, suppression et collision des règles textuelles n’affectent jamais les pseudonymes de locuteurs.
6. **Dissociation :** opération globale comme dans la V1. Tous les usages concernés deviennent locaux et la règle disparaît du corpus ; aucun détachement du seul entretien ouvert.
7. **Mémoire locale après dissociation :** conserver la définition complète valide — alias ou variantes, plus catégorie — même si certaines valeurs ne sont pas utilisées dans chaque entretien.
8. **Exceptions incluses :** protection par défaut, puis confirmation explicite avant couverture par une annotation englobante. L’exception interne reste mémorisée et peut réapparaître.
9. **Annotation invalide à l’export :** revue guidée cas par cas avec choix « Laisser en clair » ou « Corriger la pseudonymisation » ; aucun export avant résolution de tous les cas.
10. **Suppression d’une variante utilisée :** inventaire puis proposition explicite de repli sur la variante restante.
11. **Renommage d’un pseudo corpus :** modifier uniquement les usages textuels déjà pseudonymisés et liés à la règle ; ne pas appliquer les occurrences en attente.
12. **Collision de pseudo :** autoriser plusieurs entités à partager un pseudo et afficher un signalement, sans proposition de fusion en alias.
13. **Création au corpus :** créer uniquement la définition, lancer le scan et présenter les occurrences à traiter ; aucune mutation automatique des entretiens.
14. **Import divergent :** résolution par ligne avec « Ignorer », « Ajouter comme seconde variante » ou « Remplacer » ; « Ignorer » par défaut.
15. **Import de locuteurs :** aperçu par entretien et confirmation avant application ; aucune création de règle textuelle.
16. **Export des correspondances :** modale à quatre choix — toutes/utilisées, corpus/corpus+entretiens, texte/locuteurs/les deux, catégories incluses/non. Les dépendances impossibles sont expliquées ou désactivées et un aperçu chiffré précède l’écriture.
17. **Valeurs d’export par défaut :** règles utilisées, corpus+entretiens, texte+locuteurs et catégories lorsqu’elles existent. Une règle « utilisée » produit effectivement un pseudo ; les attentes, exceptions et inclusions masquées seules ne comptent pas.
18. **Formats de correspondance :** V2 typé par défaut, conservant portée et nature ; action séparée pour un export V1 aplati avec avertissement.
19. **Fournisseurs distants :** une opération globale reste désactivée avec motif visible tant que sa publication et sa reprise sûres ne sont pas démontrées.
20. **Livraison :** avancement incrémental, avec validation après le tableau visuel et les corrections du moteur avant les lots d’échange et d’opérations globales.

## 9. Ordre de livraison conseillé

```text
Lot 0 : référence et contrats
  └─ Lot 1 : tableau visuel + filtres + gardes       ← première livraison
       └─ Lot 2 : moteur/diff fiables
            ├─ Lot 3 : locuteurs indépendants
            └─ Lot 4 : ajout/import/export de règles
                 └─ Lot 5 : opérations globales protégées
                      └─ Lot 6 : clôture compatibilité et exports
```

Les tests de migration et de sécurité commencent dès le lot 0 et accompagnent les autres lots : le lot 6 clôture la recette, il ne repousse pas les protections à la fin.

**Risque dominant :** les opérations globales multi-utilisateur, pas la mise en forme du tableau. Il est donc possible de livrer rapidement une présentation proche de la V1, sans attendre ni précipiter ces opérations.

## 10. Références principales consultées

- V1 : `modules/Anonymisation/{tableau_global,anon-styles,anon-scan,anon-correspondance}.js`, `anon.md`, test de remplacement corpus.
- V2 interface : `src/renderer/components/corpus/PseudonymisationCorpus.vue`, `useAnonymisationCorpus.ts`, `useAnonymisationEntretien.ts`, `useLocuteursEntretien.ts`.
- V2 domaine : `src/shared/corpus/{reglesAnon,scanAnon}.ts`, `src/shared/entretien/anon/`, `annotation.ts`, `locuteurs.ts`, `format.ts`, `src/shared/corpus/recueils.ts`.
- V2 persistance : `src/main/corpusStore.ts`, `src/main/distant/transactions.ts`, `src/main/gitlab/{transactions,contexte,politiqueGestes}.ts`, pont IPC.
- V2 échanges/sorties : `src/renderer/formatSonal/{importSonal,exportSonal}.ts`, `src/shared/corpus/migrationCrp.ts`, `src/shared/export/{projectionEntretien,pseudonymisation,formatsTexte}.ts`, `src/renderer/editor/passages.ts`.
- Documentation : `docs/dev/{architecture,modele-objet,multi-utilisateur,gestes-fournisseur}.md`.
