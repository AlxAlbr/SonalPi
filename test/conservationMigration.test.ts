import { describe, expect, it, vi } from 'vitest'
import { preparerConservationMigration } from '../src/main/conservationMigration'
import { estDestinationAutreMigration, raisonExclusionMigration } from '../src/shared/corpus/conservationMigration'

function source() {
  return {
    cheminCrp: 'terrain/corpus.crp',
    fichiers: ['terrain/corpus.crp', 'terrain/texte.Sonal', 'terrain/corpus.lexaf.json', 'terrain/documents/rapport.pdf',
      'terrain/.env.production', 'terrain/.gitattributes', 'terrain/second.crp', 'terrain/second.Sonal', 'hors/rapport.pdf',
      'terrain/autre-projet/autre.crp', 'terrain/autre-projet/tableau.csv'],
    utilises: new Set(['terrain/corpus.crp', 'terrain/texte.Sonal']),
    lireCorpus: vi.fn(async () => ({ tabEnt: [] })), references: () => ['terrain/second.Sonal'],
    information: vi.fn(async () => ({ taille: 42, sha256: 'a'.repeat(64), stockageSource: 'git' as const })),
  }
}

describe('inventaire des documents supplémentaires', () => {
  it('conserve les inconnus et les résultats, sans sortir du dossier ni reprendre les autres corpus', async () => {
    const s = source(), bilan = await preparerConservationMigration(s)
    expect(bilan.autres.map((f) => [f.cheminSource, f.cheminDestination])).toEqual([
      ['terrain/corpus.lexaf.json', 'Autres/corpus.lexaf.json'], ['terrain/documents/rapport.pdf', 'Autres/documents/rapport.pdf'],
    ])
    expect(bilan.autresCorpus).toBe(2)
    expect(s.information).toHaveBeenCalledTimes(2)
    expect(bilan.nonRepris).toEqual(expect.arrayContaining([
      expect.objectContaining({ chemin: '.env.production', raison: expect.stringContaining('secrets') }),
      expect.objectContaining({ chemin: 'second.Sonal', raison: expect.stringContaining('autre corpus') }),
    ]))
  })

  it('avertit si les références d’un corpus voisin sont illisibles', async () => {
    const s = source()
    const bilan = await preparerConservationMigration({ ...s, lireCorpus: async () => null })
    expect(bilan.avertissements.join(' ')).toContain('second.crp')
  })

  it('refuse les noms qui entreraient en collision sur un autre poste', async () => {
    const s = source()
    s.fichiers = ['terrain/document.txt', 'terrain/DOCUMENT.txt']
    await expect(preparerConservationMigration(s)).rejects.toThrow('nom trop proche')
  })

  it.each(['../secret.txt', '/secret.txt', 'a/../b.txt', 'a\\b.txt', 'NUL.txt', 'a/CON', 'a/invalide?.txt', 'a/fin.'])('refuse le chemin %s', (chemin) => {
    expect(raisonExclusionMigration(chemin)).not.toBeNull()
    expect(estDestinationAutreMigration(`Autres/${chemin}`)).toBe(false)
  })

  it.each(['.env', 'credentials.enc', 'comptes.json', 'cle.pem', 'archive/secrets.key', '.ssh/id_ed25519'])('ne conserve pas automatiquement les accès %s', (chemin) => {
    expect(raisonExclusionMigration(chemin)).toContain('secrets')
  })
})
