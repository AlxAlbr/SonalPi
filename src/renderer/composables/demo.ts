import { ref, watch, computed, type Ref } from 'vue'
import { importerFichier } from '../formatSonal/sas'
import type {
  CorpusFichier,
  EntretienRef,
  Locuteur,
  MarqueurDemo,
  Variable,
  Note,
  ParcoursId,
  ProgressionParcoursDemo,
} from '../../shared/format'
import type { ModeDemo, EtatDemo } from '../../shared/format'
export type { ModeDemo, EtatDemo }
import type { VueApplication } from './espaces'
import type { Annotation } from '../../shared/entretien/annotation'
import type { TableauBord } from '../../shared/corpus/tableaubord'
import type { ResumeDocumentCadre } from '../../shared/docsCadre'
import { etatPresentationParcours, etatsCatalogue, recommanderParcoursSuivant } from './parcours/presentation'
import { creerCatalogue } from './parcours/catalogue'
import { normaliserProgressionsDemo, serialiserProgressionsDemo } from './parcours/marqueur'
import { creerParcoursPreparation } from './parcours/preparation'
import type { DefinitionParcours, EtapeActive, EtapePasAPas, SurfaceGuide } from './parcours/types'
export type { EtapePasAPas } from './parcours/types'

/**
 *  Scope DÉMO « Mini Corpus Test » : construit puis ouvre des corpus de test,
 *  à partir des sources fournies dans `CorpusTest/CorpusSynth/` (SRT et audio),
 *  dans des dossiers choisis par l'utilisateur.
 *  Le builder réutilise le vrai pipeline d'import,
 *  soit `importerFichier` puis `corpus:importer` + `corpus:assignerAudio` :
 *  la démo est produite par le même code qu'un corpus utilisateur.
 *
 *  Deux modes, chacun son propre corpus (choisi dans la modale) :
 *  - `'autonomie'` : les 4 entretiens importés + audios ;
 *  - `'pas-a-pas'` : corpus amorcé vide, rempli étape par étape,
 *    via `importerSource`, guidé par un spotlight global.
 *  Seules les sources sont partagées (copiées une seule fois).
 *  L'identité d'un corpus de test vit dans `corpus.json` :
 *  `{ demo: { mode, racineSources, parcours } }` ; absent = corpus normal,
 *  la démo n'y touche jamais.
 *
 *  Dépendances injectées (patron `useCorpus({ flush })`),
 *  pour éviter le cycle : `appliquerCorpus` est défini dans `creerSonal`.
 */

// Les 4 entretiens et leurs sources proviennent de CorpusTest/CorpusSynth/.
// Ses sous-dossiers srt/ et audio/ sont copiés tels quels chez l'utilisateur,
// et chaque clé ci-dessous EST le nom de fichier et le TITRE de l'entretien.
// Nommage VOLONTAIREMENT sobre : un numéro + un qualificatif NEUTRE,
// du rôle/parcours, sans prénom ni phrase ;
// (a) les étapes se réfèrent au contenu, pas à une personne ;
// (b) montrer des prénoms dans une démo qui TRAITE de pseudonymisation,
// car cela enseignerait le mauvais réflexe.
const SOURCES = ['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants'] as const

export interface DepsDemo {
  appliquerCorpus: (c: CorpusFichier, dir?: string) => Promise<void>
  majDossierCourant: () => Promise<void>
  rafraichirRecents: () => Promise<void>
  /** Affiche le parcours dans l'Accueil du corpus après une fermeture sécurisée. */
  retourParcours: () => Promise<boolean>
  preparerBascule: () => Promise<void>
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

export function utiliserDemo(deps: DepsDemo) {
  /** Catalogue de découverte affiché uniquement en mode `pas-a-pas`. */
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
    const imp = await window.sonal.corpus.importer(k, r.payload, r.codebook, r.variables)
    const audio = await window.sonal.demo.cheminAudio(racine, `audio/${k}.mp3`)
    await window.sonal.corpus.assignerAudio(imp.id, audio)
    return imp.id
  }

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
          return `Cliquez sur « + Ajouter un entretien ». Les sources se trouvent dans « ${racineSources.value} ».`
        }
        if (!document.querySelector('.zone-texte .zone-fichier')) {
          return "Dans cette zone, choisissez le fichier de sous-titres : cliquez, puis sélectionnez srt/1Coordinatrice.srt"
        }
        if (!document.querySelector('.zone-audio .zone-fichier')) {
          return "Bien ! Maintenant le fichier media : cliquez sur cette zone et sélectionnez audio/1Coordinatrice.mp3."
        }
        return "Tout est prêt : cliquez sur « Valider » pour créer l'entretien."
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
        // Dans l'entretien : onglet Notes → « + Note » → champs de la modale de note,
        // chacun guidé à son tour (titre puis corps puis Valider).
        const modale = document.querySelector('.modale-note')
        if (!modale) {
          return deps.ongletDroite.value === 'notes'
            ? '[data-tour="creer-note"]'
            : '[data-tour="onglet-notes"]'
        }
        const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)
          ?.value?.trim()
        const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
        if (!titre && !corps) return '.modale-note .champ-titre-note input'
        if (!corps) return '.modale-note .zone-corps-note'
        return '.modale-note-pied .principal'
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
      finiEnEntretien: true,
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
    titre: 'Traiter ses entretiens',
    resume: 'Importer, documenter, transcrire, pseudonymiser, coder et qualifier.',
    disponible: () => true,
    etapes: etapesTraitement,
  }
  const catalogueParcours = creerCatalogue(definitionPreparation, definitionTraitement)
  const parcoursSelectionneId = ref<ParcoursId>('preparation')
  const dernierParcoursId = ref<ParcoursId | null>(null)
  const catalogueParcoursOuvert = ref(false)
  const valideesParParcours = ref<Record<ParcoursId, Set<string>>>(
    { preparation: new Set(), traitement: new Set(), analyse: new Set() },
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
    return deps.vue.value === 'entretien' ? 'entretien' : 'corpus'
  })
  const retestInfo = ref<{
    parcoursId: ParcoursId
    titre: string
    suite: string
    vue: 'corpus' | 'entretien'
  } | null>(null)
  const finiInfo = ref<{
    parcoursId: ParcoursId
    titre: string
    suite: string
    prochaineId: string | null
    prochaineTitre: string | null
    vue: 'corpus' | 'entretien'
    parcoursSuivantId?: ParcoursId | null
  } | null>(null)

  watch(deps.vue, (vue) => {
    if (retestInfo.value && vue !== retestInfo.value.vue) retestInfo.value = null
    const etape = etapeCourante.value
    if (!etape || !etape.retest || !validees.value.has(etape.id)) return
    const vueRetest: 'corpus' | 'entretien' = etape.retestCorpus ? 'corpus' : 'entretien'
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
  async function ecrireMarqueur(mode: ModeDemo): Promise<void> {
    if (!racineSources.value) return
    await window.sonal.corpus.marquerDemo({
      mode,
      racineSources: racineSources.value,
      parcours: progressionsPersistantes(),
      ...(dernierParcoursId.value ? { dernierParcoursId: dernierParcoursId.value } : {}),
    })
  }

  /** Redérive les acquis observables sans retirer les acquis déjà mémorisés. */
  function revaliderEtapes() {
    let change = false
    const suivantes = { ...valideesParParcours.value }
    for (const definition of catalogueParcours) {
      const cle = definition.id
      const progression = new Set(suivantes[cle])
      for (const etape of definition.etapes) if (etape.fait()) progression.add(etape.id)
      if (progression.size !== suivantes[cle].size) {
        suivantes[cle] = progression
        change = true
      }
    }
    if (change) {
      valideesParParcours.value = suivantes
      void ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
    }
  }

  function selectionnerParcours(parcoursId: ParcoursId) {
    if (!catalogueParcours.some((parcours) => parcours.id === parcoursId && parcours.disponible())) return
    parcoursSelectionneId.value = parcoursId
  }

  function ouvrirCatalogueParcours(parcoursId?: ParcoursId) {
    if (parcoursId) selectionnerParcours(parcoursId)
    catalogueParcoursOuvert.value = true
  }

  function fermerCatalogueParcours() {
    catalogueParcoursOuvert.value = false
  }

  /** Active une étape dans son parcours ; les prérequis restent locaux à ce parcours. */
  function activer(parcoursOuEtape: ParcoursId | string, etapeId?: string) {
    const parcoursId = etapeId ? parcoursOuEtape as ParcoursId : parcoursSelectionneId.value
    const id = etapeId ?? parcoursOuEtape
    const definition = catalogueParcours.find((parcours) => parcours.id === parcoursId)
    if (!definition?.disponible()) return
    const etape = definition.etapes.find((candidate) => candidate.id === id)
    if (!etape) return
    const progression = valideesParParcours.value[parcoursId]
    if (etape.requiere && !progression.has(etape.requiere)) return
    selectionnerParcours(parcoursId)
    dernierParcoursId.value = parcoursId
    catalogueParcoursOuvert.value = false
    void ecrireMarqueur('pas-a-pas')
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
      const cle = active.parcoursId
      const progression = valideesParParcours.value[cle]
      if (progression.has(etape.id)) {
        etapeActive.value = null
        if (etape.retest) {
          if (etape.retestCorpus && !(await deps.retourParcours())) return
          retestInfo.value = {
            parcoursId: active.parcoursId,
            titre: etape.titre,
            suite: etape.retest(),
            vue: etape.retestCorpus ? 'corpus' : 'entretien',
          }
        }
        return
      }

      valideesParParcours.value = {
        ...valideesParParcours.value,
        [cle]: new Set(progression).add(etape.id),
      }
      etapeActive.value = null
      await ecrireMarqueur(pasAPas.value ? 'pas-a-pas' : 'autonomie')
      const definition = catalogueParcours.find((parcours) => parcours.id === active.parcoursId)!
      const index = definition.etapes.findIndex((candidate) => candidate.id === etape.id)
      const candidate = definition.etapes[index + 1]
      const progressionApres = valideesParParcours.value[cle]
      const suite = candidate && (!candidate.requiere || progressionApres.has(candidate.requiere))
        ? candidate
        : null
      const resterEnEntretien = !!etape.finiEnEntretien
      if (!resterEnEntretien) {
        if (deps.tableauBordOuverts.value) deps.fermerTableauBord()
        if (deps.docsCadreOuverts.value) deps.fermerDocsCadre()
        if (!(await deps.retourParcours())) return
      }
      if (etape.fini) {
        const etat = etatPresentationParcours(definition.etapes, progressionApres)
        finiInfo.value = {
          parcoursId: active.parcoursId,
          titre: `« ${etape.titre} » : terminé ✓`,
          suite: etape.fini(),
          prochaineId: suite?.id ?? null,
          prochaineTitre: suite?.titre ?? null,
          vue: resterEnEntretien ? 'entretien' : 'corpus',
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
    // Le garde vaut pour le MODE pas-à-pas entier (spotlight en cours ou non,
    // réouverture par « Récents », « Arrêter », …), pas seulement pendant le guidage ;
    // un 1Coordinatrice sans audio ne doit jamais pouvoir satisfaire l'étape.
    // SAUF si une AUTRE étape est activement guidée (ex. 2a « Prendre des notes à chaud »
    // mène son propre import audio seul AVANT l'étape 1 ; c'est elle qui garde, pas 1).
    if (!pasAPas.value || valideesParParcours.value.traitement.has('charger')) return null
    if (parcoursSelectionneId.value !== 'traitement') return null
    if (etapeActive.value && (
      etapeActive.value.parcoursId !== 'traitement' || etapeCouranteId.value !== 'charger'
    )) return null
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
    const base = (p: string | null) => p?.replace(/^.*[\/]/, '') ?? null
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

  /** Prépare le corpus de test du mode demandé puis l'ouvre.
   *  Chaque mode a son propre dossier (choisi dans la modale) ; seules les sources sont partagées.
   *  Étapes : 1. copier les sources bundled une fois (idempotent) ; 2.
   *  ouvrir le dossier du corpus de ce mode ; 3. 'autonomie' :
   *  importer les 4 entretiens + leurs audios ; 4. poser le marqueur démo (identité + historique) ;
   *  5. appliquer le corpus au modèle et atterrir sur la vue Corpus. */
  async function preparer(
    mode: ModeDemo,
    opts?: { racineSources?: string; dossierCorpus?: string },
  ): Promise<void> {
    if (enPreparation.value) return
    enPreparation.value = true
    try {
      if (opts?.racineSources) racineSources.value = opts.racineSources
      // Le dossier du corpus de CE mode : choisi dans la modale,
      // ou mémorisé (re-préparation « un clic »). Chaque mode a son dossier, indépendant.
      const dossierCorpus =
        opts?.dossierCorpus ?? (mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value)
      if (!racineSources.value || !dossierCorpus) return // ne devrait pas arriver (modale)
      if (mode === 'pas-a-pas') corpusPasAPas.value = dossierCorpus
      else corpusAutonomie.value = dossierCorpus

      // 1. LA seule copie du flow de démo (~13 Mo) — idempotente par complétude.
      await window.sonal.demo.copierSources(racineSources.value)
      // 2. Ouvrir (amorcer si neuf) le dossier du corpus de CE mode.
      await deps.preparerBascule()
      const res = await window.sonal.corpus.ouvrirDossier(dossierCorpus)
      if (!res) return
      await deps.majDossierCourant()
      await deps.rafraichirRecents()

      // 3. Mode autonomie : peupler avec les 4 entretiens + audios. Idempotent :
      // on ne ré-importe PAS un entretien dont le TITRE source existe déjà,
      // sinon la re-préparation dupliquerait 1Coordinatrice…4Etudiants.
      if (mode === 'autonomie') {
        const titresExistants = new Set(Object.values(res.corpus.membership).map((m) => m.titre))
        for (const k of SOURCES) {
          if (titresExistants.has(k)) continue
          await importerSource(k, racineSources.value)
          titresExistants.add(k)
        }
      }

      // 4. Marqueur démo : identité du corpus de test (mode + sources + historique).
      // On CONSERVE l'historique existant du même mode ; une re-préparation « un clic »
      // ne doit pas effacer les étapes faites.
      const histo = res.corpus.demo
      const parcours = histo?.mode === mode
        ? (histo.parcours ?? (histo.validees
          ? { traitement: { validees: histo.validees } }
          : {}))
        : {}
      await window.sonal.corpus.marquerDemo({
        mode,
        racineSources: racineSources.value,
        parcours,
        ...(histo?.mode === mode && histo.dernierParcoursId
          ? { dernierParcoursId: histo.dernierParcoursId }
          : {}),
      })

      // 5. Appliquer le corpus marqué au modèle.
      // Cette opération restaure le parcours dans l'Accueil et son historique.
      const c = await window.sonal.corpus.ouvrir()
      await deps.appliquerCorpus(c, dossierCorpus)
      deps.vue.value = 'corpus'
      if (mode === 'pas-a-pas') {
        // Pré-crée une variable « Ville » (portée locuteur, saisie libre)
        // pour l'étape « Saisir une variable » —
        // UNE fois seulement (ajouterVariable ne déduplique pas par libellé).
        if (!deps.variables.value.some((v) => v.lib === 'Ville')) {
          await window.sonal.corpus.ajouterVariable('Ville', 'locuteur')
          await deps.appliquerCorpus(await window.sonal.corpus.ouvrir(), dossierCorpus)
        }
        // L'entrée générale ouvre le choix des parcours, sans lancer d'étape.
        etapeActive.value = null
        catalogueParcoursOuvert.value = true
      }
      // Mémoire démo PERSISTÉE (settings.json) : sources + dossier de CE mode (l'autre mode,
      // s'il existe, est préservé). Les cartes de l'Accueil restent « un clic »
      // quand les dossiers existent ; la modale saute les questions déjà répondues (ex.
      // « où importer les sources »).
      await window.sonal.demo.memoriser({
        racineSources: racineSources.value,
        corpusPasAPas: mode === 'pas-a-pas' ? dossierCorpus : (corpusPasAPas.value ?? undefined),
        corpusAutonomie: mode === 'autonomie' ? dossierCorpus : (corpusAutonomie.value ?? undefined),
      })
    } finally {
      enPreparation.value = false
    }
  }

  /** Recharge la mémoire démo persistée (settings.json) : dossiers (sources et corpus de chaque mode)
   *  et présence réelle sur disque. L'Accueil décide ensuite : « un clic » si tout est en place,
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

  /** « Un clic » possible pour un mode : sources ET corpus de CE mode connus (mémorisés)
   *  et présents sur disque → re-préparation directe, sans modale. */
  function pretUnClic(mode: ModeDemo): boolean {
    const corpus = mode === 'pas-a-pas' ? corpusPasAPas.value : corpusAutonomie.value
    const present =
      mode === 'pas-a-pas' ? corpusPasAPasPresent.value : corpusAutonomiePresent.value
    return !!racineSources.value && sourcesPresentes.value && !!corpus && present
  }

  /** Restaure le mode démo à l'ouverture d'un corpus, à partir de son marqueur `corpus.json:
   *  { demo }`. Pour un corpus 'pas-a-pas' : rappelle où sont les sources,
   *  remonte le panneau et restaure l'historique des étapes validées.
   *  Pour tout autre corpus (normal ou 'autonomie') : éteint le panneau. */
  async function raccrocherModeCorpus(
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ): Promise<void> {
    // Aucun guidage ni message ne traverse un changement de corpus.
    etapeActive.value = null
    catalogueParcoursOuvert.value = false
    dernierParcoursId.value = null
    retestInfo.value = null
    finiInfo.value = null
    valideesParParcours.value = {
      preparation: new Set(),
      traitement: new Set(),
      analyse: new Set(),
    }
    contextesParcours.value = {}
    if (!marqueur || !dir) {
      pasAPas.value = false
      return
    }
    racineSources.value = marqueur.racineSources
    pasAPas.value = marqueur.mode === 'pas-a-pas'
    if (pasAPas.value) {
      const normalise = normaliserProgressionsDemo(marqueur)
      valideesParParcours.value = normalise.progressions
      contextesParcours.value = normalise.contextes
      parcoursSelectionneId.value = normalise.parcoursInitial
      dernierParcoursId.value = normalise.dernierParcoursId
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
    catalogueParcours,
    parcoursSelectionneId,
    dernierParcoursId,
    catalogueParcoursOuvert,
    ouvrirCatalogueParcours,
    fermerCatalogueParcours,
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
