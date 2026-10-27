# WebDAV / Nextcloud — repères développeur

WebDAV fournit des fichiers, des ETags et des écritures conditionnelles.
`ContexteCorpusDistant` assemble miroir, sessions, transactions et présence.
Le [cycle commun](README.md) reste distinct du protocole de chaque requête.

## Verrou et garde de version sont complémentaires

`VerrouProvider` expose acquisition, battement, libération et observation.
La sonde Nextcloud choisit automatiquement le provider ; le code métier ne
choisit pas une variante selon l’action de l’utilisateur.

| Provider | Protection |
|---|---|
| `ProviderPutConditionnel` | Fichier `verrous/<id>.lock.json`, créé avec `If-None-Match: *`, puis modifié sous son ETag. Coordination entre clients qui respectent ce protocole. |
| `ProviderFilesLock` | Verrou natif du fichier `entretiens/<id>.json` lorsque `files_lock` est disponible ; le serveur refuse les écritures étrangères sous verrou. |

Le verrou réserve l’édition ; **l’ETag du fichier de données** protège sa
publication. Après acquisition, la session relit le serveur avant de mémoriser
cet ETag. Une observation de verrou n’accorde aucun droit, et l’absence de badge
après une erreur d’observation ne prouve pas qu’une source est libre.

`SessionsDEntretien` sérialise ouverture, battements, publications et fermeture
par entretien. Si un envoi a une réponse incertaine, la relecture compare le
contenu avant de conclure ; un conflit ou une perte de droit conserve une copie
locale et suspend l’édition. Le journal des verrous natifs et les copies de
divergence restent locaux sous `sessions/`, pas dans les données partagées.

## Transactions corpus et lots

Les définitions passent par `TransactionsCorpus` : verrou corpus conditionnel,
base serveur relue, mutation préparée, `PUT If-Match`, puis libération.
Un refus certain et une réponse perdue n’ont pas le même traitement : après une
réponse inconnue, il faut reconnaître le contenu accepté avant de reprendre.

Créer ou importer un entretien publie d’abord son fichier exclusivement, puis
son appartenance au corpus. La suppression protège corpus et entretien dans
cet ordre et distingue le retrait du membership du déplacement en corbeille.
Ce n’est pas une transaction multi-fichiers atomique fournie par WebDAV.

Les lots de valeurs ou de décisions textuelles travaillent entretien par
entretien, en réutilisant une session détenue ou un cycle court : acquisition,
lecture fraîche, mutation, publication conditionnelle et mise à jour du miroir.
Les échecs sont nommés sans annuler les réussites des autres sources.

Les opérations globales de pseudonymisation et de thématiques ont leurs propres
journaux et barrières de reprise. Ne pas les ramener à une boucle de PUT ou à
une compensation aveugle : un résultat inconnu doit d’abord être vérifié.
Voir [pseudonymisation](../traiter/pseudonymisation/fournisseurs.md) et
[thématiques](../traiter/thematiques/fournisseurs.md).

## Présence, médias et documents

- La présence décrit les consultations ; elle ne remplace jamais un verrou.
- Une association audio locale reste propre au poste dans `audio-locaux.json`.
  Elle référence le fichier sans publier son chemin dans les données partagées.
- Une référence média partagée et son accès local sont deux informations séparées.
  La lecture distante audio utilise le service de médias et ses contrôles de
  plages ; la vidéo WebDAV distante n’est pas prise en charge par le lecteur actuel.
- Les documents du projet sont consultés directement sur WebDAV, sans miroir
  documentaire ni mutation par ce service ; voir [documents cadre](../preparer/docs-cadre.md).

Le client impose HTTPS, sauf boucle locale pour les bancs, refuse les redirections
et borne requêtes et transferts. Les copies binaires sont streamées et leurs
fichiers temporaires nettoyés en cas d’échec. Ne jamais désactiver TLS ou propager
les identifiants vers une URL reçue sans contrôle.

## Où intervenir et vérifier

| Responsabilité | Emplacement |
|---|---|
| Requêtes, conditions et transferts | `src/main/webdav/client.ts` |
| Contrat et deux providers | `src/main/verrous/` |
| Sessions et récupération | `src/main/distant/sessions.ts` |
| Transactions et lots | `src/main/distant/transactions.ts` |
| Assemblage et exclusions de tirage | `src/main/distant/contexte.ts` |
| Présence | `src/main/distant/presence.ts` |
| Médias distants | `src/main/medias/`, `src/main/webdav/lectureMedia.ts` |

Tests mémoire : `test/webdav/session.test.ts`, `test/webdav/transactions.test.ts`,
`test/webdav/verrous.test.ts`, `test/webdav/verrousFilesLock.test.ts` et
`test/webdav/presence.test.ts`. Tests réels des deux variantes :
`test/webdav/contrat-nextcloud.test.ts`, `test/webdav/scenario-deux-postes.test.ts`,
`test/webdav/scenario-e3b-divergence.test.ts` et `e2e/multi-utilisateur.e2e.ts`.
Préparer les bancs avant ces tests et respecter leur exécution séquentielle.
