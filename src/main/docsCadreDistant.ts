/**
 *  Service des « Docs cadre projet » — corpus DISTANT (consultation WebDAV
 *  directe, sans miroir).
 *
 *  Le miroir actuel n'inventorie que la racine, `entretiens/` et les JSON
 *  attendus ; les documents de préparation restent lus directement sur le serveur.
 *  donne la version présente sur le serveur au moment de la lecture, aucune
 *  copie locale ne peut être confondue avec une version éditable, et les
 *  fichiers binaires ne gonflent pas le tirage.
 *
 *  Ce parcours est en LECTURE SEULE : aucune méthode PUT, MKCOL, MOVE ou
 *  DELETE n'est exposée ici. Un dossier absent (404, ancien corpus) équivaut
 *  à une liste vide ; les autres erreurs réseau remontent telles quelles.
 */

import { ClientWebDAV, ErreurHttp } from './webdav/client'
import {
  categoriserDocument,
  DOSSIER_DOCS_PROJET,
  DOSSIER_DOCS_PROJET_ANCIEN,
  type RacineDocsProjet,
  estListable,
  estCheminDocsCadre,
  extensionDe,
  LIMITE_APERCU_BINAIRE_OCTETS,
  LIMITE_APERCU_PDF_OCTETS,
  LIMITE_APERCU_TEXTE_OCTETS,
  mimeImage,
  trierEntreesDocsCadre,
  type ResultatLectureDocsCadre,
  type EntreeDocsCadre,
  type InventaireDossierDocsCadre,
} from '../shared/docsCadre'

/** Détecte l'ancien dossier sans aucune migration ni écriture sur le serveur. */
export async function racineDocsProjetDistant(client: ClientWebDAV): Promise<RacineDocsProjet> {
  let entrees
  try { entrees = await client.propfind('') }
  catch (erreur) {
    if (erreur instanceof ErreurHttp && erreur.statut === 404) return DOSSIER_DOCS_PROJET
    throw erreur
  }
  if (entrees.some((e) => e.chemin === DOSSIER_DOCS_PROJET)) return DOSSIER_DOCS_PROJET
  return entrees.some((e) => e.chemin === DOSSIER_DOCS_PROJET_ANCIEN)
    ? DOSSIER_DOCS_PROJET_ANCIEN : DOSSIER_DOCS_PROJET
}

/** Inventaire des documents du dossier distant. Dossier absent (corpus créé
 *  avant ce chantier) → liste vide, sans création cachée. */
export async function listerDossierDistant(client: ClientWebDAV, dossier = ''): Promise<InventaireDossierDocsCadre> {
  if (!estCheminDocsCadre(dossier, true)) throw new Error('Dossier documentaire invalide.')
  const resultat: InventaireDossierDocsCadre = { mode: 'distant', source: 'projet', dossier, entrees: [] }
  const racine = await racineDocsProjetDistant(client)
  let entrees
  try {
    entrees = await client.propfind(dossier ? `${racine}/${dossier}` : racine)
  } catch (e) {
    if (e instanceof ErreurHttp && e.statut === 404) return { ...resultat, absent: true }
    throw e
  }
  const enfants: EntreeDocsCadre[] = []
  for (const entree of entrees) {
    const nom = entree.chemin
    // Même si le serveur renvoie trop d'entrées, seuls les enfants directs comptent.
    if (!estListable(nom)) continue
    const chemin = dossier ? `${dossier}/${nom}` : nom
    if (!estCheminDocsCadre(chemin)) continue
    enfants.push(entree.dossier ? { nature: 'dossier', source: 'projet', nom, chemin } : {
      nature: 'document', source: 'projet', nom, chemin,
      type: categoriserDocument(nom), taille: entree.taille ?? null, modifieLe: null,
    })
  }
  return { ...resultat, entrees: trierEntreesDocsCadre(enfants) }
}

export async function inventaireDocsCadreDistant(client: ClientWebDAV, dossier = ''): Promise<EntreeDocsCadre[]> {
  return (await listerDossierDistant(client, dossier)).entrees
}

/** Décode strictement en UTF-8 : contenu binaire ou autre encodage refusé,
 *  jamais réinterprété (même garde que le service local). */
function decoderTexteStrict(octets: Uint8Array): string | null {
  if (octets.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    return null
  }
}

/** Signature minimale d'une image raster (extension mensongère refusée). */
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
      return debute([0x47, 0x49, 0x46, 0x38])
    case 'webp':
      return debute([0x52, 0x49, 0x46, 0x46])
    default:
      return false
  }
}

/** Signature minimale d'un PDF. */
function signaturePdfValide(octets: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => octets[i] === b)
}

/** Lecture d'un aperçu distant : PROPFIND du dossier (fiche + taille), puis
 *  GET des octets SEULEMENT si un aperçu est possible et la taille acceptable.
 *  Le 404 du fichier (disparu entre deux listes) est expliqué, pas levé. */
export async function lireApercuDistant(client: ClientWebDAV, relatif: string): Promise<ResultatLectureDocsCadre> {
  const segments = relatif.split('/')
  const nom = segments.pop() ?? ''
  const dossier = segments.join('/')
  let taille: number | null = null
  const aucun = (raison: Extract<ResultatLectureDocsCadre['apercu'], { genre: 'aucun' }>['raison']): ResultatLectureDocsCadre => ({
    resume: { nature: 'document', chemin: relatif, source: 'projet', nom, type: categoriserDocument(nom), taille, modifieLe: null },
    apercu: { genre: 'aucun', raison },
  })
  if (!estCheminDocsCadre(relatif)) return aucun('invalide')
  const racine = await racineDocsProjetDistant(client)
  try {
    const entrees = await client.propfind(dossier ? `${racine}/${dossier}` : racine)
    const entree = entrees.find((e) => !e.dossier && e.chemin === nom)
    if (!entree) return aucun('absent')
    taille = entree.taille ?? null
  } catch (e) {
    if (e instanceof ErreurHttp && e.statut === 404) return aucun('absent')
    throw e
  }
  const type = categoriserDocument(nom)
  const chemin = `${racine}/${relatif}`
  const lireBorne = async (limite: number): Promise<Uint8Array | null | 'absent'> => {
    try {
      return await client.getBinaireBorne(chemin, limite)
    } catch (erreur) {
      if (erreur instanceof ErreurHttp && erreur.statut === 404) return 'absent'
      throw erreur
    }
  }
  if (type === 'texte') {
    if (taille !== null && taille > LIMITE_APERCU_TEXTE_OCTETS) return aucun('taille')
    const octets = await lireBorne(LIMITE_APERCU_TEXTE_OCTETS)
    if (octets === 'absent') return aucun('absent')
    if (octets === null) return aucun('taille')
    const contenu = decoderTexteStrict(octets)
    if (contenu === null) return aucun('encodage')
    return {
      resume: { nature: 'document', chemin: relatif, source: 'projet', nom, type, taille: taille ?? octets.byteLength, modifieLe: null },
      apercu: { genre: 'texte', contenu },
    }
  }
  if (type === 'image') {
    if (taille !== null && taille > LIMITE_APERCU_BINAIRE_OCTETS) return aucun('taille')
    const octets = await lireBorne(LIMITE_APERCU_BINAIRE_OCTETS)
    if (octets === 'absent') return aucun('absent')
    if (octets === null) return aucun('taille')
    if (!signatureImageValide(octets, extensionDe(nom))) return aucun('signature')
    return {
      resume: { nature: 'document', chemin: relatif, source: 'projet', nom, type, taille: taille ?? octets.byteLength, modifieLe: null },
      apercu: { genre: 'image', octets, mime: mimeImage(extensionDe(nom)) },
    }
  }
  if (type === 'pdf') {
    if (taille !== null && taille > LIMITE_APERCU_PDF_OCTETS) return aucun('taille')
    const octets = await lireBorne(LIMITE_APERCU_PDF_OCTETS)
    if (octets === 'absent') return aucun('absent')
    if (octets === null) return aucun('taille')
    if (!signaturePdfValide(octets)) return aucun('signature')
    return {
      resume: { nature: 'document', chemin: relatif, source: 'projet', nom, type, taille: taille ?? octets.byteLength, modifieLe: null },
      apercu: { genre: 'pdf', octets },
    }
  }
  // Bureautique, HTML et formats inconnus : fiche seule, affichés ailleurs.
  return aucun('format')
}

/** Enregistre une COPIE EXACTE d'un fichier distant, EN FLUX vers la
 *  destination : la mémoire du poste ne porte jamais le fichier entier. */
export async function enregistrerCopieDistant(client: ClientWebDAV, nom: string, destination: string): Promise<void> {
  if (!estCheminDocsCadre(nom)) throw new Error('Nom de document invalide.')
  const racine = await racineDocsProjetDistant(client)
  await client.getBinaireFichier(`${racine}/${nom}`, destination)
}

/**
 *  Construit l'URL de l'application Fichiers Nextcloud vers le dossier du
 *  corpus. À partir d'une racine DAV de forme :
 *  `https://hote[/sous-chemin]/remote.php/dav/files/<utilisateur>/<corpus>`
 *  → `https://hote[/sous-chemin]/apps/files/?dir=/<corpus>/DocsPrepaProjet`.
 *
 *  Seul HTTPS est accepté (HTTP seulement sur un hôte local, comme le client).
 *  Toute racine non reconnue renvoie null : on refuse proprement plutôt que
 *  d'ouvrir une URL approximative. Le fichier précis n'est pas adressable
 *  (identifiant interne Nextcloud) — le dossier est le contrat fiable.
 */
export function urlNextcloudPourCorpus(baseUrl: string, dossier = '', racine: RacineDocsProjet = DOSSIER_DOCS_PROJET): string | null {
  if (!estCheminDocsCadre(dossier, true) || ![DOSSIER_DOCS_PROJET, DOSSIER_DOCS_PROJET_ANCIEN].includes(racine)) return null
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return null
  }
  const hoteLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && hoteLocal)) return null
  const segments = url.pathname.split('/').filter(Boolean)
  const i = segments.indexOf('remote.php')
  if (i === -1) return null
  const sousCheminDav = segments.slice(i + 1, i + 3)
  if (sousCheminDav[0] !== 'dav' || sousCheminDav[1] !== 'files') return null
  const corpus = segments.slice(i + 4) // i+3 = utilisateur
  if (corpus.length === 0) return null
  const prefixe = segments.slice(0, i)
  // Les segments arrivent déjà encodés dans `pathname` : on décode avant
  // d'encoder une seule fois, pour éviter le double %25.
  let dir: string
  try {
    dir = [...corpus.map(decodeURIComponent), racine, ...(dossier ? dossier.split('/') : [])]
      .map(encodeURIComponent).join('/')
  } catch {
    return null
  }
  const prefixeApp = prefixe.length > 0 ? `/${prefixe.join('/')}` : ''
  return `${url.origin}${prefixeApp}/apps/files/?dir=/${dir}`
}
