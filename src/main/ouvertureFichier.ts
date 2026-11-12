import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { classifierCorpus, type ClassificationCorpus } from '../shared/ouvertureFichier'
import { NOM_FICHIER_CORPUS } from '../shared/fichiersCorpus'
import { decoderCrp } from './encodage'

/** Résout aussi les parents existants d'un chemin pas encore créé. */
export function cheminCanonique(chemin: string): string {
  const abs = resolve(chemin)
  if (existsSync(abs)) return realpathSync(abs)
  const parent = dirname(abs)
  return parent === abs ? abs : resolve(cheminCanonique(parent), basename(abs))
}

/** Identifie les miroirs du profil, y compris lorsqu'un lien symbolique y mène. */
export function compteDuMiroir(chemin: string, racine: string): string | null {
  for (const [base, cible] of [[resolve(racine), resolve(chemin)], [cheminCanonique(racine), cheminCanonique(chemin)]]) {
    const rel = relative(base, cible)
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) {
      return rel.split(sep)[0] || ''
    }
  }
  return null
}

export interface LectureFichierCorpus {
  chemin: string
  contenu: string
  classification: ClassificationCorpus
  manquants: string[]
}

/** Lecture et identification sans création de dossier, ni écriture du corpus. */
export function lireFichierCorpus(source: string): LectureFichierCorpus {
  if (typeof source !== 'string' || !source || source.includes('\0')) throw new Error('Chemin de corpus invalide.')
  const chemin = realpathSync(resolve(source))
  if (!statSync(chemin).isFile()) throw new Error('Le chemin choisi n’est pas un fichier corpus.')
  accessSync(chemin, constants.R_OK)
  const octets = readFileSync(chemin)
  // Le natif est UTF-8 ; seuls les anciens fichiers nécessitent un décodage historique.
  const utf8 = octets.toString('utf8')
  let classification: ClassificationCorpus
  try { classification = classifierCorpus(utf8, basename(chemin)) }
  catch (erreur) {
    const decode = decoderCrp(octets)
    if (decode === utf8) throw erreur
    classification = classifierCorpus(decode, basename(chemin))
    if (classification.type !== 'v1') throw erreur
  }
  if (classification.type === 'v1') classification = classifierCorpus(decoderCrp(octets), basename(chemin))
  if (classification.type === 'v2' && basename(chemin) !== NOM_FICHIER_CORPUS) {
    throw new Error(`Le fichier natif V2 attendu est « ${NOM_FICHIER_CORPUS} ». Aucun autre fichier du dossier n’a été ouvert.`)
  }
  if (classification.type === 'v2' && !Buffer.from(utf8, 'utf8').equals(octets)) {
    throw new Error('Le corpus V2 doit être encodé en UTF-8.')
  }
  const manquants = classification.type === 'v2'
    ? Object.keys(classification.corpus.membership).filter((id) => !existsSync(resolve(dirname(chemin), 'entretiens', `${id}.json`)))
    : []
  return { chemin, contenu: utf8, classification, manquants }
}
