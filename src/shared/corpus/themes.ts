import type { CorpusFichier, EntretienFichier } from '../format'
import { ajouterCategorie, retirerCategorie } from './categories'

export interface NouvelleDestinationTheme {
  type: 'nouvelle'
  token: string
  nom: string
  parent: string | null
  couleur?: string
  taille?: number
}

export type DestinationTheme =
  | { type: 'existante'; id: string }
  | NouvelleDestinationTheme

export interface ReferenceCodage {
  entretienId: string
  annotationId: string
}

export type DemandeOperationTheme =
  | { type: 'transfert'; source: string; cible: DestinationTheme; conserverSource: boolean }
  | { type: 'fusion'; source: string; cible: string }
  | {
      type: 'division'
      source: string
      cibles: NouvelleDestinationTheme[]
      choix: Array<{ codage: ReferenceCodage; destination: string }>
      effacerSource: boolean
    }

export interface ApercuOperationTheme {
  operationId: string
  source: string
  execution?: 'transaction-locale' | 'entretiens-sequentiels'
  parEntretien: Array<{
    id: string
    titre: string
    passages: number
    orphelins: number
    aModifier: boolean
  }>
  instantaneGitLab?: { commit: string }
  disponibiliteGitLab?: {
    observeLe: string
    entretiens: Array<{
      id: string
      etat: 'libre-observe' | 'tenu-autrui' | 'session-locale' | 'inconnu'
      detenteur?: string
      expireLe?: string
      motif?: string
    }>
  }
  totaux: {
    entretiens: number
    passages: number
    orphelins: number
    doublonsPrevisibles: number
    sousThemesDeplaces?: number
  }
  faisable: boolean
  motif?: string
  obstacles: Array<{
    phase: 'definitions' | 'entretiens' | 'finalisation'
    entretienId?: string
    motif: string
  }>
}

export interface DetailCodageOperationTheme extends CodageThemeInventorie {
  codage: ReferenceCodage
  avant: string
  extrait: string
  apres: string
}

export interface DetailsOperationTheme {
  operationId: string
  entretienId: string
  codages: DetailCodageOperationTheme[]
}

export interface ProgressionOperationTheme {
  operationId: string
  phase: 'definitions' | 'entretiens' | 'finalisation'
  termines: number
  total: number
  reussis: number
  echecs: number
}

export interface OptionsExecutionOperationTheme {
  entretiens: 'tous-prevus' | 'observes-libres'
}

export interface BilanLotTheme {
  reussis: Array<{ id: string; reaffectes: number; doublonsSupprimes: number }>
  echecs: Array<{ id: string; motif: string }>
  inconnus?: Array<{ id: string; motif: string }>
  differes?: Array<{ id: string; motif: string }>
  ciblesCreees: Array<{ token: string; id: string }>
  sourceConservee: boolean | null
  finalisation: 'non-demandee' | 'a-faire' | 'bloquee' | 'indeterminee' | 'terminee'
  motifFinalisation?: string
}

export interface SuiviOperationTheme {
  operationId: string
  demande: DemandeOperationTheme
  bilan: BilanLotTheme
  indeterminee: boolean
}

export interface PreparationRepriseOperationTheme {
  demande: DemandeOperationTheme
  apercu: ApercuOperationTheme
}

export type ResultatOperationTheme =
  | {
      statut: 'appliquee'
      corpus: CorpusFichier
      entretiens: number
      reaffectes: number
      doublonsSupprimes: number
    }
  | { statut: 'partielle'; operationId: string; corpus: CorpusFichier; bilan: BilanLotTheme }
  | { statut: 'non-appliquee'; motif: string }
  | { statut: 'indeterminee'; operationId: string; motif: string; bilan?: BilanLotTheme }

export interface CodageThemeInventorie {
  annotationId: string
  from: number
  to: number
  orphelin: boolean
}

export interface InventaireCodagesTheme {
  codages: CodageThemeInventorie[]
  passages: number
  orphelins: number
}

export interface PlanEntretienTheme {
  source: string
  reaffectations: Array<{ annotationId: string; destination: string }>
}

export interface DefinitionsOperationTheme {
  /** Définitions préparées avec la source encore présente. */
  corpus: CorpusFichier
  ciblesCreees: Array<{ token: string; id: string }>
}

export class RefusOperationTheme extends Error {
  constructor(motif: string) {
    super(motif)
    this.name = 'RefusOperationTheme'
  }
}

export function operationThemeSupprimeSource(demande: DemandeOperationTheme): boolean {
  return demande.type === 'fusion'
    || (demande.type === 'transfert' && !demande.conserverSource)
    || (demande.type === 'division' && demande.effacerSource)
}

function exiger(condition: unknown, motif: string): asserts condition {
  if (!condition) throw new RefusOperationTheme(motif)
}

function identifiant(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.trim().length > 0
}

function exigerCategorie(corpus: CorpusFichier, id: string): void {
  exiger(identifiant(id) && Object.hasOwn(corpus.codebook, id), `Thématique inconnue : ${id}.`)
}

/** Vérifie les parents sans boucler sur un arbre importé mal formé. */
function verifierAscendance(corpus: CorpusFichier, id: string, interdit?: string): void {
  const visites = new Set<string>()
  let courant: string | null = id
  while (courant !== null) {
    exiger(courant !== interdit, 'La destination ne peut pas être dans le sous-arbre de la source.')
    exiger(!visites.has(courant), 'La hiérarchie des thématiques contient un cycle.')
    exigerCategorie(corpus, courant)
    visites.add(courant)
    courant = corpus.codebook[courant].parent
  }
}

function nouvellesDestinations(demande: DemandeOperationTheme): NouvelleDestinationTheme[] {
  if (demande.type === 'division') return demande.cibles
  if (demande.type === 'transfert' && demande.cible.type === 'nouvelle') return [demande.cible]
  return []
}

function cleReference(codage: ReferenceCodage): string {
  return JSON.stringify([codage.entretienId, codage.annotationId])
}

/** Valide les définitions et les choix ; la couverture se vérifie avec l'inventaire complet. */
export function verifierDemandeOperationTheme(corpus: CorpusFichier, demande: DemandeOperationTheme): void {
  exiger(demande && ['transfert', 'fusion', 'division'].includes(demande.type), 'Opération de thématique inconnue.')
  exigerCategorie(corpus, demande.source)
  verifierAscendance(corpus, demande.source)
  if (demande.type === 'fusion') {
    exigerCategorie(corpus, demande.cible)
    exiger(demande.cible !== demande.source, 'La source et la cible doivent être différentes.')
    verifierAscendance(corpus, demande.cible, demande.source)
  }
  if (demande.type === 'transfert' && demande.cible?.type === 'existante') {
    exigerCategorie(corpus, demande.cible.id)
    exiger(demande.cible.id !== demande.source, 'La source et la cible doivent être différentes.')
    verifierAscendance(corpus, demande.cible.id)
  }
  if (demande.type === 'transfert') {
    exiger(demande.cible && ['existante', 'nouvelle'].includes(demande.cible.type), 'Destination inconnue.')
    exiger(typeof demande.conserverSource === 'boolean', 'Le choix de conservation de la source est invalide.')
  }
  if (demande.type === 'division') {
    exiger(Array.isArray(demande.cibles) && demande.cibles.length >= 2 && demande.cibles.length <= 4,
      'Une division exige deux à quatre destinations.')
    exiger(Array.isArray(demande.choix), 'Les choix de répartition sont invalides.')
    exiger(typeof demande.effacerSource === 'boolean', 'Le choix de suppression de la source est invalide.')
  }
  const tokens = new Set<string>()
  for (const cible of nouvellesDestinations(demande)) {
    exiger(cible?.type === 'nouvelle', 'Une division exige de nouvelles destinations.')
    exiger(identifiant(cible.token) && !tokens.has(cible.token), 'Token de destination vide ou dupliqué.')
    exiger(identifiant(cible.nom), 'Le nom de la destination est vide.')
    exiger(cible.parent === null || identifiant(cible.parent), 'Parent de destination invalide.')
    if (cible.parent !== null) {
      verifierAscendance(corpus, cible.parent,
        demande.type === 'division' && demande.effacerSource ? demande.source : undefined)
    }
    exiger(cible.couleur === undefined || typeof cible.couleur === 'string', 'Couleur de destination invalide.')
    exiger(cible.taille === undefined || (Number.isFinite(cible.taille) && cible.taille > 0),
      'Taille de destination invalide.')
    tokens.add(cible.token)
  }
  if (demande.type !== 'division') return
  const references = new Set<string>()
  for (const choix of demande.choix) {
    exiger(choix?.codage && identifiant(choix.codage.entretienId) && identifiant(choix.codage.annotationId),
      'Référence de codage invalide.')
    exiger(Object.hasOwn(corpus.membership, choix.codage.entretienId), 'Entretien absent du corpus.')
    exiger(tokens.has(choix.destination), 'Destination de répartition inconnue.')
    const cle = cleReference(choix.codage)
    exiger(!references.has(cle), 'Le même codage est réparti plusieurs fois.')
    references.add(cle)
  }
}

/** Contrôle tous les codages observés, y compris ceux sans texte. */
export function verifierRepartitionOperationTheme(
  demande: DemandeOperationTheme,
  inventaire: readonly ReferenceCodage[],
): void {
  if (demande.type !== 'division') return
  const connus = new Set(inventaire.map(cleReference))
  exiger(connus.size === inventaire.length, 'Identité de codage ambiguë dans l’inventaire.')
  const destinations = new Set(demande.cibles.map((cible) => cible.token))
  const repartis = new Set<string>()
  for (const choix of demande.choix) {
    const cle = cleReference(choix.codage)
    exiger(connus.has(cle), 'Un codage réparti est absent de l’inventaire de la source.')
    exiger(destinations.has(choix.destination), 'Destination de répartition inconnue.')
    exiger(!repartis.has(cle), 'Le même codage est réparti plusieurs fois.')
    repartis.add(cle)
  }
  exiger(!demande.effacerSource || repartis.size === connus.size,
    'La source ne peut pas être supprimée avec des codages non répartis.')
}

export function inventorierCodagesTheme(entretien: EntretienFichier, themeId: string): InventaireCodagesTheme {
  const codages = entretien.annotations
    .filter((a) => a.type === 'codage' && a.code === themeId)
    .map((a) => ({ annotationId: a.id, from: a.from, to: a.to, orphelin: a.from >= a.to }))
  return { codages, passages: codages.length, orphelins: codages.filter((a) => a.orphelin).length }
}

/** Génère les ids une fois, sans retirer la source ni modifier le corpus fourni. */
export function preparerDefinitionsOperationTheme(
  corpus: CorpusFichier,
  demande: DemandeOperationTheme,
  genId: () => string,
): DefinitionsOperationTheme {
  verifierDemandeOperationTheme(corpus, demande)
  const candidat = structuredClone(corpus)
  const ciblesCreees: DefinitionsOperationTheme['ciblesCreees'] = []
  for (const cible of nouvellesDestinations(demande)) {
    const id = genId()
    exiger(identifiant(id) && !Object.hasOwn(candidat.codebook, id), 'Identifiant de catégorie déjà utilisé ou invalide.')
    ajouterCategorie(candidat, cible.nom.trim(), cible.parent, () => id)
    if (cible.couleur !== undefined) candidat.codebook[id].couleur = cible.couleur
    if (cible.taille !== undefined) candidat.codebook[id].taille = cible.taille
    ciblesCreees.push({ token: cible.token, id })
  }
  return { corpus: candidat, ciblesCreees }
}

/** Résout les choix d'un seul entretien ; les ids d'annotation restent locaux à celui-ci. */
export function construirePlanEntretienTheme(
  entretien: EntretienFichier,
  entretienId: string,
  demande: DemandeOperationTheme,
  ciblesCreees: DefinitionsOperationTheme['ciblesCreees'],
): PlanEntretienTheme {
  const ids = new Map(ciblesCreees.map((cible) => [cible.token, cible.id]))
  const resoudre = (token: string): string => {
    const id = ids.get(token)
    exiger(id, 'Destination nouvelle non résolue.')
    return id
  }
  if (demande.type === 'division') {
    return {
      source: demande.source,
      reaffectations: demande.choix.filter((choix) => choix.codage.entretienId === entretienId)
        .map((choix) => ({ annotationId: choix.codage.annotationId, destination: resoudre(choix.destination) })),
    }
  }
  const destination = demande.type === 'fusion' ? demande.cible
    : demande.cible.type === 'existante' ? demande.cible.id : resoudre(demande.cible.token)
  return {
    source: demande.source,
    reaffectations: inventorierCodagesTheme(entretien, demande.source).codages
      .map((codage) => ({ annotationId: codage.annotationId, destination })),
  }
}

/** Réaffecte seulement les codages demandés et préserve les doublons historiques de la cible. */
export function appliquerReaffectationsTheme(
  entretien: EntretienFichier,
  plan: PlanEntretienTheme,
): { entretien: EntretienFichier; reaffectes: number; doublonsSupprimes: number } {
  const destinations = new Map<string, string>()
  const annotationsParId = new Map<string, typeof entretien.annotations>()
  for (const annotation of entretien.annotations) {
    const annotations = annotationsParId.get(annotation.id) ?? []
    annotations.push(annotation)
    annotationsParId.set(annotation.id, annotations)
  }
  for (const choix of plan.reaffectations) {
    exiger(!destinations.has(choix.annotationId), 'Le même codage est réparti plusieurs fois.')
    exiger(identifiant(choix.destination) && choix.destination !== plan.source, 'Destination de codage invalide.')
    const annotations = annotationsParId.get(choix.annotationId) ?? []
    exiger(annotations.length === 1 && annotations[0].type === 'codage' && annotations[0].code === plan.source,
      'Le codage à réaffecter est absent, ambigu ou ne référence plus la source.')
    destinations.set(choix.annotationId, choix.destination)
  }
  const clePlage = (code: string, from: number, to: number): string => JSON.stringify([code, from, to])
  const plages = new Set(entretien.annotations
    .filter((a) => a.type === 'codage' && a.code !== undefined && a.code !== plan.source)
    .map((a) => clePlage(a.code!, a.from, a.to)))
  let reaffectes = 0
  let doublonsSupprimes = 0
  const annotations = entretien.annotations.flatMap((a) => {
    const destination = a.type === 'codage' && a.code === plan.source ? destinations.get(a.id) : undefined
    if (destination === undefined) return [{ ...a }]
    const cle = clePlage(destination, a.from, a.to)
    if (plages.has(cle)) {
      doublonsSupprimes++
      return []
    }
    plages.add(cle)
    reaffectes++
    return [{ ...a, code: destination }]
  })
  return { entretien: { ...entretien, annotations }, reaffectes, doublonsSupprimes }
}

/** Déplace les seuls enfants directs, sans changer la position de la cible. */
export function deplacerEnfantsApresFusion(corpus: CorpusFichier, source: string, cible: string): number {
  verifierDemandeOperationTheme(corpus, { type: 'fusion', source, cible })
  let deplaces = 0
  for (const categorie of Object.values(corpus.codebook)) {
    if (categorie.parent !== source) continue
    categorie.parent = cible
    deplaces++
  }
  return deplaces
}

/** Prépare le retrait seulement après un inventaire frais ne référençant plus la source. */
export function finaliserDefinitionsOperationTheme(
  corpus: CorpusFichier,
  demande: DemandeOperationTheme,
  codagesRestants: readonly ReferenceCodage[],
): CorpusFichier {
  verifierDemandeOperationTheme(corpus, demande)
  const candidat = structuredClone(corpus)
  if (!operationThemeSupprimeSource(demande)) return candidat
  exiger(codagesRestants.length === 0, 'Des codages référencent encore la source.')
  if (demande.type === 'fusion') deplacerEnfantsApresFusion(candidat, demande.source, demande.cible)
  retirerCategorie(candidat, demande.source)
  return candidat
}
