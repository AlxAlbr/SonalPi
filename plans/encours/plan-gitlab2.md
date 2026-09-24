# Corpus distants multi-backends et GitLab — plan révisé après étude de la branche V1 `webdav`

**Statut : proposition à valider, aucune implémentation engagée.**

## 1. Conclusion de l'étude

Oui, la branche V1 `webdav` invite à infléchir le plan, mais pas à en reprendre
le code ni à considérer que l'unification était déjà réalisée.

La bonne cible n'est plus seulement « ajouter GitLab à côté de Nextcloud ».
Il faut construire un **socle de corpus distants commun**, consommé par le reste
de l'application, puis brancher WebDAV/Nextcloud et GitLab derrière ce socle.
Cette unification doit toutefois porter sur les intentions métier et les
capacités, pas sur une fausse API universelle de fichiers.

La branche V1 confirme quatre besoins utiles :

1. le renderer ne devrait pas tester partout `type === 'distant' || type === 'gitlab'` ;
2. la sélection du fournisseur doit être centralisée dans le main ;
3. les permissions et les options de collaboration doivent devenir des notions
   communes, contrôlées côté main ;
4. les chemins métier doivent être indépendants des URL WebDAV et des URL web
   GitLab.

Elle ne change pas les contraintes les plus importantes du premier plan :
GitLab publie des commits, ses verrous LFS ne sont pas un bail Nextcloud, les
gardes de concurrence doivent être vérifiées sur un vrai serveur, et
l'historique Git conserve potentiellement des données sensibles supprimées.

### Recommandation révisée

Construire deux niveaux explicites :

- une **façade de travail distant**, orientée cas d'usage SonalPi : ouvrir,
  actualiser, commencer une édition, publier, fermer, exécuter une transaction,
  lire un média ou ouvrir la destination dans le navigateur ;
- des **ports techniques séparés** pour la lecture versionnée, la publication
  conditionnelle et la coordination. WebDAV et GitLab les implémentent selon
  leurs garanties réelles.

Ne pas créer un unique `ServeurAPI` avec `lireFichier`, `ecrireFichier` et
`verrouillerFichier` comme plus petit dénominateur commun. Cette forme paraît
simple, mais masque précisément les différences qui déterminent la sûreté des
écritures.

## 2. Ce que contient réellement la branche V1 `webdav`

### 2.1 Périmètre vérifié

Dépôt étudié : `/home/belignem/Vscode/SonalPi`, branche locale et distante
`webdav`.

La branche part de `cfd239b` (`v1.0.75`) et contient seulement deux commits :

- `649a2a6` — « Généricisation de l'API introduite par gitlab » ;
- `f5625df` — indentation du JSON `.crp`.

Le message du premier commit précise lui-même que WebDAV n'est pas encore
abordé et que l'API doit d'abord être stabilisée. La branche est en outre
antérieure aux évolutions ensuite fusionnées dans la branche principale V1.
Elle constitue donc une **esquisse d'architecture**, pas un backend WebDAV à
porter.

### 2.2 Idées intéressantes

Le commit introduit ou amorce :

- `remoteAPI()` pour sélectionner l'API distante active dans le main ;
- `Corpus.estDistant` afin de remplacer des tests répétés sur les fournisseurs ;
- `Corpus.hasLock` pour exprimer une capacité ;
- des handlers `get-remote-*` et un `checkPermission(permission)` communs ;
- des méthodes de conversion chemin/URL dans l'adaptateur GitLab ;
- l'utilisation de la même méthode de liste distante pour les recueils ;
- une sérialisation `.crp` indentée afin de rendre l'historique Git lisible.

L'intention générale est juste : le métier ne doit pas connaître GitLab à
chaque embranchement.

### 2.3 Limites observées à ne pas reproduire

L'esquisse reste inachevée et montre les risques d'une généralisation trop
rapide :

- `estDistant` et `hasLock` sont des booléens mutables, redondants avec le type
  du corpus et susceptibles de devenir incohérents ;
- `remoteAPI()` renvoie par défaut l'API serveur, même sans contexte distant ;
- les noms appelés par le main et ceux implémentés par les classes ne sont pas
  tous alignés (`getRemoteOptions`/`lireOptions`, par exemple) ;
- le passage de la permission par IPC et son attente asynchrone sont incomplets ;
- vérifier une permission puis lancer séparément l'action crée une course ;
- le serveur historique est assimilé à un propriétaire pour tous les comptes ;
- `url2filepath()` et `filepath2url()` codent encore `main` en dur et parsèrent
  une URL de présentation ;
- le rafraîchissement GitLab reste une branche spéciale, avec un commentaire
  indiquant qu'il n'est pas encore fusionné au rafraîchissement distant ;
- les méthodes génériques gardent des sémantiques différentes selon le backend ;
- les écritures GitLab ne disposent pas encore de gardes démontrées contre les
  modifications concurrentes ;
- les verrous LFS n'expirent pas et l'identité est comparée par nom ;
- la désactivation TLS reste présente dans le code V1.

L'indentation du JSON est utile pour la revue et l'historique, mais elle ne
transforme pas les commits GitLab en fusion ligne par ligne. Les gardes REST
restent au niveau du fichier ou de l'action.

## 3. Ce qui change par rapport au premier plan

Le premier plan reste valable sur les risques GitLab. Les changements portent
surtout sur la cible architecturale et l'ordre de réalisation.

| Sujet | Premier angle | Angle révisé |
|---|---|---|
| Finalité | Ajouter un backend GitLab au socle Nextcloud. | Faire émerger un vrai socle distant multi-backends, puis y ajouter GitLab. |
| API commune | Contrats de lecture/publication/coordination internes. | Ajouter au-dessus une façade de cas d'usage unique pour le main, le preload et le renderer. |
| Capacités | Étendre `ProfilCapacites`. | Remplacer les drapeaux implicites par un profil dérivé, discriminé et orienté actions. |
| Permissions | Sujet transversal. | Chantier de premier rang, avec contrôle atomique dans chaque commande main. |
| Chemins | Adapter les configurations. | Interdire qu'une URL web GitLab ou DAV serve d'identifiant de fichier métier. |
| Verrous GitLab | Prototype privilégié de fichiers versionnés. | Comparer réellement fichiers de bail, LFS Locks et éventuel service externe avant de choisir. |
| Ordonnancement | Preuve GitLab, puis extraction. | Caractérisation et extraction Nextcloud possibles immédiatement ; preuve GitLab menée en parallèle. |
| Valeur si l'écriture GitLab échoue | Support GitLab fortement retardé. | Socle commun et consultation GitLab restent livrables sans compromettre Nextcloud. |

Cette révision ne propose donc pas un « grand refactoring » préalable. Elle
prévoit une extraction incrémentale, couverte par les bancs Nextcloud existants,
et interdit de brancher l'écriture GitLab tant que son protocole n'est pas
prouvé.

## 4. Principes et invariants

### 4.1 Frontières

- `CorpusStore` et le modèle partagé restent locaux et indépendants du serveur.
- Le renderer demande des actions SonalPi ; il ne manipule ni client WebDAV, ni
  projet GitLab, ni ETag, ni SHA, ni jeton.
- Le main possède les comptes, choisit le backend, contrôle les permissions et
  exécute les opérations.
- Les chemins de contenu sont relatifs à la racine logique du corpus.
- Une URL de navigation est produite à la demande par le backend ; elle n'est
  jamais la clé d'un fichier.
- Les secrets ne figurent ni dans les objets publics, ni dans les récents, ni
  dans les manifestes, ni dans les événements ou journaux.

### 4.2 Invariants de collaboration

1. Le miroir ne pousse rien spontanément en dehors des sessions et transactions
   autorisées.
2. Une simple consultation ne prend aucun verrou.
3. Après acquisition d'un droit d'écriture, la version distante fraîche est la
   base de la session.
4. Toute publication est conditionnée par la version réellement lue.
5. Une modification locale arrivée pendant la publication reste sale.
6. Une copie sale, divergente ou récupérable n'est jamais écrasée par un tirage.
7. Une fermeture publie avant de libérer ; en cas d'incertitude, elle bloque la
   bascule de corpus.
8. Un résultat réseau perdu après une écriture possible est `indetermine`, pas
   un échec certain et pas un succès supposé.
9. Un backend incapable de garantir une action la refuse explicitement ; il ne
   simule pas la capacité dans le renderer.
10. Les droits sont contrôlés dans la même commande main que la mutation, sans
    séquence publique « vérifier puis agir ».

## 5. Architecture cible

```text
Renderer
  commandes métier + état public + capacités
                  |
Preload typé, sans primitive réseau générique
                  |
Main : ContexteDistant
  - façade de cas d'usage
  - miroir
  - sessions d'entretien
  - transactions corpus
  - politique d'autorisation
                  |
        ports techniques distants
       /              |             \
lecture versionnée  publication   coordination
       \              |             /
        Adaptateur WebDAV   Adaptateur GitLab
                  |
             CorpusStore local
```

### 5.1 Façade de cas d'usage

Créer une interface de travail, par exemple `ContexteDistant`, qui expose des
intentions stables :

```ts
interface ContexteDistant {
  profilPublic(): ProfilDistantPublic
  tirer(): Promise<ResultatTiragePublic>
  ouvrirSession(id: string): Promise<EtatSessionPublic>
  publierSession(id: string): Promise<ResultatPublicationPublic>
  fermerSession(id: string): Promise<ResultatFermetureSession>
  executerTransaction<T>(commande: CommandeTransaction<T>): Promise<T>
  ouvrirSurServeur(cible?: CheminDistant): Promise<void>
  terminer(): Promise<ResultatFermetureToutes>
}
```

Les noms exacts seront fixés pendant l'extraction. Le point important est que
les handlers IPC dépendent de cette façade, pas du fournisseur concret.

Ne pas exposer au renderer `ecrireFichierDistant`, `supprimerFichierDistant` ou
`checkPermission`. Une commande telle que `distant:ajouterEntretien` effectue
elle-même l'autorisation, les verrous, la relecture, la mutation et la
publication.

### 5.2 Ports techniques

La façade s'appuie sur des contrats plus précis :

- **Lecture versionnée** : résoudre un instantané, inventorier complètement,
  lire texte ou binaire avec version et limites, produire un lien web sûr ;
- **Publication** : appliquer un plan d'actions avec versions attendues,
  indiquer si le lot est atomique et distinguer confirmé/refusé/indéterminé ;
- **Coordination** : acquérir, renouveler si nécessaire, observer, reprendre et
  libérer une exclusion ; lier une publication au droit détenu lorsque le
  backend le permet ;
- **Capacités auxiliaires** : présence, média distant, téléversement, Docs cadre.

Il ne faut pas forcer WebDAV à annoncer des commits atomiques, ni GitLab à
imiter `PROPFIND` ou `MKCOL`.

### 5.3 Destination et chemins

Introduire une union discriminée persistée sans secret :

```ts
type DestinationDistante =
  | {
      type: 'webdav'
      compteId: string
      racineUrl: string
    }
  | {
      type: 'gitlab'
      compteId: string
      instanceUrl: string
      projectId: number
      projectPathAffiche: string
      branche: string
      racineCorpus: string
    }
```

Un `CheminDistant` est un chemin relatif normalisé, jamais une URL. Il refuse
`..`, chemin absolu, anti-slash, NUL, encodage ambigu et sortie de racine. Les
branches contenant `/`, les espaces, accents, groupes et sous-groupes sont
encodés par l'adaptateur, composante par composante.

L'identité d'un miroir comprend le fournisseur, l'instance canonique, la
destination, la branche/racine et le compte. Elle ne contient pas le secret.

### 5.4 Capacités et autorisations

Remplacer `estDistant`, `hasLock` et les suppositions liées au rôle par un
profil calculé :

```ts
interface ProfilDistantPublic {
  fournisseur: 'webdav' | 'gitlab'
  lecture: boolean
  editionEntretien: boolean
  transactionsCorpus: boolean
  creationCorpus: boolean
  presence: boolean
  lectureMedia: boolean
  televersementMedia: boolean
  lienServeur: boolean
  raisons: Partial<Record<ActionDistante, string>>
}
```

Le profil résulte de trois sources distinctes :

1. capacités techniques mesurées du backend ;
2. droits effectifs du compte et de la branche ;
3. politique fonctionnelle éventuelle du corpus.

Le profil public sert à l'affichage. Il n'accorde jamais un droit : chaque
commande main recalcule ou revalide ce qui est nécessaire avant la mutation.

La V1 `restrictionAjoutSuppr` peut devenir une politique fonctionnelle commune,
mais pas une sécurité. Si elle est conservée, elle vit dans le corpus, est
modifiée sous transaction et s'ajoute aux permissions serveur. Un membre
capable de modifier directement le dépôt peut contourner cette règle ; l'UI doit
le documenter.

## 6. Adaptateur WebDAV/Nextcloud

Le comportement courant est la référence de non-régression, pas une
implémentation à réécrire.

L'extraction doit encapsuler progressivement :

- `ClientWebDAV` derrière le port de lecture ;
- les ETags et préconditions derrière les versions opaques ;
- `ProviderPutConditionnel` et `ProviderFilesLock` derrière la coordination ;
- les publications séquentielles/compensations derrière l'exécuteur WebDAV ;
- les détails `PROPFIND`, `MKCOL`, `MOVE` et files_lock dans l'adaptateur ;
- les URL Nextcloud des Docs cadre dans le service de navigation.

Les classes existantes `MiroirWebDAV`, `SessionsDEntretien` et
`TransactionsCorpus` peuvent garder temporairement leurs noms. On injecte
d'abord les contrats, puis on renomme seulement quand les imports WebDAV ont
disparu du cœur. Le but est de produire de petits changements relisibles.

Les anciens comptes, récents, manifestes et copies de récupération doivent
continuer à s'ouvrir sans recréation de miroir. Les comptes sans discriminant
sont migrés comme WebDAV de façon idempotente.

## 7. Adaptateur GitLab

### 7.1 Lecture cohérente

Pour chaque tirage :

1. résoudre la branche choisie vers un SHA `S` ;
2. inventorier toutes les pages de l'arbre sous `racineCorpus` avec `ref=S` ;
3. lire les fichiers avec ce même instantané ;
4. utiliser `blob_id` comme empreinte de contenu, sans le confondre avec une
   garde d'écriture ;
5. préparer et valider le tirage avant de l'installer ;
6. préserver les chemins exclus par les sessions et les copies récupérables ;
7. ne déduire aucune suppression d'une pagination interrompue, d'un 403, d'un
   délai ou d'un résultat incomplet.

Autoriser seulement les fichiers attendus du corpus. Refuser les symlinks,
sous-modules, formats inconnus et collisions de noms incompatibles avec le
poste local. Une ouverture avec un compte lecteur ne crée aucun commit,
verrou, fichier d'options ou `.gitattributes`.

### 7.2 Publications

Utiliser l'API Commits pour les opérations multi-fichiers :

- ajout : entretien et membership dans le même commit ;
- suppression : retrait du membership et déplacement vers une corbeille dans
  le même commit ;
- mutation liée : tous les JSON concernés dans le même plan si les limites le
  permettent ;
- création : actions `create` refusant une destination occupée.

Chaque action modifiant ou supprimant un fichier porte la garde appropriée
validée sur les versions GitLab cibles. Un SHA de branche, un `blob_id` et un
`last_commit_id` ne sont pas interchangeables. `start_sha` ne doit pas être
présenté comme un compare-and-swap de branche et `force` est interdit.

Un lot indivisible trop gros est refusé avant envoi. Il n'est pas découpé en
commits laissant un état métier partiel.

### 7.3 Résultats incertains

Avant envoi, journaliser localement l'identifiant d'opération, les chemins,
versions attendues et empreintes candidates, sans secret ni transcription en
clair supplémentaire.

Après perte de réponse :

- rechercher l'opération dans l'historique ou via un marqueur non sensible ;
- comparer le contenu publié au bon commit ;
- accepter qu'un commit ultérieur ait déjà avancé la branche ;
- ne jamais renvoyer aveuglément le POST ;
- conserver candidat et journal si le résultat reste indéterminé.

Une divergence conserve toujours la copie locale et passe par le parcours de
récupération V2. Aucun « dernier écrivain gagnant » silencieux.

## 8. Décision spécifique sur les verrous GitLab

La branche V1 utilise les LFS Locks et les assimile à l'interface du serveur
historique. Cette piste mérite d'être testée, mais pas présumée correcte.

Le prototype doit comparer au moins :

| Option | Avantage | Risque à prouver |
|---|---|---|
| LFS Locks GitLab | Pas de commit de battement, mécanisme déjà exposé par GitLab. | Verrou consultatif, pas de TTL, reprise après crash, force unlock, identité multi-postes, absence possible de lien atomique avec un commit REST. |
| Fichiers de bail sur la branche | Création/mise à jour conditionnelle et génération visible. | Très nombreux commits, bruit CI, contention, coût et croissance du dépôt. |
| Service de baux externe | Sémantique de lease adaptée et historique Git propre. | Nouveau service à exploiter, disponibilité et déploiement institutionnel. |
| Édition optimiste sans verrou | Aucun service de coordination. | UX différente, conflits fréquents et besoin de fusion ; hors parité avec Nextcloud. |

### Banc obligatoire

Avec deux comptes et deux postes indépendants, vérifier :

- acquisition concurrente : un seul gagnant ;
- même utilisateur sur deux machines ;
- verrou abandonné après crash puis reprise contrôlée ;
- retrait ou forçage du verrou pendant une publication ;
- modification directe dans l'UI GitLab ;
- commit REST alors qu'un autre détient un LFS Lock ;
- update/delete/move avec `last_commit_id` périmé ;
- atomicité d'un commit multi-actions dont une garde est fausse ;
- réponse perdue après commit accepté ;
- branche protégée, rôle retiré et jeton expiré en session ;
- coût sur une journée de plusieurs sessions, y compris pipelines et 429.

### Porte de décision

L'écriture GitLab n'est activée que si une option garantit qu'un ancien
propriétaire ne peut pas publier après perte de son droit, y compris lors des
courses testées. Si aucune solution acceptable n'est démontrée, GitLab est
livré en consultation et l'édition reste désactivée par capacité.

Le contrat de coordination peut dépasser l'actuel `VerrouProvider` : une
publication sous droit détenu doit être une opération de premier rang. Faire
`etat()` puis `publier()` dans deux requêtes ne constitue pas une garantie.

## 9. Authentification, confidentialité et médias

### 9.1 Authentification

- PAT pour le banc et la première préversion, stocké par le coffre côté main ;
- OAuth PKCE S256 ensuite, avec `state`, callback loopback borné, navigateur
  système et aucun secret client embarqué ;
- validation TLS obligatoire, sauf serveur HTTP local explicite des tests ;
- aucun `rejectUnauthorized: false` en production ;
- renouvellement sérialisé, rotation du refresh token et révocation testés ;
- aucun jeton dans les URL, logs, erreurs, manifestes ou liens ouverts.

La branche par défaut du projet est une suggestion lors de la sélection. La
branche choisie est ensuite mémorisée explicitement ; `main` n'est jamais codé
en dur.

### 9.2 Historique sensible

Un commit de suppression ou d'anonymisation ne supprime pas les versions
antérieures. Avant usage réel : projet privé, habilitations, politique de
conservation et validation des responsables du corpus. Si l'effacement effectif
des anciennes versions est requis, GitLab peut être inadapté.

Les messages de commit ne contiennent ni noms de personnes, ni extraits de
transcription, ni chemins locaux. La sérialisation JSON reste déterministe et
indentée pour la revue, sans prétendre fournir une fusion automatique.

### 9.3 Médias et Docs cadre

- conserver les associations audio locales ;
- permettre la lecture sélective de médias déjà hébergés, streamée vers un
  temporaire puis renommée ;
- détecter les pointeurs LFS et refuser clairement ce qui n'est pas résolu ;
- reporter l'upload de gros médias tant qu'un vrai client LFS n'existe pas ;
- extraire les Docs cadre vers inventaire, lecture bornée et lien serveur
  indépendants du fournisseur ;
- ne jamais faire transiter les credentials vers une autre origine lors d'une
  redirection de téléchargement.

## 10. Migration V1

La branche `webdav` n'ajoute pas un format de corpus à migrer. Les sources V1
restent les `.crp`, `.sonal`, annexes et éventuels objets LFS du projet GitLab.

Le parcours demeure explicite :

1. sélectionner instance, projet, branche, chemin et commit source ;
2. télécharger dans une zone temporaire privée ;
3. résoudre les pointeurs LFS ou produire un bilan d'arrêt ;
4. réutiliser la migration locale V1 → V2 ;
5. présenter le bilan complet, notamment anonymisation et médias absents ;
6. choisir une nouvelle destination V2 ;
7. publier sans modifier le corpus V1 source.

Aucun ancien jeton V1 n'est importé automatiquement. `restrictionAjoutSuppr`
n'est migrée que si sa sémantique produit est décidée et expliquée.

## 11. Lots de réalisation révisés

### L0 — Caractérisation et inventaire des coutures

**But :** figer les comportements à préserver avant extraction.

- Tester ouverture, tirage, session, transaction, fermeture, crash et
  divergence Nextcloud sur les deux variantes de verrou existantes.
- Inventorier tous les handlers et composants qui accèdent directement à
  `ClientWebDAV`, aux ETags, aux URL Nextcloud ou aux capacités actuelles.
- Ajouter des tests de contrat autour des sessions et transactions avant toute
  modification de constructeur.
- Documenter précisément ce qui est livré aujourd'hui et ce qui n'est qu'une
  intention, notamment l'édition hors ligne.

**Sortie :** matrice de comportement et tests rouges si l'extraction change une
garantie observable.

### L1 — Façade distante et capacités, avec Nextcloud seulement

- Introduire `ContexteDistant` et une fabrique de contexte.
- Faire passer progressivement les IPC par des commandes métier.
- Introduire destination discriminée, chemins relatifs et profil public.
- Centraliser les autorisations dans les commandes main.
- Conserver l'ancien format du coffre via migration idempotente.
- Retirer des composants les tests de fournisseur non nécessaires.

**Sortie :** Nextcloud fonctionne à l'identique ; aucun bouton GitLab ; le
renderer ne dispose plus de primitive générique d'écriture distante.

### L2 — Ports techniques et adaptation WebDAV

- Extraire lecture versionnée, publication et coordination.
- Injecter ces ports dans miroir, sessions et transactions.
- Sortir les scans et reprises propres à DAV du cœur commun.
- Versionner le manifeste par backend et destination.
- Séparer les plans métier des exécutions WebDAV, en commençant par
  ajout/suppression d'entretien.

**Sortie :** le cœur commun n'importe plus `ClientWebDAV`; les bancs Nextcloud
A/B restent verts et les anciens miroirs restent récupérables.

### L3 — Client GitLab et consultation

- Client REST injectable : pagination, délais, annulation, backoff et erreurs
  normalisées.
- Découverte utilisateur/projet/branche et droits effectifs.
- Tirage figé sur SHA et installation validée dans le miroir.
- Connexion PAT, sélection explicite de destination et récents.
- Consultation, actualisation, Docs cadre minimaux et médias locaux.
- Lecture seule imposée dans le main.

**Sortie :** deux postes peuvent consulter et actualiser un même corpus sans
aucune écriture serveur implicite.

### L4 — Preuve de concurrence GitLab, en parallèle de L1 à L3

- Construire le banc réel dédié avec données synthétiques.
- Tester LFS Locks, fichiers de bail et gardes des commits.
- Mesurer coût, latence, quotas, pipelines et résultats incertains.
- Rédiger `docs/dev/gitlab.md` avec versions de serveur, requêtes, réponses et
  décision de protocole.

**Sortie :** décision explicite consultation seule ou édition autorisable. Les
mocks ne suffisent pas à valider ce lot.

### L5 — Sessions d'édition GitLab

**Dépendance :** L4 accepté.

- Implémenter la coordination retenue et la publication sous droit détenu.
- Préserver autosauvegarde locale, révisions monotones, publication manuelle et
  périodique, rétrogradation et fermeture bloquante.
- Reprendre après crash avant tout tirage destructeur.
- Traiter perte réseau, réponse indéterminée, révocation de droit et reprise du
  verrou par un tiers.

**Sortie :** un seul éditeur par entretien et aucune publication possible par
un ancien détenteur.

### L6 — Transactions et création GitLab

- Exécuter les plans multi-fichiers dans un commit atomique.
- Couvrir ajout/import/suppression, définitions, personnes, lots,
  anonymisation et sources de passages.
- Créer un corpus dans une destination libre sans dossiers factices.
- Gérer projet vide, branche absente, limites d'actions et absence de
  changement.
- Vérifier qu'aucun handler de mutation ne retombe sur un store local sans
  protection distante.

**Sortie :** parité avec les mutations distantes V2 supportées, sans membership
partiel ni écrasement concurrent.

### L7 — OAuth, médias et finition multi-backends

- OAuth PKCE et renouvellement des jetons.
- Navigation serveur générique et libellés pilotés par capacités.
- Lecture GitLab des médias supportés, progression et cache.
- Présence GitLab désactivée explicitement si elle n'est pas disponible.
- Décision et UI de la politique `restrictionAjoutSuppr`.

**Sortie :** parcours non technicien utilisable, sans fuite de secret ni fausse
promesse de support média/LFS.

### L8 — Migration V1 et validation finale

- Import GitLab V1 figé sur commit et publication vers destination V2 séparée.
- E2E deux profils, application empaquetée et instance institutionnelle cible.
- Documentation utilisateur, exploitation du banc, confidentialité et limites.

**Sortie :** migration vérifiée et support déclaré selon les capacités réellement
validées.

### Ordre conseillé

L0 → L1 → L2 → L3. L4 commence dès que le projet GitLab de test est disponible
et avance en parallèle. L5 et L6 sont interdits sans sortie positive de L4.
L7 peut commencer après L3 pour les parties sans écriture. L8 clôt le chantier.

## 12. Stratégie de tests

### Niveaux

1. **Unitaires purs** : destinations, chemins, capacités, politiques,
   sérialisation, erreurs, plans d'actions et résultats indéterminés.
2. **Contrats de façade** : mêmes scénarios métier avec adaptateur WebDAV en
   mémoire puis GitLab simulé.
3. **Faux HTTP** : pagination, limites, délais, redirections, erreurs et réponse
   perdue ; aucune garantie de concurrence n'est validée uniquement ici.
4. **Nextcloud réel A/B** : non-régression avec les images et volumes existants.
   Utiliser `npm run nc:up` et `npm run nc-b:up`, sans pull ni reprovisionnement.
5. **GitLab réel opt-in** : projet jetable, deux identités, version enregistrée,
   secrets par environnement ou coffre, nettoyage borné aux fixtures.
6. **E2E Electron** : deux profils, bascule local/Nextcloud/GitLab, fermeture,
   crash, médias et permissions.

### Scénarios minimaux

- deux acquisitions du même entretien : un seul éditeur ;
- deux entretiens différents publiés sans conflit artificiel de branche ;
- modification dans l'UI GitLab pendant une session : publication ancienne
  refusée et copie locale conservée ;
- perte du verrou pendant la publication : aucun succès silencieux ;
- commit multi-actions avec une garde fausse : aucune action visible ;
- réponse perdue après succès : réconciliation sans doublon ;
- crash avant/après commit et avant/après libération ;
- token expiré, rôle retiré, branche protégée ;
- pagination interrompue ou 429 : aucune fausse suppression ;
- branche avec `/`, sous-groupes, accents et instance sous-chemin ;
- deux destinations proches : miroirs, événements et secrets isolés ;
- migration du coffre et réouverture Nextcloud ;
- compte GitLab lecteur : zéro écriture implicite ;
- média absent, LFS ou volumineux : corpus texte toujours utilisable ;
- import V1 avec anonymisation et audio introuvable : bilan sans perte silencieuse.

Commandes de base :

```sh
npm run typecheck
npm test -- test/webdav
npm test -- test/transitionContexte.test.ts test/fermetureApplication.test.ts
npm test -- test/distantRenderer.test.ts test/docsCadreDistant.test.ts
npm test
npm run build
npm run test:multiuser
```

Ajouter les tests GitLab sans rendre le serveur réel obligatoire pour la suite
hors réseau. Un skip faute de configuration n'est pas une validation.

## 13. Définition de terminé

- [ ] Le renderer et les handlers ordinaires ne branchent plus sur le fournisseur.
- [ ] Les chemins métier ne sont jamais des URL web ou DAV.
- [ ] Les capacités sont dérivées et les mutations sont autorisées côté main.
- [ ] Le protocole GitLab réel est documenté avec ses versions et ses limites.
- [ ] Aucune écriture GitLab n'existe sans garde démontrée.
- [ ] Aucun résultat indéterminé n'est effacé ou annoncé comme succès certain.
- [ ] Les invariants de session, transaction, fermeture et reprise sont conservés.
- [ ] Nextcloud A/B, corpus locaux, coffre et anciens miroirs n'ont pas régressé.
- [ ] Consultation GitLab et, si validée, édition à deux postes sont testées.
- [ ] OAuth, TLS, journaux et liens ne divulguent aucun secret.
- [ ] Les limites de présence, média, LFS et historique sont affichées clairement.
- [ ] La migration V1 est testée ou explicitement annoncée comme non livrée.

## 14. Arbitrages avant l'écriture GitLab

1. Quelles instances et versions GitLab faut-il supporter ?
2. Les corpus concernés acceptent-ils la conservation des anciennes versions ?
3. Quel protocole de coordination sort vainqueur du banc réel ?
4. Une préversion GitLab en consultation seule a-t-elle une valeur suffisante ?
5. La politique `restrictionAjoutSuppr` est-elle encore utilisée et doit-elle
   devenir une règle V2 commune ?
6. Les médias partagés sont-ils nécessaires au premier déploiement ?
7. Quels volumes réels : nombre d'entretiens, taille des JSON, postes simultanés
   et fréquence des mutations ?

Le premier travail concret recommandé est donc **L0 et L1**, pendant que le
banc GitLab de L4 est préparé. C'est la principale différence avec le premier
plan : la branche V1 `webdav` montre qu'unifier l'expérience distante est une
valeur propre, mais elle montre aussi qu'une API de fichiers générique et des
booléens de capacité ne suffisent pas à sécuriser cette unification.
