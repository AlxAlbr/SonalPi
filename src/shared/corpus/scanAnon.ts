/**
 *  Scan ANONYMISATION au niveau du CORPUS.
 *
 *  Pour chaque RÈGLE corpus (`RegleAnon`), on relit le texte de chaque
 *  entretien et on classe les occurrences de l'entité : déjà anonymisées /
 *  en exception / à traiter. C'est une REQUÊTE (rien de stocké, aucun cache) :
 *  le texte est relu à chaque ouverture du panneau « Pseudos », pour révéler
 *  les changements qui « coincident » avec une règle.
 *
 *  Seules les RÈGLES corpus sont scannées. Les occurrences entretien-locales
 *  (standalone, 2ᵉ cran du slider) ne figurent pas dans le panneau corpus,
 *  mais elles marquent quand même le texte (une occurrence déjà posée couvre
 *  le mot, même si elle ne vient pas d'une règle).
 *
 *  PURE : lit `EntretienFichier` (corpsTexte + annotations) et `RegleAnon`, ne
 *  mute rien, aucune I/O — testable headless.
 */

import type { EntretienFichier, RegleAnon } from '../format'
import { aplatir, occurrencesDe, plageVersPM, type Plage, type TextePlat } from '../entretien/anon'
import { parserAliases } from '../entretien/anon/alias'
import { cleEntite } from '../entretien/anon/brouillonsAnon'
import { estOrpheline } from '../entretien/annotation'

/** Compteurs d'état d'une entité pour une règle (textes agrégés ou par entretien). */
export interface StatutScan {
  /** Occurrences couvertes par une annotation `anon` au pseudo de la règle. */
  anon: number
  /** Occurrences couvertes par une annotation `exception`. */
  exc: number
  /** Occurrences présentes dans le texte mais ni anonymisées ni en exception. */
  non: number
  /** Occurrences INCLUSES : recouvertes par une entité plus large (masquées,
   *  comptées nulle part) — exposant « +N », non actionnables ici. */
  incl: number
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

/** Texte plat couvert par une plage PM. Les annotations vivent sur le même doc que les matchs ;
 *  on re-projette leur plage sur le texte aplati pour savoir QUELLE entité elles couvrent,
 *  par comparaison du texte, pas du pseudo. */
function textePM(plat: TextePlat, from: number, to: number): string {
  let platDebut = 0
  let a: number | null = null
  let b: number | null = null
  for (const bloc of plat.blocs) {
    const finPM = bloc.debut + bloc.longueur
    if (a === null && from <= finPM) a = Math.max(from - bloc.debut, 0) + platDebut
    if (b === null && to <= finPM) {
      b = Math.min(Math.max(to - bloc.debut, 0), bloc.longueur) + platDebut
    }
    if (a !== null && b !== null) break
    platDebut += bloc.longueur + 1 // +1 : le saut de ligne séparateur
  }
  if (a === null || b === null || b <= a) return ''
  return plat.texte.slice(a, b)
}

/** Classe UNE occurrence (plage plat) d'une entité dans un texte aplatit.
 *  Priorité : EXCEPTION d'abord (une occurrence dans une exception n'est
 *  JAMAIS « à traiter »), puis ANONYMISÉE (pseudo ∈ pseudos de la règle),
 *  puis INCLUSE (recouverte par une anonymisation d'une AUTRE entité plus
 *  large — masquée, non actionnable ici), sinon NON traitée. */
function classerOccurrence(
  annotations: EntretienFichier['annotations'],
  plat: TextePlat,
  plage: Plage,
  clesRegle: Set<string>,
  pseudos: string[],
): 'anon' | 'exc' | 'non' | 'incl' {
  const t = plageVersPM(plat, plage.from, plage.to)
  if (!t) return 'non'
  const couvrants = anonCouvrantDebut(annotations, t.from)
  if (couvrants.some((a) => a.etat === 'exception')) return 'exc'
  const anon = couvrants.find((a) => a.etat === 'anonymise')
  if (!anon) return 'non'
  // Même entité que la règle ? Parité avec le compteur entretien.
  // On compare le TEXTE recouvert par l'annotation (cleEntite), pas seulement son pseudo.
  // Un pseudo venu d'une expérimentation multi-pseudo ou d'un ancien libellé,
  // ne doit pas déclasser une occurrence pourtant anonymisée.
  // Le pseudo reste accepté en secours (annotation posée par une règle au libellé différent).
  if (clesRegle.has(cleEntite(textePM(plat, anon.from, anon.to)).toLowerCase())) return 'anon'
  if (pseudos.some((p) => (p || '').toLowerCase() === (anon.pseudo || '').toLowerCase())) return 'anon'
  // Entité étrangère : INCLUSE seulement si l'annotation ENGLOBE strictement le match (entité plus large) ;
  // à périmètre égal, c'est la même entité sous un autre libellé → « non » (à traiter).
  const englobe = anon.to - anon.from > t.to - t.from
  return englobe ? 'incl' : 'non'
}

/**
 *  Scan du corpus : pour chaque règle, agrège les occurrences par état sur
 *  l'ensemble des entretiens fournis (déjà lus sur disque par l'appelant).
 *
 *  Comptage par les DONNÉES pour l'état stocké : les anonymisées et exceptions
 *  sont des annotations — on les compte directement (l'entité est reconnue au
 *  texte qu'elles couvrent, jamais au pseudo porté). Le TEXTE n'est parcouru
 *  que pour la requête « à anonymiser » (matchs sans annotation) et les
 *  incluses (matchs absorbés par une entité plus large) : un utilisateur qui
 *  édite fait émerger de nouvelles occurrences à traiter, le reste vit dans
 *  les annotations.
 */
export function scannerCorpus(regles: RegleAnon[], entretiens: EntretienScan[]): ScanRegle[] {
  const out: ScanRegle[] = []
  for (const regle of regles) {
    const total: StatutScan = { anon: 0, exc: 0, non: 0, incl: 0 }
    const parEntretien: Record<string, StatutScan> = {}
    const clesRegle = new Set(regle.entite.map((e) => cleEntite(e).toLowerCase()))
    const aliases = regle.entite.flatMap((e) => parserAliases(e))
    for (const ent of entretiens) {
      const plat = aplatir(ent.data.corpsTexte)
      const vivantes = ent.data.annotations.filter(
        (a) => a.type === 'anon' && !estOrpheline(a),
      )
      const st: StatutScan = { anon: 0, exc: 0, non: 0, incl: 0 }
      let touche = false

      // 1. ÉTAT STOCKÉ : anonymisées et exceptions se comptent depuis les annotations,
      //    sans déduction ni dépendance au pseudo porté.
      for (const a of vivantes) {
        if (!clesRegle.has(cleEntite(textePM(plat, a.from, a.to)).toLowerCase())) continue
        touche = true
        if (a.etat === 'exception') st.exc++
        else st.anon++
      }

      // 2. REQUÊTE sur le texte : « à anonymiser » et « incluses ».
      for (const alias of aliases) {
        for (const m of occurrencesDe(plat.texte, alias)) {
          touche = true
          const t = plageVersPM(plat, m.from, m.to)
          if (!t) continue
          const couvrantes = vivantes.filter((a) => a.from <= t.from && t.from < a.to)
          const englobante = couvrantes.find((a) => t.to <= a.to)
          if (!englobante) {
            st.non++ // occurrence nue, ou recouvrement seulement partiel
            continue
          }
          const cle = cleEntite(textePM(plat, englobante.from, englobante.to)).toLowerCase()
          if (clesRegle.has(cle)) continue // déjà comptée en 1 (anonymisée/exception)
          st.incl++ // absorbée par une entité étrangère plus large
        }
      }

      if (!touche) continue
      parEntretien[ent.id] = st
      total.anon += st.anon
      total.exc += st.exc
      total.non += st.non
      total.incl += st.incl
    }
    out.push({ regle, total, parEntretien })
  }
  return out
}

/* ── Scan DÉTAILLÉ d'une règle (vue vérification du panneau corpus) ─────────*/

/** Occurrence vue par la vérification corpus : position PM, état,
 *  contexte lisible « avant / match / après » (parité accordéon V1). */
export interface OccurrenceScan {
  from: number
  to: number
  etat: 'anon' | 'exc' | 'non' | 'incl'
  /** Texte AVANT le match (~`contexte` caractères), gris dans l'UI. */
  avant: string
  /** Le texte du match lui-même. */
  match: string
  /** Texte APRÈS le match (~`contexte` caractères). */
  apres: string
}

/** Décompte les occurrences d'une règle dans un entretien, avec leur état et contexte.
 *  Même classification que le scan agrégé, affichée occurrence par occurrence.
 *  PURE : ne lit rien sur disque. */
export function scannerRegleDetaille(
  regle: RegleAnon,
  entretien: EntretienScan,
  contexte = 24,
): OccurrenceScan[] {
  const plat = aplatir(entretien.data.corpsTexte)
  const pseudos = regle.pseudos
  const clesRegle = new Set(regle.entite.map((e) => cleEntite(e).toLowerCase()))
  const out: OccurrenceScan[] = []
  for (const alias of regle.entite.flatMap((e) => parserAliases(e))) {
    for (const m of occurrencesDe(plat.texte, alias)) {
      const etat = classerOccurrence(entretien.data.annotations, plat, m, clesRegle, pseudos)
      out.push({
        ...plageVersPM(plat, m.from, m.to)!,
        etat,
        avant: plat.texte.slice(Math.max(0, m.from - contexte), m.from),
        match: plat.texte.slice(m.from, m.to),
        apres: plat.texte.slice(m.to, Math.min(plat.texte.length, m.to + contexte)),
      })
    }
  }
  return out.sort((x, y) => x.from - y.from)
}

/* ── Ajustement des compteurs après application en masse ────────────────────*/

/** Déplace vers « anonymisées » les occurrences posées par application en masse,
 *  sans re-scan, depuis le compteur « à traiter ».
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
