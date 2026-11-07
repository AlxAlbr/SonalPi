import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier } from '../../shared/format'
import { preparerDissociationAnon, type BilanDissociationAnon, type DemandeDissociationAnon } from '../../shared/corpus/dissociationAnon'
import { lireBarriereDissociationWebDAV, type BarriereDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { etagImportWebDAVFort, idImportWebDAVSain } from './journalCorrespondancesWebDAV'

export interface CibleDissociationWebDAV {
  id: string; avant: string; apres: string; bilan: BilanDissociationAnon
  etat: 'a-faire' | 'confirme' | 'retire'; motif?: string
}
export interface EnvoiDissociationWebDAV {
  phase: 'barriere' | 'entretien' | 'retrait'; chemin: string; avant: string; apres: string; etagAvant: string
}
export interface LotDissociationWebDAV {
  version: 1; destination: string; operationId: string; demande: DemandeDissociationAnon
  corpusAvant: CorpusFichier; barriereConfirmee: boolean; protegees: string[]; regleRetiree: boolean
  cibles: CibleDissociationWebDAV[]; nouvellesCibles: string[]; motif?: string; envoi?: EnvoiDissociationWebDAV
}
const MAX_OCTETS = 128 * 1024 * 1024
const idSain = (s: unknown): s is string => typeof s === 'string' && idImportWebDAVSain(s) && !!s.trim() && !/[\r\n]/.test(s)
const idsSains = (s: unknown): s is string[] => Array.isArray(s) && s.every(idSain) && new Set(s).size === s.length
export const egauxDissociationWebDAV = (a: unknown, b: unknown) => a === undefined || b === undefined ? a === b : empreinteCorrespondance(a) === empreinteCorrespondance(b)
export const barriereDissociationWebDAV = (j: LotDissociationWebDAV): BarriereDissociationWebDAV => ({
  operationId: j.operationId, regleId: j.demande.regleId, fournisseur: 'webdav', cibles: [...j.protegees],
})
export const protectionsDissociationWebDAV = (j: LotDissociationWebDAV) => [...new Set([...j.protegees, ...j.cibles.filter((c) => c.etat !== 'retire').map((c) => c.id)])].sort()

/** Conserve les transformations et les intentions avant PUT ; aucun acquis n’est annulé. */
export class JournalDissociationAnonWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) { this.chemin = join(dir, '.dissociation-anon-webdav.json') }
  lire(): LotDissociationWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > MAX_OCTETS) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as LotDissociationWebDAV
      this.valider(j); return j
    } catch { throw new Error('Le journal de dissociation WebDAV est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(j: LotDissociationWebDAV): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal de dissociation dépasse 128 Mio.')
    const temporaire = `${this.chemin}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporaire, 'wx', 0o600)
      try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporaire, this.chemin)
      const parent = openSync(dirname(this.chemin), 'r')
      try { fsyncSync(parent) } finally { closeSync(parent) }
    } finally { if (existsSync(temporaire)) unlinkSync(temporaire) }
  }
  private valider(j: LotDissociationWebDAV): void {
    if (!j || j.version !== 1 || j.destination !== this.destination || !/^dissociation-[a-zA-Z0-9_-]{1,160}$/.test(j.operationId)
      || !idSain(j.demande?.regleId) || j.corpusAvant?.formatVersion !== FORMAT_VERSION || j.corpusAvant.dissociationAnon !== undefined
      || !j.corpusAvant.membership || !Object.hasOwn(j.corpusAvant.reglesAnon ?? {}, j.demande.regleId)
      || typeof j.barriereConfirmee !== 'boolean' || typeof j.regleRetiree !== 'boolean'
      || !idsSains(j.protegees) || (!j.barriereConfirmee && j.protegees.length !== 0)
      || !Array.isArray(j.cibles) || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || !idsSains(j.nouvellesCibles) || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error('Progression de dissociation invalide.')
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme', 'retire'].includes(c.etat)
        || (c.etat === 'confirme' && (!j.barriereConfirmee || !j.protegees.includes(c.id)))
        || typeof c.avant !== 'string' || typeof c.apres !== 'string' || (c.motif !== undefined && typeof c.motif !== 'string')) throw new Error('Cible de dissociation invalide.')
      const corpus = { ...structuredClone(j.corpusAvant), membership: { [c.id]: j.corpusAvant.membership[c.id] } }
      const plan = preparerDissociationAnon(corpus, [{ id: c.id, titre: c.id, data: JSON.parse(c.avant) }], j.demande)
      const attendu = plan.entretiens[0]?.apres, apres = JSON.parse(c.apres)
      if (!attendu || typeof apres.lastModified !== 'string' || !Number.isFinite(Date.parse(apres.lastModified))) throw new Error('Date de dissociation invalide.')
      attendu.lastModified = apres.lastModified
      if (!egauxDissociationWebDAV(attendu, apres) || !egauxDissociationWebDAV(plan.bilan, c.bilan)) throw new Error('Transfert de dissociation invalide.')
    }
    if (j.protegees.some((id) => !j.cibles.some((c) => c.id === id))
      || (j.regleRetiree && (!j.barriereConfirmee || j.envoi || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire')))) throw new Error('Clôture de dissociation invalide.')
    const e = j.envoi
    if (!e) return
    if (j.regleRetiree || !['barriere', 'entretien', 'retrait'].includes(e.phase) || !etagImportWebDAVFort(e.etagAvant)
      || typeof e.avant !== 'string' || typeof e.apres !== 'string' || e.avant === e.apres) throw new Error('Intention de dissociation invalide.')
    if (e.phase === 'entretien') {
      const c = j.cibles.find((c) => `entretiens/${c.id}.json` === e.chemin)
      if (!j.barriereConfirmee || !c || c.etat !== 'a-faire' || !j.protegees.includes(c.id) || c.avant !== e.avant || c.apres !== e.apres) throw new Error('Intention cible invalide.')
      return
    }
    if (e.chemin !== 'corpus.crp') throw new Error('Destination de dissociation invalide.')
    const avant = JSON.parse(e.avant) as CorpusFichier, apres = JSON.parse(e.apres)
    if (avant.formatVersion !== FORMAT_VERSION || !egauxDissociationWebDAV(avant.reglesAnon?.[j.demande.regleId], j.corpusAvant.reglesAnon[j.demande.regleId])
      || (j.barriereConfirmee ? !egauxDissociationWebDAV(lireBarriereDissociationWebDAV(avant), barriereDissociationWebDAV(j)) : avant.dissociationAnon !== undefined)) throw new Error('Source corpus invalide.')
    if (e.phase === 'barriere') avant.dissociationAnon = { ...barriereDissociationWebDAV(j), cibles: protectionsDissociationWebDAV(j) }
    else {
      if (!j.barriereConfirmee || j.nouvellesCibles.length || j.cibles.some((c) => c.etat === 'a-faire')) throw new Error('Retrait prématuré.')
      delete avant.reglesAnon[j.demande.regleId]; delete avant.dissociationAnon
    }
    if (!egauxDissociationWebDAV(avant, apres)) throw new Error('Transformation du corpus invalide.')
  }
}
