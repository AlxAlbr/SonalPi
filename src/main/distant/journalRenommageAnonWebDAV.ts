import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { CorpusFichier, RegleAnon } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { preparerRenommageAnon, type DemandeRenommageAnon } from '../../shared/corpus/renommageAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { idImportWebDAVSain, etagImportWebDAVFort } from './journalCorrespondancesWebDAV'

export interface CibleRenommageWebDAV {
  id: string; avant: string; apres: string; annotations: number; incluses: number
  etat: 'a-faire' | 'confirme'; motif?: string
}
export interface EnvoiRenommageWebDAV {
  chemin: string; avant: string; apres: string; etagAvant: string
}
export interface LotRenommageWebDAV {
  version: 1; destination: string; operationId: string; demande: DemandeRenommageAnon
  corpusAvant: CorpusFichier; regleApres: RegleAnon; definitionConfirmee: boolean
  cibles: CibleRenommageWebDAV[]; nouvellesCibles: string[]; retirees: string[]
  acquis: Array<{ id: string; annotations: number; incluses: number }>
  termine: boolean; motif?: string; envoi?: EnvoiRenommageWebDAV
}
const MAX_OCTETS = 128 * 1024 * 1024
const compte = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const idSain = (v: unknown): v is string => typeof v === 'string' && idImportWebDAVSain(v)

/** Conserve les copies consenties et l’intention avant chaque PUT, hors du renderer. */
export class JournalRenommageAnonWebDAV {
  readonly chemin: string
  constructor(dir: string, private readonly destination: string) {
    this.chemin = join(dir, '.renommage-anon-webdav.json')
  }
  lire(): LotRenommageWebDAV | null {
    if (!existsSync(this.chemin)) return null
    try {
      if (statSync(this.chemin).size > MAX_OCTETS) throw new Error()
      const j = JSON.parse(readFileSync(this.chemin, 'utf8')) as LotRenommageWebDAV
      this.valider(j)
      return j
    } catch { throw new Error('Le journal du renommage WebDAV est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(j: LotRenommageWebDAV): void {
    this.valider(j)
    const contenu = JSON.stringify(j)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal du renommage dépasse 128 Mio.')
    const temporaire = `${this.chemin}.${randomUUID()}.tmp`
    try {
      const fd = openSync(temporaire, 'wx', 0o600)
      try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
      renameSync(temporaire, this.chemin)
      const dossier = openSync(dirname(this.chemin), 'r')
      try { fsyncSync(dossier) } finally { closeSync(dossier) }
    } finally { if (existsSync(temporaire)) unlinkSync(temporaire) }
  }
  private valider(j: LotRenommageWebDAV): void {
    if (!j || j.version !== 1 || j.destination !== this.destination
      || typeof j.operationId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(j.operationId)
      || j.corpusAvant?.formatVersion !== FORMAT_VERSION || !j.corpusAvant.membership
      || typeof j.definitionConfirmee !== 'boolean' || typeof j.termine !== 'boolean'
      || !Array.isArray(j.cibles) || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || !Array.isArray(j.nouvellesCibles) || !j.nouvellesCibles.every(idSain)
      || new Set(j.nouvellesCibles).size !== j.nouvellesCibles.length
      || !Array.isArray(j.retirees) || !j.retirees.every(idSain)
      || !Array.isArray(j.acquis) || (j.acquis.length > 0 && !j.definitionConfirmee)
      || j.acquis.some((a) => !idSain(a?.id) || !compte(a.annotations) || !a.annotations
        || !compte(a.incluses) || a.incluses > a.annotations)
      || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error('Progression du renommage invalide.')
    const corpus = structuredClone(j.corpusAvant)
    corpus.membership = Object.fromEntries(j.cibles.map((c) => [c.id, j.corpusAvant.membership[c.id]]))
    const plan = preparerRenommageAnon(corpus, j.cibles.map((c) => ({ id: c.id, titre: c.id, data: JSON.parse(c.avant) })), j.demande, [j.demande.nouveauPseudo])
    if (empreinteCorrespondance(plan.inventaire.apres) !== empreinteCorrespondance(j.regleApres)) throw new Error('Définition du renommage invalide.')
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme'].includes(c.etat)
        || (c.etat === 'confirme' && !j.definitionConfirmee) || (c.motif !== undefined && typeof c.motif !== 'string')) throw new Error('Cible du renommage invalide.')
      const attendu = plan.entretiens.find((e) => e.id === c.id)?.apres
      const ligne = plan.inventaire.entretiens.find((e) => e.id === c.id)!
      if (!attendu || c.annotations !== ligne.renommages || c.incluses !== ligne.inclusesRenommees) throw new Error('Bilan du renommage invalide.')
      const apres = JSON.parse(c.apres)
      attendu.lastModified = apres.lastModified
      if (empreinteCorrespondance(attendu) !== empreinteCorrespondance(apres)) throw new Error('Copie du renommage invalide.')
    }
    if (j.termine && (!j.definitionConfirmee || j.envoi || j.nouvellesCibles.length || j.cibles.some((c) => c.etat !== 'confirme'))) throw new Error('Clôture du renommage invalide.')
    const e = j.envoi
    if (!e) return
    if (j.termine || !etagImportWebDAVFort(e.etagAvant) || typeof e.avant !== 'string' || typeof e.apres !== 'string' || e.avant === e.apres) throw new Error('Envoi du renommage invalide.')
    if (e.chemin === 'corpus.crp') {
      if (j.definitionConfirmee) throw new Error('Définition déjà confirmée.')
      const avant = JSON.parse(e.avant) as CorpusFichier
      const apres = JSON.parse(e.apres)
      if (empreinteCorrespondance(avant) !== empreinteCorrespondance(j.corpusAvant)) throw new Error('Source du renommage invalide.')
      avant.reglesAnon[j.demande.regleId] = structuredClone(j.regleApres)
      if (empreinteCorrespondance(avant) !== empreinteCorrespondance(apres)) throw new Error('Publication du renommage invalide.')
    } else {
      const id = /^entretiens\/([^/]+)\.json$/.exec(e.chemin)?.[1]
      const c = j.cibles.find((c) => c.id === id)
      if (!j.definitionConfirmee || !c || c.etat !== 'a-faire' || e.avant !== c.avant || e.apres !== c.apres) throw new Error('Publication de cible invalide.')
    }
  }
}
