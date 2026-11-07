import { randomUUID } from 'node:crypto'
import { ErreurHttp, type ClientWebDAV } from '../webdav/client'
import type { VerrouProvider } from '../verrous/types'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../shared/format'
import { inventorierSuppressionAnon, preparerSuppressionAnon, type ApercuSuppressionAnon, type BilanSuppressionDistant, type DemandeSuppressionAnon, type SuiviSuppressionAnon } from '../../shared/corpus/suppressionAnon'
import { lireBarriereSuppressionAnon } from '../../shared/corpus/barriereSuppressionAnon'
import { verifierBarriereDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { validerMemoireLocale } from '../../shared/entretien/anon/definitionsLocales'
import { JournalSuppressionAnonWebDAV, barriereSuppressionWebDAV, egauxSuppressionWebDAV as egaux, type LotSuppressionWebDAV, type EnvoiSuppressionWebDAV } from './journalSuppressionAnonWebDAV'
import { etagImportWebDAVFort, idImportWebDAVSain } from './journalCorrespondancesWebDAV'
import { empreinteCorrespondance } from '../tablesCorrespondance'

interface Lecture { contenu: string; etag: string }
type Verrou = { provider: VerrouProvider; chemin: string; echeance?: number }
interface Dependances {
  client: ClientWebDAV; dirLocal: string; sessionsLocales: () => string[]
  verrouCorpus: () => Verrou; verrouEntretien: (id: string) => Verrou
  miroir: (chemin: string, contenu: string, etag: string) => void; maintenant?: () => number
}
interface Instantane {
  corpus: CorpusFichier; sourceCorpus: Lecture
  entretiens: Array<{ id: string; titre: string; data?: EntretienFichier; source?: Lecture }>
}
const sources = (s: Instantane) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.data }))
class InventaireTropGrand extends Error {}

/** Retire les seuls choix liés consentis ; le verrou corpus protège la preuve finale. */
export class SuppressionsAnonWebDAV {
  private readonly journal: JournalSuppressionAnonWebDAV
  private readonly destination: string
  private readonly retenus = new Map<string, Verrou>()
  private readonly cache = new Map<string, { expire: number; instantane: Instantane; plan: ReturnType<typeof preparerSuppressionAnon>; reprise?: string }>()
  private enCours = false
  private miroirIncomplet = false
  constructor(private readonly deps: Dependances) {
    this.destination = empreinteCorrespondance(deps.client.config.baseUrl.replace(/\/+$/, ''))
    this.journal = new JournalSuppressionAnonWebDAV(deps.dirLocal, this.destination)
    this.miroirIncomplet = this.journal.lire()?.miroirComplet === false
  }
  get occupe() { return this.enCours }
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  private exigerLibre() {
    if (this.enCours) throw new Error('Une suppression WebDAV est déjà en cours.')
    this.exigerMiroirComplet()
  }
  exigerMiroirComplet() {
    if (this.miroirIncomplet || this.journal.lire()?.miroirComplet === false) throw new Error('Le miroir de suppression reste incomplet. Relisez le suivi ou rouvrez sans rejouer.')
  }
  oublierApercu(token: string) { this.cache.delete(token) }
  viderApercus() { this.cache.clear() }
  ciblesApercu(token: string): string[] {
    const p = this.cache.get(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('L’aperçu de suppression a expiré. Recalculez-le.')
    return p.plan.entretiens.map((e) => e.id)
  }
  cibleProtegee(id: string) {
    const j = this.journal.lire()
    return !!j && (j.cibles.some((c) => c.id === id && (c.etat === 'a-faire' || !j.miroirComplet)) || j.nouvellesCibles.includes(id))
  }
  lireSuivi(): SuiviSuppressionAnon | null {
    const j = this.journal.lire()
    return j && (!j.regleRetiree || !j.miroirComplet) ? { ...this.bilan(j), demande: structuredClone(j.demande) } : null
  }
  private bilan(j: LotSuppressionWebDAV): BilanSuppressionDistant {
    const b: BilanSuppressionDistant = { annotations: 0, anonymisees: 0, exceptions: 0, inclusesRetirees: 0, inclusesRevelees: 0, entretiens: 0,
      regleRetiree: j.regleRetiree, operationId: j.operationId, miroirIncomplet: !j.miroirComplet, statut: j.envoi ? 'indetermine' : j.regleRetiree && j.miroirComplet ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat === 'a-faire').map((c) => ({ id: c.id, motif: c.motif ?? 'Entretien restant à modifier.' })),
      nouvellesCibles: [...j.nouvellesCibles], ...(j.motif ? { motif: j.motif } : {}) }
    for (const c of j.cibles.filter((c) => c.etat === 'confirme')) {
      for (const k of ['annotations', 'anonymisees', 'exceptions', 'inclusesRetirees', 'inclusesRevelees', 'entretiens'] as const) b[k] += c.bilan[k]
    }
    return b
  }
  async preparer(demande: DemandeSuppressionAnon): Promise<ApercuSuppressionAnon> {
    this.exigerLibre()
    if (this.lireSuivi()) throw new Error('Un lot de suppression reste à reprendre.')
    this.enCours = true
    try {
      const s = await this.lireInventaire()
      if (s.corpus.suppressionAnon !== undefined) throw new Error('Une suppression publiée est déjà engagée.')
      return this.memoriser(s, demande)
    } finally { this.enCours = false }
  }
  async preparerReprise(operationId: string): Promise<ApercuSuppressionAnon> {
    this.exigerLibre()
    const j = this.exigerLot(operationId)
    if (j.envoi) throw new Error('La publication reste indéterminée. Relisez son suivi, aucun rejeu autorisé.')
    this.enCours = true
    try {
      const s = await this.lireInventaire()
      this.verifierCorpus(j, s.corpus); this.verifierAcquis(j, s)
      return this.memoriser(s, j.demande, j.operationId)
    } finally { this.enCours = false }
  }
  private memoriser(s: Instantane, demande: DemandeSuppressionAnon, reprise?: string): ApercuSuppressionAnon {
    const plan = preparerSuppressionAnon(this.corpusDePreparation(s.corpus), sources(s), demande)
    const j = reprise ? this.exigerLot(reprise) : null
    if (j && plan.entretiens.some((e) => j.cibles.some((c) => c.id === e.id && c.etat === 'confirme'))) {
      throw new Error('De nouveaux liens figurent dans une cible acquise. Examinez leur provenance avant tout nouveau retrait.')
    }
    const token = randomUUID()
    const apercu: ApercuSuppressionAnon = { ...structuredClone(plan.inventaire), token, lecture: 'webdav', applicationDisponible: true,
      ciblesRetirees: j?.cibles.filter((c) => c.etat === 'a-faire' && !plan.entretiens.some((e) => e.id === c.id)).map((c) => c.id) ?? [], ...(reprise ? { reprise } : {}) }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('L’aperçu de suppression dépasse 8 Mio.')
    for (const [t, p] of this.cache) if (p.expire <= this.maintenant()) this.cache.delete(t)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(token, { expire: this.maintenant() + 300_000, instantane: structuredClone(s), plan, reprise })
    return apercu
  }
  async appliquer(token: string, confirmee: boolean): Promise<BilanSuppressionDistant> {
    const p = this.cache.get(token); this.cache.delete(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('L’aperçu de suppression a expiré. Recalculez-le.')
    if (confirmee !== true) throw new Error('Confirmez explicitement le retrait des choix liés et de la règle partagée.')
    this.exigerLibre()
    let j = p.reprise ? this.exigerLot(p.reprise) : null
    if (j?.envoi) throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
    if (!j && this.lireSuivi()) throw new Error('Un lot de suppression reste à reprendre.')
    this.enCours = true
    try {
      await this.avecVerrous([], async (maintenir, garantir) => {
        const frais = await this.lireInventaire(maintenir)
        if (p.expire <= this.maintenant()) throw new Error('L’aperçu de suppression a expiré. Recalculez-le.')
        if (!egaux(frais.corpus, p.instantane.corpus) || frais.sourceCorpus.etag !== p.instantane.sourceCorpus.etag) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez la suppression.')
        if (j) { this.verifierCorpus(j, frais.corpus); this.verifierAcquis(j, frais) }
        const controle = inventorierSuppressionAnon(this.corpusDePreparation(frais.corpus), sources(frais), p.plan.inventaire.demande)
        if (!controle.faisable) throw new Error('L’inventaire publié présente des obstacles. Aucun retrait autorisé.')
        const ids = new Set(p.plan.entretiens.map((e) => e.id))
        if (controle.entretiens.some((e) => e.annotations && !ids.has(e.id))) throw new Error('De nouveaux usages exigent un nouvel aperçu et consentement.')
        if (!j) j = { version: 1, destination: this.destination, operationId: `suppression-anon-${randomUUID()}`, demande: structuredClone(p.plan.inventaire.demande),
          corpusAvant: this.corpusDePreparation(frais.corpus), barriereConfirmee: false, regleRetiree: false, miroirComplet: true, cibles: [], nouvellesCibles: [] }
        for (const c of j.cibles.filter((c) => c.etat === 'a-faire' && !ids.has(c.id))) c.etat = 'retire'
        for (const e of p.plan.entretiens) {
          j.cibles = j.cibles.filter((c) => c.id !== e.id)
          Object.defineProperty(j.corpusAvant.membership, e.id, { value: structuredClone(frais.corpus.membership[e.id]), enumerable: true, configurable: true, writable: true })
          const corpus = { ...structuredClone(j.corpusAvant), membership: { [e.id]: j.corpusAvant.membership[e.id] } }
          const plan = preparerSuppressionAnon(corpus, [{ id: e.id, titre: e.id, data: e.avant }], j.demande)
          j.cibles.push({ id: e.id, avant: JSON.stringify(e.avant), apres: JSON.stringify(e.apres), bilan: plan.bilan, etat: 'a-faire' })
        }
        j.nouvellesCibles = []; delete j.motif; this.journal.ecrire(j)
        if (!j.barriereConfirmee) {
          const apres = structuredClone(frais.corpus)
          apres.suppressionAnon = barriereSuppressionWebDAV(j)
          await this.publier(j, { phase: 'barriere', chemin: 'corpus.crp', avant: frais.sourceCorpus.contenu,
            apres: this.serialiser(apres, frais.sourceCorpus.contenu), etagAvant: frais.sourceCorpus.etag }, garantir)
        }
      })
      for (const c of j!.cibles.filter((c) => c.etat === 'a-faire')) {
        try {
          await this.avecVerrous([c.id], async (maintenir, garantir) => {
            await maintenir()
            const corpusSource = await this.lire('corpus.crp'), corpus = this.corpus(corpusSource.contenu)
            this.verifierCorpus(j!, corpus)
            if (!Object.hasOwn(corpus.membership, c.id)) throw new Error('La cible ne fait plus partie du corpus. Recalculez la reprise.')
            const source = await this.lire(`entretiens/${c.id}.json`)
            if (!egaux(this.entretien(source.contenu), JSON.parse(c.avant))) throw new Error('La cible a changé. Recalculez la reprise, aucun écrasement autorisé.')
            const apres = JSON.parse(c.apres) as EntretienFichier
            apres.lastModified = new Date(this.maintenant()).toISOString()
            verifierBarriereDissociationWebDAV(corpus, apres, c.id)
            c.avant = source.contenu; c.apres = this.serialiser(apres, source.contenu)
            const garde = await this.lire('corpus.crp')
            if (garde.etag !== corpusSource.etag || garde.contenu !== corpusSource.contenu) throw new Error('Le corpus a changé avant le PUT de la cible.')
            await this.publier(j!, { phase: 'entretien', chemin: `entretiens/${c.id}.json`, avant: c.avant, apres: c.apres, etagAvant: source.etag }, garantir, corpusSource)
          })
        } catch (e) {
          if (j!.envoi || this.miroirIncomplet) throw e
          c.motif = 'Cible tenue, modifiée, indisponible ou droit perdu. Recalculez la reprise.'; this.journal.ecrire(j!)
        }
      }
      await this.avecVerrous([], async (maintenir, garantir) => {
        const final = await this.lireInventaire(maintenir)
        this.verifierCorpus(j!, final.corpus); this.verifierAcquis(j!, final)
        const controle = inventorierSuppressionAnon(this.corpusDePreparation(final.corpus), sources(final), j!.demande)
        j!.nouvellesCibles = controle.entretiens.filter((e) => e.annotations && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
        if (!controle.faisable || controle.entretiens.some((e) => e.annotations) || j!.cibles.some((c) => c.etat === 'a-faire')) {
          j!.motif = 'Le contrôle final reste incomplet. La règle partagée et la barrière sont conservées.'; this.journal.ecrire(j!); return
        }
        const apres = structuredClone(final.corpus)
        delete apres.reglesAnon[j!.demande.regleId]; delete apres.suppressionAnon
        await this.publier(j!, { phase: 'retrait', chemin: 'corpus.crp', avant: final.sourceCorpus.contenu,
          apres: this.serialiser(apres, final.sourceCorpus.contenu), etagAvant: final.sourceCorpus.etag }, garantir)
      })
      return this.bilan(j!)
    } catch (e) {
      if (!j) throw e
      j.motif = this.miroirIncomplet ? 'Une publication est acquise mais le miroir reste incomplet. Relisez le suivi ou rouvrez sans rejouer.'
        : j.envoi ? 'Une publication reste indéterminée. Aucun rejeu ni libération automatique des verrous.'
          : e instanceof Error ? e.message : 'La suppression reste incomplète.'
      this.journal.ecrire(j); return this.bilan(j)
    } finally { this.enCours = false }
  }
  async relireSuivi(operationId: string): Promise<BilanSuppressionDistant> {
    if (this.enCours) throw new Error('Attendez la fin de la suppression avant de relire son suivi.')
    const j = this.journal.lire()
    if (!j || j.operationId !== operationId) throw new Error('Le lot de suppression n’existe plus.')
    this.enCours = true
    try {
      const incertain = !!j.envoi
      if (j.envoi) {
        const id = /^entretiens\/([^/]+)\.json$/.exec(j.envoi.chemin)?.[1]
        await this.avecVerrous(id ? [id] : [], async (maintenir) => {
          await maintenir()
          const source = await this.lire(j.envoi!.chemin)
          if (source.contenu !== j.envoi!.apres) throw new Error('La publication reste indéterminée. L’original ne prouve pas un refus ; aucun rejeu autorisé.')
          this.confirmer(j)
        })
      }
      if (incertain || !j.miroirComplet || this.miroirIncomplet) {
        this.miroirIncomplet = true
        const s = await this.lireInventaire()
        this.installerActuels(j, s); j.miroirComplet = true; this.miroirIncomplet = false
        delete j.motif; this.journal.ecrire(j)
      }
      return this.bilan(j)
    } finally { this.enCours = false }
  }
  private installerActuels(j: LotSuppressionWebDAV, s: Instantane) {
    try {
      this.deps.miroir('corpus.crp', s.sourceCorpus.contenu, s.sourceCorpus.etag)
      for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id) && !this.sessionPresente(c.id))) {
        const source = s.entretiens.find((e) => e.id === c.id)?.source
        if (!source) throw new Error()
        this.deps.miroir(`entretiens/${c.id}.json`, source.contenu, source.etag)
      }
    } catch { this.miroirIncomplet = true; throw new Error('Le miroir de suppression reste incomplet. Rouvrez sans rejouer.') }
  }
  private verifierCorpus(j: LotSuppressionWebDAV, corpus: CorpusFichier) {
    if (corpus.dissociationAnon !== undefined || !egaux(corpus.reglesAnon?.[j.demande.regleId], j.corpusAvant.reglesAnon[j.demande.regleId])
      || (j.barriereConfirmee ? !egaux(lireBarriereSuppressionAnon(corpus), barriereSuppressionWebDAV(j)) : corpus.suppressionAnon !== undefined)) {
      throw new Error('La définition ou la barrière de suppression a changé. Aucune poursuite forcée autorisée.')
    }
  }
  private verifierAcquis(j: LotSuppressionWebDAV, s: Instantane) {
    for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id))) {
      const d = s.entretiens.find((e) => e.id === c.id)?.data
      if (!d || d.annotations.some((a) => a.regle === j.demande.regleId)) {
        throw new Error('Un entretien déjà traité est indisponible ou porte de nouveaux liens. Aucun nouveau retrait ni restauration forcée autorisé.')
      }
      validerMemoireLocale(d.definitionsAnonLocales ?? [])
    }
  }
  private corpusDePreparation(corpus: CorpusFichier): CorpusFichier {
    const copie = structuredClone(corpus)
    delete copie.suppressionAnon
    return copie
  }
  private exigerLot(id: string): LotSuppressionWebDAV {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.regleRetiree) throw new Error('Lot de suppression absent ou terminé.')
    return j
  }
  private async publier(j: LotSuppressionWebDAV, envoi: EnvoiSuppressionWebDAV, garantir: () => void, corpusSource?: Lecture) {
    const frais = await this.lire(envoi.chemin)
    if (frais.etag !== envoi.etagAvant || frais.contenu !== envoi.avant) throw new Error('La source a changé avant publication. Aucun écrasement autorisé.')
    garantir(); j.envoi = envoi; this.journal.ecrire(j)
    try {
      if (corpusSource) {
        const corpus = await this.lire('corpus.crp')
        if (corpus.etag !== corpusSource.etag || corpus.contenu !== corpusSource.contenu) throw new Error('Le corpus a changé avant le PUT de la cible.')
      }
      garantir()
    } catch (e) { delete j.envoi; this.journal.ecrire(j); throw e }
    try { await this.deps.client.putTexte(envoi.chemin, envoi.apres, { ifMatch: envoi.etagAvant }) }
    catch (e) {
      if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
        delete j.envoi; this.journal.ecrire(j); throw new Error('Le serveur a refusé le PUT de suppression.')
      }
    }
    const source = await this.lire(envoi.chemin)
    if (source.contenu !== envoi.apres) throw new Error('Publication indéterminée. Aucun rejeu autorisé.')
    this.confirmer(j)
    try {
      this.deps.miroir(envoi.chemin, source.contenu, source.etag)
      j.miroirComplet = true; this.journal.ecrire(j); this.miroirIncomplet = false
    }
    catch { this.miroirIncomplet = true; throw new Error('Le miroir de suppression reste incomplet.') }
  }
  private confirmer(j: LotSuppressionWebDAV) {
    const e = j.envoi!
    if (e.phase === 'barriere') { j.barriereConfirmee = true }
    else if (e.phase === 'retrait') { j.regleRetiree = true; delete j.motif }
    else { const c = j.cibles.find((c) => `entretiens/${c.id}.json` === e.chemin)!; c.etat = 'confirme'; delete c.motif }
    delete j.envoi; j.miroirComplet = false; this.miroirIncomplet = true; this.journal.ecrire(j)
  }
  private sessionPresente(id: string) { return this.deps.sessionsLocales().some((s) => s === id || s === `entretiens/${id}.json` || s.endsWith(`:${id}`)) }
  private exigerSansSession(ids: string[]) { if (ids.some((id) => this.sessionPresente(id))) throw new Error('Fermez la session locale ou récupérable de cette cible puis recalculez la reprise.') }
  private async avecVerrous<T>(ids: string[], action: (maintenir: () => Promise<void>, garantir: () => void) => Promise<T>): Promise<T> {
    this.exigerSansSession(ids)
    const verrous: Verrou[] = []
    try {
      for (const demande of [this.deps.verrouCorpus(), ...ids.map((id) => this.deps.verrouEntretien(id))]) {
        this.exigerSansSession(ids)
        const existant = this.retenus.get(demande.chemin), v = existant ?? demande
        if (!existant) {
          const debut = this.maintenant(), acquisition = await v.provider.acquerir(v.chemin)
          if (!acquisition.ok) throw new Error('Un verrou reste tenu. Aucune libération ni reprise forcée autorisée.')
          v.echeance = debut + acquisition.dureeGarantieMs
        }
        verrous.push(v)
      }
      const maintenir = async () => {
        this.exigerSansSession(ids)
        for (const v of verrous) {
          const debut = this.maintenant(), preuve = await v.provider.battre(v.chemin)
          if (!preuve.ok) throw new Error('Le verrou de suppression a été perdu.')
          v.echeance = debut + preuve.dureeGarantieMs
        }
      }
      const garantir = () => {
        this.exigerSansSession(ids)
        if (verrous.some((v) => this.maintenant() + 60_000 >= (v.echeance ?? 0))) throw new Error('Un verrou va expirer ; aucun PUT envoyé.')
      }
      await maintenir(); garantir(); return await action(maintenir, garantir)
    } finally {
      const incertain = !!this.journal.lire()?.envoi
      for (const v of verrous.reverse()) {
        if (incertain) this.retenus.set(v.chemin, v)
        else { this.retenus.delete(v.chemin); await v.provider.liberer(v.chemin).catch(() => {}) }
      }
    }
  }
  private async lireInventaire(maintenir?: () => Promise<void>): Promise<Instantane> {
    await maintenir?.()
    const premier = await this.lire('corpus.crp'), corpus = this.corpus(premier.contenu)
    const entretiens: Instantane['entretiens'] = []
    let octets = Buffer.byteLength(premier.contenu)
    if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire de suppression dépasse 64 Mio.')
    for (const [id, membre] of Object.entries(corpus.membership)) {
      await maintenir?.()
      try {
        if (!idImportWebDAVSain(id)) throw new Error()
        const source = await this.lire(`entretiens/${id}.json`)
        octets += Buffer.byteLength(source.contenu)
        if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire de suppression dépasse 64 Mio.')
        entretiens.push({ id, titre: membre.titre ?? id, data: this.entretien(source.contenu), source })
      } catch (e) {
        if (e instanceof InventaireTropGrand) throw e
        entretiens.push({ id, titre: membre.titre ?? id })
      }
    }
    await maintenir?.()
    const dernier = await this.lire('corpus.crp')
    if (dernier.etag !== premier.etag || dernier.contenu !== premier.contenu) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez la suppression.')
    return { corpus, sourceCorpus: dernier, entretiens }
  }
  private async lire(chemin: string): Promise<Lecture> {
    const source = await this.deps.client.getTexteAvecEtag(chemin)
    if (!etagImportWebDAVFort(source.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort : suppression refusée.')
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
