import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import { ErreurHttp, type ClientWebDAV } from '../webdav/client'
import type { VerrouProvider } from '../verrous/types'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../shared/format'
import { inventorierRenommageAnon, preparerRenommageAnon, type BilanRenommageAnon, type SuiviRenommageAnon } from '../../shared/corpus/renommageAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import type { InstantaneOperationTheme } from '../operationsThemes'
import type { PreparationRenommageDistant } from '../renommagesAnon'
import { JournalRenommageAnonWebDAV, type LotRenommageWebDAV, type EnvoiRenommageWebDAV } from './journalRenommageAnonWebDAV'
import { idImportWebDAVSain, etagImportWebDAVFort } from './journalCorrespondancesWebDAV'

type Verrou = { provider: VerrouProvider; chemin: string; echeance?: number }
interface Dependances {
  client: ClientWebDAV; store: CorpusStore; dirLocal: string
  sessionsLocales: () => string[]
  verrouCorpus: () => Verrou; verrouEntretien: (id: string) => Verrou
  miroir: (chemin: string, contenu: string, etag: string) => void
  maintenant?: () => number
}
const signature = (r: unknown) => {
  const regle = r as CorpusFichier['reglesAnon'][string] | undefined
  return JSON.stringify([regle?.id, regle?.entite, regle?.pseudos])
}
const sources = (s: InstantaneOperationTheme) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined }))
class InventaireTropGrand extends Error {}

/** Publie la définition puis les seules copies consenties, sans compensation ni verrouillage intégral. */
export class RenommagesAnonWebDAV {
  private readonly journal: JournalRenommageAnonWebDAV
  private readonly destination: string
  private readonly retenus = new Map<string, Verrou>()
  private enCours = false
  private miroirIncomplet = false
  constructor(private readonly deps: Dependances) {
    this.destination = empreinteCorrespondance(deps.client.config.baseUrl.replace(/\/+$/, ''))
    this.journal = new JournalRenommageAnonWebDAV(deps.dirLocal, this.destination)
  }
  get occupe() { return this.enCours }
  cibleProtegee(id: string): boolean {
    const suivi = this.lireSuivi()
    return !!suivi && (suivi.cibles.some((c) => c.id === id && c.etat === 'a-faire') || (suivi.bilan.nouvellesCibles ?? []).includes(id))
  }
  exigerMiroirComplet(): void {
    if (this.miroirIncomplet) throw new Error('Le renommage est acquis mais le miroir reste incomplet. Rouvrez le corpus, sans rejouer.')
  }
  private maintenant() { return (this.deps.maintenant ?? Date.now)() }
  private exigerLibre() {
    if (this.enCours) throw new Error('Un renommage WebDAV est déjà en cours.')
    if (this.miroirIncomplet) throw new Error('Le renommage est acquis mais le miroir reste incomplet. Rouvrez le corpus, sans rejouer.')
  }
  private exigerSansSession(ids: string[]) {
    if (this.deps.sessionsLocales().some((id) => ids.includes(id))) throw new Error('Fermez la session locale ou récupérable de cette cible, puis recalculez la reprise.')
  }
  lireSuivi(): SuiviRenommageAnon | null {
    const j = this.journal.lire()
    if (!j || j.termine) return null
    return { operationId: j.operationId, fournisseur: 'webdav', demande: structuredClone(j.demande), bilan: this.bilan(j), indeterminee: !!j.envoi,
      cibles: j.cibles.map((c) => ({ id: c.id, etat: c.etat, ...(c.motif ? { motif: c.motif } : {}) })) }
  }
  private bilan(j: LotRenommageWebDAV): BilanRenommageAnon {
    return { annotations: j.acquis.reduce((n, c) => n + c.annotations, 0), incluses: j.acquis.reduce((n, c) => n + c.incluses, 0),
      entretiens: new Set(j.acquis.map((c) => c.id)).size, definitionModifiee: j.definitionConfirmee,
      operationId: j.operationId, statut: j.envoi ? 'indetermine' : j.termine ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat === 'a-faire').map((c) => ({ id: c.id, motif: c.motif ?? 'Cible restant à publier.' })),
      nouvellesCibles: [...j.nouvellesCibles], ciblesRetirees: [...new Set(j.retirees)], ...(j.motif ? { motif: j.motif } : {}) }
  }
  async instantane(): Promise<InstantaneOperationTheme> {
    this.exigerLibre()
    if (this.lireSuivi()) throw new Error('Un lot de renommage reste à reprendre. Relisez son suivi avant un nouveau renommage.')
    return this.lireInventaire()
  }
  private async lireInventaire(maintenir?: () => Promise<void>): Promise<InstantaneOperationTheme> {
    await maintenir?.()
    const premier = await this.lire('corpus.crp')
    const corpus = this.corpus(premier.contenu)
    exigerAbsenceDissociationWebDAV(corpus)
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    let octets = Buffer.byteLength(premier.contenu)
    if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire du renommage dépasse 64 Mio.')
    for (const [id, membre] of Object.entries(corpus.membership)) {
      await maintenir?.()
      const titre = membre.titre ?? id
      try {
        if (!idImportWebDAVSain(id)) throw new Error()
        const source = await this.lire(`entretiens/${id}.json`)
        octets += Buffer.byteLength(source.contenu)
        if (octets > 64 * 1024 * 1024) throw new InventaireTropGrand('L’inventaire du renommage dépasse 64 Mio.')
        const avant = this.entretien(source.contenu)
        const data = this.deps.store.adapterEntretienOperationTheme(structuredClone(avant))
        entretiens.push({ id, titre, ok: true, avant, data })
      } catch (e) {
        if (e instanceof InventaireTropGrand) throw e
        entretiens.push({ id, titre, ok: false, motif: 'Entretien publié indisponible ou non pris en charge.' })
      }
    }
    await maintenir?.()
    const dernier = await this.lire('corpus.crp')
    if (premier.etag !== dernier.etag || premier.contenu !== dernier.contenu) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez le renommage.')
    return { corpus, entretiens }
  }
  private verifierRegle(j: LotRenommageWebDAV, corpus: CorpusFichier) {
    exigerAbsenceDissociationWebDAV(corpus)
    if (signature(corpus.reglesAnon?.[j.demande.regleId]) !== signature(j.definitionConfirmee ? j.regleApres : j.corpusAvant.reglesAnon[j.demande.regleId])) {
      throw new Error('La définition du lot a changé. Aucun remplacement ni poursuite forcée autorisé.')
    }
  }
  /** La préparation renvoyée reste privée jusqu’à un nouvel aperçu et un nouveau consentement. */
  async preparerReprise(operationId: string) {
    this.exigerLibre()
    const j = this.exigerLot(operationId)
    this.enCours = true
    try {
      if (j.envoi) {
        const id = /^entretiens\/([^/]+)\.json$/.exec(j.envoi.chemin)?.[1]
        await this.avecVerrous(id ? [id] : [], async (maintenir) => {
          await maintenir()
          const lecture = await this.lire(j.envoi!.chemin)
          // Une relecture de l’original ne prouve pas qu’un PUT incertain a été refusé.
          if (lecture.contenu !== j.envoi!.apres) throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
          this.confirmer(j, lecture.etag)
        })
      }
      const instantane = await this.lireInventaire()
      this.verifierRegle(j, instantane.corpus)
      const corpusPublie = structuredClone(instantane.corpus)
      instantane.corpus.reglesAnon[j.demande.regleId] = { ...structuredClone(j.corpusAvant.reglesAnon[j.demande.regleId]),
        categorie: instantane.corpus.reglesAnon[j.demande.regleId].categorie }
      return { instantane, corpusPublie, demande: structuredClone(j.demande), operationId: j.operationId }
    } finally { this.enCours = false }
  }
  async appliquer(preparation: PreparationRenommageDistant): Promise<BilanRenommageAnon> {
    this.exigerLibre()
    if (preparation.store !== this.deps.store) throw new Error('Le corpus a changé. Recalculez le renommage.')
    let j = preparation.reprise ? this.exigerLot(preparation.reprise) : undefined
    if (j?.envoi) throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
    if (j && JSON.stringify(j.demande) !== JSON.stringify(preparation.demande)) throw new Error('La demande ne correspond pas au lot à reprendre.')
    if (!j && this.lireSuivi()) throw new Error('Un lot de renommage reste à reprendre. Relisez son suivi.')
    this.enCours = true
    try {
      await this.avecVerrous([], async (maintenir, garantir) => {
        const frais = await this.lireInventaire(maintenir)
        if (empreinteCorrespondance(frais.corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez le renommage.')
        if (j) this.verifierRegle(j, frais.corpus)
        const virtuel = structuredClone(frais.corpus)
        virtuel.reglesAnon[preparation.demande.regleId] = structuredClone(preparation.corpusAvant.reglesAnon[preparation.demande.regleId])
        const inventaire = inventorierRenommageAnon(virtuel, sources(frais), preparation.demande, j ? [preparation.demande.nouveauPseudo] : [])
        if (!inventaire.faisable) throw new Error('L’inventaire présente des sources ou décisions à résoudre. Recalculez avant de publier.')
        for (const e of inventaire.entretiens.filter((e) => e.renommages)) {
          const prevue = preparation.cibles.find((c) => c.id === e.id)
          const consentis = prevue?.avant.annotations.filter((a) => prevue.apres.annotations.find((b) => b.id === a.id)?.pseudo !== a.pseudo).map((a) => a.id).sort()
          if (!prevue || JSON.stringify(e.usages.filter((u) => u.renomme).map((u) => u.annotationId).sort()) !== JSON.stringify(consentis)) {
            throw new Error('De nouveaux usages sont apparus depuis l’aperçu. Recalculez et confirmez les nouvelles cibles.')
          }
        }
        const definition = preparerRenommageAnon({ ...virtuel, membership: {} }, [], preparation.demande)
        if (!j && !definition.bilan.definitionModifiee) return
        if (!j) j = { version: 1, destination: this.destination, operationId: `renommage-${randomUUID()}`, demande: structuredClone(preparation.demande),
          corpusAvant: structuredClone(virtuel), regleApres: definition.inventaire.apres, definitionConfirmee: false,
          cibles: [], nouvellesCibles: [], retirees: [], acquis: [], termine: false }
        j.corpusAvant.reglesAnon[j.demande.regleId] = structuredClone(virtuel.reglesAnon[j.demande.regleId])
        j.regleApres = definition.inventaire.apres
        if (preparation.reprise) {
          const retirees = j.cibles.filter((c) => c.etat === 'a-faire' && (!Object.hasOwn(virtuel.membership, c.id)
            || inventaire.entretiens.some((e) => e.id === c.id && !e.renommages)))
          j.retirees.push(...retirees.map((c) => c.id))
          j.cibles = j.cibles.filter((c) => !retirees.includes(c))
        }
        for (const c of preparation.cibles) {
          j.cibles = j.cibles.filter((ancienne) => ancienne.id !== c.id)
          j.cibles.push({ id: c.id, avant: JSON.stringify(c.avant), apres: JSON.stringify(c.apres), annotations: c.annotations, incluses: c.incluses, etat: 'a-faire' })
          j.corpusAvant.membership[c.id] = structuredClone(preparation.corpusAvant.membership[c.id])
        }
        delete j.motif
        j.nouvellesCibles = []
        this.journal.ecrire(j)
        if (!j.definitionConfirmee) {
          await maintenir()
          const source = await this.lire('corpus.crp')
          const corpus = this.corpus(source.contenu)
          if (empreinteCorrespondance(corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé avant publication. Recalculez la reprise.')
          j.corpusAvant = structuredClone(corpus)
          corpus.reglesAnon[j.demande.regleId] = structuredClone(j.regleApres)
          await this.publier(j, { chemin: 'corpus.crp', avant: source.contenu, apres: this.serialiser(corpus, source.contenu), etagAvant: source.etag }, garantir)
        }
      })
      if (!j) return { annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: false, statut: 'termine' }
      for (const c of j.cibles.filter((c) => c.etat === 'a-faire')) {
        try {
          await this.avecVerrous([c.id], async (maintenir, garantir) => {
            await maintenir()
            const sourceCorpus = await this.lire('corpus.crp')
            const corpus = this.corpus(sourceCorpus.contenu)
            this.verifierRegle(j!, corpus)
            if (!Object.hasOwn(corpus.membership, c.id)) throw new Error('La cible ne fait plus partie du corpus.')
            const source = await this.lire(`entretiens/${c.id}.json`)
            if (empreinteCorrespondance(this.entretien(source.contenu)) !== empreinteCorrespondance(JSON.parse(c.avant))) throw new Error('La cible a changé. Recalculez la reprise, aucun écrasement autorisé.')
            const apres = JSON.parse(c.apres) as EntretienFichier
            apres.lastModified = new Date(this.maintenant()).toISOString()
            c.avant = source.contenu
            c.apres = this.serialiser(apres, source.contenu)
            const gardeCorpus = await this.lire('corpus.crp')
            if (gardeCorpus.contenu !== sourceCorpus.contenu || gardeCorpus.etag !== sourceCorpus.etag) throw new Error('Le corpus a changé avant le PUT de la cible.')
            await this.publier(j!, { chemin: `entretiens/${c.id}.json`, avant: c.avant, apres: c.apres, etagAvant: source.etag }, garantir)
          })
        } catch (e) {
          if (j.envoi || this.miroirIncomplet) throw e
          c.motif = 'Cible indisponible, tenue, modifiée ou droit perdu. Recalculez la reprise.'
          this.journal.ecrire(j)
        }
      }
      await this.avecVerrous([], async (maintenir) => {
        const final = await this.lireInventaire(maintenir)
        this.verifierRegle(j!, final.corpus)
        final.corpus.reglesAnon[j!.demande.regleId] = structuredClone(j!.corpusAvant.reglesAnon[j!.demande.regleId])
        const controle = inventorierRenommageAnon(final.corpus, sources(final), j!.demande, [j!.demande.nouveauPseudo])
        j!.nouvellesCibles = controle.entretiens.filter((e) => e.renommages && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
        if (!controle.faisable) j!.motif = 'Le contrôle final est incomplet ou divergent. Relisez les sources avant de reprendre.'
        j!.termine = controle.faisable && !controle.renommages && j!.cibles.every((c) => c.etat === 'confirme')
        this.journal.ecrire(j!)
      })
      return this.bilan(j)
    } catch (e) {
      if (!j) throw e
      j.motif = this.miroirIncomplet ? 'Une publication est acquise mais le miroir reste incomplet. Rouvrez le corpus, sans rejouer.'
        : j.envoi ? 'Une publication reste indéterminée ; aucun rejeu ni libération automatique des verrous.'
          : 'Le lot reste incomplet. Relisez les versions, droits et cibles avant de reprendre.'
      this.journal.ecrire(j)
      return this.bilan(j)
    } finally { this.enCours = false }
  }
  private exigerLot(id: string): LotRenommageWebDAV {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.termine) throw new Error('Lot de renommage absent ou déjà terminé.')
    return j
  }
  private async publier(j: LotRenommageWebDAV, envoi: EnvoiRenommageWebDAV, garantir: () => void) {
    const frais = await this.lire(envoi.chemin)
    if (frais.contenu !== envoi.avant || frais.etag !== envoi.etagAvant) throw new Error('La source a changé avant publication ; aucun écrasement autorisé.')
    garantir()
    j.envoi = envoi
    this.journal.ecrire(j)
    try { garantir() } catch (e) {
      delete j.envoi
      this.journal.ecrire(j)
      throw e
    }
    let etag: string | null
    try { etag = await this.deps.client.putTexte(envoi.chemin, envoi.apres, { ifMatch: envoi.etagAvant }) } catch (e) {
      if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
        delete j.envoi
        this.journal.ecrire(j)
        throw new Error('Le serveur a refusé le PUT du renommage.')
      }
      const relu = await this.lire(envoi.chemin)
      if (relu.contenu !== envoi.apres) throw new Error('Publication indéterminée ; aucun rejeu autorisé.')
      etag = relu.etag
    }
    // Même un succès HTTP doit correspondre à l’intention avant de valider le journal.
    const relu = await this.lire(envoi.chemin)
    if (relu.contenu !== envoi.apres || !etagImportWebDAVFort(relu.etag)) throw new Error('Publication non confirmée.')
    etag = relu.etag
    this.confirmer(j, etag)
  }
  private confirmer(j: LotRenommageWebDAV, etag: string) {
    const envoi = j.envoi!
    if (envoi.chemin === 'corpus.crp') j.definitionConfirmee = true
    else {
      const c = j.cibles.find((c) => `entretiens/${c.id}.json` === envoi.chemin)!
      c.etat = 'confirme'
      delete c.motif
      j.acquis.push({ id: c.id, annotations: c.annotations, incluses: c.incluses })
    }
    delete j.envoi
    this.journal.ecrire(j)
    try { this.deps.miroir(envoi.chemin, envoi.apres, etag) } catch {
      this.miroirIncomplet = true
      throw new Error('Le miroir du renommage reste incomplet.')
    }
  }
  private async avecVerrous<T>(ids: string[], action: (maintenir: () => Promise<void>, garantir: () => void) => Promise<T>): Promise<T> {
    this.exigerSansSession(ids)
    const verrous: Verrou[] = []
    try {
      for (const demande of [this.deps.verrouCorpus(), ...ids.map((id) => this.deps.verrouEntretien(id))]) {
        this.exigerSansSession(ids)
        const existant = this.retenus.get(demande.chemin)
        const v = existant ?? demande
        if (!existant) {
          const debut = this.maintenant()
          const acquisition = await v.provider.acquerir(v.chemin)
          if (!acquisition.ok) throw new Error('Un verrou reste tenu. Aucune libération ni reprise forcée autorisée.')
          v.echeance = debut + acquisition.dureeGarantieMs
        }
        verrous.push(v)
      }
      const maintenir = async () => {
        this.exigerSansSession(ids)
        for (const v of verrous) {
          const debut = this.maintenant()
          const preuve = await v.provider.battre(v.chemin)
          if (!preuve.ok) throw new Error('Le verrou du renommage a été perdu.')
          v.echeance = debut + preuve.dureeGarantieMs
        }
      }
      const garantir = () => {
        this.exigerSansSession(ids)
        if (verrous.some((v) => this.maintenant() + 60_000 >= (v.echeance ?? 0))) throw new Error('Un verrou va expirer ; aucun PUT envoyé.')
      }
      await maintenir()
      garantir()
      return await action(maintenir, garantir)
    } finally {
      const incertain = !!this.journal.lire()?.envoi
      for (const v of verrous.reverse()) {
        if (incertain) this.retenus.set(v.chemin, v)
        else {
          this.retenus.delete(v.chemin)
          await v.provider.liberer(v.chemin).catch(() => {})
        }
      }
    }
  }
  private async lire(chemin: string): Promise<{ contenu: string; etag: string }> {
    const source = await this.deps.client.getTexteAvecEtag(chemin)
    if (!etagImportWebDAVFort(source.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort : renommage refusé.')
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
      if (data?.formatVersion !== FORMAT_VERSION) throw new Error()
      return data
    } catch { throw new Error('L’entretien publié n’est pas pris en charge.') }
  }
  private serialiser(data: unknown, avant: string) {
    const contenu = JSON.stringify(data, null, 2)
    // Nextcloud peut conserver un ETag à mtime et taille identiques.
    return Buffer.byteLength(contenu) === Buffer.byteLength(avant) ? `${contenu}\n` : contenu
  }
}
