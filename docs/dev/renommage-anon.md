# Renommage protégé d’une variante corpus

## Périmètre livré

`anon.renommer-variante` est autorisé **en local, sur GitLab et sur WebDAV** après qualification propre à ce geste. Le renommage WebDAV est assemblé, exposé par IPC et activé après recette Electron Nextcloud A/B ; il ne se replie jamais sur le miroir pour préparer une mutation. La qualification des correspondances ne vaut pas qualification du renommage.

La commande remplace une variante déclarée et les seuls `Annotation.pseudo` déjà pseudonymisés, liés par `regle` et utilisant cette variante. Les décisions masquées sont incluses. Les exceptions gardent leur état et leur pseudo mémorisé ; autres variantes, décisions indépendantes, texte original, positions, mémoire locale, brouillons, locuteurs et `Personne` restent intacts. Aucune occurrence en attente n’est posée.

Un pseudo partagé entre règles est un avertissement, jamais une fusion. Un libellé inchangé est sans écriture ; un changement de casse reste explicite. Un pseudo vide ou égal à l’autre variante est refusé : retrait, repli et permutation sont des commandes distinctes.

## Inventaire et autorité

- `src/shared/corpus/renommageAnon.ts` inventorie et prépare sur copies.
- `src/main/renommagesAnon.ts` conserve trois aperçus privés pendant cinq minutes, liés au store, au fournisseur et à l’identité exacte du contexte. Les copies publiques ne donnent aucune autorité ; chaque tentative consomme son jeton et exige confirmation.
- Le scan lit **tout le membership**, sans migration ni sauvegarde de session. GitLab utilise un SHA publié et WebDAV les fichiers serveur avec leurs ETags, jamais les copies du miroir.
- Format natif actuel exigé. Sources indisponibles, plages/textes incohérents, identités répétées, recouvrements ambigus, variantes divergentes ou mémoires locales indépendantes recouvrantes bloquent la préparation.
- Budgets : inventaire 64 Mio, aperçu 8 Mio ; la publication garde ses bornes d’actions et HTTP.

## Local : protocole inchangé

Toutes les sessions locales sont fermées avant l’aperçu applicable. Les empreintes SHA-256 du corpus et de **tous** les membres sont recontrôlées : même un changement non ciblé impose un nouvel inventaire.

Le lot complet est préparé avant `PlanRemplacementEntretiens`, ordre `entretiens-puis-corpus`. Le journal `.transaction-fichiers.json`, privé `0600`, conserve les copies natives avant/après. Les dates des fichiers modifiés et de leur membership sont actualisées. La reprise à la réouverture est idempotente, refuse les sources concurrentes et ne transforme pas le journal en annulation utilisateur. Les sauvegardes tardives des sessions fermées restent refusées par l’IPC.

## GitLab : lot ciblé, non atomique

Le protocole intégral de la livraison précédente est remplacé : **plus de bail ou garde sur les entretiens non modifiés, plus de fermeture de toutes les sessions, plus de plafond de 124 membres pour ce geste**. Les imports ciblés de correspondances conservent leur propre protocole et leurs bornes.

1. Aperçu publié complet, copies avant/après des seules cibles scellées dans le cache privé. Les droits observés sont informatifs et ne réservent rien.
2. Revalidation complète sous un bail court du corpus. Un changement sans rapport dans un non-ciblé ne périme pas le choix ; un nouvel usage pertinent exige un nouvel aperçu et consentement.
3. Publication de la nouvelle définition, sans troisième variante transitoire. Les décisions anciennes restent lisibles pendant un lot incomplet.
4. Pour chaque cible : vérification des sessions locales/récupérables, bail court de son fichier, lecture au même SHA du corpus et de l’entretien, contrôle de sa copie consentie, puis un commit contenant le fichier modifié, une garde `chmod` du corpus et le renouvellement du seul bail détenu.
5. Contrôle final de tout le membership, sans verrouiller ni garder chaque membre. Usages nouveaux ou réapparus, sources indisponibles et divergences empêchent de déclarer une fin complète ; aucune cible supplémentaire n’est modifiée implicitement.

Un bail tiers ou une cible changée diffère cette cible ; les succès restent acquis. Une reprise reprend les sources fraîches avec un **nouveau consentement**. Une cible sans usage restant ou sortie du corpus peut être retirée du lot lors de ce consentement, sans recréer de décision ni toucher un fichier hors membership.

Les dates des fichiers modifiés sont actualisées ; comme pour les publications courtes thématiques et de sessions, le membership n’est pas réécrit à chaque entretien. Un lot peut dépasser 124 ou 248 membres : les 250 actions et la taille HTTP bornent **chaque publication**, pas le nombre de membres lus.

### Sauvegardes concurrentes et tardives

`referencesDefinitions.ts` compare le candidat à sa **base publiée** :
- une décision liée déjà publiée conserve son pseudo, même absent de la définition actuelle ;
- une décision nouvelle, réactivée depuis une exception, nouvellement rattachée ou changeant de pseudo lié doit choisir une variante actuellement déclarée ;
- les décisions indépendantes et la mémoire des exceptions ne sont pas réécrites ;
- un renommage de casse exige le nouveau libellé pour les nouveaux choix ; l’équivalence NFC est acceptée.

Le contrôle est raccordé aux sessions, aux transactions courtes et aux créations/imports d’entretiens GitLab. Le corpus est gardé dans le commit : une définition changée après validation ne permet pas de publier avec une ancienne autorisation. Les sessions peuvent revalider une fois une garde de corpus périmée, mais le même candidat est alors contrôlé contre la définition fraîche.

Cela protège les publications de l’application actuelle, **pas un client ancien ni une écriture directe de l’API contournant ce protocole**. Le contrôle final détecte les usages étrangers présents à son instantané ; il n’est ni une surveillance permanente ni une isolation universelle du dépôt.

### Journal, contexte et miroir

`journalRenommageAnon.ts` conserve `.renommage-anon-gitlab.json` : destination liée, copies consenties, compteurs acquis, cibles restantes, intention avant chaque publication et contrôle de cohérence des copies. Fichier privé `0600`, écriture synchronisée et remplacement atomique, borne 128 Mio. Ce journal est confidentiel ; il n’est jamais exposé au renderer.

Le journal de publication existant conserve séparément la preuve du commit et son droit. Réponse perdue : recherche de la publication, aucun deuxième commit si elle est reconnue. Issue inconnue : intention et droit conservés. La reprise réconcilie ce commit par son identifiant unique et ses octets, ou prouve son absence avant un nouvel envoi confirmé. Les baux d’une publication inconnue ne sont pas rendus ; les baux courts de résultat connu ne sont libérés que par leur génération effectivement acquise.

Le contexte et ses transactions partagent la même file : tirage, publications et fermeture restent sérialisés. Les ouvertures des cibles à publier sont protégées ; celles des autres entretiens, y compris une récupération étrangère au lot, restent possibles. Les publications inconnues d’autres opérations gardent leurs exclusions existantes.

Seuls les fichiers concernés sont installés dans le miroir. Une reprise relit les versions publiées actuelles, ne réinstalle pas une ancienne image de commit par-dessus une version fraîche et ne remplace pas une session locale protégée. Une panne du miroir après succès est un **acquis serveur** : rouvrez et tirez le corpus, sans rejouer. Les entretiens non ciblés ne sont pas écrasés par l’inventaire.

## WebDAV : lot ciblé raccordé et qualifié sur Nextcloud A/B

`src/main/distant/renommagesAnonWebDAV.ts` est assemblé dans `TransactionsCorpus` et `ContexteCorpusDistant`. Ses entrées restent des préparations **privées main**, jamais des copies fournies par le renderer. `RenommagesAnon.preparerWebDAV` et `consommerWebDAV` scellent les cibles, le consentement, le store, le fournisseur et l’identité du contexte ; le jeton est consommé à chaque tentative. Les IPC existants de suivi, aperçu, reprise et exécution sont dispatchés au contexte d’origine, revérifié après les lectures.

Le moteur lit le membership publié complet, avec ETags forts et borne d’inventaire 64 Mio. Sous verrou corpus court, il revalide les usages consentis, publie d’abord la définition, puis traite chaque cible sous verrou **corpus→un entretien**. Il ne verrouille ni ne réinstalle les entretiens non ciblés. Chaque PUT conserve une garde If-Match ; le verrou corpus empêche les écrivains coopérants de changer la définition entre lecture et envoi. Les entretiens modifiés reçoivent une date fraîche, sans réécriture du membership à chaque fichier.

Cible tenue, session locale/récupérable, version changée ou droit perdu : cette cible est différée. Le contrôle final complet refuse une fausse fin si des usages sont nouveaux ou des sources indisponibles. La préparation de reprise relit les sources ; une cible retirée ou sans usage peut être retirée du lot lors de la prochaine préparation consentie. Aucun nouveau fichier n’est ajouté implicitement, aucune compensation des acquis n’est tentée.

`journalRenommageAnonWebDAV.ts` conserve `.renommage-anon-webdav.json`, privé `0600`, remplacement atomique, fsync du fichier et du dossier, borne 128 Mio. Destination, copies consenties, transformations pures, compteurs, progression et intention avant chaque PUT sont contrôlés. Le suivi public ne contient pas les copies. Une panne du miroir après confirmation est un acquis serveur, jamais une raison de rejouer.

Une réponse perdue est confirmée par les octets exacts de l’image après. Si la relecture échoue, le moteur conserve l’intention **et les verrous**. L’instance encore vivante ne réutilise que ses providers déjà acquis ; une instance relancée tente une acquisition fraîche et refuse tout verrou persistant, même du même compte. Après preuve extérieure de mort du processus synthétique et libération extérieure, les tests reprennent sans refaire le PUT accepté. Cette intervention n’est pas une commande ni une permission de l’application.

**Limite explicite :** retrouver l’image avant ne prouve pas le refus d’un PUT incertain. Le moteur ne transforme pas cette lecture en autorisation de rejeu, même après nouvelle préparation. Sans preuve supplémentaire, ce cas reste indéterminé et bloqué. C’est le choix conservateur de cette implémentation, qui ne dispose pas ici de la preuve de commit unique utilisée sur GitLab ; aucune clôture forcée ni annulation n’est ajoutée.

### Contexte, sessions et sauvegardes tardives

Les ouvertures et autosaves des seules cibles sont exclues pendant leur traitement ; les non-ciblés restent utilisables. Une opération cible déjà commencée refuse l’exécution. Tirage et fermeture sont protégés pendant l’opération ; les fichiers restant à publier sont exclus du miroir à la relance. Un journal incomplet interdit migrations, archivage automatique et mutations incompatibles. Les identités de renommage et de garde corpus ne deviennent jamais des orphelins de session publiables ou abandonnables.

`src/shared/corpus/choixPseudosAnon.ts` partage le contrôle des choix liés avec GitLab. `gardePseudosWebDAV.ts` est **installé dans l’assemblage courant**, pour les sessions, publications courtes, créations/imports et reprises des sessions orphelines. Il conserve les choix déjà publiés mais exige une variante actuelle pour une décision nouvelle, réactivée, rattachée ou modifiée. Les transactions qui tiennent déjà le verrou corpus le transmettent par un chemin interne main, sans seconde acquisition ni autorité renderer. Les échéances sont recontrôlées avant transport ; une expiration avant PUT ne produit pas une fausse intention indéterminée. Une nouvelle règle réellement importée peut autoriser sa propre décision sans remplacer une règle publiée existante.

Un PUT ordinaire dont la réponse **et** la relecture sont perdues ne peut pas libérer son verrou corpus : une requête tardive ne doit pas arriver après un changement de définition. `.publication-pseudos-webdav.json`, privé `0600`, atomique/fsync et limité à 64 Mio, conserve destination, chemin et image envoyée avant transport. Tant que l’issue n’est pas prouvée, les mutations du corpus sont bloquées. **Actualiser le corpus** relit l’image : égalité exacte et ETag fort permettent confirmation sans PUT rejoué ; l’original ne prouve pas un refus. L’instance vivante ne rend que son provider acquis ; après relance, le verrou persistant est refusé, pas hérité. Le miroir fermé reçoit l’image fraîche confirmée ; une session ou copie récupérable garde son autosave plus récente, et seule sa base publiée avance. Les envois à longueur identique utilisent une différence de taille pour éviter le cas ETag mtime/taille observé sur Nextcloud.

Qualification : **12 scénarios réels moteur A/B** et **10 scénarios réels contexte A/B**, incluant session non ciblée, publication courte/import, réponse/relecture perdues, base confirmée avec autosave plus récente, relance et aucun rejeu. **6 recettes Electron A/B** couvrent aperçu serveur malgré miroir périmé, annulation, cible tenue, publication partielle, nouveau consentement, réponse/relecture perdues, relance avec refus des verrous persistants et sauvegarde tardive incertaine. Les libérations extérieures synthétiques après preuve d’arrêt ou de publication acceptée ne sont pas une permission de l’application. Le SIGKILL du moteur reste qualifié séparément. **8 recettes Electron de correspondances WebDAV et 7 locales** repassent. Suite complète finale : **173 fichiers réussis, 2 293 tests réussis, 93 sautés** (10 fichiers sautés), typecheck/build réussis. Les qualifications GitLab configurées/OAuth ne sont pas revendiquées comme réexécutées dans cette livraison. Tous les dossiers/profils sont synthétiques et nettoyés.

Les anciens clients et écritures API contournant les verrous ne sont pas couverts : ni le contrôle final ni la coopération actuelle ne garantissent une isolation universelle.

## Dialogue et qualification

Le dialogue distingue aperçu, publication en cours, succès complet et lot à reprendre. Le suivi public ne contient que demande, identifiants/états de cibles et compteurs acquis, pas les copies ni l’autorité de publication. Une lecture du suivi échouée bloque préparation/reprise jusqu’à nouvelle lecture. Chaque reprise recalcule et remet la confirmation à zéro ; un résultat partiel ne ferme pas le dialogue et n’annonce pas une fin complète.

Qualification GitLab de la livraison précédente, conservée comme historique :
- tests purs/local, cache, service, sessions, import et renderer : inclusions, exceptions, variantes, choix indépendants, sources périmées, clones, droits, interruptions avant transport/après acceptation, reprise et miroir ;
- **13 scénarios GitLab réels à deux comptes**, dont 130 membres/deux cibles, session non ciblée maintenue et publiable, différé ciblé/reprise, concurrence sans rapport, nouveaux usages à confirmer, sauvegarde tardive et import d’ancien choix lié refusés, autorisation perdue et réponse inconnue/restart sans rejeu ;
- **7 qualifications réelles de correspondances** repassées ;
- recette OAuth/Electron : aperçu serveur malgré miroir périmé, annulation, cible tenue et non-cible tenue par le second compte, succès partiel, reprise fraîche avec nouvelle confirmation, trois commits de données, identités préservées et édition/publication après le lot. Captures normale, réduite et partielle ;
- **7 recettes Electron locales réussies** ; suite complète **168 fichiers réussis, 2 188 tests réussis, 93 sautés** (10 fichiers sautés), typecheck/build réussis. Les qualifications GitLab conditionnelles sont exécutées séparément avec le banc configuré.

Une seconde exécution OAuth/Electron a échoué pendant la préparation d’un bail synthétique du second compte, avant lancement de l’application. La fixture vérifie désormais `can_push` sur la branche après création de l’adhésion, avant acquisition. Réexécution renommage/import réussie, puis deux répétitions du renommage réussies. Cela ne prouve pas l’absence de toute intermittence du banc ; aucune garde de production n’a été assouplie. Les avertissements Happy DOM de nettoyage de CSS externes restent présents sans échec de suite.

130 membres avec deux cibles ne constitue pas une qualification de charge maximale ou d’un lot à nombreuses cibles. Windows, anciens clients et instance institutionnelle supplémentaire restent non qualifiés. Le geste WebDAV est désormais qualifié de bout en bout sur les seuls bancs A/B ; cela ne qualifie ni sa charge maximale ni tout fournisseur WebDAV. Dissociation, suppression partout, promotion globale et retrait/repli de variante restent à livrer ; parité inline V1 et acceptation utilisateur restent ouvertes.
