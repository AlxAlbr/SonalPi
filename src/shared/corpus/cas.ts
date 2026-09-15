import type { Variable } from '../format'

export interface SourcePassageCas {
  entretienId: string
  repereId: string
}

export interface RattachementCas {
  id: string
  source: SourcePassageCas
  provenance: 'manuel'
  creeLe: string
}

export interface MembrePersonneCas {
  personneId: string
  inclureEnqueteurs: boolean
}

export type RegleModaliteCas =
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'entretien' }
  | { type: 'modalite'; variableId: string; modaliteId: string; portee: 'locuteur'; inclureEnqueteurs: boolean }

export interface FamilleCas {
  id: string
  nom: string
  creeLe: string
  origine: { variableId: string; portee: 'entretien' }
    | { variableId: string; portee: 'locuteur'; inclureEnqueteurs: boolean }
}

export type CommandeFamilleCas =
  | { type: 'creer-famille'; famille: FamilleCas; cas: Cas[] }
  | { type: 'completer-famille'; famille: FamilleCas; cas: Cas[] }
  | { type: 'dissoudre-famille'; famille: FamilleCas; membresAttendus: string[] }

export type RegleCas =
  | RegleModaliteCas
  | ({ type: 'personne' } & MembrePersonneCas)
  | { type: 'personnes'; membres: MembrePersonneCas[] }
  | { type: 'entretiens'; entretienIds: string[] }

/** Les règles individuelles existantes conservent leur identité et leur filtre. */
export function membresPersonnesRegle(regle: RegleCas): MembrePersonneCas[] {
  if (regle.type === 'personne') return [regle]
  return regle.type === 'personnes' ? regle.membres : []
}

export interface Cas {
  id: string
  nom: string
  memo: string
  creeLe: string
  modifieLe: string
  regles: RegleCas[]
  rattachements: RattachementCas[]
  familleId?: string
}

export type CommandeCas =
  | CommandeFamilleCas
  | { type: 'creer'; cas: Cas }
  | { type: 'creer-lot'; cas: Cas[] }
  | { type: 'renommer'; casId: string; attendu: string; nom: string }
  | { type: 'modifier-memo'; casId: string; attendu: string; memo: string }
  | { type: 'supprimer-cas'; casId: string; attenduModifieLe: string }
  | {
      type: 'ajouter-rattachements'
      casIds: string[]
      rattachement: RattachementCas
      nouveauCas?: Cas
    }
  | {
      type: 'retirer-rattachement'
      casId: string
      rattachementId: string
      attendu: RattachementCas
    }

export interface DependancesCas {
  familles?: Record<string, FamilleCas>
  variables?: Record<string, Variable>
  maintenant: () => string
  personneExiste: (personneId: string) => boolean
  entretienExiste: (entretienId: string) => boolean
}

export interface RetraitRattachementsEntretien {
  casAffectes: number
  rattachementsRetires: number
}

/** Références nouvelles qu'une commande doit pouvoir résoudre avant son application. */
export function referencesAjouteesCommandeCas(commande: CommandeCas): SourcePassageCas[] {
  const creations = commande.type === 'creer' ? [commande.cas]
    : commande.type === 'creer-lot' || commande.type === 'creer-famille' || commande.type === 'completer-famille' ? commande.cas : []
  const references = commande.type === 'ajouter-rattachements'
    ? [commande.rattachement.source]
    : creations.flatMap((cas) => cas.rattachements.map((rattachement) => rattachement.source))
  const uniques = new Map(references.map((source) => [
    `${source.entretienId}\0${source.repereId}`,
    source,
  ]))
  return [...uniques.values()].map((source) => structuredClone(source))
}

/** Retire les rattachements manuels d'un entretien sans supprimer les cas. */
export function retirerRattachementsCasEntretien(
  cas: Record<string, Cas> | undefined,
  entretienId: string,
  modifieLe: string,
): RetraitRattachementsEntretien {
  let casAffectes = 0
  let rattachementsRetires = 0
  for (const courant of Object.values(cas ?? {})) {
    const conserves = courant.rattachements.filter((rattachement) =>
      rattachement.source.entretienId !== entretienId)
    const retires = courant.rattachements.length - conserves.length
    if (!retires) continue
    courant.rattachements = conserves
    courant.modifieLe = modifieLe
    casAffectes += 1
    rattachementsRetires += retires
  }
  return { casAffectes, rattachementsRetires }
}

const identiques = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function dateValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.includes('T') && Number.isFinite(Date.parse(valeur))
}

function identifiantValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.trim().length > 0
}

/** Produit la clé utilisée pour garantir l'unicité visible des noms de cas. */
export function normaliserNomCas(nom: string): string {
  return nom.trim().normalize('NFKC').toLocaleLowerCase('fr')
}

function nomAffiche(nom: unknown): string {
  if (typeof nom !== 'string') throw new Error('Le nom du cas est obligatoire.')
  const valeur = nom.trim()
  if (!valeur) throw new Error('Le nom du cas est obligatoire.')
  return valeur
}

function validerRegle(regle: unknown): asserts regle is RegleCas {
  if (!regle || typeof regle !== 'object') throw new Error('La règle du cas est invalide.')
  const candidate = regle as Partial<RegleCas>
  if (candidate.type === 'modalite' && identifiantValide(candidate.variableId)
    && identifiantValide(candidate.modaliteId)
    && (candidate.portee === 'entretien' || (candidate.portee === 'locuteur'
      && typeof candidate.inclureEnqueteurs === 'boolean'))) return
  if (candidate.type === 'entretiens' && Array.isArray(candidate.entretienIds)
    && candidate.entretienIds.length > 0 && candidate.entretienIds.every(identifiantValide)) return
  const membres = candidate.type === 'personne' ? [candidate]
    : candidate.type === 'personnes' && Array.isArray(candidate.membres) ? candidate.membres : []
  if (!membres.length || membres.some((membre) => !membre || typeof membre !== 'object'
    || !identifiantValide(membre.personneId) || typeof membre.inclureEnqueteurs !== 'boolean')) {
    throw new Error('La règle du cas est invalide.')
  }
}

function validerRattachement(rattachement: unknown): asserts rattachement is RattachementCas {
  if (!rattachement || typeof rattachement !== 'object') {
    throw new Error('Le rattachement du cas est invalide.')
  }
  const candidate = rattachement as Partial<RattachementCas>
  if (!identifiantValide(candidate.id) || candidate.provenance !== 'manuel'
    || !dateValide(candidate.creeLe) || !candidate.source
    || !identifiantValide(candidate.source.entretienId)
    || !identifiantValide(candidate.source.repereId)) {
    throw new Error('Le rattachement du cas est invalide.')
  }
}

function validerCas(cas: unknown): asserts cas is Cas {
  if (!cas || typeof cas !== 'object') throw new Error('Le cas est invalide.')
  const candidate = cas as Partial<Cas>
  if (!identifiantValide(candidate.id) || typeof candidate.nom !== 'string'
    || !normaliserNomCas(candidate.nom) || typeof candidate.memo !== 'string'
    || !dateValide(candidate.creeLe) || !dateValide(candidate.modifieLe)
    || !Array.isArray(candidate.regles) || !Array.isArray(candidate.rattachements)) {
    throw new Error('Le cas est invalide.')
  }
  if (candidate.familleId !== undefined && (!identifiantValide(candidate.familleId)
    || candidate.regles.length !== 1 || candidate.regles[0]?.type !== 'modalite')) throw new Error('La famille du cas est invalide.')
  if (candidate.regles.some((regle) => regle.type === 'modalite') && candidate.regles.length !== 1) {
    throw new Error('Une règle de modalité ne peut pas être mélangée à d’autres règles.')
  }
  const personnes = new Set<string>()
  const entretiens = new Set<string>()
  for (const regle of candidate.regles) {
    validerRegle(regle)
    for (const membre of membresPersonnesRegle(regle)) {
      if (personnes.has(membre.personneId)) throw new Error('La règle de personne est présente plusieurs fois.')
      personnes.add(membre.personneId)
    }
    if (regle.type === 'entretiens') {
      for (const id of regle.entretienIds) {
        if (entretiens.has(id)) throw new Error('Cet entretien est présent plusieurs fois dans les règles.')
        entretiens.add(id)
      }
    }
  }
  if (personnes.size && entretiens.size) {
    throw new Error('Choisissez des règles de personnes ou des règles d’entretiens, sans les mélanger.')
  }

  const rattachementIds = new Set<string>()
  const sources = new Set<string>()
  for (const rattachement of candidate.rattachements) {
    validerRattachement(rattachement)
    const source = `${rattachement.source.entretienId}\0${rattachement.source.repereId}`
    if (rattachementIds.has(rattachement.id) || sources.has(source)) {
      throw new Error('Le cas contient plusieurs fois le même rattachement.')
    }
    rattachementIds.add(rattachement.id)
    sources.add(source)
  }
}

function exigerCas(cas: Record<string, Cas>, id: string): Cas {
  const cible = cas[id]
  if (!cible) throw new Error("Ce cas n'existe plus.")
  return cible
}

function verifierNomUnique(cas: Record<string, Cas>, nom: string, saufId?: string): void {
  const cle = normaliserNomCas(nom)
  if (Object.values(cas).some((candidate) => candidate.id !== saufId
    && normaliserNomCas(candidate.nom) === cle)) {
    throw new Error('Un cas porte déjà ce nom.')
  }
}

/** Applique une commande ciblée sans remplacer les autres définitions du corpus. */
export function appliquerCommandeCas(
  cas: Record<string, Cas> | undefined,
  commande: CommandeCas,
  deps: DependancesCas,
  creationFamiliale = false,
): Record<string, Cas> {
  const cible = cas ?? {}
  if (commande.type === 'creer-famille' || commande.type === 'completer-famille'
    || commande.type === 'dissoudre-famille') {
    const familles = deps.familles
    if (!familles) throw new Error('Les familles ne sont pas disponibles.')
    validerFamille(commande.famille)
    const famille = structuredClone(commande.famille)
    famille.nom = famille.nom.trim()
    const existante = familles[famille.id]
    if (existante && !identiques(existante, famille)) throw new Error('La famille a changé.')
    if (commande.type === 'dissoudre-famille') {
      const membres = Object.values(cible).filter((cas) => cas.familleId === famille.id).map((cas) => cas.id).sort()
      if (!existante && !membres.length) return cible
      if (!identiques(membres, [...commande.membresAttendus].sort())) throw new Error('Les membres de la famille ont changé.')
      for (const id of membres) {
        delete cible[id].familleId
        cible[id].modifieLe = deps.maintenant()
      }
      delete familles[famille.id]
      return cible
    }
    if (commande.type === 'completer-famille' && !existante) throw new Error('La famille n’existe plus.')
    const variable = deps.variables?.[famille.origine.variableId]
    if (!variable || variable.portee !== famille.origine.portee) throw new Error('La variable de la famille est absente ou sa portée a changé.')
    if (!existante && Object.values(familles).some((autre) => normaliserNomCas(autre.nom) === normaliserNomCas(famille.nom))) {
      throw new Error('Une famille porte déjà ce nom.')
    }
    if (!Array.isArray(commande.cas) || !commande.cas.length) throw new Error('Choisissez au moins une modalité.')
    if (existante && commande.type === 'creer-famille' && commande.cas.some((cas) => !cible[cas.id])) {
      throw new Error('Cette famille existe déjà. Utilisez Compléter la famille.')
    }
    const provisoire = { ...cible }
    const modalites = new Map(Object.values(cible).filter((cas) => cas.familleId === famille.id)
      .flatMap((cas) => cas.regles.filter((regle) => regle.type === 'modalite').map((regle) => [regle.modaliteId, cas.id] as const)))
    const ids = new Set<string>()
    for (const nouveau of commande.cas) {
      validerCas(nouveau)
      const regle = nouveau.regles[0]
      if (ids.has(nouveau.id)) throw new Error('Une identité est présente plusieurs fois.')
      ids.add(nouveau.id)
      if (nouveau.familleId !== famille.id || nouveau.regles.length !== 1 || regle.type !== 'modalite'
        || regle.variableId !== variable.id || regle.portee !== variable.portee
        || (regle.portee === 'locuteur' && famille.origine.portee === 'locuteur'
          && regle.inclureEnqueteurs !== famille.origine.inclureEnqueteurs)) throw new Error('Les critères du cas ne correspondent pas à la famille.')
      const occupant = modalites.get(regle.modaliteId)
      if (occupant && occupant !== nouveau.id) throw new Error('Cette modalité possède déjà un cas dans la famille.')
      modalites.set(regle.modaliteId, nouveau.id)
      appliquerCommandeCas(provisoire, { type: 'creer', cas: nouveau }, { ...deps, familles: { ...familles, [famille.id]: famille } }, true)
    }
    Object.assign(cible, provisoire)
    familles[famille.id] = famille
    return cible
  }

  if (commande.type === 'creer-lot') {
    if (!Array.isArray(commande.cas) || !commande.cas.length) throw new Error('Le lot de cas est vide.')
    const ids = new Set<string>()
    const provisoire = { ...cible }
    for (const nouveau of commande.cas) {
      validerCas(nouveau)
      if (ids.has(nouveau.id)) throw new Error('Une identité de cas est présente plusieurs fois dans le lot.')
      ids.add(nouveau.id)
      appliquerCommandeCas(provisoire, { type: 'creer', cas: nouveau }, deps)
    }
    Object.assign(cible, provisoire)
    return cible
  }

  if (commande.type === 'creer') {
    validerCas(commande.cas)
    if (commande.cas.familleId && !creationFamiliale) throw new Error('Utilisez la création ou le complément de famille.')
    const nouveau = structuredClone(commande.cas)
    nouveau.nom = nomAffiche(nouveau.nom)
    const existant = cible[nouveau.id]
    if (existant) {
      if (identiques(existant, nouveau)) return cible
      throw new Error("Cette identité de cas est déjà utilisée.")
    }
    verifierNomUnique(cible, nouveau.nom)
    if (nouveau.familleId && !deps.familles?.[nouveau.familleId]) throw new Error('La famille n’existe plus.')
    if (nouveau.familleId && Object.values(cible).some((autre) => autre.familleId === nouveau.familleId
      && autre.regles.some((a) => a.type === 'modalite' && nouveau.regles.some((b) => b.type === 'modalite' && a.modaliteId === b.modaliteId)))) {
      throw new Error('Cette modalité possède déjà un cas dans la famille.')
    }
    for (const regle of nouveau.regles) {
      if (regle.type === 'modalite') {
        const variable = deps.variables?.[regle.variableId]
        if (!variable || variable.portee !== regle.portee || !variable.modalites.some((m) => m.id === regle.modaliteId)) {
          throw new Error('La variable ou la modalité n’existe plus, ou sa portée a changé.')
        }
        const famille = nouveau.familleId ? deps.familles?.[nouveau.familleId] : undefined
        if (famille && (famille.origine.variableId !== regle.variableId || famille.origine.portee !== regle.portee
          || (famille.origine.portee === 'locuteur' && regle.portee === 'locuteur'
            && famille.origine.inclureEnqueteurs !== regle.inclureEnqueteurs))) throw new Error('Les critères ne correspondent pas à la famille.')
      }

      for (const membre of membresPersonnesRegle(regle)) {
        if (!deps.personneExiste(membre.personneId)) throw new Error("Cette personne n'existe plus.")
      }
      if (regle.type === 'entretiens' && regle.entretienIds.some((id) => !deps.entretienExiste(id))) {
        throw new Error('Cet entretien ne fait plus partie du corpus.')
      }
    }
    cible[nouveau.id] = nouveau
    return cible
  }

  if (commande.type === 'ajouter-rattachements') {
    if (new Set(commande.casIds).size !== commande.casIds.length
      || (!commande.casIds.length && !commande.nouveauCas)) {
      throw new Error('Choisissez au moins un cas, sans doublon.')
    }
    validerRattachement(commande.rattachement)
    if (commande.nouveauCas && commande.casIds.includes(commande.nouveauCas.id)) {
      throw new Error('Le nouveau cas est présent plusieurs fois dans la destination.')
    }

    let nouveau: Cas | null = null
    if (commande.nouveauCas) {
      validerCas(commande.nouveauCas)
      nouveau = structuredClone(commande.nouveauCas)
      nouveau.nom = nomAffiche(nouveau.nom)
      if (nouveau.regles.length !== 0 || nouveau.rattachements.length !== 1
        || !identiques(nouveau.rattachements[0], commande.rattachement)) {
        throw new Error('Le nouveau cas manuel doit être alimenté par la sélection associée.')
      }
      const existant = cible[nouveau.id]
      if (existant && !identiques(existant, nouveau)) {
        throw new Error("Cette identité de cas est déjà utilisée.")
      }
      if (!existant) verifierNomUnique(cible, nouveau.nom)
    }

    const casCibles = commande.casIds.map((id) => exigerCas(cible, id))
    if (nouveau) casCibles.push(cible[nouveau.id] ?? nouveau)
    for (const destination of casCibles) {
      const memeId = destination.rattachements.find((courant) => courant.id === commande.rattachement.id)
      if (memeId && !identiques(memeId, commande.rattachement)) {
        throw new Error("Cette identité de rattachement est déjà utilisée avec un autre contenu.")
      }
      const memeSource = destination.rattachements.find((courant) =>
        courant.source.entretienId === commande.rattachement.source.entretienId
        && courant.source.repereId === commande.rattachement.source.repereId)
      if (memeSource && memeSource.id !== commande.rattachement.id) {
        throw new Error('Ce passage est déjà rattaché à ce cas.')
      }
    }

    if (nouveau && !cible[nouveau.id]) cible[nouveau.id] = nouveau
    const maintenant = deps.maintenant()
    for (const destination of casCibles) {
      if (destination.rattachements.some((courant) => courant.id === commande.rattachement.id)) continue
      destination.rattachements.push(structuredClone(commande.rattachement))
      destination.modifieLe = maintenant
    }
    return cible
  }

  const casCourant = exigerCas(cible, commande.casId)
  if (commande.type === 'renommer') {
    if (casCourant.nom !== commande.attendu) throw new Error('Le nom du cas a changé.')
    const nom = nomAffiche(commande.nom)
    verifierNomUnique(cible, nom, casCourant.id)
    if (nom !== casCourant.nom) {
      casCourant.nom = nom
      casCourant.modifieLe = deps.maintenant()
    }
    return cible
  }
  if (commande.type === 'modifier-memo') {
    if (casCourant.memo !== commande.attendu) throw new Error('Le mémo du cas a changé.')
    if (typeof commande.memo !== 'string') throw new Error('Le mémo du cas est invalide.')
    if (commande.memo !== casCourant.memo) {
      casCourant.memo = commande.memo
      casCourant.modifieLe = deps.maintenant()
    }
    return cible
  }
  if (commande.type === 'supprimer-cas') {
    if (casCourant.modifieLe !== commande.attenduModifieLe) {
      throw new Error('Le cas a changé. Actualisez-le avant de le supprimer.')
    }
    delete cible[commande.casId]
    return cible
  }

  const index = casCourant.rattachements.findIndex((courant) =>
    courant.id === commande.rattachementId)
  if (index < 0) throw new Error('Ce rattachement a déjà été retiré.')
  if (!identiques(casCourant.rattachements[index], commande.attendu)) {
    throw new Error('Le rattachement a changé. Actualisez le cas avant de le retirer.')
  }
  casCourant.rattachements.splice(index, 1)
  casCourant.modifieLe = deps.maintenant()
  return cible
}

/** Conserve uniquement les cas entièrement valides d'un ancien fichier. */
export function normaliserCas(valeur: unknown): Record<string, Cas> {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return {}
  const resultat: Record<string, Cas> = {}
  const noms = new Set<string>()
  for (const [id, brut] of Object.entries(valeur as Record<string, unknown>)) {
    try {
      validerCas(brut)
      if (brut.id !== id) continue
      const nom = nomAffiche(brut.nom)
      const cle = normaliserNomCas(nom)
      if (noms.has(cle)) continue
      const copie = structuredClone(brut)
      copie.nom = nom
      resultat[id] = copie
      noms.add(cle)
    } catch {
      // Un cas mal formé reste exclu plutôt que lu partiellement.
    }
  }
  return resultat
}

function validerFamille(valeur: unknown): asserts valeur is FamilleCas {
  const famille = valeur as FamilleCas | null
  if (!famille || !identifiantValide(famille.id) || typeof famille.nom !== 'string'
    || !normaliserNomCas(famille.nom) || !dateValide(famille.creeLe) || !famille.origine
    || !identifiantValide(famille.origine.variableId)
    || !(famille.origine.portee === 'entretien' || (famille.origine.portee === 'locuteur'
      && typeof famille.origine.inclureEnqueteurs === 'boolean'))) throw new Error('La famille est invalide.')
}

/** Conserve les recettes valides, même si leur variable est devenue introuvable. */
export function normaliserFamillesCas(valeur: unknown): Record<string, FamilleCas> {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return {}
  const resultat: Record<string, FamilleCas> = {}
  for (const [id, brut] of Object.entries(valeur)) {
    try {
      validerFamille(brut)
      if (brut.id === id) resultat[id] = structuredClone(brut)
    } catch {
      // Une recette mal formée ne peut pas être utilisée.
    }
  }
  return resultat
}

/** Compte les recettes dépendantes, indépendamment des valeurs observées. */
export function compterUsagesCasVariable(
  corpus: { cas?: Record<string, Cas>; famillesCas?: Record<string, FamilleCas> },
  variableId: string,
  modaliteId?: string,
): number {
  return Object.values(corpus.cas ?? {}).filter((cas) => cas.regles.some((regle) =>
    regle.type === 'modalite' && regle.variableId === variableId
    && (modaliteId === undefined || regle.modaliteId === modaliteId))).length
    + (modaliteId === undefined ? Object.values(corpus.famillesCas ?? {})
      .filter((famille) => famille.origine.variableId === variableId).length : 0)
}
