import { describe, expect, test } from 'vitest'
import { verifierReferencesDefinitions, verifierContenusReferencesDefinitions } from '../../src/main/gitlab/referencesDefinitions'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'

function banc() {
  const f = fixtureRenommageAnon(['e1'])
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  f.corpus.reglesAnon.personne.pseudos = ['Nouvelle', 'Rebecca']
  const avant = f.sources[0].data, candidat = structuredClone(avant)
  return { corpus: f.corpus, avant, candidat }
}

describe('choix liés validés contre le corpus publié', () => {
  test('préserve les choix anciens inchangés, la mémoire, les exceptions et les locuteurs', () => {
    const b = banc(); b.candidat.lastModified = 'Sauvegarde sans changement du choix'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).not.toThrow()
    expect(b.candidat.annotations[0].pseudo).toBe('Claire')
    expect(b.candidat.definitionsAnonLocales).toEqual(b.avant.definitionsAnonLocales)
  })
  test('nouvelle annotation liée avec une variante retirée : refus', () => {
    const b = banc(); b.candidat.annotations.push({ ...b.avant.annotations[0], id: 'nouvelle-decision' })
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).toThrow('variante choisie')
  })
  test('nouvelle variante et autre variante existante : acceptées', () => {
    const b = banc(); b.candidat.annotations[0].pseudo = 'Nouvelle'
    b.candidat.annotations.push({ ...b.avant.annotations[0], id: 'nouvelle-decision', pseudo: 'Rebecca' })
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).not.toThrow()
  })
  test('restaurer un ancien pseudo après renommage : refus, même identifiant d’annotation', () => {
    const b = banc(); b.avant.annotations[0].pseudo = 'Nouvelle'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).toThrow('variante choisie')
  })
  test('réactivation d’une exception : nouveau choix requis, mémoire de l’exception intacte', () => {
    const b = banc(); b.candidat.annotations[2].etat = 'anonymise'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).toThrow('variante choisie')
    b.candidat.annotations[2].pseudo = 'Nouvelle'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).not.toThrow()
    expect(b.avant.annotations[2].pseudo).toBe('Claire')
  })
  test('décision indépendante ancienne ou nouvelle : ne dépend pas des variantes partagées', () => {
    const b = banc(); b.candidat.annotations[3].pseudo = 'Choix indépendant'
    b.candidat.annotations.push({ ...b.avant.annotations[0], id: 'independante', regle: undefined, pseudo: 'Libre' })
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).not.toThrow()
  })
  test('rattachement nouveau à une règle : vérifie le choix, pas seulement l’identité', () => {
    const b = banc(); b.candidat.annotations[3].regle = 'personne'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).toThrow('variante choisie')
  })
  test('renommage de casse : l’ancien libellé ne redevient pas un nouveau choix déclaré', () => {
    const b = banc(); b.corpus.reglesAnon.personne.pseudos = ['CLAIRE', 'Rebecca']
    b.avant.annotations[0].pseudo = 'CLAIRE'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).toThrow('variante choisie')
    b.candidat.annotations[0].pseudo = 'CLAIRE'
    expect(() => verifierReferencesDefinitions(b.candidat, b.corpus, b.avant)).not.toThrow()
  })
  test('la garde de session utilise la base publiée, pas le candidat comme sa propre preuve', () => {
    const b = banc(); b.candidat.annotations.push({ ...b.avant.annotations[0], id: 'nouvelle-decision' })
    expect(() => verifierContenusReferencesDefinitions(JSON.stringify(b.candidat), JSON.stringify(b.corpus), JSON.stringify(b.avant))).toThrow('variante choisie')
    expect(() => verifierContenusReferencesDefinitions(JSON.stringify(b.candidat), JSON.stringify(b.corpus), '{}')).toThrow('base publiée')
  })
})
