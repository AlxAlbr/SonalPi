# Import ciblé WebDAV : publication et reprise

Le ciblage WebDAV est **raccordé et activé après qualification sur Nextcloud A/B**.
Le service `src/main/distant/correspondancesWebDAV.ts` est assemblé dans `TransactionsCorpus`
et `ContexteCorpusDistant`, avec gardes et cache d’aperçu publié testés.
Le dialogue propose les cibles explicitement et la reprise après interruption, via le pont IPC typé.
Il ne remplace pas les transactions actuelles de définitions partagées.

## Lecture et préparation

L’inventaire lit le serveur, jamais le miroir ni une session locale.
Il exige des ETags forts et relit le corpus à la fin de l’inventaire ; un changement refuse l’aperçu.
Les membres indisponibles sont signalés. La lecture est bornée à 32 Mio.
Les entretiens ciblés doivent déjà être au format natif actuel.

Après une sélection explicite, le service prend le verrou du corpus puis ceux des entretiens par identifiant trié.
Il refuse les sessions locales/récupérables et relit toutes les sources.
Les règles et cibles sont préparées intégralement avant le premier PUT de données.
Les modifications concernent uniquement les définitions et les libellés de locuteurs sélectionnés :
aucune pose, suppression ou modification de décision textuelle, ni réassignation de `Personne`.

Le choix est limité à 100 entretiens. Les copies avant/après et la progression sont enregistrées
atomiquement dans `.correspondances-webdav.json`, privé (`0600`), borné à 64 Mio.
La destination est liée à l’URL DAV ; le journal valide ses chemins, formats et états.
Les diagnostics techniques ne contiennent ni texte ni table de correspondance.

## Publication séquentielle, pas atomicité multi-fichiers

Les définitions partagées modifiées sont publiées avant les entretiens sélectionnés.
Chaque PUT porte `If-Match`, après renouvellement de tous les verrous et contrôle des sources du plan.
Le journal marque l’intention avant l’envoi, puis le succès après confirmation.
La libération est en ordre inverse, y compris après refus ou interruption.

Une panne peut laisser des succès déjà publiés : **aucune compensation automatique**.
Un refus connu conserve la cible à reprendre ; une réponse inconnue conserve l’état d’envoi.
Une relecture reconnaissant exactement les octets préparés confirme un PUT accepté sans le rejouer.
La copie du miroir n’est installée qu’après confirmation. Une panne de cette installation reste reprenable.

Le verrou du corpus protège les clients coopérants. WebDAV ne propose pas de garde atomique commune
au corpus et à un PUT d’entretien : une écriture hors protocole peut provoquer un état partiel,
qui est détecté au contrôle suivant. Le service n’annonce jamais une atomicité globale.

## Reprise explicite

`lireSuivi()` indique les fichiers confirmés, restants et l’éventuel envoi indéterminé.
Il fournit aussi les titres/identifiants des seules cibles et un bilan **prévu**, distinct des succès confirmés.
Ces clones publics ne contiennent ni copies avant/après ni table originale, et ne peuvent modifier l’intention privée.
`corpus:suiviImportCorrespondances` ne lit que le contexte WebDAV courant ; hors WebDAV, il renvoie `null`.
`corpus:reprendreImportCorrespondances` refuse un autre fournisseur et lie l’exécution à son contexte de départ.
Le dialogue relit le suivi à l’ouverture et après refus ; une relecture échouée interdit toute application.
La confirmation est requise à chaque tentative et invalidée après refus ou relecture.
Les réponses après destruction du dialogue ne déclenchent aucune annonce ni rejeu.
Un journal incomplet refuse tout nouvel import et toute autre écriture du contexte.
Il bloque aussi les nouvelles sessions, les sauvegardes tardives et les tirages du miroir.
Les ouvertures/tirages déjà commencés, les mutations en cours et les opérations thématiques incomplètes
excluent le démarrage d’un import. Le contexte exige la fermeture de toutes ses sessions locales ou récupérables.
À la réouverture, le suivi est conservé ; aucune migration ni réconciliation de fichiers orphelins ne s’exécute avant reprise.
Les baux d’import ne sont jamais proposés comme sessions récupérables, y compris après un arrêt avant création du journal.
`reprendre(operationId, true)` exige une confirmation, reprend les verrous et vérifie **tout le plan** avant d’envoyer.
Un succès confirmé modifié depuis est refusé ; une cible restante modifiée est refusée aussi.
Les modifications concurrentes ne sont jamais écrasées.

Sur Nextcloud avec `files_lock`, LOCK/UNLOCK peuvent changer l’ETag sans changer les octets.
La reprise confirmée adopte donc un nouvel ETag **uniquement après égalité exacte des octets et acquisition des verrous**.
Le PUT reste conditionnel sur cette garde fraîche. Une différence de contenu n’est jamais assimilée à ce cas.
Les tests prouvent l’absence de second PUT sur le premier entretien, pas la stabilité de son ETag sous verrou natif.

Un arrêt brutal peut laisser les verrous du processus précédent.
Le service ne vole ni ne libère automatiquement un verrou natif détenu par le même compte :
Nextcloud ne distingue pas deux postes de ce compte.
Le diagnostic de reprise indique le verrou encore tenu, sans contenu ni table privée.
Deux tests réels tuent le processus enfant par `SIGKILL` pendant le deuxième envoi, sur les bancs A/B.
Ils vérifient que la relance ne publie rien et ne vole aucun bail persistant.
Sur A, même après libération extérieure du bail corpus, les verrous natifs du même compte restent refusés et intacts.
Le parent prouve la mort du détenteur synthétique avant de libérer ses verrous hors du service ;
la reprise confirmée publie ensuite seulement le fichier restant.
Cette preuve ne vaut pas permission de déverrouiller automatiquement un poste réel.
Le dialogue utilisateur demande de vérifier les autres postes et de faire libérer les verrous par leur détenteur ou l’administrateur.
Un arrêt avant création du journal ne laisse pas d’intention durable à reprendre ; il n’a envoyé aucun PUT de données,
mais peut nécessiter cette même intervention extérieure sur les baux.

## Qualification d’ouverture du geste

- [x] Assembler le service dans les transactions et le contexte distant ; qualifier leurs gardes.
- [x] Préparer le cache privé d’aperçu publié WebDAV, avec confirmation obligatoire et clones publics sans autorité.
- [x] Qualifier le refus des verrous persistants après un vrai SIGKILL, sans confondre deux postes du même compte.
- [x] Raccorder l’aperçu publié et les commandes de suivi/reprise à l’IPC, sans repli sur le miroir.
- [x] Afficher les états partiel/indéterminé, les succès acquis et une commande de reprise confirmée après redémarrage.
- [x] Expliquer la libération extérieure des verrous et le refus d’un contenu concurrent, sans bouton de forçage natif.
- [x] Étendre Electron sur les deux bancs, puis ouvrir `anon.importer-cibles` après validation de cette recette.

Tests : `test/webdav/correspondances.test.ts` (21 cas), `correspondances-contexte.test.ts` (13 cas)
et `correspondances-nextcloud.test.ts` (13 cas réels réussis, une sonde non applicable sautée sur B).
Ils couvrent les deux variantes de verrou, interruption au deuxième fichier, réponse/relecture perdues,
reprise sans rejeu des succès, refus du tiers et conservation d’une modification concurrente.
Les scénarios réels utilisent des sous-dossiers synthétiques dédiés aux bancs A/B, supprimés en fin de scénario.

`test/echangesCorrespondancesRenderer.test.ts` couvre cinq gardes du dialogue : confirmation, double envoi,
refus concurrent, suivi indisponible, lecture seule et réponse tardive.
`e2e/correspondances-webdav.e2e.ts` compte **8 scénarios Electron réussis**, quatre par banc :
reprise d’un journal après relance avec conflit refusé, import nominal depuis un aperçu serveur,
interruption avant le deuxième fichier, puis réponse et relecture perdues après le premier PUT accepté.
Le dernier PUT publié du premier entretien n’est pas rejoué ; mémoire, texte, décisions et `Personne` sont vérifiés.
Captures normales et réduites du dialogue de reprise contrôlées.

Ces résultats qualifient les bancs A/B, pas une charge maximale ni un serveur institutionnel différent.
Une résolution automatique de conflit ou une clôture forcée de suivi incomplet n’est pas proposée.
Les copies préparées restent privées et conservées pour examen ; les opérations globales demeurent hors de ce geste.
