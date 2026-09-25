/**
 *  Socle de l'export au niveau du CORPUS : assemblage de l'instantané d'un
 *  entretien NON ouvert, comptage de mots sur la projection et index
 *  récapitulatif du lot. Fonctions pures, sans Vue, Electron, DOM ni I/O :
 *  l'appelant (le main) a déjà lu et vérifié les fichiers, et fournit une
 *  URL audio déjà résolue.
 */
import type { CorpusFichier, EntretienFichier } from '../format'
import type { EntreeExport, InstantaneEntretienExport } from './types'
import { projeterSegments } from './projectionEntretien'
import { nettoyerBaseNom } from './nomsFichiers'

/** Résultat de l'assemblage d'un instantané par le main : soit un instantané
 *  comme un autre, soit un échec expliqué (fichier absent, version non prise
 *  en charge). Un échec d'entretien n'interrompt jamais le lot. */
export type ResultatInstantaneCorpus =
  | { etat: 'succes'; instantane: InstantaneEntretienExport }
  | { etat: 'echec'; message: string }

/** Assemble l'instantané d'un entretien à partir du fichier natif lu et des
 *  définitions partagées du corpus. Le fichier est déjà vérifié par le
 *  main ; `audioLocal` est l'URL audio RÉSOLUE (null si média absent ou
 *  inaccessible). */
export function assemblerInstantaneCorpus(
  id: string,
  fichier: EntretienFichier,
  corpus: CorpusFichier,
  audioLocal: string | null,
): InstantaneEntretienExport {
  const ref = corpus.membership[id]
  return {
    id,
    titre: ref?.titre ?? 'entretien',
    date: ref?.date ?? null,
    reperesPassages: fichier.reperesPassages ?? [],
    entretien: {
      corpsTexte: fichier.corpsTexte,
      annotations: fichier.annotations,
      ancres: fichier.ancres,
      locuteurs: fichier.locuteurs,
      codebook: Object.values(corpus.codebook ?? {}).sort((a, b) => a.ordre - b.ordre),
      variables: Object.values(corpus.variables ?? {}).sort((a, b) => a.ordre - b.ordre),
      meta: { valeursGen: fichier.meta.valeursGen ?? {} },
      legacy: {
        tabAnon: (fichier.legacy?.tabAnon as unknown) ?? null,
        notes: typeof fichier.legacy?.notes === 'string' ? fichier.legacy.notes : '',
      },
      reglesAnon: Object.values(corpus.reglesAnon ?? {}),
      brouillonsAnon: fichier.brouillonsAnon ?? [],
    },
    notesPubliques: fichier.notes ?? [],
    audioLocal,
  }
}

/** Nombre de mots de la transcription : le même token de mot que le compteur
 *  de la projection (mots accentués compris), sommé sur tous les fragments. */
export function compterMots(e: EntreeExport): number {
  let total = 0
  for (const segment of projeterSegments(e)) {
    for (const fragment of segment.fragments) {
      total += fragment.texte.match(/[\wÀ-ÿ]+/g)?.length ?? 0
    }
  }
  return total
}

/** Une ligne de l'index : un entretien EXPORTÉ. Les entretiens en échec
 *  n'y figurent pas (ils sont expliqués dans le résumé final du lot). */
export interface LigneIndexCorpus {
  titre: string
  /** Date de l'entretien, telle que portée par le corpus (peut être absente). */
  date: string | null
  nbMots: number
}

/** Index récapitulatif d'un export de lot (`_index.txt`) : identité du
 *  corpus, date de l'export, puis une ligne par entretien exporté. */
export function texteIndexCorpus(
  nomCorpus: string,
  dateExport: string,
  lignes: LigneIndexCorpus[],
): string {
  const n = lignes.length
  const pluriel = n > 1 ? 's' : ''
  const entetes = [
    `Nom du corpus : ${nomCorpus}`,
    `Export du corpus réalisé le ${dateExport}`,
    '',
    `${n} entretien${pluriel} exporté${pluriel}.`,
    '',
  ]
  const corps = lignes.map(
    (l) => `- ${l.titre}${l.date ? ` (${l.date})` : ''} — ${l.nbMots} mots`,
  )
  return `${[...entetes, ...corps].join('\n')}\n`
}

/** Résultat d'une écriture ou d'une copie de média dans le dossier de
 *  destination (le chemin retourné est RELATIF à ce dossier) ; l'écriture
 *  est atomique et un échec est expliqué, jamais silencieux. */
export type ResultatEcritureCorpus =
  | { etat: 'succes'; cheminRelatif: string }
  | { etat: 'echec'; message: string }

/** Nom de dossier proposé pour un export de lot : titre du corpus nettoyé,
 *  suivi de la date du jour. */
export function nomDossierExportCorpus(nomCorpus: string, date: string): string {
  const base = nettoyerBaseNom(nomCorpus, '')
  return `${base}_${date}`
}
