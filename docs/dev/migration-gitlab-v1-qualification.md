# Qualification réelle — migration SonalPi1 GitLab

**Qualification initiale du 27 octobre 2026 : huit scénarios réels réussis, parcours activé.**
Projet clôturé avec accord utilisateur le 27 octobre 2026. Lors de cette première campagne, la
carte Local et sa politique média n’ont pas été modifiées. La demande suivante
ajoute un bilan commun et la conservation des documents dans `Autres/` : voir
[le complément de qualification](migration-conservation.md).

## Environnement et portée

- GitLab CE **18.11.0**, Nextcloud A existant sur `localhost:8080`.
- Electron **42.6.0**, Playwright **1.61.1**, un worker.
- Bancs préparés avec `preparer_bancs_docker` : démarrage des seuls services nécessaires,
  sans pull d’image, installation ni reprovisionnement. Bancs laissés disponibles.
- Nouveaux projets privés, dossiers WebDAV et profils temporaires propres à chaque
  scénario. Uniquement des documents et médias synthétiques ; aucun corpus utilisateur.
- Connexion réelle de l’application par jeton GitLab. Les tests OAuth locaux existants
  restent simulés : cette campagne ne revendique pas une nouvelle qualification OAuth.
- Les premiers essais utilisent un build isolé autorisant la migration. Après les
  preuves, le drapeau partagé est activé et la campagne repasse sur le **build normal**,
  sans contournement IPC, de lecteur ou d’ouverture.

Les transports sont réels. Les seules injections réseau de la recette concernent
une réponse perdue, un historique momentanément illisible, ou une réponse suspendue
pour placer un SIGKILL. Les fichiers sont effectivement copiés et les commits
acceptés par GitLab, pas représentés par des réponses factices.

## Résultats sur le build normal activé

**16 tests Electron réussis** : huit scénarios réels de
`e2e/migration-gitlab.e2e.ts` et les huit tests locaux/simulés de
`e2e/migration-v1.e2e.ts`. Parmi ces derniers figurent les cinq scénarios du parcours
Local existant. Aucun scénario sauté dans cette commande avec les accès du banc.

| Scénario réel | Source / cible(s) de la campagne | Preuves |
|---|---|---|
| GitLab/LFS, dépôt sans branche | 234 → 235 | Initialisation automatique ; fichiers natifs et objets réels ; audio et vidéo lus sur le profil migrateur puis sur un profil neuf. |
| WebDAV, dépôt avec README et attributs | 236 → 237 | Fichiers techniques conservés ; copies binaires vérifiées ; audio lu sur les deux profils ; refus explicite de la lecture vidéo distante. |
| Gardes et annulation | 238 → 239 / 240 | Refus source=cible et cible occupée ; annulation de confirmation sans copie ni publication ; modification après bilan refusée sans écrasement. |
| Collision WebDAV | 241 → 242 | Fichier différent conservé ; cible GitLab restée vide ; suivi interrompu, aucune réussite annoncée. |
| SIGKILL pendant une copie WebDAV | 243 → 244 | Premier PUT réellement accepté, réponse suspendue, processus tué ; relance avec le même profil, accès renseignés de nouveau, reprise achevée. |
| SIGKILL après publication GitLab | 245 → 246 | Arrêt pendant l’ouverture après libération du droit de publication ; relance, identifiants conservés et zéro nouvelle publication native. |
| Publication fractionnée | 247 → 248 | 251 entretiens, deux lots ; premier lot accepté à réponse perdue ; `corpus.json` absent à cet arrêt, puis publié en dernier après reprise ; premier lot non répété. |
| Réponse de publication perdue | 249 → 250 | Corpus réellement publié, intention inconnue conservée ; reprise explicitement confirmée, reconnaissance du commit, un seul envoi natif au total. |

Les projets sont conservés pour inspection. Les dossiers externes portent le nom
`qualification-migration-<id-cible>` dans l’espace du compte synthétique `max`.
Les relances de la recette créent d’autres projets, jamais une réutilisation de
ces destinations. Le commit source du premier scénario est
`12bc4e530a01e5547d16fadda0b30dc392f346d4` ; sa tête reste inchangée après migration.
Chaque scénario vérifie de même la conservation de sa tête source.

### Fidélité et médias

La fixture commune comprend quatre entretiens, trois médias distincts, un média
réutilisé, deux noms identiques dans des dossiers différents, des accents et un
`.Sonal` source réellement stocké sous LFS. Les médias source mêlent Git ordinaire
et LFS. Le WAV de deux minutes dépasse **11 Mo**, la vidéo WebM dure huit secondes.
Les octets copiés vers chaque destination sont relus et comparés par SHA-256.
Ce contrôle ne mesure pas un pic mémoire ni une charge maximale.

Les assertions portent sur le texte exact et ses positions, les choix distincts
Claire/Rebecca malgré la valeur principale Claire, une exception, les codages,
les commentaires, les notes, les alias et les déclarations locales avec variantes.
Les thèmes et variables propres au `.Sonal`, ainsi que les valeurs d’un locuteur
sans tour de parole, sont conservés. Les références des annotations sont vérifiées
contre les définitions effectivement publiées. Un média partagé a la même référence,
les homonymes ont des références différentes. Les fichiers natifs ne contiennent
ni jeton GitLab ni mot de passe média du banc.

La lecture utilise les éléments audio/vidéo de l’application existante : progression
du temps, déplacements vers 70 % puis 20 % de la durée, chargement effectif après
recherche. Le deuxième profil n’a ni source locale, ni suivi, ni cache de migration ;
le dossier ayant servi à générer les médias est supprimé avant ce lancement.
Avec WebDAV, ses accès sont déclarés de nouveau dans ce profil.

## Défauts corrigés pendant la recette

1. Un dépôt vide peut annoncer `default_branch: main` avant qu’une branche existe.
   La migration le considère désormais sans branche, puis initialise `main`.
   Les autres parcours conservent leur comportement.
2. La fusion des règles gardait les identifiants du corpus mais certaines annotations
   conservaient ceux de l’import temporaire. Le raccord remappe les liens après fusion,
   y compris après partage partiel d’alias et import répété, sans changer les choix.
3. Les thèmes et variables propres aux `.Sonal` n’étaient pas transmis à la préparation
   privée. Les résultats du convertisseur commun complètent maintenant les définitions
   manquantes, sans remplacer celles du `.crp` ni modifier le parcours Local.
4. Le lecteur exigeait un `audioRef` local alors que les références migrées utilisent
   `audioDistant`. Il charge maintenant le chemin effectif de l’inventaire local.
5. Le formulaire restait affiché après installation du corpus, car l’accueil est
   conservé en mémoire. Il se ferme après réussite, une fois l’opération terminée.

Ces cas ont des tests de non-régression ciblés. Les premières versions du harnais
ont également nécessité des corrections de sélecteurs, de confirmation native,
de fixture et de comparaison de la représentation des alias. Les essais échoués
ne sont pas comptés parmi les preuves réussies ci-dessus.

## Rejouer

Dans pi, appeler d’abord `preparer_bancs_docker` pour `gitlab` et `nextcloud-a`.
Puis charger les accès existants, sans les recopier dans le dépôt :

```sh
set -a
source "$HOME/TestGitlabLocal/qualification.env"
set +a
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npm run test:migration:gitlab:e2e
```

Pour la campagne réelle avec la non-régression locale :

```sh
npm run build
NODE_EXTRA_CA_CERTS="$GITLAB_CA" npx playwright test \
  e2e/migration-gitlab.e2e.ts e2e/migration-v1.e2e.ts --project=local --workers=1
```

`ffmpeg` est requis pour générer les médias synthétiques. Sans configuration GitLab,
les huit tests réels se sautent : un saut ne vaut pas qualification.
Les captures des deux profils et les pièces de preuve sont produites dans
`test-results/` ; ce dossier n’est pas versionné.

Campagne simulée consolidée : **864 tests / 50 fichiers réussis**,
`npm run typecheck`, `npm run build` et contrôle des espaces réussis :

```sh
npx vitest run test/gitlab test/migrationCrp.test.ts test/migrationGitLabRenderer.test.ts \
  test/projetGitLabRenderer.test.ts test/pseudonymisationProjection.test.ts \
  test/commentairesMigration.test.ts test/webdav/lectureMedia.test.ts test/mediasCorpus.test.ts \
  --exclude '**/qualification*.test.ts' --exclude '**/contrat-gitlab.test.ts'
```

## Limites explicites

- Audio WebDAV qualifié ; **vidéo WebDAV copiée mais non lisible à distance** avec
  le lecteur actuel. Le bilan le signale avant confirmation et propose GitLab
  comme choix permettant la lecture vidéo selon les formats déjà pris en charge.
- Pas de qualification institutionnelle, de stockage LFS sur une autre origine,
  de quota réel, de charge maximale, de Windows ni de version empaquetée ici.
- Pas de mesure d’un SIGKILL pendant un droit de publication encore actif suivi de
  l’attente réelle de quinze minutes ; son refus de reprise anticipée reste couvert
  par les tests simulés. Le SIGKILL après publication testé ici arrive après libération.
- Le suivi est propre au profil du poste : un profil neuf ouvre le corpus publié,
  il ne transporte pas le suivi de reprise d’un autre profil.
- Copies et publications ne constituent pas une transaction globale GitLab/WebDAV.
  Aucun nettoyage distant automatique, destruction des sources ou remplacement de
  données utilisateur pour revenir en arrière.

## Complément : documents non convertis et bilan commun

La demande suivante étend les deux migrations à `Autres/`, et autorise la
simplification du formulaire Local. Après cette évolution, **16 tests Electron
réussissent de nouveau**, dont les huit scénarios réels avec quatre documents
supplémentaires dans chaque source. Les résultats, un texte non UTF-8 et un binaire
LFS de plus de 9 Mio sont relus à l’identique dans le dépôt cible, y compris lorsque
les médias vont sur WebDAV. Le Local conserve ses médias référencés, tout en copiant
les autres documents ; les exclusions et détails repliés sont vérifiés.
La campagne consolidée atteint **915 tests / 54 fichiers**. Le protocole, les limites
et la commande étendue sont dans [migration-conservation.md](migration-conservation.md).
