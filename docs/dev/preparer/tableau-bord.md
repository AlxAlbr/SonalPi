# Tableau de bord — repères développeur

Le tableau de bord est un **suivi manuel du travail**, stocké dans
`corpus.json.tableaubord`. Ce n’est ni un bilan calculé ni la liste des entretiens
du corpus : ses lignes sont des libellés libres, sans lien avec le `membership`.
Créer, renommer ou supprimer un entretien réel ne modifie donc pas le tableau.

## Modèle à comprendre

`TableauBord` contient quatre collections :

- `lignes` et `colonnes` : identifiants stables, noms libres et ordre du tableau ;
- `badges` : statuts définis par un nom et une couleur, référencés par identité ;
- `cellules[ligneId][colonneId]` : badge facultatif, note courte, date,
  responsable et options d’affichage.

Une colonne `traversante` porte **une seule cellule pour tout le corpus**, sous
la clé `LIGNE_TRAVERSANTE` (`#traversant`), et non une copie sur chaque ligne.
La note d’une cellule n’est pas une note d’entretien ; son responsable est du
texte libre, pas une référence à un utilisateur ou à une personne du corpus.

Un champ absent ou un tableau mal formé donne le tableau par défaut en mémoire.
La consultation seule ne l’enregistre pas. Les identifiants des éléments par
défaut sont fixes ; ceux des nouveaux éléments sont générés à la création.

Les dimensions de la grille sont des préférences du poste dans `localStorage`,
pas des données partagées dans `corpus.json`.

## Circuit d’une modification

```text
Composant → useTableauBordCorpus → IPC corpus:tableaubordCommander
          → transaction du fournisseur → CorpusStore → modèle pur
```

Le renderer envoie une **commande ciblée**, jamais son tableau complet.
`CorpusStore.tableaubordCommander()` relit le corpus, applique la commande puis
écrit le résultat. Le composable remplace son état par la réponse enregistrée.
En cas d’échec, il affiche l’erreur et tente de relire le corpus ; il ne rejoue
pas automatiquement la commande.

Le geste `tableau-bord.modifier` relève des définitions corpus : il est disponible
en local, sur GitLab et sur WebDAV, sous les droits et transactions propres au
fournisseur. Aucun entretien n’a besoin d’être réécrit. Voir les
[gardes communes](../distant/gestes.md).

## Règles à préserver

- Les commandes portent l’état attendu de leur cible : contenu de cellule,
  ancien nom ou ordre des identifiants. Le modèle refuse un état devenu périmé.
  Ces contrôles complètent les transactions distantes, ils ne les remplacent pas.
- La date est posée à la première saisie puis conservée, sauf choix explicite.
  Vider badge, note et responsable supprime la cellule, date comprise.
- Supprimer une ligne ou une colonne retire ses cellules ; cela ne supprime
  aucun entretien. Un badge encore utilisé ne peut pas être supprimé.
- Un badge « OK » reste une déclaration manuelle : il ne prouve ni correction,
  ni pseudonymisation, ni conformité des données.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Modèle, défauts, commandes et validations | `src/shared/corpus/tableaubord.ts` |
| Persistance et routage fournisseur | `src/main/corpusStore.ts`, `src/main/index.ts` |
| Envoi des commandes et retour d’erreur | `src/renderer/composables/corpus/useTableauBordCorpus.ts` |
| Grille et édition des cellules | `src/renderer/components/preparer/tableau-bord/TableauBord.vue` |
| Ajout des lignes, colonnes et badges | `src/renderer/components/preparer/tableau-bord/PanneauTableauBord.vue` |

Tests de référence : `test/tableaubord.test.ts` (modèle et persistance),
`test/tableaubordRenderer.test.ts` (commandes et échecs) et
`e2e/tableaubord.e2e.ts` (interface).
