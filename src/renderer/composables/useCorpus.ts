import { ref, toRaw } from 'vue'
import type { EntretienRef } from '../../shared/format'
import type { Recueil } from '../../shared/corpus/recueils'
import type { Cas, FamilleCas } from '../../shared/corpus/cas'
import type { TableauBord } from '../../shared/corpus/tableaubord'
import { useAnonymisationCorpus } from './corpus/useAnonymisationCorpus'
import { useCategoriesNotesCorpus } from './corpus/useCategoriesNotesCorpus'
import { useJournalCorpus } from './corpus/useJournalCorpus'
import { useThemesCorpus } from './corpus/useThemesCorpus'
import { useVariablesCorpus } from './corpus/useVariablesCorpus'
import type { CommandeCorrectionLocuteurs } from '../../shared/corpus/contratsLocuteurs'
import type { CommandeNotes } from '../../shared/corpus/notes'
import type { DefinitionAttributCas } from '../../shared/corpus/cas'
import { traitementsLexicoParDefaut } from '../../shared/lexico/traitements'
import type { SuiviCorrectionLocuteurs } from '../../shared/corpus/suiviCorrectionsLocuteurs'

/**
 *  Scope CORPUS : définitions (codebook, variables), membership (index LÉGER —
 *  titres/dates, jamais le contenu des entretiens) et REQUÊTES corpus (matrice,
 *  usages) obtenues comme projections du main. Isomorphe à `corpus.crp` et à
 *  `shared/corpus/` ; ne tient jamais tous les entretiens.
 *
 *  `flush` (injecté) : demande à l'orchestration de sauver l'entretien ouvert
 *  avant un compte d'usages (les codages/valeurs doivent être sur disque) —
 *  dépendance de scope déclarée sans connaître l'éditeur.
 */
export function useCorpus(opts: { flush: () => Promise<void>; revision?: () => number }) {
  const suiviLocuteurs = ref<SuiviCorrectionLocuteurs | null>(null)
  const erreurSuiviLocuteurs = ref('')
  const suiviLocuteursCharge = ref(false)
  const revisionSuiviLocuteurs = ref(0)
  let lectureSuivi = 0
  const membership = ref<Record<string, EntretienRef>>({})
  const recueils = ref<Record<string, Recueil>>({})
  const cas = ref<Record<string, Cas>>({})
  const famillesCas = ref<Record<string, FamilleCas>>({})
  const attributsCas = ref<Record<string, DefinitionAttributCas>>({})
  const tableaubord = ref<TableauBord | null>(null)
  const lexico = ref(traitementsLexicoParDefaut())
  const themes = useThemesCorpus(opts)
  const variables = useVariablesCorpus(opts)
  const anonymisation = useAnonymisationCorpus()
  const categoriesNotes = useCategoriesNotesCorpus(opts)
  const journal = useJournalCorpus(opts, {
    rafraichirMatrice: variables.rafraichirMatrice,
    perimerScanAnon: anonymisation.perimerScanAnon,
  })

  async function lireNotes() {
    await opts.flush()
    return window.sonal.corpus.notesInventaire()
  }

  async function commanderNotes(commande: CommandeNotes) {
    await opts.flush()
    return window.sonal.corpus.notesCommander(toRaw(commande))
  }

  async function lireIdentitesLocuteurs() {
    await opts.flush()
    return window.sonal.corpus.inventaireIdentitesLocuteurs()
  }

  async function lireDetailsLocuteurs(pourCorrection = false) {
    await opts.flush()
    return window.sonal.corpus.detailsLocuteursInventaire(pourCorrection)
  }

  async function lireApercuLocuteurs() {
    return (await lireDetailsLocuteurs(true)).inventaire
  }

  async function lireLocuteursCorpus() {
    await opts.flush()
    return window.sonal.corpus.locuteursInventaire()
  }

  async function corrigerLocuteurs(commande: CommandeCorrectionLocuteurs) {
    const revision = opts.revision?.()
    await opts.flush()
    if (revision !== opts.revision?.()) throw new Error('Le corpus a changé. Vérifiez votre sélection dans le corpus courant.')
    try {
      const id = await window.sonal.corpus.corrigerLocuteurs(toRaw(commande))
      if (revision === opts.revision?.()) {
        journal.revisionLocuteursCorpus.value++
        variables.reinitialiserMatrice()
      }
      return id
    } finally { if (revision === opts.revision?.()) revisionSuiviLocuteurs.value++ }
  }

  async function rafraichirSuiviLocuteurs() {
    const revision = opts.revision?.(), jeton = ++lectureSuivi
    try {
      const resultat = await window.sonal.corpus.suiviCorrectionLocuteurs()
      if (revision !== opts.revision?.() || jeton !== lectureSuivi) return
      suiviLocuteurs.value = resultat; erreurSuiviLocuteurs.value = ''; suiviLocuteursCharge.value = true
    } catch (e) {
      if (revision === opts.revision?.() && jeton === lectureSuivi) { erreurSuiviLocuteurs.value = e instanceof Error ? e.message : String(e); suiviLocuteursCharge.value = true }
    }
  }

  function oublierSuiviLocuteurs() {
    lectureSuivi++; suiviLocuteurs.value = null; erreurSuiviLocuteurs.value = ''; suiviLocuteursCharge.value = false
  }

  async function agirSurCorrectionLocuteurs(id: string, action: 'verifier' | 'reprendre' | 'arreter') {
    const revision = opts.revision?.()
    try {
      const resultat = await (action === 'verifier' ? window.sonal.corpus.verifierCorrectionLocuteurs(id)
        : action === 'arreter' ? window.sonal.corpus.arreterCorrectionLocuteurs(id) : window.sonal.corpus.reprendreCorrectionLocuteurs(id))
      if (revision === opts.revision?.()) { journal.revisionLocuteursCorpus.value++; variables.reinitialiserMatrice() }
      return resultat
    } finally { if (revision === opts.revision?.()) revisionSuiviLocuteurs.value++ }
  }

  return {
    // état
    membership,
    suiviLocuteurs, erreurSuiviLocuteurs, suiviLocuteursCharge, revisionSuiviLocuteurs,
    rafraichirSuiviLocuteurs, oublierSuiviLocuteurs,
    reprendreCorrectionLocuteurs: (id: string) => agirSurCorrectionLocuteurs(id, 'reprendre'),
    verifierCorrectionLocuteurs: (id: string) => agirSurCorrectionLocuteurs(id, 'verifier'),
    arreterCorrectionLocuteurs: (id: string) => agirSurCorrectionLocuteurs(id, 'arreter'),
    recueils,
    cas,
    famillesCas,
    attributsCas,
    tableaubord,
    lexico,
    codebook: themes.codebook,
    codeCourant: themes.codeCourant,
    usages: themes.usages,
    resumes: themes.resumes,
    messageTheme: themes.messageTheme,
    variables: variables.variables,
    matrice: variables.matrice,
    matriceChargee: variables.matriceChargee,
    matriceEnCours: variables.matriceEnCours,
    messageVar: variables.messageVar,
    // dérivés / résolveurs
    varsGen: variables.varsGen,
    varsLoc: variables.varsLoc,
    couleurTrait: themes.couleurTrait,
    couleurHex: themes.couleurHex,
    tailleTheme: themes.tailleTheme,
    estCodeActif: themes.estCodeActif,
    peintureSegment: themes.peintureSegment,
    nomTheme: themes.nomTheme,
    modalitesDe: variables.modalitesDe,
    arbreThemes: themes.arbreThemes,
    // chargement / requêtes
    majCodebook: themes.majCodebook,
    majVariables: variables.majVariables,
    rafraichirUsages: themes.rafraichirUsages,
    rafraichirMatrice: variables.rafraichirMatrice,
    reinitialiserMatrice: variables.reinitialiserMatrice,
    // règles corpus et scan anon.
    reglesAnon: anonymisation.reglesAnon,
    scanAnon: anonymisation.scanAnon,
    scanAnonCharge: anonymisation.scanAnonCharge,
    scanAnonPerime: anonymisation.scanAnonPerime,
    scanAnonEnCours: anonymisation.scanAnonEnCours,
    scanAnonErreur: anonymisation.scanAnonErreur,
    dernierScanAnon: anonymisation.dernierScanAnon,
    rafraichirScanAnon: anonymisation.rafraichirScanAnon,
    rafraichirReglesAnon: anonymisation.rafraichirReglesAnon,
    perimerScanAnon: anonymisation.perimerScanAnon,
    reinitialiserScanAnon: anonymisation.reinitialiserScanAnon,
    paramsAnon: anonymisation.paramsAnon,
    majParamsAnon: anonymisation.majParamsAnon,
    // catégories de note (définitions corpus)
    categoriesNote: categoriesNotes.categoriesNote,
    messageCategorieNote: categoriesNotes.messageCategorieNote,
    majCategoriesNote: categoriesNotes.majCategoriesNote,
    nomCategorieNote: categoriesNotes.nomCategorieNote,
    couleurCategorieNote: categoriesNotes.couleurCategorieNote,
    categorieNoteDefaut: categoriesNotes.categorieNoteDefaut,
    ajouterCategorieNote: categoriesNotes.ajouterCategorieNote,
    renommerCategorieNote: categoriesNotes.renommerCategorieNote,
    majCouleurCategorieNote: categoriesNotes.majCouleurCategorieNote,
    supprimerCategorieNote: categoriesNotes.supprimerCategorieNote,
    // Journal du corpus.
    entreesJournalCorpus: journal.entreesJournalCorpus,
    revisionLocuteursCorpus: journal.revisionLocuteursCorpus,
    revisionNotesCorpus: journal.revisionNotesCorpus,
    rafraichirJournalCorpus: journal.rafraichirJournalCorpus,
    annulerEntreeJournalCorpus: journal.annulerEntreeJournalCorpus,
    // thèmes
    ajouterTheme: themes.ajouterTheme,
    ajouterSousTheme: themes.ajouterSousTheme,
    modifierTheme: themes.modifierTheme,
    deplacerTheme: themes.deplacerTheme,
    migrerTheme: themes.migrerTheme,
    lireNotes,
    commanderNotes,
    lireIdentitesLocuteurs,
    lireDetailsLocuteurs,
    lireApercuLocuteurs,
    lireLocuteursCorpus,
    corrigerLocuteurs,
    // variables/modalités
    ajouterVariable: variables.ajouterVariable,
    renommerVariable: variables.renommerVariable,
    basculerPriveeVariable: variables.basculerPriveeVariable,
    ajouterModalite: variables.ajouterModalite,
    ajouterModalitesModele: variables.ajouterModalitesModele,
    renommerModalite: variables.renommerModalite,
    // modèles de modalités réutilisables (« Mes modèles », niveau profil)
    modelesUtilisateur: variables.modelesUtilisateur,
    lireModelesUtilisateur: variables.lireModelesUtilisateur,
    importerModeleUtilisateur: variables.importerModeleUtilisateur,
    // table de données / saisie libre
    poserGen: variables.poserGen,
    poserParticipation: variables.poserParticipation,
    poserGenLibelle: variables.poserGenLibelle,
    poserParticipationLibelle: variables.poserParticipationLibelle,
    modaliteParLibelle: variables.modaliteParLibelle,
    poserValeurLot: variables.poserValeurLot,
  }
}
