import { fixtureRenommageAnon } from './renommageAnon'
import { aplatir } from '../../src/shared/entretien/anon/anonymisation'

/** Les choix locaux indépendants portent ici un autre nom que la règle à dissocier. */
export function fixtureDissociationAnon(ids = ['e1', 'e2', 'e3']) {
  const f = fixtureRenommageAnon(ids)
  for (const s of f.sources) {
    const texte = aplatir(s.data.corpsTexte).texte
    const a = s.data.annotations.find((a) => a.id === 'a3')!
    a.from = texte.indexOf('Local') + 1; a.to = a.from + 5; a.pseudo = 'Mémoire indépendante'
    if (s.id === 'e3') s.data.annotations = []
  }
  return { ...f, demande: { regleId: 'personne' } }
}
