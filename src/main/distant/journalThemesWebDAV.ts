import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier } from '../../shared/format'
import { RefusOperationTheme, type BilanLotTheme, type DemandeOperationTheme } from '../../shared/corpus/themes'

export interface PublicationThemeEnAttente {
  chemin: string
  contenu: string
  entretien?: { id: string; reaffectes: number; doublonsSupprimes: number }
}

export interface JournalThemesWebDAV {
  version: 1
  destination: string
  operationId: string
  tentatives: string[]
  aTraiter?: string[]
  demande: DemandeOperationTheme
  cibles: Array<{ token: string; id: string }>
  definitionsConfirmees: boolean
  corpus: CorpusFichier
  bilan: BilanLotTheme
  termine: boolean
  abandonne?: boolean
  publication?: PublicationThemeEnAttente
}

export function idEntretienThemeSain(id: unknown): id is string {
  return typeof id === 'string' && !!id && id !== '.' && id !== '..' && !/[/\\\0]/.test(id)
}

/** Conserve l’intention avant chaque PUT, pour ne jamais rejouer une réponse inconnue. */
export class JournalLocalThemesWebDAV {
  private readonly fichier: string

  constructor(dir: string, private readonly destination: string) {
    this.fichier = join(dir, '.themes-webdav.json')
  }

  lire(): JournalThemesWebDAV | null {
    if (!existsSync(this.fichier)) return null
    let j: JournalThemesWebDAV
    try { j = JSON.parse(readFileSync(this.fichier, 'utf8')) as JournalThemesWebDAV } catch {
      throw new RefusOperationTheme('Le journal des thématiques WebDAV est illisible ; aucune publication n’est autorisée.')
    }
    if (j?.demande?.type === 'transfert' && j.demande.conserverSource === undefined) {
      j.demande.conserverSource = true
    }
    const chaine = (v: unknown) => typeof v === 'string' && !!v
    const compte = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0
    if (!j || j.version !== 1 || j.destination !== this.destination || !chaine(j.operationId)
      || !Array.isArray(j.tentatives) || !j.tentatives.every(chaine)
      || (j.aTraiter !== undefined && (!Array.isArray(j.aTraiter) || !j.aTraiter.every(idEntretienThemeSain)))
      || !j.demande || !['transfert', 'division'].includes(j.demande.type)
      || (j.demande.type === 'transfert' && j.demande.conserverSource !== true)
      || (j.demande.type === 'division' && j.demande.effacerSource !== false)
      || ((j.demande.type === 'transfert' || j.demande.type === 'division') && !chaine(j.demande.source))
      || !Array.isArray(j.cibles)
      || j.cibles.some((c) => !c || !chaine(c.token) || !chaine(c.id))
      || typeof j.definitionsConfirmees !== 'boolean' || typeof j.termine !== 'boolean'
      || (j.abandonne !== undefined && typeof j.abandonne !== 'boolean')
      || new Set(j.cibles.map((c) => c.id)).size !== j.cibles.length
      || new Set(j.cibles.map((c) => c.token)).size !== j.cibles.length
      || !j.corpus?.codebook || !j.corpus.membership || !j.bilan
      || j.bilan.finalisation !== 'non-demandee' || j.bilan.sourceConservee !== true
      || !Array.isArray(j.bilan.reussis) || !Array.isArray(j.bilan.echecs) || !Array.isArray(j.bilan.ciblesCreees)
      || j.bilan.reussis.some((e) => !idEntretienThemeSain(e?.id) || !compte(e.reaffectes) || !compte(e.doublonsSupprimes))
      || j.bilan.echecs.some((e) => !e || !chaine(e.id) || !chaine(e.motif))) {
      throw new RefusOperationTheme('Le journal des thématiques WebDAV est invalide ou appartient à une autre destination.')
    }
    const p = j.publication
    if (p && (j.termine || j.abandonne || !chaine(p.contenu)
      || (p.entretien
        ? !idEntretienThemeSain(p.entretien.id) || p.chemin !== `entretiens/${p.entretien.id}.json`
          || !compte(p.entretien.reaffectes) || !compte(p.entretien.doublonsSupprimes)
        : p.chemin !== 'corpus.crp'))) {
      throw new RefusOperationTheme('L’intention de publication des thématiques WebDAV est invalide.')
    }
    return j
  }

  ecrire(journal: JournalThemesWebDAV): void {
    const temporaire = `${this.fichier}.tmp`
    writeFileSync(temporaire, JSON.stringify(journal, null, 2), { encoding: 'utf8', mode: 0o600, flush: true })
    renameSync(temporaire, this.fichier)
  }
}
