import { ref, watch, computed, type Ref } from 'vue'
import type {
  EntretienRef,
  Locuteur,
  MarqueurDemo,
  Variable,
  Note,
  ParcoursId,
  ProgressionParcoursDemo,
} from '../../../shared/format'
import { identiteExemple } from '../../../shared/exemples'
import type { VueApplication } from '../espaces'
import type { Annotation } from '../../../shared/entretien/annotation'
import type { TableauBord } from '../../../shared/corpus/tableaubord'
import type { ResumeDocumentCadre } from '../../../shared/docsCadre'
import { etatPresentationParcours, etatsCatalogue, recommanderParcoursSuivant } from './presentation'
import { creerCatalogue } from './catalogue'
import { lireProgressionsDemo, serialiserProgressionsDemo } from './marqueur'
import { creerParcoursPreparation } from './preparation'
import { creerParcoursAnalyse, type DepsParcoursAnalyse } from './analyse'
import type { DefinitionParcours, EtapeActive, EtapePasAPas, SurfaceGuide } from './types'
import { creerParcoursOrganisation, type DepsParcoursOrganisation } from './organisation'
import type { DemandeLotCorpus, ResultatLotCorpus } from '../../export/exportCorpus'

/** Dépendances du guide sur le corpus actuellement ouvert. */
export interface DepsGuide {
  analyse: Omit<DepsParcoursAnalyse, 'vue' | 'membership'>
  organisation: Omit<DepsParcoursOrganisation, 'vue' | 'membership' | 'ouvertId' | 'exportRealise'>
  retourParcours: () => Promise<boolean>
  vue: Ref<VueApplication>
  // --- pour les prédicats d'étapes (observation du modèle réactif) ---
  membership: Ref<Record<string, EntretienRef>>
  entretien: { annotations: Annotation[] } // reactive (useEntretien)
  locuteurs: Ref<Locuteur[]>
  meta: { valeursGen: Record<string, string> } // reactive (useEntretien)
  ouvertId: Ref<string | null>
  /** Onglet actif de l'entretien (useEntretien) :
   *  les étapes qui vivent DANS un panneau guident d'abord vers l'onglet à ouvrir ;
   *  puis vers l'action (le spotlight suit l'état). */
  ongletDroite: Ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'>
  variables: Ref<Variable[]> // définitions EAV du corpus (useCorpus)
  /** Notes de l'entretien OUVERT (useEntretien) : l'étape « Prendre des notes à chaud »
   *  se coche dès qu'une note existe. */
  notes: Ref<Note[]>
  /** Audios référencés par entretien (scan `png/` + audioRef,
   *  rafraîchi à l'ouverture du corpus et après un import avec audio — sonal.ts).
   *  L'étape « Charger un entretien » l'utilise : 1Coordinatrice n'est « fait »
   *  que si SON audio est bien référencé. */
  audiosCorpus: Ref<Record<string, { audio: string | null; waveform: string | null }>>
  /** Panneau métadonnées de l'entretien SÉLECTIONNÉ au Corpus (sonal.ts) :
   *  l'étape « Lier la transcription (SRT) » y lit `srt` —
   *  vrai dès que la transcription est importée (« Assigner un srt… »). */
  corpusSelId: Ref<string | null>
  corpusSelMeta: Ref<{ srt: boolean } | null>
  tableaubord: Ref<TableauBord | null>
  tableauBordOuverts: Readonly<Ref<boolean>>
  docsCadreOuverts: Readonly<Ref<boolean>>
  documentsProjet: Ref<ResumeDocumentCadre[]>
  fermerTableauBord: () => void
  fermerDocsCadre: () => void
}

/** Accompagne et valide les gestes sans installer ni rouvrir de corpus. */
export function useGuide(deps: DepsGuide) {
  const pasAPas = ref(false)
  const racineSources = ref<string | null>(null)
  const marqueurCourant = ref<MarqueurDemo | null>(null)
  const dossierGuide = ref<string | null>(null)
  let generationGuide = 0

  const contextesParcours = ref<Partial<Record<ParcoursId, Record<string, string>>>>({})

  // --- Parcours de traitement : six étapes auto-validées (charger →
  // noter → lier le SRT → renommer → coder → saisir une variable).
  // Les cibles `data-tour` peuvent dépendre de l'état (ex. « crayon »
  // tant qu'aucun entretien ouvert, puis « lecture »/« onglet thèmes ») —
  // le spotlight recalcule en live.
  const etapesTraitement: EtapePasAPas[] = [
    {
      id: 'charger',
      titre: 'Charger un entretien',
      // Spotlight sur le VRAI bouton « + Ajouter un entretien » ;
      // l'utilisateur passe par la vraie modale à deux zones.
      // La cible suit l'état du DOM de la modale (zone fichier → zone son → Valider)
      // pour guider pas à pas.
      cible: () => {
        if (!document.querySelector('.modale-ajout')) return '[data-tour="ajouter-entretien"]'
        if (!document.querySelector('.zone-texte .zone-fichier')) return '[data-tour="zone-texte"]'
        if (!document.querySelector('.zone-audio .zone-fichier')) return '[data-tour="zone-audio"]'
        return '[data-tour="valider"]'
      },
      // L'étape n'est « faite » que si l'entretien chargé est bien « 1Coordinatrice »
      // **ET** référence son audio (1Coordinatrice.mp3) ;
      // tout le reste du parcours est construit sur SON contenu (le « ? » doublé de la 1ʳᵉ ligne,
      // les locuteurs/enquêteur·rice, le passage « me recevoir ») et l'étape 2 démarre par une ÉCOUTE.
      // Un 1Coordinatrice importé SANS audio (texte seul — permis hors pas-à-pas)
      // ne satisfait pas l'étape ; lui assigner un audio (carte → « Assigner un audio »)
      // la valide alors automatiquement.
      // La modale d'ajout refuse par ailleurs tout autre geste tant que l'étape n'est pas validée (garde `verifierChargementEtape1`).
      fait: () =>
        Object.entries(deps.membership.value).some(
          ([id, r]) => r.titre === '1Coordinatrice' && deps.audiosCorpus.value[id]?.audio != null,
        ),
      texte: () => {
        if (!document.querySelector('.modale-ajout')) {
          return 'Cliquez sur « + Ajouter un entretien ».'
        }
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return "Dans cette zone, choisissez le fichier de sous-titres : cliquez, puis sélectionnez srt/1Coordinatrice.srt"
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return "Bien ! Maintenant le fichier media : cliquez sur cette zone et sélectionnez audio/1Coordinatrice.mp3."
        }
        return "Tout est prêt : cliquez sur « Valider » pour créer l'entretien."
      },
      fichiersExercice: () => {
        if (!document.querySelector('.modale-ajout')) return null
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return { dossier: 'transcriptions', libelle: 'Ouvrir le dossier des transcriptions' }
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return { dossier: 'audio', libelle: 'Ouvrir le dossier des fichiers audio' }
        }
        return null
      },
      retest: () => "charger d'autres entretiens",
      // L'action de cette étape vit dans le CORPUS (ajouter un entretien) :
      // le message « déjà réalisée » s'y affiche, pas dans l'éditeur.
      retestCorpus: true,
      // Fin d'étape : félicitations + ouverture immédiate OU enchaînement —
      // l'étape suivante commence elle aussi par ouvrir cet entretien.
      fini: () =>
        "Et voilà : c'est fait, votre premier entretien est chargé dans le corpus. " +
        "Vous pouvez l'ouvrir tout de suite en cliquant sur le crayon de sa carte " +
        "— ou bien enchaîner sur l'étape suivante, qui commencera elle aussi par " +
        "vous faire ouvrir cet entretien.",
    },
    {
      id: 'noter',
      titre: 'Prendre des notes à chaud',
      // Étape 2a : le « retour d'entretien » (avec 2b, qui lie la transcription)
      // — accessible sans l'étape 1.
      numCle: '2a',
      // La situation du RETOUR d'entretien se joue avec un SECOND entretien créé SANS transcription :
      // vous venez d'achever l'entretien, le SRT n'est pas prêt.
      // Le geste passe par la VRAIE modale d'ajout, zone SON seule (aucun fichier de texte) —
      // même mécanique que l'étape 1 avec le SRT.
      // Puis l'entretien s'ouvre et on écrit la note « à chaud » :
      // le trou guide l'onglet Notes puis « + Note », puis détaille la modale de création (titre, corps,
      // Valider) sans bulle qui la masquerait ; le texte vit dans le panneau.
      // La garde `verifierChargementEtape2` n'autorise qu'audio/2RetraiteAnticipee.mp3 tant qu'elle n'est pas validée.
      // Lier le SRT plus tard se raconte (« Assigner un srt… ») :
      // le bouton n'existe que pour un entretien sans transcription.
      cible: () => {
        if (deps.vue.value !== 'entretien') {
          // Au Corpus : la modale d'ajout tant que l'entretien audio seul n'existe pas (2e carte),
          // puis son crayon pour l'ouvrir et noter.
          const id2 = Object.entries(deps.membership.value).find(
            ([, r]) => r.titre === '2RetraiteAnticipee',
          )?.[0]
          if (!document.querySelector('.modale-ajout')) {
            if (id2 && deps.audiosCorpus.value[id2]?.audio != null) {
              // La carte est ciblée par id :
              // position stable même si 2a a été menée avant l'étape 1 (l'entretien n'est alors pas en 2e).
              return '[data-tour="carte-2RetraiteAnticipee"] .crayon'
            }
            return '[data-tour="ajouter-entretien"]'
          }
          if (!document.querySelector('.zone-audio .zone-fichier')) {
            return '[data-tour="zone-audio"]'
          }
          return '[data-tour="valider"]'
        }
        // Dans l'entretien : languette Notes → formulaire inline, champ par champ.
        const modale = document.querySelector('.modale-note')
        if (modale) {
          const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)
            ?.value?.trim()
          const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
          if (!titre && !corps) return '.modale-note .champ-titre-note input'
          if (!corps) return '.modale-note .zone-corps-note'
          return '.modale-note-pied .principal'
        }
        const boutonNotes = document.querySelector('[data-tour="onglet-notes"]')
        if (boutonNotes?.getAttribute('aria-expanded') !== 'true') return '[data-tour="onglet-notes"]'
        const formulaire = document.querySelector('.nouvelle-note-inline')
        if (!formulaire) return '[data-tour="onglet-notes"]'
        const titre = (formulaire.querySelector('[data-tour="note-titre"]') as HTMLInputElement | null)
          ?.value?.trim()
        const corps = formulaire.querySelector('.zone-corps-note')?.textContent?.trim()
        if (!titre && !corps) return '[data-tour="note-titre"]'
        if (!corps) return '.nouvelle-note-inline .zone-corps-note'
        return '[data-tour="creer-note"]'
      },
      panneau: true,
      panneauAvecTrou: true,
      fait: () => {
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        return (
          !!id2 &&
          deps.ouvertId.value === id2 &&
          deps.audiosCorpus.value[id2]?.audio != null &&
          deps.notes.value.length > 0
        )
      },
      texte: () => {
        // Au Corpus : le geste est la modale d'ajout (zone son seule).
        if (deps.vue.value !== 'entretien') {
          if (!document.querySelector('.modale-ajout')) {
            return "Cliquez sur « + Ajouter un entretien » pour créer un entretien avec son audio seul."
          }
          if (!document.querySelector('.zone-audio .zone-fichier')) {
            return "Dans « Fichier son / vidéo », choisissez audio/2RetraiteAnticipee.mp3 et laissez la zone de texte vide."
          }
          return "Cliquez sur « Valider » pour créer l'entretien, puis ouvrez ses Notes."
        }
        // Dans l'entretien : la note à chaud, champ par champ.
        const modale = document.querySelector('.modale-note')
        if (!modale) {
          if (deps.ongletDroite.value !== 'notes') {
            return "Ouvrez l'onglet Notes pour consigner vos impressions à chaud."
          }
          return 'Cliquez sur « + Note » pour créer la note à chaud.'
        }
        const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)
          ?.value?.trim()
        const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
        if (!titre && !corps) {
          return 'Donnez un titre à la note — optionnel, mais pratique pour la retrouver (ex. « Impressions du retour d’entretien »).'
        }
        if (!corps) {
          return "Écrivez maintenant vos impressions à chaud dans le corps de la note : une hypothèse, un point à vérifier, l'ambiance du moment…"
        }
        return "La note est complète : cliquez sur « Valider » pour l'enregistrer."
      },
      explication: () =>
        deps.vue.value === 'entretien'
          ? "Cet entretien a été créé avec l'audio seul. Vous lierez sa transcription depuis les métadonnées de sa carte à l'étape suivante."
          : "Ce scénario représente un retour d'entretien : l'audio est disponible, mais la transcription n'est pas encore prête.",
      fichiersExercice: () =>
        deps.vue.value !== 'entretien' && document.querySelector('.modale-ajout')
          && !document.querySelector('.zone-audio .zone-fichier')
          ? { dossier: 'audio', libelle: 'Ouvrir le dossier des fichiers audio' }
          : null,
      retest: () =>
        "ajouter un autre entretien audio seul et écrire une nouvelle note à chaud " +
        '(le retour d’entretien est déjà consigné)',
      fini: () =>
        "Votre note « à chaud » est enregistrée sur « 2RetraiteAnticipee », créé avec l'audio seul " +
        "— c'est tout l'intérêt du retour d'entretien : rien ne se perd en attendant la " +
        'transcription. Prochaine étape : lier la transcription (SRT) à cet entretien.',
      // On RESTE dans l'entretien après la note (pas de retour brutal au Corpus) :
      // l'utilisateur peut continuer à écrire s'il le veut ;
      // le message de fin s'affiche sous les onglets avec un bouton pour revoir le parcours.
      vueFin: 'entretien',
    },
    {
      id: 'lier-srt',
      titre: 'Lier la transcription (SRT)',
      // Étape 2b : la suite de « Prendre des notes à chaud » (2a) —
      // inaccessible tant que 2a n'est pas validée (le bouton de la liste est désactivé).
      numCle: '2b',
      requiere: 'noter',
      // La transcription de « 2RetraiteAnticipee » (chargé audio seul à l'étape précédente)
      // arrive maintenant : on revient au Corpus,
      // on sélectionne la carte pour ouvrir son panneau métadonnées, puis on importe le SRT —
      // « Assigner un srt… » remplace le contenu d'éditeur (ici vide)
      // sans toucher aux notes ni aux données.
      // L'étape se coche quand le panneau de l'entretien sélectionné signale « Srt : lié ».
      cible: () => {
        if (deps.vue.value === 'entretien') return '.retour'
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        if (!id2 || !deps.audiosCorpus.value[id2]?.audio) {
          return '[data-tour="ajouter-entretien"]'
        }
        if (deps.corpusSelId.value !== id2) return '[data-tour="carte-2RetraiteAnticipee"]'
        if (!deps.corpusSelMeta.value) {
          return '[data-tour="carte-2RetraiteAnticipee"]' // lecture de la méta
        }
        return '.panneau.meta-ent .assigner-srt'
      },
      fait: () => {
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        return (
          !!id2 &&
          deps.audiosCorpus.value[id2]?.audio != null &&
          deps.corpusSelId.value === id2 &&
          deps.corpusSelMeta.value?.srt === true
        )
      },
      texte: () => {
        if (deps.vue.value === 'entretien') {
          return "Revenez au Corpus, puis sélectionnez la carte de l'entretien pour lier sa transcription."
        }
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        if (deps.corpusSelId.value !== id2) {
          return "Sélectionnez la carte « 2RetraiteAnticipee » pour ouvrir son panneau de métadonnées."
        }
        return "Cliquez sur « Assigner un srt… », puis choisissez srt/2RetraiteAnticipee.srt."
      },
      explication: () =>
        "La transcription et son découpage horodaté seront ajoutés sans modifier les notes ni les données de l'entretien.",
      fichiersExercice: () => {
        const id2 = Object.entries(deps.membership.value).find(
          ([, r]) => r.titre === '2RetraiteAnticipee',
        )?.[0]
        return deps.vue.value !== 'entretien' && deps.corpusSelId.value === id2
          ? { dossier: 'transcriptions', libelle: 'Ouvrir le dossier des transcriptions' }
          : null
      },
      retest: () => "lier la transcription d'un autre entretien (celle de 2RetraiteAnticipee est déjà posée)",
      retestCorpus: true,
      // L'action de cette étape vit dans le CORPUS (panneau métadonnées) ;
      // après validation on y est déjà,
      // le message de fin s'affiche dans le parcours avec la proposition d'enchaîner.
      fini: () =>
        "La transcription est liée : le texte de « 2RetraiteAnticipee » et son découpage " +
        "horodaté sont en place, notes et données conservées. Prochaine étape : " +
        'renommer les locuteurs de votre premier entretien (1Coordinatrice).',
    },
    {
      id: 'renommer',
      titre: 'Renommer les locuteurs',
      // Requiert l'étape 1 : les noms « Speaker N » viennent de la transcription d'1Coordinatrice ;
      // sans elle, rien à renommer.
      requiere: 'charger',
      // Depuis la liste, le crayon de la carte guide vers l'entretien ;
      // la consigne y devient un panneau (la bulle recouvrait le champ d'un locuteur).
      // L'étape se coche quand plus aucun locuteur de l'entretien ouvert ne s'appelle « Speaker N ».
      cible: () => deps.vue.value === 'entretien'
        ? null
        : '[data-tour="carte-1Coordinatrice"] .crayon',
      panneau: true,
      fait: () => {
        const id = Object.entries(deps.membership.value).find(([, r]) => r.titre === '1Coordinatrice')?.[0]
        return deps.ouvertId.value === id &&
          deps.locuteurs.value.length > 0 &&
          deps.locuteurs.value.every((l) => !l.nom.startsWith('Speaker'))
      },
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Ouvrez l'onglet Locuteurs, puis renommez Speaker 0 en « Fatima » et Speaker 1 en « Enquêteur·rice ». Validez avec Entrée ou en quittant le champ."
          : "Ouvrez l'entretien 1Coordinatrice avec le crayon de sa carte.",
      retest: () => "re-renommer les locuteurs (les noms sont déjà corrigés)",
      fini: () =>
        "Les locuteurs ont un vrai nom — Fatima et l'enquêteur·rice sont identifiables, " +
        "et vous avez pseudonymisé le corpus à la fois. Prochaine étape : créer une " +
        "thématique et annoter un passage.",
    },
    {
      id: 'coder',
      titre: 'Créer une thématique et annoter',
      // Idem étape 3 : l'annotation se pose sur le texte d'1Coordinatrice.
      requiere: 'charger',
      // Depuis la liste, on guide vers la carte déterministe de 1Coordinatrice.
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="carte-1Coordinatrice"] .crayon'
        return deps.ongletDroite.value === 'themes'
          ? '.panneau.themes-coder'
          : '[data-tour="onglet-themes"]'
      },
      fait: () => {
        const id = Object.entries(deps.membership.value).find(([, r]) => r.titre === '1Coordinatrice')?.[0]
        return deps.ouvertId.value === id && deps.entretien.annotations.some((a) => a.type === 'codage')
      },
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Ouvrez l'onglet Thématiques, sélectionnez un passage du texte, puis cliquez sur un thème pour le coder."
          : "Ouvrez l'entretien 1Coordinatrice avec le crayon de sa carte.",
      retest: () => "ajouter ou retirer des annotations",
      fini: () =>
        "Première annotation posée : le passage est codé avec une thématique. " +
        "Prochaine étape : saisir une variable.",
    },
    {
      id: 'variable',
      titre: 'Saisir une variable',
      // Idem : le geste guidé ouvre 1Coordinatrice.
      requiere: 'charger',
      cible: () => {
        if (deps.vue.value !== 'entretien') return '[data-tour="carte-1Coordinatrice"] .crayon'
        return deps.ongletDroite.value === 'donnees'
          ? '.panneau.donnees'
          : '[data-tour="onglet-donnees"]'
      },
      fait: () => {
        const id = Object.entries(deps.membership.value).find(([, r]) => r.titre === '1Coordinatrice')?.[0]
        return deps.ouvertId.value === id && (
          Object.keys(deps.meta.valeursGen).length > 0 ||
          deps.locuteurs.value.some((l) => Object.keys(l.valeursLoc).length > 0)
        )
      },
      texte: () =>
        deps.vue.value === 'entretien'
          ? "Ouvrez l'onglet Données, puis renseignez une valeur, par exemple le lieu de l'entretien."
          : "Ouvrez l'entretien 1Coordinatrice avec le crayon de sa carte.",
      retest: () => "modifier ou compléter les valeurs saisies",
      fini: () =>
        "Variable saisie ! Vous avez parcouru tout le circuit — importer, noter, " +
        "lier les transcriptions, pseudonymiser, coder et documenter vos entretiens. " +
        "Votre corpus est prêt pour l'analyse.",
    },
  ]

  const idEntretienPreparation = () => contextesParcours.value.preparation?.entretienId ?? null
  const definitionPreparation = creerParcoursPreparation({
    vue: deps.vue,
    ongletDroite: deps.ongletDroite,
    ouvertId: deps.ouvertId,
    membership: deps.membership,
    notes: deps.notes,
    tableaubord: deps.tableaubord,
    tableauBordOuverts: deps.tableauBordOuverts,
    docsCadreOuverts: deps.docsCadreOuverts,
    documentsProjet: deps.documentsProjet,
    idEntretien: idEntretienPreparation,
  })
  const definitionTraitement: DefinitionParcours = {
    id: 'traitement',
    titre: 'Importer et traiter',
    resume: 'Importer, documenter, transcrire, pseudonymiser, coder et qualifier.',
    disponible: () => true,
    etapes: etapesTraitement,
  }
  const definitionAnalyse = creerParcoursAnalyse({ ...deps.analyse, vue: deps.vue, membership: deps.membership })
  const exportRealise = ref<DepsParcoursOrganisation['exportRealise']['value']>(null)
  const definitionOrganisation = creerParcoursOrganisation({ ...deps.organisation, vue: deps.vue,
    membership: deps.membership, ouvertId: deps.ouvertId, exportRealise })
  const catalogueParcours = creerCatalogue(definitionPreparation, definitionTraitement, definitionAnalyse, definitionOrganisation)
  const parcoursSelectionneId = ref<ParcoursId>('preparation')
  const dernierParcoursId = ref<ParcoursId | null>(null)
  const valideesParParcours = ref<Record<ParcoursId, Set<string>>>(
    { preparation: new Set(), traitement: new Set(), analyse: new Set(), organisation: new Set() },
  )
  const etapeActive = ref<EtapeActive>(null)
  const definitionSelectionnee = computed(() =>
    catalogueParcours.find((parcours) => parcours.id === parcoursSelectionneId.value) ?? definitionPreparation,
  )
  const etapes = computed(() => definitionSelectionnee.value.etapes)
  const validees = computed({
    get: () => valideesParParcours.value[parcoursSelectionneId.value],
    set: (valeur: Set<string>) => {
      valideesParParcours.value = {
        ...valideesParParcours.value,
        [parcoursSelectionneId.value]: valeur,
      }
    },
  })
  const etapeCouranteId = computed({
    get: () => etapeActive.value?.etapeId ?? null,
    set: (id: string | null) => {
      etapeActive.value = id ? { parcoursId: parcoursSelectionneId.value, etapeId: id } : null
    },
  })
  const parcoursActifId = computed(() => etapeActive.value?.parcoursId ?? parcoursSelectionneId.value)
  const parcoursActif = computed(() => catalogueParcours.find((p) => p.id === parcoursActifId.value) ?? definitionPreparation)
  const etapeCourante = computed(() =>
    parcoursActif.value.etapes.find((etape) => etape.id === etapeActive.value?.etapeId) ?? null,
  )
  const etatParcours = computed(() => etatPresentationParcours(etapes.value, validees.value))
  const etatsParcours = computed(() => etatsCatalogue(catalogueParcours, valideesParParcours.value))
  const surfaceGuide = computed<SurfaceGuide>(() => {
    if (deps.tableauBordOuverts.value) return 'tableau-bord'
    if (deps.docsCadreOuverts.value) return 'docs-cadre'
    if (deps.vue.value === 'analyser') return 'analyse'
    if (deps.vue.value === 'organiser') return 'organisation'
    return deps.vue.value === 'entretien' ? 'entretien' : 'corpus'
  })
  const retestInfo = ref<{
    parcoursId: ParcoursId
    titre: string
    suite: string
    vue: Exclude<VueApplication, 'accueil'>
  } | null>(null)
  const finiInfo = ref<{
    parcoursId: ParcoursId
    titre: string
    suite: string
    prochaineId: string | null
    prochaineTitre: string | null
    vue: Exclude<VueApplication, 'accueil'>
    parcoursSuivantId?: ParcoursId | null
  } | null>(null)

  watch(deps.vue, (vue) => {
    if (retestInfo.value && vue !== retestInfo.value.vue) retestInfo.value = null
    const etape = etapeCourante.value
    if (!etape || !etape.retest || !validees.value.has(etape.id)) return
    const vueRetest = etape.retestCorpus ? 'corpus' : etape.vueFin ?? 'entretien'
    if (vue !== vueRetest) return
    etapeActive.value = null
    retestInfo.value = {
      parcoursId: parcoursSelectionneId.value,
      titre: etape.titre,
      suite: etape.retest(),
      vue: vueRetest,
    }
  })

  function progressionsPersistantes(): Partial<Record<ParcoursId, ProgressionParcoursDemo>> {
    return serialiserProgressionsDemo(valideesParParcours.value, contextesParcours.value)
  }

  /** Persiste séparément les acquis et le contexte minimal de chaque parcours. */
  async function ecrireMarqueur(): Promise<void> {
    const marqueur = marqueurCourant.value
    const dir = dossierGuide.value
    if (!marqueur || !dir || !pasAPas.value) return
    await window.sonal.corpus.marquerDemo({
      ...marqueur,
      parcours: progressionsPersistantes(),
      ...(dernierParcoursId.value ? { dernierParcoursId: dernierParcoursId.value } : {}),
    }, dir)
  }

  /** Redérive les acquis observables sans retirer les acquis déjà mémorisés. */
  function revaliderEtapes() {
    let change = false
    const suivantes = { ...valideesParParcours.value }
    for (const definition of catalogueParcours) {
      const cle = definition.id
      if (cle !== marqueurCourant.value?.parcoursApprentissage) continue
      const progression = new Set(suivantes[cle])
      for (const etape of definition.etapes) if (etape.fait()) progression.add(etape.id)
      if (progression.size !== suivantes[cle].size) {
        suivantes[cle] = progression
        change = true
      }
    }
    if (change) {
      valideesParParcours.value = suivantes
      void ecrireMarqueur()
    }
  }

  function selectionnerParcours(parcoursId: ParcoursId) {
    if (!catalogueParcours.some((parcours) => parcours.id === parcoursId && parcours.disponible())) return
    parcoursSelectionneId.value = parcoursId
  }

  /** Active une étape dans son parcours ; les prérequis restent locaux à ce parcours. */
  function activer(parcoursId: ParcoursId, id: string) {
    const definition = catalogueParcours.find((parcours) => parcours.id === parcoursId)
    if (!pasAPas.value || marqueurCourant.value?.parcoursApprentissage !== parcoursId || !definition?.disponible()) return
    const etape = definition.etapes.find((candidate) => candidate.id === id)
    if (!etape) return
    const progression = valideesParParcours.value[parcoursId]
    if (etape.requiere && !progression.has(etape.requiere)) return
    selectionnerParcours(parcoursId)
    dernierParcoursId.value = parcoursId
    void ecrireMarqueur()
    retestInfo.value = null
    finiInfo.value = null
    etapeActive.value = { parcoursId, etapeId: id }
  }

  watch(
    () => etapeCourante.value?.fait() ?? false,
    async (faite) => {
      const active = etapeActive.value
      const etape = etapeCourante.value
      if (!faite || !active || !etape) return
      const generation = generationGuide
      const cle = active.parcoursId
      const progression = valideesParParcours.value[cle]
      if (progression.has(etape.id)) {
        etapeActive.value = null
        if (etape.retest) {
          if (etape.retestCorpus && !(await deps.retourParcours())) return
          if (generation !== generationGuide) return
          retestInfo.value = {
            parcoursId: active.parcoursId,
            titre: etape.titre,
            suite: etape.retest(),
            vue: etape.retestCorpus ? 'corpus' : etape.vueFin ?? 'entretien',
          }
        }
        return
      }

      valideesParParcours.value = {
        ...valideesParParcours.value,
        [cle]: new Set(progression).add(etape.id),
      }
      etapeActive.value = null
      await ecrireMarqueur()
      if (generation !== generationGuide) return
      const definition = catalogueParcours.find((parcours) => parcours.id === active.parcoursId)!
      const index = definition.etapes.findIndex((candidate) => candidate.id === etape.id)
      const candidate = definition.etapes[index + 1]
      const progressionApres = valideesParParcours.value[cle]
      const suite = candidate && (!candidate.requiere || progressionApres.has(candidate.requiere))
        ? candidate
        : null
      const vueFin = etape.vueFin ?? 'corpus'
      if (!etape.vueFin) {
        if (deps.tableauBordOuverts.value) deps.fermerTableauBord()
        if (deps.docsCadreOuverts.value) deps.fermerDocsCadre()
        if (!(await deps.retourParcours())) return
        if (generation !== generationGuide) return
      }
      if (etape.fini) {
        const etat = etatPresentationParcours(definition.etapes, progressionApres)
        finiInfo.value = {
          parcoursId: active.parcoursId,
          titre: `« ${etape.titre} » : terminé ✓`,
          suite: etape.fini(),
          prochaineId: suite?.id ?? null,
          prochaineTitre: suite?.titre ?? null,
          vue: vueFin,
          parcoursSuivantId: etat.termine
            ? recommanderParcoursSuivant(catalogueParcours, active.parcoursId, valideesParParcours.value)
            : null,
        }
      } else finiInfo.value = null
    },
  )

  /** Garde de l'étape « Charger un entretien » (pas-à-pas) : tant que l'étape 1 n'est PAS validée,
   *  la modale d'ajout n'accepte que `srt/1Coordinatrice.srt` + `audio/1Coordinatrice.mp3`.
   *  Toute la suite du parcours (les notes à chaud de l'étape 2, les locuteurs/enquêteur·rice,
   *  le passage « me recevoir » à coder…) est construite sur le contenu de CET entretien.
   *  Retourne un message d'erreur à afficher dans la modale, ou null si les fichiers sont les bons.
   *  Une fois l'étape validée (re-test « charger d'autres entretiens »), la garde se lève ;
   *  2RetraiteAnticipee…4Etudiants s'importent librement dans le même corpus,
   *  et hors pas-à-pas elle n'existe pas.
   *  Le titre de l'entretien importé = nom du fichier SRT (préfixe numérique compris) ;
   *  on vérifie donc aussi leur présence : l'étape demande les DEUX, texte ET audio. */
  function verifierChargementEtape1(nomTexte: string | null, cheminAudio: string | null): string | null {
    // Hors de l'étape guidée, tous les imports ordinaires restent disponibles.
    if (!pasAPas.value || valideesParParcours.value.traitement.has('charger')) return null
    if (etapeActive.value?.parcoursId !== 'traitement' || etapeCouranteId.value !== 'charger') return null
    const base = (p: string | null) => p?.replace(/^.*[\\/]/, '') ?? null
    if (base(nomTexte) !== '1Coordinatrice.srt' || base(cheminAudio) !== '1Coordinatrice.mp3') {
      return (
        "Pour cette étape du pas-à-pas, merci de choisir exactement « srt/1Coordinatrice.srt » puis « audio/1Coordinatrice.mp3 » : " +
        'la suite du parcours (notes à chaud, renommer, coder) est construite sur cet entretien.' +
        " Une fois l'étape validée, vous pourrez charger librement les autres entretiens (2RetraiteAnticipee…4Etudiants)."
      )
    }
    return null
  }

  /** Garde de l'étape « Prendre des notes à chaud » (pas-à-pas) :
   *  tant que l'étape 2 n'est PAS validée (après l'étape 1),
   *  la modale d'ajout n'accepte que l'AUDIO SEUL `audio/2RetraiteAnticipee.mp3`,
   *  aucun fichier de texte — le scénario du retour d'entretien :
   *  la transcription n'est pas encore prête, elle se liera plus tard (« Assigner un srt… »).
   *  Retourne un message d'erreur à afficher dans la modale, ou null si le choix est le bon.
   *  Une fois l'étape validée, la garde se lève ; on charge librement. */
  function verifierChargementEtape2(nomTexte: string | null, cheminAudio: string | null): string | null {
    // Active seulement pendant le geste guidé de 2a (création de l'entretien audio seul) :
    // tant que 2a n'est pas validée,
    // la modale n'accepte que `audio/2RetraiteAnticipee.mp3` sans fichier de texte.
    // Hors de cette étape (ou une fois 2a faite), la garde se lève ; on charge librement.
    if (!pasAPas.value || valideesParParcours.value.traitement.has('noter')) return null
    if (etapeActive.value?.parcoursId !== 'traitement' || etapeCouranteId.value !== 'noter') return null
    const base = (p: string | null) => p?.replace(/^.*[\\/]/, '') ?? null
    if (base(cheminAudio) === '2RetraiteAnticipee.mp3' && nomTexte === null) return null
    if (nomTexte !== null) {
      return (
        "Cette étape montre le retour d'entretien : pas encore de transcription. " +
        'Remplissez la zone SON seule (aucun fichier de texte) — ' +
        "« audio/2RetraiteAnticipee.mp3 » — le SRT se liera à l'entretien plus tard."
      )
    }
    return (
      "Pour cette étape du pas-à-pas, merci de choisir exactement « audio/2RetraiteAnticipee.mp3 » : " +
        "le scénario est un retour d'entretien dont la transcription (SRT) n'est pas encore prête."
    )
  }

  /** Faut-il que la modale d'ajout ouvre l'entretien créé ?
   *  Pendant le geste GUIDÉ de l'étape « Charger un entretien » (premier passage comme re-test),
   *  NON : on reste au Corpus pour que la validation affiche son message « étape terminée ✓ »
   *  (ou « déjà réalisée ») ;
   *  l'ouverture automatique gagnerait la course et l'entretien s'ouvrirait à la place du message,
   *  c'est l'étape suivante qui ouvrira l'entretien. Partout ailleurs, oui : comportement SonalPi1,
   *  l'import ouvre l'entretien. */
  function ouvrirApresImport(): boolean {
    return !(
      etapeActive.value?.parcoursId === 'traitement' && etapeCouranteId.value === 'charger'
    ) && !(
      etapeActive.value?.parcoursId === 'preparation' && etapeCouranteId.value === 'entretien-preparatoire'
    )
  }

  /** Mémorise l'identité de l'entretien créé pendant le parcours de préparation. */
  function enregistrerEntretienCree(id: string, titre: string): void {
    if (
      etapeActive.value?.parcoursId !== 'preparation' ||
      etapeCouranteId.value !== 'entretien-preparatoire' ||
      titre !== 'Entretien préparatoire'
    ) return
    contextesParcours.value = {
      ...contextesParcours.value,
      preparation: { ...contextesParcours.value.preparation, entretienId: id },
    }
  }

  /** Restaure les acquis du corpus ouvert sans relancer de guide ni ouvrir de catalogue. */
  async function raccrocherModeCorpus(
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ): Promise<void> {
    // Aucun guidage ni message ne traverse un changement de corpus.
    generationGuide++
    etapeActive.value = null
    marqueurCourant.value = null
    dossierGuide.value = null
    dernierParcoursId.value = null
    retestInfo.value = null
    finiInfo.value = null
    valideesParParcours.value = {
      preparation: new Set(),
      traitement: new Set(),
      analyse: new Set(),
      organisation: new Set(),
    }
    exportRealise.value = null
    contextesParcours.value = {}
    if (!marqueur || !dir) {
      pasAPas.value = false
      return
    }
    racineSources.value = marqueur.racineSources
    marqueurCourant.value = marqueur
    dossierGuide.value = dir
    pasAPas.value = identiteExemple(marqueur)?.usage === 'apprentissage'
    if (pasAPas.value) {
      const progression = lireProgressionsDemo(marqueur)
      valideesParParcours.value = progression.progressions
      contextesParcours.value = progression.contextes
      parcoursSelectionneId.value = progression.parcoursInitial
      dernierParcoursId.value = progression.dernierParcoursId
      revaliderEtapes()
    }
  }

  /** Observe le résultat enregistré, pas le clic sur le bouton d'export. */
  function enregistrerExportGuide(demande: DemandeLotCorpus, resultat: ResultatLotCorpus): void {
    exportRealise.value = { demande, resultat }
  }

  return {
    enregistrerExportGuide,
    pasAPas,
    racineSources,
    dossierGuide,
    raccrocherModeCorpus,
    catalogueParcours,
    parcoursSelectionneId,
    dernierParcoursId,
    definitionSelectionnee,
    parcoursActifId,
    parcoursActif,
    etatsParcours,
    selectionnerParcours,
    etapes,
    etapeActive,
    etapeCouranteId,
    etapeCourante,
    validees,
    valideesParParcours,
    contextesParcours,
    etatParcours,
    surfaceGuide,
    retestInfo,
    finiInfo,
    activer,
    verifierChargementEtape1,
    verifierChargementEtape2,
    ouvrirApresImport,
    enregistrerEntretienCree,
  }
}
