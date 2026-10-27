# GitLab — repères développeur

GitLab est utilisé par ses API REST, **sans clone Git**. Une destination fixe
le compte, le projet, la branche et la racine du corpus. `ContexteGitLab` assemble
lecture, coordination, sessions et transactions au-dessus du miroir commun.
L’[authentification](authentification-gitlab.md) est un service séparé.

## Lecture cohérente du dépôt

`LecteurGitLab` résout la branche en commit avant l’inventaire. Toutes les lectures
d’un tirage utilisent ce commit ; les empreintes sont celles des blobs, pas des
ETags WebDAV. Les chemins, la pagination, les liens symboliques et sous-modules
sont contrôlés avant installation dans le miroir.

Le tirage conserve les candidats locaux protégés. Consulter une copie ou lire
un entretien ne crée ni corpus ni session d’écriture. La préparation d’ouverture
et la bascule utilisent les gardes du [contexte commun](README.md).

## Baux et publication gardée

L’édition courante utilise `BailGitLab`, pas un verrou LFS assimilé à une session.
Les marqueurs versionnés vivent sous `.sonal/verrous/` ; la ressource dépend de
la branche et du chemin distant, indépendamment du nom local de la destination.
Le détenteur comprend utilisateur, machine, session et génération.

**Le même compte GitLab sur deux postes ne donne pas le même droit d’édition.**
Un droit est produit par l’acquisition et revalidé avant publication. Une ancienne
identité ou un fichier local ne permet pas de s’en attribuer un. Les rythmes de
publication, renouvellement et expiration sont dans `parametresSession.ts`.

`SessionGitLab` relit le fichier après acquisition, conserve les modifications
locales et publie un plan sous droit valide. Le commit porte les gardes de fichiers
(`last_commit_id`) et la coordination attendue. La validation des références
empêche aussi une session de réintroduire une définition retirée entre-temps.

Deux files ont des rôles distincts : `FileOperationsContexte` ordonne les gestes,
tirages et fermetures ; `FileCommitsGitLab` sérialise les commits d’une destination,
même pour des ressources différentes. Ne pas les remplacer par un minuteur
qui regrouperait arbitrairement les écritures.

## Transactions et limites

Les transactions lisent une base serveur fraîche et préparent la mutation à
l’écart du miroir actif. Celui-ci n’est installé qu’après confirmation.

- Une définition simple protège `corpus.json`.
- Un ajout dépendant de sources garde aussi les versions publiées qu’il utilise.
- Une suppression de définition contrôle les usages et les futures publications
  de session. Un tri par contenu est une lecture sur corpus calme, pas une prise
  de droit globale sur tous les entretiens.
- Supprimer un entretien protège corpus et entretien ; retrait et archivage
  distant font partie du même commit. La récupération locale reste séparée.
- Les lots depuis les vues corpus protègent chaque entretien ; ils ne sont pas
  un remplacement du corpus complet depuis le renderer.

Le nombre d’actions et la taille du corps HTTP sont bornés avant envoi, coordination
comprise. Un geste exigeant un seul commit ne peut pas être découpé implicitement
pour contourner sa garde. Les lots spécialisés ont leur propre protocole de
fractionnement et de reprise ; voir `limitesPublication.ts` et `publication.ts`.

## Réponse perdue et reprise

`PublieurGitLab` distingue confirmé, refusé et **indéterminé**. Une coupure ne
prouve pas que le commit a échoué. `JournalPublicationGitLab` conserve l’intention
et le candidat ; la réconciliation recherche une publication conforme avant
tout rejeu. Un refus de branche sans changement des gardes peut suivre le réessai
borné du publieur ; une publication inconnue ne relève pas de ce simple réessai.

Après interruption, la reprise contrôle destination, source, candidat et droit
courant. Elle n’hérite pas automatiquement d’un droit précédent encore actif.
Supprimer les marqueurs ou journaux pour forcer la reprise détruirait ces garanties.

## Médias et périmètre fonctionnel

Les médias du dépôt peuvent être téléchargés en flux, y compris depuis LFS,
puis servis par le lecteur local. Une base média WebDAV externe reste une
configuration du poste : ses secrets ne vont pas dans le dépôt. Les actions LFS
vers une autre origine sont refusées ; ne pas assimiler « LFS annoncé » et
« tout transfert média disponible ».

Les capacités du parcours normal restent distinctes des services techniques :
le téléversement média général et les documents du projet ne sont pas ouverts
sur GitLab. La migration dispose d’un chemin de copie spécialisé, pas d’une
permission générale de téléversement. Voir [gestes.md](gestes.md) et
[migration SonalPi1](../migration/README.md#gitlab--publication-et-reprise).

## Où intervenir et vérifier

Tout ce qui suit est sous `src/main/gitlab/` :

| Responsabilité | Modules |
|---|---|
| Transport et tirage figé | `client.ts`, `lecture.ts` |
| Ouverture et contexte | `ouverture.ts`, `contexte.ts` |
| Coordination et files | `bailGitLab.ts`, `fileOperations.ts` |
| Session et candidat local | `assemblageSession.ts`, `session.ts`, `journalSession.ts` |
| Préparation et mutations corpus | `transactions.ts`, `preparationDefinitions.ts`, `referencesDefinitions.ts` |
| Commits, journal et reprise | `publication.ts`, `journalPublication.ts`, `reprise.ts` |
| Transferts binaires | `transfert.ts`, `lfs.ts` |

Tests mémoire : `test/gitlab/session.test.ts`, `test/gitlab/transactions.test.ts`,
`test/gitlab/definitionsSources.test.ts`, `test/gitlab/bailPublication.test.ts`
et `test/gitlab/journal.test.ts`. Les tests `qualification*.test.ts`,
`test/gitlab/contrat-gitlab.test.ts` et `e2e/gitlab-consultation.e2e.ts` utilisent
le banc réel. Leur réussite locale ne certifie pas quotas, stockage objet externe,
charge maximale ou comportement de toutes les instances institutionnelles.
