# Synthèse — onglets du corpus et suites possibles

> Ce document est la référence durable pour les onglets du corpus. Il décrit le
> socle réalisé, les décisions à conserver et les évolutions possibles, classées
> du travail le plus simple aux chantiers qu’il vaut mieux éviter. Il est conçu
> pour rester compréhensible sans les anciens plans propres à chaque onglet.

## 1. Décision générale

La première tranche d’harmonisation est réalisée. La barre du corpus, les
projections principales et leurs états de fraîcheur forment désormais un socle
cohérent.

La suite ne doit pas rechercher une parité fonctionnelle artificielle entre les
onglets. La bonne cible est une **parité de parcours** :

- chaque projection peut être consultée sur le corpus local ou son miroir ;
- le bouton global **Actualiser** renouvelle la projection active après un tirage
  distant réussi ;
- un ancien résultat reste visible si sa relecture échoue ;
- les indisponibilités partielles ne bloquent pas tout l’onglet ;
- les capacités d’écriture et d’annulation sont annoncées sans ambiguïté ;
- lorsqu’une édition directe n’est pas sûre, l’utilisateur ouvre l’entretien et
  réutilise son verrou existant.

Il faut distinguer trois familles d’écriture distante, par coût croissant :

1. une définition dans `corpus.json` ;
2. un objet contenu dans un seul entretien ;
3. une opération portant sur plusieurs entretiens.

Les deux premières peuvent recevoir des transactions ciblées. La troisième ne
bénéficie pas d’un commit atomique WebDAV et doit conserver une sémantique de
succès partiel explicite. Une annulation distante est toujours une nouvelle
transaction ; ce n’est jamais un retour local dans le temps.

## 2. Socle désormais acquis

### 2.1 Navigation

L’ordre de référence est :

1. **Accueil** ;
2. **Notes** ;
3. **Personnes** ;
4. **Pseudonymisation** ;
5. **Thèmes** ;
6. **Données** ;
7. **Journal** ;
8. **Pas à pas**, uniquement en démonstration.

Les onglets de travail larges — Notes, Personnes, Données et
Pseudonymisation — masquent les cartes d’entretiens. Accueil, Thèmes, Recherche,
Journal et Pas à pas utilisent la grille historique avec les cartes.

L’ouverture puis la fermeture d’un entretien conserve l’onglet corpus actif.
Les composants de travail restent montés : filtres, tri, mode, sélection,
largeur et position de lecture peuvent donc survivre à la navigation dans le
même corpus sans devenir des préférences persistantes.

### 2.2 Contrat commun de fraîcheur

Notes, Personnes, Données et Pseudonymisation suivent les règles suivantes :

- au premier accès sans résultat, afficher un état discret `Chargement…` dans la
  zone de contenu ;
- pendant une relecture, conserver le résultat courant et signaler l’activité
  par le bouton désactivé ou `aria-busy` ;
- après réussite, remplacer le résultat sans toast ni message de confirmation ;
- après échec avec un résultat antérieur, conserver ce résultat et indiquer
  qu’il peut ne plus être à jour ;
- après échec sans résultat antérieur, afficher l’erreur avec **Réessayer** ;
- pour un inventaire partiel, afficher un résumé non bloquant et placer le
  détail dans un élément repliable ;
- retirer l’ancien avertissement à la réussite suivante ;
- dédupliquer les chargements concurrents ;
- après un tirage distant réussi, ne déclencher qu’une relecture de la
  projection active.

Les erreurs de Notes, Personnes et Pseudonymisation restent locales à leur
panneau. Données conserve la bannière globale existante. Une même erreur ne doit
jamais être affichée aux deux endroits.

### 2.3 Capacités visibles

Les termes suivants doivent rester stables dans l’interface et la
documentation :

- **consultation distante** : lecture du dernier miroir disponible et
  actualisation globale ;
- **édition dans l’entretien** : ouverture de l’entretien sous son verrou ;
- **édition depuis le corpus** : commande directe, seulement lorsqu’une
  transaction dédiée existe.

Un onglet n’est pas incomplet parce qu’il s’arrête au premier ou au deuxième
niveau.

### 2.4 Journal du corpus

Le Journal du corpus est un outil d’annulation de la session courante, pas un
historique d’audit :

- il conserve au plus dix actions prises en charge, les plus récentes en tête ;
- il est en mémoire du main process, jamais dans `corpus.json`, les entretiens,
  les réglages ou les exports ;
- il survit aux changements d’onglet et à un aller-retour dans un entretien du
  même corpus ;
- il est vidé au changement de corpus et au redémarrage ;
- une cible modifiée depuis rend l’entrée inapplicable sans écrasement ;
- un obstacle temporaire peut bloquer une entrée sans la retirer ;
- une annulation réussie retire l’entrée et n’en crée pas une nouvelle ;
- une commande échouée, sans changement, non couverte ou partiellement réussie
  ne crée aucune entrée.

Le Journal visible est distinct du journal technique qui permet de reprendre
une transaction locale multi-fichiers interrompue. Une transaction peut assurer
l’intégrité d’une commande sans que cette commande devienne annulable dans
l’interface.

### 2.5 Notes

L’onglet Notes agrège les notes sans charger les entretiens complets dans le
renderer. Le socle comprend :

- une projection main avec entretiens indisponibles nommés ;
- les modes Cartes, Tableau et Feuille en lecture ;
- recherche simple, filtres, tris et filtres rapides ;
- résolution des liens de commentaires dans le même entretien ;
- sanitisation avant tout `v-html` ;
- export Markdown des seules notes filtrées, sans HTML brut ;
- modification locale atomique d’une note existante par une modale limitée au
  titre, au corps, à la catégorie existante, à la date et au statut ;
- suppression locale avec confirmation et renumérotation des rangs ;
- détection des validations sans changement et des brouillons obsolètes ;
- annulation locale exacte de la modification ou de la suppression par le
  Journal, avec rafraîchissement de Notes et Personnes ;
- consultation du miroir distant, badge de verrou et ouverture de l’entretien ;
- refus de l’édition directe distante dans le renderer **et** dans l’IPC.

Aucun champ persistant n’a été ajouté : pas d’historique par note, pas d’auteur
introduit pour les besoins du Journal, pas d’index de dernière modification dans
`corpus.json`, pas de préférence Notes dans `settings.json`.

La création, l’ordre, le rattachement « Concerne », la création de catégories et
la liaison à un commentaire restent des gestes de l’entretien. Cette frontière
évite de reconstruire dans le corpus tout le contexte d’édition d’un entretien.

### 2.6 Personnes

Personnes est l’onglet de référence fonctionnel : répertoire, suggestions
explicables, homonymes, refus révocables, reprises sélectives, corrections,
réunion et séparation sont disponibles. Les corrections distantes simples et
composites passent par des verrous, des lectures fraîches, des ETags et des
résultats partiels nommés.

Ses principes doivent rester valables :

- suggérer, jamais décider en silence ;
- conserver le nom local de chaque locuteur ;
- utiliser des ids stables, jamais le nom comme identité ;
- ne lier au plus qu’un locuteur d’un entretien à une même personne ;
- diagnostiquer les références pendantes sans les supprimer silencieusement ;
- ne pas propager automatiquement un nom, un pseudo ou une valeur ;
- ne pas confondre identité transverse et règle de pseudonymisation.

Cette profondeur répond au besoin propre de Personnes. Elle n’est pas le minimum
à reproduire dans tous les autres onglets.

### 2.7 Données

Données est intégré comme onglet pleine largeur avec :

- panneau Variables et matrice ;
- recherche et choix des colonnes ;
- filtres de portée ;
- séparateur accessible, repli et adaptation aux fenêtres étroites ;
- saisie de cellule, saisie libre, fenêtre de définitions et lots existants ;
- ouverture ou reprise d’un entretien sans perdre le contexte de la matrice ;
- comportement local et distant existant conservé.

La sélection des colonnes est un état de vue. Une collection unique de variables
visibles doit continuer à piloter à la fois le rendu, les états vides et la
navigation clavier, afin qu’une colonne masquée ne reste jamais focalisable.

Données n’alimente pas encore le Journal du corpus. Cette absence ne remet pas
en cause l’intégration de l’onglet.

### 2.8 Pseudonymisation, Thèmes et Journal

Pseudonymisation conserve son moteur spécialisé : scan, détail, brouillon
protégé, garde de sortie et application en masse. Son dernier scan lisible reste
visible après un échec. Les opérations de masse ont déjà leur propre contrat et
ne doivent pas servir de patron minimal aux autres onglets.

Thèmes permet la consultation du codebook et l’accès aux définitions existantes.
Il ne faut pas le confondre avec un futur **atelier thématique** de fusion,
scission, santé du codage ou assistance par IA.

Le Journal reste volontairement partiel. Il couvre les gestes locaux simples de
Personnes et la modification ou suppression locale d’une note depuis le corpus.
Le mode distant explique actuellement que l’annulation des actions corpus n’est
pas disponible.

### 2.9 Repères d’implémentation à conserver

Les principaux points d’entrée sont :

- `src/renderer/components/corpus/Corpus.vue` pour la navigation et
  l’assemblage des panneaux ;
- `NotesCorpus.vue`, `ModaleNoteCorpus.vue` et `useNotesCorpus.ts` pour la vue
  agrégée des notes ;
- `src/shared/corpus/notes.ts` pour la projection, les commandes et l’état
  sémantique attendu d’une note ;
- `PersonnesCorpus.vue` avec `src/shared/corpus/personnes.ts` et
  `rapprochementsPersonnes.ts` pour le répertoire et ses suggestions ;
- `PseudonymisationCorpus.vue` et `src/shared/corpus/scanAnon.ts` pour le scan
  et le brouillon d’application ;
- `src/renderer/components/donnees/TableDonnees.vue` et
  `src/renderer/tableNavigation.ts` pour la matrice ;
- `PanneauJournalCorpus.vue`, `src/main/journalCorpus.ts` et
  `src/shared/corpus/journal.ts` pour le Journal visible ;
- `src/main/corpusStore.ts` pour les projections, commandes locales et inverses ;
- `src/main/distant/transactions.ts` pour les transactions distantes ;
- `src/renderer/composables/useCorpus.ts` pour les révisions de projections et
  leur invalidation ciblée ;
- `src/main/index.ts`, `src/preload/index.ts` et `src/renderer/env.d.ts` pour la
  surface IPC.

Le lot réalisé a été validé par le typecheck, le build, les tests unitaires et
les E2E ciblés de Notes, Navigation, Journal, Personnes, Données,
Pseudonymisation et fraîcheur. Les nombres exacts de tests ne sont pas figés ici
car ils évoluent avec la suite du dépôt.

## 3. État synthétique par onglet

| Onglet | Cible actuelle | Écriture distante depuis le corpus | Suite naturelle |
|---|---|---|---|
| **Accueil** | Présentation et navigation. | Sans objet. | Aucun chantier propre. |
| **Notes** | Consultation complète, édition locale limitée, Journal local, ouverture de l’entretien en distant. | Non, volontairement. | Validation réelle et performances, puis décision d’usage. |
| **Personnes** | Fonctionnalité locale et distante avancée. | Oui, transactions spécialisées. | Améliorations métier indépendantes seulement. |
| **Pseudonymisation** | Scan et application spécialisée. | Oui selon son moteur actuel. | Gestion des règles uniquement si le besoin est confirmé. |
| **Thèmes** | Consultation et définitions existantes. | Définitions par la transaction corpus existante. | Atelier thématique comme produit séparé. |
| **Données** | Matrice et saisie actuelles. | Conserver les parcours existants. | Journaliser d’abord une cellule locale isolée. |
| **Journal** | Annulation locale, volatile et partielle. | Non. | Étendre par petites commandes sémantiques. |
| **Pas à pas** | Outil conditionnel de démonstration. | Sans objet. | Le maintenir séparé des fonctions métier. |

## 4. Niveau 0 — vérifier et figer le socle

Ces travaux sont les prochains à faire. Ils sont peu risqués et ne changent ni
le modèle ni les contrats d’écriture.

### 4.1 Ajouter le scénario Notes sur un vrai banc Nextcloud

Le serveur WebDAV en mémoire couvre déjà le tirage, la relecture, le refus
d’écriture distante et l’absence d’entrée fantôme dans le Journal. Il reste
utile d’ajouter un E2E visible sur un banc Nextcloud existant pour vérifier :

1. l’inventaire issu du miroir ;
2. le badge de verrou ;
3. le bouton global **Actualiser** suivi de la relecture ;
4. **Ouvrir dans l’entretien** en édition ou en lecture seule ;
5. l’absence de ✎, de suppression et d’entrée Journal depuis le corpus.

Le scénario doit se sauter si le serveur est absent. Les piles existantes se
démarrent uniquement avec `npm run nc:up` ou `npm run nc-b:up`, sans pull ni
reprovisionnement.

### 4.2 Mesurer Notes avec au moins 1 000 éléments

Construire une fixture représentative, puis mesurer sur le même poste :

- ouverture de l’onglet : cible inférieure à 2 secondes ;
- recherche simple : cible inférieure à 500 ms ;
- passage entre Cartes, Tableau et Feuille ;
- défilement de la Feuille et consommation mémoire raisonnable.

Noter le volume, la taille moyenne des corps, le nombre de liens et le matériel
de mesure. Ne rien optimiser si les seuils sont tenus.

Si une mesure échoue, corriger seulement le goulet observé, dans cet ordre :

1. temporiser la recherche sur les grands inventaires ;
2. éviter les conversions ou sanitizations répétées par un cache normalisé en
   mémoire ;
3. virtualiser uniquement le mode dont le DOM est réellement trop volumineux.

L’inventaire peut rester chargé en une projection même si son rendu est
virtualisé.

### 4.3 Garder une validation transversale courte

Les tests de contrat les plus utiles à conserver sont :

- retour au même onglet après ouverture d’un entretien ;
- conservation des filtres, du mode et de la largeur ;
- tirage distant suivi d’une seule relecture ;
- échec de relecture conservant le dernier résultat ;
- premier échec proposant **Réessayer** ;
- inventaire partiel encore utilisable ;
- commande distante indisponible explicitement refusée ;
- aucune écriture ni entrée Journal après no-op ou échec.

Il vaut mieux maintenir ces scénarios transversaux qu’une matrice exhaustive
répétée dans chaque onglet.

## 5. Niveau 1 — enrichissements de lecture et de navigation

Ces évolutions restent locales au renderer ou à une projection. Elles peuvent
être livrées indépendamment, après retour d’usage.

### 5.1 Navigation ciblée vers une note

Faire évoluer l’ouverture actuelle vers un contrat optionnel :

```ts
allerNote(entretienId: string, noteId: string, commentaireId?: string): Promise<void>
```

L’entretien s’ouvre sur Notes, fait défiler jusqu’à la note puis, si demandé,
jusqu’au commentaire. Il ne doit pas ouvrir automatiquement une modale ni créer
un second chemin d’écriture. Données peut adopter plus tard le même principe
pour cibler un locuteur ou une cellule.

**Complexité : faible à moyenne.**

### 5.2 Petites projections utiles dans Données

Le panneau Variables peut recevoir, sans alourdir le format :

- taux de remplissage d’une variable ;
- nombre de modalités utilisées ;
- filtre « valeurs manquantes » pour la variable sélectionnée ;
- accès rapide au détail des modalités ;
- colonne facultative de la Personne liée à côté d’un locuteur.

Ces informations doivent être dérivées. Une sélection enregistrée comme
préférence utilisateur ne se justifie que si la conservation pendant la session
s’avère insuffisante.

**Complexité : faible à moyenne, fonctionnalité par fonctionnalité.**

### 5.3 Passer de Personnes vers une pseudonymisation préparée

Une action **Pseudonymiser cette personne** peut préparer un brouillon de règle
à partir des noms locaux liés. Elle doit encore demander confirmation des alias,
du pseudo et de la portée ; elle ne modifie jamais automatiquement les textes,
les étiquettes ou les règles existantes.

**Complexité : moyenne.** La valeur vient du raccourci de saisie, pas d’une
fusion conceptuelle entre Personne et règle de pseudonymisation.

### 5.4 Autres améliorations Personnes à considérer séparément

À décider sur besoin réel :

- import ou export CSV du répertoire ;
- variantes de noms plus avancées, toujours locales et explicables ;
- statistiques longitudinales par personne ;
- signalement facultatif des variables déclarées stables pour une personne ;
- fusion de deux locuteurs d’un même entretien.

Aucune de ces idées ne doit devenir un lot « finition de Personnes » global.

## 6. Niveau 2 — étendre le Journal local par petites commandes

### 6.1 Journaliser une cellule Données locale

C’est le prochain raccordement recommandé.

La validation directe utilise aujourd’hui un chemin de lot. Il faut créer une
commande sémantique de cellule ; ne jamais déduire l’intention de
`items.length === 1`, car un vrai lot peut ne conserver qu’une cible.

La commande doit :

1. identifier l’entretien, la variable et la cible ;
2. cibler un locuteur par id stable, jamais seulement par index ;
3. normaliser l’absence de valeur en `null` ;
4. détecter le no-op avant tout `lastModified` ou enregistrement ;
5. capturer uniquement `avant` et `apres` pour cette clé EAV ;
6. écrire l’entretien par le chemin atomique ordinaire ;
7. enregistrer l’entrée seulement après réussite ;
8. invalider la matrice et, pour une valeur de locuteur, Personnes.

L’annulation n’est applicable que si l’entretien, la variable, la portée et le
locuteur existent encore, si la cellule vaut toujours `apres` et si l’ancienne
modalité existe encore. Une autre cellule modifiée dans le même entretien ne
doit pas griser l’entrée.

Pour une saisie libre qui a créé une modalité, le premier raccordement restaure
seulement la cellule et conserve la modalité éventuellement devenue inutilisée.
Cela évite une transaction composite et ne détruit jamais une définition déjà
réutilisée.

Les anciens locuteurs sans id doivent recevoir une identité stable persistée à
la première vraie écriture. Un index ne suffit pas à distinguer un locuteur
supprimé d’un autre recréé à sa place.

**Complexité : faible à moyenne.**

### 6.2 Journaliser les modifications simples de définitions

Bons candidats locaux, un champ à la fois :

- renommer une variable ou une modalité ;
- basculer le statut privé d’une variable ;
- renommer ou recolorer une catégorie de note ;
- renommer, recolorer ou activer une définition de thème ;
- modifier une définition isolée de pseudonymisation si son contrat le permet.

L’inverse relit `corpus.json`, vérifie le champ `apres`, puis restaure `avant`.
Une modification sans rapport dans le même fichier ne doit pas bloquer
l’annulation.

Création, suppression, changement de parent, réordonnancement et application de
modèle sont conditionnels ou composites. Ils restent hors du premier lot afin
d’éviter plusieurs entrées pour un seul geste perçu.

**Complexité locale : faible.**

### 6.3 Actions conditionnelles du Journal

Une création ou suppression peut être ajoutée plus tard si son applicabilité est
claire : fiche Personne encore inutilisée, définition sans usage, id encore
libre, ordre inchangé après suppression. L’entrée naît annulable puis devient
inapplicable si sa précondition n’est plus vraie.

Le Journal limité à dix entrées peut être saturé par une saisie tableur. Commencer
avec une entrée par cellule et observer l’usage. Une éventuelle coalescence ne
doit regrouper que plusieurs modifications consécutives de la **même cellule**,
sans action intercalée. Ne jamais regrouper implicitement toute une colonne.

## 7. Niveau 3 — écriture et annulation distantes mono-entretien

Ce niveau ne doit être lancé que si l’ouverture dans l’entretien ne répond pas
au besoin. Il faut construire une fondation unique, puis la réutiliser.

### 7.1 Contrat transactionnel commun

Pour une note ou une cellule contenue dans un entretien :

1. acquérir le verrou de `corpus.json`, puis celui de l’entretien ;
2. relire les définitions et l’entretien depuis le serveur ;
3. comparer l’état frais avec l’état attendu capturé par l’interface ;
4. détecter le no-op avant toute publication ;
5. préparer la mutation et son inverse ciblé ;
6. publier avec `If-Match` ;
7. conserver le miroir en écriture through ;
8. enregistrer l’entrée du Journal uniquement après confirmation du commit.

Le verrou corpus stabilise notamment la catégorie d’une note ou la définition
d’une variable. L’état attendu protège la période entre l’ouverture de l’éditeur
et le GET frais ; `If-Match` protège ensuite la période GET–PUT. Les deux gardes
ne sont pas interchangeables.

L’annulation devient asynchrone et exécute une **nouvelle** transaction : verrous,
GET frais, contrôle de `apres`, restauration de `avant`, PUT conditionnel, puis
retrait de l’entrée après commit. Un verrou tiers garde l’entrée temporairement
bloquée ; une divergence la rend inapplicable ; une panne réseau conserve
l’entrée.

Aucune version intermédiaire ne doit écrire à distance puis enregistrer le
Journal avant le PUT. Un échec de publication ne doit laisser ni mutation du
miroir présentée comme acquise, ni entrée fantôme.

### 7.2 Première utilisation : Notes distante directe

La modale existante fournit déjà une frontière atomique et un état sémantique
attendu. Le lot distant peut donc couvrir :

- modification des cinq champs autorisés ;
- suppression avec contrôle de l’ordre ;
- Journal après commit ;
- annulation transactionnelle.

Création, réordonnancement, « Concerne », liens et catégories restent dans
l’entretien. Le corps restauré doit rester exact ; `modifieLe` est un horodatage
d’activité et ne doit pas empêcher deux annulations successives A→B→C, puis
C→B→A.

**Complexité : élevée.** Elle est justifiée seulement par un besoin fréquent
d’édition agrégée.

### 7.3 Réutilisation : cellule Données distante

Une fois le socle précédent disponible, l’inverse EAV d’une cellule est petit et
peut emprunter la même transaction. Les écritures distantes existantes ne
doivent jamais être « annulées » en modifiant seulement le miroir.

**Complexité : moyenne après le socle, élevée avant.** Les lots restent exclus.

### 7.4 Définitions distantes simples

Une définition seule utilise le verrou de `corpus.json` et la transaction de
définitions existante. L’entrée doit là encore être créée après commit, et son
annulation republier un état frais sous condition.

Il vaut mieux livrer successivement Notes, cellule Données et définitions que
rendre tout `JournalCorpus` distant en une seule fois.

## 8. Niveau 4 — chantiers métier distincts

Ces sujets peuvent avoir de la valeur, mais ne relèvent plus de
l’harmonisation. Chacun mérite une décision produit et un plan autonome.

### 8.1 Gestion avancée des règles de pseudonymisation

La table peut un jour proposer création, renommage, suppression, import et
export des correspondances. Les opérations de définition doivent rester
séparées de l’application aux occurrences. Un import doit afficher son diff et
ses conflits avant toute validation.

### 8.2 Recherche avancée dans Notes

La recherche simple couvre le besoin initial. Si les utilisateurs demandent des
requêtes reproductibles, une évolution possible est :

- champs `titre:`, `corps:`, `catégorie:`, `entretien:`, `date:` et
  `creation:` ;
- opérateurs `ET` et `OU`, avec `ET` prioritaire ;
- parenthèses et valeurs entre guillemets ;
- dates avec `>`, `<` ou égalité ;
- erreur localisée qui conserve la dernière liste valide.

Les recherches enregistrées, l’autocomplétion et leur persistance sont des
décisions supplémentaires, pas des conséquences automatiques du parseur.

### 8.3 Atelier thématique sans IA

Il faut séparer la lecture actuelle des thèmes d’un atelier qui transforme le
codebook. Un ordre prudent serait :

1. **santé du codage en lecture** : couverture par entretien, thèmes inutilisés,
   annotations orphelines et références pendantes ;
2. **courbe de saturation** : ordre de première apparition des thèmes au fil des
   entretiens ;
3. **candidats** à examiner : thèmes souvent co-présents ou thème volumineux et
   lexicalement hétérogène ;
4. **fusion** explicite de deux thèmes, avec réécriture transactionnelle des
   références ;
5. **scission manuelle** : rassembler les extraits puis les répartir vers deux
   ou plusieurs catégories.

Les deux premiers éléments sont surtout des projections. Fusion et scission
sont des commandes multi-entretiens et doivent annoncer les conflits et les
résultats partiels au lieu de promettre une atomicité distante inexistante.

### 8.4 Accord inter-codeurs et assistance par IA

Une comparaison entre auteurs peut utiliser `Annotation.auteur` : divergences,
réconciliation et éventuellement un indicateur d’accord. Elle devient surtout
utile quand le travail multi-utilisateur est fréquent.

L’IA peut ensuite proposer une partition d’extraits ou jouer le rôle d’un second
codeur, mais uniquement comme brouillon validé par l’utilisateur. Elle ne pose
jamais une annotation et ne crée jamais une catégorie en silence.

Les entretiens étant sensibles :

- modèle local, par exemple Ollama, par défaut ;
- service externe autorisé uniquement sur du texte pseudonymisé ;
- endpoint et modèle dans le profil utilisateur, jamais dans le corpus partagé.

### 8.5 Carte de théorisation

Une carte où le chercheur place des thèmes, dessine des relations typées et
associe mémos ou extraits est un produit différent de l’atelier du codebook. Si
le besoin apparaît, elle exige un nouvel agrégat persistant pour nœuds, arcs et
positions, avec tolérance aux références pendantes. `vue-flow` constitue une
piste Vue sous licence MIT adaptée aux nœuds et arêtes interactifs. La piste
`gephi-lite` est à écarter pour un embarquement direct en raison de sa licence
GPL-3. Ce sujet ne doit pas être greffé à l’onglet Thèmes sans validation
d’usage.

## 9. Niveau 5 — à éviter

### 9.1 Un Journal distant universel en un seul lot

Notes, Données, Personnes, définitions et pseudonymisation mélangent fichiers
uniques, agrégats corpus, opérations multi-entretiens et succès partiels. Les
couvrir ensemble produirait un protocole difficile à tester et à expliquer.

### 9.2 Annuler les lots Données distants comme une action atomique

WebDAV ne garantit aucun commit atomique sur plusieurs entretiens. Les options
réelles sont une entrée par succès, un groupe local seulement, ou une annulation
partielle avec un nouveau contrat d’interface. Tant que cette unité n’est pas
tranchée, les lots ne doivent produire aucune entrée Journal.

Même en local, une entrée groupée exigerait de vérifier toutes les cellules et de
remplacer tous les entretiens en une transaction reprenable. Une seule cellule
modifiée depuis rendrait le groupe entier inapplicable. Ce coût doit répondre à
un besoin observé.

### 9.3 Transformer Notes en éditeur corpus complet

Créer, réordonner, modifier « Concerne », gérer les catégories et lier des
commentaires exige le contexte de l’entretien. Dupliquer ces gestes dans le
corpus multiplierait les chemins d’écriture, les conflits et les règles
d’annulation. **Ouvrir dans l’entretien** est le bon repli.

### 9.4 Généraliser le moteur multi-fichiers de Personnes

Personnes justifie ses transactions spécialisées par son besoin métier. Cela
n’oblige pas les autres onglets à proposer fusion, propagation ou application
de masse. Chaque commande composite doit démontrer sa valeur et définir sa
sémantique de reprise.

### 9.5 Confondre Journal, audit et reprise technique

Le Journal volatil ne doit pas devenir :

- un historique persistant de tous les utilisateurs ;
- un système de versions de notes ;
- une liste technique des PUT et verrous ;
- une file d’attente d’écritures hors ligne.

Un audit multi-utilisateur aurait son propre modèle, sa politique de
confidentialité, sa rétention et son interface.

### 9.6 Ajouter des préférences persistantes sans besoin

Les composants montés conservent déjà leur contexte pendant le travail. Écrire
tous les filtres, tris, largeurs et sélections dans les réglages ajoute
validation, migrations et cas de remise à zéro. Persister uniquement les
préférences dont la perte entre deux lancements gêne réellement.

### 9.7 Abstraire ou extraire massivement `Corpus.vue` maintenant

Les panneaux se ressemblent visuellement, mais leurs minima, replis, erreurs et
cycles de vie diffèrent. Une infrastructure de disposition commune n’est utile
qu’après constat d’un comportement réellement identique. Aucun chantier métier
ci-dessus ne doit déclencher à lui seul une extraction générale de
`Corpus.vue`.

### 9.8 Lancer IA, recherche complexe ou graphe pour « finir les onglets »

Ces fonctions créent de nouveaux usages ; elles ne corrigent aucune incohérence
de la barre actuelle. Elles ne doivent ni conditionner la clôture du socle ni
être regroupées dans un lot de finition.

## 10. Ordre recommandé

1. Ajouter l’E2E Notes sur le banc Nextcloud réel.
2. Mesurer Notes avec 1 000 éléments et n’optimiser que si un seuil échoue.
3. Recueillir les irritants d’usage sur la consultation et l’ouverture des
   entretiens.
4. Si utile, ajouter la navigation ciblée vers une note ou une cellule.
5. Raccorder une cellule Données **locale** au Journal par une commande
   sémantique dédiée.
6. Raccorder ensuite quelques modifications **locales** simples de définitions.
7. Livrer indépendamment les petites projections Données ou Personnes qui ont
   une valeur observée.
8. Décider si l’édition Notes distante depuis le corpus apporte assez de valeur
   par rapport à **Ouvrir dans l’entretien**.
9. Si oui, construire le socle transactionnel et l’annulation distante
   mono-entretien, puis le réutiliser pour une cellule Données.
10. Traiter la gestion avancée de Pseudonymisation, l’atelier thématique,
    l’accord inter-codeurs ou l’IA comme des produits séparés.
11. Maintenir hors périmètre le Journal distant universel, l’annulation des lots
    distants et l’éditeur Notes corpus complet.

## 11. Critère de réussite durable

Les onglets sont suffisamment harmonisés lorsque l’utilisateur comprend, dans
chacun d’eux :

- ce qu’il consulte et quel corpus en est la source ;
- si le résultat affiché est frais, ancien ou partiel ;
- comment relancer une lecture ;
- si une action écrit localement, directement à distance ou dans un entretien ;
- pourquoi une commande est indisponible ;
- ce que le Journal peut réellement annuler.

Cette réussite ne demande ni que tous les onglets aient la profondeur de
Personnes, ni qu’ils écrivent tous à distance, ni que toutes leurs actions
soient annulables.
