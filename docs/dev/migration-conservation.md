# Migration : bilan commun et conservation des documents

**Évolution demandée le 27 octobre 2026**, après qualification initiale du parcours
GitLab : le Local devient plus concis et les deux parcours conservent les fichiers
non convertis dans `Autres/`. Cette évolution étend explicitement le périmètre Local
initial, sans changer sa politique média. **Périmètre accepté et projet clôturé
par l’utilisateur le 27 octobre 2026.**

## Contrat utilisateur

`BilanMigration.vue` présente le même résumé dans les deux parcours : entretiens
repris, réglages Lexico reconnus, documents conservés sans conversion et éléments
non repris. Les listes de définitions et de fichiers restent sous « Voir les détails ».
Les avertissements, transcriptions manquantes et limites de lecture restent visibles.

Les `.out`, `.lem`, `.cnct` portant le nom du corpus deviennent des réglages V2.
Un fichier de réglages partiellement ignoré est également conservé brut. Les résultats
`.lexaf.json`, exports et formats inconnus sont des documents copiés tels quels,
pas des analyses V2. Aucun décompresseur ni nouvel importeur de résultats n’est ajouté.

Dans le code V1 fourni, `.lexaf.json` provient du prototype d’analyse factorielle :
le bouton n’est pas ajouté à l’interface et « Relire JSON » affiche seulement le texte
brut, sans réouvrir une analyse. Le fichier contient un tableau reconstructible,
mais ne constitue pas une sauvegarde complète des sélections et passages sources.
Il est conservé par précaution, sans présenter ce prototype comme un outil normalement
accessible aux utilisateurs de la V1.

- Local : copies sous `<nouveau-corpus>/Autres/`. Les médias référencés restent à
  leur emplacement d’origine, sans copie.
- GitLab : copies sous `Autres/` du nouveau dépôt, même avec une destination média
  WebDAV. Ces documents se consultent dans le dépôt ; ils ne sont pas installés dans
  les listes d’analyses ou dans l’espace des documents de préparation.

## Périmètre de l’inventaire

`conservationMigration.ts` partage le classement entre les deux sources :

- descendants du dossier contenant le `.crp` choisi, sans remonter au dépôt entier ;
- fichiers déjà repris par ce corpus exclus des copies brutes ;
- autres `.crp` et leurs références identifiables (`.Sonal`, médias, images et annexes)
  écartés ; un sous-dossier contenant un autre `.crp` reste hors copie ;
- avertissement si plusieurs corpus partagent le périmètre, ou si les références
  d’un voisin ne peuvent être décodées ; les documents non rattachés restent listés
  avant confirmation ;
- éléments techniques et noms d’accès connus exclus et signalés, notamment `.git`,
  caches, `.gitattributes`, `.env*`, `credentials.*`, `comptes.*`, clés privées ;
- noms incompatibles avec un dossier portable signalés ; collisions de casse ou de
  normalisation Unicode refusées avant copie, sans renommage silencieux.

Ce n’est pas une détection générale des secrets dans le contenu des documents ou
archives. Les originaux restent intacts. Le classement ne revendique pas de connaître
l’appartenance de tout fichier non référencé à un corpus voisin.

## Local : préparation, copies et bascule

`ConservationMigrationLocale` fixe un bilan identifié, la source, la destination,
les tailles et SHA-256. Le renderer ne peut pas remplacer la liste par ses propres
chemins à l’exécution. Une nouvelle source ou destination invalide l’ancien bilan.
Le handler `migrer:preparerFichiers` ne fait que lire.

Avant création, le service relit l’inventaire et l’identité du `.crp` : ajout ou
modification d’un document impose un nouveau bilan. La destination elle-même n’est
pas inventoriée lorsqu’elle est sous la source. Les sous-dossiers contenant déjà
un corpus V2 sont écartés. Liens symboliques non suivis, lectures des fichiers par
descripteur sans suivi de lien et recontrôle des parents avant copie.

Les octets sont copiés progressivement dans une préparation privée temporaire,
sur le même système de fichiers que la destination, puis vérifiés par SHA-256.
`creerTransitionsLocales` prépare ces copies avant de fermer l’ancien contexte.
Un refus de fermeture nettoie la préparation sans installer de document ni de corpus.
Après fermeture, `Autres/` est créé exclusivement et les fichiers préparés y sont
liés sans écrasement, puis le corpus est installé par le mécanisme existant.
Le retrait de la préparation ne touche ni les sources ni les copies installées.
Sur les systèmes POSIX, les nouvelles copies sont privées au compte du poste (`0600`).

Un dossier `Autres` préexistant est refusé. Une création concurrente ne l’écrase pas.
Une panne pendant l’installation peut conserver des copies partielles ; aucune
réussite n’est annoncée et aucun nettoyage distant ou destructeur n’est engagé.
Le parcours Local ne reçoit pas un nouveau journal de reprise général.

## GitLab : transport et suivi existants

La source est toujours figée au même commit que les conversions. Le bilan possède
un champ additif `conservation`; les anciens suivis dépourvus de ce champ restent
lisibles et ne se voient pas ajouter de fichiers sans consentement.

`CopieurMediasMigrationGitLab.conserver` réutilise le transfert binaire et LFS, mais
n’accepte que des destinations sous `Autres/`. Aucun fichier inconnu ne passe dans
un décodeur texte ou un corps de commit base64 volumineux. Les documents requièrent
un stockage LFS utilisable sur la cible, y compris si les médias vont sur WebDAV.
Les attributs restent limités à `Autres/.gitattributes`; aucun attribut source n’est
copié et les JSON natifs restent hors LFS.

Les documents sont confirmés avant les publications. `autresConfirmes` enrichit le
suivi existant ; chemins, empreintes, copies acquises et lots restent dans les mêmes
preuves durables. Les pointeurs sont créés conditionnellement avec les autres
fichiers et `corpus.json` reste en dernier. Une interruption conserve les octets
privés pour une reprise sans source encore accessible. La vérification finale relit
aussi les objets documentaires avant d’annoncer la réussite.

### Attention aux anciens encodages

Sur le banc GitLab 18.11, un fichier texte non UTF-8 peut avoir un `content_sha256`
et un contenu JSON qui omettent certains octets, alors que la route binaire `raw`
conserve les octets corrects. Pour la conservation, `LectureV1GitLab.informationAutre`
vérifie donc le contenu brut contre le SHA-1 de l’objet Git inventorié au commit
source, et calcule son SHA-256 réel en flux. Les pointeurs LFS sont vérifiés puis
résolus vers leurs vrais objets. Le transfert utilise ensuite l’identité scellée,
sans repasser par des métadonnées texte réencodées. La lecture des documents V1
convertis vérifie également leur objet Git avant décodage, y compris au-delà de 1024 octets.

## Vérifications

- **915 tests / 54 fichiers réussis**, campagne consolidée incluant les tests
  d’inventaire, de conservation locale, de transitions et les migrations existantes.
- **16 tests Electron réussis** : huit GitLab/Nextcloud réels et huit locaux/simulés.
  Le scénario Local vérifie la conservation brute d’un `.lexaf.json` et d’un binaire,
  l’exclusion d’un fichier d’accès, les détails repliés et l’absence de copie des médias.
- Les deux destinations média GitLab conservent quatre documents dans le dépôt :
  ancien résultat, réglages partiellement ignorés, texte non UTF-8 et binaire LFS
  supérieur à 9 Mio. Tous sont relus et comparés aux octets source. Les gardes,
  SIGKILL, réponses perdues et deux lots/251 entretiens repassent avec ces documents.
- Typecheck et build réussis ; captures des bilans dans `test-results/`.

Repères de la campagne réelle étendue, projets synthétiques conservés :

| Destination des médias | Source → cible | Commit source inchangé |
|---|---|---|
| GitLab/LFS | 293 → 294 | `bd398a0964d4e08bd23c4a0721195405bf838122` |
| WebDAV, documents dans GitLab | 295 → 296 | `ed42d85153f238d85d4e744c28c6251b5bf27f68` |

Commande consolidée :

```sh
npx vitest run test/gitlab test/migrationCrp.test.ts test/migrationGitLabRenderer.test.ts \
  test/projetGitLabRenderer.test.ts test/pseudonymisationProjection.test.ts \
  test/commentairesMigration.test.ts test/webdav/lectureMedia.test.ts test/mediasCorpus.test.ts \
  test/conservationMigration.test.ts test/conservationMigrationLocale.test.ts \
  test/couturesIpc.test.ts test/transitionContexte.test.ts \
  --exclude '**/qualification*.test.ts' --exclude '**/contrat-gitlab.test.ts'
```

Pour la campagne réelle, préparer les bancs GitLab et Nextcloud A avec
`preparer_bancs_docker`, puis suivre les commandes de la
[qualification GitLab](migration-gitlab-v1-qualification.md#rejouer).
Aucun corpus utilisateur, commit ou push ; pas de nouvelle qualification Windows,
institutionnelle, de quota, de stockage LFS sur une autre origine ou de charge maximale.
