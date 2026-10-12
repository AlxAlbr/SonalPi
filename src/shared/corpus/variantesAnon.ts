import type { CorpusFichier, RegleAnon } from '../format'
import { validerDefinitionAnon } from './definitionsAnon'
import { exigerAbsenceSuppressionAnon } from './barriereSuppressionAnon'

export interface DemandeAjoutVarianteAnon { regleAvant: RegleAnon; pseudo: string }
export interface ResultatAjoutVarianteAnon { regle: RegleAnon; ajoute: boolean }

const cle = (s: string) => s.normalize('NFC').toLocaleLowerCase('fr')
const empreinteDefinition = (r: RegleAnon) => JSON.stringify([r.id, r.entite, r.pseudos, r.categorie])

/** Ajoute une variante à la définition fraîche, sans toucher aux choix des entretiens. */
export function ajouterVarianteAnon(corpus: CorpusFichier, demande: DemandeAjoutVarianteAnon): ResultatAjoutVarianteAnon {
  exigerAbsenceSuppressionAnon(corpus)
  if (corpus.dissociationAnon !== undefined) throw new Error('Une dissociation reste à terminer. Aucun ajout de variante autorisé.')
  if (!demande || !demande.regleAvant || typeof demande.regleAvant.id !== 'string' || typeof demande.pseudo !== 'string') {
    throw new Error('La demande d’ajout de variante est invalide.')
  }
  const id = demande.regleAvant.id
  if (!Object.hasOwn(corpus.reglesAnon, id)) throw new Error('La règle n’existe plus. Actualisez le corpus avant de recommencer.')
  const regle = corpus.reglesAnon[id]
  const definition = validerDefinitionAnon(regle.entite, regle.pseudos, regle.categorie)
  if (regle.id !== id || JSON.stringify(regle.entite) !== JSON.stringify(definition.entite)
    || JSON.stringify(regle.pseudos) !== JSON.stringify(definition.pseudos) || regle.categorie !== definition.categorie) {
    throw new Error('La définition doit être normalisée avant d’ajouter une variante.')
  }
  if (empreinteDefinition(regle) !== empreinteDefinition(demande.regleAvant)) {
    throw new Error('La règle a changé. Actualisez le corpus puis rouvrez cette fenêtre.')
  }
  const pseudo = demande.pseudo.trim().normalize('NFC')
  if (!pseudo) throw new Error('Saisissez un pseudonyme non vide.')
  if (regle.pseudos.some((p) => cle(p) === cle(pseudo))) return { regle: structuredClone(regle), ajoute: false }
  const apres = validerDefinitionAnon(regle.entite, [...regle.pseudos, pseudo], regle.categorie)
  regle.pseudos = apres.pseudos
  return { regle: structuredClone(regle), ajoute: true }
}
