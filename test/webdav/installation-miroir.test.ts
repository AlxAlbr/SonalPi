import { describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  InstallationLocaleMiroir,
  type IdentiteMiroirDistant,
  type ManifesteMiroir,
} from '../../src/main/distant/installationMiroir'

const IDENTITE: IdentiteMiroirDistant = {
  fournisseur: 'webdav',
  destinationId: 'destination-test',
}

function manifeste(version: string): ManifesteMiroir {
  return {
    formatVersion: 2,
    destination: IDENTITE,
    empreintes: {
      'corpus.json': { type: 'webdav-etag', valeur: `corpus-${version}` },
      'entretiens/e1.json': { type: 'webdav-etag', valeur: `e1-${version}` },
    },
  }
}

describe('installation locale du miroir', () => {
  test('reprend toutes les actions après une interruption entre deux remplacements', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-installation-miroir-'))
    writeFileSync(join(dir, 'corpus.json'), 'corpus-v1')
    writeFileSync(join(dir, 'ancien.json'), 'a-archiver')
    writeFileSync(join(dir, '.manifeste.json'), JSON.stringify(manifeste('v1')))

    const interrompue = new InstallationLocaleMiroir(dir, IDENTITE, {
      apresAction: (index) => {
        if (index === 0) throw new Error('arrêt simulé')
      },
    })
    const preparation = interrompue.nouvellePreparation()
    const corpusPrepare = interrompue.cheminFichierPrepare(preparation, 0)
    const entretienPrepare = interrompue.cheminFichierPrepare(preparation, 1)
    writeFileSync(corpusPrepare, 'corpus-v2')
    writeFileSync(entretienPrepare, 'entretien-v2')

    expect(() => interrompue.appliquer(preparation, {
      installations: [
        { chemin: 'corpus.json', fichierPrepare: corpusPrepare },
        { chemin: 'entretiens/e1.json', fichierPrepare: entretienPrepare },
      ],
      archives: [{ chemin: 'ancien.json', destination: 'corbeille-miroir/ancien.json' }],
      manifeste: manifeste('v2'),
    })).toThrow('arrêt simulé')

    expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe('corpus-v2')
    expect(existsSync(join(dir, 'entretiens/e1.json'))).toBe(false)
    expect(JSON.parse(readFileSync(join(dir, '.manifeste.json'), 'utf8')))
      .toEqual(manifeste('v1'))
    expect(existsSync(join(dir, '.installation-miroir.json'))).toBe(true)

    new InstallationLocaleMiroir(dir, IDENTITE).reprendre()

    expect(readFileSync(join(dir, 'corpus.json'), 'utf8')).toBe('corpus-v2')
    expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe('entretien-v2')
    expect(readFileSync(join(dir, 'corbeille-miroir/ancien.json'), 'utf8')).toBe('a-archiver')
    expect(JSON.parse(readFileSync(join(dir, '.manifeste.json'), 'utf8')))
      .toEqual(manifeste('v2'))
    expect(existsSync(join(dir, '.installation-miroir.json'))).toBe(false)
    expect(existsSync(join(dir, '.installation-miroir'))).toBe(false)
  })

  test('refuse de reprendre le journal d’une autre destination', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-installation-miroir-identite-'))
    const installation = new InstallationLocaleMiroir(dir, IDENTITE, {
      apresAction: () => { throw new Error('arrêt simulé') },
    })
    const preparation = installation.nouvellePreparation()
    const fichierPrepare = installation.cheminFichierPrepare(preparation, 0)
    writeFileSync(fichierPrepare, 'contenu')
    expect(() => installation.appliquer(preparation, {
      installations: [{ chemin: 'corpus.json', fichierPrepare }],
      archives: [],
      manifeste: manifeste('v2'),
    })).toThrow('arrêt simulé')

    const autre = new InstallationLocaleMiroir(dir, {
      fournisseur: 'webdav',
      destinationId: 'autre-destination',
    })
    expect(() => autre.reprendre()).toThrow('autre destination')
    expect(existsSync(join(dir, 'corpus.json'))).toBe(true)
  })
})
