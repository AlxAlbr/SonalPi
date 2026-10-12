import { FORMAT_VERSION, type EntretienFichier } from '../../src/shared/format'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'

/** Toutes les identités et décisions de ce corpus sont synthétiques. */
export function fixtureRenommageAnon(ids = ['e1', 'e2'], couverture: 'anonymise' | 'exception' = 'anonymise') {
  const corpus = squeletteCorpus('Renommage synthétique')
  corpus.reglesAnon = { personne: { id: 'personne', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER' },
    autre: { id: 'autre', entite: ['Ailleurs'], pseudos: ['Nouvelle'] }, vide: { id: 'vide', entite: ['Absente'], pseudos: ['Inutilisée'] } }
  const texte = 'Karine. Karine. Karine. Karine. Karine. Rue Karine. Local.'
  const positions = [...texte.matchAll(/Karine/g)].map((m) => m.index + 1)
  const data: EntretienFichier = { formatVersion: FORMAT_VERSION, lastModified: '2026-10-09T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] },
    annotations: [], ancres: [], meta: { valeursGen: {}, audioRef: null },
    locuteurs: [{ index: 0, nom: 'Karine', pseudo: 'Claire', pseudoEtat: 'refuse', personneRef: 'personne-independante', valeursLoc: { modalite: 'Valeur' } }],
    definitionsAnonLocales: [{ entite: ['Local', 'Autre local'], pseudos: ['Mémoire indépendante'], categorie: 'LOC', etat: 'declaration' }],
    brouillonsAnon: [{ entite: 'Brouillon', pseudo: '' }], pseudosDeclares: { local: ['Mémoire indépendante'] } }
  for (const [n, pseudo, etat, regle] of [
    [0, 'Claire', 'anonymise', 'personne'], [1, 'Rebecca', 'anonymise', 'personne'],
    [2, 'Claire', 'exception', 'personne'], [3, 'Claire', 'anonymise', undefined], [5, 'Claire', 'anonymise', 'personne'],
  ] as const) data.annotations.push({ id: `a${n}`, type: 'anon', from: positions[n], to: positions[n] + 6, auteur: 'test', pseudo, etat, regle })
  const from = texte.indexOf('Rue Karine') + 1
  data.annotations.push({ id: 'englobante', type: 'anon', from, to: from + 'Rue Karine'.length, auteur: 'test', pseudo: 'Quartier', etat: couverture })
  const sources = ids.map((id) => {
    corpus.membership[id] = { titre: `Entretien ${id}`, date: null, lastModified: data.lastModified }
    return { id, titre: `Entretien ${id}`, data: structuredClone(data) }
  })
  corpus.ordreEntretiens = [...ids]
  return { corpus, sources, demande: { regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Nouvelle' } }
}
