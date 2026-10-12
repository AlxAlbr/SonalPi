import type { RegleAnon } from '../format'
import { aliasesCommuns, dedupliquerValeursAnon, validerDefinitionAnon, type DefinitionAnon } from './definitionsAnon'

export interface DocumentCorrespondance { nom: string; texte: string }
export interface EntreeCorrespondanceLue {
  id: string
  fichier: string
  nature: 'texte' | 'locuteur' | 'inconnue'
  portee?: 'corpus' | 'texte-local'
  entite: unknown
  pseudos: unknown
  categorie?: unknown
  entretiensOrigine?: string[]
  erreur?: string
  etatLocal?: 'declaration' | 'brouillon'
  originesLocuteurs?: Array<{ entretienId: string; locuteurIndex: number; pseudoEtat?: 'confirme' | 'refuse' }>
}
export type ChoixImportCorrespondance = 'ignorer' | 'ajouter' | 'variante' | 'remplacer'
export interface LigneImportCorrespondance extends EntreeCorrespondanceLue {
  definition?: DefinitionAnon
  etat: 'ajout' | 'identique' | 'divergence' | 'invalide' | 'hors-perimetre'
  motif?: string
  regleId?: string
  choix: ChoixImportCorrespondance[]
  defaut: ChoixImportCorrespondance
}
export interface ApercuImportCorrespondance {
  token: string; lignes: LigneImportCorrespondance[]; lecture: 'local' | 'miroir' | 'gitlab' | 'webdav'
  cibles?: import('./importCorrespondancesEntretiens').CibleImportCorrespondance[]
  indisponibles?: Array<{ id: string; titre: string }>
}
export interface SuiviImportCorrespondances {
  operationId: string
  confirmes: number
  restants: number
  indeterminee: boolean
  cibles: Array<{ entretienId: string; titre: string; etat: 'a-faire' | 'envoi' | 'confirme' | 'garde' }>
  definitionsCorpus: boolean
  bilanPrevu: BilanImportCorrespondance
}
export interface CorrectionCorrespondance { id: string; entite?: unknown; pseudos?: unknown; categorie?: unknown }
export interface BilanImportCorrespondance {
  ajouts: number; variantes: number; remplacements: number; ignores: number
  entretiens?: import('./importCorrespondancesEntretiens').BilanImportEntretiens
}
const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const cle = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr')
const ensemble = (vs: string[]) => JSON.stringify([...new Set(vs.map(cle))].sort())

/** Les compteurs et positions d'une table importée ne matérialisent jamais de décision. */
export function decoderCorrespondances(documents: DocumentCorrespondance[]): EntreeCorrespondanceLue[] {
  const entrees: EntreeCorrespondanceLue[] = []
  documents.forEach((document, f) => {
    let contenu: unknown
    try { contenu = JSON.parse(document.texte.replace(/^\uFEFF/, '')) }
    catch { entrees.push({ id: `${f}:json`, fichier: document.nom, nature: 'inconnue', entite: [], pseudos: [], erreur: 'JSON invalide.' }); return }
    const v1 = Array.isArray(contenu)
    const lignes = Array.isArray(contenu) ? contenu : objet(contenu) && contenu.format === 'sonalpi-correspondances' && contenu.version === 2 && Array.isArray(contenu.correspondances) ? contenu.correspondances : null
    if (!lignes) { entrees.push({ id: `${f}:format`, fichier: document.nom, nature: 'inconnue', entite: [], pseudos: [], erreur: 'Format inconnu ou version non prise en charge.' }); return }
    const groupesV1 = new Map<string, EntreeCorrespondanceLue>()
    lignes.forEach((ligne: unknown, n: number) => {
      const base = { id: `${f}:${n}`, fichier: document.nom }
      if (!objet(ligne)) { entrees.push({ ...base, nature: 'inconnue', entite: [], pseudos: [], erreur: 'La ligne doit être un objet.' }); return }
      if (v1) {
        const pseudos = [ligne.entite_pseudo, ...(ligne.entite_pseudo_alt !== undefined ? [ligne.entite_pseudo_alt] : [])]
        const entree: EntreeCorrespondanceLue = { ...base, nature: 'texte', portee: 'corpus', entite: ligne.entite_init, pseudos, categorie: ligne.thematique }
        if (typeof ligne.entite_init === 'string' && pseudos.every((p) => typeof p === 'string')) {
          const idGroupe = JSON.stringify([cle(ligne.entite_init), ligne.thematique ?? null])
          const groupe = groupesV1.get(idGroupe)
          if (groupe) { groupe.pseudos = dedupliquerValeursAnon([...(groupe.pseudos as string[]), ...(pseudos as string[])]); return }
          groupesV1.set(idGroupe, entree)
        }
        entrees.push(entree)
      } else if (ligne.nature === 'texte' && (ligne.portee === 'corpus' || ligne.portee === 'texte-local')) {
        entrees.push({ ...base, nature: 'texte', portee: ligne.portee, entite: ligne.entite, pseudos: ligne.pseudos, categorie: ligne.categorie, entretiensOrigine: typeof ligne.entretienId === 'string' ? [ligne.entretienId] : undefined,
          ...(ligne.etatLocal === 'declaration' || ligne.etatLocal === 'brouillon' ? { etatLocal: ligne.etatLocal } : {}),
          ...(ligne.etatLocal !== undefined && ligne.etatLocal !== 'declaration' && ligne.etatLocal !== 'brouillon' ? { erreur: 'État de définition locale invalide.' } : {}),
        })
      } else if (ligne.nature === 'locuteur') {
        entrees.push({ ...base, nature: 'locuteur', entite: ligne.nom, pseudos: [ligne.pseudo], entretiensOrigine: Array.isArray(ligne.origines) ? [...new Set(ligne.origines.flatMap((o) => objet(o) && typeof o.entretienId === 'string' ? [o.entretienId] : []))] : undefined,
          originesLocuteurs: Array.isArray(ligne.origines) ? ligne.origines.flatMap((o) => objet(o) && typeof o.entretienId === 'string' && Number.isInteger(o.locuteurIndex) && (o.pseudoEtat === undefined || o.pseudoEtat === 'confirme' || o.pseudoEtat === 'refuse') ? [{ entretienId: o.entretienId, locuteurIndex: o.locuteurIndex as number, ...(o.pseudoEtat ? { pseudoEtat: o.pseudoEtat as 'confirme' | 'refuse' } : {}) }] : []) : [],
          ...(typeof ligne.nom !== 'string' || !ligne.nom.trim() || typeof ligne.pseudo !== 'string' || !ligne.pseudo.trim() ? { erreur: 'Nom ou pseudo de locuteur invalide.' } : {}),
          ...(Array.isArray(ligne.origines) && ligne.origines.some((o) => objet(o) && o.pseudoEtat !== undefined && o.pseudoEtat !== 'confirme' && o.pseudoEtat !== 'refuse') ? { erreur: 'Décision de locuteur invalide.' } : {}),
        })
      } else entrees.push({ ...base, nature: 'inconnue', entite: [], pseudos: [], erreur: 'Nature ou portée V2 invalide.' })
    })
  })
  return entrees
}

export function preparerImportCorrespondances(entrees: EntreeCorrespondanceLue[], regles: RegleAnon[], corrections: CorrectionCorrespondance[] = []): LigneImportCorrespondance[] {
  const ids = new Set(entrees.map((e) => e.id))
  const corrigees = new Map<string, CorrectionCorrespondance>()
  for (const correction of corrections) {
    if (!ids.has(correction.id) || corrigees.has(correction.id)) throw new Error('Correction inconnue ou répétée.')
    corrigees.set(correction.id, correction)
  }
  const lignes: LigneImportCorrespondance[] = entrees.map((original) => {
    const correction = corrigees.get(original.id)
    const entree = correction && original.nature === 'texte' && !original.erreur
      ? { ...original,
        ...(Object.hasOwn(correction, 'entite') ? { entite: correction.entite } : {}),
        ...(Object.hasOwn(correction, 'pseudos') ? { pseudos: correction.pseudos } : {}),
        ...(Object.hasOwn(correction, 'categorie') ? { categorie: correction.categorie } : {}),
      } : original
    const base = { ...entree, choix: ['ignorer'] as ChoixImportCorrespondance[], defaut: 'ignorer' as const }
    if (entree.erreur) return { ...base, etat: 'invalide', motif: entree.erreur }
    if (entree.nature === 'locuteur') return { ...base, etat: 'hors-perimetre', motif: 'Import ciblé : choisissez explicitement les locuteurs locaux. Aucune Personne ni règle textuelle ne sera créée.' }
    let definition: DefinitionAnon
    try { definition = validerDefinitionAnon(entree.entite, entree.pseudos, entree.categorie, entree.portee === 'texte-local' && entree.etatLocal === 'brouillon') }
    catch (e) { return { ...base, etat: 'invalide', motif: e instanceof Error ? e.message : 'Définition invalide.' } }
    if (entree.portee === 'texte-local') return { ...base, definition, etat: 'hors-perimetre', motif: 'Import ciblé de la définition locale uniquement, sans positions ni décisions. Aucune promotion implicite.' }
    const communes = regles.filter((r) => aliasesCommuns(r.entite, definition.entite))
    if (!communes.length) return { ...base, definition, etat: 'ajout', choix: ['ignorer', 'ajouter'], defaut: 'ajouter' }
    if (communes.length > 1 || ensemble(communes[0].entite) !== ensemble(definition.entite)) return {
      ...base, definition, etat: 'invalide', motif: 'Chevauchement partiel ou ambigu d’alias. Corrigez le groupe ; aucun alias ne sera abandonné.',
    }
    const existante = communes[0]
    if (ensemble(existante.pseudos) === ensemble(definition.pseudos) && (definition.categorie === undefined || definition.categorie === existante.categorie)) {
      return { ...base, definition, etat: 'identique', regleId: existante.id }
    }
    const choix: ChoixImportCorrespondance[] = ['ignorer']
    if (definition.pseudos.some((p) => !existante.pseudos.some((e) => cle(e) === cle(p)))) {
      try { validerDefinitionAnon(existante.entite, dedupliquerValeursAnon([...existante.pseudos, ...definition.pseudos])); choix.push('variante') } catch { /* Le choix incompatible n'est pas proposé. */ }
    }
    choix.push('remplacer')
    return { ...base, definition, etat: 'divergence', regleId: existante.id, choix,
      motif: 'Ajouter une variante conserve la catégorie existante. Remplacer change uniquement la définition ; les pseudos déjà choisis dans les textes ne sont pas renommés.' }
  })
  for (const ligne of lignes) {
    if (!ligne.definition || ligne.etat !== 'ajout') continue
    if (lignes.some((autre) => autre !== ligne && autre.definition && autre.portee === 'corpus' && aliasesCommuns(ligne.definition!.entite, autre.definition.entite))) {
      ligne.etat = 'divergence'; ligne.defaut = 'ignorer'
      ligne.motif = 'Plusieurs définitions importées partagent des alias. Retenez explicitement une seule définition ou corrigez les groupes.'
    }
  }
  return lignes
}

/** Prépare toutes les définitions sur une copie avant la seule écriture de corpus. */
export function appliquerImportCorrespondances(regles: Record<string, RegleAnon>, lignes: LigneImportCorrespondance[], choix: Record<string, ChoixImportCorrespondance>, genId: () => string) {
  const resultat = structuredClone(regles)
  const bilan: BilanImportCorrespondance = { ajouts: 0, variantes: 0, remplacements: 0, ignores: 0 }
  if (Object.keys(choix).some((id) => !lignes.some((l) => l.id === id))) throw new Error('Choix d’import inconnu.')
  for (const ligne of lignes) {
    const action = Object.hasOwn(choix, ligne.id) ? choix[ligne.id] : ligne.defaut
    if (!ligne.choix.includes(action)) throw new Error('Résolution non autorisée pour cette ligne.')
    if (action === 'ignorer') { bilan.ignores++; continue }
    if (!ligne.definition) throw new Error('Définition importée invalide.')
    const definition = validerDefinitionAnon(ligne.definition.entite, ligne.definition.pseudos, ligne.definition.categorie)
    const communes = Object.values(resultat).filter((r) => aliasesCommuns(r.entite, definition.entite))
    if (action === 'ajouter') {
      if (communes.length) throw new Error('Deux choix importés se recouvrent. Retenez une seule définition.')
      const id = genId()
      if (!id || id === '__proto__' || Object.hasOwn(resultat, id)) throw new Error('Identifiant de règle invalide.')
      resultat[id] = { id, ...definition }; bilan.ajouts++
    } else {
      const existante = communes[0]
      if (communes.length !== 1 || existante.id !== ligne.regleId || ensemble(existante.entite) !== ensemble(definition.entite)) throw new Error('Le rapprochement a changé. Recalculez l’aperçu.')
      const nouvelle = action === 'variante' ? validerDefinitionAnon(existante.entite, dedupliquerValeursAnon([...existante.pseudos, ...definition.pseudos]), existante.categorie) : definition
      const remplacee = { ...existante, ...nouvelle }
      if (JSON.stringify(remplacee) === JSON.stringify(existante)) { bilan.ignores++; continue }
      resultat[existante.id] = remplacee
      if (action === 'variante') bilan.variantes++
      else bilan.remplacements++
    }
  }
  return { regles: resultat, bilan }
}
