/**
 *  Copie de sauvegarde du corpus LOCAL en archive ZIP.
 *  Le corpus est un dossier autonome (`corpus.json`, `entretiens/`, `png/`,
 *  `DocsPrepaProjet/`…) : l'archive en est un instantané fidèle, décompressable
 *  tel quel dans un dossier vide pour retrouver un corpus ouvrable.
 *  Les corpus distants sont refusés : leur sauvegarde relève du serveur.
 *  L'audio est référencé sur place, jamais copié.
 *  L'archive ne contient donc que le corpus, pas les médias externes.
 */
import { app, type IpcMainInvokeEvent } from 'electron'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import JSZip from 'jszip'
import type { ResultatArchiveCorpus } from '../shared/format'
import { nettoyerBaseNom } from '../shared/export/nomsFichiers'
import { choisirDestination, ecrireFichierAtomique } from './exportEntretien'

/** Entrées du dossier corpus qui ne sont PAS du contenu du corpus :
 *  protocole multi-utilisateur (`verrous/`, `presence/`, `sonde/`),
 *  copies de divergence locales (`sessions/`), mémoire du miroir (`.manifeste.json`).
 *  Elles ne servent à rien dans une restauration ailleurs. */
const DOSSIERS_EXCLUS = new Set(['verrous', 'presence', 'sessions', 'sonde'])
const FICHIERS_EXCLUS = new Set(['.manifeste.json'])

/** Un fichier du corpus à archiver : chemin relatif POSIX (clé dans le zip),
 *  et chemin absolu sur disque. */
export interface FichierCorpusArchive {
  relatif: string
  absolu: string
}

/** Inventorie récursivement le contenu d'un dossier corpus.
 *  Les dossiers de protocole et les temporaires d'écriture (`.tmp`) sont ignorés.
 *  Les liens symboliques aussi : l'archive reste bornée au dossier. */
export function collecterFichiersCorpus(dir: string): FichierCorpusArchive[] {
  const fichiers: FichierCorpusArchive[] = []
  const visiter = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const absolu = join(dossier, entree.name)
      if (entree.isDirectory()) {
        if (DOSSIERS_EXCLUS.has(entree.name)) continue
        visiter(absolu)
        continue
      }
      if (!entree.isFile()) continue // liens symboliques et cas particuliers : hors archive
      if (FICHIERS_EXCLUS.has(entree.name) || entree.name.endsWith('.tmp')) continue
      fichiers.push({ relatif: relative(dir, absolu).split(sep).join('/'), absolu })
    }
  }
  if (existsSync(dir) && lstatSync(dir).isDirectory()) visiter(dir)
  return fichiers
}

/** Construit l'archive ZIP du corpus.
 *  Déflate : JSON et PNG se compressent bien, sans transformer les données. */
export async function construireZipCorpus(
  dir: string,
): Promise<{ buffer: Buffer; fichiers: number }> {
  const liste = collecterFichiersCorpus(dir)
  const zip = new JSZip()
  for (const fichier of liste) zip.file(fichier.relatif, readFileSync(fichier.absolu))
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return { buffer, fichiers: liste.length }
}

/** Nom par défaut de l'archive : nom du corpus nettoyé + date du jour. */
export function nomArchiveCorpus(nomCorpus: string, date = new Date()): string {
  return `${nettoyerBaseNom(nomCorpus, 'zip')}_${date.toISOString().slice(0, 10)}.zip`
}

/** « Faire une copie de sauvegarde du corpus (ZIP) ».
 *  Choix de la destination, puis écriture atomique.
 *  Refus typé si un corpus distant est actif, ou si le dossier n'est pas un corpus. */
export async function archiverCorpusLocal(
  e: IpcMainInvokeEvent,
  dir: string,
  nomCorpus: string,
  estDistant: boolean,
): Promise<ResultatArchiveCorpus> {
  if (estDistant) {
    return {
      etat: 'refus',
      message:
        "La copie de sauvegarde ZIP n'est disponible que pour un corpus local ; " +
        'un corpus distant se sauvegarde sur son serveur.',
    }
  }
  if (!existsSync(join(dir, 'corpus.json'))) {
    return { etat: 'refus', message: "Aucun corpus ouvert : il n'y a rien à sauvegarder." }
  }
  const chemin = await choisirDestination(e, {
    title: 'Enregistrer une copie de sauvegarde du corpus',
    defaultPath: join(app.getPath('documents'), nomArchiveCorpus(nomCorpus)),
    filters: [
      { name: 'Archive ZIP', extensions: ['zip'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  })
  if (!chemin) return { etat: 'annule' }
  try {
    const { buffer, fichiers } = await construireZipCorpus(dir)
    ecrireFichierAtomique(chemin, buffer)
    return { etat: 'succes', chemin, fichiers }
  } catch (erreur) {
    return {
      etat: 'echec',
      message: `La copie de sauvegarde a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}
