import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import { MiroirDistant } from '../distant/miroir'
import type { ResultatTiragePublic } from '../../shared/distant'
import {
  FORMAT_VERSION,
  type CorpusFichier,
} from '../../shared/format'
import { ClientGitLab } from './client'
import { LecteurGitLab } from './lecture'

export interface OptionsContexteGitLabLectureSeule {
  id: string
  dirLocal: string
  client: ClientGitLab
  branche: string
  racine?: string
}

export interface PreparationContexteGitLabLectureSeule {
  contexte: ContexteGitLabLectureSeule
  corpus: CorpusFichier
  inaccessibles?: { chemin: string; raison: string }[]
}

/** Contexte GitLab sans écriture serveur, session ni présence. */
export class ContexteGitLabLectureSeule {
  private termine = false

  constructor(
    public readonly id: string,
    public readonly store: CorpusStore,
    public readonly miroir: MiroirDistant,
  ) {}

  get dirLocal(): string {
    return this.miroir.dirLocal
  }

  async actualiser(): Promise<ResultatTiragePublic> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const tirage = await this.miroir.tirer()
    return {
      telecharges: tirage.telecharges,
      corbeille: tirage.corbeille,
      verrous: [],
      inaccessibles: tirage.inaccessibles.length > 0
        ? tirage.inaccessibles
        : undefined,
      date: tirage.date,
    }
  }

  async listerDossier(dossier: string): Promise<{ nom: string; dossier: boolean }[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.miroir.listerDossier(dossier)
  }

  async fermer(): Promise<void> {
    this.termine = true
  }
}

/** Prépare une consultation GitLab sans sonde ni mutation du projet. */
export async function preparerContexteGitLabLectureSeule(
  options: OptionsContexteGitLabLectureSeule,
): Promise<PreparationContexteGitLabLectureSeule> {
  const miroir = new MiroirDistant(
    options.dirLocal,
    () => LecteurGitLab.depuisBranche(
      options.client,
      options.branche,
      options.racine,
    ),
    { fournisseur: 'gitlab', destinationId: options.id },
  )
  const tirage = await miroir.tirer()
  const cheminCorpus = join(options.dirLocal, 'corpus.json')
  if (!existsSync(cheminCorpus)) {
    throw new Error("Le dépôt GitLab ne contient pas de corpus.json.")
  }
  const corpusBrut = JSON.parse(readFileSync(cheminCorpus, 'utf8')) as CorpusFichier
  if (corpusBrut.formatVersion !== FORMAT_VERSION) {
    throw new Error(
      'Ce corpus nécessite une migration explicite avant sa consultation depuis GitLab.',
    )
  }

  const store = new CorpusStore(options.dirLocal)
  store.lectureSeule = true
  const corpus = store.ouvrir()
  return {
    contexte: new ContexteGitLabLectureSeule(options.id, store, miroir),
    corpus,
    inaccessibles: tirage.inaccessibles.length > 0
      ? tirage.inaccessibles
      : undefined,
  }
}
