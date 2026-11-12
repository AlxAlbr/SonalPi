# Gestes et capacités — repères développeur

Une même interface ne signifie pas les mêmes possibilités en local, sur WebDAV
et sur GitLab. La disponibilité dépend du **geste précis**, de son fournisseur,
du réseau, du mode de consultation et, pour un entretien, de sa session.
La référence exécutable est `src/main/gitlab/politiqueGestes.ts`, malgré son
emplacement dans le dossier GitLab : elle classe les trois fournisseurs.

## Classer selon les données nécessaires

| Famille de portées | Ce que le geste doit protéger |
|---|---|
| `definitions-corpus` | Définition calculable depuis le seul corpus courant. |
| `definitions-avec-sources` | Définition et sources publiées qu’elle référence ou contrôle. |
| `tri-contenus` | Lecture de contenus publiés sur un corpus calme. |
| `suppression-definition` | Décompte des usages publiés et fermeture des éditions avant retrait. |
| `suppression-entretien` | Corpus, entretien retiré et archivage. |
| `valeurs-entretien`, `pseudonymisation-entretiens` | Une source et les définitions qu’elle applique. |
| Portées de pseudonymisation globale et de réaffectation thématique | Protocole spécialisé, inventaire, cibles et reprise propres à l’opération. |
| `indisponible` | Geste refusé sur les fournisseurs distants. |

Le classement porte sur la commande réelle, pas sur le nom du panneau.
`gestureCas`, `gestureRecueil` et `gestureTri` distinguent les variantes : ajouter
un texte n’équivaut pas à référencer un passage ; trier par nom n’équivaut pas
à trier par longueur. Créer un cas peut déjà porter un rattachement à protéger.

## Disponibilité actuelle : les différences importantes

Les définitions courantes, références de passages, valeurs et opérations de
pseudonymisation qualifiées sont ouvertes sur WebDAV et GitLab. Les contraintes
de chaque protocole restent applicables ; « ouvert » ne signifie pas « sans garde ».

- Le transfert et la division de thèmes sont ouverts sur les deux fournisseurs.
  La réaffectation avec suppression de la source est ouverte sur GitLab, pas WebDAV.
- Les documents du projet et le téléversement média général sont proposés sur
  WebDAV, pas GitLab. La désignation d’un média existant est un parcours distinct.
- `note.editer` depuis le corpus, `personnes.commande`, `journal.annuler` et le
  marquage d’un corpus de démonstration restent refusés sur les deux distants.
  Cela n’interdit pas l’édition des notes dans une session d’entretien autorisée.

Ne pas recopier toute la matrice dans chaque page métier : `matriceCapacites`
la construit depuis les portées et `PARCOURS_PAR_FOURNISSEUR`. Une différence
actuelle mérite attention : WebDAV annonce la capacité publique `personnes`,
mais le geste `personnes.commande` reste refusé. La présence d’un bouton ou d’une
méthode de transaction ne prouve donc pas qu’une commande est livrée.

## Les protections se complètent

1. Le renderer combine `CapacitesCorpus`, réseau, consultation et session pour
   présenter les actions possibles. Un badge de présence n’accorde aucun droit.
2. Le main classe la variante et exige le geste autorisé, y compris pour un
   appel IPC direct. Un geste inconnu est refusé, même en local.
3. Le store protège l’écriture ordinaire du miroir.
4. La transaction ou session acquiert et contrôle les droits, les versions et
   les références avant publication.

Griser un bouton ne remplace aucune des protections suivantes. Inversement,
une capacité générale `editionEntretien` ne dispense pas d’acquérir sa session.
Les droits de consultation seule et l’état hors ligne ne doivent jamais être
levés pour faire passer une opération techniquement présente mais non ouverte.

## Suppression des définitions

La suppression d’un thème, d’une variable ou d’une modalité ne retire plus des
valeurs dans une session ouverte et ne publie jamais cette session automatiquement.
En local, le store refuse les entretiens concernés encore autorisés en écriture.
Une consultation seule ou une édition sans usage de la définition ne bloque pas.
L’ancien paramètre d’exclusion d’un entretien est refusé, y compris par IPC.

Sur un corpus partagé, les usages non publiés d’un autre poste sont inconnus :
toutes les éditions doivent donc être fermées. Les usages publiés restent bloquants ;
cette règle n’ouvre pas la suppression globale des codages ou valeurs distants.

- GitLab acquiert le corpus puis les entretiens dans un ordre stable.
  Le commit garde les versions lues et tous les droits ensemble.
  Le nombre d’actions limite ce parcours à 124 entretiens avec la borne actuelle de 250 actions.
- WebDAV réserve également les entretiens, sans réutiliser nos propres sessions.
  La transaction relit les contenus publiés, vérifie les droits et leur durée restante avant l’envoi.
  Elle ne publie que le corpus, sous précondition de version.

Les contrôles de l’interface expliquent le refus ; les droits serveur empêchent
une nouvelle édition de passer entre la vérification et la suppression.
Les réaffectations thématiques et les opérations de pseudonymisation gardent leurs
protocoles spécialisés, distincts de cette suppression directe de définition.

Régressions en mémoire : `test/suppressionsDefinitions.test.ts`,
`test/gitlab/definitionsSources.test.ts` et `test/webdav/suppressionDefinitions.test.ts`.
Qualification réelle : `test/gitlab/qualificationSuppressions.test.ts` et
`test/webdav/suppressionDefinitions-nextcloud.test.ts` sur les deux variantes Nextcloud.
La qualification a été rejouée avec succès le 12 novembre 2026 : thèmes, variables
et modalités ont été vérifiés avec deux utilisateurs sur GitLab, Nextcloud avec
`files_lock` et Nextcloud avec verrous conditionnels. Les scénarios couvrent le
refus des éditions en cours, la réussite après fermeture et la conservation des
données lors d’un refus.

## Ajouter ou modifier un geste

- Nommer et classer le geste dans `PORTEE_PAR_GESTE`, puis traiter ses variantes
  sans élargir toute une famille de commandes.
- Prévoir le dispatch main et les gardes réellement nécessaires ; déclarer les
  parcours spécifiques au transport dans `PARCOURS_PAR_FOURNISSEUR`.
- Exposer la capacité utile au renderer sans en faire l’autorité d’écriture.
- Tester refus, appels IPC directs, concurrence et reprise sur le fournisseur
  concerné avant ouverture. Ne pas déduire WebDAV d’une qualification GitLab,
  ni un serveur réel d’une doublure mémoire.
- Actualiser la page métier et la [matrice utilisateur](../../user/multi-utilisateur.md).

Tests de référence : `test/gitlab/politiqueGestes.test.ts` pour le classement et
les capacités, `test/distantRenderer.test.ts` pour les gardes d’interface.
Les mécanismes de publication sont décrits dans [webdav.md](webdav.md) et
[gitlab.md](gitlab.md).
