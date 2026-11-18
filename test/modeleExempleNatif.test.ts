import { afterEach, describe, expect, test } from 'vitest'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preparerModeleExempleNatif } from '../src/main/modeleExempleNatif'
import { preparerAjoutEntretienNatif } from '../src/main/preparationsNatives'
import { TransactionsFichiersCorpus } from '../src/main/transactionsFichiers'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { projeterRepertoireLocuteurs } from '../src/shared/corpus/repertoireLocuteurs'
import type { CorpusFichier as CorpusFormat9, EntretienFichier as EntretienFormat9 } from '../src/shared/format'

const ressources = join(process.cwd(), 'CorpusTest')
const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function temporaire() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-modele-natif-'))
  dossiers.push(dir)
  return dir
}
function lire<T>(chemin: string): T { return JSON.parse(readFileSync(chemin, 'utf8')) as T }
function fichiers(racine: string) {
  return readdirSync(racine, { recursive: true, withFileTypes: true }).filter((f) => f.isFile())
    .map((f) => join(f.parentPath, f.name)).sort().map((fichier) => [fichier, readFileSync(fichier)])
}

describe('modèle exemple et préparation native', () => {
  test('prépare le format cible en conservant les neuf ids locaux, valeurs, textes et notes', () => {
    const racine = join(ressources, 'CorpusSynthAnnot')
    const avant = fichiers(racine)
    const source = lire<CorpusFormat9>(join(racine, 'corpus.crp'))
    const modele = preparerModeleExempleNatif(ressources)
    validerCorpusNatif(modele.corpus)
    expect(modele.corpus.formatVersion).toBe(10)
    expect(modele.corpus.locuteurs).toEqual(source.personnes)
    expect(Object.keys(modele.corpus.locuteurs)).toHaveLength(9)
    expect(modele.corpus.codebook).toEqual(source.codebook)
    for (const [id, entretien] of Object.entries(modele.entretiens)) {
      const ancien = lire<EntretienFormat9>(join(racine, 'entretiens', `${id}.json`))
      validerEntretienNatif(entretien)
      expect(entretien.formatVersion).toBe(10)
      expect(entretien).not.toHaveProperty('locuteurs')
      expect(entretien.participations.map(({ locuteurRef: _ref, ...local }) => local))
        .toEqual(ancien.locuteurs.map(({ personneRef: _ref, ...local }) => local))
      expect(entretien.participations.map((p) => p.locuteurRef)).toEqual(ancien.locuteurs.map((p) => p.personneRef))
      expect(entretien.corpsTexte).toEqual(ancien.corpsTexte)
      expect(entretien.annotations).toEqual(ancien.annotations)
      expect(entretien.ancres).toEqual(ancien.ancres)
      expect(entretien.meta).toEqual(ancien.meta)
      expect(entretien.notes?.map(({ participationIds: _ids, ...note }) => note))
        .toEqual(ancien.notes?.map(({ locuteurIds: _ids, ...note }) => note))
    }
    expect(fichiers(racine)).toEqual(avant)
  })

  test('les préparations natives s’enregistrent avec le moteur existant, sans convertir les modèles en place', () => {
    const modele = preparerModeleExempleNatif(ressources)
    const dir = temporaire()
    let corpus: typeof modele.corpus = { ...structuredClone(modele.corpus), membership: {}, ordreEntretiens: [] }
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
    const transactions = new TransactionsFichiersCorpus(dir, { formatNatif: 10 })
    for (const id of modele.corpus.ordreEntretiens!) {
      const plan = preparerAjoutEntretienNatif(corpus, id, modele.corpus.membership[id].titre, modele.entretiens[id])
      transactions.executer(plan)
      corpus = plan.corpusApres
    }
    const enregistre = lire<typeof corpus>(join(dir, 'corpus.crp'))
    validerCorpusNatif(enregistre)
    expect(enregistre.locuteurs).toEqual(modele.corpus.locuteurs)
    expect(enregistre.ordreEntretiens).toEqual(modele.corpus.ordreEntretiens)
    const entretiens = Object.keys(enregistre.membership).map((id) => {
      const data = lire<typeof modele.entretiens[string]>(join(dir, 'entretiens', `${id}.json`))
      expect(data).toEqual(modele.entretiens[id])
      return { id, titre: enregistre.membership[id].titre, corpsTexte: data.corpsTexte, participations: data.participations }
    })
    const vue = projeterRepertoireLocuteurs(enregistre.locuteurs, entretiens)
    expect(vue.indisponibles).toEqual([])
    expect(vue.locuteurs).toHaveLength(9)
    expect(transactions.reprendre()).toBe(false)
  })

  test('préserve un regroupement intentionnel et un retrait explicite dans une copie autorisée du modèle', () => {
    const dir = temporaire()
    const racine = join(dir, 'CorpusSynthAnnot')
    cpSync(join(ressources, 'CorpusSynthAnnot'), racine, { recursive: true })
    const corpus = lire<CorpusFormat9>(join(racine, 'corpus.crp'))
    const id = corpus.ordreEntretiens![1]
    const chemin = join(racine, 'entretiens', `${id}.json`)
    const entretien = lire<EntretienFormat9>(chemin)
    entretien.locuteurs[0].personneRef = 'pers-demo-01'
    entretien.locuteurs[1].personneRef = null
    entretien.locuteurs[1].personneDeliee = true
    delete corpus.personnes['pers-demo-03']
    writeFileSync(join(racine, 'corpus.crp'), JSON.stringify(corpus))
    writeFileSync(chemin, JSON.stringify(entretien))
    const avant = fichiers(racine)
    const modele = preparerModeleExempleNatif(dir)
    expect(modele.entretiens[id].participations[0].locuteurRef).toBe('pers-demo-01')
    expect(modele.entretiens[id].participations[1]).toMatchObject({ locuteurRef: null, associationRetiree: true })
    expect(modele.corpus.locuteurs).toEqual(corpus.personnes)
    expect(Object.keys(modele.corpus.locuteurs)).toHaveLength(8)
    expect(fichiers(racine)).toEqual(avant)
  })

  test('refuse un modèle avec une intention de transaction encore présente', () => {
    const dir = temporaire()
    const racine = join(dir, 'CorpusSynthAnnot')
    cpSync(join(ressources, 'CorpusSynthAnnot'), racine, { recursive: true })
    writeFileSync(join(racine, '.transaction-fichiers.json'), '{"formatVersion":1}')
    const avant = fichiers(racine)
    expect(() => preparerModeleExempleNatif(dir)).toThrow('opération à terminer')
    expect(fichiers(racine)).toEqual(avant)
  })
})
