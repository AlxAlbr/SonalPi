# Médias distants GitLab et serveur WebDAV secondaire

**Statut : proposition d’architecture ; Sharedoc reste à qualifier avant
l’intégration d’un lecteur en streaming.**

## 1. Décision proposée

Ne pas utiliser GitLab LFS comme stockage principal des audios et vidéos des
corpus Sonal. GitLab reste le fournisseur des transcriptions, définitions,
métadonnées et historique des modifications.

Un corpus GitLab peut utiliser un serveur de médias secondaire WebDAV, par exemple
Sharedoc HumaNum. Le serveur de médias est optionnel : un corpus sans serveur
externe reste utilisable pour les transcriptions et les médias locaux.

Le connecteur de médias doit être générique WebDAV. Sharedoc est une instance
cible, pas une dépendance codée dans le modèle de données.

## 2. Objectifs

- conserver les médias volumineux hors de GitLab ;
- permettre un média distant sans téléchargement local complet ;
- proposer au besoin une copie locale pour le hors-ligne ou les lectures
  répétées ;
- conserver les médias locaux déjà associés aux entretiens ;
- distinguer transcription indisponible et média distant indisponible ;
- éviter qu'une erreur de média bloque l'accès à un corpus ;
- ne jamais exposer les secrets WebDAV au renderer.

## 3. Hors périmètre initial

- Ne pas créer de serveur Sharedoc ni modifier sa politique institutionnelle.
- Ne pas synchroniser automatiquement tous les médias entre GitLab et WebDAV.
- Ne pas faire de GitLab LFS le fallback obligatoire d'un serveur WebDAV.
- Ne pas exposer une URL WebDAV ou une URL signée au renderer.
- Ne pas supprimer automatiquement un média distant en cas d'incident.
- Ne pas gérer une collection multi-serveur au premier lot ; un seul serveur de
  médias par corpus est suffisant pour commencer.

## 4. Modèle de référence

Le modèle de domaine distingue la référence distante du contenu binaire.
Une forme rétrocompatible peut prolonger les métadonnées audio existantes :

```json
{
  "meta": {
    "audioDistant": {
      "fournisseur": "webdav",
      "storeId": "sharedoc-corpus-test",
      "chemin": "audio/entretien-1.m4a",
      "sha256": "…",
      "taille": 12345678,
      "type": "audio/mp4",
      "cache": "differee"
    }
  }
}
```

Le chemin, l'empreinte, la taille et le type sont des métadonnées de référence ;
le fichier binaire reste sur le serveur WebDAV. `storeId` est opaque pour le
renderer et n'est pas une URL.

Les valeurs de cache proposées sont :

- `differee` : le média reste distant et peut être lu en flux ;
- `locale` : le média doit être téléchargé avant lecture ;
- `auto` : Sonal choisit selon la taille, le réseau et les capacités du serveur.

La compatibilité avec les champs `audioDistant` existants doit être conservée.
Les anciens médias locaux ne doivent pas être transformés en références WebDAV.

## 5. Configuration d'un corpus

La création ou l'ouverture d'un corpus GitLab peut proposer une section
optionnelle :

```text
Serveur de médias

[ ] Utiliser un serveur WebDAV pour les audios et vidéos

URL WebDAV : …
Login : …
Mot de passe d'application : …
Dossier du corpus : …
```

Le serveur est optionnel et distinct du compte GitLab. Les secrets sont conservés
dans le coffre ou en mémoire avec les mêmes règles que les secrets Nextcloud et
PAT GitLab.

Un compte, une destination GitLab et un serveur de médias sont trois éléments
distincts. La suppression d'un serveur de médias ne supprime pas le corpus GitLab
ni les copies locales.

## 6. Interfaces utilisateur

Le parcours média conserve trois actions communes aux fournisseurs :

1. associer un média local ;
2. choisir un média distant sur le serveur de médias ;
3. partager un média local vers le serveur de médias.

Pour GitLab, le premier lot ne modifie pas les actions de création ou de
suppression de corpus. Il ajoute uniquement la configuration du serveur média et
les actions de média à l'intérieur d'un entretien.

L'utilisateur ne voit ni ETag, ni SHA, ni bail, ni URL WebDAV. Il voit des états
tels que :

- média local ;
- média distant disponible ;
- téléchargement en cours ;
- média distant indisponible ;
- erreur de quota ou de droits ;
- copie locale conservée.

## 7. Flux d'ajout d'un média

L'ordre obligatoire est :

```text
calcul de l'empreinte et de la taille
→ vérification du serveur et des droits
→ upload WebDAV en flux
→ vérification de la réponse
→ publication de la référence dans GitLab
→ confirmation du cache et de l'affichage
```

Si l'upload réussit mais que la publication GitLab échoue :

- le média distant est conservé ;
- la référence n'est pas annoncée comme partagée ;
- le candidat et l'identifiant d'opération restent disponibles ;
- une reprise vérifie GitLab avant toute nouvelle tentative.

Si GitLab a accepté la publication mais que la réponse est perdue :

- l'opération est réconciliée par identifiant ;
- le fichier WebDAV n'est pas téléversé de nouveau automatiquement.

Si le serveur de médias est indisponible :

- la transcription reste accessible ;
- le média distant est marqué indisponible ;
- le média local reste utilisable ;
- l'utilisateur peut réessayer ou télécharger le média.

## 8. Streaming et cache

Le mode `differee` ne doit pas exposer une URL WebDAV au renderer. Le main
fournit un flux interne contrôlé, avec une référence opaque et une limite de
durée.

Pour l'audio et la vidéo, le client doit vérifier :

- `GET` et `HEAD` ;
- `Range` et `Content-Range` ;
- `Content-Length` ;
- le type MIME ;
- l'empreinte et la taille après téléchargement.

Si le serveur renvoie `206 Partial Content`, le streaming est possible. S'il
renvoie toujours `200 OK` pour une demande de plage, le fichier doit être proposé
en téléchargement local ou en lecture limitée explicitement.

Le cache peut conserver :

- des fragments temporaires ;
- une forme d'onde précalculée ;
- une miniature ;
- un média téléchargé si l'utilisateur a choisi le mode local.

L'éviction ne doit jamais supprimer un média local associé, un candidat en cours
ou une copie de récupération.

## 9. Qualification Sharedoc

Avant l'intégration, tester Sharedoc en lecture et sur un fichier synthétique :

1. `OPTIONS` WebDAV ;
2. `HEAD` sur un fichier audio ou vidéo ;
3. `GET` avec `Range: bytes=0-1023` ;
4. `GET` avec une plage au milieu du fichier ;
5. vérification de `206`, `Content-Range` et `Content-Length` ;
6. vérification de l'authentification HumanID ou du mécanisme accepté par WebDAV ;
7. limites de taille, quotas, droits et redirections ;
8. comportement en cas de fichier absent ou de réponse partielle.

Un projet de qualification séparé doit être utilisé. Aucun fichier utilisateur ne
doit être téléchargé, déplacé ou supprimé pour ces essais.

## 10. Sécurité

- Les identifiants WebDAV ne traversent pas le renderer.
- Les URL signées et actions de transfert ne sont écrites dans aucun log.
- Le renderer reçoit un identifiant opaque, ou un flux interne validé.
- Les chemins distants sont normalisés et protégés contre `..`, les URLs
  ambiguës et les collisions de noms Windows.
- La taille et l'empreinte sont contrôlées avant de considérer un média comme
  valide.
- Une réponse partielle n'est jamais installée comme fichier final.
- Les opérations cross-store ne sont pas présentées comme atomiques : seul le
  résultat de chaque étape est réconciliable.

## 11. Lots de réalisation

### M0 — Qualification du serveur

- vérifier l'accès WebDAV de Sharedoc ;
- mesurer le support `Range` ;
- vérifier les limites, l'authentification et les erreurs ;
- conserver une procédure reproductible sans secret dans le dépôt.

### M1 — Contrat de média distant

- introduire le discriminant de serveur de médias ;
- définir la référence, l'empreinte, la taille et la politique de cache ;
- extraire le client de transfert commun ;
- conserver les médias locaux et les régressions Nextcloud.

### M2 — Partage WebDAV

- upload en flux ;
- progression et annulation ;
- validation de la réponse et de l'empreinte ;
- publication de la référence GitLab après upload ;
- gestion des échecs partiels et des reprises.

### M3 — Lecture distante

- vérifier le streaming et le téléchargement manuel ;
- ajouter la lecture audio ;
- ajouter la lecture vidéo si `Range` est fiable ;
- gérer le cache et l'éviction ;
- conserver la transcription disponible si le média échoue.

### M4 — E2E et documentation

- parcours avec média local et média distant ;
- absence de serveur de médias ;
- serveur indisponible ;
- upload annulé ;
- quota ou droits refusés ;
- réponse perdue après upload ou commit ;
- validation dans le binaire Linux et Windows.

## 12. Critères de sortie

La livraison de ce lot est acceptable lorsque :

- un corpus GitLab sans serveur média reste pleinement utilisable ;
- un média peut être partagé vers WebDAV sans passer par GitLab LFS ;
- la référence GitLab n'est publiée qu'après un upload vérifié ;
- une panne du serveur média ne détruit pas le travail local ;
- le streaming audio repose sur `Range` vérifié ;
- la vidéo n'est annoncée comme streamable que si les plages sont fiables ;
- les secrets et URLs signées ne quittent jamais le main ;
- les tests Nextcloud existants restent verts ;
- le parcours est qualified sur un projet de test Sharedoc, puis sur une
  instance réelle autorisée.

## 13. Décisions à prendre

- Sharedoc est-il le serveur par défaut de Humanum ou seulement une instance de
  qualification ?
- Les utilisateurs auront-ils toujours un compte WebDAV séparé du compte GitLab ?
- Le mode `auto` doit-il choisir `differee` par défaut pour les petits fichiers
  et `locale` pour les fichiers volumineux ?
- Quelle taille maximale accepte le serveur de médias ?
- Les médias distants doivent-ils être supprimables depuis Sonal, ou seulement
  associables et téléchargeables ?

Ces décisions ne bloquent pas la qualification M0. Elles devront être figées
avant de figer le contrat public du mode de cache.
