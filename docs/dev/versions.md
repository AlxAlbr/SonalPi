# Vocabulaire des versions

> Ce document tranche le vocabulaire des « versions » dans SonalTau. À l'origine,
> « v1/v2 » désignait plusieurs choses différentes sans jamais préciser laquelle
> (générations de produit, versions du format natif, tranches de fonctionnalité,
> releases) ; la règle ci-dessous met fin à cette surcharge.

## La règle

> **Jamais « v1/v2 » nu ; toujours qualifier la dimension.**

Quand un « v1 » ou un « v2 » apparaît (commentaire, doc, plan, nom de fonction),
il doit être remplacé par le terme de la dimension concernée :

| Terme | Sens | Exemples dans le repo |
|---|---|---|
| **SonalPi V1** (ou « SonalPi » nu) | L'ancien produit (`Vscode/SonalPi`). Seul usage légitime du mot « SonalPi ». | `.crp` (version `1.0`), `.sonal`, encodages UTF-8/windows-1252 (`encodage.ts`), `meta.sourceV1`, « parité accordéon V1 » (`scanAnon.ts`), « Doctrine V1 » (`corpusStore.ts`), dialogue « Corpus SonalPi (V1) » |
| **SonalTau** | Ce produit (anciennement « SonalPiTestV2 », alias « la V2 »). | « corpus SonalTau », « format natif SonalTau », « Migrer vers SonalTau » |
| **formatVersion** | Version du format natif (aujourd'hui `3`). Un bump = migration explicite au store ; une version inconnue est refusée. Chaque cache distant (`miroir.ts`, `coffre.ts`) a son propre `formatVersion`, indépendant. | « formatVersion 1 → 2 » (timecodes → ancres), « formatVersion 2 → 3 » (audioRef absolus), `migrerEntretienFormatV1`, `migrerFormatV2Vers3` |
| **itération** | Tranche de fonctionnalité dans SonalTau. Ce qu'on n'implemente pas encore est « reporté » ou « hors de l'itération N », jamais « v2 ». | « hors périmètre de l'itération 1 », « pas de retry (itération 1) » (`transactions.ts`) |
| **release** | Version livrée du produit = semver dans `package.json`, affichée dans l'app. | `0.2.0` |
| **versions externes** | Protocoles, modèles, standards tiers. Toujours précédés de leur domaine. | « protocole chunking v2 de Nextcloud », « protocole OCS v1 (Nextcloud) », modèle `parakeet_realtime_eou_120m-v1` |

## Repères pour trancher

- **Un corpus, un entretien, un cache** → `formatVersion` (numéro), jamais « v2 ».
- **L'ancien produit** → « SonalPi V1 » (le sigle « V1 » seul reste accepté dans un
  fichier dont le sujet est explicitement la migration, ex. `migrationCrp.ts`, où le
  couple V1↔V2 est le mapping ancien produit → modèle SonalTau).
- **Une fonctionnalité découpée** (plans, prototypes) → « itération N » ou pas de
  numéro (« non retenu pour l'instant »).
- **Une décision sur une livraison** (quoi dans la prochaine release) → semver, ou
  « release initiale ».
- **Un standard tiers** → nom + domaine, tel quel (« Nextcloud chunking v2 »).

## Politique de version applicative

- `package.json` (`version`) suit le **semver** : bump à chaque jalon fonctionnel.
  Elle n'a aucun lien avec `formatVersion`.
- `formatVersion` ne bouge que sur **migration structurelle** du format de fichier,
  avec migration explicite au store (voir `src/shared/format.ts`).
- Un champ **additif optionnel** (ex. `meta.sourceV1`) ne bump PAS `formatVersion`.