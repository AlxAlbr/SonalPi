import { chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { FORMAT_VERSION } from '../../shared/format'
import { validerMemoireLocale } from '../../shared/entretien/anon/definitionsLocales'
import type { BilanImportCorrespondance } from '../../shared/corpus/importCorrespondances'

export interface FichierImportWebDAV {
  chemin: string
  avant: string
  apres: string
  etagAvant: string
  etat: 'a-faire' | 'envoi' | 'confirme' | 'garde'
}
export interface JournalImportWebDAV {
  version: 1
  destination: string
  operationId: string
  fichiers: FichierImportWebDAV[]
  bilan: BilanImportCorrespondance
  termine: boolean
}
export const MAX_OCTETS_JOURNAL_CORRESPONDANCES = 64 * 1024 * 1024
export const idImportWebDAVSain = (id: string): boolean => !!id && id !== '.' && id !== '..' && !/[/\\\0]/.test(id)
export const etagImportWebDAVFort = (etag: unknown): etag is string => typeof etag === 'string' && !!etag && !/^W\//i.test(etag) && !/["\r\n]/.test(etag)
const compte = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0

/** Journal privé des copies préparées et de chaque envoi, jamais un journal utilisateur. */
export class JournalCorrespondancesWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) {
    this.chemin = join(dir, '.correspondances-webdav.json')
  }
  lire(): JournalImportWebDAV | null {
    if (!existsSync(this.chemin)) return null
    if (statSync(this.chemin).size > MAX_OCTETS_JOURNAL_CORRESPONDANCES) throw new Error('Le journal des correspondances dépasse sa borne de taille.')
    let j: JournalImportWebDAV
    try { j = JSON.parse(readFileSync(this.chemin, 'utf8')) } catch { throw new Error('Le journal des correspondances WebDAV est illisible.') }
    this.valider(j)
    return j
  }
  ecrire(j: JournalImportWebDAV): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS_JOURNAL_CORRESPONDANCES) throw new Error('Le journal des correspondances dépasse sa borne de taille.')
    const temporaire = `${this.chemin}.tmp`
    try {
      writeFileSync(temporaire, contenu, { encoding: 'utf8', mode: 0o600, flush: true })
      chmodSync(temporaire, 0o600)
      renameSync(temporaire, this.chemin)
      const fd = openSync(dirname(this.chemin), 'r')
      try { fsyncSync(fd) } finally { closeSync(fd) }
    } catch (e) {
      if (existsSync(temporaire)) unlinkSync(temporaire)
      throw e
    }
  }
  private valider(j: JournalImportWebDAV): void {
    const bilan = j?.bilan
    const fichiers = j?.fichiers
    if (!j || j.version !== 1 || j.destination !== this.destination || typeof j.operationId !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(j.operationId)
      || typeof j.termine !== 'boolean' || !bilan || ![bilan.ajouts, bilan.variantes, bilan.remplacements, bilan.ignores].every(compte)
      || !bilan.entretiens || ![bilan.entretiens.definitionsLocales, bilan.entretiens.locuteurs, bilan.entretiens.entretiens].every(compte)
      || !Array.isArray(fichiers) || !fichiers.length || fichiers.length > 101 || fichiers[0]?.chemin !== 'corpus.json'
      || new Set(fichiers.map((f) => f?.chemin)).size !== fichiers.length) throw new Error('Le journal des correspondances est invalide ou appartient à une autre destination.')
    let envois = 0
    for (const [index, f] of fichiers.entries()) {
      const id = /^entretiens\/([^/]+)\.json$/.exec(f?.chemin)?.[1]
      if (!f || (index > 0 && (!id || !idImportWebDAVSain(id))) || !etagImportWebDAVFort(f.etagAvant)
        || typeof f.avant !== 'string' || typeof f.apres !== 'string' || !['a-faire', 'envoi', 'confirme', 'garde'].includes(f.etat)
        || (f.etat === 'garde' ? f.avant !== f.apres : f.avant === f.apres)) throw new Error('Une intention du journal des correspondances est invalide.')
      try {
        for (const contenu of [f.avant, f.apres]) {
          const data = JSON.parse(contenu)
          if (!data || data.formatVersion !== FORMAT_VERSION) throw new Error()
          if (index === 0) {
            if (!data.membership || typeof data.membership !== 'object' || Array.isArray(data.membership)) throw new Error()
          } else {
            if (!data.corpsTexte || !Array.isArray(data.annotations) || !Array.isArray(data.locuteurs) || !data.meta) throw new Error()
            if (data.definitionsAnonLocales !== undefined) validerMemoireLocale(data.definitionsAnonLocales)
          }
        }
      } catch { throw new Error('Une copie du journal des correspondances est illisible.') }
      if (f.etat === 'envoi') envois++
    }
    if (envois > 1 || (j.termine && fichiers.some((f) => f.etat !== 'garde' && f.etat !== 'confirme'))) throw new Error('La progression du journal des correspondances est invalide.')
  }
}
