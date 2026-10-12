import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION } from '../../shared/format'
import { idImportWebDAVSain } from './journalCorrespondancesWebDAV'

export interface EnvoiGardePseudosWebDAV {
  version: 1; destination: string; chemin: string; contenu: string
}
/** L’intention d’un PUT ordinaire incertain empêche de libérer prématurément sa garde corpus. */
export class JournalGardePseudosWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) { this.chemin = join(dir, '.publication-pseudos-webdav.json') }
  lire(): EnvoiGardePseudosWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > 64 * 1024 * 1024) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as EnvoiGardePseudosWebDAV
      this.valider(j)
      return j
    } catch { throw new Error('Le journal de publication WebDAV est invalide ou illisible. Aucun rejeu autorisé.') }
  }
  ecrire(j: EnvoiGardePseudosWebDAV) {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > 64 * 1024 * 1024) throw new Error('Le journal de publication WebDAV dépasse 64 Mio.')
    const tmp = `${this.chemin}.${randomUUID()}.tmp`
    try {
      const fd = openSync(tmp, 'wx', 0o600)
      try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(tmp, this.chemin); this.synchroniser()
    } finally { if (existsSync(tmp)) unlinkSync(tmp) }
  }
  effacer() { if (existsSync(this.chemin)) { unlinkSync(this.chemin); this.synchroniser() } }
  private synchroniser() {
    const fd = openSync(dirname(this.chemin), 'r')
    try { fsyncSync(fd) } finally { closeSync(fd) }
  }
  private valider(j: EnvoiGardePseudosWebDAV) {
    const id = /^entretiens\/([^/]+)\.json$/.exec(j?.chemin)?.[1]
    if (!j || j.version !== 1 || j.destination !== this.destination || !id || !idImportWebDAVSain(id) || typeof j.contenu !== 'string') throw new Error()
    const data = JSON.parse(j.contenu)
    if (data?.formatVersion !== FORMAT_VERSION || !data.corpsTexte || !data.meta || !Array.isArray(data.annotations) || !Array.isArray(data.locuteurs)) throw new Error()
  }
}
