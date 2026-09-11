import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  EntreeVerrouPublic,
  EtatSessionPublic,
  EtatVerrouPublic,
  OrphelinDistant,
  PresencePublic,
  ProgressionTransfert,
} from '../../../shared/distant'
import { appliquerStatutSession as appliquerStatutSessionApplication } from '../../couturesApplication'

type VueApplication = 'accueil' | 'corpus' | 'entretien'

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
  annulerEtAttendreSauvegarde: () => Promise<void>
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
  const badgesVerrous = ref<Record<string, EtatVerrouPublic>>({})
  const presences = ref<PresencePublic[]>([])
  const orphelinsDistants = ref<OrphelinDistant[]>([])
  const statutSession = ref<EtatSessionPublic>({ etat: 'aucune' })
  const publiErreur = ref<string | null>(null)

  const pourcentageProgression = computed(() => {
    const progression = progressionDistant.value
    if (!progression || !progression.total) return null
    return Math.min(100, Math.round((progression.octets / progression.total) * 100))
  })

  const lectureSeule = computed(
    () => idDistantCourant.value !== null && !enLigne.value,
  )

  const entretienEditable = computed(
    () =>
      !lectureSeule.value &&
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
  ): void {
    idDistantCourant.value = id
    enLigne.value = true
    dernierTirage.value = new Date().toISOString()
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
    presences.value = []
    orphelinsDistants.value = []
    statutSession.value = { etat: 'aucune' }
    publiErreur.value = null
    deps.effets.reinitialiserDivergence()
    enLigne.value = true
  }

  function tableLigneEditable(id: string): boolean {
    return !lectureSeule.value && !badgeVerrou(id)
  }

  function metaEditables(id: string): boolean {
    return !lectureSeule.value && !badgeVerrou(id)
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
      if (!silencieux) throw erreur
      enLigne.value = false
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
      annulerSauvegarde: deps.entretien.annulerEtAttendreSauvegarde,
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

  async function publierMaintenant(): Promise<void> {
    const id = deps.entretien.ouvertId.value
    if (!id || !idDistantCourant.value) return
    await deps.entretien.sauver()
    publiErreur.value = null
    try {
      const resultat = await window.sonal.corpus.publierEntretien(id)
      if (!resultat.ok && resultat.raison === 'divergence') {
        publiErreur.value =
          'Le serveur a changé pendant notre session (contournement du verrou). Vos modifications ont été mises de côté localement — rien n’a été écrasé.'
      }
    } catch {
      publiErreur.value = 'Serveur injoignable — réessayez « Publier maintenant ».'
    }
    await rafraichirStatutSession()
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
    arreterEdition()
  })

  return {
    idDistantCourant,
    dernierTirage,
    tirageEnCours,
    progressionDistant,
    pourcentageProgression,
    lectureSeule,
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
  }
}
