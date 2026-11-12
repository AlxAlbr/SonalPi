import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Sources V1 de test : deux transcriptions, un média interne partagé et un externe. */
export function ecrireSeedMigrationV1(base: string, nomFichier = 'MonCorpus.crp') {
  const dossierV1 = join(base, `V1-${nomFichier.replace(/\.crp$/i, '')}`)
  mkdirSync(dossierV1, { recursive: true })
  const audioInterne = join(dossierV1, 'audio.wav')
  const audioExterne = join(base, `externe-${nomFichier}.wav`)
  for (const chemin of [audioInterne, audioExterne]) {
    const n = 8000
    const wav = Buffer.alloc(44 + n * 2)
    wav.write('RIFF'); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVE', 8)
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(n, 24); wav.writeUInt32LE(n * 2, 28)
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
    wav.write('data', 36); wav.writeUInt32LE(n * 2, 40)
    for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 440 * i / n)), 44 + i * 2)
    writeFileSync(chemin, wav)
  }
  const fixture = (nom: string) => readFileSync(join(process.cwd(), 'test', 'fixtures', nom))
  writeFileSync(join(dossierV1, 'entretien1.sonal'), fixture('entretien1.sonal'))
  writeFileSync(join(dossierV1, 'entretien3.sonal'), fixture('entretien2.sonal'))
  const raw = JSON.parse(fixture('corpusV1.crp').toString('utf8'))
  raw.nom = 'Nom interne non retenu'
  raw.tabThm = raw.tabThm.filter((t: { code: string }) => t.code !== 'cat_004')
  raw.tabEnt = [
    { id: 1, nom: 'entretien1', rtrPath: 'entretien1.sonal', audioPath: audioInterne },
    { id: 2, nom: 'audio seul', rtrPath: '', audioPath: audioExterne },
    { id: 3, nom: 'entretien3', rtrPath: 'entretien3.sonal', audioPath: audioInterne },
  ]
  const cheminCrp = join(dossierV1, nomFichier)
  const original = Buffer.from(JSON.stringify(raw, null, 2))
  writeFileSync(cheminCrp, original)
  return { cheminCrp, dossierV1, audioInterne, audioExterne, original }
}
