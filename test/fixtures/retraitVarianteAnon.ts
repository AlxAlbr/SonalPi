import { fixtureRenommageAnon } from './renommageAnon'

/** Choix synthétiques liés, indépendants et masqués, sans donnée utilisateur. */
export function fixtureRetraitVarianteAnon() {
  const f = fixtureRenommageAnon(['e1', 'e2', 'e3'])
  f.sources[0].data.annotations.find((a) => a.id === 'a5')!.etat = 'exception'
  for (const a of f.sources[2].data.annotations) if (a.regle === 'personne') a.pseudo = 'Rebecca'
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  return { ...f, demande: { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudoRetire: 'Claire', pseudoConserve: 'Rebecca' } }
}
