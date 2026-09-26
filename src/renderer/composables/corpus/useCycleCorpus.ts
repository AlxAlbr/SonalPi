import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  EntreeVerrouPublic,
  EtatSessionPublic,
  OuvertureDistante,
} from '../../../shared/distant'
import type { DemandeCreationGitLab, DemandeOuvertureGitLab } from '../../../shared/gitlab'
import type { DemandeCreationWebDAV } from '../../../shared/webdav'
import type {
  CorpusFichier,
  EntreeRecent,
  EntretienRef,
  MarqueurDemo,
  ParamsAnon,
} from '../../../shared/format'
import { paramsAnonDefaut } from '../../../shared/format'
import { squeletteCorpus } from '../../../shared/corpus/squelette'
import type { TableauBord } from '../../../shared/corpus/tableaubord'
import {
  normaliserTableauBord,
  tableauBordParDefaut,
} from '../../../shared/corpus/tableaubord'
import { afficherErreurGlobale, effacerErreurGlobaleSi, infoGlobale } from '../../erreurs'
import { preparerFermetureEntretien } from '../../couturesApplication'

interface ProfilCycleCorpus {
  dossierCourantNom: Ref<string>
  recents: Ref<EntreeRecent[]>
  rafraichirRecents: () => Promise<void>
  majDossierCourant: () => Promise<void>
  choisirDossier: () => Promise<{ corpus: CorpusFichier; dir: string } | null>
  ouvrirDossier: (dir: string) => Promise<CorpusFichier>
}

interface ModeleCycleCorpus {
  membership: Ref<Record<string, EntretienRef>>
  recueils: Ref<NonNullable<CorpusFichier['recueils']>>
  cas: Ref<NonNullable<CorpusFichier['cas']>>
  famillesCas: Ref<NonNullable<CorpusFichier['famillesCas']>>
  attributsCas: Ref<NonNullable<CorpusFichier['attributsCas']>>
  tableaubord: Ref<TableauBord | null>
  paramsAnon: Ref<ParamsAnon>
  majCodebook: (codebook: CorpusFichier['codebook']) => void
  majVariables: (variables: CorpusFichier['variables']) => void
  majCategoriesNote: (categories: CorpusFichier['categoriesNote']) => void
  rafraichirUsages: () => Promise<void>
  perimerScanAnon: () => void
  reinitialiserScanAnon: () => void
  reinitialiserMatrice: () => void
}

interface EntretienCycleCorpus {
  ouvertId: Ref<string | null>
  verrouAutrui: () => boolean
  ouvrir: (id: string, sessionExistante?: boolean) => Promise<boolean>
  reinitialiser: () => void
  viderSauvegarde: () => Promise<void>
  annulerEtAttendreSauvegarde: () => Promise<void>
  positionTexte: () => number | null
  allerAuTexte: (pos: number) => void
}

interface AudioCycleCorpus {
  position: Ref<number>
  largeurVideo: Ref<number>
  estCharge: () => boolean
  charger: (audio: string | null, waveform: string | null) => void
  seek: (position: number) => void
  definirLargeurVideo: (largeur: number | null) => void
}

interface MediasCycleCorpus {
  rafraichirAudios: () => Promise<void>
  rafraichirIntegriteAudios: () => Promise<void>
  regenererOndesManquantes: () => Promise<void>
  majAudioEntretien: (id: string) => Promise<void>
}

interface DistantCycleCorpus {
  idCourant: Ref<string | null>
  lectureSeule: Ref<boolean>
  entretienEditable: Ref<boolean>
  statutSession: Ref<EtatSessionPublic>
  activer: (
    id: string,
    verrous: EntreeVerrouPublic[],
    inaccessibles?: { chemin: string; raison: string }[],
    lectureSeuleForcee?: boolean,
    corpusModifiableForce?: boolean,
    fournisseur?: 'webdav' | 'gitlab',
    observationIndisponible?: boolean,
  ) => void
  rafraichirOrphelins: () => Promise<void>
  quitter: () => void
  appliquerStatutSession: (statut: EtatSessionPublic) => void
}

interface EffetsCycleCorpus {
  reinitialiserSelection: () => void
  reinitialiserFenetresMetier: () => void
  deselectionner: () => void
  apresOuvertureEntretien: (id: string) => Promise<void>
  raccrocherModeCorpus: (
    marqueur: MarqueurDemo | undefined,
    dir: string | null,
  ) => Promise<void>
}

type VueApplication = 'accueil' | 'corpus' | 'entretien'

/** Coordonne les changements de corpus et le cycle de l'entretien ouvert. */
export function useCycleCorpus(deps: {
  vue: Ref<VueApplication>
  profil: ProfilCycleCorpus
  corpus: ModeleCycleCorpus
  entretien: EntretienCycleCorpus
  audio: AudioCycleCorpus
  medias: MediasCycleCorpus
  distant: DistantCycleCorpus
  effets: EffetsCycleCorpus
}) {
  const dossierCourantDir = ref<string | null>(null)
  const reprise = ref<{
    id: string
    positionAudio: number
    posTexte: number | null
  } | null>(null)

  async function chargerTailleVideo(): Promise<void> {
    const dir = dossierCourantDir.value
    if (!dir) return
    deps.audio.definirLargeurVideo(await window.sonal.media.lireLargeurVideo(dir))
  }

  const arreterMemoireLargeur = watch(deps.audio.largeurVideo, (largeur) => {
    const dir = dossierCourantDir.value
    if (dir && largeur > 0) void window.sonal.media.ecrireLargeurVideo(dir, largeur)
  })

  async function appliquerCorpus(corpus: CorpusFichier, dir?: string): Promise<void> {
    deps.entretien.reinitialiser()
    deps.audio.charger(null, null)
    if (dir) dossierCourantDir.value = dir
    deps.audio.largeurVideo.value = 0
    reprise.value = null
    deps.effets.reinitialiserSelection()
    deps.effets.reinitialiserFenetresMetier()
    deps.corpus.reinitialiserScanAnon()
    deps.corpus.reinitialiserMatrice()
    deps.corpus.membership.value = corpus.membership
    deps.corpus.recueils.value = corpus.recueils ?? {}
    deps.corpus.cas.value = corpus.cas ?? {}
    deps.corpus.famillesCas.value = corpus.famillesCas ?? {}
    deps.corpus.attributsCas.value = corpus.attributsCas ?? {}
    deps.corpus.tableaubord.value = normaliserTableauBord(corpus.tableaubord) ?? tableauBordParDefaut()
    deps.corpus.majCodebook(corpus.codebook)
    deps.corpus.majVariables(corpus.variables)
    deps.corpus.majCategoriesNote(corpus.categoriesNote)
    deps.corpus.paramsAnon.value = { ...paramsAnonDefaut(), ...(corpus.paramsAnon ?? {}) }
    await deps.corpus.rafraichirUsages()
    await deps.medias.rafraichirAudios()
    await deps.medias.rafraichirIntegriteAudios()
    void deps.medias.regenererOndesManquantes()
    void chargerTailleVideo()
    await deps.effets.raccrocherModeCorpus(corpus.demo, dir ?? null)
  }

  async function chargerCorpus(): Promise<void> {
    deps.distant.quitter()
    await deps.profil.rafraichirRecents()
    const premierLocal = deps.profil.recents.value.find((recent) => recent.type === 'local')
    if (premierLocal?.type === 'local') {
      await appliquerCorpus(
        await deps.profil.ouvrirDossier(premierLocal.dir),
        premierLocal.dir,
      )
    }
    deps.vue.value = 'accueil'
  }

  async function preparerBascule(): Promise<void> {
    if (!deps.entretien.ouvertId.value) return
    if (
      deps.distant.idCourant.value &&
      deps.distant.statutSession.value.etat === 'degrade'
    ) {
      await deps.entretien.annulerEtAttendreSauvegarde()
      return
    }
    if (
      !deps.distant.idCourant.value ||
      (!deps.distant.entretienEditable.value && !deps.entretien.verrouAutrui())
    ) {
      await deps.entretien.viderSauvegarde()
    }
  }

  async function choisirDossier(): Promise<void> {
    await preparerBascule()
    const resultat = await deps.profil.choisirDossier()
    if (!resultat) return
    deps.distant.quitter()
    await appliquerCorpus(resultat.corpus, resultat.dir)
    deps.vue.value = 'corpus'
  }

  async function creerNouveauCorpus(dir: string, nom: string): Promise<void> {
    await preparerBascule()
    const resultat = await window.sonal.corpus.creerNouveau(dir, nom)
    deps.profil.dossierCourantNom.value = resultat.nom
    deps.distant.quitter()
    await appliquerCorpus(resultat.corpus, resultat.dir)
    deps.vue.value = 'corpus'
  }

  async function ouvrirRecent(entree: EntreeRecent): Promise<void> {
    await preparerBascule()
    if (entree.type === 'distant') {
      if (entree.fournisseur === 'gitlab') await ouvrirDestinationGitLab(entree.id)
      else await ouvrirCorpusWebDAV(entree.id)
      return
    }
    deps.distant.quitter()
    await appliquerCorpus(await deps.profil.ouvrirDossier(entree.dir), entree.dir)
    deps.vue.value = 'corpus'
  }

  async function appliquerOuvertureDistante(
    resultat: OuvertureDistante,
    consultationSeule = false,
  ): Promise<void> {
    deps.distant.activer(
      resultat.distant.id,
      resultat.verrous,
      resultat.inaccessibles,
      consultationSeule,
      resultat.distant.fournisseur !== 'gitlab',
      resultat.distant.fournisseur,
      resultat.verrousIndisponibles,
    )
    deps.profil.dossierCourantNom.value = resultat.nom
    await appliquerCorpus(resultat.corpus, resultat.dir)
    if (!consultationSeule) await deps.distant.rafraichirOrphelins()
    deps.vue.value = 'corpus'
  }

  async function ouvrirCorpusWebDAV(id: string, motDePasse?: string): Promise<void> {
    await preparerBascule()
    await appliquerOuvertureDistante(
      await window.sonal.webdav.ouvrir(id, motDePasse),
    )
  }

  async function ouvrirDestinationGitLab(id: string): Promise<void> {
    await preparerBascule()
    await appliquerOuvertureDistante(
      await window.sonal.gitlab.ouvrir(id),
    )
  }

  async function enregistrerEtOuvrirGitLab(
    demande: DemandeOuvertureGitLab,
  ): Promise<void> {
    await preparerBascule()
    await appliquerOuvertureDistante(
      await window.sonal.gitlab.enregistrerEtOuvrir(demande),
    )
  }

  async function creerEtOuvrirGitLab(
    demande: DemandeCreationGitLab,
  ): Promise<void> {
    await preparerBascule()
    await appliquerOuvertureDistante(
      await window.sonal.gitlab.creerEtOuvrir(demande),
    )
  }

  async function creerCorpusWebDAV(params: DemandeCreationWebDAV) {
    const resultat = await window.sonal.webdav.creer(params)
    if (!resultat.ok) throw new Error(resultat.note)
    await deps.profil.rafraichirRecents()
    await ouvrirCorpusWebDAV(resultat.compte.id)
    return resultat.compte
  }

  async function oublierDestinationWebDAV(id: string) {
    await fermerEntretien()
    return window.sonal.webdav.oublier(id)
  }

  async function rafraichirCorpusSansFermer(): Promise<void> {
    const charge = await window.sonal.corpus.ouvrir()
    deps.corpus.membership.value = charge.membership
    deps.corpus.recueils.value = charge.recueils ?? {}
    deps.corpus.cas.value = charge.cas ?? {}
    deps.corpus.famillesCas.value = charge.famillesCas ?? {}
    deps.corpus.attributsCas.value = charge.attributsCas ?? {}
    deps.corpus.tableaubord.value = normaliserTableauBord(charge.tableaubord) ?? tableauBordParDefaut()
    deps.corpus.majCodebook(charge.codebook)
    deps.corpus.majVariables(charge.variables)
    deps.corpus.majCategoriesNote(charge.categoriesNote)
    deps.corpus.paramsAnon.value = { ...paramsAnonDefaut(), ...(charge.paramsAnon ?? {}) }
    deps.corpus.perimerScanAnon()
    await deps.corpus.rafraichirUsages()
    await deps.medias.rafraichirAudios()
  }

  let derniereErreurSortie: string | null = null
  async function fermerEntretienPourNavigation(): Promise<void> {
    try {
      await fermerEntretien()
      if (derniereErreurSortie) effacerErreurGlobaleSi(derniereErreurSortie)
      derniereErreurSortie = null
    } catch (erreur) {
      derniereErreurSortie = afficherErreurGlobale(
        erreur,
        'Vous restez dans l’entretien, car sa fermeture a échoué',
      )
      throw erreur
    }
  }

  async function retourCorpus(): Promise<void> {
    await fermerEntretienPourNavigation()
    if (deps.distant.idCourant.value) {
      void window.sonal.distant.noterEntretienOuvert(null)
    }
    deps.vue.value = 'corpus'
  }

  async function allerAccueil(): Promise<void> {
    await fermerEntretienPourNavigation()
    if (deps.distant.idCourant.value) {
      void window.sonal.distant.noterEntretienOuvert(null)
    }
    deps.vue.value = 'accueil'
  }

  async function ouvrirEntretien(id: string): Promise<void> {
    if (!(await deps.entretien.ouvrir(id))) return
    if (deps.distant.idCourant.value) {
      void window.sonal.distant.noterEntretienOuvert(id)
    }
    await deps.effets.apresOuvertureEntretien(id)
    await deps.medias.majAudioEntretien(id)
    deps.vue.value = 'entretien'
  }

  async function fermerEntretien(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id) return
    const sessionDegradee =
      deps.distant.idCourant.value !== null &&
      deps.distant.statutSession.value.etat === 'degrade'
    await preparerFermetureEntretien({
      distant: deps.distant.idCourant.value !== null,
      degrade: sessionDegradee,
      lectureSeule: !deps.distant.entretienEditable.value,
      verrouAutrui: deps.entretien.verrouAutrui(),
      annulerSauvegarde: deps.entretien.annulerEtAttendreSauvegarde,
      viderSauvegarde: deps.entretien.viderSauvegarde,
    })
    if (deps.distant.idCourant.value) {
      const resultat = await window.sonal.corpus.fermerEntretien(id)
      if (!resultat.fermee) {
        const geste =
          resultat.raison === 'publication' ? 'publier les modifications' : 'libérer le verrou'
        throw new Error(resultat.message ?? `Impossible de ${geste}.`)
      }
      deps.distant.appliquerStatutSession({ etat: 'aucune' })
    }
    reprise.value = {
      id,
      positionAudio: deps.audio.position.value,
      posTexte: deps.entretien.positionTexte(),
    }
    deps.entretien.reinitialiser()
    deps.audio.charger(null, null)
  }

  async function reprendre(): Promise<void> {
    const point = reprise.value
    if (!point || !deps.corpus.membership.value[point.id]) return
    await ouvrirEntretien(point.id)
    if (point.posTexte != null) deps.entretien.allerAuTexte(point.posTexte)
    if (deps.audio.estCharge() && point.positionAudio > 0) {
      deps.audio.seek(point.positionAudio)
    }
  }

  function nettoyerMiroirChange(): void {
    reprise.value = null
    deps.effets.deselectionner()
  }

  let basculeEnCours = false
  const arreterSuppressionCourant = window.sonal.corpus.surSuppressionCourant(
    async (suivant) => {
      if (basculeEnCours) return
      basculeEnCours = true
      try {
        deps.distant.quitter()
        if (suivant) {
          await appliquerCorpus(suivant.corpus, suivant.dir)
          await deps.profil.majDossierCourant()
          infoGlobale.value =
            'Le dossier du corpus courant a été supprimé sur disque — ' +
            `le corpus « ${suivant.nom} » devient le corpus courant.`
        } else {
          await appliquerCorpus(squeletteCorpus())
          dossierCourantDir.value = null
          deps.profil.dossierCourantNom.value = ''
          infoGlobale.value =
            "Le dossier du corpus courant a été supprimé sur disque ; aucun autre corpus récent n'existe."
        }
        deps.vue.value = 'accueil'
      } finally {
        basculeEnCours = false
      }
    },
  )

  onScopeDispose(() => {
    arreterMemoireLargeur()
    arreterSuppressionCourant()
  })

  return {
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
  }
}
