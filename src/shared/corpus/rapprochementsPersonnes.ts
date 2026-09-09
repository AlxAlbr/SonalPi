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

export type RaisonRapprochementPersonne = 'meme-nom' | 'meme-role' | 'une-lettre' | 'memes-mots'

export interface AnalyseRapprochementPersonne {
  raison: RaisonRapprochementPersonne
  score: number
  libelle: string
}

function distanceEdition(a: string, b: string): number {
  let precedente = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i]
    for (let j = 1; j <= b.length; j += 1) {
      courante[j] = Math.min(
        courante[j - 1] + 1,
        precedente[j] + 1,
        precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    precedente = courante
  }
  return precedente[b.length]
}

/** Explique seulement les rapprochements assez stricts pour être présentés. */
export function analyserRapprochementPersonne(a: string, b: string): AnalyseRapprochementPersonne | null {
  const natureA = natureNomPersonne(a)
  const natureB = natureNomPersonne(b)
  if (natureA === 'ignore' || natureB === 'ignore') return null
  if (natureA === 'role' || natureB === 'role') {
    return natureA === 'role' && natureB === 'role'
      ? { raison: 'meme-role', score: 1, libelle: 'même rôle' }
      : null
  }
  const cleA = cleNomPersonne(a)
  const cleB = cleNomPersonne(b)
  if (cleA === cleB) return { raison: 'meme-nom', score: 1, libelle: 'même nom' }
  if (cleA.length < 4 || cleB.length < 4) return null
  const motsA = cleA.split(' ')
  const motsB = cleB.split(' ')
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
  return analyserRapprochementPersonne(a, b)?.score ?? 0
}

function suggestionsFiltrees(
  source: CandidatPersonne,
  candidats: CandidatPersonne[],
  accepter: (a: string, b: string) => AnalyseRapprochementPersonne | null,
): CandidatPersonne[] {
  const a = source.locuteur
  if (natureNomPersonne(a.nom) === 'ignore') return []
  const membres = (l: Locuteur) => l.personneRef
    ? [l, ...candidats.filter((c) => c.locuteur.personneRef === l.personneRef).map((c) => c.locuteur)]
    : [l]
  const eligibles = candidats.map((c, ordre) => ({ c, ordre, analyse: accepter(a.nom, c.locuteur.nom) }))
    .filter(({ c, analyse }) => {
      const b = c.locuteur
      if (!analyse || c.entretienId === source.entretienId || !b.id) return false
      if (a.personneRef && a.personneRef === b.personneRef) return false
      if (membres(a).some((x) => membres(b).some((y) => rapprochementRefuse(x, y)))) return false
      return !(b.personneRef && candidats.some((x) => x.entretienId === source.entretienId && x.locuteur.personneRef === b.personneRef && x.locuteur.id !== a.id))
    })
    .sort((x, y) => (y.analyse?.score ?? 0) - (x.analyse?.score ?? 0) || x.ordre - y.ordre)
  const vus = new Set<string>()
  return eligibles.flatMap(({ c }) => {
    const identite = c.locuteur.personneRef ? `personne:${c.locuteur.personneRef}` : `locuteur:${c.locuteur.id}`
    if (vus.has(identite)) return []
    vus.add(identite)
    return [c]
  })
}

/** Les rôles identiques sont des pistes, jamais des preuves d'identité. */
export function suggestionsExactesPersonnes(source: CandidatPersonne, candidats: CandidatPersonne[]): CandidatPersonne[] {
  return suggestionsFiltrees(source, candidats, (a, b) => {
    const analyse = analyserRapprochementPersonne(a, b)
    return analyse?.raison === 'meme-nom' || analyse?.raison === 'meme-role' ? analyse : null
  })
}

/** Ajoute aux correspondances exactes quelques variantes proches et explicables. */
export function suggestionsPersonnes(source: CandidatPersonne, candidats: CandidatPersonne[]): CandidatPersonne[] {
  return suggestionsFiltrees(source, candidats, analyserRapprochementPersonne)
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
