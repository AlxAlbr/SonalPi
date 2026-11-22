import { accessSync, closeSync, constants, openSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, resolve, sep, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lireFichierCorpus } from './ouvertureFichier'
import { mapperEntretiensV1 } from '../shared/corpus/migrationCrp'
import type { DemandeVerificationMigration, FichierMigrationV1, VerificationMigrationV1 } from '../shared/migrationV1'

function resoudreReference(racine: string, reference: string): string {
  let chemin = reference
  if (chemin.startsWith('file:')) chemin = fileURLToPath(chemin)
  // Un chemin d'un autre système ne désigne pas un sous-dossier du corpus actuel.
  if (process.platform !== 'win32' && win32.isAbsolute(chemin) && !isAbsolute(chemin)) return chemin
  return resolve(racine, chemin.replace(/[\\/]/g, sep))
}

function etatFichier(chemin: string, transcription: boolean): FichierMigrationV1['etat'] {
  if (!isAbsolute(chemin)) return 'manquant'
  try {
    if (!statSync(chemin).isFile()) return 'illisible'
    accessSync(chemin, constants.R_OK)
    if (transcription) readFileSync(chemin)
    else closeSync(openSync(chemin, 'r'))
    return 'ok'
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? 'manquant' : 'illisible'
  }
}

/** Vérifie les références et les fichiers choisis sans modifier le corpus V1. */
export function inspecterSourcesMigration(req: DemandeVerificationMigration) {
  const lecture = lireFichierCorpus(req.cheminCrp)
  if (lecture.classification.type !== 'v1') throw new Error('La source n’est pas un corpus SonalPi1.')
  const octets = readFileSync(lecture.chemin)
  if (octets.toString('utf8') !== lecture.contenu) throw new Error('Le corpus SonalPi1 a changé pendant sa lecture. Vérifiez à nouveau les fichiers.')
  const empreinteCrp = createHash('sha256').update(octets).digest('hex')
  if (req.empreinteCrp !== undefined && req.empreinteCrp !== empreinteCrp) {
    throw new Error('Le corpus SonalPi1 a changé. Fermez cette fenêtre puis rouvrez-le avant de choisir les fichiers.')
  }
  const tabEnt = lecture.classification.apercu.raw.tabEnt ?? []
  if (tabEnt.some((e) => !e || typeof e !== 'object' || Array.isArray(e)
    || (e.rtrPath != null && typeof e.rtrPath !== 'string')
    || (e.audioPath != null && typeof e.audioPath !== 'string'))) {
    throw new Error('Les références des entretiens V1 sont invalides.')
  }
  const entretiens = mapperEntretiensV1(tabEnt)
  const remplacements = new Map<number, string>()
  if (req.transcriptions !== undefined && !Array.isArray(req.transcriptions)) throw new Error('Les fichiers choisis sont invalides.')
  for (const remplacement of req.transcriptions ?? []) {
    if (!remplacement || !Number.isSafeInteger(remplacement.index) || !entretiens[remplacement.index]?.rtrPath
      || typeof remplacement.chemin !== 'string' || !isAbsolute(remplacement.chemin) || remplacement.chemin.includes('\0')
      || remplacements.has(remplacement.index) || !req.empreinteCrp) {
      throw new Error('Les fichiers choisis ne correspondent pas aux entretiens vérifiés. Rouvrez la fenêtre de migration.')
    }
    remplacements.set(remplacement.index, remplacement.chemin)
  }
  const bilan: VerificationMigrationV1 = { empreinteCrp, transcriptions: [], medias: [] }
  for (const [index, entretien] of entretiens.entries()) {
    for (const [transcription, reference] of [[true, entretien.rtrPath], [false, entretien.audioRef]] as const) {
      if (!reference) continue
      let chemin = transcription ? remplacements.get(index) ?? reference : reference
      let etat: FichierMigrationV1['etat']
      try {
        chemin = resoudreReference(dirname(lecture.chemin), chemin)
        etat = etatFichier(chemin, transcription)
      } catch { etat = 'illisible' }
      const fichier = { index, titre: entretien.titre, reference, chemin, etat }
      if (transcription) bilan.transcriptions.push(fichier)
      else bilan.medias.push(fichier)
    }
  }
  return { lecture, bilan }
}
