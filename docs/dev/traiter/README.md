# Traiter — documentation développeur

Ce dossier rassemble la documentation des fonctions de traitement des corpus et
des entretiens. Il correspond à l’espace `src/renderer/components/traiter/`.
Les autres espaces de la documentation restent pour l’instant à leur emplacement
actuel ; ce regroupement ne déplace aucun composant.

## Entrées par fonction

| Documentation | Contenu |
|---|---|
| [pseudonymisation/](pseudonymisation/README.md) | Brouillons, décisions textuelles, règles corpus, fournisseurs et sorties. |
| [thematiques/](thematiques/README.md) | Codebook, codages, hiérarchie et réaffectations. |
| [notes/](notes/README.md) | Notes d’entretien, liens aux commentaires et locuteurs, consultation corpus et exports. |
| [locuteurs/](locuteurs/README.md) | Attribution des tours, noms et pseudonymes, personnes et rapprochements entre entretiens. |
| [variables.md](variables.md) | Définitions, modalités, valeurs, table de données et modifications en lot. |

## Import des transcriptions

`src/shared/importEntretien.ts` définit les extensions du sélecteur et du dépôt.
Pour Word/PDF, `src/main/importEntretien.ts` extrait du texte brut, puis
`src/renderer/formatSonal/sas.ts` applique le convertisseur TXT repris de SonalPi1.
Les noms des fichiers sont conservés pour nommer les entretiens.

L’extraction Word utilise `mammoth.extractRawText`, comme en V1. L’extraction PDF
utilise PDF.js déjà présent dans le projet et suit les lignes et l’ordre des pages.
La sélection native lit le fichier dans le main ; le dépôt envoie ses octets par
`fichier:extraireTexteEntretien`. Les deux entrées utilisent le même extracteur.
Les originaux ne sont jamais réécrits. Un échec de lecture reste dans la fenêtre
d’ajout, sans créer d’entretien vide ; une nouvelle sélection permet de reprendre.

Le convertisseur TXT reconnaît aussi les exports tabulés de type Tadddam / NVivo :
`secondes<TAB>locuteur<TAB>texte`, sans en-tête. Il refuse les lignes incomplètes,
les temps invalides ou décroissants, avec les numéros de lignes d’origine.
Le début suivant sert de fin au passage précédent ; aucune fin n’est inventée
pour le dernier passage. Les formats TXT antérieurs restent reconnus.

Le SRT accepte les préfixes `Nom : texte`, y compris `SPEAKER_00` et `Speaker N`,
sans renumérotation. Un passage sans préfixe reste sans locuteur ; `None:` est
retiré sans créer de locuteur. SRT et VTT séparent les lignes de texte par des
espaces. Le regroupement des tours reste assuré par `importerSonal`, avec
conservation des bornes temporelles internes.

Tests : `test/importTranscriptions.test.ts`, `test/importBureautique.test.ts`,
`test/sas.test.ts`, `test/documentationImports.test.ts` et
`e2e/documentation-socle.e2e.ts`. Le test `e2e/import-bureautique.e2e.ts` accepte
`IMPORT_E2E_EXECUTABLE=/chemin/vers/sonalpi2` pour vérifier le paquet.
La [procédure utilisateur](../../user/traiter/importer.html) décrit le même ajout
que pour les autres formats, sans dialogue supplémentaire.

## Deux niveaux, des vues partagées

Le code des composants distingue trois emplacements :

- `entretien/` : travail sur un entretien ouvert et sauvegarde de ses données ;
- `corpus/` : consultation transversale et opérations à l’échelle du corpus ;
- `partages/` : interfaces réutilisées, notamment l’édition des thèmes et la
  table de données.

La documentation conserve des entrées par fonction : chaque page explique où
vivent les définitions, où vivent leurs usages et quelles vues sont calculées.
Un sous-dossier est utilisé lorsque plusieurs parcours méritent une lecture
séparée ; une page suffit pour les variables.

## Repères communs

- [Modèle objet](../modele-objet.md) : contrats et agrégats Corpus / Entretien.
- [Données et commandes](../donnees.md) : mémoire, rendu, fichiers et orchestration.
- [Gestes selon le fournisseur](../distant/gestes.md) : disponibilité effective
  et gardes communes aux opérations locales, GitLab et WebDAV.
- [Architecture](../architecture.md) : partage entre domaine pur, renderer et main.

La présence d’une méthode de transaction ne suffit pas à rendre un parcours
accessible : la politique des gestes et le dispatch du main font également foi.
