# Développer SonalPi2

Cette page permet de lancer le projet et de choisir les vérifications adaptées
à une modification. Pour comprendre le code, poursuivre avec
[l’architecture](architecture.md) puis le [modèle objet](modele-objet.md).

## Préparer le poste

- Utiliser une version récente de Node.js 22, comme la CI, avec npm.
- Disposer d’une session graphique pour lancer Electron et les tests d’interface ;
  sous WSL, ces parcours utilisent WSLg.
- Travailler avec des corpus synthétiques et des profils de test isolés, jamais
  avec un corpus utilisateur pour une recette destructive.

La pile est Electron, Vue 3, TipTap/ProseMirror, electron-vite, Vitest et Playwright.
Les versions exactes sont fixées par `package-lock.json`.

```sh
npm ci
npm run dev
```

`npm ci` installe les dépendances du verrou sans le réécrire. Pour vérifier la
version compilée plutôt que le serveur de développement :

```sh
npm run build
npm run start
```

## Choisir les tests

| Vérification | Commande et portée |
|---|---|
| Typage Vue et Node | `npm run typecheck`. |
| Tests Vitest | `npm test` : domaine pur, store et fichiers temporaires, orchestration renderer, fournisseurs simulés et certains contrats serveur. |
| Un fichier Vitest | `npx vitest run test/remap.test.ts`, en remplaçant le chemin par le test concerné. |
| Interface Electron | `npm run test:e2e` : reconstruit l’application puis lance les scénarios Playwright. |
| Un scénario Electron local | `npm run test:e2e -- e2e/demo.e2e.ts --project=local --workers=1`. |
| Charge de l’éditeur | `npm run test:charge` ; [matrice et interprétation](outillage/test-charge.md). |
| Diagnostic manuel de connexion ou de verrou | `npm run diagnostic:e2e` ; hors suite normale, peut modifier le corpus partagé du banc. |

Vitest utilise Node par défaut, mais tous ses tests ne sont pas des tests purs :
certains utilisent des fichiers, un DOM simulé ou un serveur réel. Un test de
domaine peut rester sans Electron même s’il manipule un document ProseMirror.
Les configurations font foi : `vitest.config.ts`, `playwright.config.ts` et
`playwright.diagnostic.config.ts`.

Le projet Playwright `local` désigne un groupe de scénarios, pas une garantie
d’absence d’accès réseau : certaines recettes GitLab ou Nextcloud y sont aussi
classées. Lire les prérequis du scénario avant de le lancer.

## Bancs GitLab et Nextcloud

Les images et volumes du projet existent déjà. **Ne pas télécharger les images,
reprovisionner les bancs ni les nettoyer pour lancer une recette.**

Dans pi, appeler `preparer_bancs_docker` avec les bancs nécessaires avant tout
test serveur réel. L’outil vérifie d’abord leur disponibilité et ne démarre que
ce qui manque. Hors pi, les commandes `npm run nc:up` et `npm run nc-b:up`
démarrent les bancs Nextcloud existants.

Les scénarios partageant un corpus serveur doivent tourner séquentiellement.
Ne pas lancer en même temps deux commandes de tests qui écrivent sur ce corpus,
même si chacune utilise un seul worker. Les configurations limitent déjà le
parallélisme à l’intérieur de leurs suites.

Les tests concernés peuvent se sauter faute de serveur ou d’accès. Un test sauté
n’est pas une réussite du parcours distant. Voir les recettes
[WebDAV](distant/webdav.md), [GitLab](distant/gitlab.md) et
[migration GitLab](migration/README.md#rejouer-la-recette-réelle).

## Avant de proposer une modification

1. Exécuter les tests ciblés indiqués dans la documentation de la fonction.
2. Vérifier les refus et échecs, pas uniquement le chemin de réussite.
3. Lancer `npm run typecheck` et, pour une modification applicative,
   `npm run build`.
4. Ajouter une recette Electron si le comportement visible ou la navigation change.
5. Si le parcours est distant, vérifier le fournisseur réel concerné ; un test
   simulé ne démontre pas les garanties du serveur.

Les règles de publication Git sont dans [remotes](outillage/git-remotes.md).
Les sorties `out/`, `dist/` et `test-results/` ne sont pas à ajouter au dépôt.

## Vocabulaire et version applicative

Distinguer les dimensions plutôt qu’écrire « v1/v2 » sans contexte :

| Terme | Sens |
|---|---|
| SonalPi1 / SonalPi2 | Ancien produit / produit de ce dépôt, notamment dans les migrations. |
| `formatVersion` | Version du contrat de données ; voir [compatibilité](donnees.md#format-natif-et-compatibilité). |
| Version applicative ou release | Version semver de `package.json`, indépendante du format des fichiers. |
| Itération | Découpage d’une fonctionnalité, pas version de produit ni de fichier. |
| Version externe | Toujours qualifier : protocole OCS, chunking Nextcloud, modèle tiers, etc. |

Les abréviations historiques de noms de fonctions ou de fichiers ne doivent pas
faire confondre migration SonalPi1 et migration du format natif.
La version applicative évolue aux jalons de livraison ; changer cette version
ne migre aucun corpus. La fabrication des paquets et les tags de livraison sont
décrits dans [empaquetage et CI](outillage/empaquetage-ci.md).

## Particularité WSLg : gel audio intermittent

Sous WSLg, la lecture peut se figer après quelques secondes alors que l’élément
audio se considère toujours en lecture. Ce symptôme a aussi été reproduit hors
de SonalPi2, dans un Electron minimal : le pont audio WSLg peut être en cause.
Avant de modifier le lecteur pour ce seul symptôme, comparer sur un poste natif.
Une mise à jour WSL/Windows ou un serveur PulseAudio Windows distinct du pont
RDP sont des pistes de contournement, pas des corrections applicatives garanties.
