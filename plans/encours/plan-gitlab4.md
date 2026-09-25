# GitLab — édition fiable, reprise après veille et commits maîtrisés

**Statut : plan de continuation ; protocole C retenu, intégration à fiabiliser.**
**Priorité : répondre aux incidents rapportés par les utilisateurs, sans ajouter un second système de coordination.**

Ce document remplace [plan-gitlab3.md](plan-gitlab3.md) pour le périmètre immédiat,
l’ordre des travaux et les critères de sortie. Le plan 3 reste une référence
pour les besoins de livraison ultérieurs, pas une seconde liste à exécuter en
parallèle. Les exigences de sécurité, de confidentialité et de non-régression
ne sont pas abandonnées. Le [rapport GitLab](../../docs/dev/gitlab.md) conserve
les preuves historiques, dont certaines conclusions d’intégration sont à rectifier.

## 1. Partir du problème utilisateur

Retour V1 : un utilisateur laisse un entretien ouvert, met son ordinateur en
veille ou ferme son portable pendant plusieurs jours. Léna ne peut plus éditer
cet entretien, car le verrou n’est libéré qu’à la fermeture normale. L’équipe
demande aussi ce qui arrive au travail en cas de coupure réseau.

La V1 utilise des verrous LFS natifs persistants : aucun renouvellement, aucun
commit technique de maintien, mais aucune expiration automatique. Ce choix a
servi des utilisateurs ; le blocage après veille est une limite concrète à traiter.

### Résultats attendus

- Une consultation ne prend pas de verrou et ne produit aucun commit.
- Un entretien ne possède qu’une session d’édition autorisée, même avec deux
  postes utilisant le même compte.
- Après l’arrêt des renouvellements, un collègue peut reprendre dans un délai
  borné, sans demander au premier utilisateur de rouvrir son ordinateur.
- Le poste qui revient ne peut pas écraser le travail effectué depuis la reprise.
- Les modifications autosauvegardées localement restent récupérables après
  coupure, veille, fermeture forcée ou crash.
- L’utilisateur distingue ce qui est enregistré localement de ce qui est partagé.

**Limite à expliquer :** le collègue retrouve la dernière version publiée.
Un ordinateur endormi ne peut pas envoyer ses dernières modifications. Une
copie locale protégée n’est ni une publication ni une sauvegarde contre la perte
physique du poste. Le texte encore uniquement dans le renderer peut être perdu
par un arrêt brutal avant l’autosauvegarde ; ne pas promettre une perte nulle.

## 2. Décision d’architecture

Conserver **C : bail versionné avec expiration**, sur la même branche que les
transcriptions. Publication des données et mutation conditionnelle du bail
restent dans un même commit. Conserver aussi les gardes de contenu.

L’expiration autorise une reprise par un client Sonal compatible ; GitLab ne
supprime pas spontanément le bail et n’en applique pas le TTL aux commits REST.
Le client cesse d’utiliser un droit expiré ; après reprise, la garde du bail
refuse la publication et la libération par l’ancienne génération.

### À conserver

- Miroir local commun et `CorpusStore`, sans clone ni binaire Git sur le poste.
- Autosauvegarde locale, protection avant tirage et journaux de récupération.
- Identification du détenteur par compte, poste et session distincts.
- Lecture fraîche après acquisition, versions et gardes serveur.
- Résultats « confirmé », « refusé » et « indéterminé » distincts.
- Publication finale avant libération, et bascule de contexte sûre.
- TLS vérifié, secrets dans le main/coffre, diagnostics expurgés.
- Fonctionnement Nextcloud et associations de médias locaux existants.

### À ne pas ajouter dans cette tranche

- Serveur de baux, second stockage de présence ou branche de verrous séparée.
- Détection clavier/souris, fermeture automatique après inactivité ou politique
  différente selon que l’utilisateur écoute, lit ou saisit.
- Coédition, fusion automatique, branches personnelles ou réécriture d’historique.
- Refactorisation générale des connecteurs avant de corriger le parcours courant.
- Plusieurs protocoles de verrouillage proposés simultanément aux équipes.

Un renouvellement n’exige pas universellement un commit. Il l’exige ici parce
que l’échéance est stockée dans un fichier du dépôt. Déplacer seulement cette
échéance ailleurs introduirait un second mécanisme et de nouvelles courses de
reprise : ce n’est pas la simplification retenue.

## 3. État réel avant continuation

Constats issus de la relecture du code, sans nouvelle campagne serveur lors de
la rédaction. Le dépôt contient du travail non commité ; le préserver.

| Élément | État et conséquence |
|---|---|
| Consultation, miroir, journaux et publication conditionnelle | Implémentations et preuves existantes à réutiliser. Ne pas recommencer une démonstration générale de faisabilité. |
| Bail et ancienne génération | Primitives qualifiées en tests et sur le banc. Cela ne prouve pas toute leur intégration Electron. |
| Identité du verrou | La resource locale reste isolée pour les miroirs et journaux. La resource du bail est dérivée de la branche et du chemin distant canonique ; un ancien marqueur est détecté conservativement. |
| Renouvellement | Un ordonnanceur unique du main appelle publication et renouvellement avec une file par entretien. Les valeurs par défaut sont 15 minutes de bail, 5 minutes de marge et 2 minutes entre publications. |
| Sérialisation | `SessionGitLab.serialiser()` utilise une file commune pour acquisition, publication, renouvellement, réconciliation et fermeture. Les autosaves restent hors de cette file réseau. |
| État public | `SessionGitLab.etat()` vérifie l’échéance locale et suspend une session expirée avant de la considérer comme éditable. |
| Fermeture applicative | `executerFermetureApplication()` appelle toujours `quitter()`, même après certains échecs ou expiration du nettoyage. |
| E2E à deux profils | Le scénario principal relu parcourt successivement deux profils avec le même compte. Il ne prouve pas une exclusion simultanée entre deux comptes. |
| Campagnes de 480 commits | Renouvellements accélérés produits par le banc, pas comportement automatique de l’application. Latence mesurée, croissance disque non établie. |

**Ne pas annoncer l’édition multi-utilisateur comme entièrement qualifiée avant
correction et recette de ces frontières.** Les gardes de contenu protègent des
écrasements, mais ne remplacent pas l’exclusion entre deux éditeurs.

## 4. Trois rythmes distincts, une seule orchestration

### 4.1 Paramètres proposés pour le pilote

| Rythme | Proposition |
|---|---|
| Autosauvegarde locale | Conserver le debounce existant et son vidage explicite ; aucune écriture GitLab par frappe. |
| Publication | Toutes les deux minutes si le contenu a changé, plus commande manuelle et publication finale. |
| Durée du bail | Quinze minutes. |
| Marge de renouvellement | Cinq minutes avant expiration. |
| Vérification locale | Minuteur main peu coûteux ; vérifier une échéance locale ne nécessite pas de requête ni de commit. |

Ces valeurs sont **une proposition à valider avec les utilisateurs**, pas des
paramètres déjà déployés. Question centrale : accepter jusqu’à environ quinze
minutes d’attente après le dernier renouvellement réussi pour reprendre un
entretien ? La période de publication détermine séparément la fraîcheur de ce
que retrouvera Léna. Horloges et délais réseau doivent être bornés dans la recette.

### 4.2 Règle d’émission des commits

1. Une publication avec changement renouvelle le bail dans le même commit.
2. Une publication sans changement ne produit pas de commit de contenu et ne
   doit pas prétendre avoir renouvelé le bail.
3. Un renouvellement seul est envoyé uniquement si l’échéance approche et si
   aucune publication réussie ne l’a déjà repoussée.
4. Recontrôler cette nécessité dans la file d’exécution, pas uniquement lors
   du déclenchement du minuteur : une publication peut avoir abouti entre-temps.
5. Ne pas attendre indéfiniment de nouvelles modifications pour renouveler.
   Un échec de publication ne justifie pas un renouvellement aveugle.
6. Une échéance plus lointaine n’est tenue pour acquise qu’après confirmation
   de l’écriture ou réconciliation sûre. Une réponse tardive ne donne pas
   arbitrairement quinze minutes de plus à partir de sa réception.

Avec ces valeurs et hors incidents, un entretien inchangé en édition produit
un renouvellement environ toutes les dix minutes, plutôt que toutes les minutes.
Une session avec publications rapprochées n’ajoute normalement aucun commit
spécifique de renouvellement. Aucun renouvellement pour un simple lecteur.

### 4.3 Mise en œuvre limitée

Fichiers principaux : `src/main/gitlab/session.ts`, `bailGitLab.ts`,
`publication.ts`, `contexte.ts`, `assemblageSession.ts`, puis l’assemblage main.

- Une file de cycle de vie par entretien pour acquisition, publication,
  renouvellement, reprise et fermeture. Les autres entretiens restent indépendants.
- Séparer méthodes publiques mises en file et opérations internes : une fermeture
  ne doit pas attendre une publication publique mise derrière elle dans la même file.
- L’autosauvegarde locale ne doit pas attendre la fin d’un appel réseau. Capturer
  un candidat et sa révision cohérents ; une nouvelle révision reste sale.
- Un seul responsable des échéances dans le main, pas un battement par fenêtre.
- Arrêter les minuteurs lors de la suspension, fermeture ou destruction du contexte.
  Ignorer les réponses appartenant à un contexte remplacé.
- Vérifier le droit dans les commandes main, pas seulement dans l’état des boutons.

## 5. Identités, compatibilité et reprise

### 5.1 Séparer la destination locale de la ressource partagée

L’ID local sert à isoler caches, comptes, secrets et journaux : conserver cette
isolation. Il ne doit pas définir à lui seul le chemin du verrou partagé.

La clé de verrou doit identifier le même fichier dans le même dépôt et la même
branche pour tous les clients. La fonder sur le chemin canonique de l’entretien
à la racine du dépôt, dans le contexte du projet et de la branche ; aucun ID de
compte, de poste ou de miroir dans cette clé. Deux racines d’ouverture menant au
même fichier ne doivent pas fabriquer deux verrous. L’identité du détenteur
reste dans le contenu du bail, pas dans l’identité de la ressource.

Avant de changer cette clé :

- inventorier les journaux et baux de la préversion ; préserver leurs candidats ;
- définir une ouverture conservatrice des anciens états, sans les effacer ni
  reprendre silencieusement leurs droits sous un nouveau chemin ;
- versionner le protocole et organiser la mise à niveau de tous les postes ;
- ne pas prétendre qu’un nouveau marqueur peut empêcher un ancien client qui
  l’ignore d’écrire : pas d’édition mixte avec l’ancien protocole ;
- vérifier que les comptes et miroirs Nextcloud gardent leurs identifiants.

### 5.2 Veille, réseau et retour de l’ancien poste

- Autosauvegarder régulièrement sans attendre l’annonce de la veille. Un hook
  de suspension peut aider, jamais garantir une dernière publication réseau.
- Au réveil, suspendre l’édition avant de la rendre à nouveau disponible, garder
  les derniers changements et revalider le droit et la base distante.
- Une perte de droit, une expiration ou une mutation au résultat indéterminé
  suspend l’édition ; pas de prolongation locale de convenance.
- Pour la première version, suspendre dès qu’un échec réseau rend la garantie
  incertaine, même avant expiration. Ne pas ajouter un mode hors ligne implicite.
- Le réseau revenu ne réactive pas automatiquement une session dégradée.
- Après expiration, acquérir une nouvelle génération et relire la base avant
  toute reprise. Une reprise concurrente ne doit avoir qu’un gagnant.
- Si Léna a modifié l’entretien, conserver le candidat de l’ancien poste à part
  et proposer une copie/export de récupération. Aucun écrasement ni merge caché.
- Tester l’horloge décalée, la veille dépassant un minuteur et les réponses
  retardées. Détecter les sauts d’horloge et revalider plutôt que prolonger le droit.

**Portée de l’exclusion :** entre clients Sonal compatibles. Un poste endormi ou
isolé peut ne pas encore connaître la reprise ; l’objectif opposable au serveur
est d’empêcher sa publication sous l’ancienne génération. Les écritures externes,
force-push et contournements administrateur ne sont pas un parcours supporté.

### 5.3 Fermeture normale et forcée

- Vider le renderer, figer la transition, publier le dernier candidat puis libérer.
- Sans confirmation sûre, rester dans le contexte et expliquer le blocage.
- Traiter explicitement « bail déjà perdu » et réponse perdue à la libération ;
  ne pas transformer indistinctement ces résultats en succès.
- Offrir une fermeture forcée explicite avec copie durable, sans afficher
  « partagé ». Signaler un échec de sauvegarde locale au lieu de le masquer.
- Au redémarrage, protéger les copies avant le premier tirage, réconcilier les
  opérations en attente puis demander un nouveau droit.

## 6. Le dépôt va-t-il devenir énorme ?

### 6.1 Ce qu’un commit ajoute réellement

Git ne recopie pas tout le corpus à chaque commit. Il réutilise les objets des
fichiers inchangés. Un renouvellement ajoute essentiellement une nouvelle version
du petit JSON de bail, les objets d’arbre modifiés et les métadonnées du commit.
Le stockage peut ensuite être compacté par Git, selon la maintenance GitLab.

Ce n’est toutefois **pas gratuit** : objets, historique, indexation, base GitLab,
journaux serveur et traitements éventuels s’accumulent. La compression ne
supprime pas les commits conservés dans l’historique. Les sauvegardes du serveur
ont aussi un coût, dépendant de leur politique.

Une publication de transcription ajoute une nouvelle version de son JSON ;
Git peut exploiter les ressemblances au stockage, mais ne pas promettre une
taille égale aux seuls caractères ajoutés. Les médias binaires et les objets LFS
ont un coût distinct. Un renouvellement ne renvoie ni ne duplique les médias.

Le miroir Sonal ne télécharge pas tout l’historique Git. La croissance serveur
ne devient donc pas automatiquement la même croissance sur chaque poste.

### 6.2 Ordres de grandeur en nombre, pas en octets

Hypothèses : une session d’édition ouverte huit heures par jour, bail de quinze
minutes et marge de cinq minutes. Comptages arrondis, hors acquisitions,
libérations, reprises et incidents.

| Usage | Commits sur huit heures | Sur 220 jours |
|---|---:|---:|
| Renouvellement systématique toutes les minutes | Environ 480 renouvellements. | Environ 105 600. |
| Entretien inchangé, renouvellement seulement à l’échéance prévue | Environ 48 renouvellements. | Environ 10 560. |
| Contenu changé et publié toutes les deux minutes | Environ 240 publications, sans renouvellements séparés en régime normal. | Environ 52 800. |
| Consultation sans session d’édition | 0 commit de session. | 0. |

Avec dix sessions dans un même projet, multiplier ces volumes par dix : environ
105 600 renouvellements annuels pour des sessions inchangées, ou 528 000 commits
de publication dans l’exemple d’édition continue. Ce ne sont pas des prévisions
d’usage ; les vraies pauses et heures d’ouverture doivent être relevées.
Une session laissée éveillée et connectée 24 h sur 24 continue aussi à renouveler.

**Conclusion :** quelques heures ne signifient pas une duplication massive du
corpus, mais une année de travail collectif peut produire beaucoup de commits.
Le bruit de l’historique, la latence et le stockage sont trois coûts différents.
Aucun chiffre fiable en Mo par an ne découle des seules campagnes de 480 commits.

### 6.3 Mesure minimale avant le pilote

Sur un projet synthétique autorisé du Docker existant, sans modifier de corpus
utilisateur, comparer à partir d’un état initial mesuré :

1. une journée de renouvellements seuls selon la nouvelle politique ;
2. une journée de publications de transcriptions représentatives ;
3. quelques sessions indépendantes dans le même projet pour mesurer la contention.

Relever : nombre et type de commits, volume transmis, latences, croissance du
dépôt Git et statistiques de stockage disponibles. Séparer les médias/LFS,
la base de données, les logs et les artefacts CI lorsque la mesure le permet.
Les statistiques GitLab peuvent être différées : ne pas présenter un compteur
inchangé en cache comme une croissance nulle. Si l’accès le permet, compléter
par des relevés serveur en lecture seule ; distinguer stockage avant et après
la maintenance normale, sans déclencher soi-même de GC/repack.

Les campagnes accélérées valident comptage et coût des écritures, pas la veille
réelle, huit heures de timers ou la maintenance annuelle du serveur. Compléter
par une session longue et une veille réelle dans l’application empaquetée.
Documenter toute extrapolation annuelle, sa charge de référence et ses limites.

Convenez avec l’institution d’un budget de stockage et d’une latence acceptable
avant de conclure. Si le coût est excessif : revoir les durées ou le protocole,
avec leurs effets sur le délai de reprise et la fraîcheur des transcriptions.
Ne pas masquer le coût par des publications trop rares ni une purge automatique.

### 6.4 CI : contrôle proportionné

La CI n’est pas une dépendance de Sonal. Vérifier d’abord si le projet de corpus
possède une CI, y compris une configuration imposée par l’instance.

- Sans CI : documenter cette condition de support, sans installer un runner.
- Avec CI : petite recette des déclenchements et de leur coût ; convenir d’une
  politique pour les commits techniques, sans modifier les règles à l’insu des
  responsables du projet ni ignorer les vrais changements de contenu.
- Un pipeline en échec ne signifie pas que le commit a été refusé.
- Ignorer une CI évite des jobs, pas les commits ni leur stockage.

Pas de campagne intensive de pipelines, de téléchargement de runner ni de
configuration de quota sans accord distinct. Le quota LFS et la CI institutionnelle
ne bloquent plus la correction de la reprise d’une session de transcription.

### 6.5 Reconnaître les renouvellements et préparer une maintenance exceptionnelle

Les commits de **renouvellement seul** auront tous le même titre stable :

```text
[Sonal] Renouvellement du bail
```

Les identifiants techniques nécessaires à la réconciliation peuvent figurer dans
le corps du message, sans secret ni contenu métier. Un titre commun ne remplace
jamais un identifiant d’opération unique. Conserver la compatibilité de recherche
des publications déjà journalisées ; ne pas changer leur convention par effet de bord.

- Réserver ce titre aux commits ne modifiant que des fichiers de bail sous
  `.sonal/verrous/`, avec des changements de renouvellement reconnus.
- Ne pas l’utiliser pour une publication de transcription, même si elle renouvelle
  aussi le bail, ni pour une acquisition, une reprise ou une libération.
- Tester le titre et les chemins/actions autorisés ; le message seul ne prouve
  pas qu’un commit est purement technique.
- Les anciens messages restent inchangés. Ne pas réécrire l’historique uniquement
  pour leur appliquer la nouvelle convention.

Ce repérage facilite les diagnostics et une éventuelle intervention du responsable
du projet. Il ne rend pas la suppression des commits anodine : les descendants
changent d’identifiant, y compris les publications métier conservées.

Une future procédure de nettoyage devra être qualifiée séparément sur une copie
avant d’être recommandée. Ses préconditions minimales sont :

1. Sauvegarde restaurable et autorisation explicite du responsable GitLab.
2. Arrêt coordonné des écritures et interdiction temporaire des reconnexions ;
   un poste endormi ou hors ligne ne doit pas pouvoir revenir avec son ancien état.
3. Publications et résultats indéterminés résolus, copies locales récupérables
   inventoriées et préservées, puis fermeture/libération des sessions.
4. Sélection contrôlée des renouvellements par message **et** contenu du diff,
   sans suppression des commits mixtes ni altération de l’état métier final.
5. Validation de l’état final et traitement des références concernées selon une
   procédure explicite ; aucun force-push improvisé depuis Sonal.
6. À la réouverture, revalidation des bases et acquisition de nouveaux droits ;
   ne pas réutiliser aveuglément les SHA des anciens journaux ou miroirs.

L’absence d’utilisateurs actuellement en ligne ne suffit donc pas. La suppression
logique de commits ne garantit pas non plus un gain disque immédiat : références
conservées, sauvegardes et maintenance GitLab entrent en jeu. Ne fournir aucun
script destructif non testé ni nettoyage périodique automatique dans cette tranche.

## 7. Lots courts et vérifiables

### G0 — Stabiliser le point de départ

- [x] Préserver et relire le travail non commité, puis établir les tests de base.
- [ ] Corriger le rapport d’avancement pour distinguer banc, tests simulés et E2E.
- [ ] Faire confirmer les durées proposées et les volumes de travail attendus.

### G1 — Une même ressource, une seule session autorisée

- [x] Séparer identité locale et clé du verrou partagé ; prévoir la compatibilité.
- [x] Introduire une vraie file commune sans appel imbriqué bloquant.
- [x] Garder les autosauvegardes et révisions indépendantes des attentes réseau.
- [x] Tester simultanément deux comptes, puis deux postes du même compte.

**Sortie :** un seul gagnant pour le même entretien, deux entretiens différents
publiables sans verrou global, caches distincts et aucune copie locale sacrifiée.

### G2 — Renouveler seulement quand nécessaire

- [x] Brancher l’ordonnanceur dans le main et centraliser les paramètres.
- [x] Replanifier après publication confirmée ; éviter tout renouvellement doublon.
- [x] Publier périodiquement uniquement les contenus modifiés.
- [x] Donner un titre commun aux renouvellements seuls, avec tests excluant les commits mixtes.
- [ ] Suspendre sur perte de garantie et traiter le réveil avant reprise d’édition.
- [x] Tester échéances, absence de changement, nouvelles révisions et réponses tardives.

**Sortie :** compteur de commits conforme à la politique, aucune dépendance au
minuteur du renderer, aucun renouvellement d’un droit expiré ou d’un ancien contexte.

### G3 — Veille, coupure, crash et fermeture de bout en bout

- [x] Préserver aussi l’état encore en debounce lors de la suspension GitLab.
- [ ] Faire reprendre Léna après expiration, puis réveiller l’ancien poste.
- [x] Vérifier refus de l’ancien détenteur et récupération de son candidat.
- [ ] Bloquer une fermeture normale incertaine et proposer une sortie forcée explicite.
- [x] Réconcilier les réponses perdues, même si plusieurs commits ont suivi.
- [ ] Rejouer dans Electron puis le binaire empaqueté ; consigner une veille réelle.

**Sortie :** récit utilisateur reproduit et résolu, dernière version publiée
visible chez Léna, modifications locales récupérables sans écrasement silencieux.

### G4 — Mesurer et faire essayer

- [ ] Mesurer la croissance et la latence selon les scénarios de la section 6.
- [ ] Vérifier la configuration CI réelle sans déployer un banc disproportionné.
- [ ] Rejouer les non-régressions locales et Nextcloud A/B disponibles.
- [ ] Faire une recette avec les utilisateurs concernés et consigner les limites.
- [ ] Actualiser le guide : local/partagé, délai de reprise et récupération.
- [ ] Documenter le repérage des commits techniques et les préconditions d’une maintenance exceptionnelle, sans recommander de suppression non qualifiée.

**Sortie :** pilote accepté sur les scénarios vécus, avec bilan du coût mesuré.
Une suite sautée ou une donnée serveur inaccessible reste explicitement non validée.

## 8. Matrice minimale de recette

| Scénario | Preuve attendue |
|---|---|
| Deux comptes, même entretien, ouvertures simultanées | Même chemin de verrou ; un seul éditeur autorisé. |
| Même compte sur deux postes | Deux sessions distinctes ; aucune réouverture implicite du droit de l’autre. |
| Deux entretiens différents | Publications indépendantes, avec contention bornée au niveau de la branche. |
| Lecture seule | Aucun commit ni renouvellement implicite. |
| Session inchangée | Pas de commit de contenu ; renouvellements seulement près de l’échéance. |
| Publication juste avant le renouvellement programmé | Un commit combiné, aucun renouvellement superflu. |
| Autosave pendant une publication | La nouvelle révision reste sale et récupérable. |
| Fermeture pendant publication/renouvellement | Pas de course ni deadlock ; dernier candidat confirmé avant libération. |
| Réseau coupé ou veille | Copie locale préservée, ancien droit non prolongé artificiellement. |
| Reprise par Léna, retour de l’ancien poste | Ancienne publication et ancienne libération refusées. |
| Réponse perdue après écriture acceptée | Pas de rejeu aveugle ; résultat retrouvé ou conservé comme indéterminé. |
| Fermeture forcée puis redémarrage | Protection avant le premier tirage, même avec un nouveau compte de connexion. |
| Ancien journal ou ancien protocole | Migration/refus explicite sans disparition du travail ni édition mixte. |
| Historique chargé et horloge décalée | Réconciliation bornée et suspension conservatrice, pas de faux succès. |

Commencer hors réseau : `npm run typecheck`, suites `test/gitlab`, fermeture,
transition de contexte et renderer. Puis utiliser les commandes GitLab réelles
et empaquetées documentées dans `docs/dev/gitlab.md`. Ne pas déclarer une nouvelle
commande de campagne avant de l’avoir effectivement ajoutée au dépôt.

Les images/volumes Docker existants sont conservés. Aucun pull, provisioning,
prune, effacement de fixtures, force-push ou suppression d’historique pour faciliter
la qualification. Tout test d’écriture reste dans un projet synthétique autorisé.

## 9. Ce qui est reporté, sans être annoncé comme livré

- Transactions de corpus : ajout/import/suppression, définitions et opérations
  liées, à activer famille par famille après protection de leurs dépendances.
- OAuth V2 : la V1 fournit un acquis à reprendre ; PAT acceptable pour le banc,
  pas un substitut automatiquement accepté pour la diffusion non technicienne.
  Le chantier d’authentification est décrit dans [plan-gitlab-oauth.md](plan-gitlab-oauth.md).
- Médias partagés et Docs cadre : chantier séparé. [plan-media.md](plan-media.md)
  propose des médias WebDAV secondaires ; ne pas le considérer comme déjà validé
  ni rendre le quota LFS obligatoire pour ce pilote de transcriptions.
- Copie anonymisée, migration d’équipes V1 et recette institutionnelle complète.

La création GitLab déjà exposée est conservée sous son périmètre testé. Ne pas
activer les autres mutations non qualifiées. Aucune suppression des parcours
Nextcloud pour obtenir artificiellement une parité avec GitLab.

Les données réelles nécessitent l’accord de l’institution. Les avertissements
sur l’historique et les données sensibles restent obligatoires : effacer le
contenu courant n’efface pas les anciennes versions.

## 10. Définition de terminé pour cette tranche

- [ ] Le cas « portable en veille plusieurs jours » ne bloque plus indéfiniment Léna.
- [ ] L’ancien poste ne peut ni publier ni libérer le droit repris par un autre.
- [ ] Les copies autosauvegardées survivent aux incidents et restent accessibles.
- [ ] Le renderer et le main suspendent effectivement une session non sûre.
- [ ] Les trois rythmes sont distincts et aucun renouvellement doublon n’est émis.
- [ ] La fermeture normale et la fermeture forcée ont des contrats différents et testés.
- [ ] L’exclusion simultanée est prouvée dans l’application, pas seulement dans un port.
- [ ] Le coût annuel est estimé à partir de mesures, sans promesse de taille arbitraire.
- [ ] Les limites, reports et paramètres retenus sont compris par les utilisateurs.

**Prochaine action : G0 puis G1. Ne pas commencer par installer un runner CI.**
