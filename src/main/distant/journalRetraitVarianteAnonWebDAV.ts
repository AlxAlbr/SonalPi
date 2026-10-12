import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier } from '../../shared/format'
import { preparerRetraitVarianteAnon, type BilanRetraitVarianteAnon, type DemandeRetraitVarianteAnon } from '../../shared/corpus/retraitVarianteAnon'
import { lireBarriereRetraitVarianteAnon, type BarriereRetraitVarianteAnon } from '../../shared/corpus/barriereRetraitVarianteAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { etagImportWebDAVFort, idImportWebDAVSain } from './journalCorrespondancesWebDAV'

export interface CibleRetraitVarianteWebDAV {
  id: string; avant: string; apres: string; bilan: BilanRetraitVarianteAnon
  etat: 'a-faire' | 'confirme' | 'retire'; motif?: string
}
export interface EnvoiRetraitVarianteWebDAV {
  phase: 'barriere' | 'entretien' | 'retrait'; chemin: string; avant: string; apres: string; etagAvant: string
}
export interface LotRetraitVarianteWebDAV {
  version: 1; destination: string; operationId: string; demande: DemandeRetraitVarianteAnon
  corpusAvant: CorpusFichier; barriereConfirmee: boolean; varianteRetiree: boolean; miroirComplet: boolean
  cibles: CibleRetraitVarianteWebDAV[]; nouvellesCibles: string[]; motif?: string; envoi?: EnvoiRetraitVarianteWebDAV
}
const MAX_OCTETS = 128 * 1024 * 1024
const idSain = (s: unknown): s is string => typeof s === 'string' && idImportWebDAVSain(s) && !!s.trim() && !/[\r\n]/.test(s)
const idsSains = (s: unknown): s is string[] => Array.isArray(s) && s.every(idSain) && new Set(s).size === s.length
export const egauxRetraitVarianteWebDAV = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)
export const barriereRetraitVarianteWebDAV = (j: LotRetraitVarianteWebDAV): BarriereRetraitVarianteAnon => ({
  operationId: j.operationId, regleId: j.demande.regleAvant.id, pseudoRetire: j.demande.pseudoRetire, pseudoConserve: j.demande.pseudoConserve,
})

/** Conserve le seul remplacement consenti et ses intentions, jamais une restauration. */
export class JournalRetraitVarianteAnonWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) { this.chemin = join(dir, '.retrait-variante-anon-webdav.json') }
  lire(): LotRetraitVarianteWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > MAX_OCTETS) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as LotRetraitVarianteWebDAV
      this.valider(j); return j
    } catch { throw new Error('Le journal de retrait de variante WebDAV est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(j: LotRetraitVarianteWebDAV): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal de retrait de variante dépasse 128 Mio.')
    const temporaire = `${this.chemin}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporaire, 'wx', 0o600)
      try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporaire, this.chemin)
      const parent = openSync(dirname(this.chemin), 'r')
      try { fsyncSync(parent) } finally { closeSync(parent) }
    } finally { if (existsSync(temporaire)) unlinkSync(temporaire) }
  }
  private valider(j: LotRetraitVarianteWebDAV): void {
    const regleId = j?.demande?.regleAvant?.id
    if (!j || j.version !== 1 || j.destination !== this.destination || !/^retrait-variante-[a-zA-Z0-9_-]{1,160}$/.test(j.operationId)
      || !idSain(regleId) || j.corpusAvant?.formatVersion !== FORMAT_VERSION
      || j.corpusAvant.suppressionAnon !== undefined || j.corpusAvant.dissociationAnon !== undefined || j.corpusAvant.retraitVarianteAnon !== undefined
      || !j.corpusAvant.membership || typeof j.corpusAvant.membership !== 'object' || Array.isArray(j.corpusAvant.membership)
      || !Object.keys(j.corpusAvant.membership).every(idSain) || !Object.hasOwn(j.corpusAvant.reglesAnon ?? {}, regleId)
      || typeof j.barriereConfirmee !== 'boolean' || typeof j.varianteRetiree !== 'boolean' || typeof j.miroirComplet !== 'boolean'
      || !Array.isArray(j.cibles) || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || !idsSains(j.nouvellesCibles) || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error('Progression de retrait invalide.')
    const final = preparerRetraitVarianteAnon({ ...structuredClone(j.corpusAvant), membership: {} }, [], j.demande).corpusApres
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme', 'retire'].includes(c.etat)
        || (c.etat === 'confirme' && !j.barriereConfirmee)
        || typeof c.avant !== 'string' || typeof c.apres !== 'string' || (c.motif !== undefined && typeof c.motif !== 'string')) throw new Error('Cible de retrait invalide.')
      const corpus = { ...structuredClone(j.corpusAvant), membership: { [c.id]: j.corpusAvant.membership[c.id] } }
      const plan = preparerRetraitVarianteAnon(corpus, [{ id: c.id, titre: c.id, data: JSON.parse(c.avant) }], j.demande)
      const attendu = plan.entretiens[0]?.apres, apres = JSON.parse(c.apres)
      if (!attendu || typeof apres.lastModified !== 'string' || !Number.isFinite(Date.parse(apres.lastModified))
        || new Date(apres.lastModified).toISOString() !== apres.lastModified) throw new Error('Date de retrait invalide.')
      attendu.lastModified = apres.lastModified
      if (!egauxRetraitVarianteWebDAV(attendu, apres) || !egauxRetraitVarianteWebDAV(plan.bilan, c.bilan)) throw new Error('Remplacement lié invalide.')
    }
    if (j.varianteRetiree && (!j.barriereConfirmee || j.envoi || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire'))) throw new Error('Clôture de retrait invalide.')
    const e = j.envoi
    if (!e) return
    if (j.varianteRetiree || !['barriere', 'entretien', 'retrait'].includes(e.phase) || !etagImportWebDAVFort(e.etagAvant)
      || typeof e.avant !== 'string' || typeof e.apres !== 'string' || e.avant === e.apres) throw new Error('Intention de retrait invalide.')
    if (e.phase === 'entretien') {
      const c = j.cibles.find((c) => `entretiens/${c.id}.json` === e.chemin)
      if (!j.barriereConfirmee || !c || c.etat !== 'a-faire' || c.avant !== e.avant || c.apres !== e.apres) throw new Error('Intention cible invalide.')
      return
    }
    if (e.chemin !== 'corpus.json') throw new Error('Destination de retrait invalide.')
    const avant = JSON.parse(e.avant) as CorpusFichier, apres = JSON.parse(e.apres)
    if (avant.formatVersion !== FORMAT_VERSION || avant.dissociationAnon !== undefined || avant.suppressionAnon !== undefined
      || !egauxRetraitVarianteWebDAV(avant.reglesAnon?.[regleId], j.demande.regleAvant)
      || (j.barriereConfirmee ? !egauxRetraitVarianteWebDAV(lireBarriereRetraitVarianteAnon(avant), barriereRetraitVarianteWebDAV(j)) : avant.retraitVarianteAnon !== undefined)) throw new Error('Source corpus invalide.')
    if (e.phase === 'barriere') {
      if (j.barriereConfirmee) throw new Error('Protection déjà publiée.')
      avant.retraitVarianteAnon = barriereRetraitVarianteWebDAV(j)
    } else {
      if (!j.barriereConfirmee || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire')) throw new Error('Retrait prématuré.')
      avant.reglesAnon[regleId] = structuredClone(final.reglesAnon[regleId]); delete avant.retraitVarianteAnon
    }
    if (!egauxRetraitVarianteWebDAV(avant, apres)) throw new Error('Transformation du corpus invalide.')
  }
}
