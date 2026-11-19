export type { ChoixRepriseLocuteur } from './contratsLocuteurs'
import type { ParticipationLocuteur, RefusRapprochementLocuteur } from '../locuteurs'
import type { ChoixRepriseParticipation } from './contratsLocuteurs'
export type { ChoixRepriseParticipation } from './contratsLocuteurs'

export function cleNomLocuteur(nom: string): string {
  return nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/[.\-‐‑–—']/g, ' ').trim().replace(/\s+/g, ' ')
}

export function natureNomLocuteur(nom: string): 'specifique' | 'role' | 'ignore' {
  const cle = cleNomLocuteur(nom)
  if (['interviewer', 'intervieweur', 'enqueteur'].includes(cle)) return 'role'
  if (cle.length < 2 || /^(nouveau locuteur|locuteur(?: \d+)?|speaker(?: \d+)?|inconnu|anonyme|non attribue)$/.test(cle)) return 'ignore'
  return 'specifique'
}

/** Respecte le retrait volontaire du lien, même après un nouveau nom. */
export function peutCreerLocuteurAuNommage(participation: Pick<ParticipationLocuteur, 'nom' | 'locuteurRef' | 'associationRetiree'>): boolean {
  return !participation.locuteurRef && !participation.associationRetiree && natureNomLocuteur(participation.nom) === 'specifique'
}

export interface CandidatRapprochementLocuteur {
  entretienId: string
  participation: Pick<ParticipationLocuteur, 'nom' | 'locuteurRef' | 'rapprochementsRefuses'>
    & Partial<Pick<ParticipationLocuteur, 'id'>>
}

export type RaisonRapprochementLocuteur = 'meme-nom' | 'meme-role' | 'une-lettre' | 'memes-mots'
export interface AnalyseRapprochementLocuteur {
  raison: RaisonRapprochementLocuteur
  score: number
  libelle: string
}

function distanceEdition(a: string, b: string): number {
  let precedente = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i]
    for (let j = 1; j <= b.length; j += 1) {
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1,
        precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    precedente = courante
  }
  return precedente[b.length]
}

/** Explique seulement les rapprochements assez stricts pour être présentés. */
export function analyserRapprochementLocuteur(a: string, b: string): AnalyseRapprochementLocuteur | null {
  const natureA = natureNomLocuteur(a), natureB = natureNomLocuteur(b)
  if (natureA === 'ignore' || natureB === 'ignore') return null
  if (natureA === 'role' || natureB === 'role') {
    return natureA === 'role' && natureB === 'role' ? { raison: 'meme-role', score: 1, libelle: 'même rôle' } : null
  }
  const cleA = cleNomLocuteur(a), cleB = cleNomLocuteur(b)
  if (cleA === cleB) return { raison: 'meme-nom', score: 1, libelle: 'même nom' }
  if (cleA.length < 4 || cleB.length < 4) return null
  const motsA = cleA.split(' '), motsB = cleB.split(' ')
  // Un prénom ou un nom seul ne suffit pas à proposer une identité proche.
  if (motsA.length < 2 || motsB.length < 2 || motsA.length !== motsB.length) return null
  if ([...motsA].sort().join('\n') === [...motsB].sort().join('\n')) {
    return { raison: 'memes-mots', score: 0.97, libelle: 'mêmes mots dans un ordre différent' }
  }
  const motCommun = motsA.some((mot) => mot.length >= 3 && motsB.includes(mot))
  if (motCommun && Math.abs(cleA.length - cleB.length) <= 1 && distanceEdition(cleA, cleB) === 1) {
    return { raison: 'une-lettre', score: 0.93, libelle: 'une lettre différente' }
  }
  return null
}

export function scoreRapprochement(a: string, b: string): number {
  return analyserRapprochementLocuteur(a, b)?.score ?? 0
}

export function cleRefusRapprochement(refus: RefusRapprochementLocuteur): string {
  return refus.type === 'locuteur' ? JSON.stringify(['locuteur', refus.locuteurId])
    : JSON.stringify(['participation', refus.entretienId, refus.participationId])
}

export function rapprochementLocuteursRefuse(a: CandidatRapprochementLocuteur, b: CandidatRapprochementLocuteur): boolean {
  const refuse = (source: CandidatRapprochementLocuteur, cible: CandidatRapprochementLocuteur) =>
    source.participation.rapprochementsRefuses?.some((r) => r.type === 'locuteur'
      ? cible.participation.locuteurRef !== null && r.locuteurId === cible.participation.locuteurRef
      : r.entretienId === cible.entretienId && r.participationId === cible.participation.id) === true
  return refuse(a, b) || refuse(b, a)
}

export function refuserRapprochementLocuteurs(source: Pick<ParticipationLocuteur, 'rapprochementsRefuses'>, cible: CandidatRapprochementLocuteur): void {
  const { participation, entretienId } = cible
  if (!participation.locuteurRef && (!entretienId || !participation.id)) {
    throw new Error('La participation cible doit avoir un identifiant stable et un entretien.')
  }
  const refus: RefusRapprochementLocuteur = participation.locuteurRef
    ? { type: 'locuteur', locuteurId: participation.locuteurRef }
    : { type: 'participation', entretienId, participationId: participation.id! }
  const existants = source.rapprochementsRefuses ?? []
  if (!existants.some((r) => cleRefusRapprochement(r) === cleRefusRapprochement(refus))) {
    source.rapprochementsRefuses = [...existants, refus]
  }
}

export function annulerRefusRapprochementLocuteurs(source: Pick<ParticipationLocuteur, 'rapprochementsRefuses'>, cible: RefusRapprochementLocuteur): void {
  source.rapprochementsRefuses = source.rapprochementsRefuses?.filter((r) => cleRefusRapprochement(r) !== cleRefusRapprochement(cible))
}

/** Calcule des suggestions sans modifier les associations ni les refus. */
export function calculerSuggestionsLocuteurs(
  source: CandidatRapprochementLocuteur,
  candidats: readonly CandidatRapprochementLocuteur[],
  accepter: (a: string, b: string) => AnalyseRapprochementLocuteur | null,
  refuse = rapprochementLocuteursRefuse,
): CandidatRapprochementLocuteur[] {
  const a = source.participation
  if (natureNomLocuteur(a.nom) === 'ignore') return []
  const membres = (c: CandidatRapprochementLocuteur) => c.participation.locuteurRef
    ? [c, ...candidats.filter((autre) => autre.participation.locuteurRef === c.participation.locuteurRef)] : [c]
  const eligibles = candidats.map((c, ordre) => ({ c, ordre, analyse: accepter(a.nom, c.participation.nom) }))
    .filter(({ c, analyse }) => {
      const b = c.participation
      if (!analyse || c.entretienId === source.entretienId || !b.id) return false
      if (a.locuteurRef && a.locuteurRef === b.locuteurRef) return false
      if (membres(source).some((x) => membres(c).some((y) => refuse(x, y)))) return false
      return !(b.locuteurRef && candidats.some((x) => x.entretienId === source.entretienId
        && x.participation.locuteurRef === b.locuteurRef && x.participation.id !== a.id))
    })
    .sort((x, y) => (y.analyse?.score ?? 0) - (x.analyse?.score ?? 0) || x.ordre - y.ordre)
  const vus = new Set<string>()
  return eligibles.flatMap(({ c }) => {
    const cle = c.participation.locuteurRef ? JSON.stringify(['locuteur', c.participation.locuteurRef])
      : JSON.stringify(['participation', c.entretienId, c.participation.id])
    if (vus.has(cle)) return []
    vus.add(cle)
    return [c]
  })
}

/** Les noms semblables sont des pistes, jamais des preuves d'identité. */
export function suggestionsLocuteurs(source: CandidatRapprochementLocuteur, candidats: readonly CandidatRapprochementLocuteur[]): CandidatRapprochementLocuteur[] {
  return calculerSuggestionsLocuteurs(source, candidats, analyserRapprochementLocuteur)
}

export function suggestionsExactesLocuteurs(source: CandidatRapprochementLocuteur, candidats: readonly CandidatRapprochementLocuteur[]): CandidatRapprochementLocuteur[] {
  return calculerSuggestionsLocuteurs(source, candidats, (a, b) => {
    const analyse = analyserRapprochementLocuteur(a, b)
    return analyse?.raison === 'meme-nom' || analyse?.raison === 'meme-role' ? analyse : null
  })
}

/** Copie seulement les champs choisis, sans changer le nom ni l'identité. */
export function reprendreDonneesParticipation(
  cible: Pick<ParticipationLocuteur, 'pseudo' | 'pseudoEtat' | 'interviewer' | 'valeursLoc'>,
  source: Pick<ParticipationLocuteur, 'pseudo' | 'interviewer' | 'valeursLoc'>,
  choix: ChoixRepriseParticipation,
): void {
  if (choix.pseudo && source.pseudo?.trim() && (choix.remplacer || !cible.pseudo?.trim())) {
    cible.pseudo = source.pseudo
    cible.pseudoEtat = 'confirme'
  }
  if (choix.interviewer && (choix.remplacer || cible.interviewer === undefined)) cible.interviewer = source.interviewer === true
  for (const id of choix.variables) {
    const valeur = source.valeursLoc[id]
    if (valeur && (choix.remplacer || !cible.valeursLoc[id])) cible.valeursLoc[id] = valeur
  }
}
