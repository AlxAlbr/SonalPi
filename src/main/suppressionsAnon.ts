import { randomUUID } from 'node:crypto'
import type { CorpusStore } from './corpusStore'
import { empreinteCorrespondance } from './tablesCorrespondance'
import type { InstantaneOperationTheme } from './operationsThemes'
import { inventorierSuppressionAnon, preparerSuppressionAnon, type ApercuSuppressionAnon, type DemandeSuppressionAnon } from '../shared/corpus/suppressionAnon'

const sources = (s: InstantaneOperationTheme) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, ...(e.ok ? { data: e.avant } : {}) }))
const empreintes = (s: InstantaneOperationTheme) => new Map(s.entretiens.map((e) => [e.id, e.ok ? empreinteCorrespondance(e.avant) : 'indisponible']))
interface Preparation {
  store: CorpusStore; expire: number; demande: DemandeSuppressionAnon; corpus: string
  entretiens: Map<string, string>; apercu: ApercuSuppressionAnon
}

/** Les copies publiques ne donnent aucune autorité sur les décisions à retirer. */
export class SuppressionsAnon {
  private readonly cache = new Map<string, Preparation>()
  constructor(private readonly deps: { store: () => CorpusStore; local: () => boolean; exiger: () => void; maintenant?: () => number }) {}
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  private exigerLocal() {
    this.deps.exiger()
    if (!this.deps.local()) throw new Error('La suppression globale n’est pas qualifiée pour ce fournisseur distant. Aucun repli sur le miroir.')
  }
  preparer(demande: DemandeSuppressionAnon): ApercuSuppressionAnon {
    this.exigerLocal()
    const store = this.deps.store(), s = store.instantaneCorrespondances(true, 64 * 1024 * 1024)
    const inventaire = inventorierSuppressionAnon(s.corpus, sources(s), demande)
    const apercu: ApercuSuppressionAnon = { ...inventaire, token: randomUUID(), lecture: 'local', applicationDisponible: store.suppressionAnonGlobalePossible() }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('L’aperçu de suppression dépasse 8 Mio.')
    for (const [id, p] of this.cache) if (p.store !== store || p.expire <= this.maintenant()) this.cache.delete(id)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(apercu.token, { store, expire: this.maintenant() + 300_000, demande: structuredClone(inventaire.demande),
      corpus: empreinteCorrespondance(s.corpus), entretiens: empreintes(s), apercu: structuredClone(apercu) })
    return structuredClone(apercu)
  }
  appliquer(token: string, confirmee: boolean) {
    const p = this.cache.get(token); this.cache.delete(token)
    if (!p || p.store !== this.deps.store() || p.expire <= this.maintenant()) throw new Error('L’aperçu de suppression a expiré ou le corpus a changé. Recalculez-le.')
    this.exigerLocal()
    if (confirmee !== true) throw new Error('Confirmez explicitement le retrait des décisions liées et de la règle partagée.')
    p.store.exigerSuppressionAnonGlobale()
    if (!p.apercu.applicationDisponible) throw new Error('L’inventaire ne permettait pas l’écriture. Fermez les sessions puis recalculez-le.')
    if (!p.apercu.faisable) throw new Error('Résolvez les obstacles de l’inventaire avant de supprimer.')
    const s = p.store.instantaneCorrespondances(true, 64 * 1024 * 1024), hashes = empreintes(s)
    if (empreinteCorrespondance(s.corpus) !== p.corpus || hashes.size !== p.entretiens.size
      || [...p.entretiens].some(([id, hash]) => hashes.get(id) !== hash)) throw new Error('Le corpus ou un entretien a changé depuis l’inventaire. Recalculez la suppression.')
    const r = preparerSuppressionAnon(s.corpus, sources(s), p.demande)
    const date = new Date(this.maintenant()).toISOString()
    for (const e of r.entretiens) { e.apres.lastModified = date; r.corpusApres.membership[e.id].lastModified = date }
    const plan = { operation: 'remplacement' as const, id: `suppression-anon-${randomUUID()}`, corpusAvant: s.corpus,
      corpusApres: r.corpusApres, entretiens: r.entretiens, ordre: 'entretiens-puis-corpus' as const,
      controleSuppressionAnon: { regleId: p.demande.regleId, nonCibles: s.entretiens.filter((e) => !r.entretiens.some((c) => c.id === e.id)).map((e) => ({ id: e.id, empreinte: hashes.get(e.id)! })) } }
    if (Buffer.byteLength(JSON.stringify({ formatVersion: 4, plan }, null, 2)) > 128 * 1024 * 1024) throw new Error('Le journal de suppression dépasse 128 Mio. Aucune écriture autorisée.')
    p.store.appliquerTransactionFichiers(plan)
    return r.bilan
  }
}
