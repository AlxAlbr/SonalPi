import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validerCorpusNatif, validerEntretienNatif } from '../../shared/natif/validation'
import type { EntreeLectureDistante } from './lecture'

interface OptionsValidationCandidatsMiroir {
  dirLocal: string
  candidats: EntreeLectureDistante[]
  contenusPrepares: ReadonlyMap<string, string>
  exclus: ReadonlySet<string>
}

type ObjetJson = Record<string, unknown>

/** Valide la vue métier complète avant de remplacer un fichier du miroir. */
export function validerCandidatsMiroir(options: OptionsValidationCandidatsMiroir): void {
  const parChemin = new Map(options.candidats.map((entree) => [entree.chemin, entree]))
  if (!parChemin.has('corpus.crp')) {
    throw new Error("Le dossier distant ne contient pas de corpus.crp.")
  }

  const corpus = parserObjet(contenuDisponible('corpus.crp', options), 'corpus.crp')
  validerCorpusNatif(corpus)

  const membership = corpus.membership as ObjetJson
  for (const [id, reference] of Object.entries(membership)) {
    if (!segmentSain(id) || !estReferenceEntretien(reference)) {
      throw new Error(`Le membership du corpus contient une entrée invalide pour ${JSON.stringify(id)}.`)
    }
    const chemin = `entretiens/${id}.json`
    if (!parChemin.has(chemin) && !options.exclus.has(chemin)) {
      throw new Error(`Le membership référence un entretien distant absent : ${chemin}.`)
    }
  }

  const cheminsSansCasse = new Set<string>()
  for (const entree of options.candidats) {
    const cle = entree.chemin.normalize('NFC').toLocaleLowerCase('en-US')
    if (cheminsSansCasse.has(cle)) {
      throw new Error(`Le corpus distant contient des chemins incompatibles : ${JSON.stringify(entree.chemin)}.`)
    }
    cheminsSansCasse.add(cle)
    if (entree.chemin === 'corpus.crp') continue
    if (!cheminEntretienSain(entree.chemin)) {
      throw new Error(`Le corpus distant contient un chemin métier invalide : ${JSON.stringify(entree.chemin)}.`)
    }
    if (options.exclus.has(entree.chemin)) continue
    const contenu = contenuDisponible(entree.chemin, options)
    validerEntretien(parserObjet(contenu, entree.chemin), entree.chemin)
  }
}

function contenuDisponible(
  chemin: string,
  options: OptionsValidationCandidatsMiroir,
): string {
  const prepare = options.contenusPrepares.get(chemin)
  if (prepare !== undefined) return prepare
  const local = join(options.dirLocal, chemin)
  if (existsSync(local)) return readFileSync(local, 'utf8')
  throw new Error(`Le candidat ${chemin} n'est pas disponible pour validation.`)
}

function parserObjet(contenu: string, chemin: string): ObjetJson {
  let valeur: unknown
  try {
    valeur = JSON.parse(contenu)
  } catch {
    throw new Error(`Le candidat ${chemin} n'est pas un JSON valide.`)
  }
  if (!estObjet(valeur)) {
    throw new Error(`Le candidat ${chemin} ne contient pas un objet JSON.`)
  }
  return valeur
}

function validerEntretien(entretien: ObjetJson, chemin: string): void {
  try { validerEntretienNatif(entretien) }
  catch (erreur) {
    throw new Error(`Le candidat ${chemin} ne contient pas un entretien valide : ${erreur instanceof Error ? erreur.message : String(erreur)}`)
  }
}

function estReferenceEntretien(valeur: unknown): boolean {
  if (!estObjet(valeur)) return false
  return typeof valeur.titre === 'string' &&
    (valeur.date === null || typeof valeur.date === 'string') &&
    typeof valeur.lastModified === 'string'
}

function cheminEntretienSain(chemin: string): boolean {
  if (!chemin.startsWith('entretiens/') || !chemin.endsWith('.json')) return false
  const id = chemin.slice('entretiens/'.length, -'.json'.length)
  return segmentSain(id)
}

function segmentSain(segment: string): boolean {
  if (
    segment === '' ||
    segment === '.' ||
    segment === '..' ||
    /[\\/<>:"|?*\u0000-\u001f]/.test(segment) ||
    /[. ]$/.test(segment)
  ) return false
  const nomWindows = segment.split('.')[0].toLocaleUpperCase('en-US')
  return !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(nomWindows)
}

function estObjet(valeur: unknown): valeur is ObjetJson {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)
}
