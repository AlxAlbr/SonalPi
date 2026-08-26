/**
 * Application EN MASSE d'une règle corpus sur un entretien FERMÉ.
 *
 * Depuis le panneau « Pseudos » du corpus, on coche des entretiens et on pose
 * les `OccurrenceAnon` rule-backed (« à traiter » → anonymisées avec le pseudo
 * primaire de la règle). L'entretien n'est pas ouvert dans l'éditeur : on lit
 * le fichier, on applique les instructions PURES, le store écrit atomiquement
 * (l'atomicité fichier remplace la plomberie SonalPi).
 *
 * Ne touche PAS aux occurrences déjà couvertes (anonymisées OU en exception) :
 * une exception ne repasse jamais « à traiter », un match déjà barre reste.
 * PURE : lit `EntretienFichier` + `RegleAnon`, ne mute rien — testable headless.
 */

import type { EntretienFichier, RegleAnon } from '../../format'
import { aplatir, occurrencesDe, plageVersPM } from './anonymisation'
import { parserAliases } from './alias'
import { estOrpheline, type Annotation } from '../annotation'

/** Instructions d'application en masse (rien n'est muté ici). */
export interface InstructionsMasse {
  poser: Array<{ id: string; from: number; to: number; pseudo: string; regle: string }>
  /** Nombre de matchs « à traiter » couverts par cette passe. */
  nb: number
}

/**
 * Calcule les occurrences rule-backed à poser sur un entretien pour une règle :
 * chaque match de l'entité NON déjà couvert par une annotation `anon` (anonymisée
 * ou exception) est proposé à l'application. Pseudo appliqué = primaire de la règle.
 */
export function instructionsAppliquerRegle(
  entretien: EntretienFichier,
  regle: RegleAnon,
  genId: () => string,
): InstructionsMasse {
  const plat = aplatir(entretien.corpsTexte)
  const poser: InstructionsMasse['poser'] = []
  const pseudoP = regle.pseudos[0]
  const existantes = entretien.annotations.filter(
    (a) => a.type === 'anon' && !estOrpheline(a),
  )
  for (const alias of regle.entite.flatMap((e) => parserAliases(e))) {
    for (const m of occurrencesDe(plat.texte, alias)) {
      const pm = plageVersPM(plat, m.from, m.to)
      if (!pm) continue
      // Couvert par une annotation couvrant le DEBUT du match → déjà traité.
      const couvert = existantes.some((a) => a.from <= pm.from && pm.from < a.to)
      if (couvert) continue
      poser.push({ id: genId(), from: pm.from, to: pm.to, pseudo: pseudoP, regle: regle.id })
    }
  }
  return { poser, nb: poser.length }
}

/** Restreint les occurrences à poser à celles COCHÉES dans la vue vérification
 *  (`plages` = positions PM exactes). Absent ou vide → tout est conservé
 *  (application en masse entière, comportement par défaut). PURE. */
export function poserDansPlages(
  poser: InstructionsMasse['poser'],
  plages?: { from: number; to: number }[],
): InstructionsMasse['poser'] {
  if (!plages || plages.length === 0) return poser
  const cibles = new Set(plages.map((p) => `${p.from}:${p.to}`))
  return poser.filter((o) => cibles.has(`${o.from}:${o.to}`))
}

/** Applique le DIFF de validation de la vue vérification sur les annotations
 *  d'un entretien FERMÉ (façon SonalPi V1 « Valider ») : retraits d'exceptions,
 *  dé-pseudonymisations, exceptions posées. Les POSES ne passent pas ici :
 *  elles viennent des instructions de la règle (`instructionsAppliquerRegle`).
 *  Une exception posée sur une occurrence déjà anonymisée par la MÊME règle
 *  bascule son état (le pseudo reste en mémoire pour un retour arrière) ;
 *  sinon une annotation `exception` est créée. Retirer une exception SUPPRIME
 *  l'annotation : l'occurrence redevient « à traiter ». Mute `annotations`
 *  en place et renvoie le nombre de changements. Ordre SonalPi V1 : les exceptions
 *  sont retirées AVANT tout le reste. PURE vis-à-vis du disque. */
export function appliquerDiffAnon(
  annotations: Annotation[],
  regleId: string,
  retirer?: { from: number; to: number }[],
  exception?: { from: number; to: number }[],
  retirerException?: { from: number; to: number }[],
): number {
  let n = 0
  const memePlage = (a: Annotation, ps: { from: number; to: number }[]) =>
    ps.some((p) => p.from === a.from && p.to === a.to)
  const deLaRegle = (a: Annotation) => a.type === 'anon' && a.regle === regleId

  // 1. Retirer les exceptions : l'annotation est supprimée, l'occurrence
  //    redevient « à traiter » (les poses suivantes la voient libre).
  if (retirerException?.length) {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      if (deLaRegle(a) && a.etat === 'exception' && memePlage(a, retirerException)) {
        annotations.splice(i, 1)
        n++
      }
    }
  }

  // 2. Dé-pseudonymiser : supprimer les annotations anonymisées décochées.
  if (retirer?.length) {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      if (deLaRegle(a) && a.etat !== 'exception' && memePlage(a, retirer)) {
        annotations.splice(i, 1)
        n++
      }
    }
  }

  // 3. Poser les exceptions : bascule d'état si la règle anonymise déjà cette
  //    plage, création d'une annotation dédiée sinon.
  if (exception?.length) {
    const restantes = exception.slice()
    for (const a of annotations) {
      if (!deLaRegle(a) || a.etat === 'exception') continue
      const i = restantes.findIndex((p) => p.from === a.from && p.to === a.to)
      if (i >= 0) {
        a.etat = 'exception'
        restantes.splice(i, 1)
        n++
      }
    }
    for (const p of restantes) {
      annotations.push({
        id: 'a-' + Math.random().toString(36).slice(2, 9),
        type: 'anon',
        from: p.from,
        to: p.to,
        auteur: 'corpus',
        etat: 'exception',
        regle: regleId,
      })
      n++
    }
  }
  return n
}
