import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier } from '../../shared/format'
import {
  RefusOperationTheme,
  type BilanLotTheme,
  type DemandeOperationTheme,
} from '../../shared/corpus/themes'

export type PhasePublicationThemeGitLab = 'definitions' | 'entretien' | 'finalisation'

export interface PublicationThemeGitLabEnAttente {
  operationId: string
  phase: PhasePublicationThemeGitLab
  chemin: string
  contenu: string
  entretien?: { id: string; reaffectes: number; doublonsSupprimes: number }
}

export interface JournalThemesGitLab {
  version: 1
  destination: string
  operationId: string
  tentatives: string[]
  demande: DemandeOperationTheme
  cibles: Array<{ token: string; id: string }>
  definitionsConfirmees: boolean
  selectionnes: string[]
  differes: Array<{ id: string; motif: string }>
  corpus: CorpusFichier
  bilan: BilanLotTheme
  termine: boolean
  abandonne?: boolean
  publication?: PublicationThemeGitLabEnAttente
}

function chaine(v: unknown): v is string { return typeof v === 'string' && v.length > 0 }
function idSain(v: unknown): v is string {
  return chaine(v) && v !== '.' && v !== '..' && !/[/\\\0]/.test(v)
}
function compte(v: unknown): boolean { return Number.isSafeInteger(v) && (v as number) >= 0 }

/** Conserve l’avancement du lot avant chaque commit, indépendamment du journal de publication. */
export class JournalLocalThemesGitLab {
  private readonly fichier: string

  constructor(dirLocal: string, private readonly destination: string) {
    this.fichier = join(dirLocal, '.themes-gitlab.json')
  }

  lire(): JournalThemesGitLab | null {
    if (!existsSync(this.fichier)) return null
    let j: JournalThemesGitLab
    try { j = JSON.parse(readFileSync(this.fichier, 'utf8')) as JournalThemesGitLab } catch {
      throw new RefusOperationTheme('Le journal des thématiques GitLab est illisible ; aucune publication n’est autorisée.')
    }
    if (j?.demande?.type === 'transfert' && j.demande.conserverSource === undefined) {
      j.demande.conserverSource = true
    }
    if (j?.demande?.type === 'fusion' && !Array.isArray(j.demande.sources)) {
      const ancienne = j.demande as unknown as { type: 'fusion'; source?: unknown; cible?: unknown }
      if (chaine(ancienne.source) && chaine(ancienne.cible)) {
        j.demande = { type: 'fusion', sources: [ancienne.source, ancienne.cible], cible: ancienne.cible }
      }
    }
    const finalisations = ['non-demandee', 'a-faire', 'bloquee', 'indeterminee', 'terminee']
    if (!j || j.version !== 1 || j.destination !== this.destination || !chaine(j.operationId)
      || !Array.isArray(j.tentatives) || !j.tentatives.every(chaine)
      || !j.demande || !['transfert', 'fusion', 'division'].includes(j.demande.type)
      || (j.demande.type === 'transfert' && typeof j.demande.conserverSource !== 'boolean')
      || (j.demande.type === 'fusion' && (!Array.isArray(j.demande.sources)
        || j.demande.sources.length !== 2 || !j.demande.sources.every(chaine)
        || new Set(j.demande.sources).size !== 2 || !chaine(j.demande.cible)))
      || (j.demande.type !== 'fusion' && !chaine(j.demande.source)) || !Array.isArray(j.cibles)
      || j.cibles.some((c) => !c || !chaine(c.token) || !chaine(c.id))
      || new Set(j.cibles.map((c) => c.token)).size !== j.cibles.length
      || new Set(j.cibles.map((c) => c.id)).size !== j.cibles.length
      || typeof j.definitionsConfirmees !== 'boolean'
      || !Array.isArray(j.selectionnes) || !j.selectionnes.every(idSain)
      || !Array.isArray(j.differes) || j.differes.some((e) => !idSain(e?.id) || !chaine(e.motif))
      || !j.corpus?.codebook || !j.corpus.membership || !j.bilan
      || !Array.isArray(j.bilan.reussis) || !Array.isArray(j.bilan.echecs)
      || !Array.isArray(j.bilan.ciblesCreees) || !finalisations.includes(j.bilan.finalisation)
      || ![true, false, null].includes(j.bilan.sourceConservee)
      || j.bilan.reussis.some((e) => !idSain(e?.id) || !compte(e.reaffectes) || !compte(e.doublonsSupprimes))
      || j.bilan.echecs.some((e) => !idSain(e?.id) || !chaine(e.motif))
      || typeof j.termine !== 'boolean'
      || (j.abandonne !== undefined && typeof j.abandonne !== 'boolean')) {
      throw new RefusOperationTheme('Le journal des thématiques GitLab est invalide ou appartient à une autre destination.')
    }
    const p = j.publication
    if (p && (j.termine || j.abandonne || !chaine(p.operationId)
      || !['definitions', 'entretien', 'finalisation'].includes(p.phase)
      || !chaine(p.chemin) || !chaine(p.contenu)
      || (p.entretien && (!idSain(p.entretien.id) || p.phase !== 'entretien'
        || !compte(p.entretien.reaffectes) || !compte(p.entretien.doublonsSupprimes))))) {
      throw new RefusOperationTheme('L’intention de publication des thématiques GitLab est invalide.')
    }
    return j
  }

  ecrire(journal: JournalThemesGitLab): void {
    const temporaire = `${this.fichier}.tmp`
    writeFileSync(temporaire, JSON.stringify(journal, null, 2), { encoding: 'utf8', mode: 0o600, flush: true })
    renameSync(temporaire, this.fichier)
  }
}
