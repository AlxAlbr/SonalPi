// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useOperationsThemesCorpus, type ApiOperationsThemes } from '../src/renderer/composables/corpus/useOperationsThemesCorpus'
import { installerOperationGlobaleCorpus, operationGlobaleEnCours, reinitialiserOperationGlobale } from '../src/renderer/operationGlobaleCorpus'
import type {
  ApercuOperationTheme, DemandeOperationTheme, DetailsOperationTheme, ProgressionOperationTheme, ResultatOperationTheme, SuiviOperationTheme,
} from '../src/shared/corpus/themes'
import { FORMAT_VERSION, type CorpusFichier } from '../src/shared/format'

const scopes: EffectScope[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  reinitialiserOperationGlobale()
  vi.restoreAllMocks()
})
const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 's', cible: { type: 'existante', id: 'c' } }
function division(effacerSource = false): DemandeOperationTheme {
  return {
    type: 'division', source: 's', cibles: ['c1', 'c2'], choix: [], effacerSource,
  }
}
function corpus(): CorpusFichier {
  return { formatVersion: FORMAT_VERSION, codebook: {}, membership: {}, variables: {}, reglesAnon: {}, personnes: {} }
}
function banc() {
  let n = 0
  let recevoir: (etat: ProgressionOperationTheme) => void = () => {}
  const arreter = vi.fn()
  const api: ApiOperationsThemes = {
    analyserOperationTheme: vi.fn(async (demande): Promise<ApercuOperationTheme> => {
      // Copier la demande reçue échouerait si elle contenait encore des proxies Vue.
      const d = structuredClone(demande)
      const choisis = d.type === 'division' ? d.choix.length : 2
      return {
        operationId: `op-${++n}`, sources: d.type === 'fusion' ? d.sources : [d.source],
        parEntretien: ['e1', 'e2'].map((id) => ({ id, titre: id, passages: 1, orphelins: id === 'e2' ? 1 : 0,
          aModifier: d.type !== 'division' || d.choix.some((c) => c.codage.entretienId === id) })),
        totaux: { entretiens: 2, passages: 2, orphelins: 1, doublonsPrevisibles: 0 },
        faisable: d.type !== 'division' || !d.effacerSource || choisis === 2,
        obstacles: [],
      }
    }),
    detailsOperationTheme: vi.fn(async (operationId, entretienId): Promise<DetailsOperationTheme> => ({
      operationId, entretienId,
      codages: [{ annotationId: 'a', from: 1, to: entretienId === 'e2' ? 1 : 5, orphelin: entretienId === 'e2',
        codage: { entretienId, annotationId: 'a' }, avant: '', extrait: entretienId === 'e2' ? '' : 'texte', apres: '' }],
    })),
    executerOperationTheme: vi.fn(async (): Promise<ResultatOperationTheme> => ({ statut: 'appliquee', corpus: corpus(), entretiens: 2, reaffectes: 2, doublonsSupprimes: 0 })),
    surProgressionOperationTheme: vi.fn((cb) => { recevoir = cb; return arreter }),
  }
  let autorise = true
  const majCodebook = vi.fn()
  const rafraichirUsages = vi.fn(async () => {})
  const scope = effectScope()
  scopes.push(scope)
  const ops = scope.run(() => useOperationsThemesCorpus({ api, disponible: () => autorise, majCodebook, rafraichirUsages }))!
  return { ops, api, majCodebook, rafraichirUsages, recevoir: (etat: ProgressionOperationTheme) => recevoir(etat), arreter, scope, interdire: () => { autorise = false } }
}

function suiviDistant(demande = transfert, indeterminee = false): SuiviOperationTheme {
  return { operationId: 'lot-1', demande: structuredClone(demande), indeterminee,
    bilan: { reussis: [{ id: 'e1', reaffectes: 1, doublonsSupprimes: 0 }], echecs: [{ id: 'e2', motif: 'tenu' }],
      ciblesCreees: [], sourceConservee: true, finalisation: 'non-demandee' } }
}
function avecDistant(b: ReturnType<typeof banc>) {
  let suivi: SuiviOperationTheme | null = null
  const analyser = b.api.analyserOperationTheme
  b.api.analyserOperationTheme = vi.fn(async (d, precedent) => ({ ...await analyser(d, precedent), execution: 'entretiens-sequentiels' as const }))
  b.api.lireSuiviOperationTheme = vi.fn(async () => structuredClone(suivi))
  b.api.preparerRepriseOperationTheme = vi.fn(async () => {
    const demande = structuredClone(suivi!.demande)
    if (demande.type === 'division') demande.choix = []
    return { demande, apercu: await b.api.analyserOperationTheme(demande) }
  })
  b.api.reconcilierOperationTheme = vi.fn(async () => {
    suivi!.indeterminee = false
    return { statut: 'partielle' as const, operationId: suivi!.operationId, corpus: corpus(), bilan: suivi!.bilan }
  })
  b.api.abandonnerOperationTheme = vi.fn(async () => { suivi = null })
  return { enregistrer: (valeur: SuiviOperationTheme | null) => { suivi = valeur } }
}

describe('atelier des thèmes du renderer', () => {
  test('analyse et détails sans écrire, identités de codage distinctes par entretien', async () => {
    const b = banc()
    await b.ops.commencer(division())
    expect(b.ops.etape.value).toBe('repartition')
    await b.ops.chargerDetails('e1')
    await b.ops.chargerDetails('e2')
    b.ops.attribuer({ entretienId: 'e1', annotationId: 'a' }, 'c1')
    b.ops.attribuer({ entretienId: 'e2', annotationId: 'a' }, 'c2')
    expect(b.ops.choixParCodage.value.size).toBe(2)
    expect(b.ops.nonRepartis.value).toBe(0)
    expect(b.api.executerOperationTheme).not.toHaveBeenCalled()
    expect(b.majCodebook).not.toHaveBeenCalled()
  })

  test('ne répartit que les détails chargés et des destinations connues, sans doublon de choix', async () => {
    const b = banc()
    await b.ops.commencer(division())
    b.ops.attribuer({ entretienId: 'e1', annotationId: 'a' }, 'c1')
    expect(b.ops.nonRepartis.value).toBe(2)
    await b.ops.chargerDetails('e1')
    b.ops.attribuer({ entretienId: 'e1', annotationId: 'a' }, 'inconnue')
    expect(b.ops.nonRepartis.value).toBe(2)
    b.ops.toutAttribuer('e1', 'c1')
    b.ops.toutAttribuer('e1', 'c2')
    expect(b.ops.nonRepartis.value).toBe(1)
    expect(b.ops.demande.value?.type === 'division' && b.ops.demande.value.choix).toEqual([{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'c2' }])
    b.ops.attribuer({ entretienId: 'e1', annotationId: 'a' }, null)
    expect(b.ops.nonRepartis.value).toBe(2)
  })

  test('orphelin non réparti bloque la suppression ; les choix recalculent l’aperçu avant confirmation', async () => {
    const b = banc()
    await b.ops.commencer(division(true))
    await b.ops.chargerDetails('e1')
    b.ops.toutAttribuer('e1', 'c1')
    await b.ops.confirmerRepartition()
    expect(b.api.analyserOperationTheme).toHaveBeenCalledTimes(1)
    expect(b.ops.peutExecuter.value).toBe(false)
    await b.ops.chargerDetails('e2')
    b.ops.toutAttribuer('e2', 'c2')
    await b.ops.confirmerRepartition()
    expect(b.api.analyserOperationTheme).toHaveBeenCalledTimes(2)
    expect(b.api.analyserOperationTheme).toHaveBeenLastCalledWith(expect.objectContaining({ choix: expect.arrayContaining([{ codage: { entretienId: 'e2', annotationId: 'a' }, destination: 'c2' }]) }), 'op-1')
    expect(b.ops.apercu.value?.parEntretien.every((e) => e.aModifier)).toBe(true)
    expect(b.ops.etape.value).toBe('apercu')
    expect(b.ops.peutExecuter.value).toBe(true)
  })

  test('retour de consultation invalide l’aperçu, sans perdre les choix encore validables', async () => {
    const b = banc()
    await b.ops.commencer(division())
    await b.ops.chargerDetails('e1')
    b.ops.toutAttribuer('e1', 'c1')
    b.ops.invalider()
    expect(b.ops.perime.value).toBe(true)
    b.ops.attribuer({ entretienId: 'e1', annotationId: 'a' }, 'c2')
    expect(b.ops.choixParCodage.value.get('["e1","a"]')).toBe('c1')
    await b.ops.analyser()
    expect(b.ops.perime.value).toBe(false)
    expect(b.ops.choixParCodage.value.get('["e1","a"]')).toBe('c1')
  })

  test('une obsolescence ne rejoue pas les choix sur une nouvelle analyse', async () => {
    const b = banc()
    await b.ops.commencer(division())
    await b.ops.chargerDetails('e1')
    b.ops.toutAttribuer('e1', 'c1')
    vi.mocked(b.api.analyserOperationTheme).mockRejectedValueOnce(new Error('Les fichiers ont changé'))
    await b.ops.confirmerRepartition()
    expect(b.ops.perime.value).toBe(true)
    expect(b.ops.peutExecuter.value).toBe(false)
    await b.ops.repartirEtatActuel()
    expect(b.ops.choixParCodage.value.size).toBe(0)
    expect(b.api.analyserOperationTheme).toHaveBeenLastCalledWith(expect.objectContaining({ choix: [] }), undefined)
  })

  test('confirmation unique, anti-double-lancement et progression limitée à l’opération courante', async () => {
    installerOperationGlobaleCorpus({ estCorpusGitLab: () => true, compterEntretiens: () => 2, compterVerrousAutrui: () => 1 })
    const confirmer = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirmer })
    const b = banc()
    await b.ops.commencer(transfert)
    let terminer!: (r: ResultatOperationTheme) => void
    vi.mocked(b.api.executerOperationTheme).mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve }))
    const attente = b.ops.executer()
    expect(operationGlobaleEnCours.value).toBe(true)
    expect(b.ops.occupe.value).toBe(true)
    await b.ops.executer()
    b.recevoir({ operationId: 'autre', phase: 'entretiens', termines: 2, total: 2, reussis: 2, echecs: 0 })
    expect(b.ops.progression.value).toBeNull()
    b.recevoir({ operationId: 'op-1', phase: 'entretiens', termines: 1, total: 2, reussis: 1, echecs: 0 })
    expect(b.ops.progression.value?.termines).toBe(1)
    terminer({ statut: 'appliquee', corpus: corpus(), entretiens: 2, reaffectes: 2, doublonsSupprimes: 0 })
    await attente
    expect(b.api.executerOperationTheme).toHaveBeenCalledExactlyOnceWith('op-1', transfert, { entretiens: 'tous-prevus' })
    expect(confirmer).not.toHaveBeenCalled()
    expect(b.majCodebook).toHaveBeenCalledBefore(b.rafraichirUsages)
    expect(b.ops.etape.value).toBe('bilan')
  })

  test('un résultat partiel rafraîchit aussi le codebook et les usages', async () => {
    const b = banc()
    await b.ops.commencer(transfert)
    vi.mocked(b.api.executerOperationTheme).mockResolvedValueOnce({
      statut: 'partielle', operationId: 'op-1', corpus: corpus(),
      bilan: { reussis: [{ id: 'e1', reaffectes: 1, doublonsSupprimes: 0 }], echecs: [{ id: 'e2', motif: 'tenu' }],
        ciblesCreees: [{ token: 'A', id: 'nouvelle' }], sourceConservee: true, finalisation: 'bloquee' },
    })
    await b.ops.executer()
    expect(b.ops.resultat.value?.statut).toBe('partielle')
    expect(b.majCodebook).toHaveBeenCalledOnce()
    expect(b.rafraichirUsages).toHaveBeenCalledOnce()
  })

  test.each(['non-appliquee', 'indeterminee'] as const)('un résultat %s ne déclenche pas une lecture susceptible de reprendre implicitement l’écriture', async (statut) => {
    const b = banc()
    await b.ops.commencer(transfert)
    vi.mocked(b.api.executerOperationTheme).mockResolvedValueOnce(statut === 'non-appliquee'
      ? { statut, motif: 'Refus' } : { statut, operationId: 'op-1', motif: 'Réponse perdue' })
    await b.ops.executer()
    expect(b.ops.resultat.value?.statut).toBe(statut)
    expect(b.majCodebook).not.toHaveBeenCalled()
    expect(b.rafraichirUsages).not.toHaveBeenCalled()
    await b.ops.executer()
    expect(b.api.executerOperationTheme).toHaveBeenCalledOnce()
    if (statut === 'indeterminee') {
      await b.ops.repartirEtatActuel()
      expect(b.api.analyserOperationTheme).toHaveBeenCalledOnce()
    }
  })

  test('une exception IPC pendant l’écriture est inconnue, jamais relancée automatiquement', async () => {
    const b = banc()
    await b.ops.commencer(transfert)
    vi.mocked(b.api.executerOperationTheme).mockRejectedValueOnce(new Error('réseau coupé'))
    await b.ops.executer()
    expect(b.ops.resultat.value).toMatchObject({ statut: 'indeterminee', operationId: 'op-1' })
    await b.ops.repartirEtatActuel()
    expect(b.api.executerOperationTheme).toHaveBeenCalledOnce()
    expect(b.api.analyserOperationTheme).toHaveBeenCalledOnce()
  })

  test.each(['expire', 'mauvaise-identite'])('des détails %s invalident l’aperçu et permettent une analyse neuve', async (cause) => {
    const b = banc()
    await b.ops.commencer(division())
    if (cause === 'expire') vi.mocked(b.api.detailsOperationTheme).mockRejectedValueOnce(new Error('Aperçu expiré'))
    else vi.mocked(b.api.detailsOperationTheme).mockResolvedValueOnce({ operationId: 'autre', entretienId: 'e1', codages: [] })
    await b.ops.chargerDetails('e1')
    expect(b.ops.perime.value).toBe(true)
    expect(b.ops.details.value.size).toBe(0)
    expect(b.ops.detailsEnCours.value.size).toBe(0)
    expect(b.ops.peutExecuter.value).toBe(false)
    await b.ops.repartirEtatActuel()
    await b.ops.chargerDetails('e1')
    expect(b.ops.perime.value).toBe(false)
    expect(b.ops.details.value.size).toBe(1)
  })

  test('l’exécution utilise la copie confirmée, pas un brouillon modifié ensuite', async () => {
    const b = banc()
    await b.ops.commencer(transfert)
    b.ops.demande.value!.source = 'modification-inattendue'
    await b.ops.executer()
    expect(b.api.executerOperationTheme).toHaveBeenCalledExactlyOnceWith('op-1', transfert, { entretiens: 'tous-prevus' })
  })

  test('un échec d’actualisation garde le résultat appliqué', async () => {
    const b = banc()
    await b.ops.commencer(transfert)
    b.rafraichirUsages.mockRejectedValueOnce(new Error('lecture impossible'))
    await b.ops.executer()
    expect(b.ops.resultat.value?.statut).toBe('appliquee')
    expect(b.ops.erreur.value).toContain('résultat est enregistré')
  })

  test('changement de corpus ignore une réponse tardive d’analyse, de détails ou d’écriture', async () => {
    const b = banc()
    let terminer!: (r: ApercuOperationTheme) => void
    vi.mocked(b.api.analyserOperationTheme).mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve }))
    const ancien = b.ops.commencer(transfert)
    b.ops.reinitialiser()
    terminer({ operationId: 'ancien', sources: ['s'] } as ApercuOperationTheme)
    await ancien
    expect(b.ops.apercu.value).toBeNull()
    await b.ops.commencer(transfert)
    let terminerDetails!: (r: DetailsOperationTheme) => void
    vi.mocked(b.api.detailsOperationTheme).mockImplementationOnce(() => new Promise((resolve) => { terminerDetails = resolve }))
    const lecture = b.ops.chargerDetails('e1')
    b.ops.reinitialiser()
    terminerDetails({ operationId: 'op-1', entretienId: 'e1', codages: [] })
    await lecture
    expect(b.ops.details.value.size).toBe(0)
    await b.ops.commencer(transfert)
    let terminerExecution!: (r: ResultatOperationTheme) => void
    vi.mocked(b.api.executerOperationTheme).mockImplementationOnce(() => new Promise((resolve) => { terminerExecution = resolve }))
    const ecriture = b.ops.executer()
    b.ops.reinitialiser()
    terminerExecution({ statut: 'appliquee', corpus: corpus(), entretiens: 1, reaffectes: 1, doublonsSupprimes: 0 })
    await ecriture
    expect(b.ops.resultat.value).toBeNull()
    expect(b.majCodebook).not.toHaveBeenCalled()
  })

  test('une consultation pendant une analyse ne revalide pas une réponse devenue obsolète', async () => {
    const b = banc()
    let terminer!: (r: ApercuOperationTheme) => void
    vi.mocked(b.api.analyserOperationTheme).mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve }))
    const attente = b.ops.commencer(transfert)
    b.ops.invalider()
    terminer({ operationId: 'ancien', sources: ['s'] } as ApercuOperationTheme)
    await attente
    expect(b.ops.apercu.value).toBeNull()
    expect(b.ops.perime.value).toBe(true)
    expect(b.ops.occupe.value).toBe(false)
  })

  test('un bilan distant survit à la fermeture et réserve une reprise explicite', async () => {
    const b = banc()
    const distant = avecDistant(b)
    await b.ops.commencer(transfert)
    const lot = suiviDistant()
    distant.enregistrer(lot)
    vi.mocked(b.api.executerOperationTheme).mockResolvedValueOnce({ statut: 'partielle', operationId: lot.operationId, corpus: corpus(), bilan: lot.bilan })
    await b.ops.executer()
    b.ops.reinitialiser()
    expect(b.ops.suivi.value).toEqual(lot)
    expect(await b.ops.commencer(transfert)).toBe(false)
    expect(await b.ops.preparerReprise()).toBe(true)
    expect(b.ops.etape.value).toBe('apercu')
    expect(b.api.preparerRepriseOperationTheme).toHaveBeenCalledExactlyOnceWith('lot-1')
    expect(b.api.executerOperationTheme).toHaveBeenCalledOnce()
  })

  test('division après redémarrage : destinations conservées et aucun choix inventé', async () => {
    const b = banc()
    const distant = avecDistant(b)
    const d = division() as Extract<DemandeOperationTheme, { type: 'division' }>
    d.choix = [{ codage: { entretienId: 'ancien', annotationId: 'a' }, destination: 'c1' }]
    distant.enregistrer(suiviDistant(d))
    await b.ops.chargerSuivi()
    expect(await b.ops.preparerReprise()).toBe(true)
    expect(b.ops.etape.value).toBe('repartition')
    expect(b.ops.choixParCodage.value.size).toBe(0)
    expect(b.ops.suivi.value?.bilan.ciblesCreees).toEqual([])
    expect(b.ops.peutExecuter.value).toBe(false)
    await b.ops.chargerDetails('e2')
    b.ops.toutAttribuer('e2', 'c2')
    await b.ops.confirmerRepartition()
    expect(b.ops.peutExecuter.value).toBe(true)
    expect(b.api.executerOperationTheme).not.toHaveBeenCalled()
  })

  test('inconnu : aucune reprise ni clôture, vérification explicite sans rejouer l’exécution', async () => {
    const b = banc()
    const distant = avecDistant(b)
    await b.ops.commencer(transfert)
    distant.enregistrer(suiviDistant(transfert, true))
    vi.mocked(b.api.executerOperationTheme).mockResolvedValueOnce({ statut: 'indeterminee', operationId: 'lot-1', motif: 'réponse perdue' })
    await b.ops.executer()
    expect(b.ops.peutVerifier.value).toBe(true)
    expect(await b.ops.preparerReprise()).toBe(false)
    expect(await b.ops.abandonnerSuivi()).toBe(false)
    expect(b.api.preparerRepriseOperationTheme).not.toHaveBeenCalled()
    expect(b.api.abandonnerOperationTheme).not.toHaveBeenCalled()
    await b.ops.reconcilier()
    expect(b.ops.resultat.value?.statut).toBe('partielle')
    expect(b.ops.suivi.value?.indeterminee).toBe(false)
    expect(b.api.reconcilierOperationTheme).toHaveBeenCalledExactlyOnceWith('lot-1')
    expect(b.api.executerOperationTheme).toHaveBeenCalledOnce()
    expect(b.rafraichirUsages).toHaveBeenCalledOnce()
  })

  test('réponse IPC perdue après un lot terminé : le bilan peut être retrouvé sans journal actif', async () => {
    const b = banc()
    avecDistant(b)
    await b.ops.commencer(transfert)
    vi.mocked(b.api.executerOperationTheme).mockRejectedValueOnce(new Error('IPC perdu'))
    await b.ops.executer()
    expect(b.ops.suivi.value).toBeNull()
    expect(b.ops.peutVerifier.value).toBe(true)
    b.api.reconcilierOperationTheme = vi.fn(async () => ({ statut: 'appliquee', corpus: corpus(), entretiens: 2, reaffectes: 2, doublonsSupprimes: 0 }))
    await b.ops.reconcilier()
    expect(b.ops.resultat.value?.statut).toBe('appliquee')
    expect(b.api.reconcilierOperationTheme).toHaveBeenCalledExactlyOnceWith('op-1')
    expect(b.api.executerOperationTheme).toHaveBeenCalledOnce()
  })

  test('un échec de vérification conserve l’inconnu et ne déclenche aucune actualisation', async () => {
    const b = banc()
    const distant = avecDistant(b)
    distant.enregistrer(suiviDistant(transfert, true))
    await b.ops.chargerSuivi()
    b.api.reconcilierOperationTheme = vi.fn(async () => { throw new Error('serveur absent') })
    await b.ops.reconcilier()
    expect(b.ops.resultat.value?.statut).toBe('indeterminee')
    expect(b.ops.peutVerifier.value).toBe(true)
    expect(b.rafraichirUsages).not.toHaveBeenCalled()
    expect(b.api.executerOperationTheme).not.toHaveBeenCalled()
  })

  test('clôturer un suivi certain ne fait ni rollback ni publication', async () => {
    const b = banc()
    const distant = avecDistant(b)
    distant.enregistrer(suiviDistant())
    await b.ops.chargerSuivi()
    expect(await b.ops.abandonnerSuivi()).toBe(true)
    expect(b.ops.suivi.value).toBeNull()
    expect(b.api.abandonnerOperationTheme).toHaveBeenCalledExactlyOnceWith('lot-1')
    expect(b.api.executerOperationTheme).not.toHaveBeenCalled()
    expect(b.majCodebook).not.toHaveBeenCalled()
  })

  test('le suivi tardif d’un ancien corpus est ignoré', async () => {
    const b = banc()
    avecDistant(b)
    let terminer!: (s: SuiviOperationTheme | null) => void
    b.api.lireSuiviOperationTheme = vi.fn(() => new Promise((resolve) => { terminer = resolve }))
    const attente = b.ops.chargerSuivi()
    b.ops.changerCorpus()
    terminer(suiviDistant())
    await attente
    expect(b.ops.suivi.value).toBeNull()
    expect(b.ops.chargementSuivi.value).toBe(false)
  })

  test('un suivi illisible bloque un nouveau lancement et permet une relecture', async () => {
    const b = banc()
    avecDistant(b)
    b.api.lireSuiviOperationTheme = vi.fn().mockRejectedValueOnce(new Error('journal corrompu')).mockResolvedValueOnce(null)
    await b.ops.chargerSuivi()
    expect(await b.ops.commencer(transfert)).toBe(false)
    expect(b.ops.erreurSuivi.value).toContain('journal corrompu')
    await b.ops.chargerSuivi()
    expect(await b.ops.commencer(transfert)).toBe(true)
  })

  test('le grisage suit les capacités au lancement et l’abonnement est libéré', async () => {
    const b = banc()
    await b.ops.commencer(transfert)
    b.interdire()
    await b.ops.executer()
    expect(b.api.executerOperationTheme).not.toHaveBeenCalled()
    b.scope.stop()
    expect(b.arreter).toHaveBeenCalledOnce()
  })
})
