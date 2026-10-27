# Plan — déblocages distants prioritaires

**Statut : proposé. Aucun geste supplémentaire activé par ce plan.**

## 1. Ordre de livraison

1. **Personnes sur WebDAV**, en s’appuyant sur le
   [plan détaillé existant](plan-personnes-webdav.md).
2. **Modifier et supprimer les notes depuis la vue Corpus**, d’abord sur
   WebDAV, puis sur GitLab.
3. **Personnes sur GitLab**, en reprenant les invariants et scénarios du premier
   lot, mais avec les transactions propres à GitLab.

Cet ordre privilégie le socle déjà présent, puis une mutation ciblée d’entretien,
avant les corrections d’identité multi-fichiers sur un second fournisseur.
Chaque livraison exige ses propres preuves ; une ouverture WebDAV n’autorise
jamais implicitement GitLab. Ne pas attendre la fin des trois lots pour livrer
un premier périmètre effectivement qualifié.

Hors périmètre : annulation du journal distant, fusion thématique destructive
WebDAV, documents du projet GitLab et téléversement général des médias GitLab.
Ces sujets ne conditionnent pas les déblocages retenus.

## 2. Invariants communs

- Le main décide des commandes autorisées ; les capacités publiques et boutons
  doivent refléter ce verdict, sans remplacer les droits de session ou de transaction.
- Une commande travaille sur une version fraîche protégée, jamais sur une copie
  renderer faisant autorité ni par écriture directe du miroir.
- Une correction depuis le corpus ne doit pas être annulée par l’autosauvegarde
  d’un entretien resté ouvert. Sauvegarde, correction, resynchronisation et
  publication doivent avoir un ordre vérifié, sans perdre le texte en cours.
- Refus certain, réussite partielle et publication inconnue sont distincts.
  Reconnaître une réponse perdue avant tout rejeu ; conserver les identités acquises.
- Hors ligne, consultation seule, droit tiers et changement de corpus doivent
  empêcher toute mutation indue, y compris par appel IPC direct.
- Conserver le comportement local. Ne pas ouvrir l’annulation distante du
  journal comme effet secondaire d’une nouvelle commande éditable.

Les ajustements partagés doivent rester ciblés : pas de nouveau moteur générique
de transactions ni de refonte du modèle natif sans nécessité démontrée.

## 3. Lot 1 — Personnes WebDAV

Exécuter le [plan Personnes WebDAV](plan-personnes-webdav.md), qui reste la
référence détaillée pour les commandes, les risques et la qualification.

Priorités : cohérence avec l’entretien ouvert, identité de reprise des créations
et séparations, écritures composites et contrôles des usages de personnes dans
les cas. Le simple retrait de `personnes.commande` des gestes indisponibles ne
constitue pas une livraison.

**Sortie du lot :** périmètre annoncé et qualifié sur les deux providers Nextcloud,
politique main et capacité publique cohérentes, GitLab toujours refusé.
Un sous-ensemble simple peut être livré si ses commandes sont distinguées des
composites encore fermés ; le statut de chaque commande doit être explicite.

## 4. Lot 2 — notes depuis la vue Corpus

### Périmètre et point de départ

L’édition des notes dans une session d’entretien existe déjà. Ce lot concerne
uniquement la **modification et la suppression de notes existantes depuis la
vue Corpus** ; ni nouvelle création corpus ni nouvelle gestion des catégories.

Le modèle `CommandeNotes`, la comparaison `attendu` et l’interface existent.
Le renderer refuse actuellement les commandes distantes et le main appelle
encore directement `store.notesCommander(commande, true)` derrière `note.editer`,
classé indisponible. Il manque un parcours de publication distant raccordé et
qualifié, pas seulement une capacité à rendre vraie.

### Réalisation, WebDAV puis GitLab

1. Séparer la mutation métier de sa persistance pour pouvoir utiliser la même
   comparaison d’état dans le store local et une transaction distante protégée.
   Ne pas appliquer une commande corpus comme une simple définition de `corpus.json` :
   la donnée modifiée appartient à l’entretien.
2. Sur WebDAV, réutiliser le cycle de correction ciblée, les définitions nécessaires
   étant stabilisées, avec lecture fraîche et publication conditionnelle.
3. Pour une session déjà détenue, sérialiser et resynchroniser la note sans
   écraser les autres notes, locuteurs ou transcriptions. Distinguer publication
   confirmée et modification encore à publier par la session.
4. Sur GitLab, adapter le parcours d’écriture ciblée d’entretien existant aux
   notes : bail, candidat, gardes de fichier et de définitions, journal de
   publication et réconciliation. Ne pas réutiliser une commande de valeurs EAV
   pour lui faire transporter arbitrairement des notes.
5. Retirer le refus renderer et ouvrir la politique de chaque fournisseur
   seulement après sa qualification. Conserver le contrôle des appels IPC.

### Règles à préserver et tests

- Comparer l’état sémantique attendu de la note ; `modifieLe` est actuellement
  exclu de cette comparaison. Un vrai changement concurrent impose une actualisation.
- Modifier seulement les champs éditables ; préserver identité, locuteurs concernés,
  rang et date de création. Une suppression renumérote sans perdre les autres notes.
- Conserver le nettoyage HTML restreint, les liens de commentaires et la distinction
  public/privé. Ce statut ne constitue pas un droit d’accès entre collaborateurs.
- Revalider l’existence de la note, de l’entretien et de la catégorie. Un échec
  ou un succès doit rafraîchir les vues concernées sans inventer une réussite serveur.
- Une réponse perdue après suppression ne doit pas être traitée comme une seconde
  suppression aveugle ; utiliser les preuves de publication pour reconnaître le résultat.
- Ne pas exposer une annulation locale qui réécrirait ensuite le miroir distant.

Compléter `test/notesCorpus.test.ts`, `test/notesCorpusDistant.test.ts` et les
tests de transactions des deux fournisseurs. Prévoir des recettes dédiées
`test/webdav/notes-nextcloud.test.ts`, `test/gitlab/qualificationNotes.test.ts`
et `e2e/notes-corpus-distant.e2e.ts` (fichiers à créer).

**Sortie du lot :** modification et suppression par l’entrée normale, refus de
conflit et de verrou tiers, entretien ouvert conservé, réponse perdue reconnue,
et états serveur/miroir/interface concordants, pour chaque fournisseur ouvert.

## 5. Lot 3 — Personnes GitLab

### Adaptation, pas transplantation du protocole WebDAV

La capacité GitLab est actuellement fausse et le handler refuse les commandes
avant ses branches WebDAV. Les transactions Personnes WebDAV ne sont donc pas
un adaptateur GitLab déjà prêt. Garder ce refus tant que le routage GitLab
n’est pas implémenté et qualifié.

Porter les commandes par périmètre croissant :

1. définitions seules : création et renommage de fiche ;
2. association, déplacement, déliaison et annulation de refus dans un entretien ;
3. création liée, refus composite et rapprochement avec source/reprise de données ;
4. suppression après inventaire complet, fusion et séparation, avec les usages
   de cas et les refus à réconcilier.

Réutiliser `ContexteGitLab`, `TransactionsGitLab`, les sessions, le publieur et
leurs journaux. Pour les commandes composites, préférer un plan gardé unique
lorsqu’il tient dans les limites ; compter aussi les actions de coordination.
Un dépassement doit être refusé explicitement. Ne pas fractionner implicitement
un geste atomique pour contourner la borne ; un éventuel lot reprenable exige
un protocole et une qualification distincts.

Vérifier la protection de toutes les sources et définitions utilisées, les
publications de sessions détenues et l’impossibilité de réintroduire une personne
supprimée par une session ancienne. Une création ou séparation reprise conserve
son identité, pas seulement son nom. Adapter les scénarios du lot 1 sans
supposer que l’ordre de PUT WebDAV équivaut à un commit GitLab.

Prévoir `test/gitlab/personnes.test.ts`, `test/gitlab/qualificationPersonnes.test.ts`
et `e2e/personnes-gitlab.e2e.ts` (à créer). Tester deux comptes, deux postes du
même compte, candidat périmé, réponse perdue, arrêt réel et limites de publication.

**Sortie du lot :** commandes GitLab annoncées effectivement accessibles par le
parcours normal, sans ouverture des commandes non qualifiées et sans régression
WebDAV ou locale.

## 6. Qualification et suivi communs

Pour chaque lot et chaque fournisseur :

- tests mémoire du modèle, dispatch, refus, concurrence et réponses tardives ;
- recette serveur avec données synthétiques isolées, puis parcours Electron
  par les formulaires normaux, sans contournement IPC de l’activation produit ;
- vérification des octets/données serveur, du miroir et de l’état renderer,
  notamment après l’autosauvegarde suivante et une réouverture ;
- contrôles de sécurité après interruption, pas seulement scénario nominal ;
- `npm run typecheck`, `npm run build`, tests locaux de non-régression ;
- mise à jour de `docs/dev/distant/gestes.md`, des pages Notes/Personnes et du
  guide utilisateur, en distinguant clairement les commandes livrées des restantes.

Avant les recettes réelles dans pi, appeler `preparer_bancs_docker` avec les
seuls bancs nécessaires : Nextcloud A/B pour WebDAV, GitLab pour GitLab.
Conserver images et volumes existants ; aucun pull, reprovisionnement ou arrêt
inutile. Un serveur absent, un saut ou une doublure mémoire ne vaut pas preuve
réelle. Ne jamais libérer un verrou tiers pour faire réussir une recette.

## 7. Jalons

- [ ] Personnes WebDAV : périmètre et reprise qualifiés selon le premier plan.
- [ ] Notes corpus WebDAV : modification et suppression qualifiées puis ouvertes.
- [ ] Notes corpus GitLab : adaptation qualifiée puis ouverte.
- [ ] Personnes GitLab : commandes qualifiées puis ouvertes par périmètre explicite.
- [ ] Matrice publique, verdict main et documentation concordants à chaque livraison.

Les 145 tests mémoire consignés dans le premier plan constituent seulement un
point de départ pour Personnes WebDAV, pas une validation des nouveaux lots.
Aucun calendrier ni coût ferme n’est déduit de cette lecture du code.
