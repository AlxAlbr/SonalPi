import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, extname, relative, isAbsolute, resolve, basename } from 'node:path'
import type { CorpusStore } from './corpusStore'
import type { InstantaneOperationTheme } from './operationsThemes'
import { FORMAT_VERSION } from '../shared/format'
import { preparerCiblesCorrespondances, type ChoixCibleCorrespondance } from '../shared/corpus/importCorrespondancesEntretiens'
import type { RegleAnon } from '../shared/format'
import { construireTableCorrespondance, tableExigeEntretiens, type OptionsTableCorrespondance, type TableCorrespondanceV2, type ApercuExportCorrespondance } from '../shared/corpus/tablesCorrespondance'
import { decoderCorrespondances, preparerImportCorrespondances, type DocumentCorrespondance, type CorrectionCorrespondance, type ChoixImportCorrespondance, type ApercuImportCorrespondance } from '../shared/corpus/importCorrespondances'

function verifierRegles(regles: Record<string, RegleAnon>): void {
  if (!regles || typeof regles !== 'object' || Array.isArray(regles) || Object.entries(regles).some(([id, r]) =>
    !r || r.id !== id || !Array.isArray(r.entite) || !r.entite.every((e) => typeof e === 'string') ||
    !Array.isArray(r.pseudos) || !r.pseudos.every((p) => typeof p === 'string'))) {
    throw new Error('Une définition corpus est illisible. Corrigez le fichier avant de préparer les correspondances.')
  }
}

export function empreinteDefinitionsCorrespondance(regles: Record<string, RegleAnon>): string {
  verifierRegles(regles)
  return createHash('sha256').update(JSON.stringify(Object.entries(regles).sort(([a], [b]) => a.localeCompare(b)))).digest('hex')
}
export const empreinteCorrespondance = (valeur: unknown): string => createHash('sha256').update(JSON.stringify(valeur)).digest('hex')
type Cache = { store: CorpusStore; expire: number } & (
  { type: 'export'; apercu: ApercuExportCorrespondance } |
  { type: 'import'; empreinte: string; empreinteCorpus: string; empreintesEntretiens: Record<string, string>; apercu: ApercuImportCorrespondance }
)

/** Cache borné des aperçus privés ; aucun texte d'entretien ni chemin de fichier n'est envoyé dans les diagnostics. */
export class TablesCorrespondance {
  private readonly cache = new Map<string, Cache>()
  constructor(private readonly options: { store: () => CorpusStore; lecture: () => 'local' | 'miroir'; maintenant?: () => number }) {}
  private maintenant() { return (this.options.maintenant ?? Date.now)() }
  private retenir(token: string, entree: Cache) {
    if (Buffer.byteLength(JSON.stringify(entree.apercu)) > 8 * 1024 * 1024) throw new Error('L’aperçu dépasse 8 Mio. Réduisez le périmètre ou le nombre de correspondances.')
    for (const [id, valeur] of this.cache) if (valeur.expire <= this.maintenant() || valeur.store !== this.options.store()) this.cache.delete(id)
    while (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(token, entree)
  }
  private lire(token: string): Cache {
    const valeur = this.cache.get(token)
    if (!valeur || valeur.expire <= this.maintenant() || valeur.store !== this.options.store()) {
      this.cache.delete(token)
      throw new Error('L’aperçu a expiré ou le corpus a changé. Recalculez-le.')
    }
    return valeur
  }
  preparerExport(options: OptionsTableCorrespondance): ApercuExportCorrespondance {
    const store = this.options.store()
    const instantane = store.instantaneCorrespondances(tableExigeEntretiens(options))
    verifierRegles(instantane.corpus.reglesAnon)
    const table = construireTableCorrespondance(Object.values(instantane.corpus.reglesAnon), instantane.entretiens.flatMap((e) => e.ok ? [{ id: e.id, data: e.data }] : []), options)
    if (Buffer.byteLength(JSON.stringify(table)) > 8 * 1024 * 1024) throw new Error('La table dépasse la limite de 8 Mio. Réduisez le périmètre.')
    const token = randomUUID()
    const apercu: ApercuExportCorrespondance = { token, table, lecture: this.options.lecture(), indisponibles: instantane.entretiens.filter((e) => !e.ok).map((e) => ({ id: e.id, titre: e.titre })) }
    this.retenir(token, { type: 'export', store, expire: this.maintenant() + 300_000, apercu })
    return structuredClone(apercu)
  }
  exportMemorise(token: string, partielConfirme: boolean): TableCorrespondanceV2 {
    const entree = this.lire(token)
    if (entree.type !== 'export') throw new Error('Cet aperçu n’est pas un export.')
    if ((entree.apercu.indisponibles.length || entree.apercu.table.diagnostics.length) && partielConfirme !== true) {
      throw new Error('Confirmez explicitement les limites et éléments indisponibles avant d’exporter cette table.')
    }
    return structuredClone(entree.apercu.table)
  }
  verifierDestination(token: string, chemin: string): void {
    const entree = this.lire(token)
    if (entree.type !== 'export' || extname(chemin).toLowerCase() !== '.json') throw new Error('Choisissez une destination JSON pour cette table.')
    const racine = realpathSync(entree.store.repertoire)
    const destinations = [resolve(realpathSync(dirname(chemin)), basename(chemin)), ...(existsSync(chemin) ? [realpathSync(chemin)] : [])]
    for (const destination of destinations) {
      const ecart = relative(racine, destination)
      if (!ecart || (!ecart.startsWith('../') && !ecart.startsWith('..\\') && ecart !== '..' && !isAbsolute(ecart))) {
        throw new Error('La table contient les identités originales. Choisissez une destination hors du corpus et de son miroir.')
      }
    }
  }
  preparerImport(documents: DocumentCorrespondance[], corrections: CorrectionCorrespondance[] = []): ApercuImportCorrespondance {
    return this.preparerImportInterne(documents, corrections)
  }
  preparerImportGitLab(documents: DocumentCorrespondance[], corrections: CorrectionCorrespondance[], instantane: InstantaneOperationTheme): ApercuImportCorrespondance {
    return this.preparerImportInterne(documents, corrections, instantane, 'gitlab')
  }
  preparerImportWebDAV(documents: DocumentCorrespondance[], corrections: CorrectionCorrespondance[], instantane: InstantaneOperationTheme): ApercuImportCorrespondance {
    return this.preparerImportInterne(documents, corrections, instantane, 'webdav')
  }
  private preparerImportInterne(documents: DocumentCorrespondance[], corrections: CorrectionCorrespondance[], publie?: InstantaneOperationTheme,
    fournisseurPublie?: 'gitlab' | 'webdav'): ApercuImportCorrespondance {
    if (!Array.isArray(documents) || !documents.length || documents.length > 20 || documents.some((d) => !d || typeof d.nom !== 'string' || typeof d.texte !== 'string') ||
      documents.reduce((n, d) => n + Buffer.byteLength(d.texte), 0) > 8 * 1024 * 1024) throw new Error('Choisissez de 1 à 20 JSON, pour 8 Mio maximum.')
    const entrees = decoderCorrespondances(documents)
    if (entrees.length > 10_000) throw new Error('La table dépasse la limite de 10 000 lignes.')
    const store = this.options.store()
    const ciblage = (!!publie || this.options.lecture() === 'local') && entrees.some((e) => e.nature === 'locuteur' || e.portee === 'texte-local')
    const instantane = publie ?? store.instantaneCorrespondances(ciblage)
    const regles = instantane.corpus.reglesAnon
    verifierRegles(regles)
    const token = randomUUID()
    const apercu: ApercuImportCorrespondance = { token, lignes: preparerImportCorrespondances(entrees, Object.values(regles), corrections), lecture: fournisseurPublie ?? this.options.lecture() }
    if (ciblage) {
      apercu.cibles = preparerCiblesCorrespondances(apercu, instantane.corpus, Object.fromEntries(instantane.entretiens.flatMap((e) => e.ok ? [[e.id, e.data]] : [])))
      const formats = new Map(instantane.entretiens.flatMap((e) => e.ok ? [[e.id, e.avant.formatVersion] as const] : []))
      for (const cible of apercu.cibles) {
        if ((formats.get(cible.entretienId) ?? 0) < (publie ? FORMAT_VERSION : 3)) {
          cible.actionsPossibles = []
          cible.motif = 'Enregistrez cet ancien entretien dans le format actuel avant d’importer des correspondances locales.'
        }
      }
      if (apercu.cibles.length > 10_000) throw new Error('L’aperçu dépasse 10 000 cibles. Réduisez le nombre de correspondances.')
      apercu.indisponibles = instantane.entretiens.filter((e) => !e.ok).map((e) => ({ id: e.id, titre: e.titre }))
    }
    this.retenir(token, { type: 'import', store, expire: this.maintenant() + 300_000, empreinte: empreinteDefinitionsCorrespondance(regles),
      empreinteCorpus: empreinteCorrespondance(instantane.corpus), empreintesEntretiens: Object.fromEntries(instantane.entretiens.flatMap((e) => e.ok ? [[e.id, empreinteCorrespondance(e.avant)]] : [])), apercu })
    return structuredClone(apercu)
  }
  consommerImport(token: string, choix: Record<string, ChoixImportCorrespondance>, cibles: ChoixCibleCorrespondance[] = [], confirmees = false) {
    const entree = this.lire(token)
    if (entree.type !== 'import') throw new Error('Cet aperçu n’est pas un import.')
    this.cache.delete(token)
    if (!Array.isArray(cibles) || cibles.length > 10_000 || cibles.some((c) => !c || typeof c.cibleId !== 'string')) throw new Error('Choix de cibles invalide.')
    if (cibles.length && confirmees !== true) throw new Error('Confirmez explicitement les entretiens et décisions ciblés avant d’importer.')
    if (cibles.length && this.options.lecture() !== 'local' && !['gitlab', 'webdav'].includes(entree.apercu.lecture)) throw new Error('L’import ciblé exige un aperçu local ou publié par le fournisseur. Aucun entretien du miroir n’a été modifié.')
    return { store: entree.store, empreinte: entree.empreinte, lignes: structuredClone(entree.apercu.lignes), choix: structuredClone(choix),
      empreinteCorpus: entree.empreinteCorpus, empreintesEntretiens: entree.empreintesEntretiens, cibles: structuredClone(entree.apercu.cibles ?? []), choixCibles: structuredClone(cibles),
    }
  }
}
