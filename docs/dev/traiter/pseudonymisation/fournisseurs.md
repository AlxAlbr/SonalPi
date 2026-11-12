# Pseudonymisation selon le fournisseur

Les moteurs de `src/shared/` décrivent les transformations métier. Le main leur
ajoute un protocole adapté au stockage local, à GitLab ou à WebDAV.

Toutes les capacités actuelles de pseudonymisation sont ouvertes sur les trois
fournisseurs : application dans les entretiens, renommage, dissociation,
suppression globale, ajout et retrait de variante. Chaque geste conserve toutefois
sa propre qualification et son propre journal ; la réussite d’un geste n’autorise
pas automatiquement les autres.

La matrice publique reste définie dans `src/main/gitlab/politiqueGestes.ts` et
expliquée dans [gestes par fournisseur](../../distant/gestes.md).

## Cycle commun d’une opération globale

```text
lecture fraîche
→ inventaire complet
→ aperçu privé
→ consentement
→ revalidation
→ écritures gardées
→ contrôle final
→ installation ou reprise
```

Principes communs :

- le renderer ne fournit jamais les documents à publier ;
- les aperçus sont temporaires, liés au corpus et consommés à chaque tentative ;
- un refus ou un changement exige un nouvel aperçu et, si nécessaire, un nouveau
  consentement ;
- les réussites déjà prouvées ne sont pas compensées ni rejouées ;
- une issue inconnue bloque les envois suivants jusqu’à relecture ;
- les sources concurrentes ne sont jamais écrasées ;
- les journaux techniques restent privés au main et ne sont pas envoyés au
  renderer.

## Comparaison synthétique

| Sujet | Local | GitLab | WebDAV |
|---|---|---|---|
| Source de l’inventaire | fichiers du corpus | dépôt publié à un SHA | serveur et ETags forts |
| Protection d’écriture | empreintes et transaction fichiers | baux, gardes de commit et barrières | verrous, `If-Match` et barrières |
| Publication | remplacements locaux ordonnés | commits courts ciblés | PUT conditionnels ciblés |
| Atomicité multi-fichiers | transaction reprenable | non | non |
| Preuve d’un succès incertain | état du journal et fichiers | commit unique et octets attendus | relecture de l’image exacte |
| Copie locale distante | sans objet | miroir après preuve serveur | miroir après preuve serveur |
| Reprise | journal local | journal spécialisé | journal spécialisé |

## Local

Les opérations globales locales utilisent les fichiers du corpus comme autorité.
Elles préparent toutes les transformations avant le premier remplacement, puis
écrivent les entretiens ciblés avant `corpus.crp`.

`.transaction-fichiers.json` conserve les images nécessaires à une reprise
idempotente. Sa version dépend de l’opération afin que la lecture puisse
redériver précisément la seule transformation autorisée.

Avant la finalisation, le service recontrôle :

- les empreintes des sources ;
- les membres non ciblés ;
- les fichiers déjà acquis ;
- l’absence de nouvelle référence ou de nouveau choix incompatible.

Les opérations globales demandent en principe la fermeture des sessions locales.
Le raccourci depuis l’entretien automatise cette contrainte lorsque seul
l’entretien courant est concerné : sauvegarde, fermeture technique, opération et
réouverture.

Une interruption conserve le journal. Il ne faut pas le supprimer pour débloquer
artificiellement le corpus : la reprise doit soit confirmer les acquis, soit
signaler la source concurrente.

Services principaux :

- `src/main/renommagesAnon.ts` ;
- `src/main/dissociationsAnon.ts` ;
- `src/main/suppressionsAnon.ts` ;
- `src/main/retraitsVarianteAnon.ts`.

## GitLab

GitLab lit le corpus et ses membres publiés, jamais le miroir comme autorité de
préparation. Les opérations qui touchent plusieurs entretiens utilisent des
commits courts : définition ou barrière, puis une cible à la fois, puis contrôle
et finalisation.

Les sessions non ciblées peuvent rester ouvertes. Une cible ouverte, tenue,
modifiée ou devenue inaccessible est différée plutôt que fermée de force.

Les gardes principales sont :

- bail du corpus pour les changements de définition ;
- bail d’un entretien au moment de sa publication ;
- `last_commit_id` et contenu attendu ;
- barrière publiée pour dissociation, suppression ou retrait de variante ;
- contrôle final de tout le membership.

Chaque opération longue possède un journal spécialisé, par exemple :

- `.renommage-anon-gitlab.json` ;
- `.dissociation-anon-gitlab.json` ;
- `.suppression-anon-gitlab.json` ;
- `.retrait-variante-anon-gitlab.json`.

Le journal de publication commun apporte séparément la preuve d’un commit. Une
réponse perdue est reconnue par l’identifiant de publication, les actions et les
octets attendus ; elle ne provoque pas un second commit.

Une nouvelle instance peut reconnaître un commit, mais ne déduit jamais du
journal qu’elle possède encore les baux de l’ancienne instance. Les droits
persistants sont conservés et le produit refuse de les voler ou de les libérer
sans provenance vivante.

Certaines finalisations gardent les versions des entretiens déjà acquis dans le
commit de retrait. La limite courante du publieur GitLab est alors présentée dans
l’aperçu ; elle ne constitue pas une limite métier du nombre d’entretiens que le
scan peut lire.

Services principaux : `src/main/gitlab/*Anon.ts` et leurs fichiers
`journal*Anon.ts`.

## WebDAV

WebDAV prépare depuis le serveur et exige des ETags forts. Le miroir local ne sert
jamais de source de secours pour autoriser une mutation.

Le protocole habituel est :

1. lire le corpus et tous les membres nécessaires ;
2. relire le corpus pour vérifier la stabilité de l’inventaire ;
3. acquérir le droit corpus, puis celui d’une cible ;
4. revalider les octets et ETags ;
5. enregistrer l’intention ;
6. envoyer un PUT avec `If-Match` ;
7. confirmer durablement avant d’installer le miroir.

WebDAV ne fournit pas d’atomicité commune à plusieurs fichiers. Un lot peut donc
être partiellement publié. Les succès confirmés restent acquis et la reprise ne
traite que les éléments restants.

Une réponse perdue est reconnue uniquement si une relecture retrouve exactement
l’image envoyée. Retrouver l’image originale ne prouve pas que le PUT a été
refusé : le résultat reste indéterminé et aucun rejeu n’est autorisé.

Les verrous persistants d’un processus arrêté ne sont ni hérités ni libérés
automatiquement, même avec le même compte. L’application demande leur libération
par leur détenteur ou par l’administration ; les bancs de test n’effectuent une
intervention extérieure qu’après avoir prouvé l’arrêt du processus synthétique.

Services principaux : `src/main/distant/*AnonWebDAV.ts` et leurs journaux
spécialisés.

## Suivi, miroir et ouverture

Un journal incomplet est validé avant le premier tirage du miroir. Selon son état :

- les cibles restantes sont exclues des ouvertures et des tirages ;
- les sources déjà acquises peuvent être réinstallées depuis leur version serveur
  actuelle ;
- une issue inconnue exige une relecture sans envoi ;
- une reprise ordinaire exige un inventaire frais et un nouveau consentement.

La panne d’installation du miroir après une publication confirmée est un succès
serveur incomplet localement, pas une raison de rejouer la publication.

Le renderer ne voit que les identifiants de cibles, états, compteurs et motifs de
blocage. Les avant/après natifs et les tables de correspondance restent privés.

## Import ciblé de correspondances

L’import ciblé possède son propre protocole, car il peut modifier des définitions
et les libellés de locuteurs d’entretiens explicitement choisis. Il ne pose
aucune annotation textuelle et ne réassigne pas les liens de personnes.

En local, les empreintes du corpus et des fichiers sont recontrôlées et les
sessions ciblées doivent être fermées. Toutes les copies sont préparées avant
le journal durable de remplacement. La reprise accepte uniquement les états
avant ou après connus, sans écraser une modification extérieure.

Sur GitLab, l’aperçu lit les données publiées à un même SHA. L’import acquiert
le bail corpus puis ceux des entretiens ciblés, triés par identifiant, relit les
versions et publie définitions et cibles dans **un seul commit gardé**.
Les sessions locales ou récupérables des cibles sont refusées et les entretiens
doivent déjà être au format natif courant. Le nombre de cibles, le volume de
l’inventaire et la taille de publication sont bornés ; les limites font foi dans
`src/main/gitlab/correspondances.ts` et `src/main/gitlab/publication.ts`.
Une issue inconnue exige la réconciliation avant un nouvel import ; une panne
d’installation du miroir après confirmation exige un tirage, pas un second commit.

Sur WebDAV :

- l’inventaire vient du serveur ;
- le corpus puis les entretiens sont verrouillés dans un ordre stable ;
- les définitions sont publiées avant les entretiens ;
- chaque PUT utilise `If-Match` ;
- le journal `.correspondances-webdav.json` conserve le plan et sa progression ;
- une reprise revalide tout le plan avant de publier les fichiers restants.

Les limites de sélection, d’inventaire et de journal sont contrôlées dans
`src/main/distant/correspondancesWebDAV.ts` et
`src/main/distant/journalCorrespondancesWebDAV.ts`. Le suivi public ne transmet
ni les copies avant/après ni la table d’origine ; celles-ci restent privées.
L’import ciblé reste distinct des opérations globales sur les règles.

Code principal :

- `src/main/distant/correspondancesWebDAV.ts` ;
- `src/main/gitlab/correspondances.ts` ;
- `src/shared/corpus/importCorrespondancesEntretiens.ts`.

## Tests

Les tests sont répartis selon le même découpage :

- moteurs purs : `test/*Anon.test.ts` ;
- transaction locale : `test/*AnonLocal.test.ts` ;
- GitLab : `test/gitlab/*Anon*.test.ts` ;
- WebDAV en mémoire et Nextcloud réel : `test/webdav/*Anon*.test.ts` ;
- parcours produit : `e2e/*anon*.e2e.ts` et
  `e2e/correspondances-webdav.e2e.ts`.

Les scénarios distants vérifient notamment les publications partielles, réponses
perdues, relances, verrous persistants, sessions concurrentes et absence de rejeu.
