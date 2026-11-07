# Report des travaux CRP sur multiongletcorpus

## Sauvegarde et branche de travail

- `essai-crp` conserve l'état intégral des travaux, fichiers nouveaux compris,
  au commit `097c916` (base `main`, `ca8ad85`).
- `essai-crp-multionglet` est créée depuis `multiongletcorpus`, commit `7eb01f0`.
- Les 87 commits de cette base sont conservés. Aucun rebase, reset ou push n'est
  effectué sur les branches existantes ; aucun corpus personnel n'est converti.

Le report n'est pas une substitution de l'ancienne application : les composants
réorganisés et les composables par domaine de la nouvelle base restent en place.

## Adaptations

- Le nom natif `corpus.crp` est appliqué au local, à WebDAV et à GitLab, y compris
  les ressources de droits, les journaux, les publications et les fixtures.
  Le format reste **9**, version de la nouvelle base, sans incrément lié au nom.
- Les anciens V2 en `corpus.json` restent à sauvegarder et renommer manuellement,
  application fermée et sans travaux distants en attente. Aucune conversion
  automatique des corpus personnels ou des dépôts existants n'est lancée.
- Les demandes système et le sélecteur de CRP passent par les ouvertures préparées.
  Les miroirs restent réservés à leur compte distant. La première demande initiale
  garde priorité et les demandes concurrentes ne sont pas mises en attente.
- L'orchestration d'ouverture, le renommage et leurs modales vivent dans
  `useCycleCorpus` et `App.vue`. La navigation par espaces et l'aiguillage de première
  ouverture sont conservés, avec la mémoire de navigation du profil.
- La migration locale complète sa cible non active avant de basculer. Elle conserve
  les médias externes, copie les internes, permet l'annulation et marque le seul
  CRP V1 en sauvegarde après ouverture. Les réglages Lexico et la conservation
  documentaire `Autres/` de la nouvelle base sont maintenus ; leurs copies sont
  également annulables. La carte locale redondante est retirée.
- La migration GitLab et sa carte sont conservées : découverte, accès OAuth ou
  jeton, bilan, copies et reprise suivent le protocole existant. Le CRP distant V1
  n'est pas renommé. Les métadonnées V2 publiées portent désormais le nom natif CRP.
- Le renommage du projet passe par la transaction de définitions du fournisseur,
  aussi sur GitLab. Il ne modifie ni les chemins ni les URL.
- L'empaquetage de la nouvelle base conserve son identité, ses ressources et ses
  cibles ; seule l'association CRP y est ajoutée. Les vieux artefacts de `release/`
  ne valident pas cette application. Le contrôle d'un paquet utilise explicitement
  `CRP_E2E_EXECUTABLE` pointant vers un paquet reconstruit.

## Validation ciblée

Pas de suite générale lancée pour ce report.

- Typecheck et build de la nouvelle base : réussis.
- 207 tests ciblés, dans 14 fichiers : réussis. Ils couvrent le nom natif, la
  lecture stricte, le renommage, la migration locale, les documents et Lexico,
  les transitions, la navigation par espaces et les transactions/préparations GitLab.
- 33 E2E distincts ciblés : réussis après adaptation des attentes à la navigation
  de la nouvelle base. Ils couvrent ouverture et autosave, refus concurrents,
  renommage, migration locale, interface GitLab simulée et conservation/réinitialisation
  des états dans les espaces. La dernière exécution de ces 34 E2E donne 33 réussites
  et le seul saut de paquet ci-dessous.
- 1 E2E de paquet sauté : aucun exécutable reconstruit n'a été fourni.

Les bancs GitLab/Nextcloud réels, l'installation système et Windows/macOS ne sont
pas requalifiés par ce report. Aucun téléchargement ni reprovisionnement Docker.
