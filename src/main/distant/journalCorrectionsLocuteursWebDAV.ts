import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validerCorpusNatif, validerEntretienNatif } from '../../shared/natif/validation'
import { membresLocuteursRegle } from '../../shared/natif/lectureCas'
import type { IdentiteCorrectionSession } from './sessionCorrectionLocuteurs'
import { validerOperationNommageLocuteurs, type OperationNommageLocuteurs, validerCommandeCorrectionLocuteurs, type CommandeCorrectionLocuteurs } from '../../shared/corpus/contratsLocuteurs'

export const MAX_ENTRETIENS_CORRECTION_WEBDAV = 100
const MAX_OCTETS_JOURNAL = 128 * 1024 * 1024

export interface FichierCorrectionLocuteurs {
  chemin: string
  avant: string
  apres: string
}

export interface JournalCorrectionLocuteursWebDAV {
  version: 1
  destination: string
  operationId: string
  commande: CommandeCorrectionLocuteurs | OperationNommageLocuteurs
  sessionLocale?: IdentiteCorrectionSession
  locuteurId: string
  corpusAvant: string
  corpusApres: string
  sources: { id: string; avant: string; apres: string }[]
  etapes: FichierCorrectionLocuteurs[]
  position: number
  envoi?: number
  termine: boolean
  abandonne?: boolean
  verrouCorpus?: { contenu: string; etag: string }
}

export function idSourceLocuteursValide(id: unknown): id is string {
  return typeof id === 'string' && !!id && id !== '.' && id !== '..' && !/[/\\\0]/.test(id)
}

/** Conserve les candidats avant leur publication, dans un fichier privé de la destination. */
export class JournalCorrectionsLocuteursWebDAV {
  private readonly fichier: string
  constructor(dir: string, private readonly destination: string) {
    this.fichier = join(dir, '.corrections-locuteurs-webdav.json')
  }

  lire(): JournalCorrectionLocuteursWebDAV | null {
    if (!existsSync(this.fichier)) return null
    try {
      if (statSync(this.fichier).size > MAX_OCTETS_JOURNAL) throw new Error('Suivi trop volumineux')
      return this.valider(JSON.parse(readFileSync(this.fichier, 'utf8')))
    }
    catch { throw new Error('Le suivi des corrections des locuteurs est illisible ou incompatible. Aucune publication n’est autorisée ; conservez ce dossier pour l’assistance.') }
  }

  ecrire(journal: JournalCorrectionLocuteursWebDAV): void {
    this.valider(journal)
    const temporaire = `${this.fichier}.tmp`, contenu = JSON.stringify(journal)
    if (Buffer.byteLength(contenu) > MAX_OCTETS_JOURNAL) throw new Error('Cette correction est trop volumineuse pour être conservée et reprise en sécurité.')
    writeFileSync(temporaire, contenu, { encoding: 'utf8', mode: 0o600, flush: true })
    chmodSync(temporaire, 0o600); renameSync(temporaire, this.fichier)
  }

  private valider(v: unknown): JournalCorrectionLocuteursWebDAV {
    if (!v || typeof v !== 'object') throw new Error('Suivi invalide')
    const j = v as JournalCorrectionLocuteursWebDAV
    if (j.version !== 1 || j.destination !== this.destination || !idSourceLocuteursValide(j.operationId)
      || typeof j.locuteurId !== 'string' || typeof j.termine !== 'boolean'
      || (j.abandonne !== undefined && typeof j.abandonne !== 'boolean') || (j.abandonne && j.envoi !== undefined)
      || !Number.isSafeInteger(j.position) || !Array.isArray(j.etapes) || j.position < 0 || j.position > j.etapes.length
      || (j.envoi !== undefined && (j.envoi !== j.position || j.envoi >= j.etapes.length))
      || (j.termine && (j.envoi !== undefined || j.position !== j.etapes.length))
      || typeof j.corpusAvant !== 'string' || typeof j.corpusApres !== 'string' || !Array.isArray(j.sources)
      || j.sources.length > MAX_ENTRETIENS_CORRECTION_WEBDAV || j.etapes.length > j.sources.length + 2) throw new Error('Suivi invalide')
    if (j.verrouCorpus !== undefined) {
      const p = j.verrouCorpus
      if (!p || typeof p !== 'object' || typeof p.contenu !== 'string' || Buffer.byteLength(p.contenu) > 16 * 1024
        || typeof p.etag !== 'string' || !p.etag || /^W\//i.test(p.etag) || /["\s*]/.test(p.etag) || j.termine || j.abandonne) throw new Error('Protection invalide')
      const identite: unknown = JSON.parse(p.contenu)
      if (!identite || typeof identite !== 'object' || !('sessionId' in identite) || typeof identite.sessionId !== 'string' || !identite.sessionId
        || !('userId' in identite) || typeof identite.userId !== 'string' || !identite.userId) throw new Error('Protection invalide')
    }
    if (j.commande?.type === 'identifierAuNommage' || j.commande?.type === 'rapprocherAuNommage') {
      validerOperationNommageLocuteurs(j.commande)
      if (!j.sessionLocale || j.sessionLocale.entretienId !== j.commande.demande.entretienId) throw new Error('Session absente')
    } else validerCommandeCorrectionLocuteurs(j.commande)
    const avant: unknown = JSON.parse(j.corpusAvant), apres: unknown = JSON.parse(j.corpusApres)
    validerCorpusNatif(avant); validerCorpusNatif(apres)
    const membres = Object.keys(avant.membership).sort(), recus = j.sources.map((s) => s.id).sort()
    const ids = j.commande.type === 'identifierAuNommage' ? [j.commande.demande.entretienId] : membres
    if (JSON.stringify(membres) !== JSON.stringify(Object.keys(apres.membership).sort()) || JSON.stringify(ids) !== JSON.stringify(recus) || ids.some((id) => !membres.includes(id))
      || new Set(recus).size !== recus.length || !recus.every(idSourceLocuteursValide)) throw new Error('Sources invalides')
    if (j.sessionLocale && (!idSourceLocuteursValide(j.sessionLocale.entretienId) || !ids.includes(j.sessionLocale.entretienId)
      || ![j.sessionLocale.userId, j.sessionLocale.machineId, j.sessionLocale.sessionId, j.sessionLocale.traceLocale].every((v) => typeof v === 'string' && !!v.trim()))) throw new Error('Session invalide')
    const retires = new Set(Object.keys(avant.locuteurs).filter((id) => !Object.hasOwn(apres.locuteurs, id)))
    if (Object.values(apres.cas ?? {}).some((cas) => cas.regles.flatMap(membresLocuteursRegle).some((m) => retires.has(m.locuteurId)))) throw new Error('Un cas référence une identité retirée')
    const chemins = new Set(['corpus.crp', ...ids.map((id) => `entretiens/${id}.json`)])
    const courants = new Map<string, string>([['corpus.crp', j.corpusAvant]])
    for (const source of j.sources) {
      if (typeof source.avant !== 'string' || typeof source.apres !== 'string') throw new Error('Source invalide')
      validerEntretienNatif(JSON.parse(source.avant))
      const final: unknown = JSON.parse(source.apres); validerEntretienNatif(final)
      if (final.participations.some((p) => (p.locuteurRef && retires.has(p.locuteurRef)) || p.rapprochementsRefuses?.some((r) => r.type === 'locuteur' && retires.has(r.locuteurId)))) throw new Error('Une voix référence une identité retirée')
      courants.set(`entretiens/${source.id}.json`, source.avant)
    }
    let corpusCourant = avant
    for (const [index, etape] of j.etapes.entries()) {
      if (!etape || !chemins.has(etape.chemin) || typeof etape.avant !== 'string' || typeof etape.apres !== 'string'
        || courants.get(etape.chemin) !== etape.avant) throw new Error('Étape invalide')
      if (etape.chemin === 'corpus.crp') {
        const corpus: unknown = JSON.parse(etape.apres); validerCorpusNatif(corpus)
        if (JSON.stringify(Object.keys(corpus.membership).sort()) !== JSON.stringify(membres)) throw new Error('Membership invalide')
        if (j.etapes.slice(index + 1).some((e) => e.chemin !== 'corpus.crp')
          && Object.keys(avant.locuteurs).some((id) => !Object.hasOwn(corpus.locuteurs, id))) throw new Error('Retrait prématuré d’une identité')
        corpusCourant = corpus
      } else {
        const document: unknown = JSON.parse(etape.apres), precedent: unknown = JSON.parse(etape.avant)
        validerEntretienNatif(document); validerEntretienNatif(precedent)
        const references = new Map(precedent.participations.map((p) => [p.id, p.locuteurRef]))
        if (document.participations.some((p) => p.locuteurRef && p.locuteurRef !== references.get(p.id)
          && !Object.hasOwn(corpusCourant.locuteurs, p.locuteurRef))) throw new Error('Définition absente avant son association')
      }
      courants.set(etape.chemin, etape.apres)
    }
    if (courants.get('corpus.crp') !== j.corpusApres || j.sources.some((s) => courants.get(`entretiens/${s.id}.json`) !== s.apres)) throw new Error('Résultat incohérent')
    return j
  }
}
