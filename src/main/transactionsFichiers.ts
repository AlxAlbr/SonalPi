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
import { normaliserOrdreEntretiens } from '../shared/corpus/ordreEntretiens'

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
  readonly corpusIntermediaire?: CorpusFichier
  readonly corpusApres: CorpusFichier
  readonly entretiens: { id: string; avant: EntretienFichier; apres: EntretienFichier }[]
  readonly ordre?: 'entretiens-puis-corpus' | 'corpus-puis-entretiens'
}

export type PlanTransactionFichiers = PlanAjoutEntretien | PlanSuppressionEntretien | PlanRemplacementEntretiens

/** Assemble un plan de retrait à partir d'un retrait métier déjà calculé et
 *  d'un inventaire de fichiers déjà choisi. Un dépôt distant prépare les deux
 *  moitiés séparément : le retrait sur la base publiée, l'inventaire dans le
 *  miroir local. */
export function planSuppressionLocal(
  id: string,
  corpusAvant: CorpusFichier,
  corpusApres: CorpusFichier,
  deplacements: readonly DeplacementTransactionFichiers[],
): PlanSuppressionEntretien {
  return {
    operation: 'suppression',
    id,
    corpusAvant: structuredClone(corpusAvant),
    corpusApres: structuredClone(corpusApres),
    deplacements: deplacements.map((deplacement) => ({ ...deplacement })),
  }
}

interface JournalTransactionFichiers {
  readonly formatVersion: 1 | 2
  readonly plan: PlanTransactionFichiers
}

const NOM_JOURNAL = '.transaction-fichiers.json'

/** Dossier d'archive du miroir. Le dépôt GitLab porte son propre dossier du
 *  même nom : celui-ci ne contient que des fichiers locaux. */
export const DOSSIER_ARCHIVE_LOCAL = 'corbeille'

/** Archive locale d'un fichier retiré, sans jamais écraser.
 *
 *  Le nom est choisi une fois et conservé par le plan qui l'archive : un
 *  redémarrage ne le rejoue pas, et une collision constatée plus tard
 *  suspend l'application au lieu de détruire une archive existante. */
export function choisirDestinationArchiveLocale(
  nomFichier: string,
  suffixe: string,
  existe: (chemin: string) => boolean,
): string {
  const prefere = join(DOSSIER_ARCHIVE_LOCAL, nomFichier)
  if (!existe(prefere)) return prefere
  const alternatif = join(DOSSIER_ARCHIVE_LOCAL, `${nomFichier}.${suffixe}`)
  if (!existe(alternatif)) return alternatif
  throw new Error(
    `Deux archives de « ${nomFichier} » sont déjà prises dans ce corpus. `
    + 'Videz la corbeille locale avant de supprimer cet entretien.',
  )
}

function contenuJson(valeur: unknown): string {
  return JSON.stringify(valeur, null, 2)
}

/** Un déplacement archivé est un couple de chemins relatifs au corpus, jamais
 *  identique : le plan doit rester applicable après un redémarrage. */
function validerDeplacement(valeur: unknown): valeur is DeplacementTransactionFichiers {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return false
  const deplacement = valeur as Partial<DeplacementTransactionFichiers>
  if (typeof deplacement.source !== 'string' || typeof deplacement.destination !== 'string') {
    return false
  }
  if (deplacement.source === deplacement.destination) return false
  return [deplacement.source, deplacement.destination].every((chemin) => {
    if (!chemin || isAbsolute(chemin) || chemin.includes('\0')) return false
    const normalise = normalize(chemin)
    return normalise !== '..' && !normalise.startsWith(`..${sep}`) && !normalise.startsWith('/')
  })
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

function correspondAuCorpus(contenu: string | null, attendu: CorpusFichier): boolean {
  if (contenu === null) return false
  try {
    const courant = normaliserOrdreEntretiens(JSON.parse(contenu) as CorpusFichier)
    const cible = normaliserOrdreEntretiens(structuredClone(attendu))
    return contenuJson(courant) === contenuJson(cible)
  } catch {
    return false
  }
}

/** Écrit un fichier par remplacement atomique et synchronise son contenu avant le renommage. */
function ecrireAtomiquement(fichier: string, contenu: string, mode?: number): void {
  const dossier = dirname(fichier)
  mkdirSync(dossier, { recursive: true })
  const temporaire = `${fichier}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  // Windows exige un descripteur inscriptible pour synchroniser le fichier.
  const descripteur = openSync(temporaire, 'w', mode)
  try {
    writeFileSync(descripteur, contenu, 'utf8')
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
    const apres = contenuJson(plan.corpusApres)
    const courant = existsSync(fichierCorpus) ? readFileSync(fichierCorpus, 'utf8') : null
    const correspondAvant = correspondAuCorpus(courant, plan.corpusAvant)
    const correspondApres = correspondAuCorpus(courant, plan.corpusApres)
    const intermediaire = plan.operation === 'remplacement' ? plan.corpusIntermediaire : undefined
    const correspondIntermediaire = intermediaire !== undefined && correspondAuCorpus(courant, intermediaire)
    if (!correspondAvant && !correspondApres && !correspondIntermediaire) {
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
      const corpusDAbord = plan.ordre === 'corpus-puis-entretiens'
      if (intermediaire) {
        if (corpusDAbord) throw new Error('Un corpus intermédiaire exige les entretiens avant le corpus final.')
        if (correspondApres && fichiers.some((e) => !e.dejaApplique)) {
          throw new Error('Le corpus final précède des entretiens non appliqués. La transaction est incohérente.')
        }
        // Les nouvelles définitions précèdent leurs usages ; la source reste jusqu'au dernier codage.
        if (!correspondIntermediaire && !correspondApres) {
          ecrireAtomiquement(fichierCorpus, contenuJson(intermediaire))
        }
      } else if (corpusDAbord && !correspondApres) {
        ecrireAtomiquement(fichierCorpus, apres)
      }
      for (const e of fichiers) if (!e.dejaApplique) ecrireAtomiquement(e.fichier, contenuJson(e.apres))
      if (!corpusDAbord && !correspondApres) ecrireAtomiquement(fichierCorpus, apres)
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
    const formatVersion = plan.operation === 'remplacement' && plan.corpusIntermediaire ? 2 : 1
    const journal: JournalTransactionFichiers = { formatVersion, plan }
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
    if ((journal.formatVersion !== 1 && journal.formatVersion !== 2) || !journal.plan) {
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
    if (plan.operation === 'suppression' && !plan.deplacements!.every(validerDeplacement)) {
      throw new Error('Le journal de suppression est invalide.')
    }
    if (journal.formatVersion === 2 && (plan.operation !== 'remplacement' || !plan.corpusIntermediaire)) {
      throw new Error('Le journal de remplacement intermédiaire est incomplet.')
    }
    if (plan.operation === 'remplacement' && plan.corpusIntermediaire !== undefined
      && (journal.formatVersion !== 2 || !plan.corpusIntermediaire
        || typeof plan.corpusIntermediaire !== 'object' || Array.isArray(plan.corpusIntermediaire)
        || !plan.corpusIntermediaire.codebook || !plan.corpusIntermediaire.membership
        || plan.ordre === 'corpus-puis-entretiens')) {
      throw new Error('Le journal de remplacement intermédiaire est invalide.')
    }
    if (plan.operation === 'remplacement' && (!Array.isArray(plan.entretiens)
      || (plan.ordre !== undefined && plan.ordre !== 'entretiens-puis-corpus' && plan.ordre !== 'corpus-puis-entretiens')
      || plan.entretiens.some(e => !e || typeof e.id !== 'string' || !/^[^./\\\\][^/\\\\]*$/.test(e.id) || !e.avant || !e.apres)
      || new Set(plan.entretiens.map(e => e.id)).size !== plan.entretiens.length)) {
      throw new Error('Le journal de remplacement est invalide.')
    }
    return journal as JournalTransactionFichiers
  }
}
