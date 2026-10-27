// @vitest-environment happy-dom
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DocumentsMigrationGitLab } from '../../src/main/gitlab/documentsMigration'
import { convertirEntretienMigrationGitLab } from '../../src/renderer/formatSonal/migrationGitLab'
import { importerFichier } from '../../src/renderer/formatSonal/sas'
import { analyserCrp } from '../../src/shared/corpus/migrationCrp'
import type { BilanMigrationGitLab } from '../../src/shared/corpus/migrationGitLab'
import type { EntretienFichier } from '../../src/shared/format'

const dossiers: string[] = []
afterEach(() => dossiers.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function dossier() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-documents-migration-'))
  dossiers.push(dir)
  return dir
}
const parseur = (html: string) => new DOMParser().parseFromString(html.replace(/<link\b[^>]*>/gi, ''), 'text/html')
const sonal = readFileSync('test/fixtures/entretien1.sonal', 'utf8')
const analyse = analyserCrp(readFileSync('test/fixtures/corpusV1.crp', 'utf8'), 'terrain.crp')
if (!analyse.ok) throw new Error(analyse.message)
const projet = {
  compteId: 'compte', urlInstance: 'https://gitlab.example.org', utilisateur: 'moi',
  projetId: 1, nomProjet: 'Source', branche: 'main',
}
const bilan: BilanMigrationGitLab = {
  bilanId: 'bilan', preparationId: 'preparation', source: projet, commitSource: 'a'.repeat(40), cheminCrp: 'terrain.crp',
  cible: { ...projet, projetId: 2, branche: null }, commitCible: null, apercu: analyse.apercu,
  entretiens: [{ titre: 'Premier', cheminSonal: 'entretien1.sonal', media: 0 }],
  medias: [{ cheminSource: 'source/audio.mp3', cheminDestination: 'medias/identite/audio.mp3', taille: 42, sha256: 'b'.repeat(64), stockageSource: 'git' }],
  volumeOctets: 42, destinationMedia: 'depot',
}

describe('conversion et documents natifs de migration GitLab', () => {
  it('réutilise les résultats du convertisseur sans modifier le texte, les annotations et les déclarations', () => {
    const importCommun = importerFichier('entretien1.sonal', sonal, parseur)
    const conversion = convertirEntretienMigrationGitLab({ nom: 'entretien1.sonal', contenu: sonal }, parseur)
    expect(conversion.payload.corpsTexte).toEqual(importCommun.payload.corpsTexte)
    const annotations = (importe: typeof conversion) => importe.payload.annotations.map((annotation) =>
      annotation.type === 'anon'
        ? { ...annotation, regle: importe.reglesAnon.find((r) => r.id === annotation.regle)?.entite }
        : annotation,
    )
    expect(annotations(conversion)).toEqual(annotations(importCommun))
    expect(conversion.payload.locuteurs).toEqual(importCommun.payload.locuteurs)
    expect(conversion.payload.ancres).toEqual(importCommun.payload.ancres)
    expect(conversion.payload.notes).toEqual(importCommun.payload.notes)
    expect(conversion.payload.pseudosDeclares).toEqual(importCommun.payload.pseudosDeclares)
    expect(conversion.payload.definitionsAnonLocales).toEqual(importCommun.payload.definitionsAnonLocales)
    expect(conversion.payload.legacy).toEqual(importCommun.legacy)
    expect(conversion.codebook).toEqual(importCommun.codebook)
    expect(conversion.variables).toEqual(importCommun.variables)
    expect(conversion.payload.meta.audioRef).toBeNull()
  })

  it.each(['depot', 'externe'] as const)('assemble les documents avec des références %s et sans chemin absolu partagé', (destinationMedia) => {
    const preparation = new DocumentsMigrationGitLab(dossier(), { ...bilan, destinationMedia })
    const conversion = convertirEntretienMigrationGitLab({ nom: 'entretien1.sonal', contenu: sonal }, parseur)
    const avant = JSON.stringify(conversion)
    const id = preparation.ajouter(0, conversion)
    const fournisseur = destinationMedia === 'depot' ? 'gitlab' : 'webdav'
    const documents = [...preparation.documents([{ chemin: bilan.medias[0].cheminDestination, fournisseur }])]
    expect(documents.every((action) => action.action === 'create')).toBe(true)
    const entretien = JSON.parse(documents.find((d) => d.chemin === `entretiens/${id}.json`)!.contenu) as EntretienFichier
    expect(entretien.meta.audioRef).toBeNull()
    expect(entretien.meta.audioDistant).toEqual({ chemin: bilan.medias[0].cheminDestination, fournisseur })
    expect(entretien.meta.sourceV1?.rtrPath).toBe(analyse.apercu.raw.tabEnt![0].rtrPath)
    expect(entretien.corpsTexte).toEqual(conversion.payload.corpsTexte)
    expect(entretien.locuteurs.map(({ id: _id, ...locuteur }) => locuteur)).toEqual(conversion.payload.locuteurs)
    expect(new Set(entretien.locuteurs.map((locuteur) => locuteur.id)).size).toBe(entretien.locuteurs.length)
    const annotations = (valeurs: typeof entretien.annotations) => valeurs.map((annotation) =>
      annotation.type === 'anon' ? { ...annotation, regle: undefined } : annotation,
    )
    expect(annotations(entretien.annotations)).toEqual(annotations(conversion.payload.annotations))
    expect(entretien.legacy).toEqual(conversion.payload.legacy)
    const corpus = JSON.parse(documents.find((d) => d.chemin === 'corpus.json')!.contenu)
    expect(corpus.ordreEntretiens).toEqual([id])
    for (const definition of conversion.codebook ?? []) expect(corpus.codebook[definition.id]).toBeDefined()
    for (const definition of conversion.variables ?? []) expect(corpus.variables[definition.id]).toBeDefined()
    for (const annotation of entretien.annotations) {
      if (annotation.type === 'anon' && annotation.regle) expect(corpus.reglesAnon[annotation.regle]).toBeDefined()
    }
    expect(corpus.meta.sourceV1).toEqual({
      cheminCrp: 'terrain.crp', dateCreation: bilan.apercu.dateCreation,
      gitlab: { urlInstance: projet.urlInstance, projetId: 1, commit: bilan.commitSource },
    })
    expect(documents.some((d) => d.chemin === 'medias/.gitattributes')).toBe(destinationMedia === 'depot')
    expect(documents.some((d) => d.chemin === '.gitattributes')).toBe(false)
    expect(documents.some((d) => d.chemin === bilan.medias[0].cheminDestination)).toBe(destinationMedia === 'depot')
    expect(JSON.stringify(conversion)).toBe(avant)
  })

  it('conserve la décision pseudo de l’entretien même si la règle corpus donne une autre valeur', () => {
    const raw = { tabEnt: [{ id: 1, nom: 'Entretien', rtrPath: 'texte.sonal' }], tabAnon: [{ entite: 'Karine', remplacement: 'Autre' }] }
    const a = analyserCrp(JSON.stringify(raw), 'terrain.crp')
    if (!a.ok) throw new Error(a.message)
    const preparation = new DocumentsMigrationGitLab(dossier(), { ...bilan, apercu: a.apercu, medias: [], entretiens: [{ titre: 'Entretien', cheminSonal: 'texte.sonal', media: null }] })
    const conversion = convertirEntretienMigrationGitLab(null, parseur)
    conversion.payload.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Karine' }] }] }
    conversion.payload.annotations = [{ id: 'a', type: 'anon', from: 1, to: 7, etat: 'anonymise', pseudo: 'Claire', auteur: 'test' }]
    preparation.ajouter(0, conversion)
    const documents = [...preparation.documents([])]
    const entretien = JSON.parse(documents.find((d) => d.chemin.startsWith('entretiens/'))!.contenu)
    expect(entretien.annotations[0].pseudo).toBe('Claire')
    const corpus = JSON.parse(documents.at(-1)!.contenu)
    expect(corpus.reglesAnon['reg-crp-1'].pseudos).toEqual(['Autre'])
  })

  it('rattache les décisions aux règles conservées après fusion partielle et import répété, sans changer les pseudos', () => {
    const a = analyserCrp(JSON.stringify({ tabAnon: [{ entite: 'Karine', remplacement: 'Autre' }],
      tabEnt: [{ id: 1, nom: 'Premier' }, { id: 2, nom: 'Second' }],
    }), 'terrain.crp')
    if (!a.ok) throw new Error(a.message)
    const preparation = new DocumentsMigrationGitLab(dossier(), { ...bilan, apercu: a.apercu, medias: [],
      entretiens: [{ titre: 'Premier', cheminSonal: null, media: null }, { titre: 'Second', cheminSonal: null, media: null }],
    })
    const conversions = [0, 1].map((index) => {
      const conversion = convertirEntretienMigrationGitLab(null, parseur)
      conversion.reglesAnon = [{ id: `temporaire-${index}`, entite: ['Karine', 'Alias libre'], pseudos: ['Claire'] }]
      conversion.payload.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Karine Alias libre' }] }] }
      conversion.payload.annotations = [
        { id: 'a', type: 'anon', from: 1, to: 7, etat: 'anonymise', pseudo: 'Claire', auteur: 'test', regle: `temporaire-${index}` },
        { id: 'b', type: 'anon', from: 8, to: 19, etat: 'exception', pseudo: 'Claire', auteur: 'test', regle: `temporaire-${index}` },
      ]
      return conversion
    })
    const avant = JSON.stringify(conversions)
    conversions.forEach((conversion, index) => preparation.ajouter(index, conversion))
    const documents = [...preparation.documents([])]
    const corpus = JSON.parse(documents.at(-1)!.contenu)
    expect(Object.keys(corpus.reglesAnon)).toHaveLength(2)
    for (const d of documents.filter((d) => d.chemin.startsWith('entretiens/'))) {
      const entretien = JSON.parse(d.contenu) as EntretienFichier
      expect(entretien.annotations.map((a) => a.regle)).toEqual(['reg-crp-1', 'temporaire-0'])
      expect(entretien.annotations.map((a) => a.pseudo)).toEqual(['Claire', 'Claire'])
      expect(entretien.annotations[1].etat).toBe('exception')
    }
    expect(JSON.stringify(conversions)).toBe(avant)
  })

  it('ne rattache pas un fragment d’annotation à une autre entité ayant le même texte court', () => {
    const a = analyserCrp(JSON.stringify({ tabAnon: [
      { entite: 'Karine', remplacement: 'Claire' }, { entite: 'Kar', remplacement: 'Autre' },
    ], tabEnt: [{ id: 1, nom: 'Premier' }] }), 'terrain.crp')
    if (!a.ok) throw new Error(a.message)
    const preparation = new DocumentsMigrationGitLab(dossier(), { ...bilan, apercu: a.apercu, medias: [],
      entretiens: [{ titre: 'Premier', cheminSonal: null, media: null }],
    })
    const conversion = convertirEntretienMigrationGitLab(null, parseur)
    conversion.reglesAnon = [{ id: 'temporaire', entite: ['Karine'], pseudos: ['Claire'] }]
    conversion.payload.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Karine' }] }] }
    conversion.payload.annotations = [{ id: 'a', type: 'anon', from: 1, to: 4, etat: 'anonymise', pseudo: 'Claire', auteur: 'test', regle: 'temporaire' }]
    preparation.ajouter(0, conversion)
    const entretien = JSON.parse([...preparation.documents([])].find((d) => d.chemin.startsWith('entretiens/'))!.contenu)
    expect(entretien.annotations[0].regle).toBe('reg-crp-1')
    expect(entretien.annotations[0].pseudo).toBe('Claire')
  })

  it('refuse une publication avec conversion ou copies incomplètes', () => {
    const preparation = new DocumentsMigrationGitLab(dossier(), bilan)
    expect(() => [...preparation.documents([])]).toThrow('conversion')
    preparation.ajouter(0, convertirEntretienMigrationGitLab(null, parseur))
    expect(() => [...preparation.documents([])]).toThrow('copie des médias')
    expect(() => [...preparation.documents([{ chemin: 'autre.mp3', fournisseur: 'gitlab' }])]).toThrow('bilan préparé')
    expect(() => [...preparation.documents([{ chemin: bilan.medias[0].cheminDestination, fournisseur: 'webdav' }])]).toThrow('bilan préparé')
  })

  it('refuse l’ajout hors ordre et ne reconstruit pas sur un corpus déjà présent', () => {
    const dir = dossier()
    const preparation = new DocumentsMigrationGitLab(dir, bilan)
    expect(() => preparation.ajouter(1, convertirEntretienMigrationGitLab(null, parseur))).toThrow('ordre')
    expect(() => new DocumentsMigrationGitLab(dir, bilan)).toThrow('déjà')
  })
})
