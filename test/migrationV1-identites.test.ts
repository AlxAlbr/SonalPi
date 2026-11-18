// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MigrationV1 } from '../src/main/migrationV1'
import { CorpusStore } from '../src/main/corpusStore'
import { importerFichier } from '../src/renderer/formatSonal/sas'
import type { PayloadEntretien } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const parseur = (html: string) => new DOMParser().parseFromString(html
  .replace(/<link\b[^>]*>/gi, '')
  .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ''), 'text/html')

test('la migration locale des fichiers V1 conserve les données et crée une identité distincte par participation', async () => {
  const base = mkdtempSync(join(tmpdir(), 'sonal-migration-identites-'))
  dossiers.push(base)
  const source = join(base, 'V1')
  mkdirSync(source)
  const noms = ['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal']
  for (const nom of noms) copyFileSync(join('test/fixtures', nom), join(source, nom))
  const cheminCrp = join(source, 'Terrain.crp')
  writeFileSync(cheminCrp, JSON.stringify({ tabEnt: noms.map((nom, index) => ({ id: index + 1, nom, rtrPath: nom, audioPath: '' })) }))
  const sources = [cheminCrp, ...noms.map((nom) => join(source, nom))]
  const contenusAvant = sources.map((fichier) => readFileSync(fichier))
  const dossier = join(base, 'V2')
  const job = new MigrationV1({ cheminCrp, dossier, nom: 'Terrain' })
  try {
    expect(await job.preparer()).toEqual({ nbEntretiens: 3 })
    const imports: PayloadEntretien[] = []
    for (const index of noms.keys()) {
      const lecture = job.lireEntretien(index)!
      const conversion = importerFichier(lecture.nom, lecture.contenu, parseur)
      imports.push(structuredClone(conversion.payload))
      job.ajouterEntretien(index, conversion.payload, conversion.reglesAnon)
      expect(conversion.payload).toEqual(imports[index])
    }
    expect(sources.map((fichier) => readFileSync(fichier))).toEqual(contenusAvant)
    job.verifierAvantBascule()
    job.verrouillerBascule()
    job.promouvoir()
    const store = new CorpusStore(dossier, true)
    const corpus = store.ouvrir()
    const nombre = imports.reduce((total, payload) => total + payload.locuteurs.length, 0)
    expect(nombre).toBeGreaterThan(0)
    expect(Object.keys(corpus.personnes)).toHaveLength(nombre)
    const identites = new Set<string>()
    for (const [index, id] of corpus.ordreEntretiens!.entries()) {
      const lecture = store.lireEntretien(id)
      if (!lecture.ok) throw new Error('Entretien migré illisible')
      const entretien = lecture.data
      const payload = imports[index]
      expect(entretien.corpsTexte).toEqual(payload.corpsTexte)
      expect(entretien.annotations).toEqual(payload.annotations)
      expect(entretien.ancres).toEqual(payload.ancres)
      expect(entretien.notes).toEqual(payload.notes)
      expect(entretien.legacy).toEqual(payload.legacy)
      expect(entretien.meta.valeursGen).toEqual(payload.meta.valeursGen)
      expect(entretien.meta.sourceV1).toEqual({ rtrPath: noms[index] })
      const sansAssociation = ({ id: _id, personneRef: _ref, ...local }: PayloadEntretien['locuteurs'][number]) => local
      expect(entretien.locuteurs.map(sansAssociation)).toEqual(payload.locuteurs.map(sansAssociation))
      for (const participation of entretien.locuteurs) {
        expect(participation.id).toBeTruthy()
        expect(participation.personneRef).toBeTruthy()
        expect(identites.has(participation.personneRef!)).toBe(false)
        identites.add(participation.personneRef!)
        expect(corpus.personnes[participation.personneRef!]).toEqual({ id: participation.personneRef, nom: participation.nom })
      }
    }
    job.marquerOuverte()
    expect(job.terminer()).toBeNull()
    expect(existsSync(cheminCrp)).toBe(false)
    expect(readFileSync(`${cheminCrp}.sauvegarde-v1`)).toEqual(contenusAvant[0])
    expect(sources.slice(1).map((fichier) => readFileSync(fichier))).toEqual(contenusAvant.slice(1))
    expect(new CorpusStore(dossier, true).personnesInventaire()).toEqual(store.personnesInventaire())
  } finally {
    await job.nettoyer()
  }
})
