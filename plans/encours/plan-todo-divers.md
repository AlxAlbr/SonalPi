
# A faire

## Pense bêtes

Import/export
Menu 
settings au niveau de l'app (langue, aussi possibilité d'enlever des modèles importées pour les métadonnées)

### Retours Olivier


Expression ProxyCache plutôt que miroir peut être (car miroir plutôt copie fidèle alors que ProxyCache laisse plus penser à échange bidirectionnel)
Sur la question du gitlab : créer un groupe avec les sous-projets : a voir avec Alex


### Renommage en cours

 1. Dépôt GitLab : renommer mbeligne/SonalPiTestV2 → mbeligne/SonalPi2, puis git remote set-url origin https://gitlab.huma-num.fr/mbeligne/SonalPi2.git
 2. Dossier local : mv SonalPiTestV2 SonalPi2 après validation.
 3. Rien n'est commité — la revue du diff est à toi.



 ## Analyse globale !

 SonalPiTestV2 est un prototype techniquement solide, avec une architecture métier et une stratégie de tests nettement au-dessus de la moyenne.
 En revanche, plusieurs défauts de sécurité, de concurrence et d’industrialisation empêchent encore de le considérer comme prêt pour une diffusion large ou pour des données sensibles.

 Forces

 ### 1. Architecture cohérente

 - Séparation claire entre main, preload, renderer et shared.
 - Domaine métier pur dans src/shared/, sans accès au DOM, à Electron ou au disque.
 - Test d’architecture qui protège cette frontière dans test/remap.test.ts.
 - Distinction Corpus/Entretien et données stockées/calculées bien explicitée.

 C’est une très bonne base pour maintenir et faire évoluer le logiciel.

 ### 2. Excellente couverture fonctionnelle

 Validations exécutées :

 - npm test : 609 tests réussis, 21 ignorés.
 - E2E locaux : 80 réussis, 1 ignoré.
 - npm run typecheck : réussi.
 - npm run build : réussi.
 - npm audit : aucune vulnérabilité connue.
 - Dépôt Git resté propre.

 Les tests couvrent notamment l’import/export, la persistance, les migrations, l’éditeur, l’anonymisation, WebDAV, les verrous et les scénarios multi-utilisateurs.

 ### 3. Modèle multi-utilisateur ambitieux

 Le système WebDAV est bien pensé :

 - If-Match et If-None-Match;
 - abstraction commune des variantes de verrou;
 - publication avant libération;
 - copies de divergence;
 - reprise après crash;
 - tests avec doubles WebDAV et piles Nextcloud réelles.

 ### 4. Protection des données déjà présente

 - Écriture JSON temporaire puis renommage atomique.
 - Sauvegardes .bak1 et .bak2 des entretiens.
 - Refus des versions inconnues.
 - Audio référencé plutôt que copié.
 - Sanitiseur HTML restrictif pour les notes éditées.
 - contextIsolation: true.
 - Usage de safeStorage lorsqu’il est disponible.

 ### 5. Documentation technique riche

 Les documents dans docs/dev/ décrivent bien les invariants, le modèle objet, la persistance et la concurrence distante. Ils constituent une vraie aide à l’arrivée d’un développeur.

 ────────────────────────────────────────────────────────────────────────────────

 Faiblesses prioritaires

 P0 — Défauts à corriger avant une utilisation réelle

 ### 1. Collision des identifiants de corpus distants — réalisé

 **Statut : corrigé.**

 Les identifiants ne reposent plus sur les 32 premiers caractères de l’URL encodée en Base64. Ils sont maintenant calculés dans `src/main/distant/coffre.ts` avec un SHA-256 portant sur :

 - l’URL canonique complète du corpus;
 - l’utilisateur du compte;
 - un séparateur non ambigu entre ces deux valeurs.

 Changements principaux :

 - normalisation de l’URL avant le calcul de l’identifiant : espaces extérieurs, casse de l’hôte, port par défaut, barres finales et encodages URL équivalents;
 - identifiant Base64URL préfixé par `sha256-`, utilisable sans risque comme nom de dossier;
 - passage du coffre `comptes-distant.json` de `formatVersion: 1` à `formatVersion: 2`;
 - migration automatique des comptes existants et des références de `recentsDistant` dans `settings.json`;
 - anciens miroirs laissés isolés sous leur ancien identifiant, afin que le premier pull avec le nouvel identifiant reparte d’une copie propre et ne mélange pas deux corpus;
 - écritures atomiques du coffre et des réglages pendant la migration;
 - refus explicite d’un coffre corrompu ou d’une collision détectée pendant la migration, au lieu d’un remplacement silencieux;
 - tests couvrant deux corpus du même serveur, deux utilisateurs, la canonicalisation, le vecteur SHA-256, l’interruption/reprise de migration et l’isolation de l’ancien miroir.

 Validation réalisée : tests unitaires complets, typecheck et build réussis.

 ### 2. Les corpus distants récents ne sont pas relus — réalisé

 **Statut : corrigé avec la migration des identifiants distants.**

 `lireSettings()` valide et retourne désormais `recentsDistant`. La migration remplace les anciens identifiants par les nouveaux identifiants SHA-256, supprime les doublons et préserve les autres propriétés de `settings.json`.

 ### 3. Risque documenté de perte d’une copie de divergence — réalisé

 **Statut : corrigé.**

 Chaque copie porte désormais un UUID propre dans son nom
 (`<id>.divergence-<sessionId>.copie-<uuid>.json`) et l’écriture refuse d’écraser un fichier
 existant. La lecture reste compatible avec les anciens noms sans UUID.

 Le banc WebDAV embarqué couvre deux publications 412 successives du même entretien, avec le
 même `sessionId` et sans résolution intermédiaire. Il vérifie que les deux chemins et les deux
 contenus coexistent.

 ### 4. Une simple lecture peut acquérir un verrou d’écriture — réalisé

 **Statut : corrigé.**

 `corpus:lireEntretien` est maintenant une lecture pure du miroir, sans verrou, migration
 persistée ni rotation de sauvegarde. L'éditeur passe par
 `corpus:ouvrirEntretienPourEdition`, dont le statut d'accès est toujours explicite.
 Les mutations audio et SRT sur un entretien fermé utilisent une transaction courte fondée
 sur un GET post-verrou. Les sessions sérialisent battement, publication et fermeture,
 suivent une révision sale, et exposent un bilan détaillé à `fermerToutes()`.
 Les bascules ferment l'ancien contexte avant leur commit atomique et la fermeture de
 l'application attend, de façon bornée, l'autosave puis le nettoyage distant.

 Ancien constat : `corpus:lireEntretien` acquérait une session distante dans
 `src/main/index.ts`. Or ce canal était aussi utilisé pour :

 - afficher les métadonnées d’une carte;
 - inspecter l’anonymisation;
 - rechercher dans tous les entretiens.

 Une recherche peut donc verrouiller plusieurs entretiens sans les ouvrir dans l’éditeur. De plus, changer de corpus remplace l’objet sessions sans nécessairement libérer toutes les sessions précédentes.

 Correction à appliquer en tenant compte des effets induits :

 - rendre `lireEntretien` réellement sans verrou et sans effet de bord. La méthode actuelle de
   `CorpusStore` réécrit les migrations et arme la rotation des sauvegardes : séparer également
   à ce niveau la lecture pure de l’ouverture d’une session d’édition;
 - ajouter `ouvrirEntretienPourEdition`, réservé à l’éditeur, avec un statut d’accès obligatoire
   (`edition` ou `lecture-seule`). L’absence du champ optionnel `verrouTenuParAutrui` ne doit plus
   être interprétée comme la preuve que le verrou est acquis;
 - conserver la lecture des métadonnées, l’inspection de l’anonymisation et la recherche sur le
   chemin de lecture pure. En distant, préciser qu’elles lisent l’état du miroir issu du dernier
   tirage, et non nécessairement une nouvelle version du serveur;
 - ne pas faire dépendre les mutations du verrou acquis implicitement lors de la sélection d’une
   carte. L’assignation ou la suppression audio et l’import SRT sur un entretien fermé doivent
   devenir des transactions courtes autonomes : acquisition, GET frais après verrou, modification,
   PUT avec `If-Match`, puis libération;
 - pour l’import SRT, conserver la vérification initiale sans verrou, puis acquérir seulement après
   confirmation et choix du fichier. Construire la mutation depuis la version fraîche obtenue après
   acquisition afin de ne pas écraser des métadonnées modifiées entre-temps;
 - ajouter `SessionsDEntretien.fermerToutes()` avec un résultat détaillé distinguant les sessions
   fermées de celles restant bloquées en publication ou en libération. Une erreur réseau ne doit
   jamais être présentée comme une fermeture réussie;
 - réserver `dispose()` à un gestionnaire réellement terminal : plus aucune opération en cours,
   minuteur arrêté et aucune session oubliée. Ne pas supprimer l’objet si du contenu sale reste à
   publier;
 - vider et attendre l’autosave du renderer avant toute bascule de corpus. Le main ne peut publier
   que les modifications qui lui sont déjà parvenues;
 - appeler la fermeture avant tout remplacement de `store`, `sessions`, `transactions`,
   `presence` ou `miroirActif`, pour tous les chemins : dossier local, nouveau corpus, distant vers
   distant, oubli du compte actif, migration et bascule après suppression. Une bascule normale doit
   être refusée si une session sale ne peut pas être publiée;
 - préparer le nouveau contexte de corpus dans des variables locales, fermer l’ancien, puis basculer
   atomiquement. Sérialiser les transitions pour empêcher qu’un IPC en cours mélange ancien store,
   anciennes sessions et nouveau miroir;
 - sérialiser, pour chaque session, battement, publication et fermeture. Suivre une révision sale
   afin qu’une publication en cours ne marque pas propre une modification arrivée pendant son PUT;
 - rendre l’acquisition robuste aux exceptions : tout échec après la prise du verrou doit tenter
   de le libérer ou conserver assez d’état pour sa reprise, sans créer de verrou invisible;
 - intégrer la fermeture de l’application avec un `before-quit` gardé, qui attend un nettoyage
   borné avant de relancer la fermeture. En cas de panne ou de fermeture brutale, préserver miroir
   et journal pour la reprise plutôt que prétendre que le verrou est libéré.

 Tests à ajouter :

 - recherche, métadonnées et inspection d’anonymisation : aucun verrou ni session de sauvegarde;
 - ouverture de l’éditeur : verrou acquis, GET post-verrou et statut d’accès explicite;
 - verrou tenu par autrui : éditeur explicitement en lecture seule;
 - audio et SRT sur entretien fermé : verrou bref, version fraîche, publication puis libération;
 - annulation de l’import SRT : aucun verrou restant;
 - changement de corpus avec sessions propres, puis avec échec de publication;
 - échec de libération, échec après acquisition et courses battement/publication/fermeture;
 - oubli du compte actif et fermeture de l’application : verrou libéré ou état explicitement
   récupérable au prochain lancement.

 **Suivi des points de vigilance pour clore définitivement l'étape 4 :**

 1. **Conserver réellement l'état de session dégradé — réalisé.**

    **Statut : corrigé.**

    Une rétrogradation conserve désormais un état public `degrade` jusqu'à la fermeture
    explicite de l'entretien. La perte du verrou révoque immédiatement l'écriture dans le
    main et déclenche un événement IPC qui fige l'éditeur sans attendre le poll. Le debounce
    d'autosave est annulé, les écritures déjà parties sont attendues, et fermeture, bascule
    ou arrêt de l'application n'amorcent aucune nouvelle sauvegarde dans cet état. Une
    libération en échec reste retentable sans réautoriser l'écriture. Le type
    `EtatSessionPublic` est centralisé dans `src/shared/distant.ts`. Les tests couvrent la
    persistance jusqu'à acquittement, les variantes de verrou, l'échec de libération et
    `fermerToutes()`.

 2. **Éviter les écritures dans la cible avant la fermeture de l'ancien contexte.** Dans
    `corpus:creerNouveau` et `migrer:executer`, l'ouverture, l'amorçage ou la migration du
    nouveau store modifient déjà le disque avant `fermerContexteActuel()`. Si une session
    distante empêche la fermeture, la cible reste amorcée ou partiellement migrée alors que
    l'application demeure sur l'ancien corpus. Préparer le contenu en mémoire ou dans un
    fichier temporaire, puis fermer l'ancien contexte avant le commit atomique ; à défaut,
    restaurer strictement la cible en cas de refus. Vérifier également le cas d'un corpus
    ancien que `changerDossier()` migre à l'ouverture.

 3. **Rendre explicite l'échec de sortie de l'entretien.** `retourCorpus()` et
    `allerAccueil()` conservent correctement l'éditeur si la publication ou la libération
    échoue, mais leur rejet peut n'aboutir qu'à la console lorsque Vue intercepte la promesse
    du gestionnaire d'événement. Alimenter explicitement la bannière globale, ou installer
    un `app.config.errorHandler`, afin d'expliquer pourquoi l'utilisateur reste dans
    l'entretien.

 4. **Compléter les tests aux coutures IPC et application.** Ajouter les scénarios suivants :
    - refus d'une création, ouverture ou migration quand l'ancien contexte ne peut pas fermer,
      avec ancien contexte conservé et cible inchangée ;
    - rétrogradation visible et persistante : éditeur non modifiable, aucune nouvelle écriture,
      fermeture possible sans autosave, puis acquittement vers l'état `aucune` ;
    - annulation du sélecteur de fichier SRT sans acquisition de verrou ;
    - oubli du compte actif avec succès et avec échec de fermeture ;
    - fermeture de l'application : autosave attendu, nettoyage distant borné et conservation
      du miroir et du journal en cas d'échec.

 **Observations mineures :**

 - `ouvrirRecent()` puis `ouvrirCorpusDistant()` appellent actuellement deux fois
   `preparerBascule()` : c'est idempotent mais peut produire une sauvegarde redondante ;
 - l'asymétrie de `choisirDossier()` est sans risque identifié, car le main ferme les sessions
   et `appliquerCorpus()` réinitialise ensuite l'éditeur ;
 - avec plusieurs sessions, `fermerToutes()` peut en fermer certaines avant d'en rencontrer
   une bloquée : le commentaire promettant un contexte entièrement « intact » mérite d'être
   nuancé ou cet invariant renforcé.

 ### 5. XSS persistante possible depuis un corpus

 Le sanitiseur est bon lors de l’édition, mais les notes déjà stockées sont seulement converties en chaîne dans src/shared/entretien/notes.ts:49-65. Elles sont ensuite injectées via innerHTML/v-html dans
 Entretien.vue.

 Un corpus JSON local ou distant spécialement construit pourrait contenir par exemple un gestionnaire onerror. La situation est aggravée par :

 - absence de CSP dans src/renderer/index.html;
 - sandbox: false dans src/main/index.ts:214-218;
 - pont window.sonal très puissant.

 Correction :

 1. sanitiser systématiquement à la lecture;
 2. ajouter des tests avec des charges XSS;
 3. ajouter une CSP stricte;
 4. passer à sandbox: true si possible;
 5. bloquer will-navigate et window.open.

 ### 6. Tests de debug inclus dans la suite normale

 debug-connexion.e2e.ts absorbe des erreurs et peut produire un faux positif. debug-verrou.e2e.ts modifie directement l’état de la pile Nextcloud partagée.

 Correction : les sortir de test:e2e, les renommer en scripts de diagnostic ou créer un projet Playwright explicitement manuel.

 ────────────────────────────────────────────────────────────────────────────────

 P1 — Sécurité et fiabilité

 ### Frontière IPC trop permissive

 Plusieurs handlers acceptent des chemins ou identifiants directement fournis par le renderer :

 - demo:lireSource dans src/main/index.ts:1163-1165;
 - lecture de migration;
 - ouverture arbitraire de dossiers;
 - IDs utilisés dans CorpusStore.entretienFile().

 Si le renderer est compromis, le pont peut permettre des lectures ou écritures hors du corpus.

 Améliorations :

 - format fermé pour les IDs;
 - resolve() puis vérification d’appartenance à la racine;
 - validation de tous les arguments IPC;
 - suppression des API de démonstration dans les builds de production;
 - vérification du senderFrame.

 ### Validation runtime insuffisante

 Les fichiers JSON sont généralement traités avec :

 ```ts
   JSON.parse(...) as CorpusFichier
 ```

 Le TypeScript ne valide pas les données reçues au runtime. Un JSON de version 3 mais structurellement invalide peut provoquer une panne tardive ou une incohérence.

 Correction : introduire des schémas versionnés, par exemple avec Zod, Valibot ou des gardes manuelles, aux frontières :

 - disque;
 - WebDAV;
 - IPC;
 - imports utilisateurs.

 ### Coffre dégradé en base64

 Lorsque safeStorage est indisponible, le mot de passe est stocké avec un simple encodage base64 dans src/main/distant/coffre.ts:115-126.

 Il faudrait au minimum :

 - avertir clairement l’utilisateur;
 - écrire le fichier atomiquement avec des permissions 0600;
 - idéalement ne pas persister le secret sans coffre OS.

 ### Transport WebDAV

 L’application autorise une URL HTTP tout en envoyant une authentification Basic et ne configure pas de délai limite réseau.

 Correction :

 - imposer HTTPS, sauf exception explicite pour localhost;
 - utiliser AbortController avec des délais adaptés;
 - restaurer le miroir local après tout échec de publication.

 ### Transactions multi-fichiers

 Créer/importer un entretien écrit d’abord son fichier, puis corpus.json. Une interruption entre les deux peut produire un entretien orphelin. La suppression présente le risque inverse.

 Correction : ajouter une réconciliation au démarrage et, à terme, un petit journal transactionnel.

 ────────────────────────────────────────────────────────────────────────────────

 Maintenabilité et performances

 Modules trop volumineux

 Quelques fichiers concentrent trop de responsabilités :

 - src/renderer/components/Entretien.vue : environ 3 167 lignes;
 - src/renderer/composables/useEntretien.ts : environ 2 328 lignes;
 - src/renderer/components/Corpus.vue : environ 2 163 lignes;
 - src/main/index.ts : environ 1 287 lignes;
 - src/main/corpusStore.ts : environ 1 157 lignes.

 Découpage conseillé :

 - main/ipc/corpus.ts, distant.ts, media.ts, demo.ts, migration.ts;
 - composables useNotes, useAnonymisation, useRecherche, useJournal, useValeurs;
 - sous-composants pour les panneaux d’Entretien.vue;
 - services de persistance séparés des requêtes analytiques.

 Risque de blocage sur les gros corpus

 Le process principal utilise beaucoup d’I/O synchrones. Certaines actions relisent tous les entretiens plusieurs fois, notamment après les autosauvegardes.

 Correction :

 - regrouper usages, résumés et matrice en une seule passe;
 - ajouter un cache invalidé à l’écriture;
 - passer les grosses opérations en asynchrone;
 - créer un corpus synthétique de charge et des budgets de latence.

 ────────────────────────────────────────────────────────────────────────────────

 Industrialisation et qualité produit

 Il manque encore :

 - une CI GitLab;
 - ESLint et un formateur;
 - mesure de couverture;
 - typage explicite de test/**/*.ts;
 - chaîne de packaging Electron;
 - signature/installateur;
 - version Node contractuelle (engines, .nvmrc);
 - fichier LICENSE, changelog et politique de sécurité.

 La commande build produit actuellement le bundle Electron, mais pas une application distribuable.

 L’accessibilité reste également faible : modales sans sémantique ARIA, états dynamiques non annoncés, onglets uniquement visuels et bande audio non utilisable au clavier.

 ────────────────────────────────────────────────────────────────────────────────

 Feuille de route proposée

 Semaine 1 — Sécuriser les données

 1. Corriger recentsDistant.
 2. Remplacer l’identifiant distant par un hash.
 3. Rendre les noms de divergences uniques.
 4. Séparer lecture et ouverture pour édition.
 5. Exclure les tests debug-*.
 6. Ajouter les tests de régression correspondants.

 Semaines 2–3 — Durcissement

 1. Sanitisation à la lecture + CSP.
 2. Validation des IDs, chemins et payloads IPC.
 3. Schémas runtime des fichiers.
 4. HTTPS obligatoire et timeouts WebDAV.
 5. Écritures atomiques pour settings, coffre et manifeste.
 6. CI avec :

 ```text
   npm ci
   npm run typecheck
   npm run build
   npm test
   npx playwright test --project=local
 ```

 Les piles Nextcloud devraient rester dans un job d’intégration séparé.

 Ensuite — Mise à l’échelle et livraison

 1. Découper les cinq grands modules.
 2. Optimiser les scans de corpus.
 3. Ajouter couverture, lint et tests d’accessibilité.
 4. Mettre en place packaging, signature et test d’installation.
 5. Corriger la documentation périmée et le lien cassé dans docs/dev/README.md.

 Conclusion : la conception métier et les tests sont de vrais points forts. La priorité n’est pas d’ajouter de nouvelles fonctionnalités, mais de traiter les quelques risques de perte de données, de
 verrouillage et de sécurité avant toute diffusion auprès d’utilisateurs réels.