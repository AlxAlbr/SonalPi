import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Schema } from '@tiptap/pm/model'
import { projeterLocuteursCorpus } from '../src/shared/corpus/locuteursCorpus'
import { blocsParoleDepuisDocument, statistiquesLocuteurs } from '../src/shared/entretien/statistiquesLocuteurs'
import { resumeThematique, type EntreeMatrice } from '../src/shared/corpus/requetes'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedDemo } from './seedDemo'

function source(id: string, nom: string, personneRef: string | null = null): EntreeMatrice {
  return {
    id, titre: `Entretien ${id}`,
    data: {
      formatVersion: 3, lastModified: '', ancres: [], annotations: [],
      meta: { valeursGen: {}, audioRef: null },
      locuteurs: [{ id: 'meme-id-local', index: 0, nom, valeursLoc: {}, personneRef }],
      corpsTexte: {
        type: 'doc', content: [
          { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Bonjour ici' }] },
          { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Encore moi' }] },
          { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans attribution' }] },
          { type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Fin' }] },
        ],
      },
    },
  }
}

describe('Liste unifiée et interventions du corpus', () => {
  test('réunit les identités connues et garde les noms locaux recherchables sans transmettre les textes', () => {
    const corpus = squeletteCorpus()
    corpus.personnes.p = { id: 'p', nom: 'Jean Martin' }
    corpus.personnes.vide = { id: 'vide', nom: 'Définition sans participation' }
    const entretiens = [source('a', 'Jean', 'p'), source('b', 'J. Martin', 'p'), source('c', 'Jean Martin')]
    const avant = JSON.stringify([corpus, entretiens])
    const vue = projeterLocuteursCorpus(corpus, entretiens)
    expect(vue.locuteurs).toHaveLength(2)
    const groupe = vue.locuteurs.find((l) => l.personneId === 'p')!
    expect(groupe).toMatchObject({ nom: 'Jean Martin', mots: 10, interventions: 4 })
    expect(groupe.participations.map((p) => p.nom)).toEqual(['Jean', 'J. Martin'])
    expect(vue.entretiens[0].tours.map((t) => t.cle)).toEqual([groupe.cle, null, groupe.cle])
    expect(JSON.stringify(vue)).not.toContain('Bonjour ici')
    expect(JSON.stringify(vue)).not.toContain('corpsTexte')
    expect(JSON.stringify([corpus, entretiens])).toBe(avant)
  })

  test('ne fusionne ni les homonymes, ni les rôles, ni les références absentes', () => {
    const corpus = squeletteCorpus()
    const entretiens = [source('a', 'Enquêteur'), source('b', 'Enquêteur'), source('c', 'X', 'absente'), source('d', '')]
    const vue = projeterLocuteursCorpus(corpus, entretiens)
    expect(vue.locuteurs).toHaveLength(4)
    expect(new Set(vue.locuteurs.map((l) => l.cle)).size).toBe(4)
    expect(vue.locuteurs.map((l) => l.nom)).toEqual(['Enquêteur', 'Enquêteur', 'Locuteur sans nom', 'X'])
    expect(vue.locuteurs.every((l) => l.personneId === null)).toBe(true)
  })

  test('conserve les participants sans parole et neutralise les index inconnus', () => {
    const entree = source('a', 'Silencieux')
    entree.data.locuteurs[0].index = 7
    const vue = projeterLocuteursCorpus(squeletteCorpus(), [entree])
    expect(vue.locuteurs[0]).toMatchObject({ mots: 0, interventions: 0 })
    expect(vue.entretiens[0].tours).toHaveLength(1)
    expect(vue.entretiens[0].tours[0]).toMatchObject({ cle: null, nom: 'Sans locuteur', debut: 0, fin: 100 })
  })

  test('positionne un passage comme le résumé thématique de l’onglet Entretiens', () => {
    const entree = source('a', 'Jean')
    const blocs = blocsParoleDepuisDocument(entree.data.corpsTexte)
    const dernier = blocs.at(-1)!
    entree.data.annotations = [{ id: 'codage', type: 'codage', code: 'theme', from: dernier.pos, to: dernier.pos + dernier.longueur }]
    const theme = resumeThematique(entree.data)[0]
    const tour = projeterLocuteursCorpus(squeletteCorpus(), [entree]).entretiens[0].tours.at(-1)!
    expect(tour).toMatchObject({ debut: theme.deb, fin: theme.fin, pos: theme.pos })
  })

  test('une source illisible ne pollue pas les participations ni les statistiques des sources lisibles', () => {
    const corpus = squeletteCorpus()
    corpus.personnes.p = { id: 'p', nom: 'Jean Martin' }
    const lisible = source('a', 'Jean', 'p')
    const illisible = source('b', 'Jean', 'p')
    illisible.data.corpsTexte = { type: 'doc', content: 'texte invalide' }
    const vue = projeterLocuteursCorpus(corpus, [lisible, illisible])
    expect(vue.locuteurs).toHaveLength(1)
    expect(vue.locuteurs[0]).toMatchObject({ mots: 5, interventions: 2 })
    expect(vue.locuteurs[0].participations.map((p) => p.entretienId)).toEqual(['a'])
    expect(vue.entretiens.map((e) => e.id)).toEqual(['a'])
    expect(vue.indisponibles).toEqual([expect.objectContaining({ id: 'b' })])
  })

  test('un entretien sans texte ne produit aucune intervention fictive', () => {
    const entree = source('a', 'Jean')
    entree.data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 } }] }
    const vue = projeterLocuteursCorpus(squeletteCorpus(), [entree])
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
  expect(statistiquesLocuteurs(extraits, [
    { id: 'a', index: 0, nom: 'A', valeursLoc: {}, personneRef: null },
    { id: 'b', index: 7, nom: 'B', valeursLoc: {}, personneRef: null },
  ], []).totalMots).toBe(4)
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
  expect(vue.locuteurs.map((l) => l.nom)).toEqual(['Enquêteur', 'Karine'])
  expect(vue.entretiens.map((e) => e.id)).toEqual(['e1'])
  expect(vue.indisponibles).toEqual([expect.objectContaining({ id: autres.id, titre: 'Indisponible' })])
  expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
})
