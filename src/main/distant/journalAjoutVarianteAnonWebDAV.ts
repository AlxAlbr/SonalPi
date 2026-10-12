import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier } from '../../shared/format'
import { ajouterVarianteAnon, type DemandeAjoutVarianteAnon } from '../../shared/corpus/variantesAnon'
import { etagImportWebDAVFort } from './journalCorrespondancesWebDAV'

export interface EnvoiAjoutVarianteWebDAV {
  version: 1; destination: string; operationId: string; demande: DemandeAjoutVarianteAnon
  avant: string; apres: string; etagAvant: string; etat: 'envoi' | 'confirme'
}
const MAX_CORPUS = 8 * 1024 * 1024
const MAX_JOURNAL = 24 * 1024 * 1024

export function corpusAjoutVarianteWebDAV(contenu: string): CorpusFichier {
  if (Buffer.byteLength(contenu) > MAX_CORPUS) throw new Error('Le corpus dépasse 8 Mio. Aucun ajout autorisé.')
  const corpus = JSON.parse(contenu) as CorpusFichier
  if (corpus?.formatVersion !== FORMAT_VERSION || !corpus.membership || typeof corpus.membership !== 'object'
    || Array.isArray(corpus.membership) || !corpus.reglesAnon || typeof corpus.reglesAnon !== 'object'
    || Array.isArray(corpus.reglesAnon)) throw new Error('Le corpus publié n’est pas pris en charge dans ce format.')
  return corpus
}
export function candidatAjoutVarianteWebDAV(avant: string, demande: DemandeAjoutVarianteAnon) {
  const corpus = corpusAjoutVarianteWebDAV(avant)
  const resultat = ajouterVarianteAnon(corpus, demande)
  let apres = resultat.ajoute ? JSON.stringify(corpus, null, 2) : avant
  // Certains serveurs réutilisent un ETag lorsque la taille reste identique.
  if (apres !== avant && Buffer.byteLength(apres) === Buffer.byteLength(avant)) apres += '\n'
  corpusAjoutVarianteWebDAV(apres)
  return { resultat, apres }
}

/** Conserve une intention corpus uniquement, sans autoriser un nouvel envoi. */
export class JournalAjoutVarianteAnonWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) { this.chemin = join(dir, '.ajout-variante-anon-webdav.json') }
  lire(): EnvoiAjoutVarianteWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > MAX_JOURNAL) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as EnvoiAjoutVarianteWebDAV
      this.valider(j); return j
    } catch { throw new Error('Le journal d’ajout de variante WebDAV est invalide ou illisible. Aucun rejeu autorisé.') }
  }
  ecrire(j: EnvoiAjoutVarianteWebDAV) {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_JOURNAL) throw new Error('Le journal d’ajout de variante dépasse 24 Mio.')
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
  private valider(j: EnvoiAjoutVarianteWebDAV) {
    if (!j || j.version !== 1 || j.destination !== this.destination || !/^ajout-variante-[a-zA-Z0-9_-]{1,160}$/.test(j.operationId)
      || typeof j.avant !== 'string' || typeof j.apres !== 'string' || !etagImportWebDAVFort(j.etagAvant)
      || !['envoi', 'confirme'].includes(j.etat)) throw new Error()
    const candidat = candidatAjoutVarianteWebDAV(j.avant, j.demande)
    if (!candidat.resultat.ajoute || candidat.apres !== j.apres) throw new Error()
  }
}
