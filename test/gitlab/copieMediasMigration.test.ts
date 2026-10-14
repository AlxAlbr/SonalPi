import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaMigrationGitLab } from '../../src/shared/corpus/migrationGitLab'
import { CopieurMediasMigrationGitLab } from '../../src/main/gitlab/copieMediasMigration'
import { ErreurHttp } from '../../src/main/webdav/client'

const contenu = Buffer.from([0, 255, 42, 128, 13, 10])
const media: MediaMigrationGitLab = {
  cheminSource: 'source/voix.mp3', cheminDestination: 'migrations/identite/medias/voix.mp3',
  taille: contenu.length, sha256: createHash('sha256').update(contenu).digest('hex'), stockageSource: 'git',
}
const dossiers: string[] = []
afterEach(() => dossiers.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function preparation() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-copie-migration-'))
  dossiers.push(dir)
  return dir
}
function source() {
  return { telechargerFichier: vi.fn(async (_chemin: string, destination: string) => { writeFileSync(destination, contenu) }) }
}
function externe(options: { preexistant?: Buffer; perdreReponse?: boolean; collision?: Buffer } = {}) {
  let copie = options.preexistant
  const client = {
    mkcol: vi.fn(async (_chemin: string) => undefined),
    propfind: vi.fn(async () => copie ? [{ chemin: 'voix.mp3', dossier: false, etag: 'version', taille: copie.length }] : []),
    putFichier: vi.fn(async (_chemin: string, fichier: string, preconditions: unknown) => {
      expect(preconditions).toMatchObject({ ifNoneMatch: '*' })
      if (options.collision) {
        copie = options.collision
        throw new ErreurHttp(412, 'créé entre-temps')
      }
      copie = readFileSync(fichier)
      if (options.perdreReponse) throw new Error('réponse perdue')
      return 'nouvelle-version'
    }),
    getBinaireFichier: vi.fn(async (_chemin: string, destination: string) => {
      if (!copie) throw new ErreurHttp(404, 'absent')
      writeFileSync(destination, copie)
    }),
  }
  return { client, copie: () => copie }
}

describe('copies médias de migration, destinations simulées', () => {
  it('copie réellement les octets vers la base externe puis rend une référence sans accès', async () => {
    const origine = source()
    const espace = externe()
    const copieur = new CopieurMediasMigrationGitLab(origine, { type: 'externe', client: espace.client }, preparation())
    const reference = await copieur.copier(media)
    expect(reference).toEqual({ chemin: media.cheminDestination, fournisseur: 'webdav' })
    expect(espace.copie()?.equals(contenu)).toBe(true)
    expect(espace.client.mkcol.mock.calls.map(([chemin]) => chemin)).toEqual([
      'migrations', 'migrations/identite', 'migrations/identite/medias',
    ])
    expect(espace.client.getBinaireFichier).toHaveBeenCalledTimes(1)
    await copieur.copier(media)
    expect(origine.telechargerFichier).toHaveBeenCalledTimes(1)
    expect(espace.client.putFichier).toHaveBeenCalledTimes(1)
    expect(espace.client.getBinaireFichier).toHaveBeenCalledTimes(2)
  })

  it('ne remplace pas un média externe existant différent', async () => {
    const espace = externe({ preexistant: Buffer.from('contenu utilisateur') })
    const copieur = new CopieurMediasMigrationGitLab(source(), { type: 'externe', client: espace.client }, preparation())
    await expect(copieur.copier(media)).rejects.toThrow('Aucun fichier existant')
    expect(espace.client.putFichier).not.toHaveBeenCalled()
    expect(espace.copie()?.toString()).toBe('contenu utilisateur')
  })

  it.each([true, false])('contrôle une création concurrente sans jamais l’écraser (identique=%s)', async (identique) => {
    const espace = externe({ collision: identique ? contenu : Buffer.from('autre fichier') })
    const copieur = new CopieurMediasMigrationGitLab(source(), { type: 'externe', client: espace.client }, preparation())
    if (identique) await expect(copieur.copier(media)).resolves.toMatchObject({ fournisseur: 'webdav' })
    else await expect(copieur.copier(media)).rejects.toThrow('ne correspond pas')
    expect(espace.client.putFichier).toHaveBeenCalledTimes(1)
  })

  it('reconnaît une copie acquise après une réponse perdue avant d’envisager un nouvel envoi', async () => {
    const espace = externe({ perdreReponse: true })
    const copieur = new CopieurMediasMigrationGitLab(source(), { type: 'externe', client: espace.client }, preparation())
    await expect(copieur.copier(media)).rejects.toThrow('réponse perdue')
    await expect(copieur.copier(media)).resolves.toMatchObject({ fournisseur: 'webdav' })
    expect(espace.client.putFichier).toHaveBeenCalledTimes(1)
  })

  it('ne rend la référence GitLab qu’après confirmation de l’objet LFS', async () => {
    const televerserObjet = vi.fn(async (fichier: string) => { expect(readFileSync(fichier).equals(contenu)).toBe(true) })
    const copieur = new CopieurMediasMigrationGitLab(source(), { type: 'depot', client: { televerserObjet } }, preparation())
    expect(await copieur.copier(media)).toEqual({ chemin: media.cheminDestination, fournisseur: 'gitlab' })
    expect(televerserObjet).toHaveBeenCalledTimes(1)
  })

  it('ne publie pas de référence si le transfert LFS échoue', async () => {
    const copieur = new CopieurMediasMigrationGitLab(source(), {
      type: 'depot', client: { televerserObjet: vi.fn(async () => { throw new Error('upload incomplet') }) },
    }, preparation())
    await expect(copieur.copier(media)).rejects.toThrow('upload incomplet')
  })

  it('s’arrête à la frontière sûre après un téléchargement annulé, sans prochain envoi', async () => {
    const annulation = new AbortController()
    const espace = externe()
    const origine = { telechargerFichier: vi.fn(async (_chemin: string, destination: string) => {
      writeFileSync(destination, contenu)
      annulation.abort()
    }) }
    const copieur = new CopieurMediasMigrationGitLab(origine, { type: 'externe', client: espace.client }, preparation())
    await expect(copieur.copier(media, undefined, annulation.signal)).rejects.toThrow()
    expect(espace.client.putFichier).not.toHaveBeenCalled()
    expect(espace.client.mkcol).not.toHaveBeenCalled()
  })

  it('refuse les identités et chemins non préparés avant toute lecture', async () => {
    const origine = source()
    const espace = externe()
    const copieur = new CopieurMediasMigrationGitLab(origine, { type: 'externe', client: espace.client }, preparation())
    await expect(copieur.copier({ ...media, sha256: '../../autre' })).rejects.toThrow('Identité')
    await expect(copieur.copier({ ...media, cheminDestination: '../voix.mp3' })).rejects.toThrow('Chemin')
    expect(origine.telechargerFichier).not.toHaveBeenCalled()
    expect(espace.client.putFichier).not.toHaveBeenCalled()
  })
})
