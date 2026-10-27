# Plan — ouvrir les commandes Personnes sur WebDAV

**Statut : proposé, aucune activation effectuée.**

## 1. Conclusion et objectif

Le déblocage est envisageable sans reconstruire la fonctionnalité : modèle,
interface, dispatch IPC et transactions WebDAV existent déjà. Le verrou immédiat
est `personnes.commande`, classé `indisponible` malgré `capacites.personnes = true`
pour WebDAV.

**Ce n’est cependant pas une simple bascule sûre.** Les tests de transactions
appellent directement les méthodes, sans prouver le parcours normal de
l’application. Les corrections multi-fichiers, les réponses perdues et les
sessions encore ouvertes doivent être contrôlées avant l’activation.

Objectif : rendre les commandes existantes utilisables sur Nextcloud/WebDAV,
avec préservation des données, refus explicites et traitement compréhensible
des échecs partiels. GitLab reste fermé ; le fonctionnement local est conservé.
Pas de refonte du modèle Personne, de synchronisation automatique des valeurs
ni d’ouverture de l’annulation du journal distant dans ce chantier.

## 2. Socle constaté dans le code

| Commande `CommandePersonnes` | Routage WebDAV déjà présent |
|---|---|
| `creerDefinition`, `modifier` | Transaction de définitions corpus. |
| `lier` avec personne ou `null`, `annulerRefus` | `executerEntretien` : corpus stabilisé et entretien protégé. |
| `creer` | Définition créée, puis première association. |
| `refuser` | Cible et source protégées ; création éventuelle d’une identité distincte. |
| `rapprocher` | Source et cible protégées ; création et reprise choisie de données si nécessaires. |
| `supprimer` | Contrôle frais de tous les entretiens avant suppression de la fiche vide. |
| `fusionner` | Liens d’entretiens avant retrait de la définition absorbée. |
| `separer` | Nouvelle définition avant déplacement des liens choisis. |

Repères :

- `src/main/gitlab/politiqueGestes.ts` : refus global et capacité publique ;
- `src/main/index.ts`, handler `corpus:personnesCommander` : branches déjà raccordées ;
- `src/main/distant/transactions.ts` : corrections simples et composites ;
- `src/main/corpusStore.ts`, `src/shared/corpus/personnes.ts` : commandes et invariants ;
- `src/renderer/components/traiter/corpus/PersonnesCorpus.vue` : répertoire ;
- `src/renderer/composables/useCorpus.ts` : sauvegarde avant commande ;
- `src/renderer/composables/entretien/useLocuteursEntretien.ts` : identification au nommage.

**Point de départ vérifié : 145 tests réussis dans cinq fichiers** :
`test/personnes.test.ts`, `test/rapprochementsPersonnes.test.ts`,
`test/webdav/transactions.test.ts`, `test/gitlab/politiqueGestes.test.ts` et
`test/distantRenderer.test.ts`. Tests locaux/en mémoire uniquement ; aucune
nouvelle qualification Nextcloud réelle ou Electron distant n’est revendiquée.

## 3. Points à fermer avant activation

### Entretien encore ouvert

Le répertoire peut modifier le fichier d’un entretien dont le renderer conserve
encore les locuteurs en mémoire. Une sauvegarde ultérieure ne doit pas annuler
l’association, recréer une référence supprimée ou perdre les dernières paroles.

Vérifier le cycle complet : terminer les sauvegardes, sérialiser avec les
publications de session, appliquer la correction, resynchroniser les données
concernées et les projections. Ne pas remplacer une transcription éditée par
une copie serveur ancienne. Distinguer « enregistré localement dans notre
session » et « publié sur le serveur » lorsque la transaction diffère l’envoi.

### Opérations partielles et identité de reprise

Le code conserve déjà certaines réussites et affiche une erreur partielle.
Ce comportement n’est pas encore une reprise durable de toute l’intention.
Notamment, `separer` génère actuellement sa nouvelle identité dans le store :
rejouer après création de la fiche mais échec du lien peut créer une autre fiche.
`creer` peut également laisser une définition vide après échec de l’association.

Conserver l’identité créée et l’intention nécessaire à la reprise, ou proposer
explicitement de terminer le lien vers cette identité. Ne jamais retrouver une
réussite par le seul nom, ni relancer aveuglément une création. Après interruption,
reconnaître les écritures acquises avant de poursuivre. Réutiliser les mécanismes
de suivi existants s’ils conviennent ; ajouter seulement le suivi ciblé manquant,
sans fabriquer un second moteur général de transactions.

Une publication acceptée dont la réponse et la relecture sont perdues reste
**inconnue**, pas échouée. Préserver son candidat et interdire un nouvel envoi
contradictoire tant que son résultat n’est pas reconnu. Aucun rollback distant
aveugle, aucune suppression automatique des définitions déjà acquises.

### Contrôles globaux et droits

Fusion, séparation et suppression inspectent tout le membership. Vérifier que
les lectures sont fraîches et complètes, les verrous pris dans l’ordre corpus
puis entretiens triés, et qu’un refus libère seulement nos droits acquis.
Borner la durée ou maintenir et revérifier les droits pendant une correction
longue : un verrou obtenu au début ne suffit pas s’il expire pendant l’opération.
Aucun dialogue utilisateur ne doit maintenir ces verrous ouverts.

Contrôler aussi les règles de cas, les refus de rapprochement et les références
de notes. Une suppression doit rester refusée si une règle de cas utilise la
personne. Une fusion redirige les cas et refus ; une séparation ne transfère
pas implicitement les règles vers la nouvelle identité. Une session ne doit pas
republier ultérieurement des associations vers une définition retirée.

## 4. Mise en œuvre proposée

### Étape 1 — tests de caractérisation et décisions de reprise

- Compléter les tests mémoire sur les points ci-dessus avant de changer la politique.
- Vérifier la sérialisation avec tirages, autosauvegardes et autres opérations
  globales ; le compteur de mutations ne doit pas être supposé suffisant à lui seul.
- Définir pour chaque commande son résultat : confirmé, différé dans notre
  session, refusé, partiel ou inconnu, et l’action explicite possible ensuite.
- Confirmer les comportements sur les deux providers : PUT conditionnel et
  `files_lock`. Les méthodes actuelles constituent le socle, pas une preuve finale.

### Étape 2 — raccords ciblés

- Corriger la resynchronisation de l’entretien ouvert et l’invalidation des
  projections Personnes, Notes, Cas et analyses concernées.
- Stabiliser l’identité des créations et séparations reprises ; vérifier les
  garde-fous de publication contre les références devenues invalides.
- Compléter, si nécessaire, le suivi des opérations composites et le traitement
  des publications inconnues, avec contrôles frais à la reprise.
- Présenter un bilan bref : ce qui est enregistré, ce qui reste à terminer et
  comment reprendre. Les ETags, verrous et journaux restent dans les détails
  d’assistance, pas dans le texte principal des confirmations.

### Étape 3 — qualification avant ouverture

Créer une recette dédiée `test/webdav/personnes-nextcloud.test.ts` et un parcours
`e2e/personnes-webdav.e2e.ts`, avec corpus synthétiques isolés, deux comptes et
deux profils. Vérifier les états serveur, miroir et renderer, pas seulement
l’absence d’erreur de la méthode.

| Scénario | Résultat attendu |
|---|---|
| Créer, renommer, lier, déplacer, délier, annuler un refus | Effet confirmé, données locales conservées. |
| Entretien tenu par l’autre compte ou par un autre poste du même compte | Refus sans écrasement ni libération du verrou tiers. |
| Entretien ouvert chez nous avec saisie récente | Aucun écrasement par l’autosauvegarde suivante ; publication cohérente. |
| Rapprocher avec/sans personne source, avec/sans reprise de données ; refuser avec création | Source fraîche, reprise limitée au choix confirmé, ordre des écritures correct. |
| Supprimer une fiche utilisée, source absente ou règle de cas dépendante | Refus sans suppression ; l’indisponibilité ne vaut pas absence d’usage. |
| Fusion et séparation, avec notes et cas | Liens corrects, aucun doublon dans un entretien, notes non copiées, cas préservés. |
| Aperçu modifié depuis l’autre poste, divergence 412, coupure réseau | Refus ou bilan partiel explicite, sans état local présenté comme publié à tort. |
| Réponse perdue après chaque écriture composite | Reconnaissance sans doublon ni renvoi d’une réussite acquise. |
| Arrêt réel après création de définition ou premier lien, puis relance | Identités conservées, reprise explicite et sûre, aucun droit actif hérité ou forcé. |
| Perte de droit, tirage ou fermeture pendant correction | Pas de publication tardive sans droit, ni installation dans un autre corpus. |
| Consultation seule, hors ligne, appel IPC direct, commande inconnue | Refus cohérent dans le main et l’interface. |

Préparer les bancs avec `preparer_bancs_docker` pour `nextcloud-a` et `nextcloud-b`.
Aucun téléchargement, reprovisionnement ou arrêt des bancs. Ne jamais forcer un
verrou pour faire réussir la recette. Les parcours SIGKILL ne valent preuve que
si la phase d’arrêt et l’état réellement acquis sont contrôlés.

### Étape 4 — activer WebDAV, pas GitLab

- Introduire une portée dédiée aux commandes Personnes, accordée en local et
  WebDAV seulement ; ne pas les reclasser dans une portée déjà ouverte à GitLab.
- Conserver le contrôle main avant dispatch et le refus GitLab, y compris par IPC.
- Faire dériver la capacité publique de la politique réelle pour supprimer la
  contradiction actuelle. Si une famille de commandes n’est pas qualifiée,
  prévoir un classement par commande et des contrôles d’interface explicites,
  plutôt que d’ouvrir toute la famille derrière un unique drapeau.
- Ne pas activer avant les preuves de l’étape 3. Si les composites demandent
  trop de travail, livrer d’abord un sous-ensemble clairement annoncé ; ne pas
  appeler cela une ouverture complète de Personnes.
- Mettre à jour `docs/dev/distant/gestes.md`,
  `docs/dev/traiter/locuteurs/personnes.md` et la documentation utilisateur.

## 5. Critères de fin

- [ ] Matrice publique et commandes réellement acceptées concordent.
- [ ] Parcours normaux WebDAV qualifiés sur les deux providers.
- [ ] Entretien ouvert, données non publiées et projections restent cohérents.
- [ ] Aucun rejeu ne recrée une identité après une réussite partielle ou inconnue.
- [ ] Aucune suppression ne laisse un lien invalide ni ne contourne les usages de cas.
- [ ] Réponses perdues et interruption réelle ont une issue de reprise vérifiée.
- [ ] GitLab, hors ligne et consultation seule restent refusés ; local non régressé.
- [ ] Tests ciblés, `npm run typecheck`, `npm run build` et documentation à jour.

**Appréciation :** raccordement court pour les commandes simples ; chantier
plus prudent pour la réorganisation multi-fichiers. La priorité est de qualifier
et compléter l’existant, pas de réécrire les transactions ni d’enlever la garde.
