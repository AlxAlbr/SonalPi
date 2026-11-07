import { existsSync, openSync, closeSync, fsyncSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type RegleAnon } from '../../shared/format'
import { preparerRenommageAnon, type DemandeRenommageAnon } from '../../shared/corpus/renommageAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'

export interface CibleRenommageGitLab {
  id: string; avant: EntretienFichier; apres: EntretienFichier; annotations: number; incluses: number
  etat: 'a-faire' | 'confirme'; motif?: string
}
export interface PublicationRenommageGitLab {
  operationId: string; phase: 'definition' | 'entretien'; id?: string; chemin: string; contenu: string
}
export interface LotRenommageGitLab {
  version: 1; destination: string; operationId: string; demande: DemandeRenommageAnon
  corpusAvant: CorpusFichier; regleApres: RegleAnon; definitionConfirmee: boolean
  cibles: CibleRenommageGitLab[]; nouvellesCibles: string[]; termine: boolean; motif?: string
  acquis: Array<{ id: string; annotations: number; incluses: number }>; retirees: string[]
  publication?: PublicationRenommageGitLab
}
const MAX_OCTETS = 128 * 1024 * 1024
const idSain = (s: unknown): s is string => typeof s === 'string' && /^[^/\\\0]+$/.test(s) && s !== '.' && s !== '..'
const operationSaine = (s: unknown) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(s)

/** Conserve les seules copies consenties et l’intention de chaque publication. */
export class JournalRenommageAnonGitLab {
  private readonly fichier: string
  constructor(dir: string, private readonly destination: string, private readonly racine: string) {
    this.fichier = join(dir, '.renommage-anon-gitlab.json')
  }
  lire(): LotRenommageGitLab | null {
    if (!existsSync(this.fichier)) return null
    try {
      if (statSync(this.fichier).size > MAX_OCTETS) throw new Error()
      const lot = JSON.parse(readFileSync(this.fichier, 'utf8')) as LotRenommageGitLab
      this.valider(lot)
      return lot
    } catch { throw new Error('Le journal du renommage GitLab est invalide ou illisible. Aucun écrasement autorisé.') }
  }
  ecrire(lot: LotRenommageGitLab): void {
    this.valider(lot)
    const contenu = JSON.stringify(lot)
    if (Buffer.byteLength(contenu) > MAX_OCTETS) throw new Error('Le journal du renommage dépasse 128 Mio.')
    const temporaire = `${this.fichier}.${randomUUID()}.tmp`
    const fd = openSync(temporaire, 'wx', 0o600)
    try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(temporaire, this.fichier)
  }
  private valider(j: LotRenommageGitLab): void {
    if (!j || j.version !== 1 || j.destination !== this.destination || !operationSaine(j.operationId)
      || j.corpusAvant?.formatVersion !== FORMAT_VERSION || !j.corpusAvant.membership
      || typeof j.definitionConfirmee !== 'boolean' || typeof j.termine !== 'boolean'
      || !Array.isArray(j.acquis) || !Array.isArray(j.retirees) || !j.retirees.every(idSain)
      || j.acquis.some((a) => !idSain(a?.id) || !Number.isSafeInteger(a.annotations) || a.annotations < 1
        || !Number.isSafeInteger(a.incluses) || a.incluses < 0 || a.incluses > a.annotations)
      || (j.acquis.length > 0 && !j.definitionConfirmee)
      || !Array.isArray(j.cibles) || !Array.isArray(j.nouvellesCibles) || !j.nouvellesCibles.every(idSain)
      || new Set(j.nouvellesCibles).size !== j.nouvellesCibles.length
      || new Set(j.cibles.map((c) => c?.id)).size !== j.cibles.length
      || (j.motif !== undefined && typeof j.motif !== 'string')) throw new Error()
    const corpus = structuredClone(j.corpusAvant)
    corpus.membership = Object.fromEntries(j.cibles.map((c) => [c.id, j.corpusAvant.membership[c.id]]))
    const plan = preparerRenommageAnon(corpus, j.cibles.map((c) => ({ id: c.id, titre: c.id, data: c.avant })), j.demande, [j.demande.nouveauPseudo])
    if (empreinteCorrespondance(plan.inventaire.apres) !== empreinteCorrespondance(j.regleApres)) throw new Error()
    for (const c of j.cibles) {
      if (!idSain(c.id) || !Object.hasOwn(j.corpusAvant.membership, c.id) || !['a-faire', 'confirme'].includes(c.etat)
        || (c.motif !== undefined && typeof c.motif !== 'string') || (c.etat === 'confirme' && !j.definitionConfirmee)) throw new Error()
      const attendu = plan.entretiens.find((e) => e.id === c.id)?.apres
      const ligne = plan.inventaire.entretiens.find((e) => e.id === c.id)
      if (!attendu || !ligne || c.annotations !== ligne.renommages || c.incluses !== ligne.inclusesRenommees) throw new Error()
      attendu.lastModified = c.apres.lastModified
      if (empreinteCorrespondance(attendu) !== empreinteCorrespondance(c.apres)) throw new Error()
    }
    if (j.termine && (!j.definitionConfirmee || j.cibles.some((c) => c.etat !== 'confirme') || j.nouvellesCibles.length || j.publication)) throw new Error()
    const p = j.publication
    if (p) {
      if (j.termine || !operationSaine(p.operationId) || !['definition', 'entretien'].includes(p.phase)
        || typeof p.contenu !== 'string') throw new Error()
      const relatif = p.phase === 'definition' ? 'corpus.crp' : `entretiens/${p.id}.json`
      if (p.chemin !== (this.racine ? `${this.racine}/${relatif}` : relatif)) throw new Error()
      const data = JSON.parse(p.contenu)
      if (p.phase === 'definition') {
        if (p.id !== undefined || data.formatVersion !== FORMAT_VERSION || j.definitionConfirmee
          || empreinteCorrespondance(data.reglesAnon?.[j.demande.regleId]) !== empreinteCorrespondance(j.regleApres)) throw new Error()
      } else {
        const cible = j.cibles.find((c) => c.id === p.id)
        if (!j.definitionConfirmee || !cible || cible.etat !== 'a-faire'
          || empreinteCorrespondance(data) !== empreinteCorrespondance(cible.apres)) throw new Error()
      }
    }
  }
}
