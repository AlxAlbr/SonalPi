/**
 *  Service des « Docs cadre projet » — corpus LOCAL et exemples embarqués.
 *
 *  Responsabilités : inventaire, catégorisation et tri des fichiers de
 *  `DocsCadre/` ; lecture bornée pour les aperçus (texte, images, PDF) ; copie
 *  atomique d'un fichier choisi ; renommage sans écrasement ; déplacement vers
 *  la corbeille douce ; lecture des exemples embarqués.
 *
 *  Le module est PUR de tout Electron : les ouvertures externes
 *  (`shell.openPath`, dialogues) restent dans les handlers IPC de `index.ts`,
 *  qui résolvent ici la cible validée. Le renderer ne transmet jamais qu'une
 *  source et un nom ; aucune opération ne reçoit de chemin arbitraire.
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
  estListable,
  estNomSain,
  extensionDe,
  LIMITE_APERCU_BINAIRE_OCTETS,
  LIMITE_APERCU_PDF_OCTETS,
  LIMITE_APERCU_TEXTE_OCTETS,
  nomLibre,
  trierDocuments,
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

function dossierDocsCadre(racineCorpus: string, creer = false): string {
  const dir = join(racineCorpus, 'DocsCadre')
  if (!dossierReel(dir, creer)) throw new Error('Le dossier DocsCadre est absent ou non sûr.')
  return dir
}

function resume(nom: string, taille: number | null, modifieLe: Date | null): ResumeDocumentCadre {
  return {
    source: 'projet',
    nom,
    type: categoriserDocument(nom),
    taille,
    modifieLe: modifieLe ? modifieLe.toISOString() : null,
  }
}

function resumeExemple(nom: string, taille: number | null): ResumeDocumentCadre {
  return {
    source: 'exemple',
    nom,
    type: categoriserDocument(nom),
    taille,
    modifieLe: null,
  }
}

/** Inventaire des fichiers réguliers de PREMIER niveau d'un dossier, triés
 *  alphabétiquement. Dossier absent, fichier ou non-dossier → liste vide. */
function inventaireDossier(dir: string): ResumeDocumentCadre[] {
  let entrees: string[]
  try {
    if (!dossierReel(dir)) return []
    entrees = readdirSync(dir)
  } catch {
    return [] // dossier pas encore créé : état vide, jamais une erreur
  }
  const resultats: ResumeDocumentCadre[] = []
  for (const nom of entrees) {
    if (!estListable(nom)) continue
    try {
      const st = statFichier(join(dir, nom))
      if (!st.estFichier) continue
      resultats.push(resume(nom, st.taille, st.modifieLe))
    } catch {
      /* entrée disparue ou illisible en cours de liste : on passe */
    }
  }
  return trierDocuments(resultats)
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

/** Inventaire des documents du corpus local (dossier `DocsCadre/` absent → vide). */
export function inventaireDocsCadreLocal(racineCorpus: string): ResumeDocumentCadre[] {
  return inventaireDossier(join(racineCorpus, 'DocsCadre'))
}

/** Lecture d'un aperçu sur un document du corpus local. */
export function lireApercuLocal(racineCorpus: string, nom: string): ResultatLectureDocsCadre {
  if (!estNomSain(nom)) {
    return {
      resume: resume(nom, null, null),
      apercu: { genre: 'aucun', raison: 'invalide' },
    }
  }
  return lireApercuFichier(join(racineCorpus, 'DocsCadre'), nom, 'projet')
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

/** « Ajouter un fichier » : COPIE le fichier choisi dans `DocsCadre/`
 *  (un document cadre fait partie du corpus, contrairement à l'audio). */
export function ajouterFichierLocal(
  racineCorpus: string,
  cheminSource: string,
  nomFinal?: string,
): ResultatMutationDocsCadre {
  const nom = nomFinal?.trim() || basename(cheminSource)
  if (!estNomSain(nom)) return { ok: false, raison: 'invalide' }
  let dir: string
  try {
    dir = dossierDocsCadre(racineCorpus, true)
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

/** « Glisser-déposer » vers `DocsCadre/` : copie exacte (jamais un
 *  déplacement), création du dossier à la demande, et JAMAIS d'écrasement :
 *  un homonyme est refusé (aucun renommage automatique). Un dossier, un lien
 *  symbolique ou un fichier manquant est refusé par `raison: 'source'`. */
export function deposerFichierLocal(
  racineCorpus: string,
  cheminSource: string,
): ResultatMutationDocsCadre {
  try {
    if (!statFichier(cheminSource).estFichier) return { ok: false, raison: 'source' }
  } catch {
    return { ok: false, raison: 'source' }
  }
  return ajouterFichierLocal(racineCorpus, cheminSource)
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

/** Suppression douce : le fichier part sous `corbeille/DocsCadre/` avec un nom
 *  non destructif. La restauration graphique est hors périmètre. */
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
  const corbeille = join(racineCorbeille, 'DocsCadre')
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
export function resoudreDossierLocal(racineCorpus: string): string {
  return dossierDocsCadre(racineCorpus, true)
}

/** Chemin ABSOLU et validé d'un document local, pour une ouverture externe.
 *  Le renderer ne transmet qu'un nom ; l'appelant (handler IPC) passe ce
 *  chemin à `shell.openPath`. */
export function resoudreLocal(racineCorpus: string, nom: string): string {
  if (!estNomSain(nom)) throw new Error(`Nom de document invalide : ${JSON.stringify(nom)}.`)
  const chemin = join(dossierDocsCadre(racineCorpus), nom)
  if (!existeFichier(chemin)) throw new Error(`Le document ${nom} n'existe pas.`)
  return chemin
}

/** Enregistre une COPIE EXACTE du fichier original vers une destination choisie
 *  (octet pour octet ; la copie n'est jamais une conversion). */
export function enregistrerCopieLocal(racineCorpus: string, nom: string, destination: string): void {
  copyFileSync(resoudreLocal(racineCorpus, nom), destination)
}

/* ── Exemples embarqués ──────────────────────────────────────────────────── */

/** Inventaire des exemples livrés avec l'application. Toujours consultables,
 *  y compris quand un corpus distant est hors ligne. */
export function inventaireExemplesDocsCadre(dirExemples: string): ResumeDocumentCadre[] {
  const resultats = inventaireDossier(dirExemples).map((r) => ({ ...r, source: 'exemple' as const }))
  return trierDocuments(resultats)
}

/** Lecture d'un aperçu d'un exemple embarqué. */
export function lireApercuExemple(dirExemples: string, nom: string): ResultatLectureDocsCadre {
  if (!estNomSain(nom)) {
    return { resume: resumeExemple(nom, null), apercu: { genre: 'aucun', raison: 'invalide' } }
  }
  return lireApercuFichier(dirExemples, nom, 'exemple')
}

/** Résout un exemple régulier sans suivre de lien symbolique. */
export function resoudreExemple(dirExemples: string, nom: string): string {
  if (!estNomSain(nom) || !dossierReel(dirExemples)) throw new Error('Nom de document invalide.')
  const chemin = join(dirExemples, nom)
  if (!existeFichier(chemin)) throw new Error(`L’exemple ${nom} n'existe pas.`)
  return chemin
}

/* ── Helpers internes ────────────────────────────────────────────────────── */

/** Noms listables réels du dossier, en excluant tout ce qui n'est pas un
 *  fichier régulier : dossier, lien symbolique, temporaire, caché. */
function listerNomsSurs(dir: string): string[] {
  if (!dossierReel(dir)) return []
  let noms: string[]
  try {
    noms = readdirSync(dir)
  } catch {
    return []
  }
  return noms.filter((nom) => {
    if (!estListable(nom)) return false
    try {
      return statFichier(join(dir, nom)).estFichier
    } catch {
      return false
    }
  })
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
