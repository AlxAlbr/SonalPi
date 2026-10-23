import type { OccurrenceLexico, TraitementsLexico } from './types'

export type CommandeTraitementsLexico = {
  type: 'remplacer'
  attendu: TraitementsLexico
  traitements: TraitementsLexico
}

export interface ImportTraitementsLexicoV1 {
  traitements: TraitementsLexico
  diagnostics: string[]
  fichiers: string[]
}

export const LISTES_MOTS_OUTILS: Record<string, string[]> = {
  Articles: ['au', 'aux', 'de', 'des', 'du', 'la', 'le', 'les', 'un', 'une'],
  Pronoms: ['elle', 'elles', 'il', 'ils', 'je', 'me', 'moi', 'nous', 'on', 'se', 'te', 'toi', 'tu', 'vous', 'ça', 'ce', 'cela', 'ces', 'que', 'qui'],
  Prépositions: ['à', 'après', 'avant', 'avec', 'chez', 'contre', 'dans', 'depuis', 'en', 'entre', 'par', 'pour', 'sans', 'sous', 'sur', 'vers'],
  Conjonctions: ['alors', 'comme', 'lorsque', 'mais', 'ou', 'parce', 'puisque', 'quand', 'que', 'si'],
  Négations: ['jamais', 'ne', 'non', 'pas', 'plus'],
}

export function normaliserFormeLexico(forme: string): string {
  return forme.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

export function traitementsLexicoParDefaut(): TraitementsLexico {
  return { motsOutils: [], regroupements: [], concatenations: [] }
}

function chaine(value: unknown, maximum = 200): string {
  return typeof value === 'string' ? normaliserFormeLexico(value).slice(0, maximum) : ''
}

/** Normalise les réglages persistés sans conserver de règle partiellement invalide. */
export function normaliserTraitementsLexico(value: unknown): TraitementsLexico {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return traitementsLexicoParDefaut()
  const brut = value as Partial<TraitementsLexico>
  const motsOutils = [...new Set((Array.isArray(brut.motsOutils) ? brut.motsOutils : [])
    .map((mot) => chaine(mot)).filter(Boolean))].slice(0, 20_000)
  const formesDejaRegroupees = new Set<string>()
  const regroupements = (Array.isArray(brut.regroupements) ? brut.regroupements : []).flatMap((regroupement, index) => {
    if (!regroupement || typeof regroupement !== 'object') return []
    const forme = chaine(regroupement.forme)
    const membres = [...new Set((Array.isArray(regroupement.membres) ? regroupement.membres : [])
      .map((membre) => chaine(membre)).filter((membre) => membre && !formesDejaRegroupees.has(membre)))]
      .slice(0, 5_000)
    if (!forme || !membres.length) return []
    membres.forEach((membre) => formesDejaRegroupees.add(membre))
    return [{ id: chaine(regroupement.id, 120) || `groupe-${index}`, forme, membres }]
  }).slice(0, 5_000)
  const listesMotsOutils: Record<string, string[]> = {}
  if (brut.listesMotsOutils && typeof brut.listesMotsOutils === 'object' && !Array.isArray(brut.listesMotsOutils)) {
    for (const nom of Object.keys(LISTES_MOTS_OUTILS)) {
      const liste = brut.listesMotsOutils[nom]
      if (!Array.isArray(liste)) continue
      listesMotsOutils[nom] = [...new Set(liste.map((mot) => chaine(mot)).filter(Boolean))].slice(0, 5_000)
    }
  }
  const sequences = new Set<string>()
  const concatenations = (Array.isArray(brut.concatenations) ? brut.concatenations : []).flatMap((regle, index) => {
    if (!regle || typeof regle !== 'object') return []
    const sequence = (Array.isArray(regle.sequence) ? regle.sequence : [])
      .map((forme) => chaine(forme)).filter(Boolean).slice(0, 20)
    const cle = sequence.join('\0')
    const forme = chaine(regle.forme)
    if (sequence.length < 2 || !forme || sequences.has(cle)) return []
    sequences.add(cle)
    return [{ id: chaine(regle.id, 120) || `concat-${index}`, forme, sequence }]
  }).slice(0, 5_000)
  return {
    motsOutils,
    regroupements,
    concatenations,
    ...(Object.keys(listesMotsOutils).length ? { listesMotsOutils } : {}),
  }
}

export function appliquerCommandeTraitementsLexico(
  actuels: unknown,
  commande: CommandeTraitementsLexico,
): TraitementsLexico {
  const normalises = normaliserTraitementsLexico(actuels)
  if (commande.type !== 'remplacer') throw new Error('Commande Lexico inconnue.')
  if (JSON.stringify(normalises) !== JSON.stringify(normaliserTraitementsLexico(commande.attendu))) {
    throw new Error('Les réglages Lexico ont changé. Actualisez le corpus avant de recommencer.')
  }
  return normaliserTraitementsLexico(commande.traitements)
}

/** Convertit les trois fichiers annexes V1 en réglages V2 déterministes. */
export function importerTraitementsLexicoV1(
  fichiers: Partial<Record<'out' | 'lem' | 'cnct', string>>,
): ImportTraitementsLexicoV1 {
  const diagnostics: string[] = []
  const motsOutils = (fichiers.out ?? '').split(/\r?\n/).map(normaliserFormeLexico).filter(Boolean)
  const groupes = new Map<string, string[]>()
  for (const [index, ligne] of (fichiers.lem ?? '').split(/\r?\n/).entries()) {
    if (!ligne.trim()) continue
    const [sourceBrute, cibleBrute] = ligne.split('\t')
    const source = normaliserFormeLexico(sourceBrute ?? '')
    const cible = normaliserFormeLexico(cibleBrute ?? '')
    if (!source || !cible) {
      diagnostics.push(`.lem ligne ${index + 1} ignorée : source ou cible absente.`)
      continue
    }
    const membres = groupes.get(cible) ?? []
    if (!membres.includes(source)) membres.push(source)
    groupes.set(cible, membres)
  }
  const concatenations: TraitementsLexico['concatenations'] = []
  for (const [index, ligne] of (fichiers.cnct ?? '').split(/\r?\n/).entries()) {
    if (!ligne.trim()) continue
    const [sourceBrute, cibleBrute] = ligne.split('\t')
    const sequence = (sourceBrute ?? '').trim().split(/\s+/).map(normaliserFormeLexico).filter(Boolean)
    if (sequence.length < 2) {
      diagnostics.push(`.cnct ligne ${index + 1} ignorée : moins de deux formes.`)
      continue
    }
    concatenations.push({
      id: `v1-concat-${index}`,
      forme: normaliserFormeLexico(cibleBrute ?? '') || sequence.join(' '),
      sequence,
    })
  }
  return {
    traitements: normaliserTraitementsLexico({
      motsOutils,
      regroupements: [...groupes.entries()].map(([forme, membres], index) => ({ id: `v1-groupe-${index}`, forme, membres })),
      concatenations,
    }),
    diagnostics,
    fichiers: (['out', 'lem', 'cnct'] as const).filter((extension) => fichiers[extension] !== undefined).map((extension) => `.${extension}`),
  }
}

function recalculerContextes(occurrences: OccurrenceLexico[]): void {
  const parEntretien = new Map<string, OccurrenceLexico[]>()
  for (const occurrence of occurrences) {
    const liste = parEntretien.get(occurrence.entretienId) ?? []
    liste.push(occurrence)
    parEntretien.set(occurrence.entretienId, liste)
  }
  for (const liste of parEntretien.values()) {
    liste.sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
    for (let index = 0; index < liste.length; index++) {
      liste[index].avant = liste.slice(Math.max(0, index - 10), index)
        .map((item) => item.texte).join(' ')
      liste[index].apres = liste.slice(index + 1, index + 11)
        .map((item) => item.texte).join(' ')
    }
  }
}

function concatener(
  occurrences: OccurrenceLexico[],
  traitements: TraitementsLexico,
): OccurrenceLexico[] {
  let resultat = occurrences.map((occurrence) => ({
    ...occurrence,
    themeIds: [...occurrence.themeIds],
  }))
  const regles = [...traitements.concatenations]
    .filter((regle) => regle.sequence.length >= 2)
    .sort((a, b) => b.sequence.length - a.sequence.length || a.id.localeCompare(b.id))
  for (const regle of regles) {
    const sequence = regle.sequence.map(normaliserFormeLexico)
    const suivant: OccurrenceLexico[] = []
    for (let index = 0; index < resultat.length;) {
      const candidats = resultat.slice(index, index + sequence.length)
      const premier = candidats[0]
      const correspond = candidats.length === sequence.length
        && candidats.every((occurrence, rang) => occurrence.forme === sequence[rang]
          && occurrence.entretienId === premier.entretienId
          && occurrence.locuteurIndex === premier.locuteurIndex)
      if (!correspond) {
        suivant.push(resultat[index])
        index++
        continue
      }
      const dernier = candidats.at(-1)!
      suivant.push({
        ...premier,
        id: `concat:${regle.id}:${candidats.map((item) => item.id).join('|')}`,
        forme: normaliserFormeLexico(regle.forme),
        formeOriginale: candidats.map((item) => item.formeOriginale ?? item.forme).join(' + '),
        texte: candidats.map((item) => item.texte).join(' '),
        to: dernier.to,
        themeIds: [...new Set(candidats.flatMap((item) => item.themeIds))],
        pseudonyme: candidats.some((item) => item.pseudonyme),
      })
      index += sequence.length
    }
    resultat = suivant
  }
  return resultat
}

/** Applique les concaténations, regroupements et mots outils sans modifier l'index source. */
export function appliquerTraitementsLexico(
  occurrences: OccurrenceLexico[],
  traitements: TraitementsLexico,
): OccurrenceLexico[] {
  const concatenees = concatener(occurrences, traitements)
  const groupes = new Map<string, string>()
  for (const regroupement of traitements.regroupements) {
    for (const membre of regroupement.membres) {
      if (!groupes.has(normaliserFormeLexico(membre))) {
        groupes.set(normaliserFormeLexico(membre), normaliserFormeLexico(regroupement.forme))
      }
    }
  }
  const motsOutils = new Set(traitements.motsOutils.map(normaliserFormeLexico))
  const resultat = concatenees.flatMap((occurrence) => {
    const formeAvantGroupe = occurrence.forme
    const groupe = groupes.get(formeAvantGroupe)
    const forme = groupe ?? formeAvantGroupe
    if (motsOutils.has(formeAvantGroupe) || motsOutils.has(forme)) return []
    return [{
      ...occurrence,
      forme,
      ...(groupe && groupe !== formeAvantGroupe
        ? { formeOriginale: occurrence.formeOriginale ?? formeAvantGroupe }
        : {}),
    }]
  })
  recalculerContextes(resultat)
  return resultat
}

export function compterConcatenationsLexico(
  occurrences: OccurrenceLexico[],
  sequenceBrute: string[],
): number {
  const sequence = sequenceBrute.map(normaliserFormeLexico).filter(Boolean)
  if (sequence.length < 2) return 0
  let total = 0
  for (let index = 0; index <= occurrences.length - sequence.length; index++) {
    const candidats = occurrences.slice(index, index + sequence.length)
    const premier = candidats[0]
    if (candidats.every((occurrence, rang) => occurrence.forme === sequence[rang]
      && occurrence.entretienId === premier.entretienId
      && occurrence.locuteurIndex === premier.locuteurIndex)) total++
  }
  return total
}
