import type { EntretienFichier, RegleAnon } from '../../src/shared/format'

/** Corpus synthétique sans données personnelles réelles, partagé par les recettes. */
export function fixturePseudonymisation(): { regles: RegleAnon[]; entretiens: { id: string; data: EntretienFichier }[] } {
  const regles: RegleAnon[] = [
    { id: 'ville', entite: ['Lyon', 'Lyons'], pseudos: ['Ville témoin'], categorie: 'LOC' },
    { id: 'personne', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER' },
    { id: 'collision', entite: ['Marseille'], pseudos: ['Ville témoin'] },
    { id: 'gare', entite: ['Gare'], pseudos: ['Station'] },
    { id: 'inutilisee', entite: ['Absente'], pseudos: ['Inutilisée'] },
  ]
  const texte = 'Lyon. Lyons. Karine. Karine. Marseille. Rue de la Gare. Local.'
  const data: EntretienFichier = {
    formatVersion: 3, lastModified: '2026-10-08T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] },
    annotations: [], ancres: [], meta: { valeursGen: {}, audioRef: null },
    locuteurs: [{ index: 0, nom: 'Locuteur synthétique sans tour', pseudo: 'Voix témoin', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null }],
    brouillonsAnon: [{ entite: 'Brouillon synthétique', pseudo: 'Essai' }],
  }
  let seq = 0
  const ajouter = (entite: string, pseudo: string, regle?: string, etat: 'anonymise' | 'exception' = 'anonymise', debut = 0) => {
    const from = texte.indexOf(entite, debut) + 1
    data.annotations.push({ id: `a-${++seq}`, from, to: from + entite.length, type: 'anon', auteur: 'test', pseudo, regle, etat })
  }
  ajouter('Lyon', 'Ville témoin', 'ville')
  ajouter('Lyons', 'Ville témoin', 'ville', 'exception')
  ajouter('Karine', 'Claire', 'personne')
  ajouter('Karine', 'Rebecca', 'personne', 'anonymise', texte.indexOf('Karine') + 1)
  ajouter('Gare', 'Station', 'gare', 'exception')
  ajouter('Rue de la Gare', 'Quartier témoin')
  ajouter('Local', 'Définition locale')
  return { regles, entretiens: [{ id: 'entretien-synthetique', data }] }
}
