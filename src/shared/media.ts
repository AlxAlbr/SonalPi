/** Extensions et seuils MÉDIA — partagés main ↔ renderer (cas vidéo du plan audio distant).
 *  Source unique : le dialogue natif (main), la modale de désignation Nextcloud (renderer)
 *  et la waveform (renderer) doivent voir le même périmètre « média assignable ». */

export const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac']

export const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'ogv', 'avi']

/** Audio + vidéo : les deux sont assignables à un entretien (audioRef / audioDistant portent indifféremment l'un ou l'autre). */
export const EXT_MEDIA = [...EXT_AUDIO, ...EXT_VIDEO]

/** Extension d'un nom/chemin de fichier, sans point, en minuscules ('' si aucune). */
export function extensionDe(nom: string): string {
  const i = nom.lastIndexOf('.')
  const base = i === -1 ? '' : nom.slice(i + 1)
  return base.toLowerCase()
}

/** Type MIME de confiance par extension : la lecture à distance ne peut pas
 *  se fier au seul `Content-Type` d'un serveur, et ne doit rien inventer. */
const TYPE_PAR_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
}

/** Type servi au lecteur : celui qu'annonce le serveur s'il est bien un type
 *  audio ou vidéo, celui de l'extension sinon. Un type absent, générique ou
 *  incohérent ne vaut pas mieux qu'un `application/octet-stream`. */
export function typeMimeMedia(chemin: string, typeAnnonce?: string | null): string {
  const annonce = (typeAnnonce ?? '').split(';')[0].trim().toLowerCase()
  if (annonce.startsWith('audio/') || annonce.startsWith('video/')) return annonce
  return TYPE_PAR_EXTENSION[extensionDe(chemin)] ?? 'application/octet-stream'
}

/** Le fichier est-il dans le périmètre média assignable ? */
export function estMedia(nom: string): boolean {
  return EXT_MEDIA.includes(extensionDe(nom))
}

/**
 *  Seuil mémoire pour la GÉNÉRATION DE WAVEFORM uniquement (renderer : fetch
 *  complet + decodeAudioData). Les transferts réseau ne sont pas concernés :
 *  download ET upload sont STREAMÉS (`getBinaireFichier` / `putFichier`),
 *  sans limite de taille.
 */
export const TAILLE_MAX_MEDIA = 512 * 1024 * 1024 // 512 Mo
