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
import type { CommandePersonnes } from '../../shared/corpus/personnes'
import type { CommandeNotes } from '../../shared/corpus/notes'
import type { DefinitionAttributCas } from '../../shared/corpus/cas'
import { traitementsLexicoParDefaut } from '../../shared/lexico/traitements'

/**
 *  Scope CORPUS : définitions (codebook, variables), membership (index LÉGER —
 *  titres/dates, jamais le contenu des entretiens) et REQUÊTES corpus (matrice,
 *  usages) obtenues comme projections du main. Isomorphe à `corpus.json` et à
 *  `shared/corpus/` ; ne tient jamais tous les entretiens.
 *
 *  `flush` (injecté) : demande à l'orchestration de sauver l'entretien ouvert
 *  avant un compte d'usages (les codages/valeurs doivent être sur disque) —
 *  dépendance de scope déclarée sans connaître l'éditeur.
 */
export function useCorpus(opts: { flush: () => Promise<void> }) {
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

  async function lirePersonnes() {
    await opts.flush()
    return window.sonal.corpus.personnesInventaire()
  }

  async function commanderPersonnes(commande: CommandePersonnes) {
    await opts.flush()
    return window.sonal.corpus.personnesCommander(toRaw(commande), true)
  }

  return {
    // état
    membership,
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
    revisionPersonnesCorpus: journal.revisionPersonnesCorpus,
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
    lirePersonnes,
    commanderPersonnes,
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
    poserLoc: variables.poserLoc,
    poserGenLibelle: variables.poserGenLibelle,
    poserLocLibelle: variables.poserLocLibelle,
    modaliteParLibelle: variables.modaliteParLibelle,
    poserValeurLot: variables.poserValeurLot,
  }
}
