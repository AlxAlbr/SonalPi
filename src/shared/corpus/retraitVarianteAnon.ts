import type { CorpusFichier, EntretienFichier, RegleAnon } from '../format'
import { validerDefinitionAnon } from './definitionsAnon'
import { inventorierSuppressionAnon, type MotifRefusSuppressionAnon, type SourceSuppressionAnon } from './suppressionAnon'
import type { UsageRenommageAnon } from './renommageAnon'

export interface DemandeRetraitVarianteAnon { regleAvant: RegleAnon; pseudoRetire: string; pseudoConserve: string }
export interface BilanRetraitVarianteAnon {
  annotations: number; anonymisees: number; exceptions: number; incluses: number; entretiens: number; varianteRetiree: boolean
}
export interface InventaireRetraitVarianteEntretien {
  id: string; titre: string; annotations: number; anonymisees: number; exceptions: number; incluses: number
  conserves: number; independantes: number; attentes: number; usages: Omit<UsageRenommageAnon, 'renomme'>[]
}
export interface InventaireRetraitVarianteAnon {
  demande: DemandeRetraitVarianteAnon; regle: RegleAnon; apres: RegleAnon
  entretiens: InventaireRetraitVarianteEntretien[]
  obstacles: Array<{ code: MotifRefusSuppressionAnon; entretienId: string; annotationId?: string }>
  bilan: BilanRetraitVarianteAnon; faisable: boolean
}
export interface ApercuRetraitVarianteAnon extends InventaireRetraitVarianteAnon {
  token: string; lecture: 'local' | 'gitlab' | 'webdav'; applicationDisponible: boolean
  reprise?: string; ciblesRetirees?: string[]; motifIndisponible?: string
}
export interface BilanRetraitVarianteDistant extends BilanRetraitVarianteAnon {
  operationId: string; statut: 'termine' | 'partiel' | 'indetermine'; miroirIncomplet: boolean
  differes: { id: string; motif: string }[]; nouvellesCibles: string[]; motif?: string
}
export interface SuiviRetraitVarianteAnon extends BilanRetraitVarianteDistant { demande: DemandeRetraitVarianteAnon }
export type SourceRetraitVarianteAnon = SourceSuppressionAnon
const cle = (p: string) => p.trim().normalize('NFC').toLocaleLowerCase('fr')
const definition = (r: RegleAnon) => JSON.stringify([r.id, r.entite, r.pseudos, r.categorie])

/** Le remplacement choisi doit être la variante restante, jamais une nouvelle valeur. */
function definirRetrait(corpus: CorpusFichier, demande: DemandeRetraitVarianteAnon) {
  if (!demande?.regleAvant || typeof demande.regleAvant.id !== 'string' || typeof demande.pseudoRetire !== 'string'
    || typeof demande.pseudoConserve !== 'string' || !Object.hasOwn(corpus.reglesAnon ?? {}, demande.regleAvant.id)) throw new Error('La demande de retrait de variante est invalide ou la règle a disparu.')
  const regle = structuredClone(corpus.reglesAnon[demande.regleAvant.id])
  const valide = validerDefinitionAnon(regle.entite, regle.pseudos, regle.categorie)
  if (regle.id !== demande.regleAvant.id || regle.pseudos.length !== 2 || JSON.stringify(regle.entite) !== JSON.stringify(valide.entite)
    || JSON.stringify(regle.pseudos) !== JSON.stringify(valide.pseudos) || regle.categorie !== valide.categorie) throw new Error('Le retrait exige une définition valide avec deux variantes.')
  if (definition(regle) !== definition(demande.regleAvant)) throw new Error('La règle a changé. Actualisez puis examinez un nouveau bilan.')
  const retire = demande.pseudoRetire.trim().normalize('NFC'), conserve = demande.pseudoConserve.trim().normalize('NFC')
  if (retire === conserve || !regle.pseudos.includes(retire) || !regle.pseudos.includes(conserve)) throw new Error('Choisissez la variante à retirer et la variante restante comme remplacement.')
  return { regle, apres: { ...regle, pseudos: [conserve] }, demande: { regleAvant: structuredClone(regle), pseudoRetire: retire, pseudoConserve: conserve } }
}

/** Inventorie les seuls choix explicitement liés, y compris le pseudo mémorisé des exceptions. */
export function inventorierRetraitVarianteAnon(corpus: CorpusFichier, sources: SourceRetraitVarianteAnon[], demande: DemandeRetraitVarianteAnon): InventaireRetraitVarianteAnon {
  const d = definirRetrait(corpus, demande)
  const controle = inventorierSuppressionAnon(corpus, sources, { regleId: d.regle.id })
  const entretiens = controle.entretiens.map((e): InventaireRetraitVarianteEntretien => {
    const usages = e.usages.filter((u) => typeof u.pseudo === 'string' && cle(u.pseudo) === cle(d.demande.pseudoRetire))
    return { id: e.id, titre: e.titre, annotations: usages.length,
      anonymisees: usages.filter((u) => u.etat === 'anonymise').length, exceptions: usages.filter((u) => u.etat === 'exception').length,
      incluses: usages.filter((u) => u.incluse).length, conserves: e.usages.length - usages.length,
      independantes: e.independantes, attentes: e.attentes, usages }
  })
  const bilan: BilanRetraitVarianteAnon = { annotations: 0, anonymisees: 0, exceptions: 0, incluses: 0,
    entretiens: entretiens.filter((e) => e.annotations).length, varianteRetiree: true }
  for (const e of entretiens) for (const k of ['annotations', 'anonymisees', 'exceptions', 'incluses'] as const) bilan[k] += e[k]
  return { ...d, entretiens, obstacles: controle.obstacles, bilan, faisable: controle.faisable }
}

/** Prépare le repli consenti sans changer les états, le texte ni les données indépendantes. */
export function preparerRetraitVarianteAnon(corpus: CorpusFichier, sources: SourceRetraitVarianteAnon[], demande: DemandeRetraitVarianteAnon) {
  const inventaire = inventorierRetraitVarianteAnon(corpus, sources, demande)
  if (!inventaire.faisable) throw new Error('Résolvez les obstacles du bilan avant de retirer cette variante.')
  const corpusApres = structuredClone(corpus)
  corpusApres.reglesAnon[inventaire.regle.id] = structuredClone(inventaire.apres)
  const entretiens: Array<{ id: string; avant: EntretienFichier; apres: EntretienFichier }> = []
  for (const e of inventaire.entretiens) {
    if (!e.annotations) continue
    const avant = sources.find((s) => s.id === e.id)!.data!, apres = structuredClone(avant)
    const ids = new Set(e.usages.map((u) => u.annotationId))
    for (const a of apres.annotations) if (a.type === 'anon' && a.regle === inventaire.regle.id && ids.has(a.id)) a.pseudo = inventaire.demande.pseudoConserve
    entretiens.push({ id: e.id, avant: structuredClone(avant), apres })
  }
  return { inventaire, corpusApres, entretiens, bilan: inventaire.bilan }
}
