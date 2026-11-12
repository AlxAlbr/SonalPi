import { randomUUID } from 'node:crypto'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { appliquerImportCorrespondances } from '../../shared/corpus/importCorrespondances'
import { appliquerCorrespondancesEntretiens } from '../../shared/corpus/importCorrespondancesEntretiens'
import type { InstantaneOperationTheme } from '../operationsThemes'
import { empreinteCorrespondance, type TablesCorrespondance } from '../tablesCorrespondance'
import { normaliserRacineGitLab } from '../distant/coffre'
import { cleRessourceBailGitLab, type DroitsEditionGitLab, type FichierGitLab } from './bailGitLab'
import { MAX_ACTIONS_PUBLICATION, verifierBornesAnticipees, type ActionPlanGitLab } from './publication'
import type { OptionsTransactionsGitLab } from './transactions'
import { exigerAbsenceDissociationGitLab } from './referencesDefinitions'

export type PreparationImportGitLab = ReturnType<TablesCorrespondance['consommerImport']>
export const MAX_ENTRETIENS_IMPORT_GITLAB = Math.floor((MAX_ACTIONS_PUBLICATION - 2) / 2)
const MAX_OCTETS_INSTANTANE = 64 * 1024 * 1024
class LimiteInstantane extends Error {}

/** Prépare le ciblage publié et applique tout le choix dans un seul commit gardé. */
export class CorrespondancesGitLab {
  private readonly racine: string
  constructor(private readonly options: OptionsTransactionsGitLab, private readonly sessionsLocales: () => string[]) {
    this.racine = normaliserRacineGitLab(options.destination.racine)
  }

  instantane(): Promise<InstantaneOperationTheme> {
    return this.options.file.executer(() => this.lireInstantane())
  }

  /** Lit le serveur sous la file déjà acquise par l’appelant. */
  async lireInstantane(controlerJournal = true): Promise<InstantaneOperationTheme & { sha: string; sourceCorpus: FichierGitLab }> {
    if (controlerJournal) this.exigerReconcilie()
    const sha = await this.options.depot.resoudreTete(this.options.destination.branche)
    const sourceCorpus = await this.lire('corpus.crp', sha)
    const corpus = this.decoderCorpus(sourceCorpus.contenu)
    let octets = Buffer.byteLength(sourceCorpus.contenu)
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    for (const [id, membre] of Object.entries(corpus.membership)) {
      const titre = typeof membre?.titre === 'string' ? membre.titre : id
      try {
        this.verifierId(id)
        const source = await this.lire(`entretiens/${id}.json`, sha)
        octets += Buffer.byteLength(source.contenu)
        if (octets > MAX_OCTETS_INSTANTANE) throw new LimiteInstantane('L’inventaire publié dépasse 64 Mio. Ce corpus est trop volumineux pour cet aperçu ciblé.')
        const avant = this.decoderEntretien(source.contenu)
        const data = this.options.store.adapterEntretienOperationTheme(structuredClone(avant))
        entretiens.push({ id, titre, ok: true, avant, data })
      } catch (e) {
        if (e instanceof LimiteInstantane) throw e
        entretiens.push({ id, titre, ok: false, motif: 'Entretien publié indisponible ou non pris en charge.' })
      }
    }
    return { corpus, entretiens, sha, sourceCorpus }
  }

  appliquer(preparation: PreparationImportGitLab) {
    return this.options.file.executer(async () => {
      this.exigerReconcilie()
      if (preparation.store !== this.options.store) throw new Error('Le corpus a changé. Recalculez l’aperçu.')
      const cibles = new Map(preparation.cibles.map((c) => [c.id, c]))
      const ids = [...new Set(preparation.choixCibles.map((c) => {
        const cible = cibles.get(c.cibleId)
        if (!cible) throw new Error('Cible inconnue. Recalculez l’aperçu.')
        this.verifierId(cible.entretienId)
        return cible.entretienId
      }))].sort()
      if (!ids.length) throw new Error('Choisissez explicitement au moins un entretien cible.')
      if (ids.length > MAX_ENTRETIENS_IMPORT_GITLAB) throw new Error(`Ce ciblage GitLab est limité à ${MAX_ENTRETIENS_IMPORT_GITLAB} entretiens par commit. Réduisez la sélection.`)
      this.exigerSansSessions(ids)
      const droits: DroitsEditionGitLab[] = []
      try {
        for (const relatif of ['corpus.crp', ...ids.map((id) => `entretiens/${id}.json`)]) {
          this.exigerSansSessions(ids)
          const acquisition = await this.options.coordination.acquireRessource(cleRessourceBailGitLab(this.options.destination.branche, this.chemin(relatif)))
          if (!acquisition.ok) throw new Error('Le corpus ou un entretien cible est tenu par un autre poste. Aucun import appliqué.')
          droits.push(acquisition.droit)
        }
        const sha = await this.options.depot.resoudreTete(this.options.destination.branche)
        const sourceCorpus = await this.lire('corpus.crp', sha)
        const avant = this.decoderCorpus(sourceCorpus.contenu)
        exigerAbsenceDissociationGitLab(avant)
        if (empreinteCorrespondance(avant) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez avant d’importer.')
        const sources = new Map<string, FichierGitLab>()
        const entretiens: Record<string, EntretienFichier> = Object.create(null)
        for (const id of ids) {
          if (!Object.hasOwn(avant.membership, id)) throw new Error('Un entretien cible ne fait plus partie du corpus.')
          const source = await this.lire(`entretiens/${id}.json`, sha)
          const data = this.decoderEntretien(source.contenu)
          if (data.formatVersion !== FORMAT_VERSION) throw new Error('Enregistrez cet ancien entretien dans le format actuel avant l’import GitLab.')
          if (empreinteCorrespondance(data) !== preparation.empreintesEntretiens[id]) throw new Error('Un entretien cible a changé depuis l’aperçu. Recalculez avant d’importer.')
          this.options.store.adapterEntretienOperationTheme(structuredClone(data))
          sources.set(id, source)
          entretiens[id] = data
        }
        const global = appliquerImportCorrespondances(avant.reglesAnon ?? {}, preparation.lignes, preparation.choix, () => `reg-${randomUUID()}`)
        const apres = structuredClone(avant)
        const definitionsModifiees = global.bilan.ajouts + global.bilan.variantes + global.bilan.remplacements > 0
        if (definitionsModifiees) apres.reglesAnon = global.regles
        const local = appliquerCorrespondancesEntretiens({ lignes: preparation.lignes }, { ...apres, reglesAnon: global.regles }, entretiens, preparation.cibles, preparation.choixCibles)
        const modifications = Object.entries(local.apres).map(([id, data]) => ({ id, avant: entretiens[id], apres: { ...data, lastModified: new Date().toISOString() } }))
        if (definitionsModifiees || modifications.length) {
          const operationId = this.options.nouvelleOperation?.() ?? randomUUID()
          const actions: ActionPlanGitLab[] = [definitionsModifiees
            ? { action: 'update', chemin: sourceCorpus.chemin, commitId: sourceCorpus.commitId, contenu: JSON.stringify(apres, null, 2) }
            : { action: 'garde', chemin: sourceCorpus.chemin, commitId: sourceCorpus.commitId, executable: sourceCorpus.executable }]
          for (const id of ids) {
            const source = sources.get(id)!
            const modification = modifications.find((m) => m.id === id)
            actions.push(modification
              ? { action: 'update', chemin: source.chemin, commitId: source.commitId, contenu: JSON.stringify(modification.apres, null, 2) }
              : { action: 'garde', chemin: source.chemin, commitId: source.commitId, executable: source.executable })
          }
          verifierBornesAnticipees(this.options.destination.branche, `Sonal ${operationId}`, actions, droits.length)
          this.exigerSansSessions(ids)
          const resultat = await this.options.publication.publierSousDroits({ operationId, nature: 'transaction-corpus', actions }, droits)
          if (resultat.statut === 'indetermine') throw new Error('La publication ciblée GitLab est indéterminée. Rouvrez le corpus pour la réconcilier ; ne rejouez pas l’import.')
          if (resultat.statut === 'refuse') throw new Error('La publication ciblée GitLab a été refusée. Aucun import appliqué ; recalculez après contrôle des droits, baux et versions.')
          try {
            this.options.store.appliquerTransactionFichiers({ operation: 'remplacement', id: operationId,
              corpusAvant: this.options.store.ouvrir(), corpusApres: apres,
              entretiens: [],
            })
            for (const modification of modifications) this.options.store.installerEntretienDistant(modification.id, modification.apres)
          } catch {
            throw new Error('L’import GitLab est publié mais son installation dans le miroir a échoué. Rouvrez le corpus avant toute autre action ; ne rejouez pas l’import.')
          }
        }
        const lignesCiblees = new Set(preparation.choixCibles.map((c) => cibles.get(c.cibleId)!.ligneId))
        global.bilan.ignores -= lignesCiblees.size
        return { ...global.bilan, entretiens: local.bilan }
      } finally {
        for (const droit of droits.reverse()) {
          try {
            if (!this.options.coordination.snapshot(droit).suspendu) await this.options.coordination.liberer(droit)
          } catch {
            // Un bail non rendu expire sans changer le résultat du commit.
          }
        }
      }
    })
  }

  private exigerReconcilie(): void {
    if (!this.options.journal) throw new Error('Le ciblage GitLab exige un journal de publication.')
    if (this.options.journal.lister().length) throw new Error('Une publication GitLab reste à réconcilier. Rouvrez le corpus avant d’importer.')
  }
  private exigerSansSessions(ids: string[]): void {
    if (this.sessionsLocales().some((id) => ids.includes(id))) throw new Error('Fermez les sessions locales ou récupérables des cibles avant d’importer.')
  }
  private verifierId(id: string): void {
    if (!id || id === '.' || id === '..' || /[/\\\0]/.test(id)) throw new Error('Identifiant d’entretien invalide.')
  }
  private decoderCorpus(contenu: string): CorpusFichier {
    let data: CorpusFichier
    try { data = JSON.parse(contenu) } catch { throw new Error('Le corpus publié est illisible.') }
    if (!data || data.formatVersion !== FORMAT_VERSION || !data.membership || typeof data.membership !== 'object' || Array.isArray(data.membership)) throw new Error('Le corpus publié n’est pas pris en charge.')
    return data
  }
  private decoderEntretien(contenu: string): EntretienFichier {
    try {
      const data = JSON.parse(contenu) as EntretienFichier
      if (!data || typeof data.formatVersion !== 'number') throw new Error()
      return data
    } catch { throw new Error('Entretien publié illisible.') }
  }
  private async lire(relatif: string, sha: string): Promise<FichierGitLab> {
    const source = await this.options.depot.lireFichier(this.chemin(relatif), sha)
    if (!source) throw new Error('Une source publiée est absente de GitLab.')
    return source
  }
  private chemin(relatif: string): string { return this.racine ? `${this.racine}/${relatif}` : relatif }
}
