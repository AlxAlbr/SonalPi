import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Schema } from '@tiptap/pm/model'
import { projeterRepertoireLocuteurs, type SourceRepertoireLocuteurs } from '../src/shared/corpus/repertoireLocuteurs'
import { blocsParoleDepuisDocument, statistiquesLocuteurs } from '../src/shared/entretien/statistiquesLocuteurs'
import { resumeThematique } from '../src/shared/corpus/requetes'
import type { Locuteur } from '../src/shared/locuteurs'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'

function source(id: string, nom: string, locuteurRef: string | null = null): SourceRepertoireLocuteurs {
  return {
    id, titre: `Entretien ${id}`,
    participations: [{ id: 'meme-id-local', index: 0, nom, locuteurRef }],
    corpsTexte: {
      type: 'doc', content: [
        { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Bonjour ici' }] },
        { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Encore moi' }] },
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans attribution' }] },
        { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Fin' }] },
      ],
    },
  }
}

describe('Répertoire calculé des locuteurs et participations', () => {
  test('réunit les identités connues et garde les noms locaux recherchables sans transmettre les textes', () => {
    const locuteurs: Record<string, Locuteur> = {
      p: { id: 'p', nom: 'Jean Martin' },
      vide: { id: 'vide', nom: 'Définition sans participation' },
    }
    const entretiens = [source('a', 'Jean', 'p'), source('b', 'J. Martin', 'p'), source('c', 'Jean Martin')]
    const avant = JSON.stringify([locuteurs, entretiens])
    const vue = projeterRepertoireLocuteurs(locuteurs, entretiens)
    expect(vue.locuteurs).toHaveLength(1)
    expect(vue.aVerifier).toEqual([{ entretienId: 'c', entretienTitre: 'Entretien c', participationId: 'meme-id-local', nom: 'Jean Martin' }])
    expect(vue.entretiens[0].mots).toBe(7)
    const groupe = vue.locuteurs.find((l) => l.locuteurId === 'p')!
    expect(groupe).toMatchObject({ nom: 'Jean Martin', mots: 10, interventions: 4 })
    expect(groupe.participations).toEqual([
      { entretienId: 'a', entretienTitre: 'Entretien a', participationId: 'meme-id-local', nom: 'Jean' },
      { entretienId: 'b', entretienTitre: 'Entretien b', participationId: 'meme-id-local', nom: 'J. Martin' },
    ])
    expect(vue.entretiens[0].tours.map((t) => t.cle)).toEqual([groupe.cle, null, groupe.cle])
    expect(JSON.stringify(vue)).not.toContain('Bonjour ici')
    expect(JSON.stringify(vue)).not.toContain('corpsTexte')
    expect(JSON.stringify([locuteurs, entretiens])).toBe(avant)
  })

  test('ne fusionne ni les homonymes, ni les rôles, ni les références absentes', () => {
    const entretiens = [source('a', 'Enquêteur'), source('b', 'Enquêteur'), source('c', 'X', 'absente'), source('d', '')]
    const vue = projeterRepertoireLocuteurs({}, entretiens)
    expect(vue.locuteurs).toEqual([])
    expect(vue.aVerifier.map((p) => p.nom)).toEqual(['Enquêteur', 'Enquêteur', 'X', ''])
    expect(vue.entretiens.every((e) => e.tours.every((t) => t.cle === null))).toBe(true)
    expect(vue.entretiens.every((e) => e.mots === 7)).toBe(true)
  })

  test('deux homonymes valides restent distincts et un retrait volontaire reste à vérifier', () => {
    const a = source('a', 'Jean', 'p'), b = source('b', 'Jean', 'q'), c = source('c', 'Jean', 'p')
    c.participations = c.participations.map((p) => ({ ...p, associationRetiree: true }))
    const vue = projeterRepertoireLocuteurs({ p: { id: 'p', nom: 'Jean' }, q: { id: 'q', nom: 'Jean' } }, [a, b, c])
    expect(vue.locuteurs).toHaveLength(2)
    expect(vue.locuteurs.map((l) => l.participations.length)).toEqual([1, 1])
    expect(vue.aVerifier).toEqual([expect.objectContaining({ entretienId: 'c' })])
  })

  test('ne confond pas un id corpus, un id local identique et les index des paragraphes', () => {
    const locuteurs = { 'meme-id-local': { id: 'meme-id-local', nom: 'Identité corpus' } }
    const vue = projeterRepertoireLocuteurs(locuteurs, [
      source('a', 'Variante locale', 'meme-id-local'), source('b', 'Participation isolée'),
    ])
    expect(vue.locuteurs).toHaveLength(1)
    expect(vue.locuteurs[0].cle).toBe(JSON.stringify(['locuteur', 'meme-id-local']))
    expect(vue.aVerifier[0]).toMatchObject({ entretienId: 'b', participationId: 'meme-id-local' })
    expect(vue.locuteurs[0].mots).toBe(5)
  })

  test('conserve les participants sans parole et neutralise les index inconnus', () => {
    const entree = source('a', 'Silencieux', 'p')
    entree.participations = entree.participations.map((p) => ({ ...p, index: 7 }))
    const vue = projeterRepertoireLocuteurs({ p: { id: 'p', nom: 'Silencieux' } }, [entree])
    expect(vue.locuteurs[0]).toMatchObject({ mots: 0, interventions: 0 })
    expect(vue.entretiens[0].tours).toHaveLength(1)
    expect(vue.entretiens[0].tours[0]).toMatchObject({ cle: null, nom: 'Sans locuteur', debut: 0, fin: 100 })
  })

  test('positionne un passage comme le résumé thématique de l’onglet Entretiens', () => {
    const entree = source('a', 'Jean')
    const blocs = blocsParoleDepuisDocument(entree.corpsTexte)
    const dernier = blocs.at(-1)!
    const theme = resumeThematique({
      corpsTexte: entree.corpsTexte,
      annotations: [{ id: 'codage', type: 'codage', code: 'theme', from: dernier.pos, to: dernier.pos + dernier.longueur }],
    })[0]
    const tour = projeterRepertoireLocuteurs({}, [entree]).entretiens[0].tours.at(-1)!
    expect(tour).toMatchObject({ debut: theme.deb, fin: theme.fin, pos: theme.pos })
  })

  test('une source illisible ne pollue pas les participations ni les statistiques des sources lisibles', () => {
    const locuteurs = { p: { id: 'p', nom: 'Jean Martin' } }
    const lisible = source('a', 'Jean', 'p')
    const illisible = source('b', 'Jean', 'p')
    illisible.corpsTexte = { type: 'doc', content: 'texte invalide' }
    const vue = projeterRepertoireLocuteurs(locuteurs, [lisible, illisible])
    expect(vue.locuteurs).toHaveLength(1)
    expect(vue.locuteurs[0]).toMatchObject({ mots: 5, interventions: 2 })
    expect(vue.locuteurs[0].participations.map((p) => p.entretienId)).toEqual(['a'])
    expect(vue.entretiens.map((e) => e.id)).toEqual(['a'])
    expect(vue.indisponibles).toEqual([expect.objectContaining({ id: 'b' })])
  })

  test('un entretien sans texte ne produit aucune intervention fictive', () => {
    const entree = source('a', 'Jean', 'p')
    entree.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 } }] }
    const vue = projeterRepertoireLocuteurs({ p: { id: 'p', nom: 'Jean' } }, [entree])
    expect(vue.entretiens[0].tours).toEqual([])
    expect(vue.locuteurs[0]).toMatchObject({ mots: 0, interventions: 0 })
  })
})

test('l’extraction des paragraphes est identique à celle de l’éditeur, avec marques et sauts de ligne', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block*' },
      paragraph: { group: 'block', content: 'inline*', attrs: { loc: { default: null } } },
      heading: { group: 'block', content: 'inline*' },
      text: { group: 'inline' },
      hardBreak: { group: 'inline', inline: true },
    },
    marks: { bold: {} },
  })
  const doc = schema.nodeFromJSON({ type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Titre' }] },
    { type: 'paragraph', attrs: { loc: 0 }, content: [
      { type: 'text', text: 'Bon', marks: [{ type: 'bold' }] }, { type: 'text', text: 'jour' },
      { type: 'hardBreak' }, { type: 'text', text: 'à vous' },
    ] },
    { type: 'paragraph', attrs: { loc: 7 } },
    { type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Fin' }] },
  ] })
  const attendus: ReturnType<typeof blocsParoleDepuisDocument> = []
  doc.forEach((noeud, offset) => {
    if (noeud.type.name === 'paragraph') attendus.push({
      pos: offset + 1, longueur: noeud.content.size,
      texte: noeud.textBetween(0, noeud.content.size, ' ', ' '), loc: noeud.attrs.loc ?? null,
    })
  })
  const extraits = blocsParoleDepuisDocument(doc.toJSON())
  expect(extraits).toEqual(attendus)
  expect(statistiquesLocuteurs(extraits, [{ index: 0 }, { index: 7 }], []).totalMots).toBe(4)
})

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

test('le store consulte sans réécriture, y compris en lecture seule, et signale une source indisponible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-vue-locuteurs-'))
  dossiers.push(dir)
  ecrireSeedDemo(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  const autres = store.creerEntretienVide('Indisponible')
  const fichiers = [join(dir, 'corpus.crp'), join(dir, 'entretiens', 'e1.json')]
  const avant = fichiers.map((f) => readFileSync(f, 'utf8'))
  unlinkSync(join(dir, 'entretiens', `${autres.id}.json`))
  store.lectureSeule = true
  const vue = store.locuteursInventaire()
  expect(vue.locuteurs).toEqual([])
  expect(vue.aVerifier.map((p) => p.nom)).toEqual(['Enquêteur', 'Karine'])
  expect(vue.entretiens.map((e) => e.id)).toEqual(['e1'])
  expect(vue.indisponibles).toEqual([expect.objectContaining({ id: autres.id, titre: 'Indisponible' })])
  expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
})
