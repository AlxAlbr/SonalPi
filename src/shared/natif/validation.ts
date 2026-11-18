import { FORMAT_NATIF_LOCUTEURS, type CorpusFichier, type EntretienFichier } from './format'
import { objet, validerBlocsCorpus } from './validationCommune'
import { validerMemoireLocale, normaliserPseudosDeclares, type DefinitionAnonLocale } from '../entretien/anon/definitionsLocales'

const identifiant = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const chaines = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')
const valeurs = (v: unknown): boolean => objet(v) && Object.values(v).every((s) => typeof s === 'string')
const propriete = (v: Record<string, unknown>, nom: string) => Object.hasOwn(v, nom)

function verifierVersion(v: unknown, document: string): asserts v is Record<string, unknown> {
  if (!objet(v) || v.formatVersion !== FORMAT_NATIF_LOCUTEURS) {
    throw new Error(`Version de ${document} non supportée : format natif ${FORMAT_NATIF_LOCUTEURS} attendu.`)
  }
}

function validerDerivations(v: unknown): void {
  if (v === undefined) return
  if (!Array.isArray(v) || v.some((d) => !objet(d) || !identifiant(d.attributId)
    || !identifiant(d.variableSourceId) || !['entretien', 'participation'].includes(d.porteeSource as string))) {
    throw new Error('Recette d’attribut de cas invalide.')
  }
}

function membreLocuteur(v: unknown): boolean {
  return objet(v) && !propriete(v, 'personneId') && identifiant(v.locuteurId) && typeof v.inclureEnqueteurs === 'boolean'
}

function validerRegle(v: unknown): void {
  if (!objet(v) || propriete(v, 'personneId')) throw new Error('Règle de cas invalide.')
  if (v.type === 'locuteur' && membreLocuteur(v)) return
  if (v.type === 'locuteurs' && Array.isArray(v.membres) && v.membres.length > 0 && v.membres.every(membreLocuteur)) return
  if (v.type === 'entretiens' && Array.isArray(v.entretienIds) && v.entretienIds.length > 0 && v.entretienIds.every(identifiant)) return
  if (v.type === 'modalite' && identifiant(v.variableId) && identifiant(v.modaliteId)
    && (v.portee === 'entretien' || (v.portee === 'participation' && typeof v.inclureEnqueteurs === 'boolean'))) return
  throw new Error('Règle de cas invalide.')
}

/** La consultation valide la structure, sans reconstruire les liens ni rapprocher les noms. */
export function validerCorpusNatif(v: unknown): asserts v is CorpusFichier {
  verifierVersion(v, 'corpus')
  if (propriete(v, 'personnes') || !objet(v.locuteurs)) throw new Error('Répertoire de locuteurs invalide.')
  validerBlocsCorpus(v, ['entretien', 'participation'])
  for (const [id, locuteur] of Object.entries(v.locuteurs)) {
    if (!identifiant(id) || !objet(locuteur) || locuteur.id !== id || !identifiant(locuteur.nom)
      || Object.keys(locuteur).some((cle) => cle !== 'id' && cle !== 'nom')) {
      throw new Error('Identité de locuteur invalide.')
    }
  }
  if (v.cas !== undefined) {
    if (!objet(v.cas)) throw new Error('Collection de cas invalide.')
    for (const [id, cas] of Object.entries(v.cas)) {
      if (!objet(cas) || cas.id !== id || !identifiant(id) || typeof cas.nom !== 'string' || typeof cas.memo !== 'string'
        || typeof cas.creeLe !== 'string' || typeof cas.modifieLe !== 'string'
        || !Array.isArray(cas.regles) || !Array.isArray(cas.rattachements)) throw new Error('Cas invalide.')
      cas.regles.forEach(validerRegle)
      validerDerivations(cas.derivationsPropres)
    }
  }
  if (v.famillesCas !== undefined) {
    if (!objet(v.famillesCas)) throw new Error('Collection de familles de cas invalide.')
    for (const [id, famille] of Object.entries(v.famillesCas)) {
      if (!objet(famille) || famille.id !== id || !identifiant(id) || typeof famille.nom !== 'string'
        || typeof famille.creeLe !== 'string' || !objet(famille.origine) || !identifiant(famille.origine.variableId)
        || !(famille.origine.portee === 'entretien' || (famille.origine.portee === 'participation'
          && typeof famille.origine.inclureEnqueteurs === 'boolean'))) throw new Error('Famille de cas invalide.')
      validerDerivations(famille.derivationsAttributs)
    }
  }
}

function validerRefus(v: unknown): boolean {
  return objet(v) && (v.type === 'locuteur'
    ? identifiant(v.locuteurId)
    : v.type === 'participation' && identifiant(v.entretienId) && identifiant(v.participationId))
}

/** Les ids locaux doivent déjà être fixés ; la lecture n'en fabrique jamais. */
export function validerEntretienNatif(v: unknown): asserts v is EntretienFichier {
  verifierVersion(v, 'entretien')
  if (propriete(v, 'locuteurs') || !Array.isArray(v.participations)) throw new Error('Participations de l’entretien invalides.')
  if (typeof v.lastModified !== 'string' || !Array.isArray(v.annotations) || !Array.isArray(v.ancres)
    || !propriete(v, 'corpsTexte') || !objet(v.meta) || !valeurs(v.meta.valeursGen)
    || (v.meta.audioRef !== null && typeof v.meta.audioRef !== 'string')) throw new Error('Structure d’entretien invalide.')
  const ids = new Set<string>()
  const indices = new Set<number>()
  for (const p of v.participations) {
    if (!objet(p) || !identifiant(p.id) || ids.has(p.id) || !Number.isSafeInteger(p.index) || (p.index as number) < 0
      || indices.has(p.index as number) || typeof p.nom !== 'string' || !valeurs(p.valeursLoc)
      || (p.locuteurRef !== null && !identifiant(p.locuteurRef))
      || propriete(p, 'personneRef') || propriete(p, 'personneDeliee')) throw new Error('Participation de locuteur invalide.')
    for (const cle of ['interviewer', 'associationRetiree']) {
      if (p[cle] !== undefined && typeof p[cle] !== 'boolean') throw new Error('Propriété locale de participation invalide.')
    }
    for (const cle of ['pseudo', 'couleur']) {
      if (p[cle] !== undefined && typeof p[cle] !== 'string') throw new Error('Propriété locale de participation invalide.')
    }
    if (p.pseudoEtat !== undefined && p.pseudoEtat !== 'confirme' && p.pseudoEtat !== 'refuse') {
      throw new Error('Décision de pseudonymisation de participation invalide.')
    }
    if (p.rapprochementsRefuses !== undefined && (!Array.isArray(p.rapprochementsRefuses)
      || !p.rapprochementsRefuses.every(validerRefus))) throw new Error('Refus de rapprochement invalide.')
    ids.add(p.id)
    indices.add(p.index as number)
  }
  if (v.notes !== undefined) {
    if (!Array.isArray(v.notes)) throw new Error('Notes de l’entretien invalides.')
    for (const note of v.notes) {
      if (!objet(note) || !identifiant(note.id) || !identifiant(note.categorieId) || typeof note.titre !== 'string'
        || (note.date !== null && typeof note.date !== 'string') || !['prive', 'public'].includes(note.statut as string)
        || typeof note.corps !== 'string' || typeof note.rang !== 'number' || typeof note.creeLe !== 'string'
        || (note.modifieLe !== null && typeof note.modifieLe !== 'string') || propriete(note, 'locuteurIds')
        || (note.participationIds !== undefined && !chaines(note.participationIds))) throw new Error('Note de participation invalide.')
    }
  }
  if (v.definitionsAnonLocales !== undefined) validerMemoireLocale(v.definitionsAnonLocales as DefinitionAnonLocale[])
  if (v.pseudosDeclares !== undefined) normaliserPseudosDeclares(v.pseudosDeclares as Record<string, string[]>)
}
