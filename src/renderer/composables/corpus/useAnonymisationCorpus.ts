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

  function perimerScanAnon() {
    scanAnonPerime.value = true
  }

  async function rafraichirReglesAnon() {
    reglesAnon.value = await window.sonal.corpus.reglesAnon()
    perimerScanAnon()
  }

  function reinitialiserScanAnon() {
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
    scanAnonEnCours.value = true
    chargementScanAnon = (async () => {
      try {
        const [regles, scan] = await Promise.all([
          window.sonal.corpus.reglesAnon(),
          window.sonal.corpus.scanAnon(),
        ])
        reglesAnon.value = regles
        scanAnon.value = scan
        scanAnonCharge.value = true
        scanAnonPerime.value = false
        scanAnonErreur.value = null
        dernierScanAnon.value = new Date().toISOString()
        return true
      } catch (erreur) {
        scanAnonErreur.value = erreur instanceof Error ? erreur.message : 'Le scan a échoué.'
        return false
      } finally {
        scanAnonEnCours.value = false
        chargementScanAnon = null
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
