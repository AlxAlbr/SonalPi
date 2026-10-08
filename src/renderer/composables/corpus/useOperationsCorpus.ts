import { ref, type Ref } from 'vue'
import { importerFichier } from '../../formatSonal/sas'
import {
  enregistrerRapportPseudonymisation,
  exporterEntretien,
  construireInstantane,
  preparerRapportPseudonymisation,
  type ApercuRapportPseudonymisation,
  type ResultatExport,
  type ResultatPreparationRapport,
  type SourceExportEntretien,
} from '../../export/exportEntretien'
import {
  enregistrerRapportPseudonymisationCorpus,
  exporterCorpus,
  preparerRapportPseudonymisationCorpus,
  type ApercuRapportPseudonymisationCorpus,
  type DemandeLotCorpus,
  type ResultatEnregistrementRapportCorpus,
  type ResultatLotCorpus,
  type ResultatPreparationRapportCorpus,
  type SourceExportCorpus,
} from '../../export/exportCorpus'
import { assemblerModeleQualcoder } from '../../export/exportQualcoder'
import {
  type EntreeExport,
  type FormatExport,
  type OptionsExport,
} from '../../../shared/export/types'
import { mapperEntretiensV1, type CrpV1Entretien, type DemandeMigration, type EntretienV1Import } from '../../../shared/corpus/migrationCrp'
import type { ImpactSuppressionEntretien } from '../../../shared/corpus/suppressionEntretien'
import type { ReperePassage } from '../../../shared/entretien/reperesPassages'
import type {
  Categorie,
  CorpusFichier,
  EntretienFichier,
  EntretienRef,
  NoteCategory,
  PayloadEntretien,
  RegleAnon,
  MetaEntretien,
  ModeTriEntretiens,
  Note,
  Variable,
} from '../../../shared/format'

interface CorpusOperations {
  membership: Ref<Record<string, EntretienRef>>
  cas: Ref<NonNullable<CorpusFichier['cas']>>
  famillesCas: Ref<NonNullable<CorpusFichier['famillesCas']>>
  attributsCas: Ref<NonNullable<CorpusFichier['attributsCas']>>
  codebook: Ref<Categorie[]>
  variables: Ref<Variable[]>
  lirePersonnes: () => Promise<{ personnes: Array<{ id: string; nom: string }> }>
  categoriesNote: Ref<NoteCategory[]>
  reglesAnon: Ref<RegleAnon[]>
  majCodebook: (codebook: CorpusFichier['codebook']) => void
  majVariables: (variables: CorpusFichier['variables']) => void
  majCategoriesNote: (categories?: NoteCategory[] | null) => void
  rafraichirScanAnon: () => Promise<boolean>
  perimerScanAnon: () => void
  rafraichirUsages: () => Promise<void>
}

interface EntretienOperations {
  ouvertId: Ref<string | null>
  ongletDroite: Ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'>
  editeurDisponible: () => boolean
  sauver: () => Promise<void>
  donneesExport: () => Omit<EntreeExport, 'codebook' | 'variables' | 'reglesAnon'> & {
    notes?: Note[]
    reperesPassages: ReperePassage[]
    meta: MetaEntretien & { valeursGen: Record<string, string> }
  }
  fusionPossible: (copie: EntretienFichier) => boolean
  absorberFusion: (copie: EntretienFichier) => Promise<unknown>
  allerAuTexte: (pos: number) => void
}

type RepriseEntretien = Ref<{
  id: string
  positionAudio: number
  posTexte: number | null
} | null>

const DOC_VIDE = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] }

/** Gère les imports, exports et mutations des entretiens d'un corpus. */
export function useOperationsCorpus(deps: {
  corpus: CorpusOperations
  entretien: EntretienOperations
  vue: Ref<'accueil' | 'corpus' | 'entretien'>
  cycle: {
    appliquerCorpus: (corpus: CorpusFichier, dir?: string) => Promise<void>
    preparerBascule: () => Promise<void>
    ouvrirEntretien: (id: string) => Promise<void>
    fermerEntretien: () => Promise<void>
    reprise: RepriseEntretien
  }
  profil: {
    dossierCourantNom: Ref<string>
    rafraichirRecents: () => Promise<void>
  }
  medias: {
    genererOnde: (id: string, audioRef: string) => Promise<void>
    rafraichirAudios: () => Promise<void>
    regenererOndesManquantes: () => Promise<void>
  }
  distant: {
    idCourant: Ref<string | null>
    quitter: () => void
  }
  selection: {
    id: Ref<string | null>
    deselectionner: () => void
  }
}) {
  const divergenceProposee = ref<{
    chemin: string
    date: string
    contenu: unknown
    fusionnable: boolean
  } | null>(null)
  const entretienASupprimer = ref<{
    id: string
    titre: string
    impact: ImpactSuppressionEntretien
  } | null>(null)

  async function migrerDepuisV1(
    requete: DemandeMigration,
    entretiensV1?: CrpV1Entretien[],
  ): Promise<void> {
    await deps.cycle.preparerBascule()
    const resultat = await window.sonal.migrer.executer(requete)
    deps.profil.dossierCourantNom.value = resultat.nom
    await deps.profil.rafraichirRecents()
    deps.distant.quitter()
    await deps.cycle.appliquerCorpus(resultat.corpus, resultat.dir)
    for (const entretien of mapperEntretiensV1(entretiensV1)) {
      await importerEntretienV1(requete.cheminCrp, entretien)
    }
    await deps.corpus.rafraichirUsages()
    await deps.medias.rafraichirAudios()
    void deps.medias.regenererOndesManquantes()
    deps.vue.value = 'corpus'
  }

  async function importerEntretienV1(
    cheminCrp: string,
    entretienV1: EntretienV1Import,
  ): Promise<void> {
    let payload: PayloadEntretien | null = null
    let reglesAnon: RegleAnon[] | undefined
    const lecture = await window.sonal.migrer.lireSonal(cheminCrp, entretienV1.rtrPath)
    if (lecture) {
      try {
        const resultat = importerFichier(lecture.nom, lecture.contenu, (html) =>
          new DOMParser().parseFromString(html, 'text/html'),
        )
        payload = {
          ...resultat.payload,
          meta: {
            ...resultat.payload.meta,
            audioRef: entretienV1.audioRef,
            sourceV1: { rtrPath: entretienV1.rtrPath },
          },
        }
        reglesAnon = resultat.reglesAnon
      } catch {
        payload = null
      }
    }
    if (!payload) {
      payload = {
        corpsTexte: DOC_VIDE,
        annotations: [],
        ancres: [],
        locuteurs: [],
        meta: {
          valeursGen: {},
          audioRef: entretienV1.audioRef,
          sourceV1: { rtrPath: entretienV1.rtrPath },
        },
        brouillonsAnon: [],
      }
    }
    const resultat = await window.sonal.corpus.importer(
      entretienV1.titre,
      payload,
      [],
      [],
      reglesAnon,
    )
    deps.corpus.membership.value = resultat.corpus.membership
    await deps.corpus.rafraichirScanAnon()
  }

  async function proposerFusionDivergence(id: string): Promise<void> {
    divergenceProposee.value = null
    if (!deps.distant.idCourant.value) return
    const divergences = await window.sonal.distant.listerDivergences()
    const copie = divergences.filter((divergence) => divergence.id === id).at(-1)
    if (!copie) return
    const contenu = await window.sonal.distant.lireDivergence(copie.chemin) as
      | EntretienFichier
      | null
    if (!contenu) return
    divergenceProposee.value = {
      chemin: copie.chemin,
      date: copie.date,
      contenu,
      fusionnable: deps.entretien.fusionPossible(contenu),
    }
  }

  async function confirmerFusion(): Promise<void> {
    const divergence = divergenceProposee.value
    if (!divergence?.fusionnable) return
    await deps.entretien.absorberFusion(divergence.contenu as EntretienFichier)
    await window.sonal.distant.supprimerDivergence(divergence.chemin)
    divergenceProposee.value = null
  }

  async function jeterDivergence(): Promise<void> {
    const divergence = divergenceProposee.value
    if (!divergence) return
    await window.sonal.distant.supprimerDivergence(divergence.chemin)
    divergenceProposee.value = null
  }

  function plusTardDivergence(): void {
    divergenceProposee.value = null
  }

  async function ajouterEntretien(
    texte: { nom: string; contenu: string } | null,
    audioChemin: string | null,
    options: { ouvrir?: boolean; titreVide?: string } = {},
  ): Promise<void> {
    const titreVide = options.titreVide?.trim()
    if (!texte && !audioChemin && !titreVide) return
    let id: string
    if (texte) {
      const importe = importerFichier(texte.nom, texte.contenu, (html) =>
        new DOMParser().parseFromString(html, 'text/html'),
      )
      const titre = texte.nom.replace(/\.[^.]+$/, '')
      const resultat = await window.sonal.corpus.importer(
        titre,
        { ...importe.payload, legacy: importe.legacy as unknown as Record<string, unknown> },
        importe.codebook,
        importe.variables,
        importe.reglesAnon,
      )
      deps.corpus.membership.value = resultat.corpus.membership
      deps.corpus.majCodebook(resultat.corpus.codebook)
      deps.corpus.majVariables(resultat.corpus.variables)
      deps.corpus.majCategoriesNote(resultat.corpus.categoriesNote)
      await deps.corpus.rafraichirScanAnon()
      await deps.corpus.rafraichirUsages()
      id = resultat.id
    } else {
      await deps.entretien.sauver()
      const titre = audioChemin
        ? audioChemin.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
        : titreVide!
      const resultat = await window.sonal.corpus.creerEntretienVide(titre)
      deps.corpus.membership.value = resultat.corpus.membership
      deps.corpus.perimerScanAnon()
      id = resultat.id
    }
    if (audioChemin) {
      const audio = await window.sonal.corpus.assignerAudio(id, audioChemin)
      if (audio) await deps.medias.genererOnde(id, audio.audioRef)
      await deps.medias.rafraichirAudios()
    }
    if (options.ouvrir !== false) await deps.cycle.ouvrirEntretien(id)
  }

  /** Fenêtre d'export de l'entretien : le bouton ouvre la fenêtre ; l'export
   *  part ensuite avec le format et les options choisis. */
  const exportOuvert = ref(false)
  function ouvrirExport(): void {
    exportOuvert.value = true
  }
  function fermerExport(): void {
    exportOuvert.value = false
  }

  /** Fenêtre d'export du CORPUS (lot d'entretiens) : le bouton de la barre
   *  du corpus l'ouvre ; la modale pilote la sélection, la progression et
   *  l'annulation. */
  const exportCorpusOuvert = ref(false)
  function ouvrirExportCorpus(): void {
    exportCorpusOuvert.value = true
  }
  function fermerExportCorpus(): void {
    exportCorpusOuvert.value = false
  }

  /** Source du service d'export : l'entretien OUVERT (état mémoire) et les
   *  définitions du corpus courant ; les écritures et la résolution audio
   *  passent par le main. Aucune sauvegarde n'est déclenchée : un export est
   *  une photographie, pas une persistance. */
  function sourceExport(): SourceExportEntretien {
    return {
      ouvertId: () => deps.entretien.ouvertId.value,
      titre: (id) => deps.corpus.membership.value[id]?.titre ?? 'entretien',
      donneesExport: deps.entretien.donneesExport,
      codebook: () => deps.corpus.codebook.value,
      variables: () => deps.corpus.variables.value,
      categoriesNote: () => deps.corpus.categoriesNote.value,
      reglesAnon: () => deps.corpus.reglesAnon.value,
      audioLocal: (audioRef) =>
        audioRef ? window.sonal.export.audioLocal(audioRef) : Promise.resolve(null),
      ecrireTexte: (nom, contenu) => window.sonal.dialog.choisirExport(nom, contenu),
      ecrireDocx: (demande) => window.sonal.export.entretienDocx(demande),
      ecrirePdf: (demande) => window.sonal.export.entretienPdf(demande),
    }
  }

  /** Export de l'entretien ouvert : délégation au service dédié (instantané,
   *  audit, génération, écriture). */
  function exporter(
    format: FormatExport,
    options: OptionsExport,
  ): Promise<ResultatExport> {
    return exporterEntretien(format, options, sourceExport())
  }

  /** Source du service d'export CORPUS : le lot lit et écrit par le main,
 *  l'entretien ouvert s'exporte depuis la mémoire (aucune relecture disque,
 *  aucune sauvegarde déclenchée). */
  function sourceExportCorpus(): SourceExportCorpus {
    return {
      nomCorpus: () => deps.profil.dossierCourantNom.value.trim() || 'Corpus',
      instantaneOuvert: () => construireInstantane(sourceExport()),
      instantaneDistant: (id) => window.sonal.export.instantaneCorpus(id),
      choisirDossier: (nomSuggere) => window.sonal.export.corpus.choisirDossier(nomSuggere),
      listerDestination: () => window.sonal.export.corpus.lister(),
      ecrireTexte: (nom, contenu) => window.sonal.export.corpus.ecrireTexte(nom, contenu),
      ecrireDocx: (demande, nom) => window.sonal.export.corpus.ecrireDocx(demande, nom),
      ecrirePdf: (nom, html) => window.sonal.export.corpus.ecrirePdf(nom, html),
      copierMedia: (urlAudio) => window.sonal.export.corpus.copierMedia(urlAudio),
      fermer: () => window.sonal.export.corpus.fermer(),
    }
  }

  /** Export d'un lot d'entretiens : délégation au service d'orchestration.
 *  La modale fournit la progression à afficher et la consultation
 *  d'annulation ; le lot avance entretien par entretien. */
  function exporterCorpusLot(
    demande: DemandeLotCorpus,
    extras: {
      surProgression?: (faits: number, total: number, titre: string) => void
      continu?: () => boolean
    } = {},
  ): Promise<ResultatLotCorpus> {
    return exporterCorpus(
      demande,
      { ...sourceExportCorpus(), surProgression: extras.surProgression, doitContinuer: extras.continu },
    )
  }

  async function exporterQualcoderLot(
    selection: Array<{ id: string; titre: string; date: string | null }>,
    casSelectionnes: string[],
  ): Promise<{ etat: 'succes'; dossier: string } | { etat: 'annule' } | { etat: 'echec'; message: string }> {
    const snapshots = []
    try {
      for (const item of selection) {
        const resultat = item.id === deps.entretien.ouvertId.value
          ? { etat: 'succes' as const, instantane: await construireInstantane(sourceExport()) }
          : await window.sonal.export.instantaneCorpus(item.id)
        if (resultat.etat === 'echec' || !resultat.instantane) {
          throw new Error(resultat.etat === 'echec' ? resultat.message : `L'entretien « ${item.titre} » n'est plus disponible.`)
        }
        snapshots.push({
          ...resultat.instantane,
          date: resultat.instantane.date ?? item.date,
          reperesPassages: resultat.instantane.reperesPassages,
        })
      }
      const inventaire = await deps.corpus.lirePersonnes()
      const modele = assemblerModeleQualcoder({
        nom: deps.profil.dossierCourantNom.value.trim() || 'Corpus',
        selection: snapshots,
        corpus: {
          membership: deps.corpus.membership.value,
          variables: Object.fromEntries(deps.corpus.variables.value.map((variable) => [variable.id, variable])),
          famillesCas: deps.corpus.famillesCas.value,
          attributsCas: deps.corpus.attributsCas.value,
          codebook: Object.fromEntries(deps.corpus.codebook.value.map((category) => [category.id, category])),
          cas: deps.corpus.cas.value,
        },
        personnes: Object.fromEntries(inventaire.personnes.map((personne) => [personne.id, personne])),
        casSelectionnes,
        owner: 'SonalPi',
      })
      const dossier = await window.sonal.export.corpus.choisirDossier(`${modele.nom}_qualcoder.qda`)
      if (!dossier) return { etat: 'annule' }
      try {
        await window.sonal.export.corpus.ecrireQualcoder(modele)
        return { etat: 'succes', dossier }
      } finally {
        await window.sonal.export.corpus.fermer()
      }
    } catch (erreur) {
      return { etat: 'echec', message: erreur instanceof Error ? erreur.message : String(erreur) }
    }
  }

  function preparerRapportCorpus(
    demande: DemandeLotCorpus,
  ): Promise<ResultatPreparationRapportCorpus> {
    return preparerRapportPseudonymisationCorpus(demande, sourceExportCorpus())
  }

  function enregistrerRapportCorpus(
    apercu: ApercuRapportPseudonymisationCorpus,
  ): Promise<ResultatEnregistrementRapportCorpus> {
    return enregistrerRapportPseudonymisationCorpus(
      apercu,
      (nom, contenu) => window.sonal.dialog.choisirExport(nom, contenu),
    )
  }

  function preparerRapport(
    format: FormatExport,
    options: OptionsExport,
  ): Promise<ResultatPreparationRapport> {
    return preparerRapportPseudonymisation(format, options, sourceExport())
  }

  function enregistrerRapport(
    apercu: ApercuRapportPseudonymisation,
  ): Promise<ResultatExport> {
    return enregistrerRapportPseudonymisation(apercu, sourceExport())
  }

  async function renommer(id: string, evenement: Event): Promise<void> {
    const titre = (evenement.target as HTMLInputElement).value.trim()
    if (titre) {
      deps.corpus.membership.value = (
        await window.sonal.corpus.renommerEntretien(id, titre)
      ).membership
    }
  }

  async function trierEntretiens(mode: ModeTriEntretiens): Promise<void> {
    const corpus = await window.sonal.corpus.trierEntretiens(mode)
    deps.corpus.membership.value = corpus.membership
  }

  async function supprimer(
    id: string,
    impact?: ImpactSuppressionEntretien,
  ): Promise<void> {
    if (deps.entretien.ouvertId.value === id) await deps.cycle.fermerEntretien()
    // L'impact vient souvent d'un état réactif (bannière de confirmation) : l'IPC
    // exige un objet clonable, on envoie une copie plate.
    const corpus = await window.sonal.corpus.supprimerEntretien(
      id,
      impact ? JSON.parse(JSON.stringify(impact)) : undefined,
    )
    deps.corpus.membership.value = corpus.membership
    deps.corpus.cas.value = corpus.cas ?? {}
    deps.corpus.famillesCas.value = corpus.famillesCas ?? {}
    deps.corpus.attributsCas.value = corpus.attributsCas ?? {}
    deps.corpus.perimerScanAnon()
    if (deps.cycle.reprise.value?.id === id) deps.cycle.reprise.value = null
    if (deps.selection.id.value === id) deps.selection.deselectionner()
  }

  async function ouvrirAuSegment(id: string, pos: number): Promise<void> {
    await deps.cycle.ouvrirEntretien(id)
    deps.entretien.allerAuTexte(pos)
  }

  async function ouvrirOnglet(
    id: string,
    onglet: 'locuteurs' | 'notes' | 'donnees',
  ): Promise<void> {
    await deps.cycle.ouvrirEntretien(id)
    if (deps.entretien.ouvertId.value === id) deps.entretien.ongletDroite.value = onglet
  }

  async function demanderSuppressionEntretien(id: string): Promise<void> {
    const impact = await window.sonal.corpus.analyserSuppressionEntretien(id)
    entretienASupprimer.value = {
      id,
      titre: deps.corpus.membership.value[id]?.titre ?? id,
      impact,
    }
  }

  async function confirmerSuppressionEntretien(): Promise<void> {
    const cible = entretienASupprimer.value
    if (!cible) return
    try {
      await supprimer(cible.id, cible.impact)
      entretienASupprimer.value = null
    } catch (erreur) {
      try {
        cible.impact = await window.sonal.corpus.analyserSuppressionEntretien(cible.id)
      } catch {
        entretienASupprimer.value = null
      }
      throw erreur
    }
  }

  return {
    divergenceProposee,
    entretienASupprimer,
    migrerDepuisV1,
    proposerFusionDivergence,
    reinitialiserDivergence: () => {
      divergenceProposee.value = null
    },
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
    allerSaisieDonnees: (id: string) => ouvrirOnglet(id, 'donnees'),
    allerLocuteurs: (id: string) => ouvrirOnglet(id, 'locuteurs'),
    allerNotes: (id: string) => ouvrirOnglet(id, 'notes'),
    demanderSuppressionEntretien,
    confirmerSuppressionEntretien,
  }
}
