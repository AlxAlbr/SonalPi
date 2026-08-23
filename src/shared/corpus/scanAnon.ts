/**
 * Scan ANONYMISATION au niveau du CORPUS.
 *
 * Pour chaque RÈGLE corpus (`RegleAnon`), on relit le texte de chaque entretien
 * et on classe les occurrences de l'entité : déjà anonymisées / en exception /
 * à traiter. C'est une REQUÊTE (rien de stocké, aucun cache) : le texte est
 * relu à chaque ouverture du panneau « Pseudos », pour révéler les changements
 * qui « coincident » avec une règle.
 *
 * Seules les RÈGLES corpus sont scannées. Les occurrences entretien-locales
 * (standalone, 2ᵉ cran du slider) ne figurent pas dans le panneau corpus, mais
 * elles marquent quand même le texte (une occurrence déjà posée couvre le mot,
 * même si elle ne vient pas d'une règle).
 *
 * PURE : lit `EntretienFichier` (corpsTexte + annotations) et `RegleAnon`, ne
 * mute rien, aucune I/O — testable headless.
 */

import type { EntretienFichier, RegleAnon } from '../format'
import { aplatir, occurrencesDe, plageVersPM, type Plage, type TextePlat } from '../entretien/anon'
import { estOrpheline } from '../entretien/annotation'

/** Compteurs d'état d'une entité pour une règle (textes agrégés ou par entretien). */
export interface StatutScan {
  /** Occurrences couvertes par une annotation `anon` au pseudo de la règle. */
  anon: number
  /** Occurrences couvertes par une annotation `exception`. */
  exc: number
  /** Occurrences présentes dans le texte mais ni anonymisées ni en exception. */
  non: number
}

/** Résultat de scan d'une règle corpus, avec drill-down par entretien. */
export interface ScanRegle {
  regle: RegleAnon
  total: StatutScan
  /** entretienId → statuts. Ne contient qu'un entretien si l'entité y apparaît. */
  parEntretien: Record<string, StatutScan>
}

/** Élément d'entretien fourni au scan (id → données lues sur disque). */
export interface EntretienScan {
  id: string
  data: EntretienFichier
}

/** Retourne les annotations anon couvrant le DEBUT d'une position PM. */
function anonCouvrantDebut(annotations: EntretienFichier['annotations'], debutPM: number) {
  return annotations.filter((a) => a.type === 'anon' && !estOrpheline(a) && a.from <= debutPM && debutPM < a.to)
}

/** Classe UNE occurrence (plage plat) d'une entité dans un texte aplatit.
 *  Priorité : EXCEPTION d'abord (une occurrence dans une exception n'est
 *  JAMAIS « à traiter »), puis ANONYMISÉE (pseudo ∈ pseudos de la règle),
 *  sinon NON traitée.
 *  Compat V1 : « incluse » (absorbée par une autre règle) est différée — une
 *  occurrence anonymisée par un pseudo ÉTRANGER tombe en `non` pour cette règle. */
function classerOccurrence(annotations: EntretienFichier['annotations'], plat: TextePlat, plage: Plage, pseudos: string[]): 'anon' | 'exc' | 'non' {
  const t = plageVersPM(plat, plage.from, plage.to)
  if (!t) return 'non'
  const couvrants = anonCouvrantDebut(annotations, t.from)
  if (couvrants.some((a) => a.etat === 'exception')) return 'exc'
  const anon = couvrants.find((a) => a.etat === 'anonymise')
  if (anon && pseudos.some((p) => (p || '').toLowerCase() === (anon.pseudo || '').toLowerCase())) return 'anon'
  return 'non'
}

/**
 * Scan du corpus : pour chaque règle, agrége les occurrences par état sur
 * l'ensemble des entretiens fournis (déjà lus sur disque par l'appelant).
 */
export function scannerCorpus(regles: RegleAnon[], entretiens: EntretienScan[]): ScanRegle[] {
  const out: ScanRegle[] = []
  for (const regle of regles) {
    const total: StatutScan = { anon: 0, exc: 0, non: 0 }
    const parEntretien: Record<string, StatutScan> = {}
    const pseudos = regle.pseudos
    for (const ent of entretiens) {
      const plat = aplatir(ent.data.corpsTexte)
      const st: StatutScan = { anon: 0, exc: 0, non: 0 }
      let touche = false
      for (const alias of regle.entite) {
        for (const m of occurrencesDe(plat.texte, alias)) {
          touche = true
          const e = classerOccurrence(ent.data.annotations, plat, m, pseudos)
          if (e === 'anon') st.anon++
          else if (e === 'exc') st.exc++
          else st.non++
        }
      }
      if (!touche) continue
      parEntretien[ent.id] = st
      total.anon += st.anon
      total.exc += st.exc
      total.non += st.non
    }
    out.push({ regle, total, parEntretien })
  }
  return out
}

/* ── Ajustement des compteurs après application en masse ────────────────────*/

/** Déplace les occurrences posées par une application en masse du compteur
 *  « à traiter » vers « anonymisées », sans re-scan.
 *  Le lot renvoie le nombre d'occurrences réellement posées par entretien,
 *  et les fichiers locaux sont déjà à jour (écriture THROUGH).
 *  PURE : renvoie un nouveau tableau, ne mute rien.
 *  L'affichage reste ainsi cohérent jusqu'au prochain pull. */
export function ajusterScanApresApplication(
  scan: ScanRegle[],
  regleId: string,
  succes: { id: string; nb: number }[],
): ScanRegle[] {
  const posees = new Map<string, number>()
  for (const x of succes) posees.set(x.id, (posees.get(x.id) ?? 0) + Math.max(0, x.nb))
  return scan.map((s) => {
    if (s.regle.id !== regleId) return s
    let deplace = 0
    const parEntretien: Record<string, StatutScan> = {}
    for (const [id, st] of Object.entries(s.parEntretien)) {
      const copie = { ...st }
      const nb = posees.get(id)
      if (nb) {
        const n = Math.min(nb, copie.non) // borné : jamais de compteur négatif
        copie.non -= n
        copie.anon += n
        deplace += n
      }
      parEntretien[id] = copie
    }
    return { ...s, parEntretien, total: { ...s.total, anon: s.total.anon + deplace, non: s.total.non - deplace } }
  })
}
