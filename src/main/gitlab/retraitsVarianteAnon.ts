import { createHash, randomUUID } from 'node:crypto'
import type { CorpusFichier } from '../../shared/format'
import { exigerAbsenceSuppressionAnon } from '../../shared/corpus/barriereSuppressionAnon'
import { lireBarriereRetraitVarianteAnon } from '../../shared/corpus/barriereRetraitVarianteAnon'
import { inventorierRetraitVarianteAnon, preparerRetraitVarianteAnon, type ApercuRetraitVarianteAnon, type BilanRetraitVarianteDistant, type DemandeRetraitVarianteAnon, type SuiviRetraitVarianteAnon } from '../../shared/corpus/retraitVarianteAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { normaliserRacineGitLab } from '../distant/coffre'
import { CorrespondancesGitLab } from './correspondances'
import type { OptionsTransactionsGitLab } from './transactions'
import { cleRessourceBailGitLab, cheminBailDepuisEmpreinteGitLab, type DroitsEditionGitLab } from './bailGitLab'
import { MARGE_RENOUVELLEMENT_GITLAB_MS } from './parametresSession'
import { MAX_ACTIONS_PUBLICATION, verifierBornesAnticipees, type ActionPlanGitLab } from './publication'
import { ReconciliateurPublicationGitLab } from './journalPublication'
import { verifierReferencesDefinitions } from './referencesDefinitions'
import { empreinteDestinationRetraitVarianteGitLab, JournalRetraitVarianteAnonGitLab, barriereRetraitGitLab, type LotRetraitVarianteGitLab, type PublicationRetraitVarianteGitLab } from './journalRetraitVarianteAnon'

export type EtapeContexteRetraitVariante = 'preparation' | 'application' | 'suivi'
export const MAX_CIBLES_RETRAIT_VARIANTE_GITLAB = MAX_ACTIONS_PUBLICATION - 2
const refusCibles = `La finalisation gardée est limitée à ${MAX_CIBLES_RETRAIT_VARIANTE_GITLAB} entretiens modifiés par lot avec le publieur actuel. Aucun découpage implicite autorisé.`
type Instantane = Awaited<ReturnType<CorrespondancesGitLab['lireInstantane']>>
const sources = (s: Instantane) => s.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined }))
const egaux = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)

/** Remplace les choix consentis avant de retirer leur variante de la définition partagée. */
export class RetraitsVarianteAnonGitLab {
  private readonly lecteur: CorrespondancesGitLab
  private readonly racine: string
  private readonly journal: JournalRetraitVarianteAnonGitLab
  private readonly destination: string
  private readonly cache = new Map<string, { expire: number; instantane: Instantane; plan: ReturnType<typeof preparerRetraitVarianteAnon>; reprise?: string }>()
  private enCours = false
  private miroirIncomplet = false
  constructor(private readonly options: OptionsTransactionsGitLab, private readonly sessions: () => string[], private readonly maintenant = Date.now,
    private readonly verifierContexte: (etape: EtapeContexteRetraitVariante) => void = () => {}) {
    this.lecteur = new CorrespondancesGitLab(options, sessions)
    this.racine = normaliserRacineGitLab(options.destination.racine)
    this.destination = empreinteDestinationRetraitVarianteGitLab(options.destination.id, options.destination.branche, this.racine)
    this.journal = new JournalRetraitVarianteAnonGitLab(options.store.repertoire, this.destination, this.racine)
    this.miroirIncomplet = this.journal.lire()?.miroirComplet === false
  }
  lireSuivi(): SuiviRetraitVarianteAnon | null {
    const j = this.journal.lire()
    return j && (!j.varianteRetiree || !j.miroirComplet) ? { ...this.bilan(j), demande: structuredClone(j.demande) } : null
  }
  oublierApercu(token: string): void { this.cache.delete(token) }
  viderApercus(): void { this.cache.clear() }
  ciblesApercu(token: string): string[] {
    const p = this.cache.get(token)
    if (!p || p.expire <= this.maintenant()) throw new Error('Le bilan de retrait a expiré. Recalculez-le.')
    return p.plan.entretiens.map((e) => e.id)
  }
  cibleProtegee(id: string): boolean {
    const j = this.journal.lire()
    return !!j && (j.nouvellesCibles.includes(id) || j.cibles.some((c) => c.id === id && c.etat === 'a-faire'))
  }
  cheminsProteges(): string[] {
    const j = this.journal.lire()
    return j ? [...new Set([...j.nouvellesCibles, ...j.cibles.filter((c) => c.etat === 'a-faire' || !j.miroirComplet).map((c) => c.id)])].map((id) => `entretiens/${id}.json`) : []
  }
  publicationDuLotSeule(): boolean {
    const j = this.journal.lire(), entrees = this.options.journal?.lister() ?? [], p = j?.publication
    if (!j || !p || !entrees.length) return false
    return entrees.every((e) => {
      if (e.operationId !== p.operationId) return false
      const baux = new Set(e.droits.map((d) => cheminBailDepuisEmpreinteGitLab(d.resourceHash)))
      const donnees = e.actions.filter((a) => !baux.has(a.file_path)), modifications = donnees.filter((a) => a.action !== 'chmod')
      if (modifications.length !== 1 || modifications[0].action !== 'update' || modifications[0].file_path !== p.chemin
        || modifications[0].contentSha256 !== createHash('sha256').update(p.contenu).digest('hex') || modifications[0].contentOctets !== Buffer.byteLength(p.contenu)) return false
      const gardes = p.phase === 'entretien' ? [this.chemin('corpus.json')]
        : p.phase === 'retrait' ? j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(p.corpusAvant!.membership, c.id)).map((c) => this.chemin(`entretiens/${c.id}.json`)) : []
      return egaux(donnees.filter((a) => a.action === 'chmod').map((a) => a.file_path).sort(), gardes.sort())
    })
  }
  exigerMiroirComplet(id?: string): void {
    const j = this.journal.lire()
    if ((this.miroirIncomplet || j?.miroirComplet === false) && (id === undefined || j?.cibles.some((c) => c.id === id))) throw new Error('Le miroir du retrait reste incomplet. Relisez son suivi sans rejouer.')
  }
  preparer(demande: DemandeRetraitVarianteAnon): Promise<ApercuRetraitVarianteAnon> {
    return this.options.file.executer(async () => {
      this.verifierContexte('preparation')
      this.exigerDisponible()
      if (this.lireSuivi()) throw new Error('Un retrait de variante reste à reprendre.')
      const s = await this.lecteur.lireInstantane()
      exigerAbsenceSuppressionAnon(s.corpus)
      return this.memoriser(s, demande)
    })
  }
  preparerReprise(operationId: string): Promise<ApercuRetraitVarianteAnon> {
    return this.options.file.executer(async () => {
      this.verifierContexte('preparation')
      const j = this.exigerLot(operationId)
      this.exigerDisponible()
      if (j.publication) throw new Error('Relisez le suivi avant de préparer une reprise. Aucun nouvel envoi autorisé.')
      if (j.varianteRetiree) throw new Error('La variante est déjà retirée. Relisez le suivi sans rejouer.')
      const s = await this.lecteur.lireInstantane()
      this.verifierCorpus(j, s.corpus); this.verifierAcquis(j, s)
      return this.memoriser(s, j.demande, j.operationId)
    })
  }
  relireSuivi(operationId: string): Promise<BilanRetraitVarianteDistant> { return this.options.file.executer(() => this.relireSuiviDansFile(operationId)) }
  /** L’appelant possède déjà la file du contexte pendant un tirage. */
  async relireSuiviDansFile(operationId: string): Promise<BilanRetraitVarianteDistant> {
    this.verifierContexte('suivi')
    const j = this.exigerLot(operationId)
    if (this.enCours) throw new Error('Un retrait de variante est déjà en cours.')
    const installer = !!j.publication || !j.miroirComplet
    if (j.publication) await this.reconcilier(j)
    this.exigerPublicationLibre()
    if (installer) this.installerSourcesActuelles(await this.lecteur.lireInstantane(), j)
    return this.bilan(j)
  }
  private installerSourcesActuelles(s: Instantane, j: LotRetraitVarianteGitLab): void {
    try {
      this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `miroir-${randomUUID()}`, corpusAvant: this.options.store.ouvrir(), corpusApres: s.corpus, entretiens: [] })
      for (const c of j.cibles.filter((c) => c.etat === 'confirme' && !this.sessionPresente(c.id))) {
        const source = s.entretiens.find((e) => e.id === c.id)
        if (source && !source.ok) throw new Error('Source acquise indisponible.')
        if (source?.ok) this.options.store.installerEntretienDistant(c.id, source.avant)
      }
      j.miroirComplet = true; delete j.motif; this.journal.ecrire(j); this.miroirIncomplet = false
    } catch {
      j.miroirComplet = false; this.miroirIncomplet = true; this.journal.ecrire(j)
      throw new Error('Le miroir du retrait reste incomplet. Relisez le suivi sans rejouer.')
    }
  }
  private corpusDePreparation(corpus: CorpusFichier): CorpusFichier { const copie = structuredClone(corpus); delete copie.retraitVarianteAnon; return copie }
  private memoriser(s: Instantane, demande: DemandeRetraitVarianteAnon, reprise?: string): ApercuRetraitVarianteAnon {
    this.verifierContexte('preparation')
    const j = reprise ? this.exigerLot(reprise) : null
    if (j) this.verifierCorpus(j, s.corpus)
    else exigerAbsenceSuppressionAnon(s.corpus)
    const plan = preparerRetraitVarianteAnon(this.corpusDePreparation(s.corpus), sources(s), demande)
    if (j && plan.entretiens.some((e) => j.cibles.some((c) => c.id === e.id && c.etat === 'confirme'))) throw new Error('De nouveaux choix de la variante retirée figurent dans un entretien déjà traité. Aucun second remplacement implicite.')
    const ciblesRetirees = j?.cibles.filter((c) => c.etat === 'a-faire' && !plan.entretiens.some((e) => e.id === c.id)).map((c) => c.id) ?? []
    const applicationDisponible = this.nombreCiblesFinales(j, s.corpus, plan.entretiens.map((e) => e.id)) <= MAX_CIBLES_RETRAIT_VARIANTE_GITLAB
    const apercu: ApercuRetraitVarianteAnon = { ...structuredClone(plan.inventaire), token: randomUUID(), lecture: 'gitlab', applicationDisponible, ciblesRetirees,
      ...(reprise ? { reprise } : {}), ...(applicationDisponible ? {} : { motifIndisponible: refusCibles }) }
    if (Buffer.byteLength(JSON.stringify(apercu)) > 8 * 1024 * 1024) throw new Error('Le bilan de retrait dépasse 8 Mio.')
    for (const [t, p] of this.cache) if (p.expire <= this.maintenant()) this.cache.delete(t)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(apercu.token, { expire: this.maintenant() + 300_000, instantane: structuredClone(s), plan, reprise }); return apercu
  }
  appliquer(token: string, confirmee: boolean): Promise<BilanRetraitVarianteDistant> {
    const p = this.cache.get(token); this.cache.delete(token)
    if (!p || p.expire <= this.maintenant()) return Promise.reject(new Error('Le bilan de retrait a expiré. Recalculez-le.'))
    if (confirmee !== true) return Promise.reject(new Error('Confirmez explicitement le remplacement des choix liés et le retrait de la variante.'))
    return this.options.file.executer(async () => {
      this.verifierContexte('application')
      this.exigerExpiration(p.expire); this.exigerDisponible()
      let j = p.reprise ? this.exigerLot(p.reprise) : null
      if (j && (j.varianteRetiree || j.publication)) throw new Error('Relisez le suivi avant tout nouvel envoi.')
      if (!j && this.lireSuivi()) throw new Error('Un retrait de variante reste à reprendre.')
      if (this.nombreCiblesFinales(j, p.instantane.corpus, p.plan.entretiens.map((e) => e.id)) > MAX_CIBLES_RETRAIT_VARIANTE_GITLAB) throw new Error(refusCibles)
      this.enCours = true
      try {
        await this.avecBail('corpus.json', async (droit) => {
          const frais = await this.lecteur.lireInstantane(false)
          this.exigerExpiration(p.expire)
          this.verifierContexte('application')
          if (!egaux(frais.corpus, p.instantane.corpus)) throw new Error('Le corpus a changé depuis le bilan. Recalculez le retrait.')
          if (j) this.verifierCorpus(j, frais.corpus)
          else exigerAbsenceSuppressionAnon(frais.corpus)
          const controle = inventorierRetraitVarianteAnon(this.corpusDePreparation(frais.corpus), sources(frais), p.plan.inventaire.demande)
          if (!controle.faisable) throw new Error('L’inventaire publié présente des obstacles. Aucun remplacement autorisé.')
          const idsConsentis = new Set(p.plan.entretiens.map((e) => e.id))
          if (controle.entretiens.some((e) => e.annotations && !idsConsentis.has(e.id))) throw new Error('De nouveaux usages exigent un nouveau bilan et consentement.')
          if (!j) j = { version: 1, destination: this.destination, operationId: `retrait-variante-${randomUUID()}`, demande: structuredClone(p.plan.inventaire.demande),
            corpusAvant: this.corpusDePreparation(frais.corpus), barriereConfirmee: false, varianteRetiree: false, miroirComplet: true, cibles: [], nouvellesCibles: [] }
          for (const c of j.cibles.filter((c) => c.etat === 'a-faire' && !idsConsentis.has(c.id))) c.etat = 'retire'
          for (const e of p.plan.entretiens) {
            j.cibles = j.cibles.filter((c) => c.id !== e.id)
            Object.defineProperty(j.corpusAvant.membership, e.id, { value: structuredClone(frais.corpus.membership[e.id]), writable: true, enumerable: true, configurable: true })
            const corpus = { ...structuredClone(j.corpusAvant), membership: { [e.id]: j.corpusAvant.membership[e.id] } }
            const plan = preparerRetraitVarianteAnon(corpus, [{ id: e.id, titre: e.id, data: e.avant }], j.demande)
            j.cibles.push({ ...structuredClone(e), bilan: plan.bilan, etat: 'a-faire' })
          }
          j.nouvellesCibles = []; delete j.motif; this.journal.ecrire(j)
          if (!j.barriereConfirmee) {
            this.exigerExpiration(p.expire)
            const apres = structuredClone(frais.corpus); apres.retraitVarianteAnon = barriereRetraitGitLab(j)
            await this.publier(j, { phase: 'barriere', chemin: frais.sourceCorpus.chemin, corpusAvant: frais.corpus, contenu: JSON.stringify(apres, null, 2) },
              [{ action: 'update', chemin: frais.sourceCorpus.chemin, commitId: frais.sourceCorpus.commitId, contenu: JSON.stringify(apres, null, 2) }], droit)
          }
        })
        for (const cible of j!.cibles.filter((c) => c.etat === 'a-faire')) {
          try {
            this.exigerSansSession(cible.id)
            await this.avecBail('corpus.json', (droitCorpus) => this.avecBail(`entretiens/${cible.id}.json`, async (droit) => {
              this.exigerSansSession(cible.id)
              const sha = await this.options.depot.resoudreTete(this.options.destination.branche), corpusSource = await this.lire('corpus.json', sha), corpus = JSON.parse(corpusSource.contenu) as CorpusFichier
              this.verifierCorpus(j!, corpus)
              if (!Object.hasOwn(corpus.membership, cible.id)) throw new Error('L’entretien ne fait plus partie du corpus. Recalculez la reprise.')
              const source = await this.lire(`entretiens/${cible.id}.json`, sha)
              if (!egaux(JSON.parse(source.contenu), cible.avant)) throw new Error('L’entretien a changé. Recalculez sans écraser ses modifications.')
              cible.apres.lastModified = new Date(this.maintenant()).toISOString()
              verifierReferencesDefinitions(cible.apres, corpus, cible.avant)
              await this.maintenir(droitCorpus); this.exigerSansSession(cible.id)
              await this.publier(j!, { phase: 'entretien', id: cible.id, chemin: source.chemin, contenu: JSON.stringify(cible.apres, null, 2) }, [
                { action: 'update', chemin: source.chemin, commitId: source.commitId, contenu: JSON.stringify(cible.apres, null, 2) },
                { action: 'garde', chemin: corpusSource.chemin, commitId: corpusSource.commitId, executable: corpusSource.executable },
              ], droit, droitCorpus)
            }))
          } catch (e) {
            if (j!.publication || this.miroirIncomplet) throw e
            cible.motif = e instanceof Error ? e.message : 'Entretien indisponible.'; this.journal.ecrire(j!)
          }
        }
        await this.avecBail('corpus.json', async (droit) => {
          const final = await this.lecteur.lireInstantane(false)
          this.verifierCorpus(j!, final.corpus); this.verifierAcquis(j!, final)
          const controle = inventorierRetraitVarianteAnon(this.corpusDePreparation(final.corpus), sources(final), j!.demande)
          j!.nouvellesCibles = controle.entretiens.filter((e) => e.annotations && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
          if (!controle.faisable || controle.entretiens.some((e) => e.annotations) || j!.cibles.some((c) => c.etat === 'a-faire')) {
            j!.motif = 'Des entretiens restent à traiter ou à vérifier. Les deux variantes sont conservées.'; this.journal.ecrire(j!); return
          }
          const apres = structuredClone(final.corpus)
          apres.reglesAnon[j!.demande.regleAvant.id] = structuredClone(preparerRetraitVarianteAnon({ ...this.corpusDePreparation(final.corpus), membership: {} }, [], j!.demande).inventaire.apres)
          delete apres.retraitVarianteAnon
          const gardes: ActionPlanGitLab[] = []
          for (const c of j!.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(final.corpus.membership, c.id))) {
            const source = await this.lire(`entretiens/${c.id}.json`, final.sha), attendu = final.entretiens.find((e) => e.id === c.id)
            if (!attendu?.ok || !egaux(JSON.parse(source.contenu), attendu.avant)) throw new Error('Une source du contrôle final a changé. Aucun retrait de variante autorisé.')
            gardes.push({ action: 'garde', chemin: source.chemin, commitId: source.commitId, executable: source.executable })
          }
          await this.publier(j!, { phase: 'retrait', chemin: final.sourceCorpus.chemin, corpusAvant: final.corpus, contenu: JSON.stringify(apres, null, 2) },
            [{ action: 'update', chemin: final.sourceCorpus.chemin, commitId: final.sourceCorpus.commitId, contenu: JSON.stringify(apres, null, 2) }, ...gardes], droit)
        })
        return this.bilan(j!)
      } catch (e) {
        if (!j) throw e
        j.motif = this.miroirIncomplet ? 'Les changements sont enregistrés mais votre copie reste à actualiser.'
          : j.publication ? 'Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.' : e instanceof Error ? e.message : 'Le retrait reste incomplet.'
        this.journal.ecrire(j); return this.bilan(j)
      } finally { this.enCours = false }
    })
  }
  private nombreCiblesFinales(j: LotRetraitVarianteGitLab | null, corpus: CorpusFichier, ids: string[]): number {
    return new Set([...ids, ...(j?.cibles.filter((c) => c.etat === 'confirme').map((c) => c.id) ?? [])].filter((id) => Object.hasOwn(corpus.membership, id))).size
  }
  private verifierAcquis(j: LotRetraitVarianteGitLab, s: Instantane): void {
    for (const c of j.cibles.filter((c) => c.etat === 'confirme' && Object.hasOwn(s.corpus.membership, c.id))) {
      const source = s.entretiens.find((e) => e.id === c.id)
      if (!source?.ok) throw new Error('Un entretien déjà traité est indisponible. Aucun remplacement ni restauration forcés.')
      const corpus = { ...this.corpusDePreparation(s.corpus), membership: { [c.id]: s.corpus.membership[c.id] } }
      const preuve = inventorierRetraitVarianteAnon(corpus, [{ id: c.id, titre: c.id, data: source.avant }], j.demande)
      if (!preuve.faisable || preuve.bilan.annotations) throw new Error('Un entretien déjà traité porte de nouveaux choix ou des données invalides. Aucun second remplacement ni restauration forcés.')
    }
  }
  private verifierCorpus(j: LotRetraitVarianteGitLab, corpus: CorpusFichier): void {
    const b = lireBarriereRetraitVarianteAnon(corpus)
    if (corpus.dissociationAnon !== undefined || corpus.suppressionAnon !== undefined || !egaux(corpus.reglesAnon?.[j.demande.regleAvant.id], j.demande.regleAvant)
      || (j.barriereConfirmee ? !egaux(b, barriereRetraitGitLab(j)) : b !== null)) throw new Error('La règle ou sa protection a changé. Aucune poursuite forcée autorisée.')
  }
  private bilan(j: LotRetraitVarianteGitLab): BilanRetraitVarianteDistant {
    const b: BilanRetraitVarianteDistant = { annotations: 0, anonymisees: 0, exceptions: 0, incluses: 0, entretiens: 0, varianteRetiree: j.varianteRetiree,
      operationId: j.operationId, miroirIncomplet: !j.miroirComplet, statut: j.publication ? 'indetermine' : j.varianteRetiree && j.miroirComplet ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat === 'a-faire').map((c) => ({ id: c.id, motif: c.motif ?? 'Entretien restant à modifier.' })), nouvellesCibles: [...j.nouvellesCibles], ...(j.motif ? { motif: j.motif } : {}) }
    for (const c of j.cibles.filter((c) => c.etat === 'confirme')) for (const k of ['annotations', 'anonymisees', 'exceptions', 'incluses', 'entretiens'] as const) b[k] += c.bilan[k]
    return b
  }
  private exigerExpiration(expire: number) { if (expire <= this.maintenant()) throw new Error('Le bilan de retrait a expiré. Recalculez-le.') }
  private exigerPublicationLibre(): void { if (this.enCours || !this.options.journal || this.options.journal.lister().length) throw new Error('Une publication reste à réconcilier avant le retrait.') }
  private exigerDisponible(): void { this.exigerPublicationLibre(); this.exigerMiroirComplet() }
  private exigerLot(id: string): LotRetraitVarianteGitLab { const j = this.journal.lire(); if (!j || j.operationId !== id) throw new Error('Le retrait n’existe plus.'); return j }
  private async publier(j: LotRetraitVarianteGitLab, intention: Omit<PublicationRetraitVarianteGitLab, 'operationId'>, actions: ActionPlanGitLab[], droit: DroitsEditionGitLab, droitCorpus?: DroitsEditionGitLab): Promise<void> {
    const operationId = `retrait-variante-${randomUUID()}`, droits = droitCorpus ? [droitCorpus, droit] : [droit]
    verifierBornesAnticipees(this.options.destination.branche, `Sonal ${operationId}`, actions, droits.length)
    for (const d of droits) await this.maintenir(d)
    j.publication = { ...structuredClone(intention), operationId }; this.journal.ecrire(j)
    try {
      for (const d of droits) await this.maintenir(d)
      this.verifierContexte('application')
      if (intention.phase === 'entretien') this.exigerSansSession(intention.id!)
    } catch (e) { delete j.publication; this.journal.ecrire(j); throw e }
    const resultat = await this.options.publication.publierSousDroits({ operationId, nature: 'transaction-corpus', actions }, droits)
    if (resultat.statut === 'indetermine') throw new Error('Publication indéterminée.')
    if (resultat.statut === 'refuse') { delete j.publication; this.journal.ecrire(j); throw new Error('La publication a été refusée. Vérifiez les droits et relisez le bilan.') }
    this.confirmer(j)
  }
  private confirmer(j: LotRetraitVarianteGitLab, installer = true): void {
    const p = j.publication!
    if (p.phase === 'barriere') j.barriereConfirmee = true
    else if (p.phase === 'retrait') { j.varianteRetiree = true; delete j.motif }
    else { const c = j.cibles.find((c) => c.id === p.id)!; c.etat = 'confirme'; delete c.motif }
    delete j.publication; j.miroirComplet = false; this.miroirIncomplet = true; this.journal.ecrire(j)
    if (!installer) return
    try {
      if (p.phase === 'entretien') this.options.store.installerEntretienDistant(p.id!, JSON.parse(p.contenu))
      else this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `miroir-${p.operationId}`, corpusAvant: this.options.store.ouvrir(), corpusApres: JSON.parse(p.contenu), entretiens: [] })
      j.miroirComplet = true; this.journal.ecrire(j); this.miroirIncomplet = false
    } catch { throw new Error('Les changements sont enregistrés mais le miroir reste incomplet.') }
  }
  private async reconcilier(j: LotRetraitVarianteGitLab): Promise<void> {
    const p = j.publication!, publications = this.options.journal!, entree = publications.lireSiPresent(p.operationId)
    if (entree) {
      if (!this.publicationDuLotSeule()) throw new Error('Le journal de publication ne correspond pas au remplacement prévu. Aucun rejeu autorisé.')
      const resultat = await new ReconciliateurPublicationGitLab(this.options.depot, publications).reconcilier(entree)
      if (resultat.statut !== 'confirme') throw new Error('La publication reste indéterminée. L’original ou un historique vide ne prouvent pas un refus ; aucun rejeu autorisé.')
    }
    const commits = await this.options.depot.rechercherCommits(this.options.destination.branche, `Sonal ${p.operationId}`), exacts = commits.filter((c) => c.title === `Sonal ${p.operationId}`)
    if (exacts.length !== 1) throw new Error('La publication reste indéterminée. Un commit unique est nécessaire ; aucun rejeu autorisé.')
    const fichier = await this.options.depot.lireFichier(p.chemin, exacts[0].id)
    if (!fichier || fichier.contenu !== p.contenu) throw new Error('Le commit retrouvé ne prouve pas le remplacement prévu. Aucun rejeu autorisé.')
    if (entree) {
      for (const droit of entree.droits) await this.options.coordination.rendreBailAcquis(cheminBailDepuisEmpreinteGitLab(droit.resourceHash), droit.generation)
      publications.supprimer(entree.operationId)
    }
    this.confirmer(j, false)
  }
  private sessionPresente(id: string): boolean { return this.sessions().some((s) => s === id || s === `entretiens/${id}.json` || s.endsWith(`:${id}`)) }
  private exigerSansSession(id: string): void { if (this.sessionPresente(id)) throw new Error('Fermez la session locale ou récupérable de cet entretien puis recalculez la reprise.') }
  private async avecBail<T>(relatif: string, action: (droit: DroitsEditionGitLab) => Promise<T>): Promise<T> {
    const acquisition = await this.options.coordination.acquireRessource(cleRessourceBailGitLab(this.options.destination.branche, this.chemin(relatif)))
    if (!acquisition.ok) throw new Error('La ressource est tenue par un autre poste. Aucun forçage autorisé.')
    const bail = this.options.coordination.snapshot(acquisition.droit)
    try { await this.maintenir(acquisition.droit); return await action(acquisition.droit) }
    finally {
      try { if (!this.options.journal?.lister().some((e) => e.droits.some((d) => d.resourceHash === bail.resourceHash && d.generation === bail.generation))) await this.options.coordination.rendreBailAcquis(bail.chemin, bail.generation) }
      catch { /* Un droit non rendu ne peut pas annuler les remplacements acquis. */ }
    }
  }
  private async maintenir(droit: DroitsEditionGitLab): Promise<void> {
    const etat = this.options.coordination.snapshot(droit)
    if (etat.suspendu || (etat.expireLe - this.maintenant() < MARGE_RENOUVELLEMENT_GITLAB_MS && !await this.options.coordination.renouveler(droit))) throw new Error('Le droit de retrait a été perdu ou reste à réconcilier.')
  }
  private async lire(relatif: string, sha: string) { const source = await this.options.depot.lireFichier(this.chemin(relatif), sha); if (!source) throw new Error('Un fichier publié est absent. Aucun écrasement autorisé.'); return source }
  private chemin(relatif: string) { return this.racine ? `${this.racine}/${relatif}` : relatif }
}
