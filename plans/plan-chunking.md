# Plan chunking — téléversement segmenté sans dépendance

> Suite du travail « média distant » (plan-audio-distant.md + streaming B1/B2,
> progression B3 — désormais intégrés). Ce plan couvre le SEUL reste ouvert :
> l'upload des très gros fichiers quand les limites serveur s'en mêlent
> (ex-étape B5 d'un plan vidéo aujourd'hui absorbé ici).

## 0. Déclenchement et décision structurante

**Ne rien faire tant que le besoin n'est pas mesuré.** Le PUT simple streamé
(`putFichier`) fonctionne jusqu'aux limites de l'instance Nextcloud
(`client_max_body_size` nginx, limites PHP). Le chunking ne sert qu'à les
contourner : uploads multi-Go derrière un proxy restrictif, réseaux instables
(reprise d'un chunk seul), quotas par requête.

**Zéro dépendance.** Une librairie existante (`nextcloud-chunk-file-upload`)
a été envisagée puis écartée :

1. elle casse l'invariant fondateur du client : `ClientWebDAV` est volontairement
   minimal avec une **implémentation fetch injectable** (`ImplementationFetch`),
   ce qui permet le banc de conformité (`ServeurWebDAVMemoire`) — un client
   tiers impose sa propre couche HTTP/auth/retries et rendrait le banc
   incohérent (on testerait deux mondes) ;
2. périmètre déséquilibré : il ne couvre que l'upload, déjà fonctionnel en
   simple ; le download est réglé (`getBinaireFichier` streamé) ;
3. supply-chain : dépendance étroite, audit permanent, pour ~200 lignes de
   protocole documenté.

La librairie garde une valeur : **référence d'implémentation** pour vérifier nos
hypothèses (noms de chunks, en-têtes, erreurs serveur) sans la dépendre.

## D1 — Le protocole (Nextcloud chunking v2, dans notre client)

```text
1. POST/PUT MKCOL  /remote.php/dav/uploads/<user>/<transferId>/   (dossier de transfert)
2. PUT             /remote.php/dav/uploads/<user>/<transferId>/<nnnn>   × N chunks
                   (noms ordonnés : 00001, 00002… ; chaque chunk < limite serveur)
3. MOVE            /remote.php/dav/uploads/<user>/<transferId>/.file
                   Destination: <corpus>/<cheminCible>                (assemblage serveur)
4. DELETE          /remote.php/dav/uploads/<user>/<transferId>/       (nettoyage, même en échec)
```

Propriétés utiles :

- l'assemblage est fait PAR LE SERVEUR : aucune mémoire côté client, chaque
  chunk part en flux depuis le disque ;
- l'échec du chunk k n'invalide pas les chunks 1..k−1 : reprise native en
  re-émettant CE chunk seul (le dossier de transfert persiste côté serveur) ;
- le MOVE d'assemblage accepte nos préconditions habituelles (If-Match sur la
  destination → la garde anti-écrasement D5 du plan audio s'applique telle
  quelle).

## D2 — API dans `client.ts` (pas ailleurs)

Le domaine ne voit rien : c'est une stratégie de PUT au sens du client.

```ts
async putFichierParChunks(
  chemin: string,
  sourceLocale: string,
  options: OptionsPut & { tailleChunk?: number }, // défaut ~10 Mo
  surProgression?: SurProgression,                // réutilise B3 tel quel
): Promise<string | null>                        // ETag post-assemblage ou null
```

- lecture du fichier source par `createReadStream(source, { start, end })` :
  chaque chunk est envoyé en flux, mémoire bornée (cohérent B1/B2) ;
- `transferId` : identifiant opaque local (même génération que `genId`) ;
- **choix de stratégie centralisé** dans `MiroirWebDAV.televerserFichier` :
  taille source ≤ seuil → `putFichier` (un seul aller-retour) ; au-delà →
  `putFichierParChunks`. Le seuil vit dans `shared/media.ts` à côté des autres
  constantes média ; le renderer n'a RIEN à changer (la garde anti-écrasement
  et la suggestion suffixée opèrent au MOVE, donc avant tout envoi si on
  PROPFIND la destination en amont comme aujourd'hui) ;
- nettoyage systématique du dossier de transfert en `finally` (échec réseau,
  annulation) — les transferts orphelins côté serveur ne doivent pas
  s'accumuler.

## D3 — Émulation dans le banc (~40 lignes)

Extension de `ServeurWebDAVMemoire` :

- MKCOL sous `uploads/<user>/` : crée le dossier de transfert ;
- PUT d'un chunk : stocke les octets indexés par nom de chunk ;
- MOVE de `.file` : concatène les chunks dans l'ordre des noms vers la
  destination (honore If-Match comme aujourd'hui) ;
- scénarios de test : perte du chunk k → reprise de CE chunk seul → assemblage
  complet identique ; If-Match divergent au MOVE → 412, aucun écrasement ;
  abandon en cours de transfert → le DELETE laisse le serveur propre.

C'est le même contrat qu'aujourd'hui : on teste le protocole, pas un serveur
réel (invariant §15.4 du plan multiuser) — complété par un passage sur banc
Docker réel avant clôture (images déjà en place, AGENTS.md).

## Tests

- assemblage = fichier source octet-pour-octet (binaire non-UTF-8, plusieurs chunks) ;
- reprise : simuler l'échec du chunk 2/N, ré-émettre, assembler correct ;
- garde anti-écrasement au MOVE (412) : fichier du collègue intact ;
- progression : événements monotones sur l'ENSEMBLE du transfert (le compteur
  B3 englobe tous les chunks) ;
- seuil : petit fichier → PUT simple (aucun dossier de transfert créé) ; gros
  fichier → chunks ;
- nettoyage : après échec volontaire, PROPFIND `uploads/<u>/<id>` → 404.

## Séquencement

| Étape | Contenu | Dépend de |
|---|---|---|
| C1 | D3 : émulation chunking dans le serveur mémoire (+ tests directs) | — |
| C2 | D1/D2 : `putFichierParChunks` + choix de stratégie dans `televerserFichier` | C1 |
| C3 | Reprise d'un chunk seul après échec simulé (+ tests) | C2 |
| C4 | Scénario E2E banc réel : gros fixture (> seuil) téléversé, pull chez le second poste | C2 |

Aucune étape UI : la modale de téléversement affiche déjà la progression B3 et
ne connaît pas la stratégie.

## Questions ouvertes

1. Seuil de bascule PUT simple ↔ chunks : fixe (10 Mo × marge) ou sondé auprès
   de l'instance (capacités) ? Décider en C2, défaut conservateur.
2. Faut-il exposer la reprise inter-session (transfert coupé à la fermeture de
   l'app, repris plus tard via le même transferId) ? Probablement hors v1 — le
   ré-upload intégral reste acceptable tant que le cas est rare.
