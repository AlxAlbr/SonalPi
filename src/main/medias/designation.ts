import type {
  MotifIndisponibiliteMedia,
  ResultatListeDossierMedia,
} from '../../shared/distant'
import { estMedia } from '../../shared/media'
import { ErreurDelaiWebDAV, ErreurHttp, type ClientWebDAV } from '../webdav/client'
import { ErreurLectureMedia, informationMedia } from '../webdav/lectureMedia'

class ErreurCheminMedia extends Error {}

/** Un chemin publié reste relatif au dossier média et sans encodage ambigu. */
export function verifierCheminMediaRelatif(chemin: string, dossier = false): string {
  if (
    !chemin ||
    chemin.startsWith('/') ||
    chemin.endsWith('/') ||
    chemin.includes('\\') ||
    chemin.includes('?') ||
    chemin.includes('#') ||
    /%[0-9a-f]{2}/i.test(chemin) ||
    /[\u0000-\u001f\u007f]/.test(chemin)
  ) {
    throw new ErreurCheminMedia('Chemin de média invalide.')
  }
  const segments = chemin.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new ErreurCheminMedia('Chemin de média invalide.')
  }
  if (!dossier && !estMedia(segments.at(-1) ?? '')) {
    throw new ErreurCheminMedia('Ce fichier n’est pas un média désignable.')
  }
  return chemin
}

/** Inventorie un dossier de la base sans jamais rendre son adresse au renderer. */
export async function listerDossierMedia(
  client: ClientWebDAV,
  dossier: string,
): Promise<ResultatListeDossierMedia> {
  try {
    if (dossier) verifierCheminMediaRelatif(dossier, true)
    const entrees = (await client.propfind(dossier))
      .filter((entree) => nomEnfantSain(entree.chemin))
      .map((entree) => ({
        nom: entree.chemin,
        dossier: entree.dossier,
      }))
      .sort((a, b) =>
        a.dossier !== b.dossier ? (a.dossier ? -1 : 1) : a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0,
      )
    return { ok: true, entrees }
  } catch (erreur) {
    const motif = motifIndisponibilite(erreur)
    return { ok: false, motif: motif === 'fichier-absent' ? 'dossier-absent' : motif }
  }
}

/** Vérifie l'existence du fichier par HEAD/PROPFIND, sans lire son contenu. */
export async function verifierMediaDesignable(
  client: ClientWebDAV,
  chemin: string,
): Promise<{ ok: true } | { ok: false; motif: MotifIndisponibiliteMedia }> {
  try {
    verifierCheminMediaRelatif(chemin)
    await informationMedia(client, chemin)
    return { ok: true }
  } catch (erreur) {
    return { ok: false, motif: motifIndisponibilite(erreur) }
  }
}

function nomEnfantSain(nom: string): boolean {
  if (!nom || nom === '.' || nom === '..') return false
  if (nom.includes('/') || nom.includes('\\') || nom.includes('?') || nom.includes('#')) return false
  if (/%[0-9a-f]{2}/i.test(nom) || /[\u0000-\u001f\u007f]/.test(nom)) return false
  return true
}

function motifIndisponibilite(erreur: unknown): MotifIndisponibiliteMedia {
  if (erreur instanceof ErreurCheminMedia) return 'chemin-invalide'
  if (erreur instanceof ErreurLectureMedia) {
    if (erreur.motif === 'fichier-absent') return 'fichier-absent'
    if (erreur.motif === 'droits') return 'droits'
    return 'indisponible'
  }
  if (erreur instanceof ErreurHttp) {
    if (erreur.statut === 401 || erreur.statut === 403) return 'droits'
    if (erreur.statut === 404) return 'fichier-absent'
  }
  if (erreur instanceof ErreurDelaiWebDAV) return 'indisponible'
  return 'indisponible'
}
