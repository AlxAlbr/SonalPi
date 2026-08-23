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
import { estOrpheline } from '../annotation'

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
  for (const alias of regle.entite) {
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
