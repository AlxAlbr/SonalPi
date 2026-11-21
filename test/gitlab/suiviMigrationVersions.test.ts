import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SuiviDurableMigrationGitLab } from '../../src/main/gitlab/suiviMigration'
import { FORMAT_VERSION } from '../../src/shared/format'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function suivi() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-suivi-version-'))
  dossiers.push(dir)
  return new SuiviDurableMigrationGitLab(dir)
}

describe('versions des contenus préparés pour GitLab', () => {
  test.each(['corpus.crp', 'entretiens/e1.json'])('contrôle la version de %s avant sa conservation', (chemin) => {
    const s = suivi()
    expect(() => s.conserverContenu(chemin, JSON.stringify({ formatVersion: FORMAT_VERSION + 1 })))
      .toThrow('Version native non supportée')
    expect(existsSync(join(s.dossier, 'contenus'))).toBe(false)
  })

  test.each(['Autres/document.json', 'medias/.gitattributes'])('ne traite pas %s comme un fichier natif', (chemin) => {
    const s = suivi()
    const contenu = 'Un document conservé tel quel, pas un fichier natif.'
    const document = s.conserverContenu(chemin, contenu)
    expect(s.lireContenu(document)).toBe(contenu)
  })
})
