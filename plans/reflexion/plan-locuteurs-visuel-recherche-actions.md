# Locuteurs du corpus — visuel, recherche et commandes

## Statut et objectif

**Réalisé et qualifié : interface, recherche, statistiques et régularisation dans
l’entretien. Vérifications locales, GitLab et Nextcloud A/B réussies.**

Retrouver dans l’onglet **Locuteurs** la présentation des entretiens de l’onglet
**Entretiens**, avec leur forme d’onde et les tours de parole sélectionnés en
superposition. Regrouper les commandes dans le panneau gauche, faciliter la
recherche de plusieurs locuteurs et rendre les statistiques plus utiles.

Ce travail prolonge les parcours existants, sans changer le format des données,
les règles de rapprochement ni les garanties des corrections locales et distantes.
Les anciens plans de refonte restent des historiques, pas des listes de travaux
à réexécuter.

## 1. Décisions validées

- Employer **locuteur** dans l’interface, sans alterner avec « personne », « voix »
  ou « identité ». Les distinctions techniques restent internes.
- L’entretien permet de créer et nommer les locuteurs, d’attribuer les passages,
  de régulariser les entrées non valides et d’effectuer une association.
- Lorsqu’un nom identique ou proche est saisi dans l’entretien, conserver la
  proposition de reconnaître un locuteur existant, sans association automatique.
- Un refus ou un retrait volontaire d’association n’est jamais rétabli
  automatiquement par un nouveau nom.
- Le corpus présente les locuteurs valides, même présents dans un seul entretien,
  et permet de consulter leurs interventions et de gérer leurs associations.
- Retirer **Conserver séparément…** et son message du parcours corpus.
- Reprendre la présentation des cartes d’**Entretiens**, avec forme d’onde et
  tours de parole sélectionnés superposés, comme les thématiques dans cet onglet.
- Accepter un placement indicatif suivant le déroulement du texte : ce chantier
  ne construit pas une synchronisation précise avec l’audio.
- Afficher les tours de parole des seuls locuteurs sélectionnés. Ne pas colorer
  les tours des autres locuteurs ni les passages non attribués.
- Rechercher avec des tags validés par Entrée, combinés avec **OU**.
- Enrichir les statistiques avec des indicateurs simples et pertinents.

## 2. Locuteurs valides et entrées à vérifier

### Règle de présentation

Une entrée est admise dans la liste lorsque sa participation est rattachée à une
référence de locuteur existante et exploitable. Le nombre d’entretiens associés
n’est pas un critère de validité. Un nom seul ne suffit pas à réunir deux entrées.

Les passages non attribués ne deviennent pas une ligne « Sans locuteur » dans le
répertoire. Leur attribution reste une action de l’entretien.

Les anciennes entrées sans référence valide ne figurent pas dans le répertoire
principal et ne sont pas proposées au regroupement depuis le corpus. Ne pas les
supprimer des fichiers, les convertir ou les associer silencieusement.

### Ne pas masquer les omissions

Prévoir une indication discrète lorsqu’une vérification est nécessaire :

> Certains locuteurs nécessitent une vérification dans leur entretien.
> **Voir les entretiens concernés**

Cet accès liste les entretiens et permet de les ouvrir, sans proposer une nouvelle
commande de régularisation dans le corpus. Ne pas confondre cette indication avec
celle des entretiens indisponibles, dont le contenu n’a pas pu être examiné.

Avant de retirer la commande corpus, vérifier que l’entretien permet réellement
la régularisation des différents cas : référence absente, référence disparue,
ancien retrait volontaire et nom vide. Compléter ce parcours si nécessaire,
sans rétablir d’ancienne association. Une simple ouverture ne modifie rien.

## 3. Organisation de l’écran

### Panneau gauche : rechercher, sélectionner, agir

Ordre proposé :

1. Barre compacte de commandes avec infobulles et noms accessibles.
2. Recherche et tags retirables.
3. Compteurs de résultats et de sélection.
4. Liste des locuteurs, avec nombre d’entretiens et contexte pour les homonymes.
5. Réglage des entretiens affichés et accès secondaires, selon la place disponible.

Commandes principales :

| Commande | Condition de présentation |
| --- | --- |
| Effacer la sélection | Une sélection existe. |
| Renommer… | Un seul locuteur valide est sélectionné. |
| C’est le même locuteur… | Plusieurs locuteurs valides sont sélectionnés. |
| Dissocier… | Un locuteur possède plusieurs participations associées. |
| Statistiques | Une sélection existe ; ouvre ou ferme son bilan. |
| Détails et vérifications… | Consultation secondaire et accès aux vérifications. |

Utiliser des icônes cohérentes avec l’application, sans ambiguïté entre effacer une
sélection et supprimer des données. Garder l’ordre des commandes prévisible.
Un bouton présent mais indisponible doit avoir une explication compréhensible.
Préserver les confirmations de renommage, regroupement et dissociation.

Les réglages de recherche et d’affichage restent possibles en lecture seule.
Les droits, indisponibilités et opérations en cours continuent à encadrer les
modifications ; déplacer les boutons ne modifie aucune autorisation.

### Panneau droit : visualiser

Conserver ici uniquement les actions propres à chaque entretien : **Ouvrir** et
navigation entre les tours de parole sélectionnés. Les détails et statistiques
peuvent s’afficher dans cette zone ; leurs commandes d’ouverture restent à gauche.

Prévoir un panneau gauche redimensionnable si le composant existant est adapté,
un défilement indépendant et un empilement propre dans une fenêtre étroite.

## 4. Cartes d’entretien et superposition

Reprendre les dimensions, espacements, titre, bouton d’ouverture et cadre de forme
d’onde de l’onglet **Entretiens**. Réutiliser les images déjà disponibles via
`urlWaveform`, sans régénération ni copie des médias pour ce chantier.

- Dessiner un calque semi-transparent des tours sélectionnés, en conservant
  l’onde lisible et des couleurs stables pour chaque locuteur.
- Conserver les positions et largeurs relatives dans le texte complet.
  Les portions non sélectionnées ne sont pas supprimées de l’axe ni comprimées.
- Ne pas ajouter de calque thématique dans cette vue : reprendre son principe
  visuel, pas cumuler les deux informations.
- Un clic sur un tour ouvre le passage correspondant dans l’entretien.
- Garder une navigation précédente/suivante utilisable au clavier, sans dépendre
  de la largeur d’une très courte intervention.
- Sans audio, garder le cadre et les tours sélectionnés sur un fond neutre,
  avec un libellé adapté. Sans tour sélectionné, garder la carte sans calque.
- Sans sélection, montrer les cartes sans calque et inviter brièvement à choisir
  des locuteurs, plutôt que colorer tous les tours par défaut.

Mention courte à proximité de la vue :

> Les couleurs suivent le déroulement du texte, pas le temps audio exact.

Ne pas présenter le clic comme une recherche de seconde audio ni calculer une
durée de parole à partir de ces largeurs.

### Entretiens affichés

Conserver les deux périmètres, avec des libellés explicites à gauche :

- **Avec la sélection** : seulement les entretiens associés à la sélection.
- **Tous les entretiens** : tous les entretiens lisibles ; seuls les tours de la
  sélection ont un calque. Les autres cartes restent visibles sans coloration.

Par défaut, une sélection active affiche les entretiens concernés. Sans sélection,
afficher tous les entretiens. Les tours non sélectionnés restent présents dans le
texte de l’entretien ; aucun filtrage ne modifie les données ni l’ouverture complète.

## 5. Recherche multitag et sélection persistante

- Entrée transforme la saisie non vide en tag ; chaque tag possède une commande
  de retrait accessible. Éviter les doublons en ignorant casse et accents.
- Un tag recherche dans le nom commun, les noms dans les entretiens associés
  et les titres d’entretiens, comme la recherche actuelle.
- Plusieurs tags combinent leurs résultats avec **OU**, sans doublonner les lignes.
- Recommandation : la saisie non validée sert d’aperçu et se combine elle aussi
  avec les tags en OU. La vider conserve les tags ; retirer le dernier tag sans
  saisie rétablit la liste complète.
- Une recherche ne désélectionne jamais un locuteur devenu invisible.
- Indiquer les sélections masquées : **4 sélectionnés, dont 2 masqués par la recherche**.
- Les actions et statistiques portent sur toute la sélection, y compris masquée.
  Les aperçus de confirmation en rappellent la portée.
- Distinguer retirer un tag, effacer la recherche et effacer la sélection.
- Ctrl/⌘-clic et Maj restent disponibles ; Ctrl/⌘-A sélectionne les résultats
  filtrés, pas tous les locuteurs invisibles du corpus.
- Une plage Maj suit l’ordre filtré courant ; gérer une ancre masquée sans
  sélectionner implicitement des lignes hors recherche.
- Conserver recherche, tags, sélection et périmètre lors d’un changement d’onglet
  ou d’un aller-retour dans l’entretien ; les réinitialiser au changement de corpus.
- Après actualisation, retirer uniquement les références réellement disparues ou
  devenues invalides. Après correction, réconcilier la sélection avec le résultat
  et conserver la recherche autant que possible, sans cacher la réussite.

## 6. Statistiques proposées

### Bilan de la sélection

Afficher le nombre de locuteurs sélectionnés, le nombre d’entretiens distincts,
le nombre de mots et le nombre de tours de parole. Un tour correspond au même
regroupement de paragraphes consécutifs que dans les statistiques de l’entretien.

### Comparaison par locuteur

Tableau triable : **Locuteur · Entretiens · Mots · Tours de parole · Part des mots
de la sélection**. Une petite barre proportionnelle peut accompagner le pourcentage,
avec la même couleur que sur les cartes. Les homonymes restent distincts.

### Détail par entretien

Tableau : **Entretien · Mots de la sélection · Tours de parole de la sélection ·
Part des mots de l’entretien**. Permettre d’ouvrir l’entretien depuis cette ligne.

La part dans l’entretien utilise tous les mots comptés de sa transcription,
y compris les passages non attribués ou attribués à des entrées à vérifier.
L’expliquer dans l’aide du pourcentage : exclure ces mots gonflerait artificiellement
la part des locuteurs sélectionnés. Leur présence dans le dénominateur ne crée pas
un locuteur dans la liste. Réutiliser le comptage existant, sans relire les documents
à chaque clic ni transporter les transcriptions dans le renderer pour ce bilan.

Les statistiques ne changent pas lorsqu’on passe de « Avec la sélection » à
« Tous les entretiens » ou lorsqu’une recherche masque une partie de la sélection.
Elles restent fondées sur la sélection entière et les entretiens lisibles associés.
Afficher clairement les limites d’un bilan incomplet ; gérer les dénominateurs nuls.

**Hors de cette livraison :** estimation de durée audio, débit, interruptions,
chevauchements et statistiques de conversation exigeant une synchronisation fiable.

## 7. Points d’appui au démarrage du chantier

- `src/renderer/components/traiter/corpus/Corpus.vue` : cartes et superposition
  thématique, images des formes d’onde.
- `src/renderer/components/traiter/corpus/LocuteursCorpus.vue` : recherche simple,
  sélection, périmètre des entretiens et statistiques actuelles.
- `src/renderer/components/traiter/corpus/BarreInterventionsLocuteurs.vue` :
  représentation actuelle des tours, ouverture et redimensionnement.
- `src/renderer/components/traiter/corpus/CorrectionsLocuteursCorpus.vue` :
  boutons, confirmations et régularisation actuellement proposée dans le corpus.
- `src/renderer/components/traiter/corpus/DetailsLocuteursCorpus.vue` : détails,
  propositions et vérifications secondaires.
- `src/shared/corpus/repertoireLocuteurs.ts` : projection calculée, avec aujourd’hui
  une ligne de repli pour les participations sans référence valide.
- `src/shared/entretien/statistiquesLocuteurs.ts` : comptage et regroupement des tours.
- `src/renderer/composables/entretien/useLocuteursEntretien.ts` : nommage,
  création et propositions de rapprochement à préserver.

Extraire un composant de carte ou un cadre visuel partagé si cela évite la
duplication, sans réécrire les interactions de l’onglet Entretiens. Garder une
projection de consultation et des agrégats bornés ; préserver le chargement
progressif des listes et des cartes.

## 8. Lots de réalisation

- [x] **A — Périmètre et régularisation.** Tester la validité, séparer les entrées
  à vérifier, assurer leur traitement dans l’entretien puis retirer la commande
  et les textes « Conserver séparément » du corpus.
- [x] **B — Recherche et sélection.** Tags OU, aperçu de saisie, sélection persistante,
  compteurs et interactions clavier ; remplacer la purge liée au filtre actuel.
- [x] **C — Organisation du panneau gauche.** Déplacer les commandes, ajouter les
  icônes et le périmètre d’affichage ; préserver dialogues et protections existants.
- [x] **D — Cartes et calques.** Harmoniser avec Entretiens, intégrer les ondes,
  ne superposer que les tours sélectionnés et préserver la navigation accessible.
- [x] **E — Statistiques.** Étendre la projection avec les agrégats nécessaires,
  ajouter les bilans et comparaisons, expliciter les pourcentages et bilans incomplets.
- [x] **F — Qualification et aide.** Vérifier le rendu et les parcours, adapter
  tests, documentation utilisateur et captures concernées.

## 9. Vérifications et critères d’acceptation

- Un locuteur valide d’un seul entretien apparaît ; un homonyme n’est jamais réuni
  automatiquement ; une entrée invalide n’apparaît pas dans la liste principale.
- Chaque cas écarté possède un parcours utilisable dans son entretien. Un passage
  non attribué reste à traiter dans l’entretien, sans ligne artificielle au corpus.
- La saisie d’un nom identique ou proche continue à proposer une association dans
  l’entretien. Refuser conserve des locuteurs distincts ; un ancien retrait n’est
  pas annulé automatiquement. Une simple consultation n’écrit rien.
- Les tags fonctionnent avec accents, casse, doublons, absence de résultats et retrait.
  Modifier la recherche préserve les sélections masquées, y compris pour une correction.
- Les commandes apparaissent selon la sélection ; lecture seule, entretien indisponible,
  conflit de regroupement et correction distante en cours gardent leurs protections.
- Une dissociation conserve au moins une participation sur le locuteur d’origine ;
  ses conséquences sur les cas restent expliquées avant confirmation.
- Les cartes montrent seulement les tours sélectionnés, sans comprimer l’axe.
  Tester audio présent ou absent, tours très courts, entretien vide et aucune sélection.
- Clic, navigation clavier et retour depuis l’entretien conservent le contexte.
- Les statistiques évitent les doubles comptes, distinguent les dénominateurs,
  supportent zéro mot et les entretiens indisponibles, et ignorent les filtres visuels.
- Contrôler une fenêtre étroite, une sélection importante et un corpus volumineux.
  Le cadre partagé ne dégrade ni les thèmes ni la recherche de l’onglet Entretiens.
- Exécuter les tests unitaires et renderer ciblés, les parcours Electron pertinents,
  puis la vérification TypeScript et la compilation selon les scripts du dépôt.
- Vérifier les parcours locaux et distants concernés. Avant tout test GitLab ou
  Nextcloud réel, utiliser `preparer_bancs_docker`, sans téléchargement d’images.
  Rapporter les tests réussis, échoués, sautés ou non exécutés séparément.

## 10. Limites et choix de réalisation proposés

Les décisions fonctionnelles de la section 1 sont actées. Le placement exact des
commandes secondaires, le partage du composant de carte et les détails des tableaux
restent des choix de réalisation à valider visuellement, pas des demandes de refonte
du modèle. Le comportement de la saisie non validée et les dénominateurs décrits
ci-dessus sont les recommandations de ce plan.

Aucun changement de version, tag, publication, migration générale ou nettoyage des
anciens mécanismes internes n’est inclus dans ce chantier d’interface.

## 11. Bilan de réalisation

- `CadreOndeCorpus.vue` partage le cadre d’onde avec Entretiens ; le canvas des
  locuteurs reste transparent et ne dessine que la sélection, sans recalage audio.
- Les commandes sont à gauche, avec icônes, infobulles et noms accessibles ;
  le panneau est redimensionnable et s’empile sur une fenêtre étroite. La barre
  tient sur une ligne à largeur normale ; les retours d’erreur ne chevauchent
  ni la recherche ni les commandes.
- La recherche accepte les tags OU et conserve les sélections masquées, y compris
  pour les gestes additifs et les corrections. Le retour du focus et la saisie
  pendant une composition sont couverts.
- Le répertoire sépare `aVerifier` des locuteurs valides. L’entretien propose un
  enregistrement explicite via la transaction de nommage, avec état attendu,
  relecture contrôlée, refus conservés et répétition sans doublon.
- Le dialogue de rapprochement utilise uniquement « locuteur ». Les propositions
  secondaires du corpus ne comparent que des locuteurs valides.
- Le bilan compare les locuteurs et détaille les entretiens, avec dénominateurs
  explicites, zéro mot et sources indisponibles pris en charge.
- Aide utilisateur, documentation développeur et captures concernées actualisées.

### Qualification finale

- **524 tests unitaires et renderer réussis sur 40 fichiers**, incluant les
  fournisseurs simulés, les imports et les non-régressions de consultation.
- **14 tests réussis sur serveurs réels** : six sur GitLab et huit sur Nextcloud
  A/B, dont la régularisation explicite et la reprise après réponse perdue.
- **62 parcours Electron réussis** : 48 locaux autour des locuteurs, 11 de
  documentation/style/thématiques, deux sur Nextcloud réel et un sur GitLab réel.
- `npm run typecheck`, `npm run build` et contrôle des espaces réussis.
- Aucun échec ni saut dans ces campagnes finales ciblées. Un premier lancement
  GitLab sans sa configuration avait sauté ses tests ; la campagne avec
  `qualification.env` et le certificat de confiance a ensuite exécuté les six.
- La suite générale complète du dépôt n’a pas été relancée. Ces résultats ne
  constituent pas une qualification globale de toutes les fonctionnalités.
