# Synthèse V2 — premier socle à double vue

Statut : proposition de réalisation après lecture de la Synthèse SonalPi1, de Lexico V2,
des passages, des cas et des recueils V2.

> **Mise à jour — espace de travail.** Synthèse vit désormais dans l’espace
> **Analyser et interpréter**, à côté de Lexico et des Analyses croisées : ses
> critères occupent la colonne de gauche et les résultats la colonne de droite.
> Les mentions de « fenêtre de travail » ci-dessous décrivent l’état antérieur ;
> voir [la navigation par espaces](plan-navigation-espaces-travail.md).

Ce plan concerne la fonction **Synthèse** de la barre d’outils. Le document
`synthese-corpus-onglets.md` traite pour sa part de l’harmonisation des onglets du corpus :
ce sont deux sujets distincts.

## 1. Décision générale

Construire Synthèse comme une **fenêtre de travail presque plein écran**, ouverte depuis la
barre d’outils, et non comme un nouvel onglet du corpus.

La fenêtre possède :

- une seule sélection de matériaux ;
- un seul résultat calculé ;
- deux représentations synchronisées de ce résultat : **Vue d’ensemble** et **Extraits** ;
- un panneau de critères à onglets, sur le modèle ergonomique de Lexico ;
- un bilan permanent expliquant ce qui est affiché ;
- une actualisation explicite lorsque les sources ont changé.

Le caractère modal n’est pas un obstacle. En revanche, Synthèse ne doit pas tenter de
repeindre le mur du corpus situé derrière la fenêtre. Sa Vue d’ensemble reconstruit son
propre mur à partir du même résultat que la liste des extraits. Cela évite deux états concurrents
et permet le même fonctionnement depuis la vue Corpus ou depuis un entretien.

## 2. Ce que fait SonalPi1

La V1 fournit deux usages complémentaires.

### 2.1 Mur des entretiens

Le mur représente les entretiens avec des zones placées proportionnellement dans leur texte.
Les couleurs indiquent les thèmes présents. Les thèmes et entretiens actifs déterminent les
zones visibles. Cliquer sur une zone permet de revenir au passage correspondant.

Repères principaux :

- `../SonalPi/modules/gestion_corpus.js`, construction des `.xtr-graph` ;
- `affichageExtraitsCorpus`, filtrage des zones selon les thèmes actifs ;
- clic sur une zone, puis ouverture de l’entretien à la position concernée.

### 2.2 Fenêtre Synthèse

`../SonalPi/modules/synthese.js` relit les entretiens actifs, rassemble les passages répondant
aux thèmes actifs et affiche tous les extraits. La V1 propose notamment :

- regroupement des extraits par entretien ;
- variables publiques en en-tête ;
- texte pseudonymisé à l’écran ;
- copie d’un extrait ;
- affichage du contexte ;
- export TXT, DOCX, PDF et HTML ;
- accès aux recueils.

La V1 propose bien un raccordement aux **Recueils** : le bouton `Recueils` est présent dans
l’en-tête de Synthèse, et les extraits sont déplaçables vers le panneau Recueils via
`application/sonal-extrait`. Cette possibilité existe donc réellement ; elle n’était pas une
proposition nouvelle pour la V2.

La V2 ne doit toutefois pas recopier le mécanisme de glisser-déposer tel quel. Un passage de
recueil V2 référence un repère stable conservé dans l’entretien, alors qu’un extrait de
Synthèse est d’abord un résultat régénérable défini par des positions. Créer le repère puis
l’item de recueil constitue une écriture coordonnée, notamment en distant. Ce raccordement
est différé après le socle de consultation.

## 3. Contrat fonctionnel du premier socle

### 3.1 Une unité commune : l’extrait de synthèse

Les deux vues consomment exactement la même collection d’extraits. Aucun calcul spécifique
au mur ne doit diverger du calcul de la liste.

Contrat proposé :

```ts
interface ExtraitSynthese {
  id: string
  entretienId: string
  titreEntretien: string
  from: number
  to: number
  longueurSource: number
  themeIds: string[]
  annotationIds: string[]
  locuteurIds: string[]
  personneIds: string[]
  texte: string
  avant: string
  apres: string
}
```

Les identifiants d’annotations permettent d’expliquer une zone issue de plusieurs codages.
`longueurSource` sert uniquement à placer l’extrait sur la miniature. Le texte visible est une
projection dans le mode courant ; il ne remplace jamais le texte source.

L’identifiant de l’extrait doit être déterministe pour un même calcul, par exemple à partir de
l’entretien, des bornes et des annotations contributrices. Il sert à conserver la sélection
lors du passage entre les deux vues.

### 3.2 Sélection des matériaux

La cible complète reprend les cinq dimensions déjà comprises dans Lexico :

- **Entretiens** ;
- **Variables** ;
- **Personnes** ;
- **Thèmes** ;
- **Cas**.

Conventions communes avec Lexico :

- **Sans restriction** reste visible et distinct d’une sélection explicite ;
- OU entre les choix d’une même liste ;
- ET entre dimensions filtrées ;
- les variables de locuteur et les personnes ne retiennent que les paroles concernées ;
- les variables d’entretien retiennent ou écartent l’entretien entier ;
- les thèmes et cas sélectionnent des plages ;
- les paroles d’enquêteurs sont exclues par défaut avec une option visible ;
- une source ou un cas indisponible produit un diagnostic, jamais un faux résultat vide.

Pour éviter de produire involontairement la transcription complète du corpus, le bouton de
calcul demande au moins un **thème** ou un **cas**. Une évolution pourra proposer explicitement
« Tout le texte des entretiens retenus », mais ce ne doit pas être l’effet silencieux de cinq
onglets sans restriction.

La première sous-livraison peut ouvrir seulement **Entretiens** et **Thèmes**. Les onglets
Variables, Personnes et Cas rejoignent ensuite le même moteur de plages avant que le socle ne
soit considéré comme complet.

### 3.3 Correspondance thématique

Le premier mode est simple : un passage est retenu s’il rencontre **au moins un** thème choisi.
Les descendants ne sont inclus que s’ils sont effectivement cochés, éventuellement au moyen
d’une action visible « Cocher cette branche ».

La V1 dispose aussi d’un mode ET avec un traitement particulier des familles complètes. Ne pas
le reproduire implicitement. Une évolution distincte pourra proposer :

- **Au moins un thème choisi** ;
- **Tous les thèmes choisis au même endroit**.

Le second libellé devra correspondre à une véritable intersection de plages, testée sur les
chevauchements. Il ne doit pas signifier seulement que les thèmes apparaissent quelque part
dans le même entretien.

### 3.4 Construction des extraits

Le moteur travaille sur les positions ProseMirror, sans DOM.

Ordre recommandé :

1. valider et préparer chaque source une seule fois ;
2. relever les annotations de codage valides pour les thèmes choisis ;
3. préparer les plages des cas choisis ;
4. construire les plages admissibles des entretiens, variables, personnes et rôles ;
5. intersecter toutes les dimensions sur les mêmes positions ;
6. réunir les recouvrements sans dupliquer le texte ;
7. découper lors d’un trou non retenu ou d’un changement de locuteur ;
8. conserver tous les thèmes et identifiants d’annotations contributrices ;
9. projeter le texte et un contexte borné dans le mode d’affichage courant ;
10. trier selon l’ordre du corpus, puis selon la position dans l’entretien.

Deux annotations qui se chevauchent donnent un seul passage sur leur intersection ou leur
union admissible, avec plusieurs `annotationIds`. Deux plages séparées par du texte non retenu
restent deux extraits. Deux plages seulement contiguës ne sont réunies que si elles partagent
au moins un thème sélectionné et le même tour de parole. Ces règles doivent être fixées par des
tests courts avant l’interface.

Une zone graphique représente un extrait calculé, pas nécessairement une annotation unique.
Son détail indique clairement toutes les annotations et tous les thèmes qui y contribuent.

### 3.5 Texte pseudonymisé ou original

La fenêtre propose un sélecteur explicite à deux états :

- **Texte pseudonymisé**, valeur par défaut ;
- **Texte original**, accompagné de l’indication qu’il peut contenir des identités.

Le contexte et les noms de locuteurs suivent le même mode que le texte. Le choix reste un état
de la fenêtre pendant la session du corpus ; il n’est ni enregistré dans `corpus.json` ni
partagé avec les autres utilisateurs.

Changer de mode ne modifie ni les critères, ni les bornes, ni le mur. Le texte et les libellés
sont reprojetés depuis les sources déjà préparées, sans relire les entretiens et sans recalculer
les intersections. La sélection du même extrait reste donc stable entre les deux modes.

Aucun résultat de vue ne doit conserver simultanément une copie originale et une copie
pseudonymisée. La copie dans le presse-papiers utilise uniquement le mode actuellement visible.

## 4. Fenêtre et interactions

### 4.1 En-tête

L’en-tête contient :

- titre **Synthèse** ;
- date ou état du dernier calcul ;
- **Actualiser** ;
- **Exporter**, désactivé si le résultat est périmé ou incomplet ;
- sélecteur **Texte pseudonymisé / Texte original** ;
- **Quitter**.

Fermer puis rouvrir Synthèse dans le même corpus conserve les critères et le mode d’affichage.
Changer de corpus remet la fenêtre, les critères et les résultats à zéro.

### 4.2 Bilan permanent

Le bilan affiche séparément :

- nombre d’entretiens avec au moins un extrait ;
- nombre total d’extraits ;
- volume de texte retenu, si la mesure est compréhensible ;
- nombre de critères appliqués ;
- état frais, périmé ou incomplet.

Un détail repliable reprend les choix de chaque dimension. Le résumé décrit la demande ; les
compteurs décrivent le résultat effectif.

### 4.3 Choix de représentation

Deux boutons segmentés, et non un second jeu d’onglets de filtres, changent la représentation :

- **Vue d’ensemble** ;
- **Extraits**.

Leur vocabulaire et leur position doivent les distinguer des onglets du panneau de critères.
Le changement de représentation ne recalcule pas les sources et ne modifie aucun filtre.

### 4.4 Vue d’ensemble

La Vue d’ensemble reconstruit un mur propre à Synthèse :

- une ligne ou carte par entretien, dans l’ordre du corpus ;
- titre de l’entretien ;
- nombre d’extraits retenus ;
- barre représentant la longueur de la transcription ;
- zones positionnées par `from / longueurSource` et dimensionnées par `(to-from) / longueurSource` ;
- légende des thèmes visibles ;
- diagnostic explicite pour une source indisponible.

La position représente la progression dans la **transcription**, pas le temps audio. La vue ne
doit donc pas laisser croire que la largeur mesure une durée.

Chaque zone est un bouton accessible au clavier. Son nom accessible indique l’entretien, la
position ou le rang de l’extrait et les thèmes. La couleur seule ne suffit pas : sélection,
contour, motif ou libellé complètent l’information.

Pour plusieurs thèmes sur le même extrait :

- utiliser une répartition ou un dégradé stable des couleurs ;
- afficher tous les thèmes dans le détail ;
- éviter de superposer plusieurs boutons impossibles à atteindre.

Une largeur visuelle minimale peut agrandir la cible de clic, mais elle ne doit pas modifier la
position logique ni faire croire que l’extrait est plus long. Une info-bulle ou le détail donne
les bornes exactes.

Cliquer sur une zone :

1. sélectionne l’extrait ;
2. ouvre un panneau de détail dans la fenêtre ;
3. affiche texte, contexte, locuteur, thèmes et annotations contributrices ;
4. propose **Afficher dans les extraits** et **Ouvrir dans l’entretien**.

Le clic ne quitte donc pas immédiatement Synthèse. L’ouverture de l’entretien reste une action
explicite.

### 4.5 Vue Extraits

La vue liste les extraits dans l’ordre du corpus et de la transcription. Elle propose :

- regroupement par entretien ;
- titre et éventuelles variables publiques non privées ;
- texte dans le mode choisi ;
- locuteur ;
- badges de thèmes ;
- **Voir le contexte** ;
- **Ouvrir dans l’entretien** ;
- **Copier**.

L’extrait sélectionné depuis le mur est mis en évidence et amené dans la zone visible. Revenir
à la Vue d’ensemble conserve la même sélection.

Un regroupement alternatif par thème peut venir plus tard. Comme un extrait peut porter
plusieurs thèmes, ce mode devra éviter de présenter des duplications comme de nouveaux
extraits.

### 4.6 Panneau de critères

Le panneau latéral réutilise les conventions visuelles de Lexico sans copier son composant
entier : onglet consulté, badge de filtre appliqué, actions globales et état Sans restriction.

La cible comporte :

- Entretiens ;
- Variables ;
- Personnes ;
- Thèmes ;
- Cas ;
- option d’inclusion des enquêteurs.

Le panneau est masquable. Sa fermeture ne change ni critères ni résultats. Sur une fenêtre
étroite, il passe sous les résultats ou devient un tiroir accessible.

## 5. Données, fraîcheur et erreurs

### 5.1 Chargement

Reprendre les garanties de Lexico :

- utiliser l’entretien ouvert depuis son modèle en mémoire ;
- charger les autres sources par les services existants ;
- borner la concurrence, par exemple à quatre lectures ;
- préparer chaque document ProseMirror une seule fois ;
- ignorer les réponses d’une ancienne génération ;
- ne pas relire les sources à chaque changement purement visuel.

`preparerSourcesPassages`, `textePassage`, `locuteursPassage` et les projections de cas sont
des briques à réutiliser ou à compléter. Le moteur d’extraits thématiques doit rester pur dans
`src/shared/` ou dans un module renderer sans dépendance au DOM.

### 5.2 Fraîcheur

Une modification du corpus, d’un entretien, des thèmes, personnes, variables ou cas marque le
résultat comme périmé. Le résultat précédent reste visible avec un avertissement. Navigation
et export sont bloqués ou demandent une actualisation lorsque les positions peuvent être
obsolètes.

Une actualisation réussie remplace simultanément :

- collection d’extraits ;
- mur ;
- compteurs ;
- diagnostics ;
- date du calcul.

Il ne doit jamais exister un mur actualisé et une liste ancienne.

### 5.3 Résultats partiels

Une source illisible, absente ou d’une version inconnue produit un diagnostic nommé. Le reste
de la synthèse demeure consultable. Le bilan indique que le résultat est incomplet et l’export
présenté comme définitif reste désactivé.

Un cas partiellement projeté conserve ses diagnostics. Une valeur de variable invalide n’est
pas assimilée à « Non renseigné ».

## 6. Exports du socle

Après validation de la double vue, ajouter un export simple issu de la même collection
d’extraits :

1. TXT structuré ;
2. DOCX ;
3. PDF si la projection TXT/DOCX est stabilisée.

Chaque export contient :

- titre et date ;
- critères demandés ;
- sources effectivement contributrices ;
- diagnostics ou mention de complétude ;
- entretiens, locuteurs autorisés, thèmes et extraits ;
- aucune variable privée ;
- texte pseudonymisé par défaut, avec choix original explicite dans le dialogue d’export.

Pour un corpus local, proposer `resultats/synthese/`. Pour un corpus distant, proposer le
dossier Documents du poste. Aucun résultat de Synthèse n’est synchronisé automatiquement vers
le corpus partagé.

L’export HTML interactif avec audio de la V1 est différé : il introduit davantage de questions
de portabilité, de confidentialité et de références média.

## 7. Raccordement aux Recueils : présent en V1, différé dans le premier socle

Les **Recueils sont déjà implémentés dans la V2** : définitions persistantes, titres, textes,
passages référencés, projection, réorganisation et exports. Il ne faut ni les recréer ni
introduire un second modèle de recueil dans Synthèse. Seul le raccourci direct
**Synthèse → Ajouter cet extrait à un recueil** reste à raccorder.

Ce raccordement est utile, mais il change la nature du geste :

- Synthèse calcule des positions temporaires ;
- un Recueil V2 conserve une référence stable `{ entretienId, repereId }` ;
- il faut donc créer ou retrouver un `ReperePassage` dans l’entretien ;
- puis insérer l’item dans `corpus.json` ;
- en distant, les sources publiées doivent être relues et les conflits traités.

Le premier socle ne propose ni glisser-déposer ni bouton d’ajout direct. Il permet déjà
**Ouvrir dans l’entretien**, puis l’utilisateur peut utiliser le parcours existant d’ajout de
sélection au recueil.

Une phase ultérieure pourra ajouter **Ajouter au recueil** depuis un extrait avec :

1. aperçu du passage ;
2. choix du recueil et de l’emplacement ;
3. création idempotente du repère ;
4. commande de recueil gardée par l’ordre attendu ;
5. reprise si le repère est enregistré mais que l’item est refusé ;
6. bilan clair en cas de succès partiel distant.

Le glisser-déposer ne sera qu’un raccourci éventuel de cette commande, jamais son seul chemin.

## 8. Architecture proposée

### 8.1 Modules

| Fichier proposé | Rôle |
| --- | --- |
| `src/shared/synthese/types.ts` | Extraits, critères, diagnostics et contrats des deux vues |
| `src/shared/synthese/moteur.ts` | Intersections de plages, déduplication, fusion et tri |
| `src/shared/synthese/resume.ts` | Bilan déterministe des critères |
| `src/shared/synthese/export.ts` | Projection commune des exports |
| `src/renderer/editor/synthese.ts` | Préparation ProseMirror, modes de texte et contexte |
| `src/renderer/composables/corpus/useSyntheseCorpus.ts` | Chargement, générations, fraîcheur et navigation |
| `src/renderer/components/synthese/SyntheseCote.vue` | Critères de sélection |
| `src/renderer/components/synthese/SynthesePanneau.vue` | Bilan, double vue et détail |
| `src/renderer/components/synthese/VueEnsembleSynthese.vue` | Mur des entretiens |
| `src/renderer/components/synthese/ListeExtraitsSynthese.vue` | Liste et détail des extraits |

Les noms peuvent évoluer, mais le moteur, le chargement et la présentation doivent rester
séparés.

### 8.2 Raccordement

- activer le bouton Synthèse dans `BarreOutils.vue` ;
- monter la fenêtre dans `App.vue` ;
- raccorder `useSyntheseCorpus` dans `sonal.ts` ;
- fermer Cas, Recueils, Tableau de bord, Documents cadre et Lexico lors de son ouverture ;
- fermer ou réinitialiser Synthèse au changement de corpus ;
- conserver l’onglet corpus ou l’entretien d’origine tant que Synthèse est ouverte.

Aucun champ n’est ajouté à `CorpusFichier` pour le premier socle. Critères, sélection de vue et
résultats restent en mémoire pendant la session du corpus.

### 8.3 Réutilisation avec Lexico

Réutiliser les contrats qui ont un sens commun :

- `SelectionLexico` peut inspirer une `SelectionSynthese`, mais le nom métier ne doit pas fuir
  si les structures divergent ;
- chargement borné et gestion par génération ;
- résumé Sans restriction ;
- contexte des variables, personnes et cas ;
- diagnostics et invalidation ;
- sémantique OU interne / ET entre dimensions.

Ne pas extraire immédiatement un composant générique de filtres. Les contrôles se ressemblent,
mais Lexico filtre des occurrences lexicales alors que Synthèse intersecte des plages et exige
un thème ou un cas. Une extraction commune ne se justifie qu’après les deux implémentations.

## 9. Réalisation par étapes

### Étape A — moteur pur et corpus manuel

- définir `ExtraitSynthese` et les critères ;
- construire les plages depuis les annotations de thèmes ;
- appliquer Entretiens et Thèmes ;
- régler recouvrements, contiguïtés et changements de locuteur ;
- conserver les annotations contributrices ;
- projeter le texte pseudonymisé ou original sans changer les bornes ;
- comparer à la main sur un petit corpus ;
- documenter les différences avec la V1.

**Arrêt :** aucune duplication, bornes exactes, aucune fuite d’anonymisation et même collection
utilisable par le mur et la liste.

### Étape B — fenêtre, Vue d’ensemble et Extraits

- activer le bouton Synthèse ;
- créer la fenêtre plein écran ;
- ajouter le bilan permanent ;
- ajouter le panneau Entretiens / Thèmes ;
- construire le mur proportionnel ;
- construire la liste d’extraits ;
- synchroniser la sélection entre les vues ;
- ajouter contexte, copie et ouverture de l’entretien ;
- gérer chargement, annulation de génération, résultats périmés et diagnostics.

**Livrable intermédiaire :** choisir des thèmes et entretiens, comprendre leur distribution
dans le corpus, lire tous les extraits et revenir à leur source.

### Étape C — dimensions V2

- Variables d’entretien ;
- Variables de locuteur ;
- Personnes ;
- Cas projetés ;
- option enquêteurs ;
- résumé commun aux cinq dimensions ;
- tests d’intersection sur la même parole et la même plage.

**Livrable du premier socle complet :** double vue et cinq dimensions cohérentes, en local et
en consultation distante.

### Étape D — export

- TXT puis DOCX ;
- dialogue de destination ;
- critères et diagnostics dans le document ;
- `resultats/synthese/` comme destination locale proposée ;
- absence d’identités et de variables privées par défaut.

### Étape E — après retour d’usage

- correspondance « tous les thèmes au même endroit » ;
- regroupement alternatif par thème ;
- ajout direct à un recueil ;
- PDF ;
- HTML interactif et audio seulement si le besoin est confirmé.

## 10. Tests et critères d’acceptation

### 10.1 Tests purs

- une annotation donne un extrait aux mêmes bornes ;
- deux annotations chevauchantes ne dupliquent pas le texte ;
- thèmes multiples et liste des annotations contributrices ;
- plages contiguës partageant ou non un thème ;
- coupure lors d’un changement de locuteur ;
- entretien et variable générale filtrant l’ensemble ;
- variable locale et personne ne gardant que leurs paroles ;
- cas et thème appliqués par intersection ;
- enquêteur exclu sans perdre les passages sans locuteur ;
- pseudonyme plus court ou plus long sans déplacement des bornes source ;
- contexte cohérent avec le mode pseudonymisé ou original ;
- changement de mode sans relecture, sans nouveau filtrage et sans perte de sélection ;
- copie conforme au seul mode visible ;
- source invalide ou cas incomplet produisant un diagnostic ;
- ordre stable des extraits ;
- identifiant stable pour un même calcul.

### 10.2 Cohérence des deux vues

- chaque zone du mur correspond à exactement un extrait de la liste ;
- chaque extrait de la liste possède une zone si sa source est disponible ;
- compteurs identiques ;
- changement de vue sans recalcul ;
- sélection conservée dans les deux sens ;
- position et largeur calculées sur la longueur ProseMirror validée ;
- aucun segment graphique créé à partir d’un résultat filtré différemment.

### 10.3 Interface et accessibilité

- zones accessibles au clavier et nommées sans dépendre de la couleur ;
- thèmes superposés compréhensibles ;
- titres longs et corpus de plus de cinquante entretiens ;
- panneau masqué sans perte de critères ;
- fenêtre étroite utilisable ;
- état vide expliquant qu’un thème ou un cas est requis ;
- résultat périmé visible mais navigation/export protégés ;
- lecture seule clairement consultable.

### 10.4 Local et distant

- entretien ouvert lu depuis la mémoire ;
- autres entretiens lus sans verrou d’écriture ;
- même calcul sur corpus local, miroir GitLab et miroir WebDAV ;
- indisponibilité partielle nommée ;
- actualisation distante ne réintroduisant pas une ancienne génération ;
- aucun fichier distant modifié par la consultation ou l’export local.

### 10.5 Performance

Mesurer avant d’optimiser :

- cinquante entretiens ;
- plusieurs milliers d’annotations ;
- nombreuses superpositions ;
- bascule Vue d’ensemble / Extraits sans nouveau chargement.

Cibles initiales sur un corpus déjà local : premier résultat en quelques secondes, changement
de vue immédiat et interaction fluide avec le mur. Virtualiser la liste ou les lignes du mur
uniquement si une mesure montre un DOM trop volumineux.

## 11. Hors périmètre du premier socle

- édition des annotations depuis Synthèse ;
- modification du texte ;
- sauvegarde des résultats dans `corpus.json` ;
- recherches ou synthèses enregistrées ;
- ajout direct ou glisser-déposer vers un recueil ;
- export original sans choix explicite ;
- audio dans la fenêtre ;
- analyse automatique ou rédaction assistée ;
- formule de requête libre ;
- mutation du mur du corpus derrière la fenêtre.

## 12. Critère de réussite

Le socle est réussi si l’utilisateur peut :

1. choisir clairement les matériaux ;
2. voir où ils se répartissent dans tous les entretiens ;
3. cliquer sur une zone et comprendre les annotations qui la produisent ;
4. retrouver exactement le même passage dans la liste des extraits ;
5. ouvrir la source sans ambiguïté ;
6. comprendre si le résultat est complet et à jour ;
7. obtenir le même résultat à partir des mêmes critères, quelle que soit la vue utilisée.
