// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ref, toRaw } from 'vue'
import { occurrencesDe } from '../src/shared/entretien/anon/anonymisation'
import { validerMemoireLocale, memoriserDefinitionLocale, type DefinitionAnonLocale } from '../src/shared/entretien/anon/definitionsLocales'
import { useAnonymisationEntretien } from '../src/renderer/composables/entretien/useAnonymisationEntretien'
import { exporterSonal, sonalPseudonymise } from '../src/renderer/formatSonal/exportSonal'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
import type { Entretien } from '../src/shared/entretien/entretien'
import type { EntreeExport } from '../src/shared/export/types'

const editeurs: Editor[] = []
afterEach(() => { for (const ed of editeurs.splice(0)) ed.destroy() })
function banc(texte = 'Karine.') {
  const ed = new Editor({ extensions: [StarterKit], content: `<p>${texte}</p>` }); editeurs.push(ed)
  const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
  let anon!: ReturnType<typeof useAnonymisationEntretien>
  anon = useAnonymisationEntretien({ entretien, locuteurs: ref([]), ouvertId: ref('e1'), ongletDroite: ref('anon'), lireEditeur: () => ed,
    reglesAnon: () => [], prioriteAnon: () => 'entretien', rafraichirDecorations: vi.fn(), planifierSauvegarde: vi.fn(),
    rafraichirProjections: () => anon.rafraichirLignesAnon(), thematiques: () => ({ actif: true, liste: ['LOC', 'PER'] }),
  })
  return { ed, entretien, anon }
}
const json = (v: unknown) => JSON.parse(JSON.stringify(v))

describe('mémoire minimale des définitions locales', () => {
  test('une validation conserve la variante inutilisée et la catégorie après réouverture', async () => {
    const b = banc()
    b.anon.validerAnon('Karine', 'Claire / Rebecca')
    await b.anon.categoriserLigne('Karine', 'PER')
    const definitions = json(b.anon.definitionsAnonLocales.value)
    expect(definitions).toEqual([{ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' }])
    const annotations = json(b.entretien.annotations)
    b.anon.reinitialiser(); b.anon.charger([], {}, definitions); b.anon.rafraichirLignesAnon()
    expect(b.entretien.annotations).toEqual(annotations)
    expect(b.anon.categorieDeLigne('Karine')).toBe('PER')
    expect(b.anon.lignesAnon.value[0].variantes).toEqual([{ pseudo: 'Claire', nbAnonymise: 1, nbException: 0 }, { pseudo: 'Rebecca', nbAnonymise: 0, nbException: 0 }])
  })
  test('les alias dont un seul est présent restent groupés et une déclaration sans occurrence est visible', () => {
    const b = banc('Lyon.')
    b.anon.validerAnon('Lyon / Lyons', 'Ville')
    expect(b.anon.definitionsAnonLocales.value[0].entite).toEqual(['Lyon', 'Lyons'])
    b.anon.charger([], {}, [...json(b.anon.definitionsAnonLocales.value), { entite: ['Absente'], pseudos: ['A', 'B'], categorie: 'PER', etat: 'declaration' }])
    b.anon.rafraichirLignesAnon()
    expect(b.anon.lignesAnon.value.find((l) => l.entite === 'Lyon/Lyons')).toMatchObject({ nb: 1, etat: 'entretien' })
    expect(b.anon.lignesAnon.value.find((l) => l.entite === 'Absente')).toMatchObject({ nb: 0, pseudo: 'A / B', variantes: [{ pseudo: 'A', nbAnonymise: 0, nbException: 0 }, { pseudo: 'B', nbAnonymise: 0, nbException: 0 }] })
  })
  test('une catégorie locale ne change ni les annotations ni la règle partagée', async () => {
    const b = banc(); b.anon.creerBrouillon('Sans occurrence / Autre forme', 'Essai')
    b.anon.rafraichirLignesAnon(); await b.anon.categoriserLigne('Sans occurrence / Autre forme', 'LOC')
    expect(b.anon.definitionsAnonLocales.value[0]).toEqual({ entite: ['Sans occurrence', 'Autre forme'], pseudos: ['Essai'], categorie: 'LOC', etat: 'brouillon' })
    expect(b.entretien.annotations).toEqual([])
    await b.anon.categoriserLigne('Sans occurrence / Autre forme', '')
    expect(b.anon.definitionsAnonLocales.value[0].categorie).toBeUndefined()
  })
  test('une confirmation de couverture refuse une mémoire locale changée', () => {
    const b = banc('Rue de la Gare.')
    b.entretien.annotations.push({ id: 'exception', type: 'anon', from: 11, to: 15, auteur: 'test', etat: 'exception' })
    b.anon.validerAnon('Rue de la Gare', 'Quartier')
    expect(b.anon.confirmationCouverture.value).not.toBeNull()
    b.anon.definitionsAnonLocales.value.push({ entite: ['Absente'], pseudos: ['X'], etat: 'declaration' })
    b.anon.accepterCouverture()
    expect(b.entretien.annotations).toHaveLength(1)
    expect(b.anon.hintAnon.value).toContain('changé')
  })
  test('Unicode : une déclaration normalisée reconnaît les graphies décomposées sans déplacer les plages', () => {
    const b = banc('E\u0301cole et E\u0301té.')
    expect(occurrencesDe('E\u0301té. Été.', 'Été')).toEqual([{ from: 0, to: 4 }, { from: 6, to: 9 }])
    expect(occurrencesDe('E\u0301cole.', 'E')).toEqual([])
    b.anon.validerAnon('École', 'Lieu')
    expect(b.entretien.annotations[0]).toMatchObject({ from: 1, to: 7 })
    expect(b.anon.lignesAnon.value).toHaveLength(1)
    expect(b.anon.lignesAnon.value[0]).toMatchObject({ entite: 'École', nb: 1 })
    b.anon.creerBrouillon('E\u0301cole', 'Autre')
    expect(b.anon.brouillonsAnon.value).toEqual([])
    b.anon.charger([], { 'E\u0301cole': ['Lieu', 'Autre'] })
    expect(b.anon.pseudosDeclares.value['école']).toEqual(['Lieu', 'Autre'])
  })
  test('les chevauchements partiels et les définitions invalides ne modifient pas la mémoire', () => {
    const definitions: DefinitionAnonLocale[] = [{ entite: ['A', 'B'], pseudos: ['X'], etat: 'declaration' }]
    const avant = structuredClone(definitions)
    expect(() => memoriserDefinitionLocale(definitions, { entite: ['B', 'C'], pseudos: ['Y'], etat: 'declaration' })).toThrow('Chevauchement partiel')
    expect(() => memoriserDefinitionLocale(definitions, { entite: ['A', 'B'], pseudos: ['X', 'Y'], etat: 'declaration' })).toThrow()
    expect(definitions).toEqual(avant)
    expect(() => validerMemoireLocale([definitions[0], definitions[0]])).toThrow('répétées')
  })
  test('le format .sonal rééditable conserve tous les alias, catégories et variantes locales non utilisées', () => {
    const b = banc('Lyon. Karine.')
    const definitions: DefinitionAnonLocale[] = [
      { entite: ['Lyon', 'Lyons'], pseudos: ['Ville'], categorie: 'LOC', etat: 'declaration' },
      { entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' },
      { entite: ['Brouillon A', 'Brouillon B'], pseudos: ['Essai'], categorie: 'LOC', etat: 'brouillon' },
      { entite: ['Brouillon incomplet'], pseudos: [], categorie: 'PER', etat: 'brouillon' },
    ]
    const entree: EntreeExport = { corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Lyon. Karine. Paris.' }] }] }, annotations: [{ id: 'choix', type: 'anon', from: 7, to: 13, auteur: 'test', pseudo: 'Rebecca', etat: 'anonymise' }, { id: 'partage', type: 'anon', from: 15, to: 20, auteur: 'test', pseudo: 'Capitale', regle: 'r', etat: 'anonymise' }], ancres: [], locuteurs: [], codebook: [], variables: [], meta: { valeursGen: {} }, legacy: { tabAnon: null, notes: '' },
      reglesAnon: [{ id: 'r', entite: ['Paris', 'Pariss'], pseudos: ['Capitale'], categorie: 'LOC' }], definitionsAnonLocales: definitions,
    }
    const html = exporterSonal(entree).replace(/<link\b[^>]*>/gi, '').replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
    const importe = importerSonal(new DOMParser().parseFromString(html, 'text/html'))
    expect(importe.payload.definitionsAnonLocales).toEqual(definitions)
    expect(importe.reglesAnon[0]).toMatchObject({ entite: ['Paris', 'Pariss'], pseudos: ['Capitale'], categorie: 'LOC' })
    expect(importe.payload.annotations.filter((a) => a.type === 'anon')).toHaveLength(2)
    expect(importe.payload.annotations.find((a) => a.type === 'anon')?.pseudo).toBe('Rebecca')
    const pseudonymise = sonalPseudonymise(entree)
    for (const identite of ['Lyons', 'Pariss', 'Brouillon A', 'Brouillon B', 'Claire']) expect(pseudonymise).not.toContain(identite)
    expect(toRaw(b.entretien.annotations)).toEqual([])
  })
})
