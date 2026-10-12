import { createHash, randomUUID } from 'node:crypto'
import type { FichierGitLab, DroitsEditionGitLab } from './bailGitLab'
import { cleRessourceBailGitLab } from './bailGitLab'
import { CorrespondancesGitLab } from './correspondances'
import type { OptionsTransactionsGitLab } from './transactions'
import { normaliserRacineGitLab } from '../distant/coffre'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import type { PreparationRenommageGitLab } from '../renommagesAnon'
import { inventorierRenommageAnon, preparerRenommageAnon, type BilanRenommageAnon, type SuiviRenommageAnon } from '../../shared/corpus/renommageAnon'
import type { CorpusFichier, EntretienFichier, RegleAnon } from '../../shared/format'
import { verifierBornesAnticipees, type ActionPlanGitLab } from './publication'
import { MARGE_RENOUVELLEMENT_GITLAB_MS } from './parametresSession'
import { JournalRenommageAnonGitLab, type LotRenommageGitLab, type PublicationRenommageGitLab } from './journalRenommageAnon'
import { ReconciliateurPublicationGitLab } from './journalPublication'
import { cheminBailDepuisEmpreinteGitLab } from './bailGitLab'
import { exigerAbsenceDissociationGitLab, verifierReferencesDefinitions } from './referencesDefinitions'

const signature = (r: RegleAnon | undefined) => JSON.stringify(r ? [r.id, r.entite, r.pseudos] : null)

/** Publie la définition puis les seules cibles consenties, par baux courts et reprise. */
export class RenommagesAnonGitLab {
  private readonly lecteur: CorrespondancesGitLab
  private readonly racine: string
  private readonly journal: JournalRenommageAnonGitLab
  private readonly destination: string
  private miroirIncomplet = false
  private enCours = false
  constructor(private readonly options: OptionsTransactionsGitLab, private readonly sessions: () => string[]) {
    this.lecteur = new CorrespondancesGitLab(options, sessions)
    this.racine = normaliserRacineGitLab(options.destination.racine)
    this.destination = createHash('sha256').update(`${options.destination.id}\0${options.destination.branche}\0${this.racine}`).digest('hex')
    this.journal = new JournalRenommageAnonGitLab(options.store.repertoire, this.destination, this.racine)
  }
  exigerReconcilie(): void {
    if (!this.options.journal || this.options.journal.lister().length) throw new Error('Une publication GitLab reste à réconcilier. Recalculez la reprise du lot.')
    this.exigerMiroirComplet()
  }
  exigerMiroirComplet(id?: string): void {
    if (this.miroirIncomplet && (id === undefined || this.journal.lire()?.cibles.some((c) => c.id === id))) {
      throw new Error('Le renommage est publié mais son miroir reste incomplet. Rouvrez le corpus ; ne rejouez pas le renommage.')
    }
  }
  sessionLocalePresente(id: string): boolean {
    return this.sessions().some((s) => s === id || s === `entretiens/${id}.json` || s.endsWith(`:${id}`))
  }
  publicationDuLotSeule(): boolean {
    const j = this.journal.lire(), entrees = this.options.journal?.lister() ?? []
    return !!j?.publication && entrees.length > 0 && entrees.every((e) => e.operationId === j.publication!.operationId)
  }
  cibleProtegee(id: string): boolean {
    const j = this.journal.lire()
    return !!j && !j.termine && j.cibles.some((c) => c.id === id && c.etat !== 'confirme')
  }
  disponible(): boolean {
    const j = this.journal.lire()
    return !this.enCours && !this.miroirIncomplet && !!this.options.journal && !this.options.journal.lister().length && (!j || j.termine)
  }
  lireSuivi(): SuiviRenommageAnon | null {
    const j = this.journal.lire()
    return j && !j.termine ? { operationId: j.operationId, demande: structuredClone(j.demande), bilan: this.bilan(j),
      indeterminee: !!j.publication, cibles: j.cibles.map(({ id, etat, motif }) => ({ id, etat, ...(motif ? { motif } : {}) })) } : null
  }
  async instantane() {
    this.exigerReconcilie()
    if (this.lireSuivi()) throw new Error('Un lot de renommage reste à reprendre. Relisez son suivi avant un nouveau renommage.')
    return this.lecteur.instantane()
  }
  preparerReprise(operationId: string) {
    return this.options.file.executer(async () => {
      if (this.enCours) throw new Error('Attendez la fin du lot de renommage.')
      const j = this.exigerLot(operationId)
      if (j.publication) await this.reconcilier(j)
      this.exigerReconcilie()
      const instantane = await this.lecteur.lireInstantane()
      this.verifierRegle(j, instantane.corpus)
      const corpusPublie = structuredClone(instantane.corpus)
      try {
        this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: `miroir-${randomUUID()}`,
          corpusAvant: this.options.store.ouvrir(), corpusApres: corpusPublie, entretiens: [] })
        for (const cible of j.cibles.filter((c) => c.etat === 'confirme' && !this.sessionLocalePresente(c.id))) {
          const source = instantane.entretiens.find((e) => e.id === cible.id)
          if (source?.ok) this.options.store.installerEntretienDistant(cible.id, source.avant)
        }
      } catch { this.miroirIncomplet = true; throw new Error('Le miroir du renommage reste incomplet. Rouvrez le corpus sans rejouer.') }
      instantane.corpus.reglesAnon[j.demande.regleId] = { ...structuredClone(corpusPublie.reglesAnon[j.demande.regleId]),
        pseudos: [...j.corpusAvant.reglesAnon[j.demande.regleId].pseudos] }
      return { instantane, corpusPublie, operationId: j.operationId, demande: structuredClone(j.demande) }
    })
  }
  appliquer(preparation: PreparationRenommageGitLab): Promise<BilanRenommageAnon> {
    return this.options.file.executer(async () => {
      this.exigerReconcilie()
      if (this.enCours) throw new Error('Un lot de renommage est déjà en cours.')
      if (preparation.store !== this.options.store) throw new Error('Le corpus a changé. Recalculez le renommage.')
      const precedent = this.journal.lire()
      if (!preparation.reprise && precedent && !precedent.termine) throw new Error('Un lot de renommage reste à reprendre.')
      let j: LotRenommageGitLab | null = preparation.reprise ? this.exigerLot(preparation.reprise) : null
      if (j && empreinteCorrespondance(j.demande) !== empreinteCorrespondance(preparation.demande)) throw new Error('La reprise ne correspond pas au lot.')
      this.enCours = true
      try {
        await this.avecBail('corpus.json', async (droit) => {
          const frais = await this.lecteur.lireInstantane(false)
          exigerAbsenceDissociationGitLab(frais.corpus)
          if (empreinteCorrespondance(frais.corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé depuis l’inventaire. Recalculez le renommage.')
          if (j) this.verifierRegle(j, frais.corpus)
          const virtuel = structuredClone(frais.corpus)
          virtuel.reglesAnon[preparation.demande.regleId] = structuredClone(preparation.corpusAvant.reglesAnon[preparation.demande.regleId])
          const inventaire = inventorierRenommageAnon(virtuel, frais.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined })), preparation.demande, j ? [j.demande.nouveauPseudo] : [])
          if (!inventaire.faisable) throw new Error('L’inventaire présente des sources ou décisions à résoudre. Recalculez avant de publier.')
          const prevues = new Map(preparation.cibles.map((c) => [c.id, c]))
          for (const e of inventaire.entretiens.filter((e) => e.renommages)) {
            const prevue = prevues.get(e.id)
            const ids = e.usages.filter((u) => u.renomme).map((u) => u.annotationId).sort()
            const consentis = prevue?.avant.annotations.filter((a) => a.type === 'anon' && a.regle === preparation.demande.regleId
              && a.etat !== 'exception' && prevue.apres.annotations.find((b) => b.id === a.id)?.pseudo !== a.pseudo).map((a) => a.id).sort()
            if (!prevue || JSON.stringify(ids) !== JSON.stringify(consentis)) throw new Error('De nouveaux usages sont apparus depuis l’aperçu. Recalculez et confirmez les nouvelles cibles.')
          }
          const definition = preparerRenommageAnon({ ...virtuel, membership: {} }, [], preparation.demande)
          if (!j && !definition.bilan.definitionModifiee) return
          if (!j) {
            j = { version: 1, destination: this.destination, operationId: `renommage-${randomUUID()}`, demande: structuredClone(preparation.demande),
              corpusAvant: structuredClone(preparation.corpusAvant), regleApres: definition.inventaire.apres,
              definitionConfirmee: false, cibles: [], nouvellesCibles: [], termine: false, acquis: [], retirees: [] }
          }
          j.corpusAvant.reglesAnon[j.demande.regleId] = structuredClone(virtuel.reglesAnon[j.demande.regleId])
          j.regleApres = structuredClone(definition.inventaire.apres)
          if (preparation.reprise) {
            const sansUsage = j.cibles.filter((c) => c.etat !== 'confirme'
              && (!Object.hasOwn(virtuel.membership, c.id) || inventaire.entretiens.some((e) => e.id === c.id && !e.renommages)))
            j.retirees.push(...sansUsage.map((c) => c.id))
            j.cibles = j.cibles.filter((c) => !sansUsage.includes(c))
          }
          for (const c of preparation.cibles) {
            j.cibles = j.cibles.filter((ancienne) => ancienne.id !== c.id)
            j.cibles.push({ ...structuredClone(c), etat: 'a-faire' })
            j.corpusAvant.membership[c.id] = structuredClone(preparation.corpusAvant.membership[c.id])
          }
          j.motif = undefined
          j.nouvellesCibles = []
          this.journal.ecrire(j)
          if (!j.definitionConfirmee) {
            const source = await this.lire('corpus.json', this.options.destination.branche)
            const corpus = JSON.parse(source.contenu) as CorpusFichier
            if (empreinteCorrespondance(corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé avant la publication. Recalculez la reprise.')
            corpus.reglesAnon[j.demande.regleId] = structuredClone(j.regleApres)
            await this.publier(j, { phase: 'definition', chemin: source.chemin, contenu: JSON.stringify(corpus, null, 2) },
              [{ action: 'update', chemin: source.chemin, contenu: JSON.stringify(corpus, null, 2), commitId: source.commitId }], droit)
          }
        })
        if (!j) return { annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: false, statut: 'termine' }
        for (const cible of j.cibles.filter((c) => c.etat !== 'confirme')) {
          try {
            this.exigerSansSession(cible.id)
            await this.avecBail(`entretiens/${cible.id}.json`, async (droit) => {
              this.exigerSansSession(cible.id)
              const sha = await this.options.depot.resoudreTete(this.options.destination.branche)
              const corpusSource = await this.lire('corpus.json', sha)
              const corpus = JSON.parse(corpusSource.contenu) as CorpusFichier
              this.verifierRegle(j!, corpus)
              if (!Object.hasOwn(corpus.membership, cible.id)) throw new Error('La cible ne fait plus partie du corpus.')
              const source = await this.lire(`entretiens/${cible.id}.json`, sha)
              const avant = JSON.parse(source.contenu) as EntretienFichier
              if (empreinteCorrespondance(avant) !== empreinteCorrespondance(cible.avant)) throw new Error('La cible a changé depuis l’inventaire. Recalculez la reprise, aucun écrasement autorisé.')
              cible.apres.lastModified = new Date().toISOString()
              verifierReferencesDefinitions(cible.apres, corpus, avant)
              await this.maintenir(droit)
              this.exigerSansSession(cible.id)
              await this.publier(j!, { phase: 'entretien', id: cible.id, chemin: source.chemin, contenu: JSON.stringify(cible.apres, null, 2) }, [
                { action: 'update', chemin: source.chemin, commitId: source.commitId, contenu: JSON.stringify(cible.apres, null, 2) },
                { action: 'garde', chemin: corpusSource.chemin, commitId: corpusSource.commitId, executable: corpusSource.executable },
              ], droit)
            })
          } catch (e) {
            if (j.publication || this.miroirIncomplet) throw e
            cible.motif = e instanceof Error ? e.message : 'Cible indisponible.'
            this.journal.ecrire(j)
          }
        }
        const final = await this.lecteur.lireInstantane(false)
        this.verifierRegle(j, final.corpus)
        final.corpus.reglesAnon[j.demande.regleId] = structuredClone(j.corpusAvant.reglesAnon[j.demande.regleId])
        const controle = inventorierRenommageAnon(final.corpus, final.entretiens.map((e) => ({ id: e.id, titre: e.titre, data: e.ok ? e.avant : undefined })), j.demande, [j.demande.nouveauPseudo])
        j.nouvellesCibles = controle.entretiens.filter((e) => e.renommages && !j!.cibles.some((c) => c.id === e.id && c.etat === 'a-faire')).map((e) => e.id)
        if (!controle.faisable) j.motif = 'Le contrôle final est incomplet ou divergent. Relisez les sources avant de reprendre.'
        j.termine = controle.faisable && !controle.renommages && j.cibles.every((c) => c.etat === 'confirme')
        this.journal.ecrire(j)
        return this.bilan(j)
      } catch (e) {
        if (!j) throw e
        j.motif = this.miroirIncomplet ? 'Une publication est acquise mais le miroir reste incomplet. Rouvrez le corpus, sans rejouer.'
          : j.publication ? 'Une publication reste à réconcilier. Recalculez la reprise sans rejouer le commit.'
            : 'Le lot reste incomplet. Relisez les versions, droits et cibles avant de reprendre.'
        this.journal.ecrire(j)
        return this.bilan(j)
      } finally { this.enCours = false }
    })
  }
  private verifierRegle(j: LotRenommageGitLab, corpus: CorpusFichier): void {
    exigerAbsenceDissociationGitLab(corpus)
    const attendue = j.definitionConfirmee ? j.regleApres : j.corpusAvant.reglesAnon[j.demande.regleId]
    if (signature(corpus.reglesAnon[j.demande.regleId]) !== signature(attendue)) throw new Error('La définition du lot a changé. Aucun remplacement ni poursuite forcée autorisé.')
  }
  private bilan(j: LotRenommageGitLab): BilanRenommageAnon {
    return { annotations: j.acquis.reduce((n, c) => n + c.annotations, 0), incluses: j.acquis.reduce((n, c) => n + c.incluses, 0),
      entretiens: new Set(j.acquis.map((c) => c.id)).size, definitionModifiee: j.definitionConfirmee, operationId: j.operationId,
      statut: j.publication ? 'indetermine' : j.termine ? 'termine' : 'partiel',
      differes: j.cibles.filter((c) => c.etat !== 'confirme').map((c) => ({ id: c.id, motif: c.motif ?? 'Cible restant à publier.' })),
      nouvellesCibles: [...j.nouvellesCibles], ciblesRetirees: [...new Set(j.retirees)], ...(j.motif ? { motif: j.motif } : {}) }
  }
  private exigerLot(id: string): LotRenommageGitLab {
    const j = this.journal.lire()
    if (!j || j.operationId !== id || j.termine) throw new Error('Lot de renommage absent ou déjà terminé.')
    return j
  }
  private async publier(j: LotRenommageGitLab, intention: Omit<PublicationRenommageGitLab, 'operationId'>, actions: ActionPlanGitLab[], droit: DroitsEditionGitLab): Promise<void> {
    const operationId = `${this.options.nouvelleOperation?.() ?? 'renommage'}-${randomUUID()}`
    verifierBornesAnticipees(this.options.destination.branche, `Sonal ${operationId}`, actions, 1)
    await this.maintenir(droit)
    j.publication = { ...intention, operationId }
    this.journal.ecrire(j)
    const resultat = await this.options.publication.publierSousDroit({ operationId, nature: 'transaction-corpus', actions }, droit)
    if (resultat.statut === 'indetermine') throw new Error('Publication indéterminée.')
    if (resultat.statut === 'refuse') {
      delete j.publication
      this.journal.ecrire(j)
      throw new Error('La publication est refusée. Vérifiez les droits, baux et versions avant la reprise.')
    }
    this.confirmer(j)
  }
  private confirmer(j: LotRenommageGitLab, installer = true): void {
    const p = j.publication!
    if (p.phase === 'definition') j.definitionConfirmee = true
    else {
      const c = j.cibles.find((c) => c.id === p.id)!
      c.etat = 'confirme'; delete c.motif
      j.acquis.push({ id: c.id, annotations: c.annotations, incluses: c.incluses })
    }
    delete j.publication
    this.journal.ecrire(j)
    if (!installer) return
    try {
      if (p.phase === 'definition') this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: p.operationId,
        corpusAvant: this.options.store.ouvrir(), corpusApres: JSON.parse(p.contenu), entretiens: [] })
      else this.options.store.installerEntretienDistant(p.id!, JSON.parse(p.contenu))
    } catch { this.miroirIncomplet = true; throw new Error('Le miroir du renommage reste incomplet.') }
  }
  private async reconcilier(j: LotRenommageGitLab): Promise<void> {
    const p = j.publication!, publications = this.options.journal!
    const entree = publications.lireSiPresent(p.operationId)
    if (entree) {
      const resultat = await new ReconciliateurPublicationGitLab(this.options.depot, publications).reconcilier(entree)
      if (resultat.statut === 'indetermine') throw new Error('La publication reste indéterminée. Aucun rejeu autorisé.')
      for (const droit of entree.droits) await this.options.coordination.rendreBailNotre(cheminBailDepuisEmpreinteGitLab(droit.resourceHash), droit.generation)
      publications.supprimer(entree.operationId)
    }
    const commits = await this.options.depot.rechercherCommits(this.options.destination.branche, `Sonal ${p.operationId}`)
    const commit = commits.find((c) => c.title === `Sonal ${p.operationId}`)
    if (commit) {
      const fichier = await this.options.depot.lireFichier(p.chemin, commit.id)
      if (!fichier || fichier.contenu !== p.contenu) throw new Error('Le commit retrouvé ne prouve pas l’intention. Aucun rejeu autorisé.')
      this.confirmer(j, false)
    } else { delete j.publication; this.journal.ecrire(j) }
  }
  private exigerSansSession(id: string): void {
    if (this.sessionLocalePresente(id)) throw new Error('Fermez la session locale ou récupérable de cette cible, puis recalculez la reprise.')
  }
  private async avecBail<T>(relatif: string, action: (droit: DroitsEditionGitLab) => Promise<T>): Promise<T> {
    const acquisition = await this.options.coordination.acquireRessource(cleRessourceBailGitLab(this.options.destination.branche, this.chemin(relatif)))
    if (!acquisition.ok) throw new Error('La ressource à modifier est tenue par un autre poste.')
    const bail = this.options.coordination.snapshot(acquisition.droit)
    try { await this.maintenir(acquisition.droit); return await action(acquisition.droit) }
    finally {
      try {
        const inconnu = this.options.journal?.lister().some((e) => e.droits.some((d) => d.resourceHash === bail.resourceHash && d.generation === bail.generation))
        if (!inconnu) await this.options.coordination.rendreBailNotre(bail.chemin, bail.generation)
      } catch { /* Un bail non rendu expire sans changer les succès acquis. */ }
    }
  }
  private async maintenir(droit: DroitsEditionGitLab): Promise<void> {
    const etat = this.options.coordination.snapshot(droit)
    if (etat.suspendu) throw new Error('Un droit reste à réconcilier.')
    if (etat.expireLe - Date.now() < MARGE_RENOUVELLEMENT_GITLAB_MS && !await this.options.coordination.renouveler(droit)) throw new Error('Le bail du renommage a été perdu.')
  }
  private async lire(relatif: string, sha: string): Promise<FichierGitLab> {
    const fichier = await this.options.depot.lireFichier(this.chemin(relatif), sha)
    if (!fichier) throw new Error('Une source publiée est absente. Recalculez la reprise.')
    return fichier
  }
  private chemin(relatif: string) { return this.racine ? `${this.racine}/${relatif}` : relatif }
}
