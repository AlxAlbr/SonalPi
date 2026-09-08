import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../shared/format'

export interface PlanAjoutEntretien {
  readonly operation: 'ajout'
  readonly id: string
  readonly corpusAvant: CorpusFichier
  readonly corpusApres: CorpusFichier
  readonly entretien: EntretienFichier
}

export interface DeplacementTransactionFichiers {
  readonly source: string
  readonly destination: string
}

export interface PlanSuppressionEntretien {
  readonly operation: 'suppression'
  readonly id: string
  readonly corpusAvant: CorpusFichier
  readonly corpusApres: CorpusFichier
  readonly deplacements: DeplacementTransactionFichiers[]
}

export interface PlanRemplacementEntretiens {
  readonly operation: 'remplacement'
  readonly id: string
  readonly corpusAvant: CorpusFichier
  readonly corpusApres: CorpusFichier
  readonly entretiens: { id: string; avant: EntretienFichier; apres: EntretienFichier }[]
}

export type PlanTransactionFichiers = PlanAjoutEntretien | PlanSuppressionEntretien | PlanRemplacementEntretiens

interface JournalTransactionFichiers {
  readonly formatVersion: 1
  readonly plan: PlanTransactionFichiers
}

const NOM_JOURNAL = '.transaction-fichiers.json'

function contenuJson(valeur: unknown): string {
  return JSON.stringify(valeur, null, 2)
}

function correspondAuJson(contenu: string | null, attendu: string): boolean {
  if (contenu === null) return false
  if (contenu === attendu) return true
  try {
    return contenuJson(JSON.parse(contenu)) === attendu
  } catch {
    return false
  }
}

/** Écrit un fichier par remplacement atomique et synchronise son contenu avant le renommage. */
function ecrireAtomiquement(fichier: string, contenu: string, mode?: number): void {
  const dossier = dirname(fichier)
  mkdirSync(dossier, { recursive: true })
  const temporaire = `${fichier}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  writeFileSync(temporaire, contenu, mode === undefined ? {} : { mode })
  const descripteur = openSync(temporaire, 'r')
  try {
    fsyncSync(descripteur)
  } finally {
    closeSync(descripteur)
  }
  renameSync(temporaire, fichier)
  synchroniserDossier(dossier)
}

function synchroniserDossier(dossier: string): void {
  let descripteur: number | null = null
  try {
    descripteur = openSync(dossier, 'r')
    fsyncSync(descripteur)
  } catch {
    // Certains systèmes ne permettent pas de synchroniser un descripteur de dossier.
  } finally {
    if (descripteur !== null) closeSync(descripteur)
  }
}

/** Coordonne les mutations locales qui touchent `corpus.json` et les entretiens.
 *  Le journal contient l'intention complète et permet de terminer l'opération après un arrêt. */
export class TransactionsFichiersCorpus {
  private readonly journal: string
  private enCours = false

  constructor(private readonly dir: string) {
    this.journal = join(dir, NOM_JOURNAL)
  }

  journalPresent(): boolean {
    return existsSync(this.journal)
  }

  /** Termine une transaction interrompue. Aucun état inconnu n'est écrasé. */
  reprendre(): boolean {
    if (!existsSync(this.journal)) return false
    const journal = this.lireJournal()
    this.appliquer(journal.plan)
    return true
  }

  executer(plan: PlanTransactionFichiers): void {
    if (this.enCours) throw new Error('Une transaction de fichiers est déjà en cours.')
    this.enCours = true
    try {
      if (existsSync(this.journal)) this.reprendre()
      this.ecrireJournal(plan)
      this.appliquer(plan)
    } finally {
      this.enCours = false
    }
  }

  private appliquer(plan: PlanTransactionFichiers): void {
    const fichierCorpus = join(this.dir, 'corpus.json')
    const avant = contenuJson(plan.corpusAvant)
    const apres = contenuJson(plan.corpusApres)
    const courant = existsSync(fichierCorpus) ? readFileSync(fichierCorpus, 'utf8') : null
    const correspondAvant = correspondAuJson(courant, avant)
    const correspondApres = correspondAuJson(courant, apres)
    if (!correspondAvant && !correspondApres) {
      throw new Error(
        `La transaction de fichiers « ${plan.id} » ne peut pas être reprise : corpus.json a changé.`,
      )
    }
    if (plan.operation === 'remplacement') {
      const fichiers = plan.entretiens.map((e) => {
        if (!e.id || e.id === '.' || e.id === '..' || /[/\\\\]/.test(e.id)) throw new Error('Identifiant d’entretien transactionnel invalide.')
        const fichier = this.cheminDansCorpus(`entretiens/${e.id}.json`)
        const contenu = existsSync(fichier) ? readFileSync(fichier, 'utf8') : null
        const dejaApplique = correspondAuJson(contenu, contenuJson(e.apres))
        if (!dejaApplique && !correspondAuJson(contenu, contenuJson(e.avant))) {
          throw new Error(`L'entretien « ${e.id} » a changé pendant la transaction. Aucun état inconnu ne sera écrasé.`)
        }
        return { fichier, dejaApplique, apres: e.apres }
      })
      // Les définitions absorbées restent présentes jusqu'au remplacement de tous les liens.
      for (const e of fichiers) if (!e.dejaApplique) ecrireAtomiquement(e.fichier, contenuJson(e.apres))
      if (!correspondApres) ecrireAtomiquement(fichierCorpus, apres)
    } else if (plan.operation === 'ajout') {
      const fichierEntretien = join(this.dir, 'entretiens', `${plan.id}.json`)
      const contenuEntretien = contenuJson(plan.entretien)
      if (existsSync(fichierEntretien)) {
        if (!correspondAuJson(readFileSync(fichierEntretien, 'utf8'), contenuEntretien)) {
          throw new Error(`L'entretien « ${plan.id} » a changé pendant la transaction.`)
        }
      } else {
        ecrireAtomiquement(fichierEntretien, contenuEntretien)
      }
      if (!correspondApres) ecrireAtomiquement(fichierCorpus, apres)
    } else {
      // Le retrait du membership est le commit logique. Les fichiers restent récupérables.
      if (!correspondApres) ecrireAtomiquement(fichierCorpus, apres)
      for (const deplacement of plan.deplacements) this.deplacer(deplacement)
    }

    if (existsSync(this.journal)) {
      unlinkSync(this.journal)
      synchroniserDossier(this.dir)
    }
  }

  private deplacer(deplacement: DeplacementTransactionFichiers): void {
    const source = this.cheminDansCorpus(deplacement.source)
    const destination = this.cheminDansCorpus(deplacement.destination)
    const sourcePresente = existsSync(source)
    const destinationPresente = existsSync(destination)
    if (!sourcePresente && destinationPresente) return
    if (!sourcePresente || destinationPresente) {
      throw new Error(`Déplacement transactionnel ambigu : ${deplacement.source}.`)
    }
    mkdirSync(dirname(destination), { recursive: true })
    renameSync(source, destination)
    synchroniserDossier(dirname(source))
    synchroniserDossier(dirname(destination))
  }

  private cheminDansCorpus(cheminRelatif: string): string {
    if (!cheminRelatif || isAbsolute(cheminRelatif)) {
      throw new Error('Chemin transactionnel invalide.')
    }
    const normalise = normalize(cheminRelatif)
    if (normalise === '..' || normalise.startsWith(`..${sep}`)) {
      throw new Error('Chemin transactionnel hors du corpus.')
    }
    const absolu = join(this.dir, normalise)
    const retour = relative(this.dir, absolu)
    if (retour === '..' || retour.startsWith(`..${sep}`) || isAbsolute(retour)) {
      throw new Error('Chemin transactionnel hors du corpus.')
    }
    return absolu
  }

  private ecrireJournal(plan: PlanTransactionFichiers): void {
    const journal: JournalTransactionFichiers = { formatVersion: 1, plan }
    ecrireAtomiquement(this.journal, contenuJson(journal), 0o600)
  }

  private lireJournal(): JournalTransactionFichiers {
    let valeur: unknown
    try {
      valeur = JSON.parse(readFileSync(this.journal, 'utf8'))
    } catch {
      throw new Error('Le journal de transaction multi-fichiers est illisible.')
    }
    if (!valeur || typeof valeur !== 'object') {
      throw new Error('Le journal de transaction multi-fichiers est invalide.')
    }
    const journal = valeur as Partial<JournalTransactionFichiers>
    if (journal.formatVersion !== 1 || !journal.plan) {
      throw new Error('Version inconnue du journal de transaction multi-fichiers.')
    }
    const plan = journal.plan as Partial<PlanTransactionFichiers>
    if (
      (plan.operation !== 'ajout' && plan.operation !== 'suppression' && plan.operation !== 'remplacement')
      || typeof plan.id !== 'string'
      || !plan.id
      || plan.id === '.'
      || plan.id === '..'
      || plan.id.includes('/')
      || plan.id.includes('\\')
      || !plan.corpusAvant
      || !plan.corpusApres
    ) {
      throw new Error('Le journal de transaction multi-fichiers est invalide.')
    }
    if (plan.operation === 'ajout' && !plan.entretien) {
      throw new Error('Le journal de création est incomplet.')
    }
    if (plan.operation === 'suppression' && !Array.isArray(plan.deplacements)) {
      throw new Error('Le journal de suppression est incomplet.')
    }
    if (plan.operation === 'remplacement' && (!Array.isArray(plan.entretiens)
      || plan.entretiens.some(e => !e || typeof e.id !== 'string' || !/^[^./\\\\][^/\\\\]*$/.test(e.id) || !e.avant || !e.apres)
      || new Set(plan.entretiens.map(e => e.id)).size !== plan.entretiens.length)) {
      throw new Error('Le journal de remplacement est invalide.')
    }
    return journal as JournalTransactionFichiers
  }
}
