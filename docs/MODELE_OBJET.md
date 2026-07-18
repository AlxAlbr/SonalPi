# Modèle objet — plan technique SonalAsynchro (fichiers + ProseMirror, sans CRDT)

> **Ce document n'est PAS un nouveau modèle.** Le domaine — agrégats, `Annotation`, les trois natures
> de donnée, les règles de lecture n°1 à n°3 (dont les **invariants de robustesse**) — est le **plan
> conceptuel** de [MODELE_OBJET2.md](../../POC2/docs/MODELE_OBJET2.md) (§1-§7), commun aux deux cibles
> par construction. Ce document remplace uniquement son **plan technique** (§8-§13, mapping Yjs) pour le
> régime SonalAsynchro : **asynchrone, fichiers + verrous, ProseMirror sans CRDT** (architecture
> [DEMARRAGE3](../../POC3/DEMARRAGE3.md), plan produit [DEMARRAGE](../DEMARRAGE.md)). La bascule
> inverse (vers Yjs) est la couture documentée dans DEMARRAGE3 § *Réversibilité*.

---

## 1. Correspondance des plans techniques

| Concept (commun) | POC2 (Yjs) | **SonalAsynchro (fichiers)** |
|---|---|---|
| Corps-texte (`Document`) | `Y.XmlFragment` | doc ProseMirror (JSON canonique) |
| `Annotation[]` | `Y.Array` de `Y.Map` | tableau d'objets TS |
| Ancre (survit aux éditions) | `RelativePosition` | position PM absolue + remapping `tr.mapping` (prouvé POC3) — s'applique à **deux familles** : les bornes `from`/`to` des annotations ET les ancres temporelles `{pos, t}` (S7, D-S14) |
| Agrégat Corpus | `corpus.ydoc` (room) | `corpus.json` |
| Agrégat Entretien | `entretien.ydoc` (room) | `entretiens/<id>.json` |
| Concurrence | fusion CRDT | **verrou par fichier** (un écrivain à la fois) |
| Requête transverse | index côté serveur | lecture du dossier (tous les fichiers sont locaux) — le *caveat transverse* de POC2 **n'existe pas** |
| Persistance | Hocuspocus + IndexedDB/SQLite | écriture atomique (write-tmp-rename) par le main process |

## 2. Le conteneur d'état

- **Vérité de session** : l'agrégat en mémoire (objets TS purs — `Entretien`, `Corpus`). Les
  **commandes de domaine** (`model/`) sont les seules écritures ; elles ne connaissent ni le DOM ni le
  disque (critère vérifié mécaniquement, POC3).
- **Positions** : le plugin de remapping ([POC3 `remap.ts`](../../POC3/src/editor/remap.ts)) est le
  **seul écrivain** des positions du modèle, à chaque transaction ProseMirror : les `from`/`to` des
  annotations (bornes non extensibles, `assoc` +1/-1 ; plage supprimée → **orpheline**,
  `estOrpheline` = requête, conservée, signalée — l'invariant *référence pendante* appliqué aux
  ancres) ET, depuis S7, les `pos` des **ancres temporelles** (`assoc` -1 ; ancres effondrées par
  une suppression → plage vide, enjambée à la lecture, jamais purgée).
- **Éditeur** : TipTap, schéma `doc › bloc{loc}` (contrat D2 de DEMARRAGE, **révisé S7/D-S14** : les
  timecodes `deb`/`fin` ont quitté les attrs de bloc pour les ancres du modèle). Le rendu du
  marquage = décorations projetées depuis le modèle (POC2, repris) ; le surlignage de lecture =
  **une** décoration inline entre les deux ancres encadrant l'instant courant.
- **Temps** (S7, D-S14/D-S15) : `entretien.ancres` = liste triée de points de mesure `{pos, t}`
  (bornes de cue SRT aujourd'hui, une ancre par mot demain — même mécanisme). Tout le reste est
  **dérivé** en dichotomie : plage lue, interpolation D-S13 (prorata du texte entre ancres), seek au
  clic. À l'import, les cues consécutifs d'un même locuteur fusionnent en un paragraphe (le tour),
  leurs frontières survivant en ancres internes ; l'export re-découpe un segment par intervalle
  d'ancres (round-trip canonique — D-S15).

## 3. Format natif : le dossier de corpus

```
MonCorpus/                      ← un corpus = un dossier (copiable, sauvegardable)
  corpus.json                   ← définitions + membership (verrou : corpus.lock)
  entretiens/
    <id>.json                   ← un entretien = un fichier (verrou : <id>.lock)
```

**`corpus.json`** — miroir fichier de `corpus.ydoc` :

```jsonc
{
  "formatVersion": 2,               // v2 = S7 (le numéro suit les entretiens ; structure inchangée ici)
  "codebook":   { "<id>": { "nom", "couleur", "ordre", "parent": null, "actif", "codeExport": "cat_005" } },
  "variables":  { "<id>": { "lib", "portee": "entretien|locuteur", "priv", "ordre", "vExport": 3,
                            "modalites": [ { "id", "lib", "mExport": 2 } ] } },
  "reglesAnon": { "<id>": { "entite": ["…"], "remplacement", "typeEntite", "actif" } },   // sans UI (D4)
  "personnes":  { },                                                                      // sans UI (D4)
  "membership": { "<id>": { "titre", "date", "lastModified": "…" } }
}
```

**`entretiens/<id>.json`** — miroir fichier de `entretien.ydoc` :

```jsonc
{
  "formatVersion": 2,               // v1 (attrs deb/fin par bloc) → migré à la lecture (S7, D-S14)
  "corpsTexte":  { /* doc ProseMirror JSON — blocs avec attr loc (un paragraphe = un tour, D-S15) */ },
  "annotations": [ { "id", "type": "codage|anon|commentaire", "from", "to", "auteur",
                     "code|regle+etat|texte" } ],
  "ancres":      [ { "pos", "t" } ],  // temps MESURÉS, triés par pos — le reste est dérivé (D-S14)
  "locuteurs":   [ { "index", "nom", "valeursLoc": { "<idVar>": "<idMod>" }, "personneRef": null } ],
  "meta":        { "valeursGen": { "<idVar>": "<idMod>" }, "audioRef": null }
}
```

- **Positions et texte sont sérialisés atomiquement** (même fichier, même instant) → valides par
  construction à la relecture, zéro reindexation (l'acquis POC3).
- Les entretiens référencent les définitions **par id** — renommer/recolorer une définition n'écrit
  que `corpus.json`.
- **Aucun agrégat persisté** : matrice EAV, extraits, compteurs d'usage, « à anonymiser », références
  pendantes = requêtes (mémoïsation **volatile** admise — règle n°3, nuance sur la règle n°2).

## 4. Identités (règle n°3, incarnation SonalAsynchro)

| Entité | Identité | Code legacy (attribut d'export) |
|---|---|---|
| `Categorie` | `id` opaque — **déterministe à l'import** (reprend `cat_XXX`), aléatoire à la création | `codeExport` (`cat_XXX`, renuméroté à l'export si absent) |
| `Variable` / `Modalite` | idem (import : `v`/`m` repris) | `vExport` / `mExport` |
| `Annotation` | id aléatoire (jamais de sens legacy) | — |
| `Entretien` | id opaque — import : repris du fichier ; création : aléatoire | — |
| `Locuteur` | **`index` numérique par entretien, conservé** (compat `data-loc`, référencé par l'attr de bloc) | lui-même |
| `Ancre` | **aucune** — une ancre est une VALEUR `{pos, t}` (point de mesure), pas un objet référencé ; deux ancres identiques sont interchangeables (dédupliquées à l'import) | `data-deb`/`data-fin` re-dérivés par segment à l'export (D-S15) |

> **Pourquoi `Ancre` n'a pas d'identité — et pourquoi ce n'est pas une entorse à la règle n°3.** La
> règle vise les entités qu'on *référence* (un codage pointe une catégorie par id). Rien ne référence
> jamais une ancre : c'est un point de mesure, remplaçable par tout point équivalent — un id serait du
> cruft. Le pendant : aucune « référence pendante » possible sur les ancres ; leur seule pathologie
> (effondrement par suppression de texte) est tolérée à la lecture, jamais réparée d'office.
>
> **Pourquoi `Locuteur.index` échappe (provisoirement) à la règle.** Sous verrou, un entretien a **un
> seul écrivain** : l'allocation `max+1` locale à l'entretien est sûre, et l'index est ce que le
> `.sonal` référence. **À la bascule Yjs**, il devra suivre le même traitement que les modalités
> (id opaque + index d'export) — c'est une dette de couture consignée, pas un oubli.
>
> Le déterminisme des ids d'import rend le **sas idempotent** : ré-importer le même `.sonal` (ou
> l'importer sur deux postes puis fusionner les corpus à la main) converge au lieu de dupliquer.
>
> **Les codes d'export sont stables** : attribués une fois (repris à l'import, ou alloués au premier
> export et **réécrits dans `corpus.json`** à ce moment-là), jamais renumérotés ensuite — deux exports
> successifs produisent les mêmes `cat_XXX`/`v`/`m` (pas de churn de diff, réimport idempotent).

## 5. Version, fraîcheur, intégrité (le volet fichiers des invariants)

Ce que Yjs donnait par construction (une seule vérité synchronisée), le régime fichiers doit le
**surveiller** — c'est le cœur des points 2.3.b/f de
[plan-amelior-gestion-data-sonalpi.md](../plan-amelior-gestion-data-sonalpi.md) :

- **`formatVersion`** dans chaque fichier : version inconnue → **refus poli** (pas d'écrasement, pas de
  tentative de lecture partielle) ; montée de version = **migration explicite** à l'ouverture.
  *Première incarnation (S7)* : v1→v2 — les attrs `deb`/`fin` des blocs deviennent des `ancres {pos, t}`
  (fonction pure `shared/entretien/migration.ts`, appelée par le store à la lecture, fichier réécrit
  aussitôt, `lastModified` **préservé** : migrer n'est pas une édition).
- **Fraîcheur croisée** : `membership.lastModified` est mis à jour à chaque sauvegarde de l'entretien.
  À l'ouverture, un `entretiens/<id>.json` **plus ancien** que ce que le membership a connu (fichier
  restauré d'une sauvegarde, copie partielle du dossier) → **alerte**, jamais d'écrasement silencieux.
- **Écriture atomique** (write-tmp-rename) : un crash ne corrompt pas l'état précédent.
- **Filet anti-erreur — `.bak` à 2 générations, tourné par session.** Au **premier** enregistrement
  suivant l'ouverture d'un entretien, la version sur disque bascule en `.bak1` (l'ancien `.bak1` →
  `.bak2`). L'**autosave ne tourne pas** les générations (il ne fait que remplacer le fichier courant) :
  les `.bak` capturent l'état d'**avant les sessions précédentes**, pas les dernières secondes — c'est
  ce qui rend le filet utile contre une erreur aperçue après coup. Restauration manuelle (JSON lisible),
  pas d'UI au set minimum.
- **Références pendantes en régime fichiers** : même avec les politiques de refus (DEMARRAGE é5.3/é6.3
  — *prévention*), un fichier en retard peut porter des références vers des définitions disparues. La
  règle n°3 est la *tolérance* : valeurs/annotations pendantes **inertes** (filtrées des requêtes),
  **conservées**, listées par la requête « références pendantes » — jamais purgées ni réparées d'office.

## 6. Divergences assumées vs le plan technique POC2

| Sujet | POC2 (Yjs) | SonalAsynchro — et pourquoi c'est acceptable |
|---|---|---|
| Doublons concurrents (modalités, libellés) | possibles → signal qualité | **impossibles** (verrou = écrivain unique) — le signal qualité reste utile pour l'import |
| Timing `deb`/`fin` | différé, direction « couche ancrée » | **divergence RÉSORBÉE (S7, D-S14)** : la couche ancrée est FAITE — ancres `{pos, t}` dans le texte, remappées comme les annotations, dérivations en dichotomie (surlignage, interpolation, seek). Pour la bascule Yjs : mêmes ancres, `pos` → `RelativePosition` (la couture du §1 couvre les deux familles) |
| Rooms, auth, offline-resync | cœur du dispositif | sans objet (dossier local/partagé + verrous) |
| Agrégation transverse | index serveur | lecture locale du dossier |

Tout le reste — le domaine — est **littéralement le même document** : MODELE_OBJET2, plan conceptuel.
