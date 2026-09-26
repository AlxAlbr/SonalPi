# Gestes du corpus par fournisseur — local, WebDAV, GitLab

Une même commande du corpus n'a pas le même devenir partout : un dossier local,
un miroir Nextcloud/WebDAV et un projet GitLab n'ont pas les mêmes capacités. Ce
fichier est la carte unique pour répondre à « ce geste marche-t-il ici ? », et la
recette pour ajouter ou reclasser un geste. La version utilisateur (Nextcloud
contre GitLab) reste dans
[../user/multi-utilisateur.md](../user/multi-utilisateur.md#ce-que-chaque-fournisseur-sait-faire).

La classification est dans `src/main/gitlab/politiqueGestes.ts` — un nom de
dossier hérité du fournisseur qui l'a écrite, alors qu'elle vaut pour les trois.

## 1. Le classement des gestes

Chaque geste du corpus est classé une fois pour toutes selon **ce qu'il doit
savoir du corpus pour se calculer**. Le classement est sémantique, jamais
technique : une commande ne dépend d'entretiens que si elle lit ou contrôle des
entretiens publiés.

| Portée | Ce qu'elle exige | Gestes typiques |
|---|---|---|
| `definitions-corpus` | le seul `corpus.json` | thèmes, variables, modalités, catégories de note, tableau de bord, pseudonymisation, recueils, CAS, renommage d'entretien, tri alphabétique et tri d'ajout, création et import d'un entretien |
| `definitions-avec-sources` | des entretiens **publiés et gardés** | passage inséré dans un recueil, rattachement et dérivation CAS |
| `tri-contenus` | tous les entretiens publiés, sans garde | tri par dernière modification ou par longueur |
| `suppression-definition` | tous les entretiens publiés et gardés, avec validation réciproque des sessions | suppression d'un thème, d'une variable, d'une modalité, d'une catégorie de note ou d'une règle |
| `suppression-entretien` | retrait puis archivage d'un entretien | analyse de suppression, suppression |
| `indisponible` | rien — parcours refusés sur **tout** corpus distant | édition d'une note du corpus, personnes, annulation d'une action du journal, lots de valeurs et de règles, marqueur de démonstration |

Le classement se fait par commande, et par variante pour les commandes qui en ont
plusieurs : insérer un passage se distingue d'insérer un texte, un tri
alphabétique se distingue d'un tri par contenu (`gestureCas`, `gestureRecueil`,
`gestureTri`).

## 2. Ce que chaque fournisseur accorde

Un fournisseur n'accorde jamais une portée qu'aucun de ses gestes ne partage.

| Portée | `local` | `webdav` | `gitlab` |
|---|---|---|---|
| `definitions-corpus` | oui | oui | oui |
| `definitions-avec-sources` | oui | oui | oui |
| `tri-contenus` | oui | oui | oui |
| `suppression-definition` | oui | oui | oui |
| `suppression-entretien` | oui | oui | non |
| `indisponible` | oui | non | non |

GitLab accorde toutes les opérations de définitions qualifiées. Les gestes à
sources gardent les versions publiées dans le commit, les tris exigent un corpus
calme et les suppressions ajoutent une garde croisée avec les publications de
session. Seule la suppression d'un entretien reste absente dans cette famille.

## 3. Les gardes, dans l'ordre

| Garde | Où | Ce qu'elle fait |
|---|---|---|
| Proposition d'interface | `gesteDisponible(capacité)` (renderer) | grise le bouton : matrice du fournisseur **et** hors ligne **et** consultation seule |
| Verdict | `exigerGeste(fournisseurCourant(), geste)` dans chaque handler du main | refuse par son nom, y compris par appel IPC direct |
| Écriture du store | `CorpusStore.verifierEcriture` | défense en profondeur sur le miroir actif |
| Session | bail de l'entretien | une seule édition à la fois, les autres ouvrent en lecture seule |
| Transport | préparation isolée + garde `last_commit_id` (GitLab) ou ETag (WebDAV) | refuse une publication fondée sur une base périmée |

Seule la deuxième garde décide : **une interface grisée n'est pas une protection**.
Un geste non classé est refusé partout — mieux vaut un refus qu'un geste
inventé — et le refus porte un nom (`RefusGesteError`), jamais un échec silencieux.

## 4. La matrice publique `CapacitesCorpus`

`matriceCapacites(fournisseur)` déduit de ces portées la matrice que le main
envoie avec le résultat d'ouverture (`CapacitesCorpus` dans
`src/shared/distant.ts`). Le renderer s'en sert pour griser ; il ne décide d'aucun
accès.

| Capacité | `local` | `webdav` | `gitlab` | Origine |
|---|---|---|---|---|
| `definitions` | oui | oui | oui | portée `definitions-corpus` |
| `definitionsAvecSources` | oui | oui | oui | idem |
| `triContenu` | oui | oui | oui | idem |
| `ajoutEntretien` | oui | oui | oui | idem |
| `suppressionEntretien` | oui | oui | non | portée `suppression-entretien` |
| `editionEntretien` | oui | oui | oui | toujours vraie : la garde de session s'applique par-dessus |
| `renommageEntretien` | oui | oui | oui | parcours du transport |
| `metadonneesEntretien` | oui | oui | non | parcours du transport |
| `tableDonnees` | oui | oui | non | parcours du transport |
| `notes` | oui | non | non | parcours du transport |
| `personnes` | oui | oui | non | parcours du transport |
| `annulationJournal` | oui | non | non | parcours du transport |
| `mediasPartages` | non | oui | non | parcours du transport |
| `docsCadre` | oui | oui | non | parcours du transport |

Deux précisions :

- La colonne `local` de cette table n'est pas utilisée par le renderer : hors
  corpus distant, `gesteDisponible` laisse passer (`TOUTES_CAPACITES` dans
  `useDistantCorpus.ts`), car les parcours purement locaux (médias partagés)
  n'empruntent pas le main distant. Le dispatch local, lui, classe bien chaque
  geste.
- `capacites` ne remplace ni le hors ligne ni le mode consultation seule : ces
  deux blocages s'appliquent **au-dessus** de la matrice.

## 5. Ajouter ou reclasser un geste

1. Nommer le geste `<domaine>.<verbe>` et lui donner une portée dans
   `PORTEE_PAR_GESTE`. Le nom est celui du refus affiché à l'utilisateur.
2. Si la commande a des variantes, les router dans `gestureCas`,
   `gestureRecueil` ou `gestureTri` plutôt que d'élargir la portée de la
   commande entière.
3. Si le geste est un parcours propre à un transport, le déclarer dans
   `PARCOURS_PAR_FOURNISSEUR` plutôt que dans les portées.
4. Appeler `exigerGeste` dans le handler du main, en nommant le geste de la
   variante réellement servie. Ne jamais compter sur le seul grillage.
5. Exposer la capacité au renderer si un bouton doit disparaître.
6. Couvrir le classement dans `test/gitlab/politiqueGestes.test.ts` et le
   grillage dans `test/distantRenderer.test.ts`.
7. Si la portée change, mettre à jour la matrice utilisateur
   ([../user/multi-utilisateur.md](../user/multi-utilisateur.md)) et la section
   « Définitions du corpus sous bail » de [gitlab.md](gitlab.md).

## 6. Tests de référence

| Fichier | Ce qu'il vérifie |
|---|---|
| `test/gitlab/politiqueGestes.test.ts` | le classement par commande, le refus par nom des gestes hors portée, le refus des gestes hors portée de tout distant, l'inconnu refusé partout, la matrice des trois fournisseurs et la non-régression des parcours acquis |
| `test/distantRenderer.test.ts` | la matrice publique des deux fournisseurs, le renommage et les métadonnées croisées avec le bail, la primauté du hors ligne et de la consultation seule, le signalement d'une observation des détenteurs en panne |

## Renvois

- [multi-utilisateur.md](multi-utilisateur.md) — verrous, sessions, transactions,
  divergence : le fonctionnement du fournisseur WebDAV.
- [gitlab.md](gitlab.md) — le bail versionné, la publication conditionnelle et la
  reprise du fournisseur GitLab, dont la portée des gestes (§ 9).
- [architecture.md](architecture.md) — la frontière `shared/`, où vit
  `CapacitesCorpus`.
