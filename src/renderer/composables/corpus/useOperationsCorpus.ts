import { ref, type Ref } from 'vue'
import { importerFichier } from '../../import/sas'
import { exporterSonal, type EntreeExport } from '../../import/exportSonal'
import { mapperEntretiensV1, type CrpV1Entretien, type DemandeMigration, type EntretienV1Import } from '../../../shared/corpus/migrationCrp'
import type { ImpactSuppressionEntretien } from '../../../shared/corpus/suppressionEntretien'
import type {
  Categorie,
  CorpusFichier,
  EntretienFichier,
  EntretienRef,
  NoteCategory,
  PayloadEntretien,
  RegleAnon,
  Variable,
} from '../../../shared/format'

interface CorpusOperations {
  membership: Ref<Record<string, EntretienRef>>
  cas: Ref<NonNullable<CorpusFichier['cas']>>
  famillesCas: Ref<NonNullable<CorpusFichier['famillesCas']>>
  codebook: Ref<Categorie[]>
  variables: Ref<Variable[]>
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
  donneesExport: () => Omit<EntreeExport, 'codebook' | 'variables' | 'reglesAnon'>
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
    options: { ouvrir?: boolean } = {},
  ): Promise<void> {
    if (!texte && !audioChemin) return
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
      const titre = audioChemin!.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
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

  async function exporter(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id || !deps.entretien.editeurDisponible()) return
    await deps.entretien.sauver()
    const html = exporterSonal({
      ...deps.entretien.donneesExport(),
      codebook: deps.corpus.codebook.value,
      variables: deps.corpus.variables.value,
      reglesAnon: deps.corpus.reglesAnon.value,
    })
    const titre = deps.corpus.membership.value[id]?.titre ?? 'entretien'
    await window.sonal.dialog.choisirExport(`${titre}.sonal`, html)
  }

  async function renommer(id: string, evenement: Event): Promise<void> {
    const titre = (evenement.target as HTMLInputElement).value.trim()
    if (titre) {
      deps.corpus.membership.value = (
        await window.sonal.corpus.renommerEntretien(id, titre)
      ).membership
    }
  }

  async function supprimer(
    id: string,
    impact?: ImpactSuppressionEntretien,
  ): Promise<void> {
    if (deps.entretien.ouvertId.value === id) await deps.cycle.fermerEntretien()
    const corpus = await window.sonal.corpus.supprimerEntretien(id, impact)
    deps.corpus.membership.value = corpus.membership
    deps.corpus.cas.value = corpus.cas ?? {}
    deps.corpus.famillesCas.value = corpus.famillesCas ?? {}
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
    exporter,
    renommer,
    supprimer,
    ouvrirAuSegment,
    allerSaisieDonnees: (id: string) => ouvrirOnglet(id, 'donnees'),
    allerLocuteurs: (id: string) => ouvrirOnglet(id, 'locuteurs'),
    allerNotes: (id: string) => ouvrirOnglet(id, 'notes'),
    demanderSuppressionEntretien,
    confirmerSuppressionEntretien,
  }
}
