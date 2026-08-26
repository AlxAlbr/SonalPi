# Plan — Panneau métadonnées d'entretien : parité V1 depuis la vue Corpus

> Parité V1 (SonalPi VSCode) : dans la vue Corpus, cliquer une carte affiche
> dans le panneau de gauche les détails de l'entretien. On reprend les deux
> éléments V1 manquants — le bouton « Supprimer l'entretien du corpus » (les
> cartes n'ont plus de croix) et l'affichage LECTURE SEULE des variables
> générales et par locuteur. La DATE reste non éditable (elle existe dans le
> modèle `EntretienRef.date` mais sans UI, comme en V1 au final).

## Décisions

- **D1 — Périmètre données : affichage seul.** Les variables sont montrées
  résolues (libellé de modalité) mais jamais éditables ici : l'édition passe
  par l'onglet Données / la Table de données, qui gèrent seules le verrou.
- **D2 — Règle multi-utilisateur = règle d'UI portée par le badge serveur.**
  `badgeVerrou(corpusSelId)` non null ⇒ panneau en lecture seule (nom, audio
  et suppression grisés, infobulle « Ouvert par X »). L'intégrité ne repose
  PAS sur cette règle : les écritures restent des définitions
  transactionnelles ; le grisage exprime le respect du travail d'autrui.
- **D3 — Le renommage suit la même garde** que le reste du panneau.

## Réalisé

- `shared/corpus/variables.ts` : `detailsVariablesEntretien(definitions,
  entretien)` — résout libellés de modalités pour AFFICHAGE (générales +
  bloc par locuteur, interviewers exclus, valeurs orphelines ignorées).
- `sonal.ts` : `selectionnerCorpus` étend `corpusSelMeta` avec ces détails ;
  garde `metaEditables(id)` = `!lectureSeule && !badgeVerrou(id)`.
- `Corpus.vue` : sections « Variables générales » / par locuteur en lecture
  seule ; bouton « ❌ Supprimer cet entretien du corpus » en fin de panneau
  (confirmation = bannière commune) ; croix retirée des cartes.
- Tests : unitaires de la résolution ; e2e `meta-entretien.e2e.ts` (affichage
  + migration de la suppression) ; scénario multi-postes « PANNEAU MÉTA sous
  verrou » dans `multi-utilisateur.e2e.ts`.

## Hors périmètre

- Édition de `valeursGen` / notes depuis le panneau (nécessiterait une session
  verrou sans éditeur — autre lot, cf. D1).
- Champs V1 non repris (id numérique, fichier texte d'origine, taille…).
