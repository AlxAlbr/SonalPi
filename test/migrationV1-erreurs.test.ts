import { expect, test, vi } from 'vitest'
import { Writable } from 'node:stream'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MigrationV1 } from '../src/main/migrationV1'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, createWriteStream: vi.fn(fs.createWriteStream) }
})

test('un disque plein interrompt la copie, nettoie la cible et laisse la source utilisable', async () => {
  const base = mkdtempSync(join(tmpdir(), 'sonal-v1-disque-plein-'))
  try {
    const source = join(base, 'V1')
    mkdirSync(source)
    const media = join(source, 'audio.wav')
    writeFileSync(media, 'audio-original')
    const cheminCrp = join(source, 'Projet.crp')
    const original = JSON.stringify({ tabEnt: [{ id: 1, nom: 'A', audioPath: media }] })
    writeFileSync(cheminCrp, original)
    const demande = { cheminCrp, nom: 'Projet', dossier: join(base, 'V2') }
    const panne = new Writable({ write(_chunk, _encodage, suite) {
      suite(Object.assign(new Error('Disque plein'), { code: 'ENOSPC' }))
    } })
    vi.mocked(createWriteStream).mockReturnValueOnce(panne as ReturnType<typeof createWriteStream>)
    await expect(new MigrationV1(demande).preparer()).rejects.toThrow('Espace disque insuffisant')
    expect(existsSync(demande.dossier)).toBe(false)
    expect(readdirSync(base).filter((f) => f.startsWith('.sonal-migration-'))).toEqual([])
    expect(readFileSync(cheminCrp, 'utf8')).toBe(original)
    expect(readFileSync(media, 'utf8')).toBe('audio-original')
    expect(existsSync(`${cheminCrp}.sauvegarde-v1`)).toBe(false)
    const nouvelle = new MigrationV1(demande)
    await nouvelle.preparer()
    await nouvelle.annuler()
  } finally { rmSync(base, { recursive: true, force: true }) }
})
