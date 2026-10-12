import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier } from '../../shared/format'
import { preparerSuppressionAnon, type BilanSuppressionAnon, type DemandeSuppressionAnon } from '../../shared/corpus/suppressionAnon'
import { lireBarriereSuppressionAnon, type BarriereSuppressionAnon } from '../../shared/corpus/barriereSuppressionAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { etagImportWebDAVFort, idImportWebDAVSain } from './journalCorrespondancesWebDAV'

export interface CibleSuppressionWebDAV {
  id: string; avant: string; apres: string; bilan: BilanSuppressionAnon
  etat: 'a-faire' | 'confirme' | 'retire'; motif?: string
}
export interface EnvoiSuppressionWebDAV {
  phase: 'barriere' | 'entretien' | 'retrait'; chemin: string; avant: string; apres: string; etagAvant: string
}
export interface LotSuppressionWebDAV {
  version: 1; destination: string; operationId: string; demande: DemandeSuppressionAnon
  corpusAvant: CorpusFichier; barriereConfirmee: boolean; regleRetiree: boolean; miroirComplet: boolean
  cibles: CibleSuppressionWebDAV[]; nouvellesCibles: string[]; motif?: string; envoi?: EnvoiSuppressionWebDAV
}
const MAX_OCTETS = 128 * 1024 * 1024
const idSain = (s: unknown): s is string => typeof s === 'string' && idImportWebDAVSain(s) && !!s.trim() && !/[\r\n]/.test(s)
const idsSains = (s: unknown): s is string[] => Array.isArray(s) && s.every(idSain) && new Set(s).size === s.length
export const egauxSuppressionWebDAV = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)
export const barriereSuppressionWebDAV = (j: LotSuppressionWebDAV): BarriereSuppressionAnon => ({ operationId: j.operationId, regleId: j.demande.regleId })

/** Conserve les seuls retraits consentis et les intentions avant PUT, jamais une restauration. */
export class JournalSuppressionAnonWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) { this.chemin = join(dir, '.suppression-anon-webdav.json') }
  lire(): LotSuppressionWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > MAX_OCTETS) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as LotSuppressionWebDAV
      this.valider(j); return j
    } catch { throw new Error('Le journal de suppression WebDAV est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(j: LotSuppressionWebDAV): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal de suppression dépasse 128 Mio.')
    const temporaire = `${this.chemin}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporaire, 'wx', 0o600)
      try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporaire, this.chemin)
      const parent = openSync(dirname(this.chemin), 'r')
      try { fsyncSync(parent) } finally { closeSync(parent) }
    } finally { if (existsSync(temporaire)) unlinkSync(temporaire) }
  }
  private valider(j: LotSuppressionWebDAV): void {
    if (!j || j.version !== 1 || j.destination !== this.destination || !/^suppression-anon-[a-zA-Z0-9_-]{1,160}$/.test(j.operationId)
      || !idSain(j.demande?.regleId) || j.corpusAvant?.formatVersion !== FORMAT_VERSION
      || j.corpusAvant.suppressionAnon !== undefined || j.corpusAvant.dissociationAnon !== undefined
      || !j.corpusAvant.membership || !Object.keys(j.corpusAvant.membership).every(idSain)
      || !Object.hasOwn(j.corpusAvant.reglesAnon ?? {}, j.demande.regleId)
      || typeof j.barriereConfirmee !== 'boolean' || typeof j.regleRetiree !== 'boolean' || typeof j.miroirComplet !== 'boolean'
      || !Array.isArray(j.cibles) || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || !idsSains(j.nouvellesCibles) || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error('Progression de suppression invalide.')
    preparerSuppressionAnon({ ...structuredClone(j.corpusAvant), membership: {} }, [], j.demande)
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme', 'retire'].includes(c.etat)
        || (c.etat === 'confirme' && !j.barriereConfirmee)
        || typeof c.avant !== 'string' || typeof c.apres !== 'string' || (c.motif !== undefined && typeof c.motif !== 'string')) throw new Error('Cible de suppression invalide.')
      const corpus = { ...structuredClone(j.corpusAvant), membership: { [c.id]: j.corpusAvant.membership[c.id] } }
      const plan = preparerSuppressionAnon(corpus, [{ id: c.id, titre: c.id, data: JSON.parse(c.avant) }], j.demande)
      const attendu = plan.entretiens[0]?.apres, apres = JSON.parse(c.apres)
      if (!attendu || typeof apres.lastModified !== 'string' || !Number.isFinite(Date.parse(apres.lastModified))) throw new Error('Date de suppression invalide.')
      attendu.lastModified = apres.lastModified
      if (!egauxSuppressionWebDAV(attendu, apres) || !egauxSuppressionWebDAV(plan.bilan, c.bilan)) throw new Error('Retrait attribué invalide.')
    }
    if (j.regleRetiree && (!j.barriereConfirmee || j.envoi || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire'))) throw new Error('Clôture de suppression invalide.')
    const e = j.envoi
    if (!e) return
    if (j.regleRetiree || !['barriere', 'entretien', 'retrait'].includes(e.phase) || !etagImportWebDAVFort(e.etagAvant)
      || typeof e.avant !== 'string' || typeof e.apres !== 'string' || e.avant === e.apres) throw new Error('Intention de suppression invalide.')
    if (e.phase === 'entretien') {
      const c = j.cibles.find((c) => `entretiens/${c.id}.json` === e.chemin)
      if (!j.barriereConfirmee || !c || c.etat !== 'a-faire' || c.avant !== e.avant || c.apres !== e.apres) throw new Error('Intention cible invalide.')
      return
    }
    if (e.chemin !== 'corpus.json') throw new Error('Destination de suppression invalide.')
    const avant = JSON.parse(e.avant) as CorpusFichier, apres = JSON.parse(e.apres)
    if (avant.formatVersion !== FORMAT_VERSION || avant.dissociationAnon !== undefined
      || !egauxSuppressionWebDAV(avant.reglesAnon?.[j.demande.regleId], j.corpusAvant.reglesAnon[j.demande.regleId])
      || (j.barriereConfirmee ? !egauxSuppressionWebDAV(lireBarriereSuppressionAnon(avant), barriereSuppressionWebDAV(j)) : avant.suppressionAnon !== undefined)) throw new Error('Source corpus invalide.')
    if (e.phase === 'barriere') {
      if (j.barriereConfirmee) throw new Error('Protection déjà publiée.')
      avant.suppressionAnon = barriereSuppressionWebDAV(j)
    } else {
      if (!j.barriereConfirmee || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire')) throw new Error('Retrait prématuré.')
      delete avant.reglesAnon[j.demande.regleId]; delete avant.suppressionAnon
    }
    if (!egauxSuppressionWebDAV(avant, apres)) throw new Error('Transformation du corpus invalide.')
  }
}
