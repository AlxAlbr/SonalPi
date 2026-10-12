import { afterEach, expect, test, vi } from 'vitest'
import { CommandesRetraitVarianteAnon } from '../src/main/commandesRetraitVarianteAnon'
import { ContexteGitLab } from '../src/main/gitlab/contexte'
import { ContexteCorpusDistant } from '../src/main/distant/contexte'
import { PORTEEES_OVERTES_GITLAB, type FournisseurCorpus } from '../src/main/gitlab/politiqueGestes'
import { fixtureRetraitVarianteAnon } from './fixtures/retraitVarianteAnon'
import { inventorierRetraitVarianteAnon, type ApercuRetraitVarianteAnon } from '../src/shared/corpus/retraitVarianteAnon'

type Contexte = ContexteGitLab | ContexteCorpusDistant
const portees = [...PORTEEES_OVERTES_GITLAB], portee = 'pseudonymisation-retrait-variante' as const
const ouvrir = () => { if (!PORTEEES_OVERTES_GITLAB.includes(portee)) PORTEEES_OVERTES_GITLAB.push(portee) }
const fermer = () => { const i = PORTEEES_OVERTES_GITLAB.indexOf(portee); if (i >= 0) PORTEEES_OVERTES_GITLAB.splice(i, 1) }
afterEach(() => { vi.restoreAllMocks(); PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees) })
function banc(fournisseurAvant: FournisseurCorpus = 'gitlab') {
  const f = fixtureRetraitVarianteAnon()
  const apercu: ApercuRetraitVarianteAnon = { ...inventorierRetraitVarianteAnon(f.corpus, f.sources, f.demande), lecture: 'gitlab', token: 'prive', applicationDisponible: true }
  const bilan = { ...apercu.bilan, operationId: 'retrait-variante-prive', statut: 'termine' as const, miroirIncomplet: false, differes: [], nouvellesCibles: [] }
  const gitlab = Object.create(ContexteGitLab.prototype) as ContexteGitLab
  const preparer = vi.spyOn(gitlab, 'preparerRetraitVarianteAnon').mockResolvedValue(apercu)
  const reprise = vi.spyOn(gitlab, 'preparerRepriseRetraitVarianteAnon').mockResolvedValue(apercu)
  const appliquer = vi.spyOn(gitlab, 'retirerVarianteAnon').mockResolvedValue(bilan)
  const suivi = vi.spyOn(gitlab, 'lireSuiviRetraitVarianteAnon').mockReturnValue({ ...bilan, demande: f.demande })
  const relire = vi.spyOn(gitlab, 'relireSuiviRetraitVarianteAnon').mockResolvedValue(bilan)
  const oublier = vi.spyOn(gitlab, 'oublierApercuRetraitVarianteAnon').mockImplementation(() => {})
  const local = { preparer: vi.fn(() => ({ ...apercu, lecture: 'local' as const })), appliquer: vi.fn(() => apercu.bilan) }
  let generation = 0, fournisseur = fournisseurAvant, courant: Contexte | null = fournisseur === 'local' ? null
    : fournisseur === 'gitlab' ? gitlab : Object.create(ContexteCorpusDistant.prototype)
  let avantExecution = () => {}, executionDisponible = true
  const options = {
    local: local as never,
    capturer: () => ({ contexte: courant, generation }),
    verifier: (c: { contexte: Contexte | null; generation: number }) => {
      if (c.generation !== generation || c.contexte !== courant) throw new Error('Le corpus a changé pendant la commande.')
    },
    fournisseur: () => fournisseur,
    executer: <T>(operation: (contexte: Contexte) => Promise<T>) => {
      if (!executionDisponible || !courant) return null
      const contexte = courant, depart = generation
      return Promise.resolve().then(async () => { avantExecution(); const valeur = await operation(courant!); return depart === generation && courant === contexte ? { valeur, courant: true as const } : { courant: false as const } })
    },
  }
  const commandes = new CommandesRetraitVarianteAnon(options)
  return { f, apercu, bilan, gitlab, local, preparer, reprise, appliquer, suivi, relire, oublier, commandes,
    changer: () => { generation++ }, autreContexte: () => { courant = Object.create(ContexteGitLab.prototype) },
    avantExecution: (f: () => void) => { avantExecution = f }, sansExecution: () => { executionDisponible = false },
    setFournisseur: (f: FournisseurCorpus) => { fournisseur = f }, options }
}

test('commandes locales inchangées et aucun service distant utilisé', async () => {
  const b = banc('local')
  expect((await b.commandes.preparer(b.f.demande)).lecture).toBe('local')
  expect(b.commandes.appliquer('prive', true)).toEqual(b.apercu.bilan)
  expect(b.local.appliquer).toHaveBeenCalledExactlyOnceWith('prive', true)
  expect(b.preparer).not.toHaveBeenCalled(); expect(b.appliquer).not.toHaveBeenCalled(); expect(b.commandes.lireSuivi()).toBeNull()
})
test('politique GitLab fermée : aucune préparation ou application, aucune solution de repli', async () => {
  const b = banc(); fermer()
  await expect(b.commandes.preparer(b.f.demande)).rejects.toThrow('pas disponible sur un corpus distant')
  await expect(b.commandes.appliquer('prive', true)).rejects.toThrow('pas disponible sur un corpus distant')
  expect(b.oublier).toHaveBeenCalledWith('prive')
  expect(b.preparer).not.toHaveBeenCalled(); expect(b.appliquer).not.toHaveBeenCalled(); expect(b.local.appliquer).not.toHaveBeenCalled()
})
test('WebDAV fermé : refus sans utiliser la copie locale', async () => {
  const b = banc('webdav')
  await expect(b.commandes.preparer(b.f.demande)).rejects.toThrow()
  expect(() => b.commandes.appliquer('prive', true)).toThrow('Aucun repli sur le miroir')
  expect(b.local.preparer).not.toHaveBeenCalled(); expect(b.local.appliquer).not.toHaveBeenCalled()
})
test.each(['preparation', 'reprise'] as const)('%s liée à génération et origine après lecture ; aperçu détruit si périmé', async (phase) => {
  const b = banc(); ouvrir()
  let terminer!: (p: ApercuRetraitVarianteAnon) => void
  ;(phase === 'preparation' ? b.preparer : b.reprise).mockImplementationOnce(() => new Promise((r) => { terminer = r }))
  const travail = phase === 'preparation' ? b.commandes.preparer(b.f.demande) : b.commandes.preparerReprise('lot')
  b.changer(); terminer(b.apercu)
  await expect(travail).rejects.toThrow('corpus a changé')
  expect(b.oublier).toHaveBeenCalledExactlyOnceWith('prive'); expect(b.appliquer).not.toHaveBeenCalled()
})
test('politique retirée pendant la préparation : aperçu détruit, pas d’autorisation héritée', async () => {
  const b = banc(); ouvrir()
  b.preparer.mockImplementationOnce(async () => { fermer(); return b.apercu })
  await expect(b.commandes.preparer(b.f.demande)).rejects.toThrow('pas disponible')
  expect(b.oublier).toHaveBeenCalledExactlyOnceWith('prive')
})
test.each(['generation', 'contexte'] as const)('application %s modifiée avant exécution : tentative détruite, aucun envoi', async (cas) => {
  const b = banc(); ouvrir(); b.avantExecution(cas === 'generation' ? b.changer : b.autreContexte)
  await expect(b.commandes.appliquer('prive', true)).rejects.toThrow('corpus a changé')
  expect(b.oublier).toHaveBeenCalledExactlyOnceWith('prive'); expect(b.appliquer).not.toHaveBeenCalled()
})
test('exécution distante absente : aperçu consommé, pas de fallback', () => {
  const b = banc(); ouvrir(); b.sansExecution()
  expect(() => b.commandes.appliquer('prive', true)).toThrow('indisponible')
  expect(b.oublier).toHaveBeenCalledExactlyOnceWith('prive'); expect(b.local.appliquer).not.toHaveBeenCalled()
})
test('résultat acquis devenu hors contexte refusé sans répéter la commande', async () => {
  const b = banc(); ouvrir(); b.appliquer.mockImplementationOnce(async () => { b.changer(); return b.bilan })
  await expect(b.commandes.appliquer('prive', true)).rejects.toThrow('sans recommencer')
  expect(b.appliquer).toHaveBeenCalledExactlyOnceWith('prive', true); expect(b.local.appliquer).not.toHaveBeenCalled()
})
test('suivi lisible politique fermée, relecture tardive refusée et reprise d’origine exigée', async () => {
  const b = banc(); fermer()
  expect(b.commandes.lireSuivi()?.operationId).toBe(b.bilan.operationId)
  b.relire.mockImplementationOnce(async () => { b.changer(); return b.bilan })
  await expect(b.commandes.relireSuivi(b.bilan.operationId)).rejects.toThrow('corpus a changé')
  const l = banc('local')
  await expect(l.commandes.relireSuivi(b.bilan.operationId)).rejects.toThrow('corpus distant d’origine')
  await expect(l.commandes.preparerReprise(b.bilan.operationId)).rejects.toThrow('corpus distant d’origine')
})
