import type { Locuteur } from '../format'

export function cleNomPersonne(nom: string): string {
  return nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/[.\-‐‑–—']/g, ' ').trim().replace(/\s+/g, ' ')
}

export function natureNomPersonne(nom: string): 'specifique' | 'role' | 'ignore' {
  const cle = cleNomPersonne(nom)
  if (['interviewer', 'intervieweur', 'enqueteur'].includes(cle)) return 'role'
  if (cle.length < 2 || /^(nouveau locuteur|locuteur(?: \d+)?|speaker(?: \d+)?|inconnu|anonyme|non attribue)$/.test(cle)) return 'ignore'
  return 'specifique'
}

/** Respecte le retrait volontaire du lien, même après un nouveau nom. */
export function peutCreerPersonneAuNommage(locuteur: Locuteur): boolean {
  return !locuteur.personneRef && !locuteur.personneDeliee && natureNomPersonne(locuteur.nom) === 'specifique'
}

export interface CandidatPersonne {
  entretienId: string
  locuteur: Locuteur
}

/** Les rôles identiques sont des pistes, jamais des preuves d'identité. */
export function suggestionsExactesPersonnes(source: CandidatPersonne, candidats: CandidatPersonne[]): CandidatPersonne[] {
  const a = source.locuteur
  const nature = natureNomPersonne(a.nom)
  if (nature === 'ignore') return []
  const membres = (l: Locuteur) => l.personneRef
    ? [l, ...candidats.filter((c) => c.locuteur.personneRef === l.personneRef).map((c) => c.locuteur)]
    : [l]
  const vus = new Set<string>()
  return candidats.filter((c) => {
    const b = c.locuteur
    if (c.entretienId === source.entretienId || !b.id) return false
    if (a.personneRef && a.personneRef === b.personneRef) return false
    if (membres(a).some((x) => membres(b).some((y) => rapprochementRefuse(x, y)))) return false
    if (b.personneRef && candidats.some((x) => x.entretienId === source.entretienId && x.locuteur.personneRef === b.personneRef && x.locuteur.id !== a.id)) return false
    const correspond = nature === 'role' ? natureNomPersonne(b.nom) === 'role'
      : natureNomPersonne(b.nom) === 'specifique' && cleNomPersonne(a.nom) === cleNomPersonne(b.nom)
    if (!correspond) return false
    const identite = b.personneRef ? `personne:${b.personneRef}` : `locuteur:${b.id}`
    if (vus.has(identite)) return false
    vus.add(identite)
    return true
  })
}

export function rapprochementRefuse(a: Locuteur, b: Locuteur): boolean {
  const refuse = (source: Locuteur, cible: Locuteur) =>
    !!source.rapprochementsRefuses?.some((r) =>
      (!!cible.id && r === `locuteur:${cible.id}`) ||
      (!!cible.personneRef && r === `personne:${cible.personneRef}`))
  return refuse(a, b) || refuse(b, a)
}

export function refuserRapprochement(source: Locuteur, cible: Locuteur): void {
  const ref = cible.personneRef ? `personne:${cible.personneRef}` : cible.id ? `locuteur:${cible.id}` : null
  if (!ref) throw new Error('Le locuteur cible doit avoir un identifiant stable.')
  source.rapprochementsRefuses = [...new Set([...(source.rapprochementsRefuses ?? []), ref])]
}

export function annulerRefusRapprochement(source: Locuteur, cible: string): void {
  source.rapprochementsRefuses = source.rapprochementsRefuses?.filter((r) => r !== cible)
}

export interface ChoixRepriseLocuteur {
  pseudo?: boolean
  interviewer?: boolean
  variables: string[]
  remplacer?: boolean
}

/** Copie seulement les champs choisis, sans changer le nom ni l'identité. */
export function reprendreDonneesLocuteur(cible: Locuteur, source: Locuteur, choix: ChoixRepriseLocuteur): void {
  if (choix.pseudo && source.pseudo?.trim() && (choix.remplacer || !cible.pseudo?.trim())) {
    cible.pseudo = source.pseudo
    cible.pseudoEtat = 'confirme'
  }
  if (choix.interviewer && (choix.remplacer || cible.interviewer === undefined)) {
    cible.interviewer = source.interviewer === true
  }
  for (const id of choix.variables) {
    const valeur = source.valeursLoc[id]
    if (valeur && (choix.remplacer || !cible.valeursLoc[id])) cible.valeursLoc[id] = valeur
  }
}
