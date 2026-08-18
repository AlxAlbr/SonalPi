import { ref, watch, computed, type Ref } from 'vue'
import { importerFichier } from '../import/sas'
import type { CorpusFichier, EntretienRef, Locuteur } from '../../shared/format'
import type { Annotation } from '../../shared/entretien/annotation'

/**
 * Scope DÉMO « Mini Corpus Test » : construit un corpus de démonstration depuis
 * les sources bundled `CorpusTest/` (SRT + audio) dans un DOSSIER CHOISI, puis
 * l'ouvre. Ce n'est pas un 3ᵉ type de stockage : le builder réutilise le VRAI
 * pipeline d'import (`importerFichier` → `corpus:importer` + `corpus:assignerAudio`)
 * → zéro dérive de format, la démo est produite par le même code qu'un corpus
 * utilisateur.
 *
 * Deux modes partagent le même mécanisme :
 *  - `'autonomie'` : les 4 entretiens importés + audios, codebook par défaut ;
 *  - `'pas-a-pas'` : corpus amorcé VIDE, onglet « Pas à pas » activé — les étapes
 *    remplissent le corpus une à une (via `importerSource`), guidées par un
 *    spotlight global (projecteur + bulle, plan §7 A / §14).
 *
 * Dépendances injectées (patron `useCorpus({ flush })`) : évite le cycle
 * (`appliquerCorpus` est défini dans `creerSonal`, qui crée ce scope).
 */
export type ModeDemo = 'autonomie' | 'pas-a-pas'

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
 *  aucun entretien ouvert, puis « onglet thèmes »), guide affiché dans la bulle,
 *  et action one-click optionnelle (ex. charger un entretien). J4 :
 *  `libelleAction` personnalise le libellé du bouton one-click de la bulle
 *  (défaut : « Charger l'entretien »). */
export interface EtapePasAPas {
  id: string
  titre: string
  cible: () => string | null
  fait: () => boolean
  texte: () => string
  libelleAction?: string
  action?: () => Promise<void>
}

export interface DepsDemo {
  appliquerCorpus: (c: CorpusFichier) => Promise<void>
  majDossierCourant: () => Promise<void>
  rafraichirRecents: () => Promise<void>
  vue: Ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>
  // --- pour les prédicats d'étapes (observation du modèle réactif) ---
  membership: Ref<Record<string, EntretienRef>>
  entretien: { annotations: Annotation[] } // reactive (useEntretien)
  locuteurs: Ref<Locuteur[]>
  meta: { valeursGen: Record<string, string> } // reactive (useEntretien)
  ouvertId: Ref<string | null>
}

export function utiliserDemo(deps: DepsDemo) {
  /** Onglet « Pas à pas » monté ? (uniquement en mode 'pas-a-pas'). */
  const pasAPas = ref(false)
  /** Build en cours (désactive les cartes pendant la préparation). */
  const enPreparation = ref(false)
  /** J4 — les DEUX dossiers choisis par la modale (§7.2), mémorisés en session :
   *  les sources matérialisées (l'app les y copie une fois) et le corpus de
   *  travail qui les RÉFÉRENCE. Réutilisés par une re-préparation sans modale
   *  (bascule pas-à-pas → autonomie, §7.5) et par les textes/actions des étapes. */
  const racineSources = ref<string | null>(null)
  const dossierCorpus = ref<string | null>(null)

  /** Importe UN entretien source (SRT + audio) via le vrai pipeline, depuis la
   *  racine des sources matérialisées. Réutilisé par le mode autonomie (boucle)
   *  ET par les actions one-click du pas-à-pas (étape « Charger un entretien »)
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
  // J4 : 3 étapes auto-validées (charger → coder → saisir une variable). Les
  // cibles `data-tour` peuvent dépendre de l'état (ex. « crayon » tant qu'aucun
  // entretien ouvert, puis « onglet thèmes ») — le spotlight recalcule en live.
  const etapes: EtapePasAPas[] = [
    {
      id: 'charger',
      titre: 'Charger un entretien',
      // J4 : spotlight sur le VRAI bouton « + Ajouter un entretien » (data-tour
      // posé en J2) — le geste réel passe par la vraie modale à deux zones ;
      // plus de bulle centrée déconnectée de l'UI (§7.4).
      cible: () => '[data-tour="ajouter-entretien"]',
      fait: () => Object.keys(deps.membership.value).length > 0,
      texte: () =>
        racineSources.value
          ? `Tes sources sont dans « ${racineSources.value} ». Dans la modale, choisis srt/E2.srt (Sylvie), puis audio/E2.mp3 — ou je le fais à ta place.`
          : "Chargeons un premier entretien (Sylvie) — son SRT et son audio sont fournis.",
      libelleAction: 'Faire à ma place : importer Sylvie',
      action: async () => {
        if (!racineSources.value) return
        await importerSource('E2', racineSources.value)
        // Rafraîchit le modèle (membership + audios + ondes) : comme un
        // « Ouvrir un corpus » mais sur le dossier courant déjà peuplé.
        await deps.appliquerCorpus(await window.sonal.corpus.ouvrir())
      },
    },
    {
      id: 'coder',
      titre: 'Créer une thématique et annoter',
      // Tant qu'aucun entretien n'est ouvert : guider vers le crayon d'une carte.
      // Une fois dans l'entretien : pointer l'onglet Thématique.
      cible: () => (deps.ouvertId.value ? '[data-tour="onglet-themes"]' : '[data-tour="crayon-entretien"]'),
      fait: () => deps.entretien.annotations.some((a) => a.type === 'codage'),
      texte: () =>
        deps.ouvertId.value
          ? 'Sélectionne un passage du texte, puis clique un thème pour le coder (✏️ pour en créer un).'
          : "Ouvre l'entretien de Sylvie : clique le crayon ✏️ de sa carte.",
    },
    {
      id: 'variable',
      titre: 'Saisir une variable',
      cible: () => (deps.ouvertId.value ? '[data-tour="onglet-donnees"]' : '[data-tour="crayon-entretien"]'),
      fait: () =>
        Object.keys(deps.meta.valeursGen).length > 0 ||
        deps.locuteurs.value.some((l) => Object.keys(l.valeursLoc).length > 0),
      texte: () =>
        deps.ouvertId.value
          ? 'Remplis une valeur (ex. la Ville de Sylvie, en texte libre).'
          : "Ouvre l'entretien de Sylvie : clique le crayon ✏️ de sa carte.",
    },
  ]

  /** Id de l'étape couramment guidée (spotlight actif) ; null = inactif. */
  const etapeCouranteId = ref<string | null>(null)
  /** Ids des étapes déjà validées (cochées dans la liste). */
  const validees = ref<Set<string>>(new Set())

  const etapeCourante = computed(() => etapes.find((e) => e.id === etapeCouranteId.value) ?? null)

  /** Active une étape (clic dans la liste) : démarre son spotlight. */
  function activer(id: string) {
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
  // coche et on enchaîne sur la suivante non validée (guidage fluide).
  watch(
    () => etapeCourante.value?.fait() ?? false,
    (faite) => {
      if (!faite || !etapeCourante.value) return
      validees.value = new Set(validees.value).add(etapeCourante.value.id)
      const suiv = etapes.find((e) => !validees.value.has(e.id))
      etapeCouranteId.value = suiv ? suiv.id : null // null = terminé
    },
  )

  /** Prépare le corpus de démo dans le dossier de travail choisi (les sources
   *  matérialisées dans `racineSources` par la modale) puis l'ouvre.
   *  1. Copier les sources bundled UNE FOIS dans racineSources (idempotent) ;
   *  2. Ouvrir/amorcer le dossier de travail (même effet que corpus:choisirDossier,
   *     sans dialogue — le choix vient de la modale, ou de la session si déjà
   *     préparé : bascule pas-à-pas → autonomie sans 2ᵉ modale, §7.5) ;
   *  3. 'autonomie' : peupler avec les 4 entretiens + audios (référencés) ;
   *  4. Appliquer le corpus (peuplé) au modèle + atterrissage en vue Corpus. */
  async function preparer(
    mode: ModeDemo,
    opts?: { racineSources: string; dossierCorpus: string },
  ): Promise<void> {
    if (enPreparation.value) return
    enPreparation.value = true
    try {
      if (opts) {
        racineSources.value = opts.racineSources
        dossierCorpus.value = opts.dossierCorpus
      }
      if (!racineSources.value || !dossierCorpus.value) return // ne devrait pas arriver (modale)

      // 1. LA seule copie du flow de démo (~13 Mo) — idempotente (§7.2).
      await window.sonal.demo.copierSources(racineSources.value)
      // 2. Ouvrir (amorcer si neuf) le dossier de travail choisi par la modale :
      //    bascule le store + le note dans les récents (comme corpus:choisirDossier
      //    sans dialogue) — PUIS on resynchronise les scopes profil.
      const res = await window.sonal.corpus.ouvrirDossier(dossierCorpus.value)
      if (!res) return
      await deps.majDossierCourant()
      await deps.rafraichirRecents()

      // 3. Mode autonomie : peupler le dossier avec les 4 entretiens + audios.
      if (mode === 'autonomie') {
        for (const k of SOURCES) await importerSource(k, racineSources.value)
      }

      // 4. Appliquer le corpus (maintenant peuplé) au modèle + atterrissage.
      //    `appliquerCorpus` recharge membership/codebook/variables/audios et
      //    régénère les formes d'onde manquantes en fond.
      await deps.appliquerCorpus(await window.sonal.corpus.ouvrir())
      pasAPas.value = mode === 'pas-a-pas'
      deps.vue.value = 'corpus'
      if (mode === 'pas-a-pas') {
        // Pré-crée une variable « Ville » (portée locuteur, saisie libre) pour
        // l'étape « Saisir une variable » — sinon le corpus vide n'en a aucune.
        await window.sonal.corpus.ajouterVariable('Ville', 'locuteur')
        await deps.appliquerCorpus(await window.sonal.corpus.ouvrir())
        etapeCouranteId.value = etapes[0].id // démarre la 1re étape
        validees.value = new Set()
      }
    } finally {
      enPreparation.value = false
    }
  }

  /** Quitte le mode pas-à-pas (décolle l'onglet ; le corpus reste). */
  function quitterPasAPas() {
    pasAPas.value = false
    etapeCouranteId.value = null
    validees.value = new Set()
  }

  return {
    pasAPas,
    enPreparation,
    racineSources,
    preparer,
    importerSource,
    quitterPasAPas,
    etapes,
    etapeCouranteId,
    etapeCourante,
    validees,
    activer,
    suivante,
  }
}
