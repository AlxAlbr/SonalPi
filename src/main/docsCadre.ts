/**
 *  Service des « Docs cadre projet » — corpus LOCAL et exemples embarqués.
 *
 *  Responsabilités : inventaire, catégorisation et tri des fichiers de
 *  `DocsPrepaProjet/` ; lecture bornée pour les aperçus (texte, images, PDF) ; copie
 *  atomique d'un fichier choisi ; renommage sans écrasement ; déplacement vers
 *  la corbeille douce ; lecture des exemples embarqués.
 *
 *  Les ouvertures externes et les dialogues restent dans les handlers IPC.
 *  Les cibles sont résolues sous une racine autorisée depuis un chemin relatif.
 */

import {
  constants as fsConstants,
  copyFileSync,
  closeSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import {
  categoriserDocument,
  DOSSIER_DOCS_PROJET,
  DOSSIER_DOCS_PROJET_ANCIEN,
  estListable,
  estNomSain,
  estCheminDocsCadre,
  extensionDe,
  LIMITE_APERCU_BINAIRE_OCTETS,
  LIMITE_APERCU_PDF_OCTETS,
  LIMITE_APERCU_TEXTE_OCTETS,
  nomLibre,
  trierEntreesDocsCadre,
  type EntreeDocsCadre,
  type InventaireDossierDocsCadre,
  type SourceDocumentCadre,
  mimeImage,
  type RaisonSansApercu,
  type ResultatLectureDocsCadre,
  type ResultatMutationDocsCadre,
  type ResumeDocumentCadre,
} from '../shared/docsCadre'

/** Suffixe d'un fichier en cours de copie, lié atomiquement ensuite. */
const SUFFIXE_TMP = '.docs-tmp.tmp'

function dossierReel(dir: string, creer = false): boolean {
  try {
    if (creer) mkdirSync(dir, { recursive: true })
    const st = lstatSync(dir)
    return st.isDirectory() && !st.isSymbolicLink()
  } catch {
    return false
  }
}

/** Le nouveau nom est prioritaire ; l'ancien reste utilisé s'il est seul présent. */
export function racineDocsProjetLocal(racineCorpus: string): string {
  for (const nom of [DOSSIER_DOCS_PROJET, DOSSIER_DOCS_PROJET_ANCIEN]) {
    const dir = join(racineCorpus, nom)
    try {
      lstatSync(dir)
      return dir
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Dossier documentaire inaccessible.')
    }
  }
  return join(racineCorpus, DOSSIER_DOCS_PROJET)
}

function dossierDocsCadre(racineCorpus: string, creer = false): string {
  const dir = racineDocsProjetLocal(racineCorpus)
  if (!dossierReel(dir, creer)) throw new Error('Le dossier de documents est absent ou non sûr.')
  return dir
}

function resume(chemin: string, taille: number | null, modifieLe: Date | null): ResumeDocumentCadre {
  const nom = basename(chemin)
  return {
    nature: 'document',
    chemin,
    source: 'projet',
    nom,
    type: categoriserDocument(nom),
    taille,
    modifieLe: modifieLe ? modifieLe.toISOString() : null,
  }
}

function resumeExemple(chemin: string, taille: number | null): ResumeDocumentCadre {
  const nom = basename(chemin)
  return {
    nature: 'document',
    chemin,
    source: 'exemple',
    nom,
    type: categoriserDocument(nom),
    taille,
    modifieLe: null,
  }
}

/** Vérifie chaque composant sans suivre les liens symboliques. */
function resoudreSousRacine(racine: string, relatif: string, fichier = false): string {
  if (!estCheminDocsCadre(relatif, !fichier)) throw new Error('Chemin documentaire invalide.')
  try {
    const racineStat = lstatSync(racine)
    if (!racineStat.isDirectory() || racineStat.isSymbolicLink()) throw new Error('Dossier documentaire non sûr.')
    let cible = racine
    const segments = relatif ? relatif.split('/') : []
    for (const [index, segment] of segments.entries()) {
      cible = join(cible, segment)
      const st = lstatSync(cible)
      const finalFichier = fichier && index === segments.length - 1
      if (st.isSymbolicLink()) throw new Error('Document ou dossier non sûr.')
      if (!(finalFichier ? st.isFile() : st.isDirectory())) {
        throw Object.assign(new Error('Document ou dossier absent.'), { code: 'ENOENT' })
      }
    }
    return cible
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code
    throw Object.assign(new Error(code === 'ENOENT' ? 'Document ou dossier absent.' : 'Document ou dossier inaccessible.'), { code })
  }
}

/** Lit uniquement les enfants directs d'une racine documentaire autorisée. */
export function listerDossierDocsCadre(
  racine: string, source: SourceDocumentCadre, dossier = '',
): InventaireDossierDocsCadre {
  const resultat: InventaireDossierDocsCadre = { mode: 'local', source, dossier, entrees: [] }
  let dir: string
  try {
    dir = resoudreSousRacine(racine, dossier)
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'ENOENT') return { ...resultat, absent: true }
    throw erreur
  }
  const entrees: EntreeDocsCadre[] = []
  let noms: string[]
  try { noms = readdirSync(dir) } catch { throw new Error('Impossible de lire ce dossier.') }
  for (const nom of noms) {
    if (!estListable(nom)) continue
    try {
      const st = lstatSync(join(dir, nom))
      const chemin = dossier ? `${dossier}/${nom}` : nom
      if (!estCheminDocsCadre(chemin) || st.isSymbolicLink()) continue
      if (st.isDirectory()) entrees.push({ nature: 'dossier', source, nom, chemin })
      else if (st.isFile()) entrees.push({ ...resume(chemin, st.size, st.mtime), source })
    } catch {
      // Une entrée disparue pendant la lecture sera absente de la liste.
    }
  }
  return { ...resultat, entrees: trierEntreesDocsCadre(entrees) }
}

function statFichier(chemin: string): { estFichier: boolean; taille: number; modifieLe: Date | null } {
  const st = lstatSync(chemin)
  return {
    estFichier: st.isFile() && !st.isSymbolicLink(),
    taille: st.size,
    modifieLe: st.mtime,
  }
}

/** Lit depuis un descripteur unique, sans suivre un lien ni dépasser la limite. */
function lireFichierBorne(chemin: string, limite: number): Uint8Array | null {
  const sansSuivre = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
  const fd = openSync(chemin, fsConstants.O_RDONLY | sansSuivre)
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error('Le document n’est pas un fichier régulier.')
    if (st.size > limite) return null
    const octets = Buffer.alloc(st.size)
    let position = 0
    while (position < octets.byteLength) {
      const lus = readSync(fd, octets, position, octets.byteLength - position, position)
      if (lus === 0) break
      position += lus
    }
    return octets.subarray(0, position)
  } finally {
    closeSync(fd)
  }
}

/** Décode strictement en UTF-8 : un contenu dans un autre encodage ou binaire
 *  est REFUSÉ (message explicite), jamais réinterprété au hasard. */
function decoderTexteStrict(octets: Uint8Array): string | null {
  if (octets.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return null
  }
}

/** Signature minimale d'une image raster : l'extension annoncée ne suffit pas. */
function signatureImageValide(octets: Uint8Array, extension: string): boolean {
  const debute = (marqueur: readonly number[]): boolean =>
    marqueur.every((b, i) => octets[i] === b)
  switch (extension) {
    case 'png':
      return debute([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpg':
    case 'jpeg':
      return debute([0xff, 0xd8, 0xff])
    case 'gif':
      return debute([0x47, 0x49, 0x46, 0x38]) // GIF8
    case 'webp':
      return debute([0x52, 0x49, 0x46, 0x46]) // RIFF + WEBP à l'offset 8
    default:
      return false
  }
}

/** Signature minimale d'un PDF. */
function signaturePdfValide(octets: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => octets[i] === b)
}

/** Aperçu d'un fichier texte, image ou PDF du dossier ; les autres formats
 *  renvoient une absence expliquée (aucune conversion, aucune interprétation). */
function lireApercuFichier(dir: string, nom: string, source: 'projet' | 'exemple'): ResultatLectureDocsCadre {
  const chemin = join(dir, nom)
  if (!dossierReel(dir)) {
    return {
      resume: source === 'projet' ? resume(nom, null, null) : resumeExemple(nom, null),
      apercu: { genre: 'aucun', raison: 'absent' },
    }
  }
  let st
  try {
    st = statFichier(chemin)
  } catch {
    return {
      resume: source === 'projet' ? resume(nom, null, null) : resumeExemple(nom, null),
      apercu: { genre: 'aucun', raison: 'absent' },
    }
  }
  if (!st.estFichier) {
    return {
      resume: resume(nom, null, null),
      apercu: { genre: 'aucun', raison: 'invalide' },
    }
  }
  const type = categoriserDocument(nom)
  const monResume = source === 'projet' ? resume(nom, st.taille, st.modifieLe) : resumeExemple(nom, st.taille)
  const aucun = (raison: RaisonSansApercu): ResultatLectureDocsCadre => ({
    resume: monResume,
    apercu: { genre: 'aucun', raison },
  })
  if (type === 'texte') {
    if (st.taille > LIMITE_APERCU_TEXTE_OCTETS) return aucun('taille')
    try {
      const octets = lireFichierBorne(chemin, LIMITE_APERCU_TEXTE_OCTETS)
      if (octets === null) return aucun('taille')
      const contenu = decoderTexteStrict(octets)
      if (contenu === null) return aucun('encodage')
      return { resume: monResume, apercu: { genre: 'texte', contenu } }
    } catch {
      return aucun('lecture')
    }
  }
  if (type === 'image') {
    if (st.taille > LIMITE_APERCU_BINAIRE_OCTETS) return aucun('taille')
    try {
      const octets = lireFichierBorne(chemin, LIMITE_APERCU_BINAIRE_OCTETS)
      if (octets === null) return aucun('taille')
      if (!signatureImageValide(octets, extensionDe(nom))) return aucun('signature')
      return { resume: monResume, apercu: { genre: 'image', octets, mime: mimeImage(extensionDe(nom)) } }
    } catch {
      return aucun('lecture')
    }
  }
  if (type === 'pdf') {
    if (st.taille > LIMITE_APERCU_PDF_OCTETS) return aucun('taille')
    try {
      const octets = lireFichierBorne(chemin, LIMITE_APERCU_PDF_OCTETS)
      if (octets === null) return aucun('taille')
      if (!signaturePdfValide(octets)) return aucun('signature')
      return { resume: monResume, apercu: { genre: 'pdf', octets } }
    } catch {
      return aucun('lecture')
    }
  }
  // Bureautique, HTML et formats inconnus : fiche seule, affichés ailleurs.
  return aucun('format')
}

/* ── Corpus local ─────────────────────────────────────────────────────────── */

/** Inventaire des documents locaux ; dossier absent traité comme vide. */
export function inventaireDocsCadreLocal(racineCorpus: string, dossier = ''): EntreeDocsCadre[] {
  return listerDossierDocsCadre(racineDocsProjetLocal(racineCorpus), 'projet', dossier).entrees
}

/** Lecture d'un aperçu sur un document du corpus local. */
export function lireApercuLocal(racineCorpus: string, nom: string): ResultatLectureDocsCadre {
  return lireApercuSousRacine(racineDocsProjetLocal(racineCorpus), nom, 'projet')
}

/** Copie complète dans un temporaire, puis création exclusive de la cible. */
function copierAtomique(source: string, cible: string): void {
  const tmp = `${cible}.${randomUUID()}${SUFFIXE_TMP}`
  try {
    copyFileSync(source, tmp, fsConstants.COPYFILE_EXCL)
    linkSync(tmp, cible)
  } finally {
    rmSync(tmp, { force: true })
  }
}

/** Déplace un fichier dans le même volume sans jamais remplacer la cible. */
function deplacerSansEcraser(source: string, cible: string): void {
  linkSync(source, cible)
  try {
    unlinkSync(source)
  } catch (erreur) {
    unlinkSync(cible)
    throw erreur
  }
}

function erreurExiste(erreur: unknown): boolean {
  return (erreur as NodeJS.ErrnoException)?.code === 'EEXIST'
}

/** « Ajouter un fichier » : copie le fichier choisi dans le dossier du projet,
 *  (un document cadre fait partie du corpus, contrairement à l'audio). */
export function ajouterFichierLocal(
  racineCorpus: string,
  cheminSource: string,
  nomFinal?: string,
  dossier = '',
): ResultatMutationDocsCadre {
  const nom = nomFinal?.trim() || basename(cheminSource)
  if (!estListable(nom) || !estCheminDocsCadre(dossier, true) ||
      !estCheminDocsCadre(dossier ? `${dossier}/${nom}` : nom)) return { ok: false, raison: 'invalide' }
  let dir: string
  try {
    dir = resoudreSousRacine(dossierDocsCadre(racineCorpus, true), dossier)
    if (!statFichier(cheminSource).estFichier) return { ok: false, raison: 'absent' }
  } catch {
    return { ok: false, raison: 'lecture' }
  }
  const existants = listerNomsSurs(dir)
  const cible = join(dir, nom)
  if (collisions(nom, existants)) {
    return { ok: false, raison: 'existe', suggere: nomLibre(nom, existants) }
  }
  try {
    copierAtomique(cheminSource, cible)
  } catch (erreur) {
    if (erreurExiste(erreur)) {
      return { ok: false, raison: 'existe', suggere: nomLibre(nom, listerNomsSurs(dir)) }
    }
    return { ok: false, raison: 'lecture' }
  }
  return { ok: true, nom }
}

/** « Glisser-déposer » dans le dossier affiché : copie exacte (jamais un
 *  déplacement), création du dossier à la demande, et JAMAIS d'écrasement :
 *  un homonyme est refusé (aucun renommage automatique). Un dossier, un lien
 *  symbolique ou un fichier manquant est refusé par `raison: 'source'`. */
export function deposerFichierLocal(
  racineCorpus: string,
  cheminSource: string,
  dossier = '',
): ResultatMutationDocsCadre {
  try {
    if (!statFichier(cheminSource).estFichier) return { ok: false, raison: 'source' }
  } catch {
    return { ok: false, raison: 'source' }
  }
  return ajouterFichierLocal(racineCorpus, cheminSource, undefined, dossier)
}

/** Renommage : le contenu n'est jamais relu ni modifié, seuls les octets
 *  changent de nom. Refus des collisions, y compris insensibles à la casse. */
export function renommerLocal(racineCorpus: string, ancien: string, nouveau: string): ResultatMutationDocsCadre {
  if (!estNomSain(ancien) || !estNomSain(nouveau)) return { ok: false, raison: 'invalide' }
  let dir: string
  try {
    dir = dossierDocsCadre(racineCorpus)
  } catch {
    return { ok: false, raison: 'absent' }
  }
  const source = join(dir, ancien)
  const cible = join(dir, nouveau)
  if (!existeFichier(source)) return { ok: false, raison: 'absent' }
  if (ancien === nouveau) return { ok: true, nom: ancien }
  const existants = listerNomsSurs(dir).filter((n) => n !== ancien)
  if (collisions(nouveau, existants)) {
    return { ok: false, raison: 'existe', suggere: nomLibre(nouveau, existants) }
  }
  try {
    if (memeFichier(source, cible)) renameSync(source, cible)
    else deplacerSansEcraser(source, cible)
  } catch (erreur) {
    if (erreurExiste(erreur)) {
      return { ok: false, raison: 'existe', suggere: nomLibre(nouveau, listerNomsSurs(dir)) }
    }
    return { ok: false, raison: 'lecture' }
  }
  return { ok: true, nom: nouveau }
}

/** Suppression douce dans la corbeille documentaire, sans écrasement. */
export function supprimerLocal(racineCorpus: string, nom: string): ResultatMutationDocsCadre {
  if (!estNomSain(nom)) return { ok: false, raison: 'invalide' }
  let dir: string
  try {
    dir = dossierDocsCadre(racineCorpus)
  } catch {
    return { ok: false, raison: 'absent' }
  }
  const source = join(dir, nom)
  if (!existeFichier(source)) return { ok: false, raison: 'absent' }
  const racineCorbeille = join(racineCorpus, 'corbeille')
  const corbeille = join(racineCorbeille, basename(dir))
  try {
    if (!dossierReel(racineCorbeille, true) || !dossierReel(corbeille, true)) {
      return { ok: false, raison: 'lecture' }
    }
    for (let tentative = 0; tentative < 10; tentative++) {
      const cible = join(corbeille, nomLibre(nom, listerNomsSurs(corbeille)))
      try {
        deplacerSansEcraser(source, cible)
        return { ok: true, nom }
      } catch (erreur) {
        if (!erreurExiste(erreur)) throw erreur
      }
    }
  } catch {
    return { ok: false, raison: 'lecture' }
  }
  return { ok: false, raison: 'lecture' }
}

/** Résout le dossier local, en le créant sans accepter de lien symbolique. */
export function resoudreDossierLocal(racineCorpus: string, dossier = ''): string {
  if (!estCheminDocsCadre(dossier, true)) throw new Error('Dossier invalide.')
  return resoudreSousRacine(dossierDocsCadre(racineCorpus, true), dossier)
}

/** Création exclusive ; une entrée existante, même d'une autre casse, est refusée. */
export function creerDossierLocal(racineCorpus: string, parent: string, nom: string): ResultatMutationDocsCadre {
  if (!estListable(nom) || !estCheminDocsCadre(parent, true) ||
      !estCheminDocsCadre(parent ? `${parent}/${nom}` : nom)) return { ok: false, raison: 'invalide' }
  try {
    const dir = resoudreDossierLocal(racineCorpus, parent)
    if (collisions(nom, readdirSync(dir))) return { ok: false, raison: 'existe' }
    mkdirSync(join(dir, nom))
    return { ok: true, nom }
  } catch (erreur) {
    return { ok: false, raison: erreurExiste(erreur) ? 'existe' : 'lecture' }
  }
}

/** Chemin local validé, réservé aux actions du processus principal. */
export function resoudreLocal(racineCorpus: string, nom: string): string {
  return resoudreSousRacine(dossierDocsCadre(racineCorpus), nom, true)
}

/** Enregistre une COPIE EXACTE du fichier original vers une destination choisie
 *  (octet pour octet ; la copie n'est jamais une conversion). */
export function enregistrerCopieLocal(racineCorpus: string, nom: string, destination: string): void {
  copyFileSync(resoudreLocal(racineCorpus, nom), destination)
}

/* ── Exemples embarqués ──────────────────────────────────────────────────── */

/** Exemples consultables hors ligne avec la même navigation que le projet. */
export function inventaireExemplesDocsCadre(dirExemples: string, dossier = ''): EntreeDocsCadre[] {
  return listerDossierDocsCadre(dirExemples, 'exemple', dossier).entrees
}

/** Lecture d'un aperçu d'un exemple embarqué. */
export function lireApercuExemple(dirExemples: string, nom: string): ResultatLectureDocsCadre {
  return lireApercuSousRacine(dirExemples, nom, 'exemple')
}

/** Résout un exemple régulier sans suivre de lien symbolique. */
export function resoudreExemple(dirExemples: string, nom: string): string {
  return resoudreSousRacine(dirExemples, nom, true)
}

/** L'aperçu garde l'identité relative, jamais le chemin du poste. */
function lireApercuSousRacine(racine: string, chemin: string, source: SourceDocumentCadre): ResultatLectureDocsCadre {
  try {
    resoudreSousRacine(racine, chemin, true)
    const segments = chemin.split('/')
    const nom = segments.pop()!
    const resultat = lireApercuFichier(join(racine, ...segments), nom, source)
    return { ...resultat, resume: { ...resultat.resume, chemin } }
  } catch (erreur) {
    return {
      resume: { ...resume(chemin, null, null), source },
      apercu: { genre: 'aucun', raison: (erreur as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'invalide' },
    }
  }
}

/* ── Helpers internes ────────────────────────────────────────────────────── */

/** Toutes les entrées occupent un nom, y compris les dossiers et liens. */
function listerNomsSurs(dir: string): string[] {
  if (!dossierReel(dir)) return []
  let noms: string[]
  try {
    noms = readdirSync(dir)
  } catch {
    return []
  }
  return noms
}

/** Collision insensible à la casse : le même nom (existant) à la casse près
 *  est traité comme occupé, quel que soit le système de fichiers hôte. */
function collisions(nom: string, existants: readonly string[]): boolean {
  const cible = nom.toLowerCase()
  return existants.some((n) => n.toLowerCase() === cible)
}

function existeFichier(chemin: string): boolean {
  try {
    return statFichier(chemin).estFichier
  } catch {
    return false
  }
}

function memeFichier(a: string, b: string): boolean {
  try {
    const sa = lstatSync(a)
    const sb = lstatSync(b)
    return sa.dev === sb.dev && sa.ino === sb.ino
  } catch {
    return false
  }
}
