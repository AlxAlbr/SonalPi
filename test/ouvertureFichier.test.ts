import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { encode } from 'iconv-lite'
import { classifierCorpus } from '../src/shared/ouvertureFichier'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { lireFichierCorpus, compteDuMiroir } from '../src/main/ouvertureFichier'
import { CorpusStore } from '../src/main/corpusStore'
import { creerTransitionsLocales } from '../src/main/transitionContexte'
import { OuvertureInitiale, demandeDepuisFichiers, fichiersDesArguments } from '../src/main/demandesOuverture'

const dossiers: string[] = []
function dossier() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-ouverture-'))
  dossiers.push(dir)
  return dir
}
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('classification pure des CRP', () => {
  test.each([1, 2, 3, 8, 9])('reconnaît V2 formatVersion %i sans perdre les champs optionnels', (formatVersion) => {
    const c = { ...squeletteCorpus(), formatVersion, nom: 'Été', meta: { libre: true } }
    expect(classifierCorpus(JSON.stringify(c))).toEqual({ type: 'v2', corpus: c })
  })
  test('accepte un ancien corpus sans registre de personnes, normalisé ensuite par le store', () => {
    const { personnes: _personnes, ...ancien } = squeletteCorpus()
    const corpus = { ...ancien, formatVersion: 3 }
    expect(classifierCorpus(JSON.stringify(corpus))).toEqual({ type: 'v2', corpus })
  })
  test('préserve les options absentes, nulles ou partielles normalisées par le store', () => {
    const c = { ...squeletteCorpus(), categoriesNote: null, demo: null, paramsAnon: { motsLiaison: { actif: false } } }
    expect(classifierCorpus(JSON.stringify(c))).toEqual({ type: 'v2', corpus: c })
  })
  test.each([{ tabEnt: [] }, { version: '1.0', tabEnt: [] }])('reconnaît V1 avec ou sans version', (c) => {
    expect(classifierCorpus(JSON.stringify(c), 'Ancien.crp').type).toBe('v1')
  })
  test('refuse les identifiants qui désignent des chemins ou périphériques Windows', () => {
    for (const id of ['C:secret', 'CON', 'aux', 'COM1', 'nul.txt']) {
      const c = { ...squeletteCorpus(), membership: { [id]: { titre: 'X', date: null, lastModified: '' } } }
      expect(() => classifierCorpus(JSON.stringify(c))).toThrow(/Référence/)
    }
  })
  test.each([
    '{cassé', 'null', '[]', '{}', '{"formatVersion":99,"tabEnt":[]}',
    JSON.stringify({ ...squeletteCorpus(), tabEnt: [] }),
    JSON.stringify({ ...squeletteCorpus(), formatVersion: 99 }),
    JSON.stringify({ formatVersion: 3, corpsTexte: {}, annotations: [] }),
    JSON.stringify({ ...squeletteCorpus(), membership: [] }),
    JSON.stringify({ ...squeletteCorpus(), membership: { '../secret': { titre: 'X', date: null, lastModified: '' } } }),
    JSON.stringify({ ...squeletteCorpus(), variables: { x: { modalites: null } } }),
  ])('refuse une structure invalide ou ambiguë : %s', (contenu) => {
    expect(() => classifierCorpus(contenu)).toThrow()
  })
})

describe('lecture stricte sans écriture', () => {
  test('un V2 mal nommé ne substitue pas le corpus du dossier', () => {
    const dir = dossier()
    writeFileSync(join(dir, 'Autre.crp'), JSON.stringify(squeletteCorpus('Autre')))
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(squeletteCorpus('Bon')))
    expect(() => lireFichierCorpus(join(dir, 'Autre.crp'))).toThrow(/attendu.*corpus.crp/)
    expect(new CorpusStore(dir).ouvrir().nom).toBe('Bon')
  })
  test('fichier absent, dossier et cible disparue ne sont jamais amorcés', () => {
    const dir = dossier()
    expect(() => lireFichierCorpus(join(dir, 'corpus.crp'))).toThrow()
    expect(() => lireFichierCorpus(dir)).toThrow(/pas un fichier/)
    const strict = new CorpusStore(dir, true)
    expect(() => strict.preparerOuverture()).toThrow(/CORPUS_SUPPRIME/)
    expect(existsSync(join(dir, 'entretiens'))).toBe(false)
    new CorpusStore(dir).ouvrir()
    const preparation = strict.preparerOuverture()
    rmSync(join(dir, 'corpus.crp'))
    expect(() => strict.finaliserOuverture(preparation)).toThrow(/changé/)
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
  })
  test('un corpus strict devenu courant conserve la sentinelle de suppression', () => {
    const dir = dossier()
    new CorpusStore(dir).ouvrir()
    const strict = new CorpusStore(dir, true)
    strict.ouvrir()
    rmSync(join(dir, 'corpus.crp'))
    expect(() => strict.ouvrir()).toThrow(/CORPUS_SUPPRIME/)
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
  })
  test('signale les entretiens manquants sans les créer', () => {
    const dir = dossier()
    const c = squeletteCorpus()
    c.membership.e1 = { titre: 'Isolé', date: null, lastModified: '' }
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(c))
    expect(lireFichierCorpus(join(dir, 'corpus.crp')).manquants).toEqual(['e1'])
    expect(existsSync(join(dir, 'entretiens'))).toBe(false)
  })
  test('décode les accents V1 Windows-1252 et conserve la source intacte', () => {
    const chemin = join(dossier(), 'Ancien.crp')
    const contenu = encode(JSON.stringify({ tabEnt: [], nom: 'Étude été' }), 'windows-1252')
    writeFileSync(chemin, contenu)
    const lu = lireFichierCorpus(chemin).classification
    expect(lu.type === 'v1' && lu.apercu.nom).toBe('Étude été')
    expect(readFileSync(chemin)).toEqual(contenu)
  })
  test('une fermeture refusée n’applique jamais la préparation stricte', async () => {
    const dir = dossier()
    new CorpusStore(dir).ouvrir()
    let applique = false
    const transitions = creerTransitionsLocales({
      creerStore: (dir) => new CorpusStore(dir, true),
      fermerContexteActuel: async () => { throw new Error('session non fermée') },
      finaliser: () => { applique = true; throw new Error('ne doit pas arriver') },
    })
    const avant = readFileSync(join(dir, 'corpus.crp'))
    await expect(transitions.ouvrirDossier(dir)).rejects.toThrow(/session non fermée/)
    expect(applique).toBe(false)
    expect(readFileSync(join(dir, 'corpus.crp'))).toEqual(avant)
  })
  test.skipIf(process.platform === 'win32')('détecte les miroirs via liens, sans confondre un voisin', () => {
    const dir = dossier()
    const miroirs = join(dir, 'miroirs')
    mkdirSync(join(miroirs, 'compte'), { recursive: true })
    symlinkSync(join(miroirs, 'compte'), join(dir, 'alias'))
    expect(compteDuMiroir(join(dir, 'alias', 'corpus.crp'), miroirs)).toBe('compte')
    expect(compteDuMiroir(join(dir, 'miroirs-voisin', 'corpus.crp'), miroirs)).toBeNull()
    expect(compteDuMiroir(miroirs, miroirs)).toBe('')
  })
})

describe('arguments et demande initiale', () => {
  test('distingue développement, options, URI, espaces et chemins relatifs', () => {
    const cwd = dossier()
    const absolu = join(cwd, 'nom accenté.crp')
    expect(fichiersDesArguments(['electron', '.', '--user-data-dir', 'profil.crp', '--inspect=1', 'été espace.crp', pathToFileURL(absolu).href], cwd, true))
      .toEqual([resolve(cwd, 'été espace.crp'), absolu])
    expect(fichiersDesArguments(['SonalPi2', '--no-sandbox', 'a.crp', 'b.crp'], cwd, false))
      .toEqual([resolve(cwd, 'a.crp'), resolve(cwd, 'b.crp')])
  })
  test('conserve la première demande, signale les autres sans les différer', () => {
    const initiale = new OuvertureInitiale()
    initiale.retenir(demandeDepuisFichiers(['/a.crp', '/b.crp']))
    initiale.retenir(demandeDepuisFichiers(['/c.crp']))
    initiale.retenir(demandeDepuisFichiers(['/a.crp']))
    expect(initiale.prendre()).toEqual({
      demande: { chemin: '/a.crp', multiple: true }, demandeRefusee: true,
    })
    expect(initiale.prendre()).toEqual({ demande: null, demandeRefusee: false })
  })
  test('aucun fichier ne crée de demande, et une demande consommée n’est pas rejouée', () => {
    const initiale = new OuvertureInitiale()
    initiale.retenir(demandeDepuisFichiers([]))
    expect(initiale.prendre()).toEqual({ demande: null, demandeRefusee: false })
    initiale.retenir(demandeDepuisFichiers(['/nouveau.crp']))
    expect(initiale.prendre()).toEqual({ demande: { chemin: '/nouveau.crp', multiple: false }, demandeRefusee: false })
    expect(initiale.prendre().demande).toBeNull()
  })
})
