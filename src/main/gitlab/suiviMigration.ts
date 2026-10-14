import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BilanMigrationGitLab, SuiviMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import type { ReferenceMediaDistant } from '../../shared/format'
import type { IdentiteBailGitLab } from './bailGitLab'
import { MAX_ACTIONS_PUBLICATION } from './limitesPublication'

export interface DocumentMigrationGitLab {
  chemin: string
  sha256: string
  blob: string
  octets: number
}

export interface EtatMigrationGitLab {
  version: 1
  operationId: string
  destinationId: string
  bilan: BilanMigrationGitLab
  branche: string
  identite: IdentiteBailGitLab
  phase: SuiviMigrationGitLab['phase']
  initial: Record<string, string>
  initialisationConfirmee: boolean
  mediasConfirmes: ReferenceMediaDistant[]
  documents: DocumentMigrationGitLab[]
  lots: number[][]
  prochainLot: number
  intention?: { operationId: string; lot: number }
  generationBail?: string
}

export const operationMigrationSaine = (id: string) => /^migration-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
const SHA256 = /^[a-f0-9]{64}$/
const SHA1 = /^[a-f0-9]{40}$/
const cheminSain = (chemin: string) => typeof chemin === 'string' && !!chemin && !/^[\/\\]|[\\\u0000-\u001f]/.test(chemin) && !chemin.split('/').some((p) => !p || p === '.' || p === '..')

export const empreinteBlobMigration = (contenu: string) => createHash('sha1').update(`blob ${Buffer.byteLength(contenu)}\0`).update(contenu).digest('hex')

/** Un seul suivi de migration ; les intentions de commits utilisent le journal de publication existant. */
export class SuiviDurableMigrationGitLab {
  readonly fichier: string
  constructor(readonly dossier: string) { this.fichier = join(dossier, 'migration.json') }

  lire(): EtatMigrationGitLab | null {
    if (!existsSync(this.fichier)) return null
    try {
      if (statSync(this.fichier).size > 128 * 1024 * 1024) throw new Error()
      const etat = JSON.parse(readFileSync(this.fichier, 'utf8')) as EtatMigrationGitLab
      this.valider(etat)
      return etat
    } catch {
      throw new Error('Le suivi de migration est illisible ou incomplet. Aucun envoi autorisé.')
    }
  }

  ecrire(etat: EtatMigrationGitLab): void {
    this.valider(etat)
    ecrireDurableMigration(this.fichier, JSON.stringify(etat))
  }

  lireContenu(document: DocumentMigrationGitLab): string {
    if (!SHA256.test(document.sha256)) throw new Error('Document de migration invalide.')
    const fichier = join(this.dossier, 'contenus', `${document.sha256}.bin`)
    if (statSync(fichier).size !== document.octets) throw new Error('La préparation locale a changé.')
    const contenu = readFileSync(fichier, 'utf8')
    if (createHash('sha256').update(contenu).digest('hex') !== document.sha256 || empreinteBlobMigration(contenu) !== document.blob) {
      throw new Error('La préparation locale a changé. Aucun envoi autorisé.')
    }
    return contenu
  }

  conserverContenu(chemin: string, contenu: string): DocumentMigrationGitLab {
    const sha256 = createHash('sha256').update(contenu).digest('hex')
    const document = { chemin, sha256, blob: empreinteBlobMigration(contenu), octets: Buffer.byteLength(contenu) }
    const fichier = join(this.dossier, 'contenus', `${sha256}.bin`)
    if (!existsSync(fichier)) ecrireDurableMigration(fichier, contenu)
    this.lireContenu(document)
    return document
  }

  private valider(e: EtatMigrationGitLab): void {
    if (!e || e.version !== 1 || !operationMigrationSaine(e.operationId) || !e.destinationId ||
      !e.bilan || e.operationId !== `migration-${e.bilan.bilanId}` || !SHA1.test(e.bilan.commitSource) ||
      !Number.isSafeInteger(e.bilan.source?.projetId) || e.bilan.source.projetId <= 0 ||
      !Number.isSafeInteger(e.bilan.cible?.projetId) || e.bilan.cible.projetId <= 0 ||
      (e.bilan.source.projetId === e.bilan.cible.projetId && e.bilan.source.urlInstance === e.bilan.cible.urlInstance) ||
      e.branche !== (e.bilan.cible.branche ?? 'main') ||
      !e.branche || typeof e.initialisationConfirmee !== 'boolean' || !e.identite?.machineId || !e.identite.sessionId || !e.identite.userId || e.identite.userId !== e.bilan.cible.utilisateur ||
      !['copie', 'publication', 'ouverture', 'terminee'].includes(e.phase) ||
      !e.initial || typeof e.initial !== 'object' || Object.entries(e.initial).some(([p, b]) => !cheminSain(p) || !SHA1.test(b)) ||
      !Array.isArray(e.documents) || !Array.isArray(e.lots) || !Array.isArray(e.mediasConfirmes) ||
      !Number.isSafeInteger(e.prochainLot) || e.prochainLot < 0 || e.prochainLot > e.lots.length ||
      e.mediasConfirmes.length > e.bilan.medias.length ||
      (e.generationBail !== undefined && !/^[a-f0-9-]{36}$/.test(e.generationBail))) throw new Error('Suivi de migration invalide.')
    if (e.documents.some((d) => !cheminSain(d.chemin) || !SHA256.test(d.sha256) || !SHA1.test(d.blob) || !Number.isSafeInteger(d.octets) || d.octets < 0) ||
      new Set(e.documents.map((d) => d.chemin)).size !== e.documents.length) throw new Error('Documents de migration invalides.')
    const supplement = e.bilan.destinationMedia === 'depot' && e.bilan.medias.length ? e.bilan.medias.length + 1 : 0
    if (e.documents.length !== e.bilan.entretiens.length + supplement + 1 || e.documents.at(-1)?.chemin !== 'corpus.json' ||
      e.documents.filter((d) => /^entretiens\/[^/]+\.json$/.test(d.chemin)).length !== e.bilan.entretiens.length) {
      throw new Error('Correspondance des documents incomplète.')
    }
    const indices = e.lots.flat()
    if (indices.length !== e.documents.length || indices.some((i, index) => i !== index) || e.lots.some((lot) => lot.length === 0 || lot.length >= MAX_ACTIONS_PUBLICATION)) throw new Error('Publications de migration invalides.')
    const fournisseur = e.bilan.destinationMedia === 'depot' ? 'gitlab' : 'webdav'
    if (e.mediasConfirmes.some((r, i) => r.chemin !== e.bilan.medias[i].cheminDestination || r.fournisseur !== fournisseur) ||
      (e.phase !== 'copie' && e.mediasConfirmes.length !== e.bilan.medias.length) ||
      (['ouverture', 'terminee'].includes(e.phase) && e.prochainLot !== e.lots.length) ||
      (e.intention && (e.intention.lot !== e.prochainLot || e.intention.lot >= e.lots.length || !new RegExp(`^${e.operationId}-pub-[a-f0-9-]{36}$`).test(e.intention.operationId)))) throw new Error('Progression de migration incohérente.')
  }
}

export function ecrireDurableMigration(fichier: string, contenu: string): void {
  mkdirSync(dirname(fichier), { recursive: true, mode: 0o700 })
  const temporaire = `${fichier}.${randomUUID()}.tmp`
  const fd = openSync(temporaire, 'wx', 0o600)
  try { writeFileSync(fd, contenu, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temporaire, fichier)
  try {
    const parent = openSync(dirname(fichier), 'r')
    try { fsyncSync(parent) } finally { closeSync(parent) }
  } catch {
    // Certains systèmes refusent la synchronisation d'un dossier ; le fichier reste protégé.
  }
}
