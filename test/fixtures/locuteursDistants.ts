import type { CorpusFichier, EntretienFichier } from '../../src/shared/format'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { inventorierPersonnes } from '../../src/shared/corpus/personnes'

export function fixtureLocuteursDistants() {
  const corpus: CorpusFichier = squeletteCorpus('Locuteurs partagés')
  corpus.locuteurs = { a: { id: 'a', nom: 'Alice' }, b: { id: 'b', nom: 'Bob' }, vide: { id: 'vide', nom: 'Sans entretien' } }
  corpus.codebook.theme = { id: 'theme', nom: 'Thème conservé', ordre: 0, parent: null, actif: true, codeExport: 'theme' }
  const entretiens = ['A', 'B', 'C'].map((id, i) => {
    corpus.membership[id] = { titre: `Entretien ${id}`, date: null, lastModified: '2026-01-01T00:00:00.000Z' }
    const data: EntretienFichier = { formatVersion: 10, lastModified: '2026-01-01T00:00:00.000Z',
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: `Paroles conservées ${id}.` }] }] },
      annotations: [{ id: 'codage', type: 'codage', from: 1, to: 4, code: 'theme', auteur: 'Qualification' }], ancres: [{ pos: 1, t: 0 }],
      meta: { valeursGen: {}, audioRef: null },
      participations: [{ id: 'local', index: 7, nom: i < 2 ? `Alice ${id}` : 'Bob', locuteurRef: i < 2 ? 'a' : 'b',
        pseudo: `Pseudo ${id}`, interviewer: i === 0, couleur: '#123456', valeursLoc: {}, rapprochementsRefuses: [] }],
      notes: [{ id: 'note', categorieId: 'ncat_generale', titre: `Note ${id}`, corps: `Contenu ${id}`, date: null, statut: 'prive', rang: 0, participationIds: ['local'], creeLe: '', modifieLe: null }],
    }
    return { id, titre: `Entretien ${id}`, data }
  })
  const sources = () => entretiens.map((e) => ({ id: e.id, contenu: JSON.stringify(e.data) }))
  const attendu = () => JSON.stringify({ ...inventorierPersonnes(corpus, entretiens), indisponibles: [] })
  return { corpus, entretiens, sources, attendu }
}
