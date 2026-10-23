# Lexico V2 — socle fonctionnel, personnes, cas et lisibilité de la sélection

Statut : socle, filtres, résumé, traitements manuels, persistance et import V1 réalisés ; fonctions avancées différées.

## 1. Conclusion et recommandation

**Réaliser Lexico progressivement, sans porter intégralement le module V1 et sans construire un éditeur de requêtes.**

La demande de lisibilité est réalisable à un coût raisonnable si le résumé est une
**présentation des filtres déjà choisis**, et non un langage supplémentaire à apprendre.

Recommandations :

1. Livrer d’abord un index lexical fiable : formes, fréquences, sélection des matériaux,
   concordances et export simple des résultats.
2. Intégrer les **personnes** et les **cas** comme deux filtres distincts de la V2,
   sans demander de créer des cas pour analyser des personnes ou des variables.
3. Distinguer dès le départ **onglet consulté** et **filtre appliqué**.
4. Afficher un petit bilan toujours visible et un **détail des critères repliable**.
5. Ajouter ensuite la formulation courte « Tous les entretiens sauf X et Y »,
   mais seulement là où elle est exacte et compréhensible.
6. Ne pas développer de formule éditable, de parenthèses libres, de simplificateur
   logique général ou d’interprétation de requêtes en langage naturel.

**Verdict : oui au résumé simple ; non à l’usine à gaz.** La partie coûteuse du
chantier n’est pas de raccourcir une liste de 48 entretiens : c’est de garantir que
les fréquences, les filtres de locuteur, les cas et les concordances portent bien
sur les mêmes occurrences, avec une gestion cohérente de la pseudonymisation.

## 2. Ce que montre l’existant

### 2.1 V1 : une référence fonctionnelle, pas une architecture à recopier

Source principale : `../SonalPi/modules/lexico.js` (6 836 lignes dans la version consultée).

Fonctionnalités observées :

- extraction des occurrences depuis les transcriptions HTML et leurs `data-rk` ;
- regroupement par forme, fréquences, nombre d’entretiens, tris et recherche ;
- filtres par catégories, variables et entretiens ;
- exclusion des questions à partir du nom du locuteur terminé par `?` ;
- spécificités du sous-corpus, histogrammes comparatifs et nuage de mots ;
- concordances, arbre de contexte et exploration des catégories associées ;
- mots outils, regroupements manuels, concaténations et lemmatisation verbale ;
- mesure de « spontanéité » ;
- code d’analyse factorielle du vocabulaire, dont le bouton d’en-tête n’est pas
  ajouté à l’interface dans le chemin consulté.

Points à ne pas reproduire :

- L’état des filtres est en grande partie relu dans les classes CSS et les boutons.
- Les boutons d’en-tête ouvrent ou masquent des panneaux sans distinguer clairement
  leur visibilité et l’existence d’une restriction.
- `_lxRefreshTable()` et `_lxConstruireContexteFiltresActifs()` calculent les
  entretiens admissibles à partir des valeurs générales (`l === 'all'` ou absent).
  La présence d’une variable de locuteur dans le panneau ne suffit donc pas à
  sélectionner correctement les seules paroles portant cette modalité.
- Dans `_lxRefreshTable()`, les questions peuvent être retirées du sous-corpus alors
  que les totaux de référence sont ceux de `tabLexico`. La V2 devra définir
  explicitement une référence statistique soumise aux mêmes options lexicales et de rôle.
- Le filtrage thématique dépend de la désactivation d’au moins un thème ; les zones
  sans thème changent alors de traitement. Cette distinction doit devenir explicite.

La parité recherchée sera celle des **usages utiles**, pas celle de tous les résultats
numériques historiques : les corrections de portée et les conventions de découpage
peuvent expliquer des différences, à documenter sur de petits corpus vérifiables.

### 2.2 V2 : les matériaux nécessaires existent déjà

- `src/renderer/components/app/BarreOutils.vue` contient le lanceur Lexico désactivé.
- `src/shared/format.ts` distingue les variables d’entretien et de locuteur.
- Une `Personne` contient actuellement `id` et `nom` : **elle ne porte pas de variables**.
  Les valeurs restent sur les participations locales et peuvent varier selon l’entretien.
- `Locuteur.personneRef` permet de retrouver les interventions d’une même personne.
  `Locuteur.interviewer` fournit le rôle sans interpréter son nom.
- `src/renderer/editor/cas.ts` projette les cas en plages de leurs entretiens sources,
  avec règles, ajouts manuels, diagnostics et vues de matériaux.
- `src/renderer/editor/passages.ts` fournit la résolution des passages et leur lecture
  originale ou pseudonymisée.
- `useCasCorpus.ts` montre comment tenir compte de la source actuellement ouverte,
  charger les autres sources et ignorer des résultats devenus périmés.
- La recherche corpus et les exports offrent des exemples de parcours du modèle et
  de retour aux positions du texte, mais **pas encore un moteur lexical réutilisable tel quel**.

Attention à la réutilisation : les compteurs de mots existants ne définissent pas tous
le même découpage. Les schémas minimaux de lecture des passages/recherches ne constituent
pas non plus une garantie de prise en charge de tous les nœuds du document. Vérifier
notamment les sauts internes `hardBreak` et leurs positions, traités dans la projection
export, avant de réutiliser ces lecteurs pour Lexico.

## 3. Contrat fonctionnel à fixer avant le calcul

### 3.1 On sélectionne des occurrences, pas seulement des entretiens

Chaque occurrence doit rester rattachée à son entretien, sa plage dans le texte,
son locuteur local éventuel et sa personne éventuelle. Les thèmes et les cas
sélectionnent des plages de texte ; ils ne produisent pas de copies des occurrences.

| Filtre | Effet attendu |
| --- | --- |
| Entretiens | Retenir le texte des entretiens choisis, sous réserve des autres filtres |
| Variable d’entretien | Retenir les entretiens portant les modalités choisies |
| Variable de locuteur | Retenir seulement les paroles des locuteurs portant ces modalités |
| Personnes | Retenir les paroles des locuteurs liés aux personnes choisies |
| Thèmes | Retenir les occurrences dans les passages codés avec les thèmes choisis |
| Cas | Retenir les occurrences dans les matériaux des cas choisis |
| Enquêteurs | Inclure ou exclure les paroles selon le rôle local |

Exemples décisifs :

- « Sexe = M — variable de locuteur » ne sélectionne pas toutes les paroles d’un
  entretien parce qu’un homme y participe.
- « Personne Marie » sélectionne ses paroles dans plusieurs entretiens.
- « Cas Marie » peut aussi contenir des paroles de Paul ajoutées manuellement.
- « Personne Marie ET Cas Marie » ne garde que les paroles de Marie présentes dans
  les matériaux de ce cas. Cela peut être plus étroit que chacun des deux filtres.
- Deux variables de locuteur s’évaluent sur **le même locuteur de l’occurrence**,
  jamais sur deux participants différents du même entretien.

### 3.2 Une combinaison volontairement limitée

Proposition pour le premier moteur :

- **OU entre les choix d’une même liste** : entretien X ou Y ; personne A ou B ;
  thème T ou U ; cas C ou D ; modalité M ou F d’une même variable.
- **ET entre les dimensions**, ainsi qu’entre les différentes variables.
- Aucun OU libre entre dimensions, aucune négation de groupe et aucune parenthèse
  arbitraire dans ce premier périmètre.

Le calcul est l’intersection des contraintes sur une même occurrence. Plusieurs
thèmes ou cas couvrant le même mot ne le font compter qu’une seule fois.

Une sélection thématique porte par défaut sur les codes explicitement choisis.
Si l’arbre propose « sélectionner cette branche », l’action doit annoncer qu’elle
inclut les descendants et mettre leurs cases à jour ; aucune inclusion implicite
invisible des sous-thèmes.

### 3.3 « Sans restriction » n’est pas toujours « toutes les cases cochées »

Prévoir un état **Sans restriction** distinct d’une liste de choix :

- sans filtre Personnes, conserver aussi les paroles non liées à une personne ;
- choisir toutes les personnes du registre ne couvre pas nécessairement tout le texte ;
- choisir tous les cas ne couvre pas nécessairement les passages hors cas ;
- choisir tous les thèmes ne couvre pas les passages non codés ;
- une liste explicitement vide signifie **aucun matériau**, pas un retour automatique
  au corpus entier.

L’interface doit proposer « Retirer ce filtre » séparément de « Tout cocher » et
« Tout décocher ». Dans un onglet sans restriction, cocher un premier élément crée
la sélection correspondante ; cette action ne doit pas être interprétée comme une exclusion.

Pour les entretiens, on peut démarrer avec tous les entretiens cochés : c’est bien
l’univers des sources de travail. Les autres dimensions commencent sans restriction.

Pour les variables, proposer « Non renseigné » explicitement. Une valeur invalide
ou une source illisible n’est pas une simple donnée manquante. Une parole sans
locuteur identifié n’est pas non plus une valeur manquante d’un locuteur existant :
la distinguer, et ne pas la rattacher automatiquement aux modalités sélectionnées.

Le filtre Personnes peut proposer « Locuteurs sans personne associée » et, séparément,
« Passages sans locuteur », si ces catégories sont nécessaires pour couvrir le texte.
Elles doivent rester distinctes des personnes identifiées dans les compteurs.

### 3.4 Cas, rôles et chevauchements

- Réutiliser les matériaux effectivement projetés du cas, **règles et ajouts manuels**.
- Une famille sert à retrouver/cocher ses cas ; elle n’est pas un cas supplémentaire.
- Réunir les plages d’un même entretien, puis dédupliquer les occurrences, y compris
  entre plusieurs cas sélectionnés.
- Les restrictions internes d’une règle de cas restent en vigueur. L’option Lexico
  « Inclure les enquêteurs » ne peut pas ajouter à un cas des passages absents de ses matériaux.
- Afficher cette explication près du filtre Cas, sans détailler toutes les règles
  dans la ligne principale du résumé.
- Reporter les repères orphelins et sources indisponibles. Un cas non résolu n’est
  jamais présenté silencieusement comme vide.

Le choix règles seules/ajouts manuels seuls et le filtrage par attributs de cas sont
**différés**. Le premier onglet Cas sert simplement à choisir des dossiers existants.

## 4. Ergonomie proposée

### 4.1 Un panneau de filtres, pas cinq colonnes étroites

Proposition initiale à essayer sur une maquette :

- grande fenêtre Lexico, ouverte depuis Corpus ou Entretien ;
- une zone de résultats qui garde l’essentiel de la largeur ;
- un panneau latéral de largeur confortable, masquable ;
- des onglets **Entretiens · Variables · Personnes · Thèmes · Cas**, dont un seul
  contenu est visible à la fois ;
- sur une fenêtre étroite, une navigation verticale ou un sélecteur plutôt que
  plusieurs colonnes de plus en plus petites.

Cela évite de prolonger la V1 qui divise l’espace disponible entre les panneaux ouverts.
Le choix final de disposition reste à valider visuellement, notamment avec cinq libellés.

### 4.2 Deux états visuels indépendants

| État | Présentation proposée |
| --- | --- |
| Onglet consulté | Fond contrasté, libellé renforcé, bordure/trait de sélection et état accessible |
| Filtre appliqué dans cet onglet | Badge textuel persistant, même si l’onglet n’est pas ouvert |
| Sans restriction | Absence de badge de filtre, ou libellé « Tous » lorsque cela est exact |
| Choix dans une liste | Cases cochées/décochées, état partiel pour les actions globales |

Exemples : `Entretiens · 48/50`, `Variables · 2 critères`, `Personnes · 3 choisies`,
`Cas · 1 choisi`.

Un badge exprime **la sélection demandée**, pas nécessairement le nombre d’éléments
qui contribuent après tous les autres filtres. Le bilan des résultats donne ces
nombres effectifs séparément. Ne pas annoncer « 48 entretiens analysés » si les
variables ne laissent finalement des occurrences que dans 12 entretiens.

Fermer le panneau ou consulter un autre onglet **ne retire aucun filtre**.
Ne pas compter uniquement sur la couleur ; prévoir navigation clavier, focus visible
et états `aria-selected` pour les onglets. Aucun geste essentiel réservé au clic droit.

### 4.3 Bilan permanent et détail repliable

Exemple de bilan :

> **12 entretiens avec résultats · 18 420 occurrences · 2 310 formes**
> 3 critères appliqués — **Voir les critères** · **Réinitialiser la sélection**

Les chiffres ci-dessus sont illustratifs. Les avertissements de lecture incomplète
et l’état « Résultats à actualiser » restent visibles même lorsque le détail est replié.

Exemple de détail :

```text
Sélection des matériaux
  Entretiens : tous, sauf « X » et « Y » (48 sur 50)
  Paroles de locuteurs dont Sexe = M
  Dans les passages du thème « Travail »

Traitement lexical
  Paroles des enquêteurs exclues
  Texte pseudonymisé

Affichage des résultats
  Nombres masqués ; fréquence minimale : 2
```

Préférer une liste de lignes à une longue formule : elle rend les portées visibles
et se replie facilement. Une aide courte explique : « Les critères se cumulent ;
les choix d’une même liste sont réunis. » Si nécessaire, des séparateurs « ET »
peuvent être testés, sans imposer « inter », `∩` ou des parenthèses.

Le détail peut offrir « Modifier » sur une ligne pour ouvrir son onglet. Ne pas en
faire un deuxième éditeur indépendant. La première version peut se contenter d’une
liste en lecture seule et d’un bouton global de réinitialisation.

## 5. Résumé des requêtes : faisabilité et limites

### 5.1 Le cas des 48 entretiens sur 50 est simple

À partir d’un univers d’entretiens `U` et d’une sélection `S` sur le même état des sources :

- aucun choisi : « Aucun entretien » ;
- tous choisis : « Tous les entretiens (50) » ;
- petite sélection : « Entretiens X et Y (2 sur 50) » ;
- petites exclusions : « Tous les entretiens sauf X et Y (48 sur 50) » ;
- sélection et exclusions longues : « 27 entretiens sur 50 — Voir la liste ».

On calcule seulement le complément `U − S`. **Aucun moteur de simplification
booléenne n’est nécessaire.** Un seuil d’affichage à essayer : jusqu’à trois noms,
avec une limite de longueur ; au-delà, compteur et liste dépliable. Ce seuil est
un réglage ergonomique, pas une règle métier.

La liste complète doit toujours rester accessible, même quand les noms sont trop longs.
Les entretiens homonymes doivent pouvoir être distingués par un complément lisible.

Le résumé provient des choix, **pas de la liste des entretiens ayant produit des mots** :
un entretien choisi mais vide ne doit pas devenir une exclusion inventée.

### 5.2 Ne pas confondre présentation courte et règle dynamique

La formulation « tous sauf X et Y » peut n’être qu’une façon courte d’afficher une
sélection actuelle. Elle ne doit pas transformer silencieusement une liste explicite
en règle qui inclura tous les futurs entretiens.

Pour le premier livrable :

- pas de sauvegarde de requêtes ;
- calcul et résumé sur le même état chargé des sources ;
- sans restriction, une actualisation prend en compte les nouveaux entretiens ;
- une sélection explicite conserve les identifiants choisis ; de nouveaux entretiens
  sont signalés et ne sont pas ajoutés implicitement à cette sélection ;
- un identifiant supprimé/introuvable est signalé, jamais oublié silencieusement ;
- après actualisation, recalculer les compteurs et la formulation depuis cet état.

Si des sélections enregistrées sont ajoutées un jour, il faudra choisir et présenter
explicitement « liste fixe » ou « tout sauf…, y compris les futurs ajouts ». Ce besoin
n’est pas requis pour résoudre la demande actuelle.

### 5.3 Pourquoi il ne faut pas généraliser « sauf » partout

**Entretiens :** leurs occurrences sont distinctes par source. Le complément est sûr.

**Variables :** « Sexe : toutes les modalités sauf F » ne signifie pas automatiquement
« Sexe = M » : il peut exister d’autres modalités et des valeurs non renseignées.
Afficher d’abord les modalités retenues et la portée. Différer le raccourci par complément.

**Personnes :** les personnes du registre ne couvrent pas nécessairement tout le texte.
« Toutes les personnes sauf Marie » reste ambigu quant aux locuteurs non liés et aux
passages sans locuteur. Pour commencer, garder la liste des personnes ou leur nombre.

**Thèmes et cas :** leurs ensembles de passages peuvent se chevaucher. Choisir tous
les cas sauf C ne revient **pas** à retirer du corpus tous les passages de C : un
passage de C peut aussi appartenir à D, encore sélectionné. Les passages hors cas
introduisent une autre différence. Même problème pour les thèmes.

Par conséquent :

- afficher « Dans les cas A et B », ou « Dans les matériaux de 12 cas — Voir la liste » ;
- ne pas reformuler cela en « Corpus moins cas C » ;
- ne pas inventer une exclusion de passages quand l’utilisateur a seulement décoché
  une catégorie de la liste ;
- conserver des formulations directes même si elles sont un peu plus longues.

**Décision recommandée : réserver le raccourci automatique par complément aux
entretiens dans la première version raffinée.** C’est déjà la réponse au problème
concret posé, sans élargir inutilement la complexité.

### 5.4 Ce qui est explicitement hors périmètre

- Saisie ou édition d’une formule textuelle.
- Langage de requête, arbre logique libre et groupes imbriqués.
- Simplification entre dimensions (« ce thème implique déjà cette variable »).
- Résumé déduit automatiquement des résultats plutôt que des critères.
- Formulation par un modèle de langage : inutile et susceptible de changer le sens.
- Réécriture universelle en expression mathématique minimale.

## 6. Socle technique proposé

### 6.1 Séparer les responsabilités, sans framework générique

Organisation indicative, à ajuster au moment du développement :

- `src/shared/lexico/` : types, normalisation des filtres, sélection, agrégation,
  résumé déterministe, export tabulaire et, plus tard, statistiques ;
- `src/renderer/editor/lexico.ts` : adaptation du document aux occurrences avec
  positions, locuteurs et annotations, en s’appuyant sur les primitives existantes ;
- `src/renderer/composables/corpus/useLexicoCorpus.ts` : chargement, état de session,
  actualisation, annulation et navigation vers les sources ;
- `src/renderer/components/lexico/` : fenêtre, filtres, index et concordances ;
- intégration dans `App.vue`, `sonal.ts` et `BarreOutils.vue` selon les fenêtres existantes.

Ne pas analyser le DOM de l’éditeur, ni exporter en HTML V1 pour le relire ensuite.
Ne pas dupliquer le moteur de règles des cas. Si nécessaire, isoler des primitives
pures communes à la projection de cas et à Lexico, avec tests de non-régression.

### 6.2 Une seule description des filtres

Un objet typé simple suffit : sélection d’entretiens, modalités par variable,
personnes, thèmes, cas et option de rôle. Chaque sélection distingue « sans restriction »
et « choix explicites », y compris un choix vide. Utiliser les identifiants, jamais
les noms, comme références.

Trois consommateurs lisent ce même objet :

1. le calcul des occurrences retenues ;
2. l’état des contrôles visuels ;
3. le résumé des critères.

La visibilité des onglets est un autre état. Le résumé ne doit jamais relire le DOM.
Un filtre reste affiché même si, sur les données actuelles, il ne réduit pas le résultat :
« critère appliqué » n’est pas synonyme de « critère ayant retiré au moins un mot ».

### 6.3 Un index d’occurrences, des vues dérivées

Une occurrence transporte au minimum : identité dans l’état calculé, forme,
entretien, bornes source, locuteur local et personne éventuels. Les plages des thèmes
et des cas permettent de calculer ses appartenances sans recopier les textes.

Pipeline visé :

```text
Sources cohérentes + paramètres de texte
  → occurrences lexicales avec positions
  → sélection des matériaux
  → agrégation par forme
  → recherche / seuils / tri d’affichage
  → tableau, concordances et export
```

La référence statistique future est calculée avec les **mêmes conventions lexicales,
mode de texte et option d’enquêteurs**, avant les restrictions de sous-corpus.
Le seuil de fréquence et la recherche dans le tableau ne changent pas cette référence.

Ne pas retokeniser les entretiens à chaque clic de filtre. Prévoir un index en mémoire
limité à la session ; pas de cache lexical persistant ni de modification du format
corpus dans le socle. Mesurer avant de décider d’un worker ou d’index spécialisés.

### 6.4 Découpage lexical et pseudonymisation : petit prototype obligatoire

Fixer et tester avant les grands écrans :

- casse, accents, apostrophes, traits d’union, nombres et ponctuation ;
- Unicode, nœuds textuels successifs et sauts de ligne ;
- positions source malgré les normalisations et remplacements ;
- mots coupés par une borne de thème ou de cas ;
- entités pseudonymisées de plusieurs mots et anonymisations chevauchantes.

Proposition de départ : formes en minuscules, accents conservés, convention explicite
sur apostrophes/traits d’union ; une entité pseudonymisée compte comme une unité
identifiable, non comme les mots originaux masqués. Valider cela sur un exemple V1/V2
avant de le figer. Ne pas ajouter immédiatement une multitude d’options de tokenisation.

Pour une plage coupant un mot, proposer une règle commune thèmes/cas : retenir une
occurrence dont la plage intersecte réellement le passage, sans fabriquer de fragment
lexical ; signaler cette convention dans l’aide. Tester les intersections de plusieurs
filtres sur ces mots de bord et vérifier que cette approximation au mot est acceptable.
Si elle ne l’est pas, choisir une règle plus stricte avant livraison, pas selon les vues.

Commencer avec le **texte pseudonymisé**, clairement annoncé. Les concordances et
exports doivent utiliser le même mode que les fréquences. Un mode original éventuel
est un choix explicite qui reconstruit l’index, pas un simple changement d’étiquette.
Ne pas afficher de mots originaux dans l’index tout en prétendant pseudonymiser la vue.

Réutiliser les règles d’anonymisation applicables du projet, sans supposer que la
chaîne rendue par `textePassage()` fournit une correspondance de positions suffisante.
Les noms de personnes, cas et entretiens, les variables privées et le contexte élargi
peuvent rester identifiants : un export pseudonymisé n’est pas une garantie d’anonymat.

### 6.5 Fraîcheur, erreurs et lecture seule

- Prendre en compte le document ouvert en mémoire, sans forcer sa publication pour
  une simple analyse ; conserver un état de calcul cohérent pour ses positions.
- Charger les autres sources via les services existants, avec concurrence bornée.
- Ne pas relire le serveur à chaque changement de filtre.
- Annuler/ignorer les réponses anciennes après changement de corpus ou de calcul.
- Si les sources évoluent, signaler que les résultats doivent être actualisés ;
  éviter de naviguer vers une position périmée sans vérification/recalcul.
- Les diagnostics ne disparaissent pas quand le résumé est replié.
- Une analyse incomplète reste consultable avec avertissement ; bloquer l’export
  présenté comme définitif et les statistiques comparatives tant que les sources
  nécessaires ne sont pas disponibles. Ne jamais afficher un faux zéro silencieux.
- Lexico doit fonctionner en lecture seule et ne pas modifier les sélections globales
  du corpus, les thèmes, les personnes ou les cas.

L’ouverture démarre sans héritage implicite des filtres d’autres vues. Les critères
Lexico peuvent être conservés en mémoire en fermant/rouvrant la fenêtre dans le même
corpus, puis remis à zéro au changement de corpus.

## 7. Réalisation par étapes et critères d’arrêt

### Étape A — Prototype de calcul vérifiable

**But :** vérifier le modèle avant de reproduire les écrans V1.

- Petit jeu de données contenant plusieurs entretiens, plusieurs locuteurs dans un
  même entretien, une personne présente dans deux sources, des thèmes chevauchants
  et un cas mixte automatique/manuel.
- Extraction d’occurrences, positions, mode pseudonymisé et agrégation pure.
- Filtrage d’entretiens et de rôles, concordance simple et retour à la source.
- Comparaison à un comptage manuel, puis à la V1 avec explication des écarts.
- Mesure du temps et de la mémoire sur un corpus réaliste, sans lancer une architecture
  de calcul parallèle avant d’avoir constaté un besoin.

**Passage à B :** aucune duplication, positions justes, pas de fuite des entités masquées,
et convention de comptage comprise. En cas de difficulté sur les positions ou la
pseudonymisation, la résoudre ici ; ne pas la masquer par un habillage graphique.

### Étape B — Premier Lexico utilisable

Réalisation possible en deux sous-livraisons : B1 index/concordances/entretiens,
puis B2 autres filtres V2. B1 n’est pas présenté comme une parité V1 complète.

- Activer le lanceur et intégrer la fenêtre.
- Tableau : forme, occurrences, nombre d’entretiens distincts ; tri, recherche,
  seuil de fréquence, gestion de liste longue et état vide explicite.
- Concordances depuis les occurrences réellement comptées ; contexte lisible et
  accès à l’entretien. Le contexte peut déborder le filtre, mais il n’est pas compté
  et ne doit pas être présenté comme intégralement sélectionné.
- Onglets Entretiens, Variables avec portées explicites, Personnes, Thèmes et Cas.
- Option visible d’exclusion des enquêteurs, activée par défaut comme en V1, mais
  fondée sur `interviewer`, sans exclure silencieusement les passages sans locuteur.
- Distinction visuelle onglet consulté/filtre appliqué dès cette étape.
- Bilan permanent et détail repliable sous forme de lignes simples, avec compteurs
  et accès aux listes complètes. Pas encore de raccourci automatique « sauf » requis.
- Export CSV/TSV du tableau affiché avec un bilan associé des critères, paramètres,
  sources et date du calcul. Définir les colonnes et traiter les cellules interprétables
  comme formules par les tableurs. Ne pas exporter les identités privées par défaut
  dans ce bilan sans choix explicite.
- Diagnostic de lecture et actualisation maîtrisée ; tests local et distant.

**Livrable :** produire un résultat lexical, comprendre son périmètre, vérifier ses
occurrences et l’exporter. Les cinq dimensions de sélection font partie de l’objectif
fonctionnel initial, pas d’un futur moteur avancé.

### Étape C — Raffinement court du résumé et validation ergonomique

- Ajouter la formulation compacte pour les entretiens : petite liste choisie ou
  petites exclusions, sinon compteur et détail.
- Préférer les mots courants et les lignes par portée aux opérateurs mathématiques.
- Tester le lien « Modifier » vers l’onglet concerné.
- Ajuster contraste, badges, recherche dans les listes, actions globales et place
  du détail repliable. Une recherche de liste ne modifie pas la sélection ; le périmètre
  de « Tout cocher » doit être explicite, de préférence la liste entière au départ.
- Vérifier les titres longs, homonymes, 50+ entretiens et plusieurs variables actives.

**Recette de compréhension :** demander à l’utilisateur de choisir 48 entretiens sur
50, limiter à Sexe = M, ouvrir un autre onglet, masquer les filtres, puis expliquer
quels textes sont analysés. Refaire avec Personne Marie et Cas Marie.

**Décision après essai :**

- si le résumé court est compris sans explication supplémentaire, le conserver ;
- si la reformulation « sauf » gêne ou donne une fausse impression de règle dynamique,
  revenir à « 48 entretiens sur 50 » avec la liste des exclusions dans le détail ;
- si une formule complète nécessite une formation, ne pas la développer ;
- conserver dans tous les cas les badges et le détail structuré, qui restent utiles.

Cette étape est optionnelle dans son **raffinement**, pas dans la nécessité d’expliquer
les résultats. On peut s’arrêter après B avec un module déjà exploitable.

### Étape D — Enrichissements lexicaux utiles de la V1

À prioriser selon les premiers usages, en livraisons indépendantes :

1. **Réalisé :** mots outils, regroupements manuels et concaténations, avec annulation,
   persistance dans `corpus.json` et reprise des fichiers V1 `.out`, `.lem`
   et `.cnct` pendant la migration du corpus, sans modification des originaux.
2. Nuage de mots comme vue du même tableau, sans nouveau filtrage caché.
3. Spécificités et comparaison au corpus de référence : formule documentée, contrôles
   sur petites tables connues, cas limites et dénominateurs homogènes. Si les spécificités
   négatives sont proposées, traiter aussi les formes absentes du sous-corpus.
4. Lemmatisation automatique verbale, après contrôle des ambiguïtés et possibilité
   d’afficher les formes regroupées ; ne pas promettre une analyse morphologique générale.

Reporter les nombres de personnes distinctes et de cas par forme à un besoin démontré :
ils nécessitent leurs propres libellés et règles, et ne remplacent pas une fréquence
lexicale. Des cas qui se chevauchent ne forment pas une partition statistique.

### Étape E — Fonctions avancées seulement sur demande validée

Arbres de contexte, spontanéité, analyse factorielle, comparaisons multi-groupes,
attributs de cas, filtres sur provenance des matériaux et sélections enregistrées.

Ces fonctions ne doivent bloquer ni le socle V2 ni l’amélioration de lisibilité.
L’analyse factorielle nécessite notamment un contrat sur les groupes qui se chevauchent,
indépendamment de la présence de code correspondant dans la V1.

## 8. Tests et acceptation

### Tests unitaires prioritaires

- Comptages exacts sur des textes courts ; casse, accents, apostrophes, nombres,
  sauts de ligne, Unicode et entités pseudonymisées.
- Correspondance occurrence/position, même après remplacement par un pseudo de longueur différente.
- Entretien multilocuteur : une modalité ne sélectionne pas les paroles voisines.
- Deux variables de locuteur doivent correspondre au même participant.
- Personne multientretien, homonymes distincts, absence de lien et rôle variable selon la source.
- Cas manuel, automatique et mixte ; Paul dans le cas Marie reste Paul.
- Déduplication des plages et des occurrences entre thèmes/cas ; absence de matériaux
  hors cas/thèmes correctement distinguée de « sans restriction ».
- Aucun choix, tous les choix, Non renseigné, valeur invalide et source indisponible.
- Bornes coupant un mot et intersections de plusieurs filtres.
- Résumé déterministe ; 48/50, zéro/tous, noms longs, renommage et suppressions.
- Aucune transformation « tous les cas sauf C » en soustraction des passages de C.
- Tableau, concordances et export issus de la même sélection et du même état de calcul.
- Aucun effet d’un tri, d’une recherche de forme ou d’un seuil d’affichage sur le périmètre annoncé.

### Tests d’interface

- L’onglet ouvert et les autres filtres appliqués restent reconnaissables sans la couleur seule.
- Changer d’onglet ou masquer le panneau ne change ni les critères ni les fréquences.
- Résumé long repliable, listes complètes accessibles, contrôles utilisables au clavier.
- Réinitialisation sans effet sur les autres vues du corpus.
- Actualisation après édition ; changement de corpus pendant un chargement ; aucune
  réapparition d’anciens résultats.
- Résultat vide expliqué sans prétendre identifier automatiquement quel critère est « fautif ».
- Lecture seule, sources absentes, état incomplet et export bloqué/diagnostiqué.

### Recette locale et distante

Commencer par les tests purs et les scénarios Electron locaux. Vérifier ensuite
les mêmes calculs sur les bancs GitLab et Nextcloud concernés, notamment la lecture
seule et les indisponibilités. Utiliser `preparer_bancs_docker` avant ces tests réels,
sans pull ni reprovisionnement des images.

La réalisation est couverte par les tests purs, le store local et les transactions
GitLab/WebDAV en mémoire. Les bancs réels restent réservés aux recettes distantes dédiées.

## 9. Décisions à valider au démarrage

Valeurs proposées, pour ne pas multiplier les questions avant un prototype :

- **Socle :** index, cinq dimensions de filtres, concordances et export simple.
- **Disposition :** un seul panneau de filtres à onglets, masquable.
- **Texte :** pseudonymisé au départ ; convention de tokenisation validée sur exemples.
- **Enquêteurs :** exclus par défaut, option visible et rôle local respecté.
- **Cas :** tous leurs matériaux existants, sans filtre d’attribut ou de provenance au début.
- **Requête :** bilan permanent et lignes détaillées repliables, sans formule éditable.
- **Complément :** seulement les entretiens, ajouté après validation du socle.
- **Persistance :** filtres de vue conservés en session ; traitements analytiques enregistrés
  dans `corpus.json` au format 9 ; résultats exportés séparément.
- **Arrêt possible :** après B, ou après C si le raffinement est clairement utile.

## 10. Références de lecture

V1 : `../SonalPi/modules/lexico.js`, notamment `extraireLexico`, `afficherLexico`,
`_lxHeader`, `_lxRefreshTable`, `_lxConstruireContexteFiltresActifs`,
`_lxOuvrirModalOccurrences` et les blocs d’options/statistiques.

V2 :

- `src/shared/format.ts` ;
- `src/shared/corpus/personnes.ts` et `src/shared/corpus/requetes.ts` ;
- `src/renderer/editor/cas.ts`, `passages.ts` et `rechercheCorpus.ts` ;
- `src/renderer/composables/corpus/useCasCorpus.ts` ;
- `src/shared/export/projectionEntretien.ts` ;
- `src/renderer/components/app/BarreOutils.vue` et `src/renderer/App.vue` ;
- `docs/user/cas.md`, `docs/dev/cas.md`, `docs/user/vue-corpus.md` ;
- `plans/reflexion/export-sonal-alt.md`, pour la distinction déjà étudiée entre
  personnes, cas, sélection de matériaux et groupes de comparaison.
