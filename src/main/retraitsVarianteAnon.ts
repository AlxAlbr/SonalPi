import { randomUUID } from 'node:crypto'
import type { CorpusStore } from './corpusStore'
import { empreinteCorrespondance } from './tablesCorrespondance'
import type { InstantaneOperationTheme } from './operationsThemes'
import { inventorierRetraitVarianteAnon, preparerRetraitVarianteAnon, type ApercuRetraitVarianteAnon, type DemandeRetraitVarianteAnon } from '../shared/corpus/retraitVarianteAnon'

const sources = (s: InstantaneOperationTheme) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, ...(e.ok ? { data: e.avant } : {}) }))
const empreintes = (s: InstantaneOperationTheme) => new Map(s.entretiens.map((e) => [e.id, e.ok ? empreinteCorrespondance(e.avant) : 'indisponible']))
interface Preparation {
  store: CorpusStore; expire: number; demande: DemandeRetraitVarianteAnon; corpus: string
  entretiens: Map<string, string>; apercu: ApercuRetraitVarianteAnon
}

/** Le bilan public ne donne aucun droit sur les choix ni le remplacement journalé. */
export class RetraitsVarianteAnon {
  private readonly cache = new Map<string, Preparation>()
  constructor(private readonly deps: { store: () => CorpusStore; local: () => boolean; exiger: () => void; maintenant?: () => number }) {}
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  private exigerLocal() {
    this.deps.exiger()
    if (!this.deps.local()) throw new Error('Le retrait de variante n’est pas qualifié pour ce fournisseur distant. Aucun repli sur le miroir.')
  }
  preparer(demande: DemandeRetraitVarianteAnon): ApercuRetraitVarianteAnon {
    this.exigerLocal()
    const store = this.deps.store(), s = store.instantaneCorrespondances(true, 64 * 1024 * 1024)
    const inventaire = inventorierRetraitVarianteAnon(s.corpus, sources(s), demande)
    const apercu: ApercuRetraitVarianteAnon = { ...inventaire, token: randomUUID(), lecture: 'local', applicationDisponible: store.retraitVarianteAnonPossible() }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('Le bilan de retrait de variante dépasse 8 Mio.')
    for (const [id, p] of this.cache) if (p.store !== store || p.expire <= this.maintenant()) this.cache.delete(id)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(apercu.token, { store, expire: this.maintenant() + 300_000, demande: structuredClone(inventaire.demande),
      corpus: empreinteCorrespondance(s.corpus), entretiens: empreintes(s), apercu: structuredClone(apercu) })
    return structuredClone(apercu)
  }
  appliquer(token: string, confirmee: boolean) {
    const p = this.cache.get(token); this.cache.delete(token)
    if (!p || p.store !== this.deps.store() || p.expire <= this.maintenant()) throw new Error('Le bilan de retrait de variante a expiré ou le corpus a changé. Recalculez-le.')
    this.exigerLocal()
    if (confirmee !== true) throw new Error('Confirmez explicitement le remplacement des choix liés et le retrait de cette variante.')
    p.store.exigerRetraitVarianteAnon()
    if (!p.apercu.applicationDisponible) throw new Error('Le bilan ne permettait pas l’écriture. Fermez les sessions puis recalculez-le.')
    if (!p.apercu.faisable) throw new Error('Résolvez les obstacles du bilan avant de retirer cette variante.')
    const s = p.store.instantaneCorrespondances(true, 64 * 1024 * 1024), hashes = empreintes(s)
    if (empreinteCorrespondance(s.corpus) !== p.corpus || hashes.size !== p.entretiens.size
      || [...p.entretiens].some(([id, hash]) => hashes.get(id) !== hash)) throw new Error('Le corpus ou un entretien a changé depuis le bilan. Recalculez le retrait de variante.')
    const r = preparerRetraitVarianteAnon(s.corpus, sources(s), p.demande)
    const date = new Date(this.maintenant()).toISOString()
    for (const e of r.entretiens) { e.apres.lastModified = date; r.corpusApres.membership[e.id].lastModified = date }
    const plan = { operation: 'remplacement' as const, id: `retrait-variante-${randomUUID()}`, corpusAvant: s.corpus,
      corpusApres: r.corpusApres, entretiens: r.entretiens, ordre: 'entretiens-puis-corpus' as const,
      controleRetraitVariante: { demande: p.demande, nonCibles: s.entretiens.filter((e) => !r.entretiens.some((c) => c.id === e.id)).map((e) => ({ id: e.id, empreinte: hashes.get(e.id)! })) } }
    if (Buffer.byteLength(JSON.stringify({ formatVersion: 5, plan }, null, 2)) > 128 * 1024 * 1024) throw new Error('Le journal de retrait de variante dépasse 128 Mio. Aucune écriture autorisée.')
    p.store.appliquerTransactionFichiers(plan)
    return r.bilan
  }
}
