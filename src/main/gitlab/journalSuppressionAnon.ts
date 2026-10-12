import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../shared/format'
import { preparerSuppressionAnon, type BilanSuppressionAnon, type DemandeSuppressionAnon } from '../../shared/corpus/suppressionAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'

export interface CibleSuppressionGitLab {
  id: string; avant: EntretienFichier; apres: EntretienFichier; bilan: BilanSuppressionAnon
  etat: 'a-faire' | 'confirme' | 'retire'; motif?: string
}
export interface PublicationSuppressionGitLab {
  operationId: string; phase: 'barriere' | 'entretien' | 'retrait'; chemin: string; contenu: string
  id?: string; corpusAvant?: CorpusFichier
}
export interface LotSuppressionGitLab {
  version: 1; destination: string; operationId: string; demande: DemandeSuppressionAnon
  corpusAvant: CorpusFichier; barriereConfirmee: boolean; regleRetiree: boolean; miroirComplet: boolean
  cibles: CibleSuppressionGitLab[]; nouvellesCibles: string[]; motif?: string
  publication?: PublicationSuppressionGitLab
}
export const empreinteDestinationSuppressionGitLab = (id: string, branche: string, racine: string) =>
  createHash('sha256').update(`${id}\0${branche}\0${racine}`).digest('hex')
const MAX_OCTETS = 128 * 1024 * 1024
const idSain = (s: unknown): s is string => typeof s === 'string' && !!s.trim() && !/[/\\\0]/.test(s) && s !== '.' && s !== '..'
const operationSaine = (s: unknown): s is string => typeof s === 'string' && /^suppression-anon-[a-zA-Z0-9_-]{1,160}$/.test(s)
const egaux = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)

/** Conserve les seuls retraits consentis et leurs intentions, sans restaurer les choix retirés. */
export class JournalSuppressionAnonGitLab {
  private readonly fichier: string
  constructor(dir: string, private readonly destination: string, private readonly racine: string) {
    this.fichier = join(dir, '.suppression-anon-gitlab.json')
  }
  lire(): LotSuppressionGitLab | null {
    if (!existsSync(this.fichier)) return null
    try {
      if (statSync(this.fichier).size > MAX_OCTETS) throw new Error()
      const j = JSON.parse(readFileSync(this.fichier, 'utf8')) as LotSuppressionGitLab
      this.valider(j)
      return j
    } catch { throw new Error('Le journal de suppression GitLab est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(j: LotSuppressionGitLab): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal de suppression dépasse 128 Mio.')
    const temporaire = `${this.fichier}.${randomUUID()}.tmp`, fd = openSync(temporaire, 'wx', 0o600)
    try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temporaire, this.fichier)
    const parent = openSync(dirname(this.fichier), 'r')
    try { fsyncSync(parent) } finally { closeSync(parent) }
  }
  private valider(j: LotSuppressionGitLab): void {
    if (!j || j.version !== 1 || j.destination !== this.destination || !operationSaine(j.operationId)
      || !idSain(j.demande?.regleId) || j.corpusAvant?.formatVersion !== FORMAT_VERSION
      || j.corpusAvant.suppressionAnon !== undefined || j.corpusAvant.dissociationAnon !== undefined
      || !j.corpusAvant.membership || !Object.hasOwn(j.corpusAvant.reglesAnon ?? {}, j.demande.regleId)
      || typeof j.barriereConfirmee !== 'boolean' || typeof j.regleRetiree !== 'boolean' || typeof j.miroirComplet !== 'boolean'
      || !Array.isArray(j.cibles) || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || !Array.isArray(j.nouvellesCibles) || !j.nouvellesCibles.every(idSain) || new Set(j.nouvellesCibles).size !== j.nouvellesCibles.length
      || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error()
    if (!Object.keys(j.corpusAvant.membership).every(idSain)) throw new Error()
    preparerSuppressionAnon({ ...structuredClone(j.corpusAvant), membership: {} }, [], j.demande)
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme', 'retire'].includes(c.etat)
        || (c.etat === 'confirme' && !j.barriereConfirmee) || (c.motif !== undefined && typeof c.motif !== 'string')) throw new Error()
      const corpus = { ...structuredClone(j.corpusAvant), membership: { [c.id]: j.corpusAvant.membership[c.id] } }
      const plan = preparerSuppressionAnon(corpus, [{ id: c.id, titre: c.id, data: c.avant }], j.demande)
      const attendu = plan.entretiens[0]?.apres
      if (!attendu || typeof c.apres?.lastModified !== 'string' || !Number.isFinite(Date.parse(c.apres.lastModified))) throw new Error()
      attendu.lastModified = c.apres.lastModified
      if (!egaux(attendu, c.apres) || !egaux(plan.bilan, c.bilan)) throw new Error()
    }
    if (j.regleRetiree && (!j.barriereConfirmee || j.publication || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire'))) throw new Error()
    const p = j.publication
    if (!p) return
    if (j.regleRetiree || !operationSaine(p.operationId) || !['barriere', 'entretien', 'retrait'].includes(p.phase) || typeof p.contenu !== 'string') throw new Error()
    const relatif = p.phase === 'entretien' ? `entretiens/${p.id}.json` : 'corpus.json'
    if (p.chemin !== (this.racine ? `${this.racine}/${relatif}` : relatif)) throw new Error()
    const data = JSON.parse(p.contenu)
    if (p.phase === 'entretien') {
      const c = j.cibles.find((c) => c.id === p.id)
      if (!j.barriereConfirmee || !c || c.etat !== 'a-faire' || p.corpusAvant !== undefined || !egaux(data, c.apres)) throw new Error()
      return
    }
    if (p.id !== undefined || p.corpusAvant?.formatVersion !== FORMAT_VERSION || p.corpusAvant.dissociationAnon !== undefined
      || !egaux(p.corpusAvant.reglesAnon[j.demande.regleId], j.corpusAvant.reglesAnon[j.demande.regleId])) throw new Error()
    const attendu = structuredClone(p.corpusAvant)
    if (p.phase === 'barriere') {
      if (j.barriereConfirmee || attendu.suppressionAnon !== undefined) throw new Error()
      attendu.suppressionAnon = { operationId: j.operationId, regleId: j.demande.regleId }
    } else {
      if (!j.barriereConfirmee || j.cibles.some((c) => c.etat === 'a-faire') || j.nouvellesCibles.length
        || !egaux(attendu.suppressionAnon, { operationId: j.operationId, regleId: j.demande.regleId })) throw new Error()
      delete attendu.reglesAnon[j.demande.regleId]
      delete attendu.suppressionAnon
    }
    if (!egaux(data, attendu)) throw new Error()
  }
}
