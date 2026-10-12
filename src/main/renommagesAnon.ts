import { randomUUID } from 'node:crypto'
import type { CorpusStore } from './corpusStore'
import type { CorpusFichier, EntretienFichier } from '../shared/format'
import type { InstantaneOperationTheme } from './operationsThemes'
import { empreinteCorrespondance } from './tablesCorrespondance'
import { inventorierRenommageAnon, preparerRenommageAnon, type ApercuRenommageAnon, type DemandeRenommageAnon } from '../shared/corpus/renommageAnon'

export interface PreparationRenommageDistant {
  store: CorpusStore; demande: DemandeRenommageAnon; empreinteCorpus: string
  corpusAvant: CorpusFichier
  cibles: Array<{ id: string; avant: EntretienFichier; apres: EntretienFichier; incluses: number; annotations: number }>
  reprise?: string
}
export type PreparationRenommageGitLab = PreparationRenommageDistant
interface Preparation {
  store: CorpusStore; expire: number; demande: DemandeRenommageAnon; corpus: string
  entretiens: Map<string, string>; apercu: ApercuRenommageAnon; origine?: object
  distant?: Omit<PreparationRenommageDistant, 'store' | 'demande'>
}
const sources = (s: InstantaneOperationTheme) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, ...(e.ok ? { data: e.avant } : {}) }))
const empreintes = (s: InstantaneOperationTheme) => new Map(s.entretiens.map((e) => [e.id, e.ok ? empreinteCorrespondance(e.avant) : 'indisponible']))

/** Les aperçus privés lient un choix aux fichiers inventoriés, sans autorité reçue du renderer. */
export class RenommagesAnon {
  private readonly cache = new Map<string, Preparation>()
  constructor(private readonly deps: { store: () => CorpusStore; local?: () => boolean; maintenant?: () => number }) {}
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  preparer(demande: DemandeRenommageAnon): ApercuRenommageAnon {
    if (this.deps.local?.() === false) throw new Error('Le renommage global n’est pas encore qualifié pour ce fournisseur distant.')
    const store = this.deps.store()
    const instantane = store.instantaneCorrespondances(true, 64 * 1024 * 1024)
    return this.memoriser(store, instantane, demande, 'local', store.renommageAnonGlobalPossible())
  }
  preparerGitLab(demande: DemandeRenommageAnon, instantane: InstantaneOperationTheme, disponible: boolean, origine: object,
    reprise?: { operationId: string; corpusPublie: CorpusFichier }): ApercuRenommageAnon {
    return this.memoriser(this.deps.store(), instantane, demande, 'gitlab', disponible, origine, reprise)
  }
  preparerWebDAV(demande: DemandeRenommageAnon, instantane: InstantaneOperationTheme, disponible: boolean, origine: object,
    reprise?: { operationId: string; corpusPublie: CorpusFichier }): ApercuRenommageAnon {
    return this.memoriser(this.deps.store(), instantane, demande, 'webdav', disponible, origine, reprise)
  }
  private memoriser(store: CorpusStore, instantane: InstantaneOperationTheme, demande: DemandeRenommageAnon, lecture: ApercuRenommageAnon['lecture'], disponible: boolean, origine?: object,
    reprise?: { operationId: string; corpusPublie: CorpusFichier }): ApercuRenommageAnon {
    const octets = Buffer.byteLength(JSON.stringify(instantane.corpus)) + instantane.entretiens.reduce((n, e) => n + (e.ok ? Buffer.byteLength(JSON.stringify(e.avant)) : 0), 0)
    if (octets > 64 * 1024 * 1024) throw new Error('L’inventaire du renommage dépasse 64 Mio. Aucune préparation autorisée.')
    const supplement = reprise ? [demande.nouveauPseudo] : []
    const inventaire = inventorierRenommageAnon(instantane.corpus, sources(instantane), demande, supplement)
    const token = randomUUID()
    const apercu: ApercuRenommageAnon = { ...inventaire, token, lecture, applicationDisponible: disponible, ...(reprise ? { reprise: reprise.operationId } : {}) }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('L’aperçu du renommage dépasse 8 Mio. Aucune préparation autorisée.')
    for (const [id, p] of this.cache) if (p.store !== store || p.expire <= this.maintenant()) this.cache.delete(id)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    const plan = lecture !== 'local' && inventaire.faisable
      ? preparerRenommageAnon(instantane.corpus, sources(instantane), demande, supplement) : null
    const distant = plan ? {
      empreinteCorpus: empreinteCorrespondance(reprise?.corpusPublie ?? instantane.corpus),
      corpusAvant: structuredClone(instantane.corpus),
      cibles: plan.entretiens.map((e) => ({ ...e, incluses: plan.inventaire.entretiens.find((i) => i.id === e.id)!.inclusesRenommees,
        annotations: plan.inventaire.entretiens.find((i) => i.id === e.id)!.renommages })),
      ...(reprise ? { reprise: reprise.operationId } : {}),
    } : undefined
    this.cache.set(token, { store, expire: this.maintenant() + 300_000, demande: structuredClone(inventaire.demande),
      corpus: empreinteCorrespondance(instantane.corpus), entretiens: empreintes(instantane), apercu: structuredClone(apercu), origine, distant })
    return structuredClone(apercu)
  }
  private consommer(token: string, confirmee: boolean, lecture: ApercuRenommageAnon['lecture']): Preparation {
    const p = this.cache.get(token)
    this.cache.delete(token)
    if (!p || p.expire <= this.maintenant() || p.store !== this.deps.store()) throw new Error('L’aperçu de renommage a expiré ou le corpus a changé. Recalculez-le.')
    if (p.apercu.lecture !== lecture) throw new Error('L’aperçu ne provient pas du fournisseur de ce renommage. Recalculez-le.')
    if (confirmee !== true) throw new Error('Confirmez explicitement le renommage de cette variante et de ses seuls usages liés.')
    if (lecture === 'local') {
      if (this.deps.local?.() === false) throw new Error('Le renommage global n’est pas encore qualifié pour ce fournisseur distant.')
      p.store.exigerRenommageAnonGlobal()
    }
    if (!p.apercu.applicationDisponible) throw new Error('L’inventaire ne permettait pas l’écriture. Fermez les sessions puis recalculez-le.')
    if (!p.apercu.faisable) throw new Error('Résolvez les obstacles de l’inventaire avant de renommer.')
    return p
  }
  consommerGitLab(token: string, confirmee: boolean, origine: object): PreparationRenommageGitLab {
    const p = this.consommer(token, confirmee, 'gitlab')
    if (p.origine !== origine) throw new Error('Le contexte GitLab a changé. Recalculez le renommage.')
    if (!p.distant) throw new Error('Préparation ciblée absente. Recalculez le renommage.')
    return { store: p.store, demande: structuredClone(p.demande), ...structuredClone(p.distant) }
  }
  consommerWebDAV(token: string, confirmee: boolean, origine: object): PreparationRenommageDistant {
    const p = this.consommer(token, confirmee, 'webdav')
    if (p.origine !== origine) throw new Error('Le contexte WebDAV a changé. Recalculez le renommage.')
    if (!p.distant) throw new Error('Préparation ciblée absente. Recalculez le renommage.')
    return { store: p.store, demande: structuredClone(p.demande), ...structuredClone(p.distant) }
  }
  appliquer(token: string, confirmee: boolean) {
    const p = this.consommer(token, confirmee, 'local')
    const actuel = p.store.instantaneCorrespondances(true, 64 * 1024 * 1024)
    const fichiers = empreintes(actuel)
    if (empreinteCorrespondance(actuel.corpus) !== p.corpus || fichiers.size !== p.entretiens.size
      || [...p.entretiens].some(([id, hash]) => fichiers.get(id) !== hash)) throw new Error('Le corpus ou un entretien a changé depuis l’inventaire. Recalculez le renommage.')
    const resultat = preparerRenommageAnon(actuel.corpus, sources(actuel), p.demande)
    if (!resultat.bilan.definitionModifiee && !resultat.entretiens.length) return resultat.bilan
    const date = new Date(this.maintenant()).toISOString()
    for (const e of resultat.entretiens) {
      e.apres.lastModified = date
      resultat.corpusApres.membership[e.id].lastModified = date
    }
    p.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `renommage-${randomUUID()}`,
      corpusAvant: actuel.corpus, corpusApres: resultat.corpusApres, entretiens: resultat.entretiens, ordre: 'entretiens-puis-corpus' })
    return resultat.bilan
  }
}
