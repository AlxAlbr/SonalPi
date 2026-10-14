import type { ConversionEntretienMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import { importerFichier } from './sas'

/** Réutilise l'import V1 sans conserver les chemins médias du poste d'origine. */
export function convertirEntretienMigrationGitLab(
  lecture: { nom: string; contenu: string } | null,
  parseur: (html: string) => Document,
): ConversionEntretienMigrationGitLab {
  if (!lecture) return {
    payload: {
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
      annotations: [], ancres: [], locuteurs: [], brouillonsAnon: [],
      meta: { valeursGen: {}, audioRef: null },
    },
    reglesAnon: [],
  }
  const importe = importerFichier(lecture.nom, lecture.contenu, parseur)
  const meta = { ...importe.payload.meta, audioRef: null }
  delete meta.audioDistant
  return {
    payload: { ...importe.payload, meta, legacy: importe.legacy as unknown as Record<string, unknown> },
    reglesAnon: importe.reglesAnon,
  }
}
