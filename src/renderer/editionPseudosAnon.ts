import type { RegleAnon } from '../shared/format'
import { validerDefinitionAnon } from '../shared/corpus/definitionsAnon'

export function lirePseudos(saisie: string): string[] {
  const pseudos = saisie.split('/').map((p) => p.trim().normalize('NFC'))
  if (pseudos.some((p) => !p)) throw new Error('Saisissez un pseudonyme de chaque côté du slash.')
  if (pseudos.length > 2) throw new Error('Deux pseudonymes maximum sont autorisés.')
  if (new Set(pseudos.map((p) => p.toLocaleLowerCase('fr'))).size !== pseudos.length) {
    throw new Error('Saisissez deux pseudonymes différents.')
  }
  return pseudos
}

export type EditionPseudosAnon =
  | { type: 'inchange' }
  | { type: 'ajout'; pseudo: string }
  | { type: 'renommage'; ancienPseudo: string; nouveauPseudo: string }
  | { type: 'retrait'; pseudoRetire: string; pseudoConserve: string }

/** La saisie indique l’intention ; renommage et retrait passent par leur bilan protégé. */
export function preparerEditionPseudos(regle: RegleAnon, saisie: string): EditionPseudosAnon {
  if (regle.pseudos.some((p) => p.includes('/'))) {
    throw new Error('Un pseudonyme contient déjà un slash. Cette saisie ne permet pas de le modifier.')
  }
  const apres = validerDefinitionAnon(regle.entite, lirePseudos(saisie), regle.categorie).pseudos
  const avant = regle.pseudos.map((p) => p.trim().normalize('NFC'))
  const retires = avant.filter((p) => !apres.includes(p)), ajoutes = apres.filter((p) => !avant.includes(p))
  if (avant.length === 2 && apres.length === 1 && retires.length === 1 && !ajoutes.length) {
    return { type: 'retrait', pseudoRetire: regle.pseudos[avant.indexOf(retires[0])], pseudoConserve: apres[0] }
  }
  if (apres.length < avant.length) throw new Error('Retirez une seule variante en conservant l’autre sans la modifier.')
  if (!retires.length && !ajoutes.length) return { type: 'inchange' }
  if (!retires.length && ajoutes.length === 1) return { type: 'ajout', pseudo: ajoutes[0] }
  if (retires.length === 1 && ajoutes.length === 1 && avant.length === apres.length) {
    return { type: 'renommage', ancienPseudo: regle.pseudos[avant.indexOf(retires[0])], nouveauPseudo: ajoutes[0] }
  }
  throw new Error('Modifiez un seul pseudonyme à la fois, sans ajouter et renommer simultanément.')
}
