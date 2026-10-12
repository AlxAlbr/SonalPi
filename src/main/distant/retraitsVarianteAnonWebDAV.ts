import { randomUUID } from 'node:crypto'
import { ErreurHttp, type ClientWebDAV } from '../webdav/client'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { ContenuVerrou, VerrouProvider } from '../verrous/types'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../shared/format'
import { inventorierRetraitVarianteAnon, preparerRetraitVarianteAnon, type ApercuRetraitVarianteAnon, type BilanRetraitVarianteDistant, type DemandeRetraitVarianteAnon, type SuiviRetraitVarianteAnon } from '../../shared/corpus/retraitVarianteAnon'
import { lireBarriereRetraitVarianteAnon } from '../../shared/corpus/barriereRetraitVarianteAnon'
import { verifierBarriereDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { JournalRetraitVarianteAnonWebDAV, barriereRetraitVarianteWebDAV, egauxRetraitVarianteWebDAV as egaux, type LotRetraitVarianteWebDAV, type EnvoiRetraitVarianteWebDAV } from './journalRetraitVarianteAnonWebDAV'
import { etagImportWebDAVFort, idImportWebDAVSain } from './journalCorrespondancesWebDAV'
import { empreinteCorrespondance } from '../tablesCorrespondance'

interface Lecture { contenu: string; etag: string }
type Verrou = { provider: VerrouProvider; chemin: string; echeance?: number; preuve?: ContenuVerrou }
export type EtapeRetraitVarianteWebDAV = 'preparation' | 'application' | 'suivi'
interface Dependances {
  client: ClientWebDAV; dirLocal: string; utilisateur: () => string; sessionsLocales: () => string[]
  verrouCorpus: () => Verrou; verrouEntretien: (id: string) => Verrou
  miroir: (chemin: string, contenu: string, etag: string) => void; maintenant?: () => number
  verifierContexte?: (etape: EtapeRetraitVarianteWebDAV) => void
}
interface Instantane {
  corpus: CorpusFichier; sourceCorpus: Lecture
  entretiens: Array<{ id: string; titre: string; data?: EntretienFichier; source?: Lecture }>
}
const sources = (s: Instantane) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.data }))
const memeDroit = (a: ContenuVerrou | undefined, b: ContenuVerrou | null) => !!a && !!b
  && a.userId === b.userId && a.machineId === b.machineId && a.sessionId === b.sessionId && a.acquiredAt === b.acquiredAt
class InventaireTropGrand extends Error {}

/** Remplace les seuls choix liés consentis ; les non-cibles et les états restent intacts. */
export class RetraitsVarianteAnonWebDAV {
  private readonly journal: JournalRetraitVarianteAnonWebDAV
  private readonly destination: string
  private readonly retenus = new Map<string, Verrou>()
  private readonly cache = new Map<string, { expire: number; instantane: Instantane; plan: ReturnType<typeof preparerRetraitVarianteAnon>; reprise?: string }>()
  private enCours = false
  private miroirIncomplet = false
  private durabiliteIncertaine = false
  constructor(private readonly deps: Dependances) {
    this.destination = empreinteCorrespondance(deps.client.config.baseUrl.replace(/\/+$/, ''))
    this.journal = new JournalRetraitVarianteAnonWebDAV(deps.dirLocal, this.destination)
    this.miroirIncomplet = this.journal.lire()?.miroirComplet === false
  }
  get occupe() { return this.enCours }
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  private verifierContexte(etape: EtapeRetraitVarianteWebDAV) { this.deps.verifierContexte?.(etape) }
  private exigerLibre() {
    if (this.enCours) throw new Error('Un retrait de variante WebDAV est déjà en cours.')
    this.exigerMiroirComplet()
  }
  exigerMiroirComplet() {
    if (this.miroirIncomplet || this.journal.lire()?.miroirComplet === false) throw new Error('Le miroir du retrait reste incomplet. Relisez son suivi sans rejouer.')
  }
  oublierApercu(token: string) { this.cache.delete(token) }
  viderApercus() { this.cache.clear() }
  ciblesApercu(token: string): string[] {
    const p = this.cache.get(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('Le bilan de retrait a expiré. Recalculez-le.')
    return p.plan.entretiens.map((e) => e.id)
  }
  cibleProtegee(id: string) {
    const j = this.journal.lire()
    return !!j && (j.cibles.some((c) => c.id === id && (c.etat === 'a-faire' || !j.miroirComplet)) || j.nouvellesCibles.includes(id))
  }
  lireSuivi(): SuiviRetraitVarianteAnon | null {
    const j = this.journal.lire()
    return j && (!j.varianteRetiree || !j.miroirComplet) ? { ...this.bilan(j), demande: structuredClone(j.demande) } : null
  }
  private bilan(j: LotRetraitVarianteWebDAV): BilanRetraitVarianteDistant {
    const b: BilanRetraitVarianteDistant = { annotations: 0, anonymisees: 0, exceptions: 0, incluses: 0, entretiens: 0,
      varianteRetiree: j.varianteRetiree, operationId: j.operationId, miroirIncomplet: !j.miroirComplet,
      statut: j.envoi ? 'indetermine' : j.varianteRetiree && j.miroirComplet ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat === 'a-faire').map((c) => ({ id: c.id, motif: c.motif ?? 'Entretien restant à modifier.' })),
      nouvellesCibles: [...j.nouvellesCibles], ...(j.motif ? { motif: j.motif } : {}) }
    for (const c of j.cibles.filter((c) => c.etat === 'confirme')) {
      for (const k of ['annotations', 'anonymisees', 'exceptions', 'incluses', 'entretiens'] as const) b[k] += c.bilan[k]
    }
    return b
  }
  async preparer(demande: DemandeRetraitVarianteAnon): Promise<ApercuRetraitVarianteAnon> {
    this.exigerLibre(); this.verifierContexte('preparation')
    if (this.lireSuivi()) throw new Error('Un retrait de variante reste à reprendre.')
    this.enCours = true
    try {
      const s = await this.lireInventaire()
      if (s.corpus.retraitVarianteAnon !== undefined || s.corpus.suppressionAnon !== undefined || s.corpus.dissociationAnon !== undefined) throw new Error('Une opération publiée est déjà engagée.')
      return this.memoriser(s, demande)
    } finally { this.enCours = false }
  }
  async preparerReprise(operationId: string): Promise<ApercuRetraitVarianteAnon> {
    this.exigerLibre(); this.verifierContexte('preparation')
    const j = this.exigerLot(operationId)
    if (j.envoi) throw new Error('La publication reste indéterminée. Relisez son suivi, aucun rejeu autorisé.')
    this.enCours = true
    try {
      const s = await this.lireInventaire()
      this.verifierCorpus(j, s.corpus); this.verifierAcquis(j, s)
      return this.memoriser(s, j.demande, j.operationId)
    } finally { this.enCours = false }
  }
  private memoriser(s: Instantane, demande: DemandeRetraitVarianteAnon, reprise?: string): ApercuRetraitVarianteAnon {
    this.verifierContexte('preparation')
    const plan = preparerRetraitVarianteAnon(this.corpusDePreparation(s.corpus), sources(s), demande)
    const j = reprise ? this.exigerLot(reprise) : null
    if (j && plan.entretiens.some((e) => j.cibles.some((c) => c.id === e.id && c.etat === 'confirme'))) throw new Error('Un ancien choix réapparaît dans une cible acquise. Aucun second remplacement autorisé.')
    const token = randomUUID()
    const apercu: ApercuRetraitVarianteAnon = { ...structuredClone(plan.inventaire), token, lecture: 'webdav', applicationDisponible: true,
      ciblesRetirees: j?.cibles.filter((c) => c.etat === 'a-faire' && !plan.entretiens.some((e) => e.id === c.id)).map((c) => c.id) ?? [], ...(reprise ? { reprise } : {}) }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('Le bilan de retrait dépasse 8 Mio.')
    for (const [t, p] of this.cache) if (p.expire <= this.maintenant()) this.cache.delete(t)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(token, { expire: this.maintenant() + 300_000, instantane: structuredClone(s), plan, reprise })
    return apercu
  }
  async appliquer(token: string, confirmee: boolean): Promise<BilanRetraitVarianteDistant> {
    const p = this.cache.get(token); this.cache.delete(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('Le bilan de retrait a expiré. Recalculez-le.')
    if (confirmee !== true) throw new Error('Confirmez explicitement le remplacement des choix liés et le retrait de la variante.')
    this.exigerLibre(); this.verifierContexte('application')
    let j = p.reprise ? this.exigerLot(p.reprise) : null
    if (j?.envoi) throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
    if (!j && this.lireSuivi()) throw new Error('Un retrait de variante reste à reprendre.')
    this.enCours = true
    try {
      await this.avecVerrous([], async (maintenir, garantir) => {
        const frais = await this.lireInventaire(maintenir)
        this.verifierContexte('application')
        if (p.expire <= this.maintenant()) throw new Error('Le bilan de retrait a expiré. Recalculez-le.')
        if (!egaux(frais.corpus, p.instantane.corpus) || frais.sourceCorpus.etag !== p.instantane.sourceCorpus.etag) throw new Error('Le corpus a changé depuis le bilan. Recalculez le retrait.')
        if (j) { this.verifierCorpus(j, frais.corpus); this.verifierAcquis(j, frais) }
        const controle = inventorierRetraitVarianteAnon(this.corpusDePreparation(frais.corpus), sources(frais), p.plan.inventaire.demande)
        if (!controle.faisable) throw new Error('L’inventaire publié présente des obstacles. Aucun remplacement autorisé.')
        const ids = new Set(p.plan.entretiens.map((e) => e.id))
        if (controle.entretiens.some((e) => e.annotations && !ids.has(e.id))) throw new Error('De nouveaux usages exigent un nouveau bilan et consentement.')
        if (!j) j = { version: 1, destination: this.destination, operationId: `retrait-variante-${randomUUID()}`, demande: structuredClone(p.plan.inventaire.demande),
          corpusAvant: this.corpusDePreparation(frais.corpus), barriereConfirmee: false, varianteRetiree: false, miroirComplet: true, cibles: [], nouvellesCibles: [] }
        for (const c of j.cibles.filter((c) => c.etat === 'a-faire' && !ids.has(c.id))) c.etat = 'retire'
        for (const e of p.plan.entretiens) {
          j.cibles = j.cibles.filter((c) => c.id !== e.id)
          Object.defineProperty(j.corpusAvant.membership, e.id, { value: structuredClone(frais.corpus.membership[e.id]), enumerable: true, configurable: true, writable: true })
          const corpus = { ...structuredClone(j.corpusAvant), membership: { [e.id]: j.corpusAvant.membership[e.id] } }
          const plan = preparerRetraitVarianteAnon(corpus, [{ id: e.id, titre: e.id, data: e.avant }], j.demande)
          j.cibles.push({ id: e.id, avant: JSON.stringify(e.avant), apres: JSON.stringify(e.apres), bilan: plan.bilan, etat: 'a-faire' })
        }
        j.nouvellesCibles = []; delete j.motif; this.journal.ecrire(j)
        if (!j.barriereConfirmee) {
          const apres = structuredClone(frais.corpus)
          apres.retraitVarianteAnon = barriereRetraitVarianteWebDAV(j)
          await this.publier(j, { phase: 'barriere', chemin: 'corpus.json', avant: frais.sourceCorpus.contenu,
            apres: this.serialiser(apres, frais.sourceCorpus.contenu), etagAvant: frais.sourceCorpus.etag }, garantir)
        }
      })
      for (const c of j!.cibles.filter((c) => c.etat === 'a-faire')) {
        this.verifierContexte('application')
        try {
          await this.avecVerrous([c.id], async (maintenir, garantir) => {
            await maintenir()
            const corpusSource = await this.lire('corpus.json'), corpus = this.corpus(corpusSource.contenu)
            this.verifierCorpus(j!, corpus)
            if (!Object.hasOwn(corpus.membership, c.id)) throw new Error('La cible ne fait plus partie du corpus. Recalculez la reprise.')
            const source = await this.lire(`entretiens/${c.id}.json`)
            if (!egaux(this.entretien(source.contenu), JSON.parse(c.avant))) throw new Error('La cible a changé. Recalculez la reprise, aucun écrasement autorisé.')
            const apres = JSON.parse(c.apres) as EntretienFichier
            apres.lastModified = new Date(this.maintenant()).toISOString()
            verifierBarriereDissociationWebDAV(corpus, apres, c.id)
            c.avant = source.contenu; c.apres = this.serialiser(apres, source.contenu)
            await this.publier(j!, { phase: 'entretien', chemin: `entretiens/${c.id}.json`, avant: c.avant, apres: c.apres, etagAvant: source.etag }, garantir, corpusSource)
          })
        } catch (e) {
          if (j!.envoi || this.miroirIncomplet || this.durabiliteIncertaine) throw e
          c.motif = 'Cible tenue, modifiée, indisponible ou droit perdu. Recalculez la reprise.'; this.journal.ecrire(j!)
        }
      }
      await this.avecVerrous([], async (maintenir, garantir) => {
        const final = await this.lireInventaire(maintenir)
        this.verifierCorpus(j!, final.corpus); this.verifierAcquis(j!, final)
        const controle = inventorierRetraitVarianteAnon(this.corpusDePreparation(final.corpus), sources(final), j!.demande)
        j!.nouvellesCibles = controle.entretiens.filter((e) => e.annotations && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
        if (!controle.faisable || controle.entretiens.some((e) => e.annotations) || j!.cibles.some((c) => c.etat === 'a-faire')) {
          j!.motif = 'Des entretiens restent à traiter ou à vérifier. Les deux variantes sont conservées.'; this.journal.ecrire(j!); return
        }
        const apres = structuredClone(final.corpus)
        apres.reglesAnon[j!.demande.regleAvant.id].pseudos = [j!.demande.pseudoConserve]; delete apres.retraitVarianteAnon
        await this.publier(j!, { phase: 'retrait', chemin: 'corpus.json', avant: final.sourceCorpus.contenu,
          apres: this.serialiser(apres, final.sourceCorpus.contenu), etagAvant: final.sourceCorpus.etag }, garantir)
      })
      return this.bilan(j!)
    } catch (e) {
      if (!j) throw e
      // Ne pas rétrograder une confirmation dont le fsync a pu réussir avant l’erreur.
      if (this.durabiliteIncertaine) return this.bilan(this.journal.lire()!)
      j.motif = this.miroirIncomplet ? 'Une publication est acquise mais votre copie reste à actualiser. Relisez le suivi sans rejouer.'
        : j.envoi ? 'Une publication reste indéterminée. Aucun rejeu ni libération automatique des droits.'
          : e instanceof Error ? e.message : 'Le retrait de variante reste incomplet.'
      this.journal.ecrire(j); return this.bilan(j)
    } finally { this.enCours = false }
  }
  async relireSuivi(operationId: string): Promise<BilanRetraitVarianteDistant> {
    if (this.enCours) throw new Error('Attendez la fin du retrait avant de relire son suivi.')
    this.verifierContexte('suivi')
    const j = this.journal.lire()
    if (!j || j.operationId !== operationId) throw new Error('Le retrait de variante n’existe plus.')
    this.enCours = true
    try {
      if (j.envoi) {
        const source = await this.lire(j.envoi.chemin)
        if (source.contenu !== j.envoi.apres) throw new Error('La publication reste indéterminée. L’original ne prouve pas un refus ; aucun rejeu autorisé.')
        this.confirmer(j)
      }
      if (!j.miroirComplet || this.miroirIncomplet || this.durabiliteIncertaine) {
        this.miroirIncomplet = true
        const s = await this.lireInventaire()
        this.verifierContexte('suivi'); this.installerActuels(j, s)
        j.miroirComplet = true; delete j.motif; this.journal.ecrire(j)
        this.miroirIncomplet = false; this.durabiliteIncertaine = false
      }
      // Une nouvelle instance ne possède aucun de ces providers acquis.
      for (const [chemin, droit] of this.retenus) { await this.rendreDroit(droit); this.retenus.delete(chemin) }
      return this.bilan(j)
    } finally { this.enCours = false }
  }
  private installerActuels(j: LotRetraitVarianteWebDAV, s: Instantane) {
    try {
      this.deps.miroir('corpus.json', s.sourceCorpus.contenu, s.sourceCorpus.etag)
      for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id) && !this.sessionPresente(c.id))) {
        const source = s.entretiens.find((e) => e.id === c.id)?.source
        if (!source) throw new Error()
        this.deps.miroir(`entretiens/${c.id}.json`, source.contenu, source.etag)
      }
    } catch { throw new Error('Votre copie du corpus reste à actualiser. Relisez le suivi sans rejouer.') }
  }
  private verifierCorpus(j: LotRetraitVarianteWebDAV, corpus: CorpusFichier) {
    if (corpus.dissociationAnon !== undefined || corpus.suppressionAnon !== undefined || !egaux(corpus.reglesAnon?.[j.demande.regleAvant.id], j.demande.regleAvant)
      || (j.barriereConfirmee ? !egaux(lireBarriereRetraitVarianteAnon(corpus), barriereRetraitVarianteWebDAV(j)) : corpus.retraitVarianteAnon !== undefined)) throw new Error('La règle ou sa protection a changé. Aucune poursuite forcée autorisée.')
  }
  private verifierAcquis(j: LotRetraitVarianteWebDAV, s: Instantane) {
    for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id))) {
      const d = s.entretiens.find((e) => e.id === c.id)?.data
      const corpus = { ...this.corpusDePreparation(s.corpus), membership: { [c.id]: s.corpus.membership[c.id] } }
      const controle = inventorierRetraitVarianteAnon(corpus, [{ id: c.id, titre: c.id, data: d }], j.demande)
      if (!controle.faisable || controle.bilan.annotations) throw new Error('Un entretien déjà traité porte de nouveaux choix ou des données invalides. Aucun second remplacement ni restauration forcés.')
    }
  }
  private corpusDePreparation(corpus: CorpusFichier): CorpusFichier {
    const copie = structuredClone(corpus); delete copie.retraitVarianteAnon; return copie
  }
  private exigerLot(id: string): LotRetraitVarianteWebDAV {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.varianteRetiree) throw new Error('Retrait absent ou terminé.')
    return j
  }
  private async publier(j: LotRetraitVarianteWebDAV, envoi: EnvoiRetraitVarianteWebDAV, garantir: () => Promise<void>, corpusSource?: Lecture) {
    const frais = await this.lire(envoi.chemin)
    if (frais.etag !== envoi.etagAvant || frais.contenu !== envoi.avant) throw new Error('La source a changé avant publication. Aucun écrasement autorisé.')
    await garantir(); j.envoi = envoi; this.journal.ecrire(j)
    try {
      if (corpusSource) {
        const corpus = await this.lire('corpus.json')
        if (corpus.etag !== corpusSource.etag || corpus.contenu !== corpusSource.contenu) throw new Error('Le corpus a changé avant le PUT de la cible.')
      }
      await garantir(); this.verifierContexte('application')
    } catch (e) { delete j.envoi; this.journal.ecrire(j); throw e }
    let acceptee = false
    try { await this.deps.client.putTexte(envoi.chemin, envoi.apres, { ifMatch: envoi.etagAvant }); acceptee = true }
    catch (e) {
      if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
        delete j.envoi; this.journal.ecrire(j); throw new Error('Le serveur a refusé le remplacement.')
      }
    }
    if (acceptee) this.confirmer(j)
    const source = await this.lire(envoi.chemin)
    if (!acceptee) {
      if (source.contenu !== envoi.apres) throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
      this.confirmer(j)
    }
    // Après acceptation, installer la source courante, jamais l’ancien candidat.
    try {
      this.deps.miroir(envoi.chemin, source.contenu, source.etag)
      j.miroirComplet = true; this.journal.ecrire(j); this.miroirIncomplet = false
    } catch { throw new Error('Votre copie du corpus reste à actualiser. Relisez le suivi sans rejouer.') }
  }
  private confirmer(j: LotRetraitVarianteWebDAV) {
    const suivant = structuredClone(j), e = suivant.envoi!
    if (e.phase === 'barriere') suivant.barriereConfirmee = true
    else if (e.phase === 'retrait') { suivant.varianteRetiree = true; delete suivant.motif }
    else { const c = suivant.cibles.find((c) => `entretiens/${c.id}.json` === e.chemin)!; c.etat = 'confirme'; delete c.motif }
    delete suivant.envoi; suivant.miroirComplet = false
    this.miroirIncomplet = true
    try { this.journal.ecrire(suivant) } catch (e) { this.durabiliteIncertaine = true; throw e }
    j.barriereConfirmee = suivant.barriereConfirmee; j.varianteRetiree = suivant.varianteRetiree; j.miroirComplet = false
    for (let i = 0; i < j.cibles.length; i++) {
      j.cibles[i].etat = suivant.cibles[i].etat
      if (suivant.cibles[i].motif === undefined) delete j.cibles[i].motif
    }
    if (suivant.motif === undefined) delete j.motif
    delete j.envoi
  }
  private sessionPresente(id: string) { return this.deps.sessionsLocales().some((s) => s === id || s === `entretiens/${id}.json` || s.endsWith(`:${id}`)) }
  private exigerSansSession(ids: string[]) { if (ids.some((id) => this.sessionPresente(id))) throw new Error('Fermez la session locale ou récupérable de cette cible puis recalculez la reprise.') }
  private async preuveDroit(v: Verrou): Promise<ContenuVerrou | null> {
    if (!(v.provider instanceof ProviderFilesLock)) return v.provider.etat(v.chemin)
    const natif = await this.deps.client.etatVerrouNatif(v.chemin)
    if (!natif) return null
    if (!natif.owner || natif.owner !== this.deps.utilisateur() || !Number.isSafeInteger(natif.time) || natif.time! <= 0
      || natif.timeout !== null && (!Number.isSafeInteger(natif.timeout) || natif.timeout < 0)) {
      throw new Error('Le propriétaire ou la génération du droit natif ne peut pas être prouvé.')
    }
    const date = new Date(natif.time! * 1000).toISOString()
    // Un droit natif sans expiration annoncée reste borné à une heure côté application.
    const preuve = { userId: natif.owner, machineId: '', sessionId: '', acquiredAt: date, refreshedAt: date,
      ttl: natif.timeout && natif.timeout > 0 ? natif.timeout : 3600 }
    this.bornerEcheance(v, preuve)
    return preuve
  }
  private bornerEcheance(v: Verrou, preuve: ContenuVerrou) {
    if (v.provider instanceof ProviderFilesLock) {
      const limite = Date.parse(preuve.refreshedAt) + preuve.ttl * 1000
      if (!Number.isFinite(limite) || preuve.ttl <= 0) throw new Error('L’échéance du droit natif ne peut pas être prouvée.')
      v.echeance = Math.min(v.echeance!, limite)
    }
  }
  private async rendreDroit(v: Verrou) {
    if (this.maintenant() >= (v.echeance ?? 0)) return
    try {
      const preuve = await this.preuveDroit(v)
      if (this.maintenant() < (v.echeance ?? 0) && memeDroit(v.preuve, preuve)) await v.provider.liberer(v.chemin)
    } catch { /* Un droit dont la provenance est incertaine reste sur le serveur. */ }
  }
  private async avecVerrous<T>(ids: string[], action: (maintenir: () => Promise<void>, garantir: () => Promise<void>) => Promise<T>): Promise<T> {
    this.exigerSansSession(ids)
    const verrous: Verrou[] = []
    try {
      for (const demande of [this.deps.verrouCorpus(), ...ids.map((id) => this.deps.verrouEntretien(id))]) {
        this.exigerSansSession(ids)
        const v = this.retenus.get(demande.chemin) ?? demande
        if (!this.retenus.has(v.chemin)) {
          const debut = this.maintenant(), acquisition = await v.provider.acquerir(v.chemin)
          if (!acquisition.ok) throw new Error('Un verrou reste tenu. Aucune libération ni reprise forcée autorisée.')
          v.echeance = debut + acquisition.dureeGarantieMs
          verrous.push(v)
          const preuve = await this.preuveDroit(v)
          if (!preuve) throw new Error('Le droit acquis ne peut pas être vérifié.')
          v.preuve = preuve
        } else verrous.push(v)
      }
      const maintenir = async (verifier = false) => {
        this.exigerSansSession(ids)
        for (const v of verrous) {
          if (this.maintenant() >= (v.echeance ?? 0)) throw new Error('Le droit du retrait a expiré. Aucun renouvellement forcé.')
          // Pendant l’inventaire, renouveler seulement quand l’échéance approche.
          if (!verifier && this.maintenant() + 120_000 < (v.echeance ?? 0)) continue
          const actuelAvant = await this.preuveDroit(v)
          if (this.maintenant() >= (v.echeance ?? 0) || !memeDroit(v.preuve, actuelAvant)) throw new Error('Le droit du retrait a expiré ou changé. Aucun renouvellement forcé.')
          if (this.maintenant() + 120_000 < (v.echeance ?? 0)) continue
          const debut = this.maintenant(), preuve = await v.provider.battre(v.chemin)
          if (!preuve.ok) throw new Error('Le droit du retrait a été perdu.')
          v.echeance = debut + preuve.dureeGarantieMs
          const actuel = await this.preuveDroit(v)
          if (!actuel || actuel.userId !== v.preuve!.userId || actuel.machineId !== v.preuve!.machineId || actuel.sessionId !== v.preuve!.sessionId) throw new Error('Le propriétaire du droit a changé.')
          v.preuve = actuel
        }
      }
      const garantir = async () => {
        await maintenir(true)
        if (verrous.some((v) => this.maintenant() + 60_000 >= (v.echeance ?? 0))) throw new Error('Un droit va expirer ; aucun PUT envoyé.')
      }
      await garantir(); return await action(maintenir, garantir)
    } finally {
      const incertain = this.durabiliteIncertaine || !!this.journal.lire()?.envoi
      for (const v of verrous.reverse()) {
        if (incertain) this.retenus.set(v.chemin, v)
        else { this.retenus.delete(v.chemin); await this.rendreDroit(v) }
      }
    }
  }
  private async lireInventaire(maintenir?: () => Promise<void>): Promise<Instantane> {
    await maintenir?.()
    const premier = await this.lire('corpus.json'), corpus = this.corpus(premier.contenu)
    const entretiens: Instantane['entretiens'] = []
    let octets = Buffer.byteLength(premier.contenu)
    if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire de retrait dépasse 64 Mio.')
    for (const [id, membre] of Object.entries(corpus.membership)) {
      await maintenir?.()
      try {
        if (!idImportWebDAVSain(id)) throw new Error()
        const source = await this.lire(`entretiens/${id}.json`)
        octets += Buffer.byteLength(source.contenu)
        if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire de retrait dépasse 64 Mio.')
        entretiens.push({ id, titre: membre.titre ?? id, data: this.entretien(source.contenu), source })
      } catch (e) {
        if (e instanceof InventaireTropGrand) throw e
        entretiens.push({ id, titre: membre.titre ?? id })
      }
    }
    await maintenir?.()
    const dernier = await this.lire('corpus.json')
    if (dernier.etag !== premier.etag || dernier.contenu !== premier.contenu) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez le retrait.')
    return { corpus, sourceCorpus: dernier, entretiens }
  }
  private async lire(chemin: string): Promise<Lecture> {
    const source = await this.deps.client.getTexteAvecEtag(chemin)
    if (!etagImportWebDAVFort(source.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort : retrait refusé.')
    return { contenu: source.contenu, etag: source.etag }
  }
  private corpus(contenu: string): CorpusFichier {
    try {
      const data = JSON.parse(contenu) as CorpusFichier
      if (data?.formatVersion !== FORMAT_VERSION || !data.membership || typeof data.membership !== 'object' || Array.isArray(data.membership) || !data.reglesAnon) throw new Error()
      return data
    } catch { throw new Error('Le corpus publié n’est pas pris en charge.') }
  }
  private entretien(contenu: string): EntretienFichier {
    try {
      const data = JSON.parse(contenu) as EntretienFichier
      if (data?.formatVersion !== FORMAT_VERSION || !Array.isArray(data.annotations)) throw new Error()
      return data
    } catch { throw new Error('L’entretien publié n’est pas pris en charge.') }
  }
  private serialiser(data: unknown, avant: string) {
    const contenu = JSON.stringify(data, null, 2)
    // Nextcloud peut conserver un ETag à taille et date identiques.
    return Buffer.byteLength(contenu) === Buffer.byteLength(avant) ? `${contenu}\n` : contenu
  }
}
