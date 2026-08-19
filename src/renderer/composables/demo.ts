import { ref, watch, computed, type Ref } from 'vue'
import { importerFichier } from '../import/sas'
import type { CorpusFichier, EntretienRef, Locuteur, MarqueurDemo, Variable } from '../../shared/format'
import type { ModeDemo, EtatDemo } from '../../shared/format'
export type { ModeDemo, EtatDemo }
import type { Annotation } from '../../shared/entretien/annotation'

/**
 * Scope DÉMO « Mini Corpus Test » : construit puis ouvre des corpus de test,
 * à partir des sources bundled `CorpusTest/` (SRT + audio), dans des dossiers
 * choisis par l'utilisateur.
 * Le builder réutilise le vrai pipeline d'import,
 * soit `importerFichier` puis `corpus:importer` + `corpus:assignerAudio` :
 * la démo est produite par le même code qu'un corpus utilisateur.
 *
 * Deux modes, chacun son propre corpus (choisi dans la modale) :
 *  - `'autonomie'` : les 4 entretiens importés + audios ;
 *  - `'pas-a-pas'` : corpus amorcé vide, rempli étape par étape,
 *    via `importerSource`, guidé par un spotlight global.
 * Seules les sources sont partagées (copiées une seule fois).
 * L'identité d'un corpus de test vit dans `corpus.json` :
 * `{ demo: { mode, racineSources, validees } }` ; absent = corpus normal,
 * la démo n'y touche jamais.
 *
 * Dépendances injectées (patron `useCorpus({ flush })`),
 * pour éviter le cycle : `appliquerCorpus` est défini dans `creerSonal`.
 */

/** Clé source → titre de l'entretien importé (CorpusTest/). */
const SOURCES = ['E1', 'E2', 'E3', 'E4'] as const
const TITRES: Record<string, string> = {
  E1: 'Fatima, du quartier à la coordination',
  E2: "Sylvie, l'annonce dans le journal",
  E3: 'Marc, du four à la craie',
  E4: "Thomas & Yanis, l'aide à deux voix",
}

/** Une étape du pas-à-pas : titre dans la liste, prédicat de validation du modèle,
 *  cible `data-tour` (qui peut dépendre de l'état courant), guide dans la bulle.
 *  `panneau` : la consigne s'affiche en panneau sous les onglets de l'entretien,
 *  plutôt qu'en bulle flottante.
 *  `retest` : message affiché quand une étape déjà validée est rouverte. */
export interface EtapePasAPas {
  id: string
  titre: string
  cible: () => string | null
  fait: () => boolean
  texte: () => string
  panneau?: boolean
  retest?: () => string
  /** Le message « déjà réalisée » s'affiche dans la vue CORPUS (l'action de
   *  l'étape vit dans le corpus, ex. « Charger un entretien ») — pas dans
   *  l'entretien comme les étapes d'édition. */
  retestCorpus?: boolean
}

export interface DepsDemo {
  appliquerCorpus: (c: CorpusFichier, dir?: string) => Promise<void>
  majDossierCourant: () => Promise<void>
  rafraichirRecents: () => Promise<void>
  /** Retour à l'écran Corpus (ferme l'entretien, sauvegardé),
   *  appelé après validation d'une étape :
   *  on revient à la liste « Pas à pas » pour lancer la suivante,
   *  sans l'enchaîner automatiquement. */
  retourCorpus: () => Promise<void>
  vue: Ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>
  // --- pour les prédicats d'étapes (observation du modèle réactif) ---
  membership: Ref<Record<string, EntretienRef>>
  entretien: { annotations: Annotation[] } // reactive (useEntretien)
  locuteurs: Ref<Locuteur[]>
  meta: { valeursGen: Record<string, string> } // reactive (useEntretien)
  ouvertId: Ref<string | null>
  /** Onglet actif de l'entretien (useEntretien) : les étapes qui vivent DANS un
   *  panneau guident d'abord vers l'onglet à ouvrir, puis vers l'action (le
   *  spotlight suit l'état). */
  ongletDroite: Ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal'>
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
  /** Les dossiers démo mémorisés en session puis persistés (`settings.json`) :
   *  la racine des sources (copiées une seule fois et partagées),
   *  plus le dossier du corpus de test de chaque mode.
   *  Les refs `*Presentes` signalent la présence réelle sur disque :
   *  l'Accueil fait « un clic » quand tout est en place,
   *  sinon la modale adapte ses questions. */
  const racineSources = ref<string | null>(null)
  const sourcesPresentes = ref(false)
  const corpusPasAPas = ref<string | null>(null)
  const corpusAutonomie = ref<string | null>(null)
  const corpusPasAPasPresent = ref(false)
  const corpusAutonomiePresent = ref(false)

  /** Importe un entretien source (SRT + audio) via le vrai pipeline,
   *  depuis la racine des sources matérialisées ;
   *  l'audio y est référencé, jamais copié.
   *  Un seul mécanisme pour l'autonomie (boucle) et le pas-à-pas (one-click) ;
   *  retourne l'id créé. */
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
      // Spotlight sur le VRAI bouton « + Ajouter un entretien » : l'utilisateur
      // passe par la vraie modale à deux zones. La cible suit l'état du DOM de la
      // modale (zone fichier → zone son → Valider) pour guider pas à pas.
      cible: () => {
        if (!document.querySelector('.modale-ajout')) return '[data-tour="ajouter-entretien"]'
        if (!document.querySelector('.zone-texte .zone-fichier')) return '[data-tour="zone-texte"]'
        if (!document.querySelector('.zone-audio .zone-fichier')) return '[data-tour="zone-audio"]'
        return '[data-tour="valider"]'
      },
      fait: () => Object.keys(deps.membership.value).length > 0,
      texte: () => {
        if (!document.querySelector('.modale-ajout')) {
          return `Vos sources sont dans « ${racineSources.value} ». Cliquez sur ce bouton et suivez le guide.`
        }
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return "Dans cette zone, choisissez le fichier de sous-titres : cliquez, puis sélectionnez srt/E1.srt"
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return "Bien ! Maintenant le fichier media : cliquez sur cette zone et sélectionnez audio/E1.mp3."
        }
        return "Tout est prêt : cliquze sur « Valider » pour créer l'entretien."
      },
      retest: () => "charger d'autres entretiens",
      // L'action de cette étape vit dans le CORPUS (ajouter un entretien) :
      // le message « déjà réalisée » s'y affiche, pas dans l'éditeur.
      retestCorpus: true,
    },
    {
      id: 'corriger',
      titre: 'Écouter et corriger la transcription',
      // Depuis la liste : guide vers le crayon de la carte ; dans l'entretien,
      // la consigne devient un panneau sous les onglets (pas de bulle qui
      // cacherait le texte). L'utilisateur lance la lecture lui-même (▶ du
      // lecteur ou double-espace). L'étape se coche dès que le texte est édité.
      cible: () => (deps.vue.value === 'entretien' ? null : '[data-tour="crayon-entretien"]'),
      fait: () => deps.texteModifie.value,
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Lancez la lecture — cliquez sur ▶ dans le lecteur, ou tapez DEUX FOIS sur la touche Espace pour lancer, puis pour arrêter l'audio (le raccourci clavier vous fera gagner du temps). Corrigez dans l'éditeur les imperfections de la transcription, ex. le « ? ? » de la 1re ligne. Nous vous conseillons de rédiger un guide de transcription où vous pouvez consigner tout vos choix : par exemple, est-ce que je garde les négations quand le locuteur ne le dit pas, comment j'indique quand je coupe un passage..."
          : "Ouvrez cet entretien en cliquant sur le crayon",
      retest: () => "continuer à écouter l'audio et corriger la transcription. Mais bon, il y a ici peu d'erreurs contrairement à certains cas d'enregistements réels. L'étape de correction est essentielle pour la qualité de l'analyse. Profitez en pour prendre des notes sur des idées qui vous viennent et pour pseudonymiser si vous pensez ensuite diffuser vos entretiens. Une bonne pratique est de rédiger un guide de transcription où vous pouvez consigner tout vos choix",
      panneau: true,
    },
    {
      id: 'renommer',
      titre: 'Renommer les locuteurs',
      // Guide vers le crayon de la carte depuis la liste ; dans l'entretien,
      // la consigne devient un panneau (la bulle recouvrait le champ d'un
      // locuteur). L'étape se coche quand plus aucun locuteur de l'entretien
      // ouvert ne s'appelle « Speaker N ».
      cible: () => (deps.vue.value === 'entretien' ? null : '[data-tour="crayon-entretien"]'),
      panneau: true,
      fait: () =>
        !!deps.ouvertId.value &&
        deps.locuteurs.value.length > 0 &&
        deps.locuteurs.value.every((l) => !l.nom.startsWith('Speaker')),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Locuteurs (icône locuteur), puis renomme dans ce panneau : Speaker 0 → « Fatima », Speaker 1 → « Enquêteur·rice » — clique dans le nom, saisis, puis clique ailleurs (ou Entrée)."
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "re-renommer les locuteurs (les noms sont déjà corrigés)",
    },
    {
      id: 'coder',
      titre: 'Créer une thématique et annoter',
      // Depuis la liste, on guide vers le crayon de la carte ; dans
      // l'entretien, le spotlight pointe d'abord l'onglet Thématique, puis se
      // déplace sur le panneau des thèmes une fois l'onglet ouvert (la bulle ne
      // bloque plus le clic sur un thème).
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="crayon-entretien"]'
        return deps.ongletDroite.value === 'themes'
          ? '.panneau.themes-coder'
          : '[data-tour="onglet-themes"]'
      },
      fait: () => deps.entretien.annotations.some((a) => a.type === 'codage'),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Thématiques (icône thème), sélectionne un passage du texte, puis clique un thème pour le coder (✏️ pour en créer un)."
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "ajouter ou retirer des annotations",
    },
    {
      id: 'variable',
      titre: 'Saisir une variable',
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="crayon-entretien"]'
        return deps.ongletDroite.value === 'donnees'
          ? '.panneau.donnees'
          : '[data-tour="onglet-donnees"]'
      },
      fait: () =>
        Object.keys(deps.meta.valeursGen).length > 0 ||
        deps.locuteurs.value.some((l) => Object.keys(l.valeursLoc).length > 0),
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Clique l'onglet Données (icône données), puis remplis une valeur (ex. la Ville de Fatima, en texte libre)."
          : "Ouvre l'entretien de Fatima : clique le crayon ✏️ de sa carte.",
      retest: () => "modifier ou compléter les valeurs saisies",
    },
  ]

  /** Id de l'étape couramment guidée (spotlight actif) ; null = inactif. */
  const etapeCouranteId = ref<string | null>(null)
  /** Ids des étapes déjà validées (cochées dans la liste). */
  const validees = ref<Set<string>>(new Set())
  /** Message « re-test » : une étape déjà validée est rouverte ;
   *  on l'annonce (texte propre à chaque étape) dans la vue où vit son action
   *  — l'entretien (étapes d'édition) ou le corpus (étapes de corpus, ex.
   *  « Charger un entretien ») — avec un bouton pour revenir à la liste. */
  const retestInfo = ref<{ titre: string; suite: string; vue: 'corpus' | 'entretien' } | null>(null)

  // Au changement de vue : si l'étape active est déjà validée, c'est un
  // re-test — on affiche le message d'emblée (sans attendre le prédicat, qui
  // peut repartir à faux à chaque ouverture), dans la vue de l'étape.
  // Un message affiché survit tant qu'on reste dans sa vue ; il s'efface dès
  // qu'on en sort.
  watch(deps.vue, (v) => {
    if (retestInfo.value && v !== retestInfo.value.vue) retestInfo.value = null
    const e = etapes.find((x) => x.id === etapeCouranteId.value)
    if (!e || !e.retest || !validees.value.has(e.id)) return
    const vueRetest: 'corpus' | 'entretien' = e.retestCorpus ? 'corpus' : 'entretien'
    if (v !== vueRetest) return
    etapeCouranteId.value = null
    retestInfo.value = { titre: e.titre, suite: e.retest(), vue: vueRetest }
  })

  const etapeCourante = computed(() => etapes.find((e) => e.id === etapeCouranteId.value) ?? null)

  /** Écrit le marqueur démo du corpus courant (`corpus.json: { demo }`) :
   *  mode, racine des sources, étapes validées ;
   *  l'historique du pas-à-pas voyage ainsi avec le corpus,
   *  restauré à la réouverture. */
  async function ecrireMarqueur(mode: ModeDemo): Promise<void> {
    if (!racineSources.value) return
    await window.sonal.corpus.marquerDemo({
      mode,
      racineSources: racineSources.value,
      validees: [...validees.value],
    })
  }

  /** Redérive les étapes validées depuis le modèle (prédicats `fait()`) :
   *  à la réouverture d'un corpus pas-à-pas, le watch de validation n'a rien
   *  détecté, puisqu'aucun état n'a changé ;
   *  on évalue donc toutes les étapes une fois pour retrouver l'historique réel,
   *  ex. « charger » re-cochée si un entretien existe déjà.
   *  Monotone : on ne décoche jamais, une étape faite le reste. */
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
  // coche et on revient à la liste « Pas à pas » (sans enchaîner sur l'étape
  // suivante — l'utilisateur clique lui-même la suivante). L'historique est
  // mémorisé à chaque validation (il voyage avec le corpus).
  watch(
    () => etapeCourante.value?.fait() ?? false,
    async (faite) => {
      if (!faite || !etapeCourante.value) return
      const id = etapeCourante.value.id
      if (validees.value.has(id)) {
        // DÉJÀ validée — c'est un re-test : on éteint le guidage, on garde
        // l'entretien ouvert (étapes d'édition) et on affiche le message
        // « étape déjà réalisée » dans la vue de l'étape. Une étape de CORPUS
        // (ex. « Charger un entretien ») se revoit au corpus : si l'import
        // vient d'ouvrir un entretien, on y retourne d'abord.
        const e = etapeCourante.value
        etapeCouranteId.value = null
        if (e?.retest) {
          if (e.retestCorpus) await deps.retourCorpus()
          retestInfo.value = {
            titre: e.titre,
            suite: e.retest(),
            vue: e.retestCorpus ? 'corpus' : 'entretien',
          }
        }
        return
      }
      validees.value = new Set(validees.value).add(id)
      etapeCouranteId.value = null // guidage arrêté ; l'utilisateur relance la suite
      await ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
      await deps.retourCorpus()
    },
  )

  /** Prépare le corpus de test du mode demandé puis l'ouvre. Chaque mode a son
   *  propre dossier (choisi dans la modale) ; seules les sources sont partagées.
   *  1. Copier les sources bundled une fois (idempotent) ;
   *  2. Ouvrir le dossier du corpus de ce mode ;
   *  3. 'autonomie' : importer les 4 entretiens + leurs audios ;
   *  4. Poser le marqueur démo (identité + historique) ;
   *  5. Appliquer le corpus au modèle et atterrir sur la vue Corpus. */
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

      // 5. Appliquer le corpus (marqué) au modèle : restaure le mode (panneau
      //    « Pas à pas ») et l'historique des étapes.
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

  /** Recharge la mémoire démo persistée (settings.json) :
   *  dossiers (sources et corpus de chaque mode) et présence réelle sur disque.
   *  L'Accueil décide ensuite : « un clic » si tout est en place,
   *  sinon la modale adapte ses questions. */
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

  /** Restaure le mode démo à l'ouverture d'un corpus,
   *  à partir de son marqueur `corpus.json: { demo }`.
   *  Pour un corpus 'pas-a-pas' : rappelle où sont les sources,
   *  remonte le panneau et restaure l'historique des étapes validées.
   *  Pour tout autre corpus (normal ou 'autonomie') : éteint le panneau. */
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
