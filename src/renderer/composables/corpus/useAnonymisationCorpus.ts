import { ref } from 'vue'
import type { ParamsAnon, RegleAnon } from '../../../shared/format'
import { paramsAnonDefaut } from '../../../shared/format'
import type { ScanRegle } from '../../../shared/corpus/scanAnon'

/** Gère les règles et le scan d'anonymisation propres au corpus. */
export function useAnonymisationCorpus() {
  const reglesAnon = ref<RegleAnon[]>([])
  const scanAnon = ref<ScanRegle[]>([])
  const scanAnonCharge = ref(false)
  const scanAnonPerime = ref(true)
  const scanAnonEnCours = ref(false)
  const scanAnonErreur = ref<string | null>(null)
  const dernierScanAnon = ref<string | null>(null)
  const paramsAnon = ref<ParamsAnon>(paramsAnonDefaut())
  let chargementScanAnon: Promise<boolean> | null = null
  let generation = 0
  let revision = 0

  function perimerScanAnon() {
    revision++
    scanAnonPerime.value = true
  }

  async function rafraichirReglesAnon(perimer = true) {
    const contexte = generation
    const regles = await window.sonal.corpus.reglesAnon()
    if (contexte !== generation) return
    reglesAnon.value = regles
    scanAnon.value = scanAnon.value.map((s) => ({ ...s, regle: regles.find((r) => r.id === s.regle.id) ?? s.regle }))
    if (perimer) perimerScanAnon()
  }

  function reinitialiserScanAnon() {
    generation++
    revision++
    chargementScanAnon = null
    scanAnonEnCours.value = false
    reglesAnon.value = []
    scanAnon.value = []
    scanAnonCharge.value = false
    scanAnonPerime.value = true
    scanAnonErreur.value = null
    dernierScanAnon.value = null
  }

  /** Relit les règles et les entretiens sans lancer deux scans concurrents. */
  async function rafraichirScanAnon(force = true): Promise<boolean> {
    if (!force && scanAnonCharge.value && !scanAnonPerime.value) return true
    if (chargementScanAnon) return chargementScanAnon
    const contexte = generation
    const version = revision
    scanAnonEnCours.value = true
    chargementScanAnon = (async () => {
      try {
        const [regles, scan] = await Promise.all([
          window.sonal.corpus.reglesAnon().then((regles) => {
            if (contexte === generation) reglesAnon.value = regles
            return regles
          }),
          window.sonal.corpus.scanAnon(),
        ])
        if (contexte !== generation) return false
        reglesAnon.value = regles
        scanAnon.value = scan
        scanAnonCharge.value = true
        scanAnonPerime.value = version !== revision
        scanAnonErreur.value = null
        dernierScanAnon.value = new Date().toISOString()
        return true
      } catch (erreur) {
        if (contexte !== generation) return false
        scanAnonPerime.value = true
        scanAnonErreur.value = erreur instanceof Error ? erreur.message : 'Le scan a échoué.'
        return false
      } finally {
        if (contexte === generation) {
          scanAnonEnCours.value = false
          chargementScanAnon = null
        }
      }
    })()
    return chargementScanAnon
  }

  async function majParamsAnon(params: ParamsAnon) {
    paramsAnon.value = await window.sonal.corpus.paramsAnonEcrire(params)
  }

  return {
    reglesAnon,
    scanAnon,
    scanAnonCharge,
    scanAnonPerime,
    scanAnonEnCours,
    scanAnonErreur,
    dernierScanAnon,
    paramsAnon,
    rafraichirScanAnon,
    rafraichirReglesAnon,
    perimerScanAnon,
    reinitialiserScanAnon,
    reinitialiser: reinitialiserScanAnon,
    majParamsAnon,
  }
}
