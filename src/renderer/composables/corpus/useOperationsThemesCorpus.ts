import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { CorpusFichier } from '../../../shared/format'
import {
  sourcesOperationTheme,
  type ApercuOperationTheme,
  type DemandeOperationTheme,
  type DetailsOperationTheme,
  type ProgressionOperationTheme,
  type ReferenceCodage,
  type ResultatOperationTheme,
  type SuiviOperationTheme,
} from '../../../shared/corpus/themes'
import { lancerOperationGlobale, operationGlobaleEnCours } from '../../operationGlobaleCorpus'

export type ApiOperationsThemes = Pick<Window['sonal']['corpus'],
  'analyserOperationTheme' | 'detailsOperationTheme' | 'executerOperationTheme' | 'surProgressionOperationTheme'>
  & Partial<Pick<Window['sonal']['corpus'], 'lireSuiviOperationTheme' | 'preparerRepriseOperationTheme'
    | 'reconcilierOperationTheme' | 'abandonnerOperationTheme'>>

function copie<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T
}

export function cleCodageTheme(codage: ReferenceCodage): string {
  return JSON.stringify([codage.entretienId, codage.annotationId])
}

/** Prépare des choix locaux, puis exécute uniquement la demande liée à l'aperçu confirmé. */
export function useOperationsThemesCorpus(deps: {
  api?: ApiOperationsThemes
  disponible: (demande: DemandeOperationTheme) => boolean
  majCodebook: (codebook: CorpusFichier['codebook']) => void
  rafraichirUsages: () => Promise<void>
}) {
  const api = deps.api ?? window.sonal.corpus
  const demande = ref<DemandeOperationTheme | null>(null)
  const apercu = ref<ApercuOperationTheme | null>(null)
  const details = ref(new Map<string, DetailsOperationTheme>())
  const demandeConfirmee = shallowRef<DemandeOperationTheme | null>(null)
  const etape = ref<'choix' | 'repartition' | 'apercu' | 'bilan'>('choix')
  const analyseEnCours = ref(false)
  const executionEnCours = ref(false)
  const detailsEnCours = ref(new Set<string>())
  const perime = ref(false)
  const erreur = ref<string | null>(null)
  const resultat = ref<ResultatOperationTheme | null>(null)
  const progression = ref<ProgressionOperationTheme | null>(null)
  const suivi = ref<SuiviOperationTheme | null>(null)
  const chargementSuivi = ref(false)
  const erreurSuivi = ref<string | null>(null)
  let lectureSuivi = 0
  let generation = 0

  const occupe = computed(() => analyseEnCours.value || executionEnCours.value || operationGlobaleEnCours.value)
  const choixParCodage = computed(() => new Map(demande.value?.type === 'division'
    ? demande.value.choix.map((c) => [cleCodageTheme(c.codage), c.destination]) : []))
  const nonRepartis = computed(() => Math.max(0, (apercu.value?.totaux.passages ?? 0) - choixParCodage.value.size))
  const peutExecuter = computed(() => !!demande.value && !!apercu.value && !!demandeConfirmee.value
    && apercu.value.faisable && !perime.value && !occupe.value && etape.value === 'apercu'
    && !suivi.value?.indeterminee && !chargementSuivi.value && !erreurSuivi.value
    && deps.disponible(demande.value))

  function reinitialiser(): void {
    generation++
    demande.value = null
    apercu.value = null
    demandeConfirmee.value = null
    details.value = new Map()
    detailsEnCours.value = new Set()
    resultat.value = null
    erreur.value = null
    progression.value = null
    perime.value = false
    analyseEnCours.value = false
    executionEnCours.value = false
    etape.value = 'choix'
  }

  function changerCorpus(): void {
    reinitialiser()
    lectureSuivi++
    suivi.value = null
    erreurSuivi.value = null
    chargementSuivi.value = false
  }

  async function chargerSuivi(): Promise<void> {
    if (!api.lireSuiviOperationTheme) return
    const capture = generation
    const lecture = ++lectureSuivi
    chargementSuivi.value = true
    try {
      const retour = await api.lireSuiviOperationTheme()
      if (capture !== generation || lecture !== lectureSuivi) return
      suivi.value = retour
      erreurSuivi.value = null
    } catch (e) {
      if (capture === generation && lecture === lectureSuivi) erreurSuivi.value = `Le suivi du lot ne peut pas être vérifié : ${message(e)}`
    } finally {
      if (lecture === lectureSuivi) chargementSuivi.value = false
    }
  }

  async function preparerReprise(): Promise<boolean> {
    const lot = suivi.value
    if (!lot || lot.indeterminee || occupe.value || !api.preparerRepriseOperationTheme || !deps.disponible(lot.demande)) return false
    reinitialiser()
    const capture = generation
    analyseEnCours.value = true
    try {
      const retour = await api.preparerRepriseOperationTheme(lot.operationId)
      if (capture !== generation) return false
      if (JSON.stringify(retour.apercu.sources) !== JSON.stringify(sourcesOperationTheme(lot.demande))
        || JSON.stringify(sourcesOperationTheme(retour.demande)) !== JSON.stringify(sourcesOperationTheme(lot.demande))
        || retour.demande.type !== lot.demande.type || !deps.disponible(retour.demande)) throw new Error('La reprise ne correspond pas au lot courant.')
      demande.value = copie(retour.demande)
      apercu.value = retour.apercu
      demandeConfirmee.value = copie(retour.demande)
      etape.value = retour.demande.type === 'division' ? 'repartition' : 'apercu'
      erreurSuivi.value = null
      return true
    } catch (e) {
      if (capture === generation) erreurSuivi.value = message(e)
      return false
    } finally { if (capture === generation) analyseEnCours.value = false }
  }

  async function enregistrerResultat(retour: ResultatOperationTheme, capture: number): Promise<void> {
    if (capture !== generation) return
    resultat.value = retour
    etape.value = 'bilan'
    demandeConfirmee.value = null
    if (retour.statut === 'appliquee' || retour.statut === 'partielle') {
      try {
        deps.majCodebook(retour.corpus.codebook)
        await deps.rafraichirUsages()
      } catch (e) {
        if (capture === generation) erreur.value = `Le résultat est enregistré, mais l’actualisation des usages a échoué : ${message(e)}`
      }
    }
    if (capture === generation) await chargerSuivi()
  }

  const peutVerifier = computed(() => !!api.reconcilierOperationTheme && (!!suivi.value?.indeterminee
    || (resultat.value?.statut === 'indeterminee' && apercu.value?.execution === 'entretiens-sequentiels')))

  async function reconcilier(): Promise<void> {
    const inconnu = resultat.value?.statut === 'indeterminee' ? resultat.value : null
    const lot = suivi.value ?? (peutVerifier.value && inconnu && demande.value ? {
      operationId: inconnu.operationId, demande: demande.value, indeterminee: true,
      bilan: inconnu.bilan ?? { reussis: [], echecs: [], ciblesCreees: [], sourceConservee: null, finalisation: 'indeterminee' as const },
    } : null)
    if (!lot || !peutVerifier.value || occupe.value || !api.reconcilierOperationTheme || !deps.disponible(lot.demande)) return
    const capture = generation
    demande.value = copie(lot.demande)
    executionEnCours.value = true
    erreur.value = null
    try {
      await lancerOperationGlobale(async () => {
        let retour: ResultatOperationTheme
        try { retour = await api.reconcilierOperationTheme!(lot.operationId) } catch (e) {
          retour = { statut: 'indeterminee', operationId: lot.operationId, motif: message(e), bilan: copie(lot.bilan) }
        }
        await enregistrerResultat(retour, capture)
      }, { confirmation: 'deja-confirmee', message: 'Vérification de la publication…' })
    } finally { if (capture === generation) executionEnCours.value = false }
  }

  async function abandonnerSuivi(): Promise<boolean> {
    const lot = suivi.value
    if (!lot || lot.indeterminee || occupe.value || !api.abandonnerOperationTheme || !deps.disponible(lot.demande)) return false
    const capture = generation
    executionEnCours.value = true
    try {
      await lancerOperationGlobale(async () => { await api.abandonnerOperationTheme!(lot.operationId) },
        { confirmation: 'deja-confirmee', message: 'Clôture du suivi…' })
      if (capture !== generation) return false
      suivi.value = null
      erreurSuivi.value = null
      reinitialiser()
      return true
    } catch (e) {
      if (capture === generation) erreurSuivi.value = message(e)
      return false
    } finally { if (capture === generation) executionEnCours.value = false }
  }

  function invalider(): void {
    if (!demande.value || executionEnCours.value || etape.value === 'bilan') return
    generation++
    perime.value = true
    analyseEnCours.value = false
    detailsEnCours.value = new Set()
    demandeConfirmee.value = null
  }

  async function analyser(): Promise<boolean> {
    if (!demande.value || occupe.value || !deps.disponible(demande.value)) return false
    const capture = generation
    const requete = copie(demande.value)
    const precedent = apercu.value?.operationId
    analyseEnCours.value = true
    erreur.value = null
    demandeConfirmee.value = null
    try {
      const frais = await api.analyserOperationTheme(requete, precedent)
      if (capture !== generation) return false
      if (JSON.stringify(frais.sources) !== JSON.stringify(sourcesOperationTheme(requete))) {
        throw new Error('L’aperçu ne correspond pas aux thématiques demandées.')
      }
      apercu.value = frais
      details.value = new Map()
      perime.value = false
      demandeConfirmee.value = requete
      return true
    } catch (e) {
      if (capture === generation) {
        erreur.value = message(e)
        perime.value = true
      }
      return false
    } finally {
      if (capture === generation) analyseEnCours.value = false
    }
  }

  async function commencer(requete: DemandeOperationTheme): Promise<boolean> {
    if (occupe.value || suivi.value || chargementSuivi.value || erreurSuivi.value
      || resultat.value?.statut === 'indeterminee' || !deps.disponible(requete)) return false
    reinitialiser()
    demande.value = copie(requete)
    const capture = generation
    if (!(await analyser()) || capture !== generation) return false
    etape.value = requete.type === 'division' ? 'repartition' : 'apercu'
    return true
  }

  async function chargerDetails(entretienId: string): Promise<void> {
    const operationId = apercu.value?.operationId
    if (!operationId || perime.value || details.value.has(entretienId) || detailsEnCours.value.has(entretienId)) return
    const capture = generation
    detailsEnCours.value.add(entretienId)
    try {
      const retour = await api.detailsOperationTheme(operationId, entretienId)
      if (capture !== generation || apercu.value?.operationId !== operationId) return
      if (retour.operationId !== operationId || retour.entretienId !== entretienId) {
        throw new Error('Les détails ne correspondent pas à cet aperçu.')
      }
      details.value.set(entretienId, retour)
    } catch (e) {
      if (capture === generation && apercu.value?.operationId === operationId) {
        erreur.value = message(e)
        invalider()
      }
    } finally {
      if (capture === generation && apercu.value?.operationId === operationId) detailsEnCours.value.delete(entretienId)
    }
  }

  function attribuer(codage: ReferenceCodage, destination: string | null): void {
    const d = demande.value
    if (occupe.value || perime.value || etape.value !== 'repartition' || d?.type !== 'division') return
    if (destination !== null && !d.cibles.some((c) => (typeof c === 'string' ? c : c.token) === destination)) return
    if (!details.value.get(codage.entretienId)?.codages.some((c) => cleCodageTheme(c.codage) === cleCodageTheme(codage))) return
    d.choix = d.choix.filter((c) => cleCodageTheme(c.codage) !== cleCodageTheme(codage))
    if (destination !== null) d.choix.push({ codage: { ...codage }, destination })
    demandeConfirmee.value = null
  }

  function toutAttribuer(entretienId: string, destination: string): void {
    for (const c of details.value.get(entretienId)?.codages ?? []) attribuer(c.codage, destination)
  }

  async function confirmerRepartition(): Promise<void> {
    if (demande.value?.type !== 'division' || (demande.value.effacerSource && nonRepartis.value > 0)) return
    const capture = generation
    if (await analyser() && capture === generation) etape.value = 'apercu'
  }

  function revenirRepartition(): void {
    if (occupe.value || demande.value?.type !== 'division') return
    etape.value = 'repartition'
  }

  /** Une analyse neuve redemande les choix ; aucun codage déplacé n'est réparti automatiquement. */
  async function repartirEtatActuel(): Promise<void> {
    if (occupe.value || !demande.value || resultat.value?.statut === 'indeterminee') return
    if (suivi.value) { await preparerReprise(); return }
    const requete = copie(demande.value)
    if (requete.type === 'division') requete.choix = []
    await commencer(requete)
  }

  async function executer(entretiens: 'tous-prevus' | 'observes-libres' = 'tous-prevus'): Promise<void> {
    if (!peutExecuter.value || !demandeConfirmee.value || !apercu.value) return
    const capture = generation
    const operationId = apercu.value.operationId
    const requete = copie(demandeConfirmee.value)
    executionEnCours.value = true
    erreur.value = null
    try {
      await lancerOperationGlobale(async () => {
        let retour: ResultatOperationTheme
        try {
          retour = await api.executerOperationTheme(operationId, requete, { entretiens })
        } catch (e) {
          retour = { statut: 'indeterminee', operationId, motif: `La réponse de l’opération est inconnue : ${message(e)}. Vérifiez son état avant de recommencer.` }
        }
        await enregistrerResultat(retour, capture)
      }, { confirmation: 'deja-confirmee', message: 'Modification des thématiques…' })
    } finally {
      if (capture === generation) executionEnCours.value = false
    }
  }

  const arreterProgression = api.surProgressionOperationTheme((etat) => {
    if (executionEnCours.value && etat.operationId === apercu.value?.operationId) progression.value = etat
  })
  onScopeDispose(() => { arreterProgression(); reinitialiser() })

  return {
    demande, apercu, details, etape, analyseEnCours, executionEnCours, detailsEnCours,
    perime, erreur, resultat, progression, occupe, choixParCodage, nonRepartis, peutExecuter,
    reinitialiser, invalider, commencer, analyser, chargerDetails, attribuer, toutAttribuer,
    confirmerRepartition, revenirRepartition, repartirEtatActuel, executer,
    suivi, erreurSuivi, chargementSuivi, peutVerifier, chargerSuivi, changerCorpus, preparerReprise, reconcilier, abandonnerSuivi,
  }
}

function message(e: unknown): string { return e instanceof Error ? e.message : String(e) }
