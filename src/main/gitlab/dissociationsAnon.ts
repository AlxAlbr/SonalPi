import { randomUUID } from 'node:crypto'
import type { CorpusFichier } from '../../shared/format'
import { validerMemoireLocale } from '../../shared/entretien/anon/definitionsLocales'
import { inventorierDissociationAnon, preparerDissociationAnon, type ApercuDissociationAnon, type BilanDissociationDistant, type DemandeDissociationAnon, type SuiviDissociationAnon } from '../../shared/corpus/dissociationAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { normaliserRacineGitLab } from '../distant/coffre'
import { CorrespondancesGitLab } from './correspondances'
import type { OptionsTransactionsGitLab } from './transactions'
import { cleRessourceBailGitLab, cheminBailDepuisEmpreinteGitLab, type DroitsEditionGitLab } from './bailGitLab'
import { MARGE_RENOUVELLEMENT_GITLAB_MS } from './parametresSession'
import { MAX_ACTIONS_PUBLICATION, verifierBornesAnticipees, type ActionPlanGitLab } from './publication'
import { ReconciliateurPublicationGitLab } from './journalPublication'
import { verifierReferencesDefinitions } from './referencesDefinitions'
import { empreinteDestinationDissociationGitLab, JournalDissociationAnonGitLab, type LotDissociationGitLab, type PublicationDissociationGitLab } from './journalDissociationAnon'

export interface ApercuDissociationGitLab extends ApercuDissociationAnon {
  lecture: 'gitlab'; ciblesRetirees: string[]
}
export type BilanDissociationGitLab = BilanDissociationDistant
export const MAX_CIBLES_DISSOCIATION_GITLAB = MAX_ACTIONS_PUBLICATION - 2
const refusCibles = `La finalisation gardée est limitée à ${MAX_CIBLES_DISSOCIATION_GITLAB} entretiens transférés par lot avec le publieur actuel. Aucune publication supplémentaire ni découpage implicite autorisé.`
type Instantane = Awaited<ReturnType<CorrespondancesGitLab['lireInstantane']>>
const sources = (s: Instantane) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined }))
const egaux = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)

/** Transfère les décisions sous une barrière publiée, puis retire la règle après un scan complet. */
export class DissociationsAnonGitLab {
  private readonly lecteur: CorrespondancesGitLab
  private readonly racine: string
  private readonly destination: string
  private readonly journal: JournalDissociationAnonGitLab
  private readonly cache = new Map<string, { expire: number; instantane: Instantane; plan: ReturnType<typeof preparerDissociationAnon>; reprise?: string }>()
  private enCours = false
  private miroirIncomplet = false
  constructor(private readonly options: OptionsTransactionsGitLab, private readonly sessions: () => string[], private readonly maintenant = Date.now) {
    this.lecteur = new CorrespondancesGitLab(options, sessions)
    this.racine = normaliserRacineGitLab(options.destination.racine)
    this.destination = empreinteDestinationDissociationGitLab(options.destination.id, options.destination.branche, this.racine)
    this.journal = new JournalDissociationAnonGitLab(options.store.repertoire, this.destination, this.racine)
  }
  lireSuivi(): SuiviDissociationAnon | null {
    const j = this.journal.lire()
    return j && !j.regleRetiree ? { ...this.bilan(j), demande: structuredClone(j.demande) } : null
  }
  oublierApercu(token: string): void { this.cache.delete(token) }
  viderApercus(): void { this.cache.clear() }
  ciblesApercu(token: string): string[] {
    const p = this.cache.get(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('L’aperçu de dissociation a expiré. Recalculez-le.')
    return p.plan.entretiens.map((e) => e.id)
  }
  publicationDuLotSeule(): boolean {
    const j = this.journal.lire(), entrees = this.options.journal?.lister() ?? []
    return !!j?.publication && entrees.length > 0 && entrees.every((e) => e.operationId === j.publication!.operationId)
  }
  exigerMiroirComplet(id?: string): void {
    if (this.miroirIncomplet && (id === undefined || this.journal.lire()?.cibles.some((c) => c.id === id))) {
      throw new Error('Le miroir de dissociation reste incomplet. Rouvrez le corpus sans rejouer.')
    }
  }
  cheminsProteges(): string[] {
    return this.journal.lire()?.cibles.filter((c) => c.etat === 'a-faire').map((c) => `entretiens/${c.id}.json`) ?? []
  }
  relireSuivi(operationId: string): Promise<BilanDissociationGitLab> {
    return this.options.file.executer(() => this.relireSuiviDansFile(operationId))
  }
  /** L’appelant possède déjà la file du contexte, notamment pendant un tirage. */
  async relireSuiviDansFile(operationId: string): Promise<BilanDissociationGitLab> {
    const j = this.journal.lire()
    if (!j || j.operationId !== operationId) throw new Error('Le lot de dissociation n’existe plus.')
    const aReconcilier = !!j.publication
    if (j.publication) await this.reconcilier(j)
    this.exigerDisponible()
    if (aReconcilier) {
      this.miroirIncomplet = true
      try {
        this.installerSourcesActuelles(await this.lecteur.lireInstantane(), j)
        this.miroirIncomplet = false
      } catch { throw new Error('Le miroir de dissociation reste incomplet. Rouvrez le corpus sans rejouer.') }
    }
    return this.bilan(j)
  }
  cibleProtegee(id: string): boolean {
    return this.journal.lire()?.cibles.some((c) => c.id === id && c.etat === 'a-faire') ?? false
  }
  preparer(demande: DemandeDissociationAnon): Promise<ApercuDissociationGitLab> {
    return this.options.file.executer(async () => {
      this.exigerDisponible()
      if (this.lireSuivi()) throw new Error('Un lot de dissociation reste à reprendre.')
      return this.memoriser(await this.lecteur.lireInstantane(), demande)
    })
  }
  preparerReprise(operationId: string): Promise<ApercuDissociationGitLab> {
    return this.options.file.executer(async () => {
      const j = this.exigerLot(operationId)
      if (j.publication) await this.reconcilier(j)
      this.exigerDisponible()
      if (j.regleRetiree) throw new Error('La dissociation est déjà publiée. Aucun rejeu autorisé.')
      const s = await this.lecteur.lireInstantane()
      this.verifierCorpus(j, s.corpus)
      this.verifierMemoiresAcquises(j, s)
      this.installerSourcesActuelles(s, j)
      return this.memoriser(s, j.demande, j.operationId)
    })
  }
  /** Installe des sources actuelles, jamais les anciennes images acquises du journal. */
  private installerSourcesActuelles(s: Instantane, j: LotDissociationGitLab): void {
    try {
      this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `miroir-${randomUUID()}`,
        corpusAvant: this.options.store.ouvrir(), corpusApres: s.corpus, entretiens: [] })
      for (const c of j.cibles.filter((c) => c.etat === 'confirme' && !this.sessionPresente(c.id))) {
        const source = s.entretiens.find((e) => e.id === c.id)
        if (source && !source.ok) throw new Error('Source acquise indisponible.')
        if (source?.ok) this.options.store.installerEntretienDistant(c.id, source.avant)
      }
    } catch { this.miroirIncomplet = true; throw new Error('Le miroir de dissociation reste incomplet. Rouvrez le corpus sans rejouer.') }
  }
  private memoriser(s: Instantane, demande: DemandeDissociationAnon, reprise?: string): ApercuDissociationGitLab {
    if (!reprise && s.corpus.dissociationAnon !== undefined) throw new Error('Une dissociation publiée est déjà engagée. Aucun nouveau lot autorisé.')
    const plan = preparerDissociationAnon(s.corpus, sources(s), demande)
    const j = reprise ? this.exigerLot(reprise) : null
    if (j && plan.entretiens.some((e) => j.cibles.some((c) => c.id === e.id && c.etat === 'confirme'))) {
      throw new Error('De nouveaux liens figurent dans une cible acquise. Examinez leur provenance avant tout nouveau transfert.')
    }
    const ciblesRetirees = j?.cibles.filter((c) => c.etat === 'a-faire' && !plan.entretiens.some((e) => e.id === c.id)).map((c) => c.id) ?? []
    const token = randomUUID()
    const applicationDisponible = this.nombreCiblesFinales(j, s.corpus, plan.entretiens.map((e) => e.id)) <= MAX_CIBLES_DISSOCIATION_GITLAB
    const apercu: ApercuDissociationGitLab = { ...structuredClone(plan.inventaire), token, lecture: 'gitlab', applicationDisponible, ...(applicationDisponible ? {} : { motifIndisponible: refusCibles }), ciblesRetirees, ...(reprise ? { reprise } : {}) }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('L’aperçu de dissociation dépasse 8 Mio.')
    for (const [t, p] of this.cache) if (p.expire <= this.maintenant()) this.cache.delete(t)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(token, { expire: this.maintenant() + 300_000, instantane: structuredClone(s), plan, reprise })
    return apercu
  }
  appliquer(token: string, confirmee: boolean): Promise<BilanDissociationGitLab> {
    const p = this.cache.get(token)
    this.cache.delete(token)
    if (!p || p.expire <= this.maintenant()) return Promise.reject(new Error('L’aperçu de dissociation a expiré. Recalculez-le.'))
    if (confirmee !== true) return Promise.reject(new Error('Confirmez explicitement la dissociation globale et ses définitions locales complètes.'))
    return this.options.file.executer(async () => {
      this.exigerDisponible()
      let j = p.reprise ? this.exigerLot(p.reprise) : null
      if (!j && this.lireSuivi()) throw new Error('Un lot de dissociation reste à reprendre.')
      if (this.nombreCiblesFinales(j, p.instantane.corpus, p.plan.entretiens.map((e) => e.id)) > MAX_CIBLES_DISSOCIATION_GITLAB) throw new Error(refusCibles)
      this.enCours = true
      try {
        await this.avecBail('corpus.json', async (droit) => {
          const frais = await this.lecteur.lireInstantane(false)
          if (!egaux(frais.corpus, p.instantane.corpus)) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez la dissociation.')
          if (j) this.verifierCorpus(j, frais.corpus)
          const controle = inventorierDissociationAnon(frais.corpus, sources(frais), p.plan.inventaire.demande)
          if (!controle.faisable) throw new Error('L’inventaire publié présente des obstacles. Aucun transfert autorisé.')
          const idsConsentis = new Set(p.plan.entretiens.map((e) => e.id))
          if (controle.entretiens.some((e) => e.annotations && !idsConsentis.has(e.id))) throw new Error('De nouveaux usages exigent un nouvel aperçu et consentement.')
          if (!j) {
            j = { version: 1, destination: this.destination, operationId: `dissociation-${randomUUID()}`,
              demande: structuredClone(p.plan.inventaire.demande), corpusAvant: structuredClone(frais.corpus),
              barriereConfirmee: false, regleRetiree: false, cibles: [], nouvellesCibles: [] }
          }
          for (const c of j.cibles.filter((c) => c.etat === 'a-faire' && !idsConsentis.has(c.id))) c.etat = 'retire'
          for (const e of p.plan.entretiens) {
            j.cibles = j.cibles.filter((c) => c.id !== e.id)
            j.corpusAvant.membership[e.id] = structuredClone(frais.corpus.membership[e.id])
            const corpus = { ...structuredClone(j.corpusAvant), membership: { [e.id]: j.corpusAvant.membership[e.id] } }
            const plan = preparerDissociationAnon(corpus, [{ id: e.id, titre: e.id, data: e.avant }], j.demande)
            j.cibles.push({ ...structuredClone(e), bilan: plan.bilan, etat: 'a-faire' })
          }
          j.nouvellesCibles = []; delete j.motif
          this.journal.ecrire(j)
          if (!j.barriereConfirmee) {
            const apres = structuredClone(frais.corpus)
            apres.dissociationAnon = { operationId: j.operationId, regleId: j.demande.regleId }
            await this.publier(j, { phase: 'barriere', chemin: frais.sourceCorpus.chemin, corpusAvant: frais.corpus, contenu: JSON.stringify(apres, null, 2) },
              [{ action: 'update', chemin: frais.sourceCorpus.chemin, commitId: frais.sourceCorpus.commitId, contenu: JSON.stringify(apres, null, 2) }], droit)
          }
        })
        for (const cible of j!.cibles.filter((c) => c.etat === 'a-faire')) {
          try {
            this.exigerSansSession(cible.id)
            await this.avecBail('corpus.json', (droitCorpus) => this.avecBail(`entretiens/${cible.id}.json`, async (droit) => {
              this.exigerSansSession(cible.id)
              const sha = await this.options.depot.resoudreTete(this.options.destination.branche)
              const corpusSource = await this.lire('corpus.json', sha)
              const corpus = JSON.parse(corpusSource.contenu) as CorpusFichier
              this.verifierCorpus(j!, corpus)
              if (!Object.hasOwn(corpus.membership, cible.id)) throw new Error('La cible ne fait plus partie du corpus. Recalculez la reprise.')
              const source = await this.lire(`entretiens/${cible.id}.json`, sha)
              if (!egaux(JSON.parse(source.contenu), cible.avant)) throw new Error('La cible a changé. Recalculez la reprise, aucun écrasement autorisé.')
              cible.apres.lastModified = new Date().toISOString()
              verifierReferencesDefinitions(cible.apres, corpus, cible.avant)
              await this.maintenir(droitCorpus)
              this.exigerSansSession(cible.id)
              await this.publier(j!, { phase: 'entretien', id: cible.id, chemin: source.chemin, contenu: JSON.stringify(cible.apres, null, 2) }, [
                { action: 'update', chemin: source.chemin, commitId: source.commitId, contenu: JSON.stringify(cible.apres, null, 2) },
                { action: 'garde', chemin: corpusSource.chemin, commitId: corpusSource.commitId, executable: corpusSource.executable },
              ], droit)
            }))
          } catch (e) {
            if (j!.publication || this.miroirIncomplet) throw e
            cible.motif = e instanceof Error ? e.message : 'Cible indisponible.'
            this.journal.ecrire(j!)
          }
        }
        await this.avecBail('corpus.json', async (droit) => {
          const final = await this.lecteur.lireInstantane(false)
          this.verifierCorpus(j!, final.corpus)
          this.verifierMemoiresAcquises(j!, final)
          const controle = inventorierDissociationAnon(final.corpus, sources(final), j!.demande)
          j!.nouvellesCibles = controle.entretiens.filter((e) => e.annotations && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
          if (!controle.faisable || controle.entretiens.some((e) => e.annotations) || j!.cibles.some((c) => c.etat === 'a-faire')) {
            j!.motif = 'Le contrôle final reste incomplet. La règle partagée et la barrière sont conservées.'
            this.journal.ecrire(j!); return
          }
          const apres = structuredClone(final.corpus)
          delete apres.reglesAnon[j!.demande.regleId]; delete apres.dissociationAnon
          const gardes: ActionPlanGitLab[] = []
          for (const c of j!.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(final.corpus.membership, c.id))) {
            const source = await this.lire(`entretiens/${c.id}.json`, final.sha)
            const attendu = final.entretiens.find((e) => e.id === c.id)
            if (!attendu?.ok || !egaux(JSON.parse(source.contenu), attendu.avant)) throw new Error('La source du contrôle final a changé. Aucun retrait de règle autorisé.')
            gardes.push({ action: 'garde', chemin: source.chemin, commitId: source.commitId, executable: source.executable })
          }
          await this.publier(j!, { phase: 'retrait', chemin: final.sourceCorpus.chemin, corpusAvant: final.corpus, contenu: JSON.stringify(apres, null, 2) },
            [{ action: 'update', chemin: final.sourceCorpus.chemin, commitId: final.sourceCorpus.commitId, contenu: JSON.stringify(apres, null, 2) }, ...gardes], droit)
        })
        return this.bilan(j!)
      } catch (e) {
        if (!j) throw e
        j.motif = this.miroirIncomplet ? 'Une publication est acquise mais son miroir reste incomplet. Rouvrez le corpus sans rejouer.'
          : j.publication ? 'Une publication reste indéterminée. Aucun rejeu autorisé.'
            : e instanceof Error ? e.message : 'La dissociation reste incomplète.'
        this.journal.ecrire(j)
        return this.bilan(j)
      } finally { this.enCours = false }
    })
  }
  private nombreCiblesFinales(j: LotDissociationGitLab | null, corpus: CorpusFichier, ids: string[]): number {
    return new Set([...ids, ...(j?.cibles.filter((c) => c.etat === 'confirme').map((c) => c.id) ?? [])]
      .filter((id) => Object.hasOwn(corpus.membership, id))).size
  }
  /** Une déclaration acquise reste nécessaire au retrait, sans restaurer les éditions concurrentes. */
  private verifierMemoiresAcquises(j: LotDissociationGitLab, s: Instantane): void {
    for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id))) {
      const source = s.entretiens.find((e) => e.id === c.id)
      try {
        if (!source?.ok) throw new Error()
        const definitions = source.avant.definitionsAnonLocales ?? []
        validerMemoireLocale(definitions)
        if (!definitions.some((d) => egaux(d, c.apres.definitionsAnonLocales!.at(-1)))) throw new Error()
      } catch { throw new Error('Une définition locale acquise a changé ou reste indisponible. Examinez sa provenance ; aucun retrait de règle ni restauration forcée autorisé.') }
    }
  }
  private verifierCorpus(j: LotDissociationGitLab, corpus: CorpusFichier): void {
    if (!egaux(corpus.reglesAnon?.[j.demande.regleId], j.corpusAvant.reglesAnon[j.demande.regleId])
      || (j.barriereConfirmee ? !egaux(corpus.dissociationAnon, { operationId: j.operationId, regleId: j.demande.regleId }) : corpus.dissociationAnon !== undefined)) {
      throw new Error('La définition ou la barrière de dissociation a changé. Aucune poursuite forcée autorisée.')
    }
  }
  private bilan(j: LotDissociationGitLab): BilanDissociationGitLab {
    const b: BilanDissociationGitLab = { annotations: 0, anonymisees: 0, exceptions: 0, incluses: 0, entretiens: 0, definitionsLocales: 0,
      regleRetiree: j.regleRetiree, operationId: j.operationId, statut: j.publication ? 'indetermine' : j.regleRetiree ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat === 'a-faire').map((c) => ({ id: c.id, motif: c.motif ?? 'Transfert restant à publier.' })),
      nouvellesCibles: [...j.nouvellesCibles], ...(j.motif ? { motif: j.motif } : {}) }
    for (const c of j.cibles.filter((c) => c.etat === 'confirme')) {
      for (const k of ['annotations', 'anonymisees', 'exceptions', 'incluses', 'entretiens', 'definitionsLocales'] as const) b[k] += c.bilan[k]
    }
    return b
  }
  private exigerDisponible(): void {
    if (this.enCours || this.miroirIncomplet || !this.options.journal || this.options.journal.lister().length) throw new Error('Une publication ou un miroir reste à réconcilier avant la dissociation.')
  }
  private exigerLot(id: string): LotDissociationGitLab {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.regleRetiree) throw new Error('Lot de dissociation absent ou terminé.')
    return j
  }
  private async publier(j: LotDissociationGitLab, intention: Omit<PublicationDissociationGitLab, 'operationId'>, actions: ActionPlanGitLab[], droit: DroitsEditionGitLab): Promise<void> {
    const operationId = `dissociation-${randomUUID()}`
    verifierBornesAnticipees(this.options.destination.branche, `Sonal ${operationId}`, actions, 1)
    await this.maintenir(droit)
    j.publication = { ...structuredClone(intention), operationId }
    this.journal.ecrire(j)
    const resultat = await this.options.publication.publierSousDroit({ operationId, nature: 'transaction-corpus', actions }, droit)
    if (resultat.statut === 'indetermine') throw new Error('Publication indéterminée.')
    if (resultat.statut === 'refuse') {
      delete j.publication; this.journal.ecrire(j)
      throw new Error('La publication a été refusée. Recalculez la reprise après vérification des droits et versions.')
    }
    this.confirmer(j)
  }
  private confirmer(j: LotDissociationGitLab, installer = true): void {
    const p = j.publication!
    if (p.phase === 'barriere') j.barriereConfirmee = true
    else if (p.phase === 'retrait') { j.regleRetiree = true; delete j.motif }
    else { const c = j.cibles.find((c) => c.id === p.id)!; c.etat = 'confirme'; delete c.motif }
    delete j.publication
    this.journal.ecrire(j)
    if (!installer) return
    try {
      if (p.phase === 'entretien') this.options.store.installerEntretienDistant(p.id!, JSON.parse(p.contenu))
      else this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `miroir-${p.operationId}`,
        corpusAvant: this.options.store.ouvrir(), corpusApres: JSON.parse(p.contenu), entretiens: [] })
    } catch { this.miroirIncomplet = true; throw new Error('Le miroir de dissociation reste incomplet.') }
  }
  private async reconcilier(j: LotDissociationGitLab): Promise<void> {
    const p = j.publication!, publications = this.options.journal!
    const entree = publications.lireSiPresent(p.operationId)
    if (entree) {
      const resultat = await new ReconciliateurPublicationGitLab(this.options.depot, publications).reconcilier(entree)
      if (resultat.statut === 'indetermine') throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
      for (const droit of entree.droits) await this.options.coordination.rendreBailNotre(cheminBailDepuisEmpreinteGitLab(droit.resourceHash), droit.generation)
      publications.supprimer(entree.operationId)
    }
    const commits = await this.options.depot.rechercherCommits(this.options.destination.branche, `Sonal ${p.operationId}`)
    const exacts = commits.filter((c) => c.title === `Sonal ${p.operationId}`)
    if (exacts.length > 1) throw new Error('Plusieurs commits portent l’intention. Aucun rejeu autorisé.')
    if (exacts.length) {
      const fichier = await this.options.depot.lireFichier(p.chemin, exacts[0].id)
      if (!fichier || fichier.contenu !== p.contenu) throw new Error('Le commit retrouvé ne prouve pas l’intention. Aucun rejeu autorisé.')
      this.confirmer(j, false)
    } else { delete j.publication; this.journal.ecrire(j) }
  }
  private sessionPresente(id: string): boolean { return this.sessions().some((s) => s === id || s === `entretiens/${id}.json` || s.endsWith(`:${id}`)) }
  private exigerSansSession(id: string): void { if (this.sessionPresente(id)) throw new Error('Fermez la session locale ou récupérable de cette cible puis recalculez la reprise.') }
  private async avecBail<T>(relatif: string, action: (droit: DroitsEditionGitLab) => Promise<T>): Promise<T> {
    const acquisition = await this.options.coordination.acquireRessource(cleRessourceBailGitLab(this.options.destination.branche, this.chemin(relatif)))
    if (!acquisition.ok) throw new Error('La ressource est tenue par un autre poste. Aucun forçage autorisé.')
    const bail = this.options.coordination.snapshot(acquisition.droit)
    try { await this.maintenir(acquisition.droit); return await action(acquisition.droit) }
    finally {
      try {
        if (!this.options.journal?.lister().some((e) => e.droits.some((d) => d.resourceHash === bail.resourceHash && d.generation === bail.generation))) {
          await this.options.coordination.rendreBailNotre(bail.chemin, bail.generation)
        }
      } catch { /* Un bail non rendu expire sans annuler les publications acquises. */ }
    }
  }
  private async maintenir(droit: DroitsEditionGitLab): Promise<void> {
    const etat = this.options.coordination.snapshot(droit)
    if (etat.suspendu || (etat.expireLe - Date.now() < MARGE_RENOUVELLEMENT_GITLAB_MS && !await this.options.coordination.renouveler(droit))) throw new Error('Le droit de dissociation a été perdu ou reste à réconcilier.')
  }
  private async lire(relatif: string, sha: string) {
    const source = await this.options.depot.lireFichier(this.chemin(relatif), sha)
    if (!source) throw new Error('Une source publiée est absente. Aucun écrasement autorisé.')
    return source
  }
  private chemin(relatif: string) { return this.racine ? `${this.racine}/${relatif}` : relatif }
}
