# Réflexion — Visibilité des écritures WebDAV : un risque potentiel de lost update

> Document de **réflexion**, pas un plan d'exécution — sur le modèle de
> [reflexion-stt.md](reflexion-stt.md). Il cadre un **risque potentiel** découvert
> incidemment pendant l'itération « audio distant » (téléversement + tirage miroir
> des médias désignés) :
> contre le Nextcloud **réel** du banc Docker, deux écritures conditionnelles consécutives
> sur le MÊME fichier peuvent courir devant la visibilité de l'ETag — un `If-Match`
> pourtant périmé a été observé ACCEPTÉ au lieu du 412 attendu.
>
> **Aucun code produit n'a été modifié** pour contourner ce phénomène ; seul le test de
> contrat a été rendu tolérant (boucle de réessai bornée), ce qui documente honnêtement
> le comportement serveur sans affaiblir l'assertion.
>
> Statut du risque : **POTENTIEL et NON MESURÉ en conditions réelles**. Il n'a jamais été
> observé en dehors du banc de contrat à vitesse machine ; tous les scénarios
> multi-utilisateurs e2e passent. Mais s'il se confirme sur un déploiement réel, il
> ouvre théoriquement une brèche dans l'invariant central du protocole (« jamais
> d'écrasement silencieux », plan-multiuser §4/§6). D'où ce document.

---

## 1. Origine : un flocon dans le banc de contrat

Pendant l'itération audio distant, [contrat-nextcloud.test.ts](../../test/webdav/contrat-nextcloud.test.ts)
(« cycle PUT If-None-Match / If-Match / DELETE ») a flaké environ **une fois sur trois**
contre la pile A (`:8080`, NC31 + files_lock). Deux causes distinctes ont été trouvées :

| Cause | Nature | Traitement |
|---|---|---|
| Résidu `sonde/contrat.tmp` d'un run interrompu | Hygiène de test | Suppression best-effort AVANT le cycle |
| **`If-Match` périmé accepté** (pas de 412) | **Comportement serveur — objet de cette réflexion** | Boucle de réessai bornée (20 × 200 ms) |

Le second mode est apparu même après le premier corrigé, avec des corps de tailles
différentes : ce n'est donc pas un artefact de collision d'ETag par taille+mtime,
même si celle-ci l'aggrave vraisemblablement (trois écritures dans la même seconde).

Séquence exacte du test :

```
PUT (rév. 1)  If-None-Match:*      → 201, etag E1
PUT (rév. 2)  If-None-Match:*      → 412 (déjà présent)            ✓ contrat honoré
PUT (rév. 3)  If-Match:E1          → 204/201, renvoie E2           ✓ contrat honoré
PUT (rév. 4)  If-Match:E1 (périmé) → ATTENDU 412 — parfois ACCEPTÉ ✗ (le serveur
                               compare encore contre E1)
```

La réponse du « faux négatif » portait bien un NOUVEL ETag (`f3738e37…`) : le serveur a
écrit ET renvoyé un identifiant frais, tout en validant la précondition contre l'ANCIEN.
Ce n'est donc pas une simple course de lecture : c'est la comparaison conditionnelle elle-même
qui a vu un état en retard.

## 2. Lecture technique (hypothèses NON vérifiées)

Nextcloud stocke les ETag dans sa base (table `filecache`) et les propage aux dossiers
parents, parfois via des tâches différées. Plusieurs mécanismes internes peuvent produire
une fenêtre où une écriture fraîche n'est pas encore visible d'une requête conditionnelle :

- propagation asynchrone de l'ETag (jobs en arrière-plan) ;
- couche de cache (mémoire PHP, Redis si configuré, proxy) entre la requête et la base ;
- granularité temporelle du stockage sous-jacent (le banc tourne sur un volume Docker ;
  un déploiement réel peut se comporter différemment — dans les deux sens).

**On ne sait PAS lequel joue, ni si un déploiement de production typique (Redis, php-fpm,
stockage local) présente la même fenêtre.** C'est précisément la première question à
trancher avant toute décision (§6).

## 3. Pourquoi le protocole actuel vous protège surtout

Rappel de l'architecture (plan-multiuser §4, §6) : le mécanisme PREMIER de sérialisation
n'est pas `If-Match`, c'est le **verrou**.

| Flux | Sérialisation | Filet secondaire |
|---|---|---|
| Entretien (flux A) | session : verrou par fichier, UN écrivain | PUT `If-Match` sur l'ETag lu APRÈS acquisition du verrou (« la version d'après-verrou fait foi ») |
| Définitions (flux B, `corpus.json`) | transaction : verrou CORPUS → GET frais → mutation → PUT `If-Match` → déverrouillage | idem |

Deux utilisateurs ne peuvent donc pas être simultanément en train d'écrire le même
fichier : le pattern observé au banc (deux écritures conditionnelles à quelques dizaines
de millisecondes d'intervalle, sans verrou entre elles) est celui d'un **test**, pas d'un
usage réel. Les publications réelles sont espacées de secondes à minutes, la publication
périodique est de 5 min, et les scénarios e2e multi-utilisateurs (qui exercent verrou →
édition → publication → reprise chez l'autre poste) passent depuis leur existence.

## 4. Le scénario à risque — où le filet pourrait se rompre

Voici l'enchaînement théorique qui transformerait le flocon en **lost update silencieux**,
c'est-à-dire la violation exacte de l'invariant §6 :

```
T1  Max acquiert le verrou corpus ; GET frais → etag E0
T2  Max mute et publie : PUT If-Match E0 → accepté, serveur passe à E1
T3  Max LIBÈRE le verrou                                  ← pas d'attente de consolidation
T4  Olivier acquiert le verrou ; GET « frais » → ??? 
      SI la même latence s'applique aux LECTURES, il reçoit
      l'état d'avant T2 : contenu ancien + etag E0
T5  Olivier publie : PUT If-Match E0 → accepté (même fenêtre)
      ⇒ la modification de Max est ÉCRASÉE sans divergence détectée
```

Conditions nécessaires pour que le dommage survienne — toutes doivent être réunies :

1. le retard de visibilité affecte AUSSI les lectures (GET/PROPFIND), pas seulement la
   comparaison `If-Match` — **non mesuré** ;
2. l'enchaînement libération → acquisition → GET → publication tient dans la fenêtre de
   latence (sub-seconde au banc ; plausible seulement si deux utilisateurs agissent dans
   la même seconde) ;
3. les deux écritures portent sur le MÊME fichier (`corpus.json` est le candidat naturel :
   c'est le fichier partagé le plus disputé — règles d'anonymisation, codebook, variables,
   membership).

Conséquence en cas de réalisation : perte silencieuse des définitions posées par Max
(règles, thèmes, variables…) — pas de corruption, pas de crash, juste du travail
utilisateur disparu sans message. Sur un entretien (flux A), ce serait pire (texte),
mais la fenêtre y est plus étroite encore : les sessions durent des minutes, pas des
millisecondes, et un seul poste tient le verrou pendant toute l'édition.

## 5. Ce que ça impliquerait — cadrage d'un éventuel chantier

Si la mesure (§6) confirme un lag réel non négligeable, voici les implications telles
qu'elles se présentent aujourd'hui — **à invalider/invalider par la mesure**, pas à
coder aveuglément.

### 5.1 Le remède candidat : « read-your-write » avant libération

Après un PUT accepté, le détenteur du verrou relit (PROPFIND ciblé, une requête légère)
jusqu'à voir l'ETag que le serveur vient de lui retourner, et NE LIBÈRE LE VERROU
qu'alors. La fenêtre de latence est ainsi absorbée par celui qui vient d'écrire —
le successeur ne peut plus lire rance, quelle que soit la cause interne du retard.

Points d'ancrage dans le code actuel (à titre indicatif, rien de décidé) :

| Point | Fichier |
|---|---|
| Publication d'entretien (§4.3) puis fermeture | `SessionsDEntretien.publier()` / `fermer()`, `src/main/distant/sessions.ts` |
| Transaction de définitions (§4.7) | `TransactionsCorpus.executer()`, `src/main/distant/transactions.ts` |
| Publication de squelette/corpus entier (création distante) | `PublieurCorpus`, `src/main/distant/publication.ts` |
| Mémoire locale des ETag vus | `MiroirWebDAV.noterEtagPublie()`, `src/main/miroir.ts` — devrait noter l'ETag **confirmé visible**, pas seulement celui renvoyé |

Coût estimé : une requête PROPFIND par publication (+ retries exponentiels courts),
quelques dizaines de lignes, aucun changement de format. Complexité réelle : la
**politique de timeout** — si l'ETag ne devient pas visible dans N secondes, que faire ?
(garder le verrou et retenter ? libérer quand même en journalisant ? signaler une
anomalie serveur à l'utilisateur ?). C'est LA décision de conception du chantier.

### 5.2 Effets de bord à anticiper

- Latence ajoutée à chaque fermeture de session / fin de transaction (~une requête +
  attente) : imperceptible aux rythmes humains, à valider sur les tests e2e qui
  comptent des allers-retours.
- Le banc de contrat devra rester compatible : la boucle de réessai déjà en place
  deviendrait inutile (le remède garantit la visibilité AVANT le prochain accès) —
  on pourra alors la resserrer plutôt que la supprimer.
- Un serveur dont le lag excéderait systématiquement le timeout révèle un problème
  d'infrastructure : le signal doit remonter à l'utilisateur, pas être avalé.

### 5.3 Filets déjà présents, indépendamment de ce risque

À garder en tête pour doser l'urgence : la variante A (files_lock) porte ses verrous en
base, pas dans le cache fichier — la sérialisation elle-même a peu de chances d'être
affectée par le même lag ; les copies de divergence (§6, E3b) mettent le contenu écarté
hors de perte (dialogue de fusion) ; les orphelins de crash sont journalisés et
reprisables (§4.5). Le trou théorique ne concerne QUE l'intervalle entre deux détenteurs
successifs du verrou.

## 6. Expérience de mesure proposée (préalable à toute décision)

Un petit banc dédié (script vitest jetable ou spec marquée) contre les piles A et B :

1. PUT d'un fichier sonde avec `If-None-Match:*` → ETag renvoyé E₁ ;
2. boucle serrée : PROPFIND jusqu'à voir E₁, horodatage du delta ;
3. répéter N fois, puis en parallèle avec K workers écrivant des fichiers distincts
   (charge), puis deux writers alternant sur le MÊME fichier avec `If-Match` ;
4. refaire sur une configuration « prod-like » si accessible (Redis, stockage local).

Critères de sortie :

| Résultat de mesure | Décision |
|---|---|
| Lag ≈ 0, aucune acceptation d'If-Match périmé hors banc saturé | Documenter (cette réflexion), clore, garder le test tolérant tel quel |
| Lag réel mais borné (< qq centaines de ms) | Implémenter le read-your-write §5.1 avec timeout court |
| Lag long ou erratique même hors charge | Remède §5.1 + signaler explicitement l'instabilité du backend à l'ouverture du corpus (prolonger la sonde §5.4 du plan-multiuser) |

## 7. Questions ouvertes

1. Le lag affecte-t-il les GET autant que les comparaisons conditionnelles ? (la mesure
   §6 répond directement)
2. files_lock (variante A) est-il concerné par le même retard, ou uniquement les
   métadonnées de fichier ? (détermine si la variante B est plus exposée)
3. Le volume Docker du banc est-il représentatif d'un NAS/de production, ou amplifie-t-il
   le phénomène (granularité mtime, cache hôte) ?
4. Faut-il étendre la consolidation aux MOVE (corbeille §4.7) et MKCOL, ou seul le PUT
   conditionnel porte un risque d'écrasement ?

---

*Document rédigé à l'issue de l'itération audio distant (voir historique git de
`test/webdav/contrat-nextcloud.test.ts` pour la trace brute du phénomène). Prochaine
étape recommandée : la mesure §6 — une demi-journée, aucun impact produit.*
