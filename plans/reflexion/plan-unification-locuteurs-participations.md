# Unifier les identités : Locuteur et ParticipationLocuteur

## Statut et articulation

**Statut : proposition de chantier séparé, aucune migration engagée.**

Ce chantier clarifie le modèle interne et ses références. Il est distinct de la
refonte visuelle décrite dans
[le plan de l’onglet Locuteurs](plan-refonte-locuteurs-corpus.md).

La nouvelle vue de consultation peut être conservée. Avant de poursuivre les
raccords des commandes, fixer ici le vocabulaire cible et la stratégie de
compatibilité pour éviter de multiplier les chemins Personnes/Locuteurs.

Le périmètre et la stratégie de stockage restent à valider avant implémentation.
Aucun changement de format, de version applicative ou de politique distante
n’est effectué par la rédaction de ce document.

## 1. Objectif et modèle cible proposé

L’utilisateur emploie « locuteur » dans le corpus, les entretiens, les cas et les
analyses. Le code distingue l’identité commune de ses informations contextuelles,
sans conserver deux noms concurrents pour une même identité.

| Concept cible | Responsabilité | Correspondance actuelle |
|---|---|---|
| `Locuteur` | Identité commune au corpus, identifiant et nom de référence. | `Personne`. |
| `ParticipationLocuteur` | Présence dans un entretien, identifiant local stable, index des paragraphes, nom local éventuel, rôle, pseudonyme, couleur et variables locales. | `Locuteur`. |
| `LigneRepertoireLocuteurs` | Ligne calculée pour afficher les participations et leurs statistiques ; jamais enregistrée comme identité. | Projection actuellement nommée `LocuteurCorpus`. |
| `Cas` | Unité d’étude réunissant des matériaux par règles et ajouts manuels. | `Cas`, sans changement de sens. |

On supprime le concept interne nommé Personne en reprenant sa responsabilité,
pas en supprimant les identités communes. Une égalité de noms ne devient jamais
une égalité d’identifiants.

Les noms restent locaux lorsqu’un regroupement conserve explicitement les
variantes ; les décisions de renommage global du plan d’interface restent
applicables. Les rôles, pseudonymes et variables ne deviennent pas globaux.

## 2. Cas : parler de locuteurs sans confondre les concepts

Les règles qui sélectionnent aujourd’hui des personnes sélectionneraient les
**interventions de locuteurs**. Exemples d’interface :

- « Créer un cas à partir de locuteurs » ;
- « Interventions des locuteurs sélectionnés » ;
- « Inclure les interventions où ces locuteurs posent les questions ».

Un cas ne devient pas un locuteur : il peut réunir plusieurs locuteurs, des
entretiens entiers, des matériaux déterminés par une modalité ou des ajouts
manuels. Conserver ses familles, attributs, recettes et repères de passage.

Les règles référencent les identités communes du corpus. Leur résolution retrouve
les participations et les interventions dans chaque entretien. Le rôle enquêteur
reste évalué sur chaque participation, pas sur une propriété globale du locuteur.

Pour une première unification, préserver exactement les passages résolus avant et
après conversion. Ne pas profiter du renommage pour modifier les règles d’union,
les exclusions, les attributs dérivés ou les conséquences d’une dissociation.

## 3. Point de départ constaté

Le changement est transversal, pas un remplacement de libellés :

- `CorpusFichier.personnes` référence des `Personne` ;
- `EntretienFichier.locuteurs` contient les actuels `Locuteur`, avec leur
  `personneRef` et leur index dans les paragraphes ;
- les règles de cas utilisent `personneId` et les variantes `personne/personnes` ;
- Synthèse et Lexico conservent des identifiants de personnes et des références
  locales de locuteurs, qui ne désignent pas la même chose ;
- les notes visent les identifiants des locuteurs locaux ;
- les refus de rapprochement peuvent viser une personne ou un locuteur local ;
- les journaux, plans de reprise, imports, exports et politiques distantes
  utilisent également ces types ou leurs références ;
- les nouvelles commandes de correction coexistent encore avec les anciennes,
  et les deux écrans restent accessibles pendant la construction.

Le format courant est versionné et possède déjà des migrations. Toute évolution
des structures enregistrées doit passer par ce mécanisme, pas par une réécriture
silencieuse à la consultation.

## 4. Invariants de conservation

- Réutiliser les identifiants existants, sans recréer les identités depuis les noms.
- Préserver les identifiants locaux des participations et les attributions des
  paragraphes. Le champ historique `loc` désigne un index local, jamais un id corpus.
- Ne pas convertir les liens de notes en liens vers une identité commune : ils
  continuent à viser les participations dans leur contexte.
- Conserver les noms locaux, rôles, couleurs, pseudonymes et valeurs existants.
- Conserver la distinction entre une participation sans identité commune et un
  passage sans attribution de parole. Les filtres actuels `sansPersonne` et
  `sansLocuteur` ne peuvent pas être fusionnés par simple renommage.
- Préserver les refus et les retraits volontaires d’association.
- Préserver les cas, familles, attributs, repères, recueils et filtres enregistrés.
- Préserver l’interdiction actuelle de réunir deux participations d’un même entretien.
- Ne pas créer des identités pour toutes les données anciennes sous prétexte de
  renommer les types. La création automatique et la régularisation des anciens
  corpus sont des comportements distincts, définis par le plan d’interface.
- Une consultation ou une source illisible ne doit provoquer aucune suppression.

## 5. Organisation du code cible

### Modèle et projections

Une seule définition métier de `Locuteur`, une seule définition de
`ParticipationLocuteur`, des projections explicitement nommées comme telles.

Renommer la projection actuelle en `LigneRepertoireLocuteurs` et placer son calcul
dans un module de projection. Ne pas enrichir la ligne d’affichage jusqu’à en
faire un troisième modèle propriétaire des données.

### Commandes et persistance

Un ensemble cohérent de commandes pour identifier, associer, renommer, regrouper,
dissocier et supprimer une identité vide. Les deux écrans appellent les mêmes
opérations. Leurs fonctions élémentaires et leurs préconditions sont communes.

Éliminer la dépendance circulaire de types entre `personnes.ts` et
`correctionsLocuteurs.ts`. Les contrats ne dépendent pas de leur implémentation.
Réutiliser les transactions locales existantes plutôt que créer un autre moteur.

Migrer les appelants puis retirer les anciennes commandes devenues inutiles.
Conserver une traduction de compatibilité seulement lorsqu’un véritable format
historique ou un journal récupérable l’exige, avec une responsabilité explicite.

### Interface

Un écran Locuteurs, des composants de détails pour notes, valeurs et corrections.
Ne pas conserver durablement l’écran Personnes entier imbriqué dans le nouveau.
La consultation et les droits distants doivent rester explicites pendant la
transition, sans ouvrir de commandes non qualifiées.

## 6. Compatibilité des données : décision préalable

Deux stratégies sont possibles ; en choisir une avant le renommage transversal :

1. **Conserver d’abord le format enregistré.** Utiliser le vocabulaire cible dans
   le modèle et traduire les noms historiques à la lecture et à l’écriture.
   Centraliser cette traduction aux frontières, sans multiplier les alias dans
   les fonctions métier. Aucun changement de format n’est alors justifié par le
   seul renommage de types.
2. **Faire évoluer le format enregistré.** Définir la version suivante et sa
   migration explicite pour corpus, entretiens, règles de cas, filtres et autres
   références persistées. Prévoir sauvegarde, interruption et reprise sûre.

La décision doit tenir compte du nombre réel de frontières et des données
persistées, pas seulement de l’esthétique des noms dans les fichiers. Éviter une
couche de traduction dispersée aussi bien qu’une migration inutilement massive.
Les essais se font sur des copies synthétiques ou autorisées, jamais sur les
corpus personnels de travail.

Attention aux identifiants homonymes dans le code : l’actuel `personneId` devient
l’id du locuteur commun, tandis que l’actuel `locuteurId` désigne souvent une
participation. Aucune substitution globale de chaînes ne peut distinguer ces
sens. Même précaution pour les refus `personne:…` et `locuteur:…`.

Reconnaître ou terminer les transactions et journaux historiques avant de les
convertir. Une ancienne intention ne doit pas réintroduire des références
incompatibles après une migration.

## 7. Étapes de mise en œuvre

1. **Inventaire et stratégie.** Cartographier types, références et frontières ;
   choisir la stratégie de stockage et consigner les comportements inchangés.
2. **Tests de caractérisation.** Fixer les identités, participations, matériaux de
   cas et résultats d’analyses obtenus avant transformation, y compris les manques.
3. **Contrats et vocabulaire.** Introduire le modèle cible, clarifier les
   projections et établir un seul contrat de commandes, sans modifier les données.
4. **Cœur métier et stockage.** Migrer règles, persistance et transactions selon
   la stratégie choisie, avec préservation des identifiants et reprise testée.
5. **Usages transversaux.** Adapter cas et familles, notes, variables, Synthèse,
   Lexico, autres analyses, imports, exports, pseudonymisation et navigation.
6. **Interface et retrait des doublons.** Raccorder les deux écrans aux commandes
   communes, remplacer le répertoire historique par des détails ciblés et retirer
   les anciens chemins après migration de leurs appelants.
7. **Qualification finale.** Vérifier la compatibilité, les résultats inchangés,
   les documentations et l’absence de vocabulaire historique dans le métier actif.

Ne pas prolonger le développement de deux modèles en parallèle pendant ce lot.
L’activation des corrections distantes n’en fait pas partie. Si une modification
commune touche leur lecture ou leur stockage, qualifier ce périmètre ou maintenir
explicitement la compatibilité ; ne pas réécrire un miroir distant en contournant
les droits du fournisseur.

## 8. Critères de fin

- Un développeur identifie sans ambiguïté le locuteur commun, sa participation
  locale et la ligne calculée affichée dans le répertoire.
- Le métier actif n’utilise plus Personne comme un concept parallèle.
- Cas et analyses parlent de locuteurs, sans perdre leur portée ni leurs résultats.
- Les mêmes corpus produisent les mêmes identifiants, passages, comptes et
  résultats avant et après conversion, hors changements fonctionnels explicités.
- Les notes, variables et rôles gardent leurs propriétaires d’origine.
- Les anciens corpus, filtres et intentions récupérables restent interprétables.
- Il n’existe ni deux ensembles concurrents de commandes ni deux écrans complets
  pour corriger les mêmes identités.
- La compatibilité restante est documentée et limitée aux frontières concernées.
- Les tests locaux et Electron passent ; les tests distants éventuellement
  nécessaires utilisent `preparer_bancs_docker`, sans pull ni reprovisionnement.
