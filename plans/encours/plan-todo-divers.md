
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

 2. **Éviter les écritures dans la cible avant la fermeture de l'ancien contexte — réalisé.**

    **Statut : corrigé.**

    Les ouvertures, créations et migrations locales suivent désormais trois phases : préparation
    en mémoire sans effet sur la cible, fermeture de l'ancien contexte, puis écriture et bascule.
    `CorpusStore` prépare également en mémoire la migration des anciens formats, y compris les
    entretiens et les déplacements de formes d'onde. Le commit vérifie que les fichiers concernés
    n'ont pas changé depuis leur lecture. Si la fermeture est refusée, aucun dossier, manifeste,
    entretien ou PNG n'est créé ou modifié dans la cible.

    Les tests couvrent une création vers un dossier absent, une migration SonalPi1 vers un dossier
    non vide, l'ouverture d'un corpus v2, une cible invalide et une modification concurrente entre
    préparation et commit.

 3. **Rendre explicite l'échec de sortie de l'entretien — réalisé.**

    **Statut : corrigé.**

    Les sorties vers le corpus, l'accueil ou la table de données alimentent désormais
    explicitement la bannière globale lorsque la fermeture échoue. Le message indique que
    l'utilisateur reste dans l'entretien et conserve le détail utile de l'échec de publication
    ou de libération. La promesse reste rejetée pour que les appelants programmatiques ne
    prennent pas cet échec pour une réussite. Une nouvelle tentative réussie efface uniquement
    cette bannière si aucune erreur plus récente ne l'a remplacée.

    Les tests couvrent le nettoyage du message IPC, son contexte de fermeture et la préservation
    d'une erreur plus récente.


 4. **Compléter les tests aux coutures IPC et application — réalisé.**

    **Statut : corrigé.**

    Les opérations communes aux handlers IPC de création, d'ouverture, de migration et d'oubli
    sont maintenant isolées et testées avec leurs effets observables. Les refus conservent les
    références de l'ancien contexte, les récents et les cibles sur disque. L'oubli du compte actif
    respecte l'ordre fermeture, désactivation puis retrait du coffre, et ne retire rien si la
    fermeture échoue.

    La couture renderer couvre la rétrogradation immédiate, l'annulation du debounce, le refus de
    toute nouvelle écriture, la fermeture sans nouvel autosave et l'acquittement explicite. Le choix
    SRT précède désormais une fonction testée qui ne lance aucune IPC mutante en cas d'annulation.

    La fermeture de l'application est pilotée par une fonction testable : elle attend les autosaves,
    borne le nettoyage distant et poursuit la sortie en conservant les données locales de reprise en
    cas d'échec ou de délai dépassé. Un test Electron ferme aussi l'application immédiatement après
    une saisie et vérifie la persistance au lancement suivant.

 **Observations mineures :**

 - `ouvrirRecent()` puis `ouvrirCorpusDistant()` appellent actuellement deux fois
   `preparerBascule()` : c'est idempotent mais peut produire une sauvegarde redondante ;
 - l'asymétrie de `choisirDossier()` est sans risque identifié, car le main ferme les sessions
   et `appliquerCorpus()` réinitialise ensuite l'éditeur ;
 - avec plusieurs sessions, `fermerToutes()` peut en fermer certaines avant d'en rencontrer
   une bloquée : le commentaire promettant un contexte entièrement « intact » mérite d'être
   nuancé ou cet invariant renforcé.

 ### 5. XSS persistante possible depuis un corpus — réalisé

 **Statut : corrigé.**

 Les notes issues d'un corpus local ou distant sont désormais normalisées et sanitisées dès leur
 entrée dans l'état du renderer. Seuls le texte échappé, les passages `<mark>` et `<em>`, ainsi que
 les identifiants de liens valides peuvent atteindre les usages de `innerHTML` et `v-html`.

 La fenêtre Electron est également durcie :

 - CSP restrictive sans script inline ni `eval`, avec les seules exceptions nécessaires aux styles,
   aux médias locaux et au serveur de développement;
 - renderer exécuté avec `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` et
   `webSecurity: true`;
 - navigations de la page bloquées par `will-navigate`;
 - ouvertures de fenêtres refusées par `setWindowOpenHandler`.

 Les tests unitaires couvrent des charges `img/onerror`, `svg/onload`, `script`, URL `javascript:` et
 attributs malveillants. Un scénario Electron charge réellement une note hostile, vérifie son rendu
 inerte, puis contrôle le blocage de `window.open` et d'une navigation externe.

 ### 6. Tests de debug inclus dans la suite normale — réalisé

 **Statut : corrigé.**

 Les deux fichiers ont été déplacés dans `e2e/diagnostics/` et renommés avec le suffixe
 `.diagnostic.ts`. La configuration Playwright normale ne découvre que les fichiers `.e2e.ts` :
 `npm run test:e2e` ne peut donc plus lancer ces diagnostics ni modifier la pile partagée par leur
 intermédiaire.

 Une configuration séparée, `playwright.diagnostic.config.ts`, et la commande explicite
 `npm run diagnostic:e2e` permettent de les lancer manuellement, avec un seul worker. Le diagnostic
 de connexion rejette désormais réellement son test en cas d'échec au lieu de produire un faux
 positif. Le diagnostic de verrou est signalé comme destructif et ferme l'application même en cas
 d'erreur.

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

 ### Coffre dégradé en base64 — réalisé

 **Statut : corrigé.**

 Sans trousseau OS sécurisé, le mot de passe d’application Nextcloud n’est plus
 persisté. L’URL et le login restent enregistrés, tandis que le secret est conservé
 uniquement dans le process principal jusqu’à la fermeture de Sonal. Il est demandé
 à nouveau au premier accès suivant un redémarrage, puis réutilisé pendant la session.

 L’interface avertit l’utilisateur dans les écrans de connexion et de création. Elle
 recommande de conserver le mot de passe d’application dans KeePassXC ou de configurer
 GNOME Keyring/KWallet. Sous Linux, le backend Electron `basic_text` est explicitement
 considéré comme non sécurisé, même lorsque `safeStorage` peut chiffrer techniquement.

 Les anciennes valeurs `b64:` sont retirées du disque au démarrage. Elles sont gardées
 en mémoire pour la session ou rechiffrées immédiatement si un trousseau sécurisé est
 disponible. Le fichier `comptes-distant.json` est écrit par fichier temporaire puis
 renommage, avec synchronisation avant renommage et permissions `0600`.

 Validation réalisée : tests unitaires complets, typecheck et build réussis.

 ### Transport WebDAV — réalisé

 **Statut : corrigé.**

 Le transport WebDAV est maintenant borné et refuse d’exposer l’authentification Basic :

 - HTTPS est obligatoire avant tout appel réseau. HTTP reste accepté uniquement sur les hôtes
   de boucle locale exacts `localhost`, `127.0.0.1` et `::1`, pour les bancs locaux;
 - les redirections sont refusées afin que les identifiants ne puissent pas être transmis vers
   une autre origine;
 - toutes les requêtes passent par `AbortController`, avec 30 secondes pour les échanges JSON,
   inventaires et verrous, et 30 minutes pour les transferts de fichiers potentiellement lourds;
 - la sonde Nextcloud directe applique également HTTPS, le refus des redirections et un délai;
 - les transactions courtes restaurent l’état antérieur ou la version serveur confirmée après
   un échec. Si un PUT a réussi mais que sa réponse s’est perdue, son contenu est reconnu par
   relecture et l’opération est considérée comme publiée;
 - la suppression restaure aussi les fichiers locaux déplacés lorsque son `corpus.json` n’a pas
   été publié. Un MOVE dont la réponse s’est perdue est confirmé en vérifiant source et destination;
 - les entretiens ouverts conservent au contraire leur autosauvegarde locale et leur état sale en
   cas de panne. Une réponse perdue après commit est réconciliée sans créer de fausse divergence;
 - les transactions courtes sur entretien et les écritures en lot n’écrivent le miroir qu’après
   succès confirmé ou réconcilié.

 Les tests couvrent le refus de HTTP distant avant envoi du secret, l’exception locale, les délais,
 les redirections, la restauration des transactions et suppressions, ainsi que la perte de réponse
 après un commit serveur pour les définitions, sessions et écritures en lot.

 ### Transactions multi-fichiers — réalisé

 **Statut : corrigé.**

 Les créations, imports et suppressions locales sont maintenant décrits par un plan pur, puis
 exécutés sous un journal durable `.transaction-fichiers.json`. Le retrait du membership est le
 commit logique d’une suppression ; les fichiers sont ensuite déplacés sans écrasement vers la
 corbeille. Une opération interrompue est reprise de façon idempotente à l’ouverture. Si
 `corpus.json` ou un entretien ne correspond plus aux versions connues du journal, la reprise
 refuse de l’écraser et conserve les éléments nécessaires au diagnostic.

 En distant, création et import publient désormais le nouveau fichier entretien avec
 `If-None-Match: *` avant de publier son membership dans `corpus.json` avec `If-Match`. Le miroir
 n’est modifié qu’après confirmation des deux publications. Une réponse perdue est réconciliée par
 relecture ; un entretien dont le membership a certainement échoué est retiré conditionnellement.
 La suppression prépare également sa mutation sans toucher le miroir avant le commit serveur.

 À l’ouverture distante, une réconciliation sous verrou corpus puis entretien archive dans la
 corbeille les fichiers serveur absents du membership. Le contenu reste donc récupérable après une
 interruption entre le commit de `corpus.json` et le déplacement final.

 Les tests couvrent les reprises locales après chacune des frontières utiles, les conflits avec une
 modification extérieure, l’ordre de publication distant, création et import, les réponses perdues,
 la compensation après échec certain et l’archivage des orphelins.

 ────────────────────────────────────────────────────────────────────────────────

 Maintenabilité et performances

 Modules trop volumineux

 Quelques fichiers concentrent trop de responsabilités :

 - src/renderer/components/traiter/entretien/Entretien.vue : environ 3 167 lignes;
 - src/renderer/composables/useEntretien.ts : environ 2 328 lignes;
 - src/renderer/components/traiter/corpus/Corpus.vue : environ 2 163 lignes;
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