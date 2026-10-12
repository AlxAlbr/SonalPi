import type { BilanMutationAnon, CibleRegleAnon, EntretienFichier, RegleAnon, ResultatMutationAnon } from '../../format'
import { aplatir, chevauche, plageVersPM, type Plage } from './anonymisation'
import { parserAliases } from './alias'
import { cleEntite } from './brouillonsAnon'
import { estOrpheline, type Annotation } from '../annotation'
import { classerPlage, empreinteAnon, matchesAliases, textePlage } from './classification'

export interface InstructionsMasse {
  poser: Array<{ id: string; from: number; to: number; pseudo: string; regle: string }>
  nb: number
}

export const bilanAnonVide = (): BilanMutationAnon => ({ poses: 0, retraits: 0, exceptionsAjoutees: 0, exceptionsRetirees: 0 })
const totalActions = (bilan: BilanMutationAnon) => Object.values(bilan).reduce((total, nb) => total + nb, 0)
const genIdDefaut = () => 'a-' + Math.random().toString(36).slice(2, 9)
const clePlage = (p: Plage) => `${p.from}:${p.to}`
const uniques = (plages: Plage[] = []) => [...new Map(plages.map((p) => [clePlage(p), p])).values()]

/** Pose sur les matchs libres ; une exception au contact reste protégée. */
export function instructionsAppliquerRegle(entretien: EntretienFichier, regle: RegleAnon, genId: () => string): InstructionsMasse {
  const plat = aplatir(entretien.corpsTexte)
  const poser: InstructionsMasse['poser'] = []
  const pseudo = regle.pseudos[0]
  if (!pseudo?.trim()) throw new Error('La règle ne contient pas de pseudonyme exploitable.')
  const existantes = entretien.annotations.filter((a) => a.type === 'anon' && !estOrpheline(a))
  for (const m of matchesAliases(plat.texte, regle.entite.flatMap(parserAliases))) {
    const pm = plageVersPM(plat, m.from, m.to)
    if (!pm) continue
    const couvert = existantes.some((a) =>
      (a.from <= pm.from && pm.to <= a.to) ||
      (chevauche(a, pm) && (a.etat === 'exception' || a.from < pm.from || pm.to < a.to)))
    if (!couvert) poser.push({ id: genId(), ...pm, pseudo, regle: regle.id })
  }
  return { poser, nb: poser.length }
}

/** Une liste absente ou vide ne pose rien ; l'application entière est explicite. */
export function poserDansPlages(poser: InstructionsMasse['poser'], plages?: Plage[], toutes = false): InstructionsMasse['poser'] {
  if (toutes) return poser
  const cibles = new Set((plages ?? []).map(clePlage))
  return poser.filter((o) => cibles.has(clePlage(o)))
}

/** Modifie uniquement les annotations liées ; les compteurs mesurent les mutations obtenues. */
export function appliquerDiffAnonAvecBilan(
  annotations: Annotation[], regleId: string,
  retirer?: Plage[], exception?: Plage[], retirerException?: Plage[], genId = genIdDefaut,
): BilanMutationAnon {
  const bilan = bilanAnonVide()
  const retraits = new Set((retirer ?? []).map(clePlage))
  const retraitsExceptions = new Set((retirerException ?? []).map(clePlage))
  const deLaRegle = (a: Annotation) => a.type === 'anon' && a.regle === regleId && !estOrpheline(a)
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i]
    if (!deLaRegle(a)) continue
    if (a.etat === 'exception' && retraitsExceptions.has(clePlage(a))) {
      annotations.splice(i, 1)
      bilan.exceptionsRetirees++
    } else if (a.etat !== 'exception' && retraits.has(clePlage(a))) {
      annotations.splice(i, 1)
      bilan.retraits++
    }
  }
  for (const plage of uniques(exception)) {
    const existante = annotations.find((a) => deLaRegle(a) && clePlage(a) === clePlage(plage))
    if (existante?.etat === 'exception') continue
    if (existante) existante.etat = 'exception'
    else annotations.push({ id: genId(), type: 'anon', ...plage, auteur: 'corpus', etat: 'exception', regle: regleId })
    bilan.exceptionsAjoutees++
  }
  return bilan
}

export function appliquerDiffAnon(annotations: Annotation[], regleId: string, retirer?: Plage[], exception?: Plage[], retirerException?: Plage[]): number {
  return totalActions(appliquerDiffAnonAvecBilan(annotations, regleId, retirer, exception, retirerException))
}

type DiffAnon = Pick<CibleRegleAnon, 'plages' | 'retirer' | 'exception' | 'retirerException' | 'empreinte' | 'toutes'>

/** Vérifie la fraîcheur et l'état attendu de toutes les cibles avant mutation. */
function verifierDiff(entretien: EntretienFichier, regle: RegleAnon, cible: DiffAnon): void {
  const cles = ['plages', 'retirer', 'exception', 'retirerException'] as const
  const positionnel = cles.some((cle) => cible[cle]?.length)
  if (positionnel && !cible.empreinte) throw new Error('Un aperçu frais est requis pour modifier ces occurrences.')
  if (cible.empreinte && cible.empreinte !== empreinteAnon(entretien, regle)) {
    throw new Error('L’aperçu est périmé. Actualisez les occurrences avant de valider.')
  }
  if (!positionnel) return
  const plat = aplatir(entretien.corpsTexte)
  const aliases = regle.entite.flatMap(parserAliases)
  const clesEntite = new Set(aliases.map(cleEntite))
  const matches = new Set(matchesAliases(plat.texte, aliases).flatMap((m) => {
    const pm = plageVersPM(plat, m.from, m.to)
    return pm ? [clePlage(pm)] : []
  }))
  const actions = new Map<string, Set<string>>()
  for (const cle of cles) {
    for (const plage of uniques(cible[cle])) {
      if (!matches.has(clePlage(plage))) throw new Error('Une cible ne correspond plus à une occurrence de la règle.')
      const decision = classerPlage(entretien.annotations, plage, clesEntite, (f, t) => textePlage(plat, f, t))
      if (decision.etat === 'incl' || (decision.annotation && decision.annotation.regle !== regle.id)) {
        throw new Error('Une décision indépendante ou incluse ne peut pas être modifiée par cette règle.')
      }
      if (cle === 'retirer' && decision.etat !== 'anon') throw new Error('L’occurrence à retirer n’est pas anonymisée.')
      if (cle === 'retirerException' && decision.etat !== 'exc') throw new Error('L’exception à retirer n’existe plus.')
      if ((cle === 'plages' || cle === 'exception') && entretien.annotations.some((a) =>
        a.type === 'anon' && !estOrpheline(a) && a.etat === 'exception' && chevauche(a, plage) && clePlage(a) !== clePlage(plage))) {
        throw new Error('Une exception interne reste protégée. Examinez la couverture dans l’entretien.')
      }
      const demandes = actions.get(clePlage(plage)) ?? new Set<string>()
      demandes.add(cle)
      actions.set(clePlage(plage), demandes)
    }
  }
  for (const demandes of actions.values()) {
    if (demandes.size > 1 && !(demandes.size === 2 && demandes.has('retirerException') && demandes.has('plages'))) {
      throw new Error('Le diff demande des actions incompatibles sur une même occurrence.')
    }
  }
}

/** Prépare sur une copie ; un refus laisse les sources et les variantes intactes. */
export function appliquerRegleAnonEntretienAvecBilan(
  entretien: EntretienFichier, regle: RegleAnon, cible: DiffAnon, genId = genIdDefaut,
): ResultatMutationAnon {
  if (!regle.pseudos[0]?.trim()) throw new Error('La règle ne contient pas de pseudonyme exploitable.')
  verifierDiff(entretien, regle, cible)
  const annotations = structuredClone(entretien.annotations)
  const actions = appliquerDiffAnonAvecBilan(annotations, regle.id, cible.retirer, cible.exception, cible.retirerException, genId)
  const candidate = { ...entretien, annotations }
  const instructions = instructionsAppliquerRegle(candidate, regle, genId)
  const poser = poserDansPlages(instructions.poser, cible.plages, cible.toutes)
  for (const occurrence of poser) {
    annotations.push({ ...occurrence, type: 'anon', auteur: 'corpus', etat: 'anonymise' })
    actions.poses++
  }
  const nb = totalActions(actions)
  if (nb) entretien.annotations = annotations
  return { nb, actions }
}

export function appliquerRegleAnonEntretien(entretien: EntretienFichier, regle: RegleAnon, cible: DiffAnon, genId = genIdDefaut): number {
  return appliquerRegleAnonEntretienAvecBilan(entretien, regle, cible, genId).nb
}
