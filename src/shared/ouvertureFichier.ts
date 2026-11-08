import { FORMAT_VERSION, type CorpusFichier, type OuvertureCorpus } from './format'
import { analyserCrp, type ApercuCrp } from './corpus/migrationCrp'

export type ClassificationCorpus =
  | { type: 'v2'; corpus: CorpusFichier }
  | { type: 'v1'; apercu: ApercuCrp }

function objet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** Valide les blocs nécessaires au store, sans retirer les champs optionnels. */
export function validerCorpusV2(v: unknown): asserts v is CorpusFichier {
  if (!objet(v) || !Number.isInteger(v.formatVersion) || (v.formatVersion as number) < 1 || (v.formatVersion as number) > FORMAT_VERSION) {
    throw new Error('Version de corpus V2 non supportée.')
  }
  for (const cle of ['codebook', 'variables', 'reglesAnon', 'membership']) {
    if (!objet(v[cle])) throw new Error(`Structure de corpus invalide : ${cle}.`)
  }
  if (v.personnes !== undefined && !objet(v.personnes)) throw new Error('Structure de corpus invalide : personnes.')
  if (v.nom !== undefined && typeof v.nom !== 'string') throw new Error('Nom de corpus invalide.')
  for (const [id, ref] of Object.entries(v.membership as Record<string, unknown>)) {
    if (!/^[^\\/:*?"<>|\u0000-\u001f]+$/.test(id) || id === '.' || id === '..'
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id)
      || !objet(ref) || typeof ref.titre !== 'string'
      || (ref.date !== null && typeof ref.date !== 'string') || typeof ref.lastModified !== 'string') {
      throw new Error('Référence d’entretien invalide dans le corpus.')
    }
  }
  for (const c of Object.values(v.codebook as Record<string, unknown>)) {
    if (!objet(c) || typeof c.id !== 'string' || typeof c.nom !== 'string'
      || typeof c.ordre !== 'number' || typeof c.actif !== 'boolean'
      || (c.parent !== null && typeof c.parent !== 'string') || typeof c.codeExport !== 'string') {
      throw new Error('Définition de thème invalide.')
    }
  }
  for (const c of Object.values(v.variables as Record<string, unknown>)) {
    if (!objet(c) || typeof c.id !== 'string' || typeof c.lib !== 'string'
      || !['entretien', 'locuteur'].includes(c.portee as string)
      || typeof c.priv !== 'boolean' || typeof c.ordre !== 'number' || typeof c.vExport !== 'number'
      || !Array.isArray(c.modalites) || c.modalites.some((m) => !objet(m)
        || typeof m.id !== 'string' || typeof m.lib !== 'string' || typeof m.mExport !== 'number')) {
      throw new Error('Définition de variable invalide.')
    }
  }
  for (const r of Object.values(v.reglesAnon as Record<string, unknown>)) {
    if (!objet(r) || typeof r.id !== 'string' || !Array.isArray(r.entite)
      || !Array.isArray(r.pseudos) || [...r.entite, ...r.pseudos].some((s) => typeof s !== 'string')) {
      throw new Error('Règle d’anonymisation invalide.')
    }
  }
  if (v.categoriesNote != null && (!Array.isArray(v.categoriesNote)
    || v.categoriesNote.some((c) => !objet(c)))) {
    throw new Error('Catégories de note invalides.')
  }
  if (v.paramsAnon != null) {
    const p = v.paramsAnon
    if (!objet(p) || (p.prioriteValidation !== undefined && !['corpus', 'entretien'].includes(p.prioriteValidation as string))) {
      throw new Error('Paramètres d’anonymisation invalides.')
    }
    for (const cle of ['motsLiaison', 'thematiques']) {
      const liste = p[cle]
      if (liste != null && (!objet(liste)
        || (liste.actif !== undefined && typeof liste.actif !== 'boolean')
        || (liste.liste !== undefined && (!Array.isArray(liste.liste) || liste.liste.some((s) => typeof s !== 'string'))))) {
        throw new Error('Liste des paramètres d’anonymisation invalide.')
      }
    }
  }
  if (v.demo != null && (!objet(v.demo) || typeof v.demo.racineSources !== 'string')) {
    throw new Error('Marqueur de démonstration invalide.')
  }
}

/** Reconnaît le contenu, jamais l'extension seule. Un marqueur V2 interdit le repli V1. */
export function classifierCorpus(contenu: string, nomFichier?: string): ClassificationCorpus {
  let v: unknown
  try { v = JSON.parse(contenu.replace(/^\uFEFF/, '')) }
  catch { throw new Error('Fichier .crp illisible : JSON invalide.') }
  if (!objet(v)) throw new Error('Le fichier n’est pas un corpus JSON.')
  const marqueursV2 = ['formatVersion', 'membership', 'codebook', 'reglesAnon', 'personnes']
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
