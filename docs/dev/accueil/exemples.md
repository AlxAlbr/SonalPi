# Corpus exemples — repères développeur

Les exemples sont des **corpus de travail modifiables**, créés à partir de contenus
fournis avec l’application. Le modèle fourni sert à l’installation, jamais à
réparer automatiquement un travail existant. Renommer ou supprimer un entretien
dans un exemple doit rester effectif à la prochaine ouverture.

## Contenu fourni et usage sont deux choix distincts

`src/shared/exemples.ts` distingue deux contenus :

- `synth` : quatre entretiens transcrits, sans codage thématique initial ;
- `synth-annote` : le même terrain, annoté, avec ses thèmes et ses variables.

Leur usage détermine le point de départ réellement installé :

| Usage | Point de départ |
|---|---|
| Apprentissage — Préparer et suivre | Corpus vierge, sans variable ajoutée ; les fichiers d’exercice sont disponibles séparément. |
| Apprentissage — Importer et traiter | Autre corpus vide, avec la variable de saisie libre « Ville » au niveau locuteur. |
| Apprentissage — Analyser et interpréter | Copie propre à ce parcours de `CorpusSynthAnnot`, avec ses quatre entretiens annotés. |
| Apprentissage — Organiser et exporter | Autre copie de `CorpusSynthAnnot`, indépendante du parcours d’analyse. |
| Exploration libre — `synth` | Quatre entretiens importés depuis les SRT fournis, avec leurs références audio. |
| Exploration libre — `synth-annote` | Copie du corpus annoté, sans guide actif. |

`EXEMPLES_PAR_PARCOURS` fixe le contenu associé à chacun des quatre parcours.
Chaque parcours possède son corpus d’apprentissage : terminer l’un n’altère pas
le point de départ des autres. La création n’est pas une étape pédagogique.

## Identité du corpus et mémoire du poste

Le champ additif `corpus.json.demo` contient l’identité et les acquis :

```text
id, exemple, usage, racineSources,
parcours, parcoursApprentissage?, dernierParcoursId?
```

L’identité est créée à l’installation. Elle ne se déduit ni du nom du dossier,
ni des titres d’entretiens. `identiteExemple()` vérifie le marqueur ;
`ExemplesLocaux.reconnaitre()` vérifie aussi le corpus qui le porte.
Le code ne convertit pas les anciens marqueurs ou les anciennes mémoires de démo.

Le `settings.json.exemples` du profil mémorise les emplacements des travaux,
un accès d’apprentissage par parcours et la dernière exploration choisie pour
chaque contenu. Ce registre n’est pas limité comme les Récents. Les progressions
sont relues dans les corpus, pas déduites de l’existence d’un raccourci.

Un travail enregistré peut être `pret`, `absent` ou `illisible`. Les deux derniers
états conservent son accès et ne déclenchent aucune réinstallation. Retrouver un
dossier déplacé vérifie son identité ; un autre corpus ne remplace pas
silencieusement l’accès existant. Une copie portant le même identifiant est
refusée si l’original enregistré est toujours reconnu à son ancien emplacement.

## Installer : préparer, fermer, puis publier

```text
useExemples → InstallationExemple.vue → cycle de création du corpus
  → ExemplesLocaux.preparerInstallation() : construire hors de la cible
  → fermer le contexte courant
  → publier, enregistrer et ouvrir le corpus complet
```

La destination doit être **vide ou absente**. Un dossier contenant des fichiers
n’est pas disponible au seul motif que son `membership` est vide ou qu’il n’a
pas de `corpus.json`. Les sources, les exemples fournis et les travaux enregistrés
sont protégés contre les recouvrements, y compris par imbrication ou lien symbolique.
Les propositions de dossiers utilisent des noms sans accents et des underscores ;
un suffixe `_2`, puis `_3`, évite les emplacements déjà enregistrés. Cela ne
remplace pas la vérification de la destination réelle par le main.

La préparation construit le corpus dans un dossier temporaire :

- pour l’exploration transcrite, le renderer convertit les quatre SRT par le sas
  d’import habituel, puis le main utilise `CorpusStore.importerEntretien()` ;
- pour le corpus annoté, le main copie les données fournies et réassigne leurs
  références audio aux fichiers du poste, sans modifier les originaux ;
- le marqueur d’identité est posé avant toute inscription possible aux Récents.

La publication attend la fermeture réussie du contexte courant. Elle revérifie
la destination, installe les sources manquantes, puis copie le corpus préparé.
Si la fermeture est refusée, ni le nouveau corpus ni ses sources ne sont publiés.
Les écritures de fichiers restent dans le main ; le catalogue n’en réalise aucune.

## Reprendre ou retrouver n’est pas réinstaller

`useExemples.reprendreTravail()` vérifie l’accès enregistré, sélectionne le travail
puis utilise le cycle d’ouverture ordinaire. Aucun entretien n’est réimporté,
aucun codage fourni n’est réappliqué et aucun acquis n’est effacé.
Lancer une étape après ouverture est une autre action, décrite dans
[parcours guidés](parcours.md).

Si **Ouvrir un corpus local** reçoit un corpus d’apprentissage reconnu, le main le
rattache au registre et notifie le renderer, qui ouvre le catalogue, sans basculer
vers ce corpus, sans l’inscrire aux Récents et sans lancer de guide. **Retrouver mon dossier…** permet
le rattachement d’un travail dont l’emplacement enregistré manque.

## Sources communes et restauration

Les sources viennent de `CorpusTest/CorpusSynth/` : quatre SRT, quatre MP3 et le
guide d’entretien. Ce sous-dossier est installé directement sous `srt/`, `audio/`
et `docs/` à l’emplacement de sources enregistré dans le profil.
Les audios sont référencés, jamais recopiés dans chaque corpus d’exercice.
Le corpus annoté fourni vient de `CorpusTest/CorpusSynthAnnot/`.

L’installation prépare les sources manquantes. En revanche, une reprise ne les
restaure pas automatiquement : les textes et annotations du corpus restent
consultables sans elles. La commande explicite de restauration ajoute uniquement
les fichiers manquants, sans remplacer un guide modifié ou un autre fichier présent.
Les étapes demandant des fichiers ouvrent le sous-dossier utile.

## Recommencer une démo

C’est la seule reprise qui remplace volontairement le contenu. Après confirmation,
`recommencerDemo()` prépare un corpus neuf pour le parcours, ferme le contexte
courant puis remplace le dossier de cette démo. Le main revérifie son identité,
garde une sauvegarde temporaire et restaure l’ancien dossier si le remplacement
échoue.

L’identifiant et l’emplacement restent stables ; contenu et progression repartent
du point de départ. Les autres corpus ne sont pas modifiés. Après réussite,
le dialogue affiche un bilan et attend **Commencer la première étape** : fermer
ce bilan ou revenir au catalogue ne lance pas de guide.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Contenus, usages, contrats et identité | `src/shared/exemples.ts` |
| Registre, reconnaissance, installation et restauration | `src/main/exemples.ts` |
| Publication après fermeture du contexte | `src/main/transitionContexte.ts` |
| Choix, reprise, remise à zéro et préparation des SRT | `src/renderer/composables/useExemples.ts` |
| Fenêtre de découverte, bilan de remise à zéro et catalogue | `src/renderer/components/accueil/DecouverteExemples.vue`, `CatalogueParcours.vue` |
| Choix d’emplacement et lancement de l’installation | `src/renderer/components/accueil/InstallationExemple.vue` |

L’accueil sépare visuellement les copies libres récentes des corpus personnels.
Le catalogue conserve la liste des travaux enregistrés, même après retrait d’un
raccourci récent. Les démos guidées restent accessibles par Parcours pas à pas.
Le classement des récents repose sur le marqueur relu côté main, pas sur le nom.
Recette de disposition et de reprise : `e2e/accueil-disposition.e2e.ts`.

Tests de référence : `test/exemples.test.ts` (identité, destinations, installation,
reprise et remise à zéro), `test/transitionContexte.test.ts` (fermeture avant
publication), `e2e/demo.e2e.ts` (parcours d’interface) et
`e2e/sources-demo.e2e.ts` (sources et restauration sans écrasement).
`e2e/exemples-paquet.e2e.ts` vérifie les exemples et références audio dans un paquet
installé ; voir [empaquetage](../outillage/empaquetage-ci.md).
