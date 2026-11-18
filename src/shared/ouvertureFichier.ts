import type { CorpusFichier, OuvertureCorpus } from './format'
import { analyserCrp, type ApercuCrp } from './corpus/migrationCrp'
import { versionNativeReconnue } from './versionsNatives'
import { objet, validerBlocsCorpus } from './natif/validationCommune'

export type ClassificationCorpus =
  | { type: 'v2'; corpus: CorpusFichier }
  | { type: 'v1'; apercu: ApercuCrp }

/** Valide les blocs nécessaires au store, sans retirer les champs optionnels. */
export function validerCorpusV2(v: unknown): asserts v is CorpusFichier {
  if (!objet(v) || !versionNativeReconnue(v.formatVersion)) {
    throw new Error('Version de corpus V2 non supportée.')
  }
  validerBlocsCorpus(v, ['entretien', 'locuteur'])
  if (v.personnes !== undefined && !objet(v.personnes)) throw new Error('Structure de corpus invalide : personnes.')
}

/** Reconnaît le contenu, jamais l'extension seule. Un marqueur V2 interdit le repli V1. */
export function classifierCorpus(contenu: string, nomFichier?: string): ClassificationCorpus {
  let v: unknown
  try { v = JSON.parse(contenu.replace(/^\uFEFF/, '')) }
  catch { throw new Error('Fichier .crp illisible : JSON invalide.') }
  if (!objet(v)) throw new Error('Le fichier n’est pas un corpus JSON.')
  const marqueursV2 = ['formatVersion', 'membership', 'codebook', 'reglesAnon', 'personnes', 'locuteurs']
  const estV2 = marqueursV2.some((k) => k in v)
  const estV1 = ['tabEnt', 'tabThm', 'tabVar', 'tabDic', 'tabDat', 'tabAnon'].some((k) => k in v)
  if (estV2 && estV1) throw new Error('Format de corpus ambigu : marqueurs V1 et V2 mélangés.')
  if (estV2) {
    validerCorpusV2(v)
    return { type: 'v2', corpus: v }
  }
  const analyse = analyserCrp(contenu.replace(/^\uFEFF/, ''), nomFichier)
  if (!analyse.ok) throw new Error(analyse.message)
  return { type: 'v1', apercu: analyse.apercu }
}

export type CibleOuvertureFichier =
  | { type: 'local'; jeton: string; manquants: string[] }
  | { type: 'migration'; chemin: string }
  | { type: 'distant'; id: string; fournisseur: 'webdav' | 'gitlab' }
  | { type: 'deja-ouvert' }
  | { type: 'apprentissage' }

export interface DemandeOuvertureExterne {
  chemin: string
  multiple: boolean
}

export interface OuvertureAuDemarrage {
  demande: DemandeOuvertureExterne | null
  demandeRefusee: boolean
}

export interface PontOuvertureFichier {
  choisir: () => Promise<string | null>
  preparer: (chemin: string) => Promise<CibleOuvertureFichier>
  finaliser: (jeton: string) => Promise<OuvertureCorpus>
  annuler: (jeton: string) => Promise<void>
  pret: () => Promise<OuvertureAuDemarrage>
  surDemande: (cb: (demande: DemandeOuvertureExterne) => void) => () => void
}
