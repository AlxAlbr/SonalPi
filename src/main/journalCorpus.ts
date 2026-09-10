import type { Note } from '../shared/format'
import type { EtatNoteJournal } from '../shared/corpus/notes'
import type {
  EntreeJournalCorpusVue,
  ImpactJournalCorpus,
  OrigineJournalCorpus,
  ResultatAnnulationCorpus,
} from '../shared/corpus/journal'

export interface EtatLienJournalCorpus {
  personneRef: string | null
  personneDeliee?: boolean
}

export interface EtatRefusJournalCorpus {
  rapprochementsRefuses?: string[]
}

export type InverseJournalCorpus =
  | {
      type: 'personneRenommer'
      personneId: string
      avant: string
      apres: string
    }
  | {
      type: 'personneLier'
      entretienId: string
      locuteurId: string
      avant: EtatLienJournalCorpus
      apres: EtatLienJournalCorpus
    }
  | {
      type: 'personneRefus'
      entretienId: string
      locuteurId: string
      avant: EtatRefusJournalCorpus
      apres: EtatRefusJournalCorpus
    }
  | {
      type: 'noteModifier'
      entretienId: string
      noteId: string
      avant: Note
      apres: EtatNoteJournal
    }
  | {
      type: 'noteSupprimer'
      entretienId: string
      note: Note
      ordreApres: string[]
    }

export interface EtatInverseJournalCorpus {
  etat: EntreeJournalCorpusVue['etat']
  raison?: string
}

interface EntreeJournalCorpus {
  id: string
  horodatage: string
  libelle: string
  origine: OrigineJournalCorpus
  inverse: InverseJournalCorpus
  impact: ImpactJournalCorpus
}

const LIMITE_ENTREES = 10

/** Conserve les annulations récentes du corpus uniquement pendant la session. */
export class JournalCorpus {
  private entrees: EntreeJournalCorpus[] = []

  constructor(
    private readonly maintenant: () => Date = () => new Date(),
    private readonly creerId: () => string = () => `journal-${Math.random().toString(36).slice(2, 10)}`,
  ) {}

  enregistrer(
    libelle: string,
    origine: OrigineJournalCorpus,
    inverse: InverseJournalCorpus,
    impact: ImpactJournalCorpus,
  ): string {
    const id = this.creerId()
    this.entrees.unshift({
      id,
      horodatage: this.maintenant().toISOString(),
      libelle,
      origine,
      inverse,
      impact,
    })
    this.entrees = this.entrees.slice(0, LIMITE_ENTREES)
    return id
  }

  lister(evaluer: (inverse: InverseJournalCorpus) => EtatInverseJournalCorpus): EntreeJournalCorpusVue[] {
    return this.entrees.map((entree) => {
      let etat: EtatInverseJournalCorpus
      try {
        etat = evaluer(entree.inverse)
      } catch (erreur) {
        etat = {
          etat: 'bloquee',
          raison: erreur instanceof Error ? erreur.message : String(erreur),
        }
      }
      return {
        id: entree.id,
        horodatage: entree.horodatage,
        libelle: entree.libelle,
        origine: entree.origine,
        etat: etat.etat,
        ...(etat.raison ? { raison: etat.raison } : {}),
      }
    })
  }

  annuler(
    id: string,
    evaluer: (inverse: InverseJournalCorpus) => EtatInverseJournalCorpus,
    appliquer: (inverse: InverseJournalCorpus, impact: ImpactJournalCorpus) => ResultatAnnulationCorpus,
  ): ResultatAnnulationCorpus {
    const index = this.entrees.findIndex((entree) => entree.id === id)
    if (index < 0) return { ok: false, raison: 'Cette action n’est plus dans le Journal.', temporaire: false }
    const entree = this.entrees[index]
    let etat: EtatInverseJournalCorpus
    try {
      etat = evaluer(entree.inverse)
    } catch (erreur) {
      return {
        ok: false,
        raison: erreur instanceof Error ? erreur.message : String(erreur),
        temporaire: true,
      }
    }
    if (etat.etat !== 'annulable') {
      return {
        ok: false,
        raison: etat.raison ?? 'Cette action ne peut plus être annulée.',
        temporaire: etat.etat === 'bloquee',
      }
    }
    try {
      const resultat = appliquer(entree.inverse, entree.impact)
      if (resultat.ok) this.entrees.splice(index, 1)
      return resultat
    } catch (erreur) {
      return {
        ok: false,
        raison: erreur instanceof Error ? erreur.message : String(erreur),
        temporaire: true,
      }
    }
  }
}
