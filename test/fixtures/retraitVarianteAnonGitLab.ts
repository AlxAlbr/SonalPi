import { fixtureSuppressionAnonGitLab } from './suppressionAnonGitLab'
import { RetraitsVarianteAnonGitLab } from '../../src/main/gitlab/retraitsVarianteAnon'

/** Dépôt isolé avec un miroir périmé et une non-cible encore liée à la variante restante. */
export function fixtureRetraitVarianteAnonGitLab(dossiers: string[], nombre = 3) {
  const b = fixtureSuppressionAnonGitLab(dossiers, nombre)
  b.sources[0].data.annotations.find((a) => a.id === 'a5')!.etat = 'exception'
  b.depot.modifierHorsProtocole('racine/entretiens/e1.json', JSON.stringify(b.sources[0].data))
  if (b.sources[2]) {
    b.sources[2].data.annotations = structuredClone(b.sources[1].data.annotations)
    for (const a of b.sources[2].data.annotations) if (a.regle === 'personne') a.pseudo = 'Rebecca'
    b.depot.modifierHorsProtocole('racine/entretiens/e3.json', JSON.stringify(b.sources[2].data))
  }
  const demande = { regleAvant: structuredClone(b.corpus.reglesAnon.personne), pseudoRetire: 'Claire', pseudoConserve: 'Rebecca' }
  let maintenant = Date.now()
  const service = new RetraitsVarianteAnonGitLab(b.options, () => b.sessions, () => maintenant)
  return { ...b, demande, service, expirer: () => { maintenant += 300_001 }, preparer: () => service.preparer(demande) }
}
