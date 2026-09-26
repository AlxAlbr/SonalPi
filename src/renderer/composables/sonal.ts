import { ref, watch, onMounted, provide, inject, type InjectionKey } from 'vue'
import type { MarqueurDemo, ModeTriEntretiens } from '../../shared/format'
import { MOTS_LIAISON_DEFAUT } from '../../shared/format'
import { useProfil } from './useProfil'
import { afficherErreurGlobale, infoGlobale } from '../erreurs'
import { useCorpus } from './useCorpus'
import { useSelectionCorpus } from './corpus/useSelectionCorpus'
import { useMediasCorpus } from './corpus/useMediasCorpus'
import { useDistantCorpus } from './corpus/useDistantCorpus'
import { useCycleCorpus } from './corpus/useCycleCorpus'
import { useOperationsCorpus } from './corpus/useOperationsCorpus'
import { useRecueilsCorpus } from './corpus/useRecueilsCorpus'
import { useDocsCadre } from './corpus/useDocsCadre'
import { useCasCorpus } from './corpus/useCasCorpus'
import { useTableauBordCorpus } from './corpus/useTableauBordCorpus'
import { useEntretien } from './useEntretien'
import { useAudio } from './useAudio'
import { utiliserDemo } from './demo'

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
  // Indirection pour casser un cycle de dépendances :
  //     `appliquerCorpus` doit restaurer le mode démo (panneau « Pas à pas ») quand le corpus ouvert porte un marqueur `demo`,
  //     mais le scope demo est créé APRÈS (il injecte `appliquerCorpus`).
  //     Même patron que `sauverEntretien` : holder réaffecté.
  let raccrocherModeCorpus: (
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ) => Promise<void> = async () => {}
  let racineSourcesDemo: () => string | null = () => null
  let distantActifPourMedias: () => boolean = () => false
  let actualiserDistantPourMedias: (silencieux?: boolean) => Promise<boolean> = async () => false
  let reinitialiserFenetresMetier: () => void = () => {}
  const corpus = useCorpus({ flush: () => sauverEntretien() })

  // Scope AUDIO : le lecteur de l'entretien ouvert.
  // Les trois consommateurs (LecteurAudio en haut, barre sur la forme d'onde, bloc-lu de l'éditeur)
  // se coordonnent par cet état réactif partagé.
  const audio = useAudio()

  const ent = useEntretien({
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
    // Catégories de note : définitions au corpus, résolues ici pour le scope entretien (nom affichable + défaut du formulaire de création).
    nomCategorieNote: (id) => corpus.nomCategorieNote(id),
    categorieNoteDefaut: () => corpus.categorieNoteDefaut(),
    reglesAnon: () => corpus.reglesAnon.value, // règles corpus (menu multi-pseudo, promotions 3b)
    rafraichirReglesCorpus: () => corpus.rafraichirReglesAnon(),
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
  })
  sauverEntretien = ent.viderSauvegarde

  // La lecture avance → le bloc lu suit (surlignage + défilement).
  // Décharger l'audio (url null) éteint le surlignage.
  watch(audio.position, (t) => ent.majPlageLue(audio.url.value ? t : null))
  watch(audio.url, (u) => {
    if (!u) ent.majPlageLue(null)
  })

  // --- Navigation : Accueil → Corpus → Entretien. ---
  const vue = ref<'accueil' | 'corpus' | 'entretien'>('corpus')

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
  // Confirmation de suppression d'un thème DEPUIS l'entretien (orchestration).
  const themeASupprimer = ref<{ id: string; nom: string; n: number } | null>(null)

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
    choisirSrt: () => window.sonal.dialog.choisirSrt(racineSourcesDemo() ?? undefined),
    distantActif: () => distantActifPourMedias(),
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
    creerEntretienVideDistant,
    ouvrirDesignationAudio,
    fermerDesignationAudio,
    confirmerDesignationAudio,
  } = mediasCorpus

  // Quitter l'écran entretien met la lecture en PAUSE : le lecteur n'est visible
  // que là, pas de lecture fantôme sans commandes à l'écran.
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
    tableLigneEditable,
    metaEditables,
    reprendreOrphelin,
    abandonnerOrphelin,
    appliquerStatutSession,
    publierMaintenant,
  } = distant
  distantActifPourMedias = () => idDistantCourant.value !== null
  actualiserDistantPourMedias = actualiserDistant

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
      reinitialiserFenetresMetier: () => reinitialiserFenetresMetier(),
      deselectionner: deselectionnerCorpus,
      apresOuvertureEntretien: (id) => proposerFusionDepuisCycle(id),
      raccrocherModeCorpus: (marqueur, dir) => raccrocherModeCorpus(marqueur, dir),
    },
  })
  const {
    dossierCourantDir,
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
    exportCorpusOuvert,
    ouvrirExportCorpus,
    fermerExportCorpus,
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

  // Fenêtre « Docs cadre projet » : l'espace documentaire propre au corpus.
  // Le mode local/distant est relu au moment de l'ouverture (le corpus
  // distant actif est le critère ; le main garantit de toute façon la lecture
  // seule pour les mutations). Elle ferme les autres fenêtres métier,
  // et est fermée/resetée par chacune d'elles et à la bascule de corpus.
  const docsCadre = useDocsCadre({
    estDistant: () => idDistantCourant.value !== null,
    fermerAutreFenetre: () => {
      recueilsCorpus.fermerRecueils()
      casCorpus.fermerCas()
      tableauBordCorpus.fermerTableauBord()
    },
  })
  // Closures des autres fenêtres : leur ouverture referme aussi celle-ci.
  const fermerDocsCadreDepuisFenetre = () => docsCadre.fermerDocsCadre()

  let fermerCasPourRecueils: () => void = () => {}
  const recueilsCorpus = useRecueilsCorpus({
    recueils: corpus.recueils,
    membership: corpus.membership,
    ouvertId: ent.ouvertId,
    sourceOuverte: ent.donneesSourceOuverte,
    enregistrerRepereSelection: ent.enregistrerRepereSelection,
    ouvrirSource: ouvrirAuSegment,
    fermerAutreFenetre: () => {
      fermerCasPourRecueils()
      fermerDocsCadreDepuisFenetre()
    },
  })
  const casCorpus = useCasCorpus({
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
    ouvrirSource: ouvrirAuSegment,
    fermerRecueils: () => {
      recueilsCorpus.fermerRecueils()
      fermerDocsCadreDepuisFenetre()
    },
  })
  fermerCasPourRecueils = casCorpus.fermerCas
  const tableauBordCorpus = useTableauBordCorpus({ tableaubord: corpus.tableaubord })
  reinitialiserFenetresMetier = () => {
    recueilsCorpus.fermerRecueils()
    casCorpus.reinitialiserCas()
    tableauBordCorpus.fermerTableauBord()
    docsCadre.reinitialiserDocsCadre()
  }
  watch(ent.etatSauvegarde, (etat) => {
    if (etat !== 'à jour') return
    if (recueilsCorpus.recueilOuvertId.value) void recueilsCorpus.resoudreRecueil()
    if (casCorpus.casOuverts.value) void casCorpus.rafraichirProjectionsCas()
  })

  // --- Suppression d'un thème DEPUIS l'entretien (croise corpus ↔ entretien) ---
  async function demanderSuppressionTheme(id: string) {
    ent.hintCodage.value = null
    const autres = await window.sonal.corpus.compterUsagesCategorie(id, ent.ouvertId.value ?? undefined)
    if (autres > 0) {
      ent.hintCodage.value = `« ${corpus.nomTheme(id)} » est utilisé dans ${autres} autre(s) entretien — suppression impossible ici.`
      return
    }
    const n = ent.entretien.annotations.filter((a) => a.type === 'codage' && a.code === id).length
    themeASupprimer.value = { id, nom: corpus.nomTheme(id), n }
  }
  /** Confirme : retire les codages de CET entretien (modèle=vérité), supprime la
   *  DÉFINITION au corpus (exceptId → ne recompte pas cet entretien), autosave. */
  async function confirmerSuppressionTheme() {
    const cible = themeASupprimer.value
    if (!cible) return
    ent.retirerCodagesDuCode(cible.id)
    const r = await window.sonal.corpus.supprimerCategorie(cible.id, ent.ouvertId.value ?? undefined)
    if (r.ok) corpus.majCodebook(r.corpus.codebook)
    themeASupprimer.value = null
    await ent.sauver()
  }

  const listeEntretiens = () =>
    Object.entries(corpus.membership.value).map(([id, ref]) => ({ id, ...ref }))

  // Scope DÉMO « Mini Corpus Test » : construit le corpus de démo dans un dossier choisi
  // via le vrai pipeline d'import.
  // Dépendances injectées pour casser le cycle (demo utilise appliquerCorpus défini ci-dessus).
  const demo = utiliserDemo({
    appliquerCorpus,
    majDossierCourant: profil.majDossierCourant,
    rafraichirRecents: profil.rafraichirRecents,
    retourCorpus,
    preparerBascule,
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
  })
  // Branche le holder : `appliquerCorpus` restaure désormais le mode démo
  // (panneau « Pas à pas ») quand le corpus ouvert est un corpus démo.
  raccrocherModeCorpus = demo.raccrocherModeCorpus
  racineSourcesDemo = () => demo.racineSources.value

  // --- Menu applicatif : routage des items vers les actions existantes. ---
  // Le main construit le menu et émet ; ICI on route vers les modales et les
  // fonctions d'orchestration, comme si l'utilisateur avait cliqué dans l'UI.
  const modaleNouveauCorpus = ref(false)
  const modaleCorpusDistant = ref(false)
  /** Signal consommé par AjoutEntretien.vue (la modale vit dans la vue Corpus). */
  const demandeAjoutEntretien = ref(false)

  window.sonal.menu.surAction(async (action, modeTri) => {
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
          if (!ajoutEntretienPossible.value) break
          // La modale vit dans la vue Corpus : on s'y rend d'abord si besoin.
          if (vue.value === 'entretien') await retourCorpus()
          else if (vue.value === 'accueil' && dossierCourantDir.value) {
            vue.value = 'corpus'
          }
          if (vue.value === 'corpus') demandeAjoutEntretien.value = true
          break
        }
        case 'trier-entretiens': {
          const modes: readonly ModeTriEntretiens[] = ['alpha', 'ajout', 'modif', 'longueur']
          if (!modeTri || !modes.includes(modeTri)) throw new Error('Mode de tri inconnu.')
          if (lectureSeule.value || Object.keys(corpus.membership.value).length === 0) break
          if ((modeTri === 'modif' || modeTri === 'longueur') && ent.ouvertId.value) {
            if (idDistantCourant.value) {
              if (statutSession.value.etat === 'degrade' || ent.verrouAutrui.value) {
                throw new Error("L’entretien ouvert ne peut pas être publié avant le tri.")
              }
              if (!await publierMaintenant()) {
                throw new Error(publiErreur.value ?? "L’entretien ouvert n’a pas pu être publié.")
              }
            } else {
              await ent.viderSauvegarde()
            }
          }
          await trierEntretiens(modeTri)
          break
        }
        case 'exporter-corpus': {
          // La modale d'export vit sur l'App.
          // Elle s'ouvre depuis n'importe quelle vue et laisse choisir les entretiens du lot.
          ouvrirExportCorpus()
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
    creerEntretienVideDistant,
    vue,
    themeASupprimer,
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
    idDistantCourant,
    dossierCourantDir,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    actualiserDistant,
    lectureSeule,
    ajoutEntretienPossible,
    fournisseurCourant,
    verrousIndisponibles,
    tableLigneEditable,
    metaEditables,
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
    retourCorpus,
    allerAccueil,
    ouvrirEntretien,
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
    exportCorpusOuvert,
    ouvrirExportCorpus,
    fermerExportCorpus,
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
    listeEntretiens,
    modaleNouveauCorpus,
    modaleCorpusDistant,
    demandeAjoutEntretien,
    ...demo,
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
