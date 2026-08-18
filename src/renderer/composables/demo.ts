import { ref, watch, computed, type Ref } from 'vue'
import { importerFichier } from '../import/sas'
import type { CorpusFichier, EntretienRef, Locuteur, MarqueurDemo, Variable } from '../../shared/format'
import type { ModeDemo, EtatDemo } from '../../shared/format'
export type { ModeDemo, EtatDemo }
import type { Annotation } from '../../shared/entretien/annotation'

/**
 * Scope DÉMO « Mini Corpus Test » : construit des corpus de test depuis les
 * sources bundled `CorpusTest/` (SRT + audio) dans des DOSSIERS CHOISIS, puis
 * les ouvre. Ce n'est pas un 3ᵉ type de stockage : le builder réutilise le VRAI
 * pipeline d'import (`importerFichier` → `corpus:importer` + `corpus:assignerAudio`)
 * → zéro dérive de format, la démo est produite par le même code qu'un corpus
 * utilisateur.
 *
 * Deux modes, chacun son PROPRE corpus (J7) — le dossier du corpus de chaque
 *  mode est choisi directement dans la modale (un dossier = un corpus, à la
 *  SonalPi) :
 *  - `'autonomie'` : les 4 entretiens importés + audios, codebook par défaut ;
 *  - `'pas-a-pas'` : corpus amorcé VIDE, onglet « Pas à pas » activé — les
 *    étapes remplissent le corpus une à une (via `importerSource`), guidées par
 *    un spotlight global (projecteur + bulle, plan §7 A / §14).
 * Les deux corpus ne se mélangent JAMAIS (gardes de la modale : pas déjà un
 * corpus, pas le dossier de l'autre mode, pas les sources) ; seules les SOURCES
 * sont partagées (copiées une seule fois dans `racineSources`). L'identité d'un
 * corpus de test vit dans `corpus.json: { demo: { mode, racineSources, validees
 * } }` (absent = corpus normal — la démo n'y touche jamais, gardien
 * plan-tutoriel §12.3).
 *
 * Dépendances injectées (patron `useCorpus({ flush })`) : évite le cycle
 * (`appliquerCorpus` est défini dans `creerSonal`, qui crée ce scope).
 */

/** Clé source → titre de l'entretien importé (cf. plan-tutoriel §10). */
const SOURCES = ['E1', 'E2', 'E3', 'E4'] as const
const TITRES: Record<string, string> = {
  E1: 'Fatima, du quartier à la coordination',
  E2: "Sylvie, l'annonce dans le journal",
  E3: 'Marc, du four à la craie',
  E4: "Thomas & Yanis, l'aide à deux voix",
}

/** Une étape du pas-à-pas : titre dans la liste, prédicat de validation sur le
 *  modèle, cible `data-tour` (peut dépendre de l'état — ex. « crayon » tant que
 *  aucun entretien ouvert, puis « onglet thèmes »), guide affiché dans la bulle.
 *  `panneau` : la consigne s'affiche en PANNEAU sous les onglets de l'entretien
 *  plutôt qu'en bulle flottante (ne cache pas le texte). Pas de bouton
 *  « action » : l'utilisateur fait le geste LUI-MÊME (retour utilisateur —
 *  ex. pour la lecture : clic sur ▶ ou double-espace). `retest` : message
 *  affiché quand l'étape, DÉJÀ validée, est rouverte (re-test) — il complète
 *  « … l'étape a été réalisée, tu peux toujours … » (les trois petits points
 *  changent donc suivant les étapes). */
export interface EtapePasAPas {
  id: string
  titre: string
  cible: () => string | null
  fait: () => boolean
  texte: () => string
  panneau?: boolean
  retest?: () => string
}

export interface DepsDemo {
  appliquerCorpus: (c: CorpusFichier, dir?: string) => Promise<void>
  majDossierCourant: () => Promise<void>
  rafraichirRecents: () => Promise<void>
  /** Retour à l'écran Corpus (ferme l'entretien, sauvegardé) — appelé APRÈS
   *  validation d'une étape : on revient à la liste « Pas à pas » pour lancer
   *  la suivante (sans l'enchaîner automatiquement). */
  retourCorpus: () => Promise<void>
  vue: Ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>
  // --- pour les prédicats d'étapes (observation du modèle réactif) ---
  membership: Ref<Record<string, EntretienRef>>
  entretien: { annotations: Annotation[] } // reactive (useEntretien)
  locuteurs: Ref<Locuteur[]>
  meta: { valeursGen: Record<string, string> } // reactive (useEntretien)
  ouvertId: Ref<string | null>
  variables: Ref<Variable[]> // définitions EAV du corpus (useCorpus)
  /** Vrai dès que le TEXTE de l'entretien ouvert a été édité depuis son
   *  ouverture (useEntretien — observé par l'étape « Écouter et corriger »). */
  texteModifie: Ref<boolean>
}

export function utiliserDemo(deps: DepsDemo) {
  /** Onglet « Pas à pas » monté ? (uniquement en mode 'pas-a-pas'). */
  const pasAPas = ref(false)
  /** Build en cours (désactive les cartes pendant la préparation). */
  const enPreparation = ref(false)
  /** J7 — les dossiers démo mémorisés en session PUIS PERSISTÉS (settings.json,
   *  `demo:memoriser`) : la racine des SOURCES (copiées une seule fois, partagées
   *  entre les deux modes) et le DOSSIER du corpus de test de CHAQUE mode, choisi
   *  directement par l'utilisateur dans la modale (un dossier = un corpus, à la
   *  SonalPi). Les deux corpus sont INDÉPENDANTS — jamais le même dossier (gardes
   *  de la modale). Les refs `*Presentes` = présence réelle sur disque (demo:etat) :
   *  l'Accueil fait « un clic » quand les deux dossiers du mode existent, la
   *  modale adapte ses questions (sources déjà en place → question sautée). */
  const racineSources = ref<string | null>(null)
  const sourcesPresentes = ref(false)
  const corpusPasAPas = ref<string | null>(null)
  const corpusAutonomie = ref<string | null>(null)
  const corpusPasAPasPresent = ref(false)
  const corpusAutonomiePresent = ref(false)

  /** Importe UN entretien source (SRT + audio) via le vrai pipeline, depuis la
   *  racine des sources matérialisées. Réutilisé par le mode autonomie (boucle)
   *  → un seul mécanisme. L'audio y est RÉFÉRENCÉ, jamais copié (§4). Retourne
   *  l'id créé. */
  async function importerSource(k: string, racine: string): Promise<string> {
    const { nom, contenu } = await window.sonal.demo.lireSource(racine, `srt/${k}.srt`)
    const r = importerFichier(nom, contenu, (html) =>
      new DOMParser().parseFromString(html, 'text/html'),
    )
    const imp = await window.sonal.corpus.importer(TITRES[k] ?? k, r.payload, r.codebook, r.variables)
    const audio = await window.sonal.demo.cheminAudio(racine, `audio/${k}.mp3`)
    await window.sonal.corpus.assignerAudio(imp.id, audio)
    return imp.id
  }

  // --- Le pas-à-pas : étapes, étape courante, validation ---
  // 4 étapes auto-validées (charger → corriger → coder → saisir une variable).
  // Les cibles `data-tour` peuvent dépendre de l'état (ex. « crayon » tant qu'aucun
  // entretien ouvert, puis « lecture »/« onglet thèmes ») — le spotlight recalcule
  // en live.
  const etapes: EtapePasAPas[] = [
    {
      id: 'charger',
      titre: 'Charger un entretien',
      // J4 : spotlight sur le VRAI bouton « + Ajouter un entretien » (data-tour
      // posé en J2) — le geste réel passe par la vraie modale à deux zones ;
      // plus de bulle centrée déconnectée de l'UI (§7.4).
      // Parcours séquentiel guidé : la cible suit l'état réel par observation du
      // DOM (aucun partage d'état avec la modale) —
      //   1. sur le bouton « + Ajouter un entretien » ;
      //   2. la modale ouverte → la zone FICHIER D'ENTRETIEN (SRT) ;
      //   3. texte chargé (présence de .zone-fichier) → la zone FICHIER SON ;
      //   4. audio chargé → le bouton « Valider » ;
      //   5. l'étape se coche quand l'entretien est créé (membership non vide).
      cible: () => {
        if (!document.querySelector('.modale-ajout')) return '[data-tour="ajouter-entretien"]'
        if (!document.querySelector('.zone-texte .zone-fichier')) return '[data-tour="zone-texte"]'
        if (!document.querySelector('.zone-audio .zone-fichier')) return '[data-tour="zone-audio"]'
        return '[data-tour="valider"]'
      },
      fait: () => Object.keys(deps.membership.value).length > 0,
      texte: () => {
        if (!document.querySelector('.modale-ajout')) {
          return racineSources.value
            ? `Tes sources sont dans « ${racineSources.value} ». Clique sur ce bouton : la petite fenêtre s'ouvre, et je te guide pour choisir tes fichiers.`
            : "Chargeons un premier entretien (Fatima) — son SRT et son audio sont fournis. Clique sur ce bouton."
        }
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return "Dans cette zone, choisis le fichier d'entretien : clique, puis sélectionne srt/E1.srt (l'entretien de Fatima)."
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return "Bien ! Maintenant le fichier son : clique sur cette zone et sélectionne audio/E1.mp3."
        }
        return "Tout est prêt : clique sur « Valider » pour créer l'entretien."
      },
      retest: () => "revoir l'entretien importé (ses fichiers, son audio)",
    },
    {
      id: 'corriger',
      titre: 'Écouter et corriger la transcription',
      // Depuis la liste (écran Corpus) : guider vers le crayon de la carte.
      // Dans l'entretien, la consigne devient un PANNEAU sous les onglets
      // (panneau: true) — pas de bulle flottante ni de trou qui cacheraient le
      // texte pendant la lecture (retour utilisateur). PAS de bouton
      // « Lancer la lecture » : l'utilisateur fait le geste lui-même, clic sur
      // ▶ du lecteur OU double-espace dans le texte (idéalement les deux).
      // L'étape se coche dès que le TEXTE est réellement édité (texteModifie).
      cible: () => (deps.vue.value === 'entretien' ? null : '[data-tour="crayon-entretien"]'),
      fait: () => deps.texteModifie.value,
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Lance la lecture — clique sur ▶ dans le lecteur, ou tape DEUX FOIS sur la touche Espace dans le texte (les deux marchent, idéalement les deux) — puis suis le texte à l'oreille. Corrige dans l'éditeur les imperfections de l'ASR, ex. le « ? ? » de la 1re ligne (Maison des Habitants)."
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "re-écouter l'audio et retoucher la transcription",
      panneau: true,
    },
    {
      id: 'renommer',
      titre: 'Renommer les locuteurs',
      // Depuis la liste (écran Corpus) : guider vers le crayon de la carte.
      // Dans l'entretien, la consigne devient un PANNEAU en bas de la colonne
      // (panneau: true) — la bulle flottante, positionnée sous le 1er champ,
      // recouvrait le champ du 2ᵉ locuteur (retour utilisateur). L'onglet
      // Locuteurs étant le DÉFAUT de l'entretien, les champs sont visibles et
      // la consigne s'affiche sous le panneau. L'étape se coche quand plus
      // aucun locuteur de l'entretien OUVERT ne s'appelle « Speaker N » —
      // garde : à la réouverture (aucun entretien ouvert), locuteurs vide ne
      // doit pas valider la chose (`[].every()` = true) ; l'historique
      // mémorisé dans le marqueur, lui, reste restauré.
      cible: () => (deps.vue.value === 'entretien' ? null : '[data-tour="crayon-entretien"]'),
      panneau: true,
      fait: () =>
        !!deps.ouvertId.value &&
        deps.locuteurs.value.length > 0 &&
        deps.locuteurs.value.every((l) => !l.nom.startsWith('Speaker')),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Renomme les locuteurs dans ce panneau : Speaker 0 → « Fatima », Speaker 1 → « Enquêteur·rice » — clique dans le nom, saisis, puis clique ailleurs (ou Entrée)."
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "re-renommer les locuteurs (les noms sont déjà corrigés)",
    },
    {
      id: 'coder',
      titre: 'Créer une thématique et annoter',
      // Vue-CONScient : la liste des étapes vit sur l'écran Corpus, mais le
      // geste se fait dans l'Entretien. Depuis l'étape 1 (finie → retour au
      // Corpus), on guide d'abord vers le crayon de la carte ; dès que
      // l'entretien est visible, le spotlight (recalculé en live) bascule sur
      // l'onglet Thématique.
      cible: () =>
        deps.vue.value === 'entretien'
          ? '[data-tour="onglet-themes"]'
          : '[data-tour="crayon-entretien"]',
      fait: () => deps.entretien.annotations.some((a) => a.type === 'codage'),
      texte: () =>
        deps.vue.value === 'entretien'
          ? 'Sélectionne un passage du texte, puis clique un thème pour le coder (✏️ pour en créer un).'
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "ajouter ou retirer des annotations",
    },
    {
      id: 'variable',
      titre: 'Saisir une variable',
      cible: () =>
        deps.vue.value === 'entretien'
          ? '[data-tour="onglet-donnees"]'
          : '[data-tour="crayon-entretien"]',
      fait: () =>
        Object.keys(deps.meta.valeursGen).length > 0 ||
        deps.locuteurs.value.some((l) => Object.keys(l.valeursLoc).length > 0),
      texte: () =>
        deps.vue.value === 'entretien'
          ? 'Remplis une valeur (ex. la Ville de Fatima, en texte libre).'
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "modifier ou compléter les valeurs saisies",
    },
  ]

  /** Id de l'étape couramment guidée (spotlight actif) ; null = inactif. */
  const etapeCouranteId = ref<string | null>(null)
  /** Ids des étapes déjà validées (cochées dans la liste). */
  const validees = ref<Set<string>>(new Set())
  /** Message « re-test » : quand une étape DÉJÀ validée est rouverte (l'entretien
   *  reste ouvert), on l'annonce — { titre, suite } où `suite` complète
   *  « … tu peux toujours … » (le contenu change donc suivant les étapes).
   *  Affiché dans l'entretien ; un bouton propose de revenir à la liste. */
  const retestInfo = ref<{ titre: string; suite: string } | null>(null)

  // Le message re-test suit la vue : quitter l'entretien l'efface (sinon il
  // ressortirait de façon périmée à l'ouverture suivante). Et à l'OUVERTURE de
  // l'entretien, si une étape DÉJÀ validée est active, c'est un RE-TEST — on
  // montre le message SANS attendre le prédicat (nécessaire pour « Écouter et
  // corriger » : son prédicat, `texteModifie`, repart à FAUX à chaque ouverture,
  // donc le watch de validation ne peut pas le détecter — contrairement à
  // « Renommer » dont le prédicat est déjà vrai à l'ouverture).
  watch(deps.vue, (v) => {
    if (v !== 'entretien') {
      retestInfo.value = null
      return
    }
    const e = etapes.find((x) => x.id === etapeCouranteId.value)
    if (e && e.retest && validees.value.has(e.id)) {
      etapeCouranteId.value = null
      retestInfo.value = { titre: e.titre, suite: e.retest() }
    }
  })

  const etapeCourante = computed(() => etapes.find((e) => e.id === etapeCouranteId.value) ?? null)

  /** J6 — écrit le MARQUEUR démo du corpus courant (`corpus.json: { demo }`) :
   *  mode + racine des sources + étapes validées. C'est l'identité du corpus de
   *  test, et l'historique du pas-à-pas voyage avec lui (restauré à la
   *  réouverture par « Récents » / démarrage / picker). */
  async function ecrireMarqueur(mode: ModeDemo): Promise<void> {
    if (!racineSources.value) return
    await window.sonal.corpus.marquerDemo({
      mode,
      racineSources: racineSources.value,
      validees: [...validees.value],
    })
  }

  /** Re-dérive les étapes validées depuis le MODÈLE (prédicats `fait()`) : à la
   *  réouverture d'un corpus pas-à-pas, le watch de validation ne s'est pas
   *  déclenché (pas de changement) — on évalue une fois toutes les étapes pour
   *  retrouver l'historique réel (ex. « charger » re-cochée si un entretien
   *  existe déjà). Monotone : on ne décoche jamais (une étape faite le reste). */
  function revaliderEtapes() {
    const v = new Set(validees.value)
    for (const e of etapes) if (e.fait()) v.add(e.id)
    if (v.size !== validees.value.size) {
      validees.value = v
      void ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
    }
  }

  /** Active une étape (clic dans la liste) : démarre son spotlight. */
  function activer(id: string) {
    retestInfo.value = null // une activation neuve efface l'éventuel message re-test
    etapeCouranteId.value = id
  }

  /** Étape suivante (depuis la bulle). */
  function suivante() {
    if (!etapeCourante.value) return
    const i = etapes.findIndex((e) => e.id === etapeCourante.value!.id)
    const s = etapes[i + 1]
    if (s) etapeCouranteId.value = s.id
    else etapeCouranteId.value = null
  }

  // Validation automatique : quand l'étape courante devient `fait()`, on la
  // coche, mais on N'ENCHAÎNE PAS sur l'étape suivante — l'utilisateur clique
  // l'étape suivante dans la liste pour la lancer (retour utilisateur :
  // l'enchaînement automatique surprenait). On REVIENT à la liste « Pas à pas »
  // (écran Corpus) pour qu'il la voie (retour utilisateur : après validation,
  // on restait dans l'entretien, la liste était hors d'atteinte). L'HISTORIQUE
  // est mémorisé à chaque validation (problème utilisateur : la réouverture du
  // corpus perdait les étapes déjà faites).
  watch(
    () => etapeCourante.value?.fait() ?? false,
    async (faite) => {
      if (!faite || !etapeCourante.value) return
      const id = etapeCourante.value.id
      if (validees.value.has(id)) {
        // DÉJÀ validée — l'utilisateur rouvre l'entretien pour RE-TESTER (ex.
        // locuteurs déjà renommés) : l'étape ne « change » pas, donc pas de
        // retour à la liste (sinon l'entretien s'ouvrait et se refermait
        // aussitôt). On éteint seulement le guidage, on LAISSE l'entretien
        // ouvert, et on pose le petit message « étape déjà réalisée » proposant
        // de revenir à la liste.
        const e = etapeCourante.value
        etapeCouranteId.value = null
        if (e?.retest) retestInfo.value = { titre: e.titre, suite: e.retest() }
        return
      }
      validees.value = new Set(validees.value).add(id)
      etapeCouranteId.value = null // guidage arrêté ; l'utilisateur relance la suite
      await ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
      await deps.retourCorpus()
    },
  )

  /** Prépare le corpus de test du mode demandé puis l'ouvre. J7 — chaque mode a
   *  son PROPRE dossier de corpus, choisi directement par l'utilisateur dans la
   *  modale (un dossier = un corpus) ; les deux ne se mélangent jamais ; seules
   *  les SOURCES sont partagées (copiées une fois).
   *  1. Copier les sources bundled UNE FOIS dans racineSources (idempotent) ;
   *  2. Ouvrir/amorcer le dossier du corpus de CE mode (ouvrirDossier) ;
   *  3. 'autonomie' : peupler avec les 4 entretiens + audios (référencés) ;
   *  4. Poser le marqueur démo (`corpus.json`) — identité + mode + historique ;
   *  5. Appliquer le corpus au modèle + atterrissage en vue Corpus. */
  async function preparer(
    mode: ModeDemo,
    opts?: { racineSources?: string; dossierCorpus?: string },
  ): Promise<void> {
    if (enPreparation.value) return
    enPreparation.value = true
    try {
      if (opts?.racineSources) racineSources.value = opts.racineSources
      // Le dossier du corpus de CE mode : choisi dans la modale, ou mémorisé
      // (re-préparation « un clic »). Chaque mode a son dossier, indépendant.
      const dossierCorpus =
        opts?.dossierCorpus ?? (mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value)
      if (!racineSources.value || !dossierCorpus) return // ne devrait pas arriver (modale)
      if (mode === 'pas-a-pas') corpusPasAPas.value = dossierCorpus
      else corpusAutonomie.value = dossierCorpus

      // 1. LA seule copie du flow de démo (~13 Mo) — idempotente par complétude.
      await window.sonal.demo.copierSources(racineSources.value)
      // 2. Ouvrir (amorcer si neuf) le dossier du corpus de CE mode.
      const res = await window.sonal.corpus.ouvrirDossier(dossierCorpus)
      if (!res) return
      await deps.majDossierCourant()
      await deps.rafraichirRecents()

      // 3. Mode autonomie : peupler avec les 4 entretiens + audios.
      //    Idempotent : on ne ré-importe PAS un entretien dont le TITRE source
      //    existe déjà — sinon la re-préparation dupliquerait E1..E4.
      if (mode === 'autonomie') {
        const titresExistants = new Set(Object.values(res.corpus.membership).map((m) => m.titre))
        for (const k of SOURCES) {
          if (titresExistants.has(TITRES[k] ?? k)) continue
          await importerSource(k, racineSources.value)
          titresExistants.add(TITRES[k] ?? k)
        }
      }

      // 4. Marqueur démo : identité du corpus de test (mode + sources +
      //    historique). On CONSERVE l'historique existant du même mode — une
      //    re-préparation « un clic » ne doit pas effacer les étapes faites.
      const histo = res.corpus.demo
      const historique = histo?.mode === mode ? (histo.validees ?? []) : []
      await window.sonal.corpus.marquerDemo({
        mode,
        racineSources: racineSources.value,
        validees: historique,
      })

      // 5. Appliquer le corpus (marqué) au modèle + atterrissage.
      //    `appliquerCorpus(c, dir)` → `raccrocherModeCorpus(c.demo, dir)`
      //    restaure le mode (panneau « Pas à pas ») et l'historique des étapes.
      const c = await window.sonal.corpus.ouvrir()
      await deps.appliquerCorpus(c, dossierCorpus)
      deps.vue.value = 'corpus'
      if (mode === 'pas-a-pas') {
        // Pré-crée une variable « Ville » (portée locuteur, saisie libre) pour
        // l'étape « Saisir une variable » — UNE fois seulement (ajouterVariable
        // ne déduplique pas par libellé).
        if (!deps.variables.value.some((v) => v.lib === 'Ville')) {
          await window.sonal.corpus.ajouterVariable('Ville', 'locuteur')
          await deps.appliquerCorpus(await window.sonal.corpus.ouvrir(), dossierCorpus)
        }
        etapeCouranteId.value = etapes[0].id // démarre la 1re étape (les suivantes se lancent au clic)
      }
      // Mémoire démo PERSISTÉE (settings.json) : sources + dossier de CE mode
      // (l'autre mode, s'il existe, est préservé). Les cartes de l'Accueil
      // restent « un clic » quand les dossiers existent ; la modale saute les
      // questions déjà répondues (ex. « où importer les sources »).
      await window.sonal.demo.memoriser({
        racineSources: racineSources.value,
        corpusPasAPas: mode === 'pas-a-pas' ? dossierCorpus : (corpusPasAPas.value ?? undefined),
        corpusAutonomie: mode === 'autonomie' ? dossierCorpus : (corpusAutonomie.value ?? undefined),
      })
    } finally {
      enPreparation.value = false
    }
  }

  /** J7 — raccroche la mémoire démo PERSISTÉE (settings.json) : hydrate les
   *  dossiers (sources + corpus de chaque mode) et leur présence réelle sur
   *  disque. L'Accueil décide ensuite : « un clic » si les deux dossiers du mode
   *  existent, modale adaptative sinon (les questions déjà répondues sont sautées
   *  — ex. « où importer les sources » si elles sont déjà en place). */
  async function raccrocherEtatDemo(): Promise<boolean> {
    const etat = await window.sonal.demo.etat()
    if (!etat) return false
    racineSources.value = etat.racineSources
    sourcesPresentes.value = etat.sourcesExist
    corpusPasAPas.value = etat.corpusPasAPas ?? null
    corpusAutonomie.value = etat.corpusAutonomie ?? null
    corpusPasAPasPresent.value = etat.corpusPasAPasExist
    corpusAutonomiePresent.value = etat.corpusAutonomieExist
    return true
  }

  /** « Un clic » possible pour un mode : sources ET corpus de CE mode connus
   *  (mémorisés) et présents sur disque → re-préparation directe, sans modale. */
  function pretUnClic(mode: ModeDemo): boolean {
    const corpus = mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value
    const present =
      mode === 'pas-a-pas' ? corpusPasAPasPresent.value : corpusAutonomiePresent.value
    return !!racineSources.value && sourcesPresentes.value && !!corpus && present
  }

  /** J6 — restaure le MODE démo à l'OUVERTURE d'un corpus, depuis le MARQUEUR du
   *  corpus (`corpus.json: { demo }`) : le marqueur voyage avec le corpus (plus
   *  robuste qu'une comparaison de chemins settings). Si c'est un corpus de test
   *  'pas-a-pas', on hydrate `racineSources` (textes des étapes, defaultPath des
   *  dialogues) + on remonte le panneau + on restaure l'historique des étapes
   *  validées. Pour tout AUTRE corpus (marqueur absent ou mode 'autonomie'), on
   *  éteint le panneau (sinon il resterait monté après un changement de corpus). */
  async function raccrocherModeCorpus(
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ): Promise<void> {
    if (!marqueur || !dir) {
      pasAPas.value = false
      return
    }
    racineSources.value = marqueur.racineSources
    pasAPas.value = marqueur.mode === 'pas-a-pas'
    if (pasAPas.value) {
      // Historique restauré depuis le marqueur + re-dérivé du modèle (monotone —
      // on ne décoche pas). Le spotlight reste inactif (aucune étape forcée) :
      // l'utilisateur clique une étape pour reprendre le guidage.
      validees.value = new Set(marqueur.validees ?? [])
      revaliderEtapes()
    }
  }

  return {
    pasAPas,
    enPreparation,
    racineSources,
    sourcesPresentes,
    corpusPasAPas,
    corpusAutonomie,
    corpusPasAPasPresent,
    corpusAutonomiePresent,
    pretUnClic,
    raccrocherEtatDemo,
    raccrocherModeCorpus,
    preparer,
    importerSource,
    etapes,
    etapeCouranteId,
    etapeCourante,
    validees,
    retestInfo,
    activer,
    suivante,
  }
}
