import { computed, ref, watch, nextTick, onMounted, onScopeDispose, provide, inject, type InjectionKey } from 'vue'
import { compterValeursVariable, effacerValeursVariable } from '../../shared/corpus/requetes'
import { useRetoursContextuels } from './useRetoursContextuels'
import { useContextesPanneaux } from './useContextesPanneaux'
import { capturerAffichage, capturerSelection } from './contexteVisuel'
import {
  resumerAssociationsPassage,
  type ResumeAssociationsPassage,
} from '../editor/associationsPassage'
import { preparerFermetureEntretien } from '../couturesApplication'
import type { MarqueurDemo, ModeTriEntretiens } from '../../shared/format'
import type { NavigationProjet } from '../../shared/navigationProjet'
import type { EtatMenuApplication } from '../../shared/menuApplication'
import { MOTS_LIAISON_DEFAUT } from '../../shared/format'
import { useProfil } from './useProfil'
import { afficherErreurGlobale, infoGlobale } from '../erreurs'
import { useCorpus } from './useCorpus'
import { useSelectionCorpus } from './corpus/useSelectionCorpus'
import { useMediasCorpus } from './corpus/useMediasCorpus'
import { useDistantCorpus, verifierTriContenu } from './corpus/useDistantCorpus'
import { useCycleCorpus } from './corpus/useCycleCorpus'
import { useOperationsCorpus } from './corpus/useOperationsCorpus'
import { useRecueilsCorpus } from './corpus/useRecueilsCorpus'
import { useDocsCadre } from './corpus/useDocsCadre'
import { useCasCorpus } from './corpus/useCasCorpus'
import { useTableauBordCorpus } from './corpus/useTableauBordCorpus'
import { useLexicoCorpus } from './corpus/useLexicoCorpus'
import { useSyntheseCorpus } from './corpus/useSyntheseCorpus'
import { useSourcesAnalyseCorpus } from './corpus/useSourcesAnalyseCorpus'
import { useAnalysesCroisees } from './corpus/useAnalysesCroisees'
import { useEspacesTravail } from './useEspacesTravail'
import type { SousEspaceAnalyse, SousEspaceOrganisation, SousEspacePreparation, VueApplication } from './espaces'
import { useEntretien } from './useEntretien'
import { useAudio } from './useAudio'
import { useGuide } from './parcours/useGuide'
import { useExemples } from './useExemples'
import type { DestinationGuide } from './parcours/types'
import {
  installerOperationGlobaleCorpus,
  lancerOperationGlobale,
} from '../operationGlobaleCorpus'

/**
 *  ORCHESTRATION applicative : instancie et COUD les trois scopes (profil,
 *  corpus, entretien) et porte la navigation. Créé UNE fois par l'App (`fournirSonal`),
 *  `provide`/`inject` aux composants de vue → tous partagent le même éditeur et le
 *  même modèle (les composables ne sont pas ré-instanciés).
 */
export function creerSonal() {
  const profil = useProfil()

  // Indirection pour casser le cycle : le scope corpus doit sauver l'entretien ouvert avant un compte d'usages (`flush`),
  // mais l'entretien est créé APRÈS le corpus, qui lui injecte `couleurTrait` ; on route `flush` via un holder réaffecté.
  let sauverEntretien: () => Promise<void> = async () => {}
  let publierAvantSuppressionDefinition: () => Promise<boolean> = async () => true
  let demanderDissociationCorpus: (
    regleId: string,
    cible: 'entretien' | 'brouillon',
    entite: string,
  ) => Promise<boolean> = async () => false
  const demandeDissociationAnon = ref<{ regleId: string; revision: number } | null>(null)
  // Le cycle du corpus est créé avant le guide.
  // Ce rappel lui transmet ensuite l'identité et les acquis du corpus ouvert.
  let raccrocherModeCorpus: (
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ) => Promise<void> = async () => {}
  let racineSourcesExercice: () => string | null = () => null
  let distantActifPourMedias: () => boolean = () => false
  let fournisseurPourMedias: () => 'webdav' | 'gitlab' | null = () => null
  let etatBasePourMedias: () => 'sans-objet' | 'configuree' | 'non-configuree' | 'secret-indisponible' = () => 'sans-objet'
  let actualiserDistantPourMedias: (silencieux?: boolean) => Promise<boolean> = async () => false
  let reinitialiserOutilsCorpus: () => void = () => {}
  const corpus = useCorpus({ flush: () => sauverEntretien() })

  // Scope AUDIO : le lecteur de l'entretien ouvert.
  // Les trois consommateurs (LecteurAudio en haut, barre sur la forme d'onde, bloc-lu de l'éditeur)
  // se coordonnent par cet état réactif partagé.
  const audio = useAudio()
  let entretienActifPourRaccourcis = () => true

  const ent = useEntretien({
    actif: () => entretienActifPourRaccourcis(),
    couleurTrait: corpus.couleurTrait, // le marquage résout la couleur d'un code (corpus)
    tailleTrait: corpus.tailleTheme, // …et sa taille de police (parité SonalPi1)
    // Un thème inactif est masqué du marquage et refusé au codage (scope entretien).
    estCodeActif: corpus.estCodeActif,
    apresSauvegarde: async () => {
      corpus.perimerScanAnon()
      await corpus.rafraichirUsages()
    },
    codeExtraits: () => corpus.codeCourant.value, // filtre de la requête Extraits
    nomCode: (code) => corpus.nomTheme(code), // libellés du journal (noms au corpus)
    themeExiste: (id) => corpus.codebook.value.some((theme) => theme.id === id),
    valeurExiste: (idVar, idMod) => {
      const variable = corpus.variables.value.find((v) => v.id === idVar)
      return !!variable && (idMod === null || variable.modalites.some((m) => m.id === idMod))
    },
    // Catégories de note : définitions au corpus, résolues ici pour le scope entretien (nom affichable + défaut du formulaire de création).
    nomCategorieNote: (id) => corpus.nomCategorieNote(id),
    categorieNoteDefaut: () => corpus.categorieNoteDefaut(),
    reglesAnon: () => corpus.reglesAnon.value, // règles corpus (menu multi-pseudo, promotions 3b)
    rafraichirReglesCorpus: () => corpus.rafraichirReglesAnon(),
    publierAvantSuppressionDefinition: () => publierAvantSuppressionDefinition(),
    demanderDissociationCorpus: (id, cible, entite) => demanderDissociationCorpus(id, cible, entite),
    prioriteAnon: () => corpus.paramsAnon.value.prioriteValidation, // étape 4a : portée d'Entrée
    // Mots de liaison : suggestion d'entité-cœur à la validation d'une entité à affixe.
    motsLiaison: () =>
      corpus.paramsAnon.value.motsLiaison ?? { actif: true, liste: [...MOTS_LIAISON_DEFAUT] },
    thematiques: () =>
      corpus.paramsAnon.value.thematiques ?? { actif: false, liste: ['PER', 'LOC', 'ORG', 'DAT'] }, // 4c
    categoriserRegle: async (id, cat) => {
      await window.sonal.corpus.regleAnonCategoriser(id, cat)
      await corpus.rafraichirScanAnon() // la projection des lignes relit la règle fraîche
    },
    lectureSeule: () => !distant.entretienEditable.value, // aucune écriture d'entretien si la session n'est pas éditable
    entretienEditable: () => distant.entretienEditable.value,
    libelleValeur: (idVar, idMod) => {
      const v = corpus.variables.value.find((x) => x.id === idVar)
      const nomVar = v?.lib ?? idVar
      if (!idMod) return `${nomVar} effacée`
      return `${nomVar} = ${v?.modalites.find((m) => m.id === idMod)?.lib ?? idMod}`
    },
    // Clic sur la gouttière → seek au début du tour (si un audio est chargé).
    clicTour: (posBloc) => {
      if (!audio.url.value) return
      const t = ent.tempsDuBloc(posBloc)
      if (t != null) audio.seek(t)
    },
    // Clic DANS le texte → seek au temps interpolé à cet endroit,
    // la barre sur la forme d'onde suit, play reprend là.
    clicTexte: (pos) => {
      if (!audio.url.value) return
      const t = ent.tempsAuTexte(pos)
      if (t != null) audio.seek(t)
    },
    // Double-espace dans le texte = play/pause. Ne bascule (et ne signale d'avoir
    // agi) que si un audio est chargé.
    basculerLecture: () => {
      if (!audio.url.value) return false
      audio.basculer()
      return true
    },
    decalerLecture: (secondes) => {
      if (!audio.url.value) return false
      audio.decaler(secondes)
      return true
    },
  })
  sauverEntretien = ent.viderSauvegarde

  // La lecture avance → le bloc lu suit (surlignage + défilement).
  // Décharger l'audio (url null) éteint le surlignage.
  watch(audio.position, (t) => ent.majPlageLue(audio.url.value ? t : null))
  watch(audio.url, (u) => {
    if (!u) ent.majPlageLue(null)
  })

  // --- Navigation : Accueil → espaces de travail → traitement (Corpus → Entretien). ---
  const vue = ref<VueApplication>('corpus')
  entretienActifPourRaccourcis = () => vue.value === 'entretien'
  const espaces = useEspacesTravail({ vue })
  const {
    ongletCorpus,
    panneauCasActif,
    enregistrerNavigationCorpus,
    choisirOngletCorpus,
    vueTraitement,
    sousEspacePreparation,
    sousEspaceAnalyse,
    panneauAnalyseVisible,
    preparationActive,
    analyseActive,
    entrerPreparation: selectionnerPreparation,
    sousEspaceOrganisation,
    organisationActive,
    panneauRecueilsActif,
    entrerAnalyse: selectionnerAnalyse,
    entrerOrganisation: selectionnerOrganisation,
    tableauBordOuverts,
    docsCadreOuverts,
    documentsExemplesOuverts,
    documentsOuverts,
    analysesCroiseesOuvertes,
    revenirTraitement,
    basculerPanneauAnalyse,
    afficherPanneauAnalyse,
    reinitialiserEspaces,
  } = espaces

  let navigationProjetActive = false
  let cleNavigationProjet: string | null = null
  let ecrituresNavigation = Promise.resolve()

  function navigationProjetCourante(): NavigationProjet | null {
    if (vue.value === 'accueil') return null
    if (vue.value === 'entretien') return { vue: 'corpus', onglet: 'accueil' }
    if (vue.value === 'preparer') {
      return { vue: 'preparer', onglet: sousEspacePreparation.value }
    }
    if (vue.value === 'analyser') {
      return {
        vue: 'analyser',
        onglet: sousEspaceAnalyse.value,
        panneauVisible: panneauAnalyseVisible.value,
      }
    }
    if (vue.value === 'organiser') {
      return { vue: 'organiser', onglet: sousEspaceOrganisation.value }
    }
    return {
      vue: 'corpus',
      onglet: ongletCorpus.value === 'recherche' ? 'accueil' : ongletCorpus.value,
    }
  }

  function memoriserNavigationProjet(): void {
    if (!navigationProjetActive || !cleNavigationProjet) return
    const navigation = navigationProjetCourante()
    if (!navigation) return
    const cle = cleNavigationProjet
    ecrituresNavigation = ecrituresNavigation
      .catch(() => undefined)
      .then(() => window.sonal.profil.memoriserNavigationProjet(cle, navigation))
      .catch(() => undefined)
  }

  function suspendreNavigationProjet(): void {
    navigationProjetActive = false
  }

  function reactiverNavigationProjet(): void {
    navigationProjetActive = cleNavigationProjet !== null
    memoriserNavigationProjet()
  }

  /** Première ouverture de CE corpus sur ce poste : l'aiguillage s'affiche
   *  par-dessus l'accueil de « Préparer et suivre » et se referme au choix. */
  const premiereOuvertureCorpus = ref(false)
  /** Corpus d'exemple ou d'apprentissage : son propre catalogue guide déjà les
   *  premiers pas, l'aiguillage resterait une fenêtre de plus. */
  const corpusDemo = ref(false)

  async function restaurerNavigationProjet(): Promise<void> {
    premiereOuvertureCorpus.value = false
    let navigation: NavigationProjet | null = null
    try {
      const memoire = await window.sonal.profil.lireNavigationProjet()
      cleNavigationProjet = memoire.cle
      navigation = memoire.navigation
    } catch {
      cleNavigationProjet = null
    }

    try {
      if (!navigation) {
        await entrerPreparation('accueil')
        premiereOuvertureCorpus.value = !corpusDemo.value
      } else if (navigation.vue === 'preparer') await entrerPreparation(navigation.onglet)
      else if (navigation.vue === 'analyser') {
        panneauAnalyseVisible.value = navigation.panneauVisible
        await entrerAnalyse(navigation.onglet)
      } else if (navigation.vue === 'organiser') {
        await entrerOrganisation(navigation.onglet)
      } else {
        ongletCorpus.value = navigation.onglet
        vue.value = 'corpus'
      }
    } catch {
      selectionnerPreparation('accueil')
    }

    navigationProjetActive = cleNavigationProjet !== null
    memoriserNavigationProjet()
  }

  watch(
    [
      vue,
      sousEspacePreparation,
      sousEspaceAnalyse,
      sousEspaceOrganisation,
      ongletCorpus,
      panneauAnalyseVisible,
    ],
    memoriserNavigationProjet,
    { flush: 'sync' },
  )

  // La vue Corpus enregistre le gestionnaire de cette navigation.
  // Lui seul sélectionne son Accueil en respectant les gardes locales.
  type GestionnaireParcours = (
    parcoursId?: import('../../shared/format').ParcoursId,
  ) => Promise<boolean>
  let gestionnaireParcours: GestionnaireParcours | null = null
  function enregistrerNavigationParcours(gestionnaire: GestionnaireParcours): () => void {
    gestionnaireParcours = gestionnaire
    return () => {
      if (gestionnaireParcours === gestionnaire) gestionnaireParcours = null
    }
  }

  const selectionCorpus = useSelectionCorpus({
    variables: corpus.variables,
    lireEntretien: (id) => window.sonal.corpus.lireEntretien(id),
  })
  const {
    corpusSelId,
    corpusSelMeta,
    selectionnerCorpus,
    rafraichirMetaSelection,
    deselectionnerCorpus,
    reinitialiser: reinitialiserSelectionCorpus,
  } = selectionCorpus
  // Confirmation de suppression d'un thème, depuis l'écran Corpus comme depuis l'entretien (orchestration).
  //  `n` : codages dans l'entretien ouvert ; `autres` : codages dans les autres entretiens ;
  //  `partage` : corpus distant, où l'on ne peut pas retirer des codages d'autres entretiens.
  const themeASupprimer = ref<{ id: string; nom: string; n: number; autres: number; partage: boolean } | null>(null)
  // Même principe pour une variable ou une modalité (`idMod`) : `n` et `autres` comptent des valeurs saisies,
  //  `cas` les règles ou dérivations des cas qui s'en servent et empêchent la suppression.
  const donneeASupprimer = ref<{
    idVar: string; idMod?: string; nom: string; n: number; autres: number; cas: number; partage: boolean
  } | null>(null)

  const mediasCorpus = useMediasCorpus({
    membership: corpus.membership,
    selection: {
      corpusSelId,
      corpusSelMeta,
      rafraichirMetaSelection,
    },
    entretien: {
      ouvertId: ent.ouvertId,
      meta: ent.meta,
      sauver: ent.sauver,
      reouvrir: ent.ouvrir,
    },
    chargerLecteur: audio.charger,
    perimerScanAnon: corpus.perimerScanAnon,
    choisirSrt: () => window.sonal.dialog.choisirSrt(racineSourcesExercice() ?? undefined),
    distantActif: () => distantActifPourMedias(),
    fournisseurDistant: () => fournisseurPourMedias(),
    etatBaseMedia: () => etatBasePourMedias(),
    actualiserDistant: (silencieux) => actualiserDistantPourMedias(silencieux),
  })
  const {
    audiosCorpus,
    audiosManquants,
    srtASurEcrire,
    srtMessage,
    designationAudioId,
    etatAudioOuvert,
    majAudiosInaccessibles,
    rafraichirAudios,
    rafraichirIntegriteAudios,
    genererOnde,
    regenererOndesManquantes,
    urlWaveform,
    majAudioEntretien,
    assignerAudioSelection,
    effacerAudioSelection,
    demanderSrt,
    confirmerSrt,
    reassignerAudioEntretienOuvert,
    associerAudioEntretienOuvert,
    rapatrierAudioMaintenant,
    lireAudioDistant,
    lireAudioLocal,
    preparationLectureDistante,
    lectureDistanteActive,
    mediaDistantDesigne,
    audioLocalDisponible,
    creerEntretienVideDistant,
    ouvrirDesignationAudio,
    fermerDesignationAudio,
    confirmerDesignationAudio,
  } = mediasCorpus

  // Quitter l'écran entretien met la lecture en PAUSE : le lecteur n'est visible
  // que là, pas de lecture fantôme sans commandes à l'écran. Consulter un autre
  // espace suit la même règle ; l'entretien, lui, reste monté en arrière-plan.
  watch(vue, (v) => {
    if (v !== 'entretien') audio.pause()
  })

  // Le corpus met à jour `codebook` (recolorer / (dés)activer / supprimer un thème)
  // → l'entretien redessine le marquage (couplage inter-scope par OBSERVATION).
  watch(corpus.codebook, () => ent.rafraichirDecorations())
  // Ouvrir l'onglet Données (écran entretien) rafraîchit la matrice corpus (requête).
  watch(ent.ongletDroite, (v) => {
    if (v === 'donnees') corpus.rafraichirMatrice()
  })

  let rafraichirCorpusDepuisDistant: () => Promise<void> = async () => {}
  let nettoyerMiroirDepuisDistant: () => void = () => {}
  let reinitialiserDivergenceDepuisDistant: () => void = () => {}
  let proposerFusionDepuisCycle: (id: string) => Promise<void> = async () => {}

  const distant = useDistantCorpus({
    vue,
    entretien: {
      ouvertId: ent.ouvertId,
      verrouAutrui: () => ent.verrouAutrui.value !== null,
      sauver: ent.sauver,
      viderSauvegarde: ent.viderSauvegarde,
      preserverEtAnnulerSauvegarde: ent.preserverEtAnnulerSauvegarde,
      annulerEtAttendreSauvegarde: ent.annulerEtAttendreSauvegarde,
    },
    effets: {
      rafraichirCorpusSansFermer: () => rafraichirCorpusDepuisDistant(),
      nettoyerMiroirChange: () => nettoyerMiroirDepuisDistant(),
      detecterDivergencesAnon: ent.detecterDivergencesPostTirage,
      majAudiosInaccessibles,
      reinitialiserDivergence: () => reinitialiserDivergenceDepuisDistant(),
      rendreEditeurEditable: (editable) => ent.editor.value?.setEditable(editable),
    },
  })
  const {
    idDistantCourant,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    lectureSeule,
    ajoutEntretienPossible,
    fournisseurCourant,
    etatBaseMedia,
    verrousIndisponibles,
    entretienEditable,
    enLigne,
    badgesVerrous,
    badgeVerrou,
    presences,
    presencesSur,
    orphelinsDistants,
    statutSession,
    publiErreur,
    activerDistant,
    rafraichirOrphelins,
    quitterDistant,
    actualiserDistant,
    capacites,
    gesteDisponible,
    tableLigneEditable,
    pseudonymisationLigneEditable,
    metaEditables,
    designationMediaPossible,
    renommagePossible,
    suppressionPossible,
    reprendreOrphelin,
    abandonnerOrphelin,
    appliquerStatutSession,
    publierMaintenant,
  } = distant
  installerOperationGlobaleCorpus({
    compterEntretiens: () => Object.keys(corpus.membership.value).length,
    estCorpusGitLab: () => fournisseurCourant.value === 'gitlab',
    compterVerrousAutrui: () => Object.keys(badgesVerrous.value).length,
  })
  distantActifPourMedias = () => idDistantCourant.value !== null
  fournisseurPourMedias = () => fournisseurCourant.value
  etatBasePourMedias = () => etatBaseMedia.value
  actualiserDistantPourMedias = actualiserDistant
  publierAvantSuppressionDefinition = async () => {
    if (idDistantCourant.value === null) {
      await ent.sauver()
      return true
    }
    return publierMaintenant()
  }

  const cycleCorpus = useCycleCorpus({
    vue,
    profil,
    corpus,
    entretien: {
      ouvertId: ent.ouvertId,
      verrouAutrui: () => ent.verrouAutrui.value !== null,
      ouvrir: ent.ouvrir,
      reinitialiser: ent.reinitialiser,
      viderSauvegarde: ent.viderSauvegarde,
      annulerEtAttendreSauvegarde: ent.annulerEtAttendreSauvegarde,
      positionTexte: () => ent.editor.value?.state.selection.from ?? null,
      allerAuTexte: ent.allerAuTexte,
    },
    audio: {
      position: audio.position,
      largeurVideo: audio.largeurVideo,
      estCharge: () => audio.url.value !== null,
      charger: audio.charger,
      seek: audio.seek,
      definirLargeurVideo: audio.definirLargeurVideo,
    },
    medias: {
      rafraichirAudios,
      rafraichirIntegriteAudios,
      regenererOndesManquantes,
      majAudioEntretien,
    },
    distant: {
      idCourant: idDistantCourant,
      lectureSeule,
      entretienEditable,
      statutSession,
      activer: activerDistant,
      rafraichirOrphelins,
      quitter: quitterDistant,
      appliquerStatutSession,
    },
    effets: {
      reinitialiserSelection: reinitialiserSelectionCorpus,
      reinitialiserOutilsCorpus: () => reinitialiserOutilsCorpus(),
      deselectionner: deselectionnerCorpus,
      apresOuvertureEntretien: (id) => proposerFusionDepuisCycle(id),
      raccrocherModeCorpus: (marqueur, dir) => raccrocherModeCorpus(marqueur, dir),
      suspendreNavigationProjet,
      restaurerNavigationProjet,
      reactiverNavigationProjet,
    },
  })
  const {
    dossierCourantDir,
    revisionCorpus,
    reprise,
    appliquerCorpus,
    chargerCorpus,
    preparerBascule,
    choisirDossier,
    creerNouveauCorpus,
    ouvrirRecent,
    ouvrirCorpusWebDAV,
    ouvrirDestinationGitLab,
    enregistrerEtOuvrirGitLab,
    creerEtOuvrirGitLab,
    migrerGitLab,
    reprendreMigrationGitLab,
    creerCorpusWebDAV,
    oublierDestinationWebDAV,
    rafraichirCorpusSansFermer,
    nettoyerMiroirChange,
    retourCorpus,
    allerAccueil,
    ouvrirEntretien,
    fermerEntretien,
    reprendre,
  } = cycleCorpus
  watch(revisionCorpus, () => { demandeDissociationAnon.value = null })
  demanderDissociationCorpus = async (regleId, cible, entite) => {
    if (!gesteDisponible('dissociationGlobale') || lectureSeule.value) return false
    const entretienId = ent.ouvertId.value
    if (!entretienId) return false
    let engagee = false
    const executee = await lancerOperationGlobale(async () => {
      await ent.sauver()
      const premier = await window.sonal.corpus.apercuDissociationAnon({ regleId })
      const autres = premier.entretiens.filter((e) => e.id !== entretienId && e.annotations > 0)
      if (autres.length) {
        const suite = cible === 'brouillon'
          ? `Pour remettre cette règle en chantier dans cet entretien, ses usages dans ${autres.length} autre(s) entretien(s) doivent d’abord devenir locaux.`
          : `Cette règle est aussi utilisée dans ${autres.length} autre(s) entretien(s). Tous ses usages devront devenir locaux.`
        if (!window.confirm(`${suite}\n\nL’entretien courant sera enregistré et fermé avant le bilan. Continuer ?`)) return
      }
      engagee = true
      const revision = revisionCorpus.value
      await retourCorpus()
      if (vue.value !== 'corpus' || revisionCorpus.value !== revision || !gesteDisponible('dissociationGlobale') || lectureSeule.value) return
      await corpus.rafraichirReglesAnon(false)
      if (revisionCorpus.value !== revision) return
      if (autres.length) {
        demandeDissociationAnon.value = { regleId, revision }
        return
      }
      const frais = await window.sonal.corpus.apercuDissociationAnon({ regleId })
      const cibles = frais.entretiens.filter((e) => e.annotations > 0)
      if (!frais.faisable || !frais.applicationDisponible || cibles.length !== 1 || cibles[0].id !== entretienId) {
        demandeDissociationAnon.value = { regleId, revision }
        return
      }
      const bilan = await window.sonal.corpus.dissocierRegleAnon(frais.token, true)
      if ('statut' in bilan && bilan.statut !== 'termine') {
        demandeDissociationAnon.value = { regleId, revision }
        return
      }
      await corpus.rafraichirReglesAnon(false)
      await reprendre()
      if (ent.ouvertId.value !== entretienId) throw new Error("L’entretien n’a pas pu être rouvert après la modification.")
      if (cible === 'brouillon') {
        const ligneLocale = ent.lignesAnon.value.find((ligne) => ligne.entite === entite)
        if (!ligneLocale || ligneLocale.etat !== 'entretien') {
          throw new Error(`La règle dissociée n’est pas disponible comme règle locale (${ligneLocale?.etat ?? 'absente'}).`)
        }
        await ent.changerPorteeAnon(entite, 'brouillon')
        await ent.sauver()
      }
    }, { confirmation: 'deja-confirmee', message: '' })
    return executee && engagee
  }
  rafraichirCorpusDepuisDistant = rafraichirCorpusSansFermer
  nettoyerMiroirDepuisDistant = nettoyerMiroirChange

  const operationsCorpus = useOperationsCorpus({
    vue,
    corpus: {
      ...corpus,
      lirePersonnes: corpus.lirePersonnes,
    },
    entretien: {
      ouvertId: ent.ouvertId,
      ongletDroite: ent.ongletDroite,
      editeurDisponible: () => ent.editor.value !== null,
      sauver: ent.sauver,
      donneesExport: ent.donneesExport,
      fusionPossible: ent.fusionPossible,
      absorberFusion: ent.absorberFusion,
      allerAuTexte: ent.allerAuTexte,
    },
    cycle: {
      appliquerCorpus,
      preparerBascule,
      ouvrirEntretien,
      fermerEntretien,
      reprise,
    },
    profil: {
      dossierCourantNom: profil.dossierCourantNom,
      rafraichirRecents: profil.rafraichirRecents,
    },
    medias: {
      genererOnde,
      rafraichirAudios,
      regenererOndesManquantes,
    },
    distant: {
      idCourant: idDistantCourant,
      quitter: quitterDistant,
    },
    selection: {
      id: corpusSelId,
      deselectionner: deselectionnerCorpus,
    },
  })
  const {
    divergenceProposee,
    entretienASupprimer,
    migrerDepuisV1,
    proposerFusionDivergence,
    reinitialiserDivergence,
    confirmerFusion,
    jeterDivergence,
    plusTardDivergence,
    ajouterEntretien,
    exportOuvert,
    ouvrirExport,
    fermerExport,
    exportCorpusEnCours,
    exporterCorpusLot,
    exporterQualcoderLot,
    preparerRapportCorpus,
    enregistrerRapportCorpus,
    exporter,
    preparerRapport,
    enregistrerRapport,
    renommer,
    trierEntretiens,
    supprimer,
    ouvrirAuSegment,
    allerSaisieDonnees,
    allerLocuteurs,
    allerNotes,
    demanderSuppressionEntretien,
    confirmerSuppressionEntretien,
  } = operationsCorpus
  proposerFusionDepuisCycle = proposerFusionDivergence
  reinitialiserDivergenceDepuisDistant = reinitialiserDivergence

  const docsCadre = useDocsCadre({
    estDistant: () => idDistantCourant.value !== null,
    actif: documentsOuverts,
  })

  let fermerCasPourRecueils: () => void = () => {}
  const recueilsCorpus = useRecueilsCorpus({
    recueils: corpus.recueils,
    membership: corpus.membership,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
    enregistrerRepereSelection: ent.enregistrerRepereSelection,
    selectionCourante: ent.selectionPassageCourante,
    ouvrirSource: ouvrirSourceLiee,
    fermerAutreFenetre: () => fermerCasPourRecueils(),
    definitionsAvecSources: () => gesteDisponible('definitionsAvecSources'),
  })
  const casCorpus = useCasCorpus({
    panneauActif: panneauCasActif,
    cas: corpus.cas,
    famillesCas: corpus.famillesCas,
    attributsCas: corpus.attributsCas,
    variables: corpus.variables,
    membership: corpus.membership,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
    selectionCourante: ent.selectionPassageCourante,
    enregistrerRepereSelection: ent.enregistrerRepereSelection,
    lirePersonnes: corpus.lirePersonnes,
    ouvrirSource: ouvrirSourceLiee,
    fermerRecueils: recueilsCorpus.fermerRecueils,
    definitionsAvecSources: () => gesteDisponible('definitionsAvecSources'),
  })
  fermerCasPourRecueils = casCorpus.fermerCas
  const tableauBordCorpus = useTableauBordCorpus({ tableaubord: corpus.tableaubord })

  /** La barre, les onglets et le guidage partagent la même ouverture. */
  async function entrerPreparation(
    sousEspace: SousEspacePreparation = sousEspacePreparation.value,
  ): Promise<void> {
    if (vue.value === 'accueil') return
    const cible = sousEspace === 'docs-cadre' && !gesteDisponible('docsCadre')
      ? 'tableau-bord' : sousEspace
    fermerDialoguesOutils()
    selectionnerPreparation(cible)
    if (cible === 'docs-cadre') await docsCadre.preparerDocsCadre('projet')
    if (cible === 'documents-exemples') await docsCadre.preparerDocsCadre('exemple')
  }

  function afficherAccueilPreparation(): Promise<void> {
    return entrerPreparation('accueil')
  }

  function afficherTableauBord(): Promise<void> {
    return entrerPreparation('tableau-bord')
  }

  function afficherDocsCadre(): Promise<void> {
    return entrerPreparation('docs-cadre')
  }

  function afficherDocumentsExemples(): Promise<void> {
    return entrerPreparation('documents-exemples')
  }

  /** Le guidage masque les panneaux sans effacer leur contexte de travail. */
  function fermerTableauBord(): void {
    if (tableauBordOuverts.value) revenirTraitement()
  }

  function fermerDocsCadre(): void {
    if (docsCadreOuverts.value) revenirTraitement()
  }
  const sourcesAnalyseCorpus = useSourcesAnalyseCorpus({
    membership: corpus.membership,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
  })

  /** Les dialogues d'ajout ne quittent jamais leur entretien. */
  function fermerDialoguesOutils(): void {
    recueilsCorpus.fermerRecueils()
    casCorpus.fermerCas()
  }

  const lexicoCorpus = useLexicoCorpus({
    membership: corpus.membership,
    variables: corpus.variables,
    codebook: corpus.codebook,
    cas: corpus.cas,
    traitements: corpus.lexico,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
    ouvrirSource: ouvrirSourceLiee,
  })
  const syntheseCorpus = useSyntheseCorpus({
    membership: corpus.membership,
    variables: corpus.variables,
    codebook: corpus.codebook,
    cas: corpus.cas,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
    ouvrirSource: ouvrirSourceLiee,
    sources: sourcesAnalyseCorpus,
  })
  const analysesCroisees = useAnalysesCroisees({
    membership: corpus.membership,
    codebook: corpus.codebook,
    sources: sourcesAnalyseCorpus,
    ouvrirSource: ouvrirSourceLiee,
    afficherDansSynthese: (themeId, entretienId) => {
      syntheseCorpus.filtresSynthese.value = {
        ...syntheseCorpus.filtresSynthese.value,
        themes: { mode: 'choix', ids: [themeId] },
        entretiens: { mode: 'choix', ids: [entretienId] },
      }
      void entrerAnalyse('synthese')
    },
  })

  const associationsPassage = ref<ResumeAssociationsPassage>({ cas: [], recueils: [], problemes: [] })
  const etatAssociationsPassage = ref<'sans-selection' | 'chargement' | 'pret' | 'incomplet'>('sans-selection')
  let generationAssociations = 0
  let cachePersonnes: { cle: string; ids: Set<string> } | null = null

  async function actualiserAssociationsPassage(): Promise<void> {
    const selection = ent.selectionPassage.value
    if (vue.value !== 'entretien' || !selection || selection.entretienId !== ent.ouvertId.value) {
      generationAssociations += 1
      associationsPassage.value = { cas: [], recueils: [], problemes: [] }
      etatAssociationsPassage.value = 'sans-selection'
      return
    }
    const generationCourante = ++generationAssociations
    etatAssociationsPassage.value = 'chargement'
    const utilisePersonnes = Object.values(corpus.cas.value).some((courant) =>
      courant.regles.some((regle) => regle.type === 'personne' || regle.type === 'personnes'))
    let personnesConnues: Set<string> | null = new Set<string>()
    if (utilisePersonnes) {
      const cle = `${revisionCorpus.value}:${corpus.revisionPersonnesCorpus.value}:${dernierTirage.value ?? ''}`
      if (cachePersonnes?.cle === cle) personnesConnues = cachePersonnes.ids
      else {
        try {
          const inventaire = await window.sonal.corpus.personnesInventaire()
          personnesConnues = new Set(inventaire.personnes.map((personne) => personne.id))
          cachePersonnes = { cle, ids: personnesConnues }
        } catch {
          if (generationCourante !== generationAssociations) return
          personnesConnues = null
        }
      }
    }
    if (generationCourante !== generationAssociations) return
    const source = ent.donneesSourceOuverte()
    if (!source || !ent.ouvertId.value) {
      etatAssociationsPassage.value = 'sans-selection'
      return
    }
    associationsPassage.value = resumerAssociationsPassage({
      entretienId: ent.ouvertId.value,
      source,
      selection,
      cas: corpus.cas.value,
      recueils: corpus.recueils.value,
      variables: corpus.variables.value,
      personnesConnues,
    })
    etatAssociationsPassage.value = associationsPassage.value.problemes.length ? 'incomplet' : 'pret'
  }

  watch([
    ent.selectionPassage,
    corpus.cas,
    corpus.recueils,
    corpus.variables,
    corpus.revisionPersonnesCorpus,
    dernierTirage,
    revisionCorpus,
    vue,
  ], () => { void actualiserAssociationsPassage() }, { immediate: true })

  const contextesPanneaux = useContextesPanneaux()

  function capturerContexte() {
    const ecran = vue.value
    if (ecran === 'accueil') return null
    const selecteur = ecran === 'entretien' ? '.entretien-ecran' : ecran === 'corpus' ? '.corpus-ecran'
      : ecran === 'analyser' ? '.espace-analyse' : ecran === 'preparer' ? '.espace-preparation' : '.organisation-ecran'
    const nom = ecran === 'analyser'
      ? ({ accueil: 'à l’accueil de l’analyse', synthese: 'au tri et à la synthèse', lexico: 'à Lexico', 'analyses-croisees': 'aux analyses croisées' }[sousEspaceAnalyse.value])
      : ecran === 'organiser' && sousEspaceOrganisation.value === 'cas'
        ? `au cas « ${casCorpus.casOuvert.value?.nom ?? 'Cas'} »`
        : ecran === 'organiser' && sousEspaceOrganisation.value === 'recueils'
          ? `au recueil « ${recueilsCorpus.recueilOuvert.value?.nom ?? 'Recueils'} »`
          : ecran === 'entretien' ? `au passage de « ${corpus.membership.value[ent.ouvertId.value ?? '']?.titre ?? 'l’entretien'} »`
            : ecran === 'preparer' ? 'à la préparation' : 'au corpus'
    const panneau = ecran === 'analyser' ? `analyser-${sousEspaceAnalyse.value}` : ecran === 'organiser' ? `organiser-${sousEspaceOrganisation.value}` : ecran
    const entretienId = ent.ouvertId.value
    const selection = capturerSelection(ecran === 'entretien' ? ent.editor.value ?? null : null, () => ent.ouvertId.value === entretienId)
    return { libelle: `Revenir ${nom}`, contexte: {
      vue: ecran, revision: revisionCorpus.value,
      preparation: sousEspacePreparation.value, analyse: sousEspaceAnalyse.value, organisation: sousEspaceOrganisation.value,
      ongletCorpus: ongletCorpus.value, casId: casCorpus.casOuvertId.value, modeCas: casCorpus.modeMateriauxCas.value,
      modeTexteCas: casCorpus.modeTexteCas.value,
      recueilId: recueilsCorpus.recueilOuvertId.value,
      entretienId: ent.ouvertId.value, ongletEntretien: ent.ongletDroite.value,
      ...selection,
      positionAudio: audio.position.value, restaurerAffichage: capturerAffichage(selecteur),
      restaurerPanneau: contextesPanneaux.capturerContextePanneau(panneau),
    } }
  }
  type ContexteTravail = NonNullable<ReturnType<typeof capturerContexte>>['contexte']

  const retours = useRetoursContextuels<ContexteTravail>({
    capturer: capturerContexte,
    restaurer: restaurerContexte,
    liberer: (contexte) => contexte.liberer(),
    apresRetour: async (contexte, valide) => {
      await nextTick()
      if (valide() && contexte.revision === revisionCorpus.value) contexte.restaurerAffichage()
    },
    erreur: (erreur) => afficherErreurGlobale(erreur, 'La consultation n’a pas pu être ouverte'),
  })
  watch(revisionCorpus, retours.terminerConsultation, { flush: 'sync' })
  watch(vue, (ecran) => { if (ecran === 'accueil') retours.terminerConsultation() })

  async function preparerChangementSource(): Promise<void> {
    if (!ent.ouvertId.value) return
    await preparerFermetureEntretien({
      distant: idDistantCourant.value !== null,
      degrade: statutSession.value.etat === 'degrade',
      lectureSeule: !entretienEditable.value,
      verrouAutrui: ent.verrouAutrui.value !== null,
      annulerSauvegarde: ent.annulerEtAttendreSauvegarde,
      viderSauvegarde: ent.viderSauvegarde,
    })
  }

  async function restaurerContexte(contexte: ContexteTravail, valide: () => boolean): Promise<boolean> {
    if (contexte.revision !== revisionCorpus.value || !valide()) return false
    if (contexte.vue === 'entretien') {
      if (!contexte.entretienId || !corpus.membership.value[contexte.entretienId]) {
        infoGlobale.value = 'Cet entretien n’est plus dans le corpus.'
        if (!(await choisirOngletCorpus('accueil')) || !valide()) return false
        if (ent.ouvertId.value) await retourCorpus()
        if (!valide()) return false
        vue.value = 'corpus'
        return true
      }
      if (ent.ouvertId.value !== contexte.entretienId) {
        await preparerChangementSource()
        if (!valide() || contexte.revision !== revisionCorpus.value) return false
        await ouvrirEntretien(contexte.entretienId)
      }
      if (!valide() || contexte.revision !== revisionCorpus.value || ent.ouvertId.value !== contexte.entretienId) return false
      vue.value = 'entretien'
      ent.ongletDroite.value = contexte.ongletEntretien
      restaurerSelection(contexte)
      ent.editor.value?.commands.focus(undefined, { scrollIntoView: false })
      audio.pause()
      if (audio.url.value) audio.seek(contexte.positionAudio)
    } else if (contexte.vue === 'analyser') {
      fermerDialoguesOutils()
      selectionnerAnalyse(contexte.analyse)
    } else if (contexte.vue === 'preparer') {
      await entrerPreparation(contexte.preparation)
    } else if (contexte.vue === 'organiser') {
      await entrerOrganisation(contexte.organisation)
      if (!valide() || contexte.revision !== revisionCorpus.value) return false
      if (contexte.organisation === 'cas') {
        casCorpus.casOuvertId.value = null
        if (contexte.casId && corpus.cas.value[contexte.casId]) {
          await casCorpus.ouvrirCas(contexte.casId)
          casCorpus.modeMateriauxCas.value = contexte.modeCas
          if (casCorpus.modeTexteCas.value !== contexte.modeTexteCas) await casCorpus.changerModeTexteCas(contexte.modeTexteCas)
        } else if (contexte.casId) infoGlobale.value = 'Ce cas a été supprimé. Son répertoire reste disponible.'
      } else if (contexte.organisation === 'recueils') {
        recueilsCorpus.recueilOuvertId.value = null
        if (contexte.recueilId && corpus.recueils.value[contexte.recueilId]) await recueilsCorpus.ouvrirRecueil(contexte.recueilId)
        else if (contexte.recueilId) infoGlobale.value = 'Ce recueil a été supprimé. Sa liste reste disponible.'
      }
    } else {
      if (!(await choisirOngletCorpus(contexte.ongletCorpus)) || !valide()) return false
      if (ent.ouvertId.value) await retourCorpus()
      if (!valide()) return false
      vue.value = 'corpus'
    }
    if (!valide() || contexte.revision !== revisionCorpus.value) return false
    contexte.restaurerPanneau()
    await nextTick()
    return valide() && contexte.revision === revisionCorpus.value
  }

  function restaurerSelection(contexte: ContexteTravail): void {
    const editeur = ent.editor.value
    if (!editeur || !contexte.selection || ent.ouvertId.value !== contexte.entretienId) return
    const borne = (pos: number) => Math.max(1, Math.min(pos, editeur.state.doc.content.size - 1))
    editeur.commands.setTextSelection({ from: borne(contexte.selection.from), to: borne(contexte.selection.to) })
    if (contexte.etatSelection.supprimee) infoGlobale.value = 'Le passage sélectionné a été supprimé. L’entretien reste ouvert à son emplacement.'
  }

  async function ouvrirSourceLiee(entretienId: string, pos: number): Promise<void> {
    await retours.suivreConsultation(async (valide) => {
      const revision = revisionCorpus.value
      if (!corpus.membership.value[entretienId]) {
        infoGlobale.value = 'Cet entretien n’est plus dans le corpus.'
        return false
      }
      if (ent.ouvertId.value !== entretienId) {
        await preparerChangementSource()
        if (revision !== revisionCorpus.value || !valide()) return false
        await ouvrirEntretien(entretienId)
      }
      if (revision !== revisionCorpus.value || ent.ouvertId.value !== entretienId || !valide()) return false
      vue.value = 'entretien'
      ent.allerAuTexte(pos)
      return true
    })
  }

  /** Prépare l'outil choisi sans réinitialiser les panneaux quittés. */
  async function entrerAnalyse(
    sousEspace: SousEspaceAnalyse = sousEspaceAnalyse.value,
  ): Promise<void> {
    if (vue.value === 'accueil') return
    fermerDialoguesOutils()
    selectionnerAnalyse(sousEspace)
    if (sousEspace === 'lexico') await lexicoCorpus.preparerLexico()
    else if (sousEspace === 'analyses-croisees') analysesCroisees.preparerAnalyseCroisee()
  }

  reinitialiserOutilsCorpus = () => {
    recueilsCorpus.reinitialiserRecueils()
    casCorpus.reinitialiserCas()
    tableauBordCorpus.reinitialiserTableauBord()
    docsCadre.reinitialiserDocsCadre()
    lexicoCorpus.reinitialiserLexico()
    syntheseCorpus.reinitialiserSynthese()
    analysesCroisees.reinitialiserAnalysesCroisees()
    sourcesAnalyseCorpus.reinitialiserSourcesAnalyse()
    confirmationAjout.value = null
    themeASupprimer.value = null
    donneeASupprimer.value = null
    libererContexteAjout('cas')
    libererContexteAjout('recueil')
    retours.terminerConsultation()
    // Un autre corpus repart sur le traitement, onglets initiaux des espaces.
    reinitialiserEspaces()
  }
  watch(ent.etatSauvegarde, (etat) => {
    if (etat !== 'à jour') {
      sourcesAnalyseCorpus.invaliderSourceAnalyse(ent.ouvertId.value)
      lexicoCorpus.perimerLexico()
      syntheseCorpus.perimerSynthese()
      analysesCroisees.perimerAnalysesCroisees()
      return
    }
    if (recueilsCorpus.recueilOuvertId.value) void recueilsCorpus.resoudreRecueil()
    // La sauvegarde vient de finir : ne pas en relancer une en relisant les personnes.
    if (casCorpus.casActifs.value) void casCorpus.actualiserMateriauxCas()
  })

  // --- Suppression d'un thème (croise corpus ↔ entretien) ---
  /** Compte les usages puis ouvre la confirmation : la suppression n'est jamais bloquée, l'usage est seulement signalé. */
  async function demanderSuppressionTheme(id: string) {
    ent.hintCodage.value = null
    corpus.messageTheme.value = null
    const revision = revisionCorpus.value
    const ouvert = ent.ouvertId.value
    const autres = await window.sonal.corpus.compterUsagesCategorie(id, ouvert ?? undefined)
    if (revision !== revisionCorpus.value || ouvert !== ent.ouvertId.value) return
    const n = ouvert ? ent.entretien.annotations.filter((a) => a.type === 'codage' && a.code === id).length : 0
    themeASupprimer.value = { id, nom: corpus.nomTheme(id), n, autres, partage: idDistantCourant.value !== null }
  }
  /** En local, les fichiers sont modifiés ensemble avant de mettre à jour l'entretien affiché. */
  async function confirmerSuppressionTheme() {
    const cible = themeASupprimer.value
    if (!cible || (cible.autres > 0 && cible.partage)) return
    await lancerOperationGlobale(async () => {
      const revision = revisionCorpus.value
      const ouvert = ent.ouvertId.value
      const local = idDistantCourant.value === null
      if (ouvert) {
        if (local) await ent.viderSauvegarde()
        else {
          ent.retirerCodagesDuCode(cible.id)
          if (!await publierAvantSuppressionDefinition()) return
        }
      }
      if (revision !== revisionCorpus.value || ouvert !== ent.ouvertId.value) return
      const r = await window.sonal.corpus.supprimerCategorie(
        cible.id, local ? undefined : ouvert ?? undefined, local && cible.n + cible.autres > 0,
      )
      if (revision !== revisionCorpus.value) return
      if (r.ok) {
        if (local && ouvert) ent.retirerCodagesDuCode(cible.id)
        corpus.majCodebook(r.corpus.codebook)
        ent.rafraichir()
        if (corpus.codeCourant.value === cible.id) corpus.codeCourant.value = corpus.codebook.value[0]?.id ?? ''
        await corpus.rafraichirUsages()
      } else {
        corpus.messageTheme.value = `« ${cible.nom} » vient d'être utilisé ailleurs : la suppression n'a pas été faite.`
      }
      themeASupprimer.value = null
    })
  }

  // --- Suppression d'une variable ou d'une modalité (même logique que les thèmes) ---
  const valeursOuvertes = () => ({ meta: ent.meta, locuteurs: ent.locuteurs.value })
  /** Compte les valeurs puis ouvre la confirmation ; seules les règles des cas empêchent la suppression. */
  async function demanderSuppressionDonnee(idVar: string, idMod?: string) {
    corpus.messageVar.value = null
    const revision = revisionCorpus.value
    const ouvert = ent.ouvertId.value
    const usages = await window.sonal.corpus.usagesDonnee(idVar, idMod, ouvert ?? undefined)
    if (revision !== revisionCorpus.value || ouvert !== ent.ouvertId.value) return
    const variable = corpus.variables.value.find((v) => v.id === idVar)
    const nom = idMod === undefined
      ? variable?.lib ?? idVar
      : variable?.modalites.find((m) => m.id === idMod)?.lib ?? idMod
    donneeASupprimer.value = {
      idVar, idMod, nom,
      n: ouvert ? compterValeursVariable(valeursOuvertes(), idVar, idMod) : 0,
      autres: usages.valeurs, cas: usages.cas, partage: idDistantCourant.value !== null,
    }
  }
  /** En local, les valeurs affichées ne sont effacées qu'après la suppression enregistrée. */
  async function confirmerSuppressionDonnee() {
    const cible = donneeASupprimer.value
    if (!cible || cible.cas > 0 || (cible.autres > 0 && cible.partage)) return
    await lancerOperationGlobale(async () => {
      const revision = revisionCorpus.value
      const ouvert = ent.ouvertId.value
      const local = idDistantCourant.value === null
      if (ouvert) {
        if (local) await ent.viderSauvegarde()
        else if (effacerValeursVariable(valeursOuvertes(), cible.idVar, cible.idMod) > 0) {
          if (!await publierAvantSuppressionDefinition()) return
        }
      }
      if (revision !== revisionCorpus.value || ouvert !== ent.ouvertId.value) return
      const exceptId = local ? undefined : ouvert ?? undefined
      const avecValeurs = local && cible.n + cible.autres > 0
      const r = cible.idMod === undefined
        ? await window.sonal.corpus.supprimerVariable(cible.idVar, exceptId, avecValeurs)
        : await window.sonal.corpus.supprimerModalite(cible.idVar, cible.idMod, exceptId, avecValeurs)
      if (revision !== revisionCorpus.value) return
      if (r.ok) {
        if (local && ouvert) effacerValeursVariable(valeursOuvertes(), cible.idVar, cible.idMod)
        corpus.majVariables(r.corpus.variables)
        ent.rafraichir()
        await corpus.rafraichirMatrice()
      } else {
        corpus.messageVar.value = `« ${cible.nom} » vient d'être utilisée ailleurs : la suppression n'a pas été faite.`
      }
      donneeASupprimer.value = null
    })
  }

  watch([dernierTirage, corpus.revisionPersonnesCorpus], () => {
    if (casCorpus.casActifs.value) void casCorpus.actualiserCas()
  })

  /** Les outils d'organisation masquent l'entretien sans terminer sa session. */
  async function entrerOrganisation(
    sousEspace: SousEspaceOrganisation = sousEspaceOrganisation.value,
  ): Promise<void> {
    if (vue.value === 'accueil') return
    fermerDialoguesOutils()
    selectionnerOrganisation(sousEspace)
    if (sousEspace === 'recueils' && recueilsCorpus.recueilOuvertId.value) {
      await recueilsCorpus.resoudreRecueil()
    }
  }

  async function afficherCas(id?: string, valide: () => boolean = () => true): Promise<boolean> {
    if (vue.value === 'accueil') return false
    const revision = revisionCorpus.value
    await entrerOrganisation('cas')
    if (revision !== revisionCorpus.value || !valide()) return false
    if (id) await casCorpus.ouvrirCas(id)
    return revision === revisionCorpus.value
  }

  async function afficherRecueils(id?: string, valide: () => boolean = () => true): Promise<void> {
    const revision = revisionCorpus.value
    if (vue.value === 'accueil') return
    await entrerOrganisation('recueils')
    if (id && revision === revisionCorpus.value && valide()) await recueilsCorpus.ouvrirRecueil(id)
  }

  async function ouvrirCasAssocie(id: string): Promise<void> {
    await retours.suivreConsultation(async (valide) => {
      if (!corpus.cas.value[id]) {
        infoGlobale.value = 'Ce cas a été supprimé.'
        return false
      }
      return afficherCas(id, valide)
    })
  }

  async function ouvrirOccurrenceRecueilAssociee(recueilId: string, itemId: string): Promise<void> {
    await retours.suivreConsultation(async (valide) => {
      const recueil = corpus.recueils.value[recueilId]
      if (!recueil) {
        infoGlobale.value = 'Ce recueil a été supprimé.'
        return false
      }
      if (!recueil.items.some((item) => item.id === itemId)) {
        infoGlobale.value = 'Cette occurrence a été retirée du recueil.'
        return false
      }
      await afficherRecueils(recueilId, valide)
      if (!valide() || vue.value !== 'organiser' || recueilsCorpus.recueilOuvertId.value !== recueilId) return false
      await nextTick()
      const cible = [...document.querySelectorAll<HTMLElement>('[data-recueil-item]')]
        .find((element) => element.dataset.recueilItem === itemId)
      if (!cible) {
        infoGlobale.value = 'Le recueil est ouvert, mais cette occurrence n’est plus visible.'
        return true
      }
      cible.scrollIntoView({ block: 'center' })
      cible.focus({ preventScroll: true })
      return true
    })
  }

  const confirmationAjout = ref<{ type: 'cas' | 'recueil'; destinations: Array<{ id: string; nom: string }> } | null>(null)
  const contextesAjout: Partial<Record<'cas' | 'recueil', ContexteTravail>> = {}
  function libererContexteAjout(type: 'cas' | 'recueil'): void {
    contextesAjout[type]?.liberer()
    delete contextesAjout[type]
  }
  function fermerConfirmationAjout(): void {
    const type = confirmationAjout.value?.type
    confirmationAjout.value = null
    if (type) libererContexteAjout(type)
  }

  onScopeDispose(() => { libererContexteAjout('cas'); libererContexteAjout('recueil') })

  async function afficherCasPourAssociation(): Promise<void> {
    if (vue.value !== 'entretien' || !entretienEditable.value || lectureSeule.value) return
    if (!gesteDisponible('definitionsAvecSources')) throw new Error('L’ajout de passages aux cas n’est pas disponible pour ce corpus.')
    fermerConfirmationAjout()
    if (!casCorpus.ajoutCasEnAttente.value) {
      libererContexteAjout('cas')
      contextesAjout.cas = capturerContexte()?.contexte
    }
    confirmationAjout.value = null
    await casCorpus.afficherCasPourAssociation()
  }

  function afficherRecueilsPourAssociation(): void {
    if (vue.value !== 'entretien' || !entretienEditable.value || lectureSeule.value) return
    if (!gesteDisponible('definitionsAvecSources')) throw new Error('L’ajout de passages aux recueils n’est pas disponible pour ce corpus.')
    fermerConfirmationAjout()
    if (!recueilsCorpus.ajoutPassageEnAttente.value && !recueilsCorpus.creationRecueilAssociation.value) {
      libererContexteAjout('recueil')
      contextesAjout.recueil = capturerContexte()?.contexte
    }
    confirmationAjout.value = null
    recueilsCorpus.afficherRecueilsPourAssociation()
  }

  async function retrouverPassageAjout(type: 'cas' | 'recueil'): Promise<void> {
    const contexte = contextesAjout[type]
    await nextTick()
    if (!contexte || contexte.revision !== revisionCorpus.value || vue.value !== 'entretien' || ent.ouvertId.value !== contexte.entretienId) return
    restaurerSelection(contexte)
    ent.editor.value?.commands.focus(undefined, { scrollIntoView: false })
    contexte.restaurerAffichage()
  }

  async function fermerAjoutCas(abandonner = false): Promise<void> {
    if (abandonner) casCorpus.annulerAssociationCas()
    else casCorpus.fermerCas()
    await retrouverPassageAjout('cas')
    if (!casCorpus.ajoutCasEnAttente.value) libererContexteAjout('cas')
  }
  async function fermerAjoutRecueil(abandonner = false): Promise<void> {
    recueilsCorpus.fermerRecueils()
    if (abandonner || (!recueilsCorpus.ajoutPassageEnAttente.value && !recueilsCorpus.creationRecueilAssociation.value)) recueilsCorpus.abandonnerAjoutPassage()
    await retrouverPassageAjout('recueil')
    if (!recueilsCorpus.ajoutPassageEnAttente.value && !recueilsCorpus.creationRecueilAssociation.value) libererContexteAjout('recueil')
  }

  async function confirmerAjoutCas(ids: string[], nouveau?: { nom: string; memo: string }): Promise<void> {
    if (!entretienEditable.value || lectureSeule.value) throw new Error('Cet entretien est en lecture seule.')
    const revision = revisionCorpus.value
    const ajoutes = await casCorpus.associerSelectionCas(ids, nouveau)
    if (revision !== revisionCorpus.value) return
    confirmationAjout.value = { type: 'cas', destinations: ajoutes.map((id) => ({ id, nom: corpus.cas.value[id]?.nom ?? id })) }
    await retrouverPassageAjout('cas')
  }

  async function confirmerAjoutRecueil(id: string, avantId: string | null, nouveauNom?: string): Promise<void> {
    if (!entretienEditable.value || lectureSeule.value) throw new Error('Cet entretien est en lecture seule.')
    const revision = revisionCorpus.value
    if (nouveauNom !== undefined) id = await recueilsCorpus.creerRecueilPourAssociation(nouveauNom)
    if (revision !== revisionCorpus.value) return
    await recueilsCorpus.ajouterSelectionAuRecueil(id, avantId)
    if (revision !== revisionCorpus.value) return
    recueilsCorpus.abandonnerAjoutPassage()
    confirmationAjout.value = { type: 'recueil', destinations: [{ id, nom: corpus.recueils.value[id]?.nom ?? id }] }
    await retrouverPassageAjout('recueil')
  }

  async function ouvrirDestinationAjout(id: string): Promise<void> {
    const confirmation = confirmationAjout.value
    if (!confirmation) return
    const origine = contextesAjout[confirmation.type]
    const ouvert = await retours.suivreConsultation(async (valide) => {
      if (confirmation.type === 'cas') {
        if (!corpus.cas.value[id]) { infoGlobale.value = 'Ce cas a été supprimé.'; return false }
        return afficherCas(id, valide)
      }
      if (!corpus.recueils.value[id]) { infoGlobale.value = 'Ce recueil a été supprimé.'; return false }
      await afficherRecueils(id, valide)
      return vue.value === 'organiser' && recueilsCorpus.recueilOuvertId.value === id
    }, origine ? { libelle: `Revenir au passage de « ${corpus.membership.value[origine.entretienId ?? '']?.titre ?? 'l’entretien'} »`, contexte: origine } : undefined)
    if (ouvert) {
      confirmationAjout.value = null
      if (contextesAjout[confirmation.type] === origine) delete contextesAjout[confirmation.type]
    }
  }

  const listeEntretiens = () =>
    Object.entries(corpus.membership.value).map(([id, ref]) => ({ id, ...ref }))

  /** La navigation dédiée ferme d'abord l'entretien avec le chemin sécurisé.
   *  La vue Corpus applique ensuite sa garde et met le parcours en vue. */
  async function revenirAuCorpusPourParcours(): Promise<boolean> {
    revenirTraitement()
    if (vue.value === 'entretien') {
      try {
        await retourCorpus()
      } catch {
        return false
      }
    }
    return vue.value === 'corpus' && gestionnaireParcours !== null
  }

  async function voirParcours(parcoursId?: import('../../shared/format').ParcoursId): Promise<boolean> {
    await exemples.ouvrirCatalogueParcours(parcoursId)
    return true
  }

  async function retourAccueilParcours(
    parcoursId?: import('../../shared/format').ParcoursId,
  ): Promise<boolean> {
    if (!(await revenirAuCorpusPourParcours()) || !gestionnaireParcours) return false
    return gestionnaireParcours(parcoursId)
  }

  // Le guide n'installe aucun corpus ; il observe le travail actuellement ouvert.
  const guide = useGuide({
    analyse: { sousEspaceAnalyse, panneauAnalyseVisible, synthese: syntheseCorpus, lexico: lexicoCorpus, croisees: analysesCroisees },
    organisation: { sousEspaceOrganisation, cas: corpus.cas, recueils: corpus.recueils, recueilOuvertId: recueilsCorpus.recueilOuvertId,
      sauvegardeCas: casCorpus.etatSauvegardeCas, sauvegardeRecueil: recueilsCorpus.etatSauvegardeRecueil },
    retourParcours: retourAccueilParcours,
    vue,
    membership: corpus.membership,
    entretien: ent.entretien,
    locuteurs: ent.locuteurs,
    meta: ent.meta,
    ouvertId: ent.ouvertId,
    ongletDroite: ent.ongletDroite,
    variables: corpus.variables,
    notes: ent.notes,
    audiosCorpus,
    corpusSelId,
    corpusSelMeta,
    tableaubord: corpus.tableaubord,
    tableauBordOuverts,
    docsCadreOuverts,
    documentsProjet: docsCadre.documentsProjet,
    fermerTableauBord,
    fermerDocsCadre,
  })
  racineSourcesExercice = () => guide.racineSources.value

  /** Navigation typée utilisée par les retours du guidage, sans clic DOM. */
  async function naviguerGuide(destination: DestinationGuide): Promise<boolean> {
    retours.terminerConsultation()
    if (destination.surface === 'tableau-bord') {
      await afficherTableauBord()
      return true
    }
    if (destination.surface === 'docs-cadre') {
      await afficherDocsCadre()
      return true
    }
    if (destination.surface === 'entretien') {
      await ouvrirEntretien(destination.entretienId)
      if (destination.onglet) ent.ongletDroite.value = destination.onglet
      return true
    }
    if (destination.surface === 'corpus-accueil') {
      return retourAccueilParcours(destination.parcoursId)
    }
    return voirParcours(destination.surface === 'catalogue' ? undefined : destination.parcoursId)
  }

  // --- Menu applicatif : routage des items vers les actions existantes. ---
  // Le main construit le menu et émet ; ICI on route vers les modales et les
  // fonctions d'orchestration, comme si l'utilisateur avait cliqué dans l'UI.
  const modaleNouveauCorpus = ref(false)
  const modaleCorpusDistant = ref(false)
  const exemples = useExemples({
    guide, vue,
    creer: creerNouveauCorpus,
    ouvrir: (dir) => ouvrirRecent({ type: 'local', dir, nom: '' }),
    afficherSynthese: () => { void entrerAnalyse('synthese') },
  })
  raccrocherModeCorpus = async (marqueur, dir) => {
    corpusDemo.value = marqueur !== undefined
    exemples.catalogueParcoursOuvert.value = false
    exemples.explorationExemples.value = false
    exemples.repereAnalyse.value = false
    exemples.demoReinitialisee.value = null
    await guide.raccrocherModeCorpus(marqueur, dir)
  }
  /** Signal consommé par AjoutEntretien.vue (la modale vit dans la vue Corpus). */
  const demandeAjoutEntretien = ref(false)

  /** Amène la vue Corpus et y ouvre la modale « + Ajouter un entretien ». */
  async function ouvrirAjoutEntretien(): Promise<void> {
    if (!ajoutEntretienPossible.value) return
    revenirTraitement()
    if (vue.value === 'entretien') await retourCorpus()
    else if (vue.value === 'accueil' && dossierCourantDir.value) {
      vue.value = 'corpus'
    }
    if (vue.value !== 'corpus') return
    retours.terminerConsultation()
    demandeAjoutEntretien.value = true
  }

  const corrigerPremiereOuverturePossible = computed(() =>
    Object.keys(corpus.membership.value).length > 0 || ajoutEntretienPossible.value,
  )

  /** Aiguillage de première ouverture : corriger un entretien.
   *  Un corpus vide n'offre rien à corriger : on propose d'en importer un. */
  async function corrigerEntretienPremiereOuverture(): Promise<void> {
    if (!corrigerPremiereOuverturePossible.value) return
    premiereOuvertureCorpus.value = false
    if (Object.keys(corpus.membership.value).length === 0) {
      await ouvrirAjoutEntretien()
      return
    }
    revenirTraitement()
  }

  /** Aiguillage de première ouverture : la gestion de projet, où l'app se trouve déjà. */
  function gererProjetPremiereOuverture(): void {
    premiereOuvertureCorpus.value = false
    void entrerPreparation('accueil')
  }

  /** Referme l'aiguillage sans choisir : on reste sur l'accueil affiché. */
  function fermerPremiereOuverture(): void {
    premiereOuvertureCorpus.value = false
  }

  const etatMenu = computed<EtatMenuApplication>(() => {
    const travail = vue.value !== 'accueil' && dossierCourantDir.value !== null
    const disponible = travail && !exportCorpusEnCours.value
    const nombreEntretiens = Object.keys(corpus.membership.value).length
    const trier = disponible && !lectureSeule.value && nombreEntretiens > 1
    return {
      travail: disponible,
      naviguer: !exportCorpusEnCours.value,
      enregistrer: disponible && ent.ouvertId.value !== null
        && (!idDistantCourant.value || (!lectureSeule.value && entretienEditable.value)),
      sauvegarder: disponible && idDistantCourant.value === null,
      exporter: disponible && nombreEntretiens > 0,
      ajouter: disponible && ajoutEntretienPossible.value,
      trier,
      trierContenu: trier && gesteDisponible('triContenu')
        && (idDistantCourant.value === null || ent.ouvertId.value === null),
    }
  })
  // Une modification des données ne reconstruit pas le menu si ses choix restent identiques.
  watch(() => JSON.stringify(etatMenu.value), () => {
    window.sonal.menu.actualiserEtat(etatMenu.value)
  }, { immediate: true })

  window.sonal.menu.surAction(async (action, modeTri) => {
    if (exportCorpusEnCours.value) return
    const disponibles: Record<string, boolean> = {
      enregistrer: etatMenu.value.enregistrer,
      'ajouter-entretien': etatMenu.value.ajouter,
      'trier-entretiens': etatMenu.value.trier,
      'exporter-corpus': etatMenu.value.exporter,
      'sauvegarde-zip': etatMenu.value.sauvegarder,
    }
    if (disponibles[action] === false) return
    try {
      switch (action) {
        case 'nouveau-corpus':
        case 'ouvrir-distant': {
          // Ces modales vivent sur l'Accueil : on y revient d'abord si besoin
          // (la navigation ferme proprement l'entretien ouvert).
          if (vue.value !== 'accueil') await allerAccueil()
          if (action === 'nouveau-corpus') modaleNouveauCorpus.value = true
          else modaleCorpusDistant.value = true
          break
        }
        case 'ouvrir-corpus':
          // Dialogue natif + bascule : marche depuis n'importe quelle vue.
          await choisirDossier()
          break
        case 'enregistrer':
          // Hors entretien ouvert, rien à enregistrer (les définitions corpus
          // sont écrites à la volée). Distant : flush + publication immédiate.
          if (!ent.ouvertId.value) break
          if (idDistantCourant.value) {
            if (
              statutSession.value.etat !== 'degrade' &&
              !lectureSeule.value &&
              !ent.verrouAutrui.value
            ) {
              await publierMaintenant()
            }
          } else {
            await ent.viderSauvegarde()
          }
          break
        case 'ajouter-entretien': {
          await ouvrirAjoutEntretien()
          break
        }
        case 'trier-entretiens': {
          const modes: readonly ModeTriEntretiens[] = ['alpha', 'ajout', 'modif', 'longueur']
          if (!modeTri || !modes.includes(modeTri)) throw new Error('Mode de tri inconnu.')
          if (lectureSeule.value || Object.keys(corpus.membership.value).length === 0) break
          if (modeTri === 'modif' || modeTri === 'longueur') {
            verifierTriContenu({
              capacite: gesteDisponible('triContenu'),
              distant: idDistantCourant.value !== null,
              entretienOuvert: ent.ouvertId.value !== null,
            })
            // En local, le tri se fait sur le dossier : vider la sauvegarde suffit.
            if (ent.ouvertId.value) await ent.viderSauvegarde()
          }
          await trierEntretiens(modeTri)
          break
        }
        case 'exporter-corpus': {
          await entrerOrganisation('export')
          break
        }
        case 'sauvegarde-zip': {
          if (idDistantCourant.value) {
            infoGlobale.value =
              "La copie de sauvegarde (ZIP) n'est disponible que pour un corpus local."
            break
          }
          // L'archive doit refléter ce qui est à l'écran.
          // On vide donc d'abord le délai d'autosave de l'entretien ouvert.
          if (ent.ouvertId.value) await ent.viderSauvegarde()
          const archive = await window.sonal.corpus.copieSauvegardeZip()
          if (archive.etat === 'succes') {
            infoGlobale.value = `Copie de sauvegarde créée (${archive.fichiers} fichier(s)) : ${archive.chemin}`
          } else if (archive.etat === 'refus') {
            infoGlobale.value = archive.message
          } else if (archive.etat === 'echec') {
            afficherErreurGlobale(archive.message)
          }
          break
        }
      }
    } catch (erreur) {
      afficherErreurGlobale(erreur, 'L’action du menu a échoué')
    }
  })
  window.sonal.menu.surOuvrirRecent((entree) => {
    if (exportCorpusEnCours.value) return
    void ouvrirRecent(entree).catch((erreur) =>
      afficherErreurGlobale(erreur, 'L’ouverture du corpus récent a échoué'),
    )
  })

  onMounted(chargerCorpus)

  // Retour PLAT : les templates (App + composants) utilisent des noms nus ;
  // les wrappers d'orchestration (choisirDossier/ouvrirRecent) écrasent les bruts du profil.
  return {
    ...profil,
    ...corpus,
    ...ent,
    ...recueilsCorpus,
    ...casCorpus,
    ...tableauBordCorpus,
    ...docsCadre,
    ...lexicoCorpus,
    ...syntheseCorpus,
    ...analysesCroisees,
    audio, // scope audio (objet nommé : les vues déstructurent ses refs)
    audiosCorpus,
    audiosManquants,
    urlWaveform,
    assignerAudioSelection,
    effacerAudioSelection,
    demanderSrt,
    confirmerSrt,
    srtASurEcrire,
    srtMessage,
    reassignerAudioEntretienOuvert,
    associerAudioEntretienOuvert,
    designationAudioId,
    ouvrirDesignationAudio,
    fermerDesignationAudio,
    confirmerDesignationAudio,
    etatAudioOuvert,
    rapatrierAudioMaintenant,
    lireAudioDistant,
    lireAudioLocal,
    preparationLectureDistante,
    lectureDistanteActive,
    mediaDistantDesigne,
    audioLocalDisponible,
    creerEntretienVideDistant,
    vue,
    vueTraitement,
    sousEspacePreparation,
    sousEspaceAnalyse,
    panneauAnalyseVisible,
    preparationActive,
    analyseActive,
    ongletCorpus,
    panneauCasActif,
    enregistrerNavigationCorpus,
    tableauBordOuverts,
    docsCadreOuverts,
    documentsExemplesOuverts,
    analysesCroiseesOuvertes,
    entrerPreparation: (...args: Parameters<typeof entrerPreparation>) => { retours.terminerConsultation(); return entrerPreparation(...args) },
    entrerAnalyse: (...args: Parameters<typeof entrerAnalyse>) => { retours.terminerConsultation(); return entrerAnalyse(...args) },
    revenirTraitement: () => { retours.terminerConsultation(); revenirTraitement() },
    basculerPanneauAnalyse,
    afficherPanneauAnalyse,
    afficherAccueilPreparation,
    afficherTableauBord,
    afficherDocsCadre,
    afficherDocumentsExemples,
    fermerTableauBord,
    fermerDocsCadre,
    afficherCas: (id?: string) => { retours.terminerConsultation(); return afficherCas(id) },
    afficherRecueils: (id?: string) => { retours.terminerConsultation(); return afficherRecueils(id) },
    ouvrirCas: (id: string) => { retours.terminerConsultation(); return casCorpus.ouvrirCas(id) },
    ouvrirRecueil: (id: string) => { retours.terminerConsultation(); return recueilsCorpus.ouvrirRecueil(id) },
    afficherRecueilsPourAssociation,
    entrerOrganisation: (...args: Parameters<typeof entrerOrganisation>) => { retours.terminerConsultation(); return entrerOrganisation(...args) },
    afficherCasPourAssociation, confirmerAjoutCas, confirmerAjoutRecueil, fermerAjoutCas, fermerAjoutRecueil,
    confirmationAjout, ouvrirDestinationAjout, fermerConfirmationAjout,
    associationsPassage, etatAssociationsPassage, ouvrirCasAssocie, ouvrirOccurrenceRecueilAssociee,
    revenirContexte: retours.revenirContexte, libelleRetourContexte: retours.libelleRetourContexte,
    enregistrerContextePanneau: contextesPanneaux.enregistrerContextePanneau,
    navigationContexteEnCours: retours.navigationContexteEnCours,
    sousEspaceOrganisation,
    organisationActive,
    panneauRecueilsActif,
    afficherAccueilAnalyse: () => entrerAnalyse('accueil'),
    afficherLexico: () => entrerAnalyse('lexico'),
    afficherSynthese: () => entrerAnalyse('synthese'),
    afficherAnalysesCroisees: () => entrerAnalyse('analyses-croisees'),
    themeASupprimer,
    donneeASupprimer,
    corpusSelId,
    corpusSelMeta,
    selectionnerCorpus,
    deselectionnerCorpus,
    appliquerCorpus,
    chargerCorpus,
    choisirDossier,
    creerNouveauCorpus,
    creerCorpusWebDAV,
    oublierDestinationWebDAV,
    ouvrirRecent,
    ouvrirCorpusWebDAV,
    ouvrirDestinationGitLab,
    enregistrerEtOuvrirGitLab,
    creerEtOuvrirGitLab,
    migrerGitLab,
    reprendreMigrationGitLab,
    idDistantCourant,
    dossierCourantDir,
    revisionCorpus,
    demandeDissociationAnon,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    actualiserDistant,
    lectureSeule,
    ajoutEntretienPossible,
    fournisseurCourant,
    etatBaseMedia,
    verrousIndisponibles,
    capacites,
    gesteDisponible,
    tableLigneEditable,
    pseudonymisationLigneEditable,
    metaEditables,
    designationMediaPossible,
    renommagePossible,
    suppressionPossible,
    enLigne,
    badgesVerrous,
    badgeVerrou,
    presences,
    presencesSur,
    orphelinsDistants,
    reprendreOrphelin,
    abandonnerOrphelin,
    statutSession,
    publiErreur,
    publierMaintenant,
    migrerDepuisV1,
    retourCorpus: async () => { await retourCorpus(); retours.terminerConsultation() },
    allerAccueil,
    ouvrirEntretien: async (id: string) => { await ouvrirEntretien(id); if (ent.ouvertId.value === id) retours.terminerConsultation() },
    voirParcours,
    naviguerGuide,
    enregistrerNavigationParcours,
    entretienEditable,
    divergenceProposee,
    confirmerFusion,
    jeterDivergence,
    plusTardDivergence,
    ouvrirAuSegment,
    allerSaisieDonnees,
    allerLocuteurs,
    allerNotes,
    ajouterEntretien,
    exportOuvert,
    ouvrirExport,
    fermerExport,
    exportCorpusEnCours,
    exporterCorpusLot,
    exporterQualcoderLot,
    preparerRapportCorpus,
    enregistrerRapportCorpus,
    exporter,
    preparerRapport,
    enregistrerRapport,
    renommer,
    trierEntretiens,
    supprimer,
    entretienASupprimer,
    demanderSuppressionEntretien,
    confirmerSuppressionEntretien,
    reprise,
    reprendre,
    demanderSuppressionTheme,
    confirmerSuppressionTheme,
    demanderSuppressionDonnee,
    confirmerSuppressionDonnee,
    listeEntretiens,
    modaleNouveauCorpus,
    modaleCorpusDistant,
    demandeAjoutEntretien,
    premiereOuvertureCorpus,
    corrigerPremiereOuverturePossible,
    corrigerEntretienPremiereOuverture,
    gererProjetPremiereOuverture,
    fermerPremiereOuverture,
    ...guide,
    ...exemples,
  }
}

export type Sonal = ReturnType<typeof creerSonal>

const CLE: InjectionKey<Sonal> = Symbol('sonal')

/** À appeler UNE fois dans l'App : crée le contexte applicatif et le fournit. */
export function fournirSonal(): Sonal {
  const s = creerSonal()
  provide(CLE, s)
  return s
}
/** Dans un composant de vue : récupère le contexte applicatif partagé. */
export function utiliserSonal(): Sonal {
  const s = inject(CLE)
  if (!s) throw new Error('Contexte « sonal » absent (fournirSonal non appelé).')
  return s
}
