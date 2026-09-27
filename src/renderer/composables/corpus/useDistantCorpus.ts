import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  CapacitesCorpus,
  EntreeVerrouPublic,
  EtatSessionPublic,
  EtatVerrouPublic,
  OrphelinDistant,
  PresencePublic,
  ProgressionTransfert,
} from '../../../shared/distant'
import { appliquerStatutSession as appliquerStatutSessionApplication } from '../../couturesApplication'

type VueApplication = 'accueil' | 'corpus' | 'entretien'

/** Un corpus local sait tout faire : c'est la référence des capacités. */
const TOUTES_CAPACITES: CapacitesCorpus = {
  definitions: true,
  definitionsAvecSources: true,
  triContenu: true,
  ajoutEntretien: true,
  editionEntretien: true,
  suppressionEntretien: true,
  renommageEntretien: true,
  metadonneesEntretien: true,
  tableDonnees: true,
  pseudonymisationEntretiens: true,
  notes: true,
  personnes: true,
  annulationJournal: true,
  mediasPartages: true,
  docsCadre: true,
}

interface EffetsDistantCorpus {
  rafraichirCorpusSansFermer: () => Promise<void>
  nettoyerMiroirChange: () => void
  detecterDivergencesAnon: () => void
  majAudiosInaccessibles: (liste: { chemin: string; raison: string }[]) => void
  reinitialiserDivergence: () => void
  rendreEditeurEditable: (editable: boolean) => void
}

interface EntretienDistantCorpus {
  ouvertId: Ref<string | null>
  verrouAutrui: () => boolean
  sauver: () => Promise<void>
  viderSauvegarde: () => Promise<void>
  preserverEtAnnulerSauvegarde: () => Promise<boolean>
  annulerEtAttendreSauvegarde: () => Promise<void>
}

/** Le tri par contenu se calcule sur les versions publiées de tous les
 *  entretiens : il demande donc un corpus calme. Sur un corpus distant, un
 *  entretien ouvert n'est jamais publié en silence pour le faire passer. */
export function verifierTriContenu(options: {
  capacite: boolean
  distant: boolean
  entretienOuvert: boolean
}): void {
  if (!options.capacite) {
    throw new Error('Le tri par contenu n’est pas disponible sur ce corpus.')
  }
  if (options.distant && options.entretienOuvert) {
    throw new Error(
      'Le tri par contenu demande la fermeture de tous les entretiens : '
      + 'fermez celui qui est ouvert, puis relancez le tri.',
    )
  }
}

/** Gère l'état, les tirages et les sessions d'un corpus distant. */
export function useDistantCorpus(deps: {
  vue: Ref<VueApplication>
  entretien: EntretienDistantCorpus
  effets: EffetsDistantCorpus
}) {
  const idDistantCourant = ref<string | null>(null)
  const dernierTirage = ref<string | null>(null)
  const tirageEnCours = ref(false)
  const progressionDistant = ref<ProgressionTransfert | null>(null)
  const enLigne = ref(true)
  const consultationSeule = ref(false)
  const fournisseurCourant = ref<'webdav' | 'gitlab' | null>(null)
  const badgesVerrous = ref<Record<string, EtatVerrouPublic>>({})
  /** L'observation des détenteurs a échoué : aucun badge n'est fiable, et
   *  l'absence de badge ne prouve rien. Ne décide jamais d'une écriture. */
  const verrousIndisponibles = ref(false)
  const presences = ref<PresencePublic[]>([])
  const orphelinsDistants = ref<OrphelinDistant[]>([])
  const statutSession = ref<EtatSessionPublic>({ etat: 'aucune' })
  const publiErreur = ref<string | null>(null)

  const pourcentageProgression = computed(() => {
    const progression = progressionDistant.value
    if (!progression || !progression.total) return null
    return Math.min(100, Math.round((progression.octets / progression.total) * 100))
  })

  /** Ce que le fournisseur courant sait faire, reçu du main à l'ouverture.
   *  Il ne décide d'aucun accès : l'hors ligne et la consultation seule
   *  s'appliquent au-dessus, la session d'un entretien en plus. */
  const capacites = ref<CapacitesCorpus>(TOUTES_CAPACITES)

  /** Blocage d'ordre général : réseau et mode consultation. */
  const indisponible = computed(
    () => !enLigne.value || consultationSeule.value,
  )

  const lectureSeule = computed(
    () => idDistantCourant.value !== null && (indisponible.value || !capacites.value.definitions),
  )

  const ajoutEntretienPossible = computed(
    () =>
      idDistantCourant.value === null ||
      (!indisponible.value && capacites.value.ajoutEntretien),
  )

  const entretienEditable = computed(
    () =>
      enLigne.value &&
      !consultationSeule.value &&
      !deps.entretien.verrouAutrui() &&
      statutSession.value.etat !== 'degrade',
  )

  function absorberVerrous(entrees: EntreeVerrouPublic[]): void {
    const suivant: Record<string, EtatVerrouPublic> = {}
    for (const entree of entrees) {
      if (!entree.contenu) continue
      let correspondance = /^verrous\/(.+)\.lock\.json$/.exec(entree.chemin)
      if (!correspondance) {
        correspondance = /^entretiens\/(.+)\.json$/.exec(entree.chemin)
      }
      if (correspondance) suivant[correspondance[1]] = entree.contenu
    }
    badgesVerrous.value = suivant
  }

  function badgeVerrou(id: string): EtatVerrouPublic | null {
    return badgesVerrous.value[id] ?? null
  }

  function absorberPresences(liste?: PresencePublic[]): void {
    presences.value = liste ?? []
  }

  function presencesSur(id: string): PresencePublic[] {
    return presences.value.filter((presence) => presence.entretienOuvert === id)
  }

  function activerDistant(
    id: string,
    verrous: EntreeVerrouPublic[],
    inaccessibles: { chemin: string; raison: string }[] = [],
    lectureSeuleForcee = false,
    capacitesCourant: CapacitesCorpus = TOUTES_CAPACITES,
    fournisseur: 'webdav' | 'gitlab' = 'webdav',
    observationIndisponible = false,
  ): void {
    idDistantCourant.value = id
    enLigne.value = true
    consultationSeule.value = lectureSeuleForcee
    capacites.value = capacitesCourant
    fournisseurCourant.value = fournisseur
    dernierTirage.value = new Date().toISOString()
    verrousIndisponibles.value = observationIndisponible
    absorberVerrous(verrous)
    deps.effets.majAudiosInaccessibles(inaccessibles)
  }

  async function rafraichirOrphelins(): Promise<void> {
    orphelinsDistants.value = (await window.sonal.distant.orphelins()) ?? []
  }

  function quitterDistant(): void {
    idDistantCourant.value = null
    dernierTirage.value = null
    badgesVerrous.value = {}
    verrousIndisponibles.value = false
    presences.value = []
    orphelinsDistants.value = []
    statutSession.value = { etat: 'aucune' }
    publiErreur.value = null
    deps.effets.reinitialiserDivergence()
    enLigne.value = true
    consultationSeule.value = false
    capacites.value = TOUTES_CAPACITES
    fournisseurCourant.value = null
  }

  /** Un geste est proposé quand le fournisseur le sait faire et qu'on est en
   *  ligne. L'observation des détenteurs n'entre pas ici : un badge manquant ne
   *  prouve aucune absence d'exclusion, et c'est le bail qui refuse. */
  function gesteDisponible(capacite: keyof CapacitesCorpus): boolean {
    return idDistantCourant.value === null ||
      (!indisponible.value && capacites.value[capacite])
  }

  function tableLigneEditable(id: string): boolean {
    return gesteDisponible('tableDonnees') && !badgeVerrou(id)
  }

  function pseudonymisationLigneEditable(id: string): boolean {
    return gesteDisponible('pseudonymisationEntretiens') && !badgeVerrou(id)
  }

  function metaEditables(id: string): boolean {
    return gesteDisponible('metadonneesEntretien') && !badgeVerrou(id)
  }

  function renommagePossible(id: string): boolean {
    return gesteDisponible('renommageEntretien') && !badgeVerrou(id)
  }

  function suppressionPossible(id: string): boolean {
    return gesteDisponible('suppressionEntretien') && !badgeVerrou(id)
  }

  async function actualiserDistant(silencieux = false): Promise<boolean> {
    if (!idDistantCourant.value || tirageEnCours.value) return false
    tirageEnCours.value = true
    try {
      const tirage = await window.sonal.distant.tirer()
      if (!tirage) {
        idDistantCourant.value = null
        return false
      }
      enLigne.value = true
      verrousIndisponibles.value = tirage.verrousIndisponibles === true
      absorberVerrous(tirage.verrous)
      absorberPresences(tirage.presences)
      deps.effets.majAudiosInaccessibles(tirage.inaccessibles ?? [])
      if (tirage.telecharges.includes('corpus.json') && deps.entretien.ouvertId.value) {
        deps.effets.detecterDivergencesAnon()
      }
      if (tirage.telecharges.length > 0 || tirage.corbeille.length > 0) {
        if (!deps.entretien.ouvertId.value) deps.effets.nettoyerMiroirChange()
        await deps.effets.rafraichirCorpusSansFermer()
      }
      dernierTirage.value = tirage.date
      return true
    } catch (erreur) {
      enLigne.value = false
      if (!silencieux) throw erreur
      return false
    } finally {
      tirageEnCours.value = false
      progressionDistant.value = null
    }
  }

  async function reprendreOrphelin(
    cheminVerrou: string,
  ): Promise<{ ok: boolean; raison?: string }> {
    const resultat = await window.sonal.distant.reprendreOrphelin(cheminVerrou)
    orphelinsDistants.value = orphelinsDistants.value.filter(
      (orphelin) => orphelin.cheminVerrou !== cheminVerrou,
    )
    if (resultat.ok) await actualiserDistant(true)
    return resultat
  }

  async function abandonnerOrphelin(cheminVerrou: string): Promise<void> {
    await window.sonal.distant.abandonnerOrphelin(cheminVerrou)
    orphelinsDistants.value = orphelinsDistants.value.filter(
      (orphelin) => orphelin.cheminVerrou !== cheminVerrou,
    )
    await actualiserDistant(true)
  }

  function appliquerStatutSession(statut: EtatSessionPublic): void {
    appliquerStatutSessionApplication(statutSession.value, statut, {
      definirStatut: (nouveauStatut) => {
        statutSession.value = nouveauStatut
      },
      rendreEditeurNonModifiable: () => deps.effets.rendreEditeurEditable(false),
      preserverEtAnnulerSauvegarde: async () => {
        try {
          const preserve = await deps.entretien.preserverEtAnnulerSauvegarde()
          if (!preserve) {
            publiErreur.value =
              'La dernière modification n’a pas pu être mise de côté. Gardez cette fenêtre ouverte pour ne pas la perdre.'
          }
        } catch {
          publiErreur.value =
            'La dernière modification n’a pas pu être mise de côté. Gardez cette fenêtre ouverte pour ne pas la perdre.'
        }
      },
    })
  }

  async function rafraichirStatutSession(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id || !idDistantCourant.value) {
      appliquerStatutSession({ etat: 'aucune' })
      return
    }
    try {
      appliquerStatutSession(await window.sonal.corpus.etatSession(id))
    } catch {
      // Le main n'a plus de corpus distant : le dernier statut reste affiché.
    }
  }

  async function publierMaintenant(): Promise<boolean> {
    const id = deps.entretien.ouvertId.value
    if (!id || !idDistantCourant.value) return true
    await deps.entretien.sauver()
    publiErreur.value = null
    try {
      const resultat = await window.sonal.corpus.publierEntretien(id)
      if (!resultat.ok) {
        const messages: Record<string, string> = {
          conflit:
            'Le serveur a changé pendant notre session. Vos modifications ont été mises de côté localement — rien n’a été écrasé.',
          'droit-perdu':
            'Le droit d’édition GitLab a été perdu. Le travail local est conservé et la session reste suspendue.',
          droits:
            'Les droits GitLab nécessaires à la publication ont été retirés. Le travail local est conservé.',
          limite:
            'GitLab a refusé la publication pour une limite de service. Le travail local est conservé.',
          indetermine:
            'Le résultat de la publication est indéterminé. Le travail local et son journal sont conservés.',
          reseau:
            'La publication GitLab a échoué côté réseau. Le travail local est conservé.',
        }
        publiErreur.value = messages[resultat.raison ?? ''] ?? resultat.raison ??
          'La publication n’a pas abouti. Le travail local est conservé.'
      }
      await rafraichirStatutSession()
      return resultat.ok
    } catch {
      publiErreur.value = 'Serveur injoignable — réessayez « Publier maintenant ».'
      await rafraichirStatutSession()
      return false
    }
  }

  const arreterProgression = window.sonal.distant.surProgression((progression) => {
    progressionDistant.value = progression
  })
  const arreterPreparationFermeture = window.sonal.application.surPreparationFermeture(
    async () => {
      if (!deps.entretien.ouvertId.value) return
      if (idDistantCourant.value && statutSession.value.etat === 'degrade') {
        await deps.entretien.annulerEtAttendreSauvegarde()
        return
      }
      if (!idDistantCourant.value || !deps.entretien.verrouAutrui()) {
        await deps.entretien.viderSauvegarde()
      }
    },
  )
  const arreterSessionDegradee = window.sonal.corpus.surSessionDegradee((id) => {
    if (idDistantCourant.value && deps.entretien.ouvertId.value === id) {
      appliquerStatutSession({ etat: 'degrade' })
    }
  })
  const arreterSuiviSession = watch(
    [deps.entretien.ouvertId, idDistantCourant],
    () => void rafraichirStatutSession(),
  )
  const arreterSuspensionSysteme = window.sonal.application.surSuspensionSysteme
    ? window.sonal.application.surSuspensionSysteme(async () => {
      if (!idDistantCourant.value || !deps.entretien.ouvertId.value) return
      try {
        await deps.entretien.viderSauvegarde()
      } catch {
        /* La copie locale déjà journalisée reste la dernière protection. */
      }
    })
    : () => undefined
  const arreterReveilSysteme = window.sonal.application.surReveilSysteme
    ? window.sonal.application.surReveilSysteme(async () => {
      const id = deps.entretien.ouvertId.value
      if (!idDistantCourant.value || !id) return
      deps.effets.rendreEditeurEditable(false)
      try {
        await deps.entretien.viderSauvegarde()
        const statut = await window.sonal.corpus.revaliderSession(id)
        appliquerStatutSession(statut)
        if (statut.etat === 'a-nous') deps.effets.rendreEditeurEditable(true)
      } catch {
        appliquerStatutSession({ etat: 'degrade', raison: 'reseau' })
      }
    })
    : () => undefined
  const arreterEdition = watch(entretienEditable, (editable) => {
    deps.effets.rendreEditeurEditable(editable)
  })
  const minuteurTirage = setInterval(() => {
    if (deps.vue.value === 'corpus' && idDistantCourant.value) void actualiserDistant(true)
  }, 60_000)
  const minuteurSession = setInterval(() => {
    if (deps.vue.value === 'entretien' && idDistantCourant.value) {
      void rafraichirStatutSession()
    }
  }, 5_000)

  onScopeDispose(() => {
    clearInterval(minuteurTirage)
    clearInterval(minuteurSession)
    arreterProgression()
    arreterPreparationFermeture()
    arreterSessionDegradee()
    arreterSuiviSession()
    arreterSuspensionSysteme()
    arreterReveilSysteme()
    arreterEdition()
  })

  return {
    idDistantCourant,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    lectureSeule,
    capacites,
    gesteDisponible,
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
    pseudonymisationLigneEditable,
    metaEditables,
    renommagePossible,
    suppressionPossible,
    reprendreOrphelin,
    abandonnerOrphelin,
    appliquerStatutSession,
    publierMaintenant,
  }
}
