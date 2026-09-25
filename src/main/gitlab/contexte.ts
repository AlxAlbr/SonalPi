import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import { MiroirDistant } from '../distant/miroir'
import type { ResultatTiragePublic } from '../../shared/distant'
import {
  FORMAT_VERSION,
  type CorpusFichier,
  type OuvertureEntretienEdition,
} from '../../shared/format'
import { ClientGitLab } from './client'
import { LecteurGitLab } from './lecture'
import type { ResultatPublicationGitLab } from './publication'
import type { EtatSessionGitLab, SessionGitLab } from './session'

export interface OptionsContexteGitLabLectureSeule {
  id: string
  dirLocal: string
  client: ClientGitLab
  branche: string
  racine?: string
  cheminsRecuperables?: string[]
  creerSession?: (ressource: string, cheminRelatif: string) => SessionGitLab
}

export interface PreparationContexteGitLabLectureSeule {
  contexte: ContexteGitLab
  corpus: CorpusFichier
  inaccessibles?: { chemin: string; raison: string }[]
}

/** Contexte GitLab de préversion, avec services de session réservés au main. */
export class ContexteGitLab {
  private termine = false
  private readonly sessions = new Map<string, {
    session: SessionGitLab
    chemin: string
    protege: boolean
  }>()

  constructor(
    public readonly id: string,
    public readonly store: CorpusStore,
    public readonly miroir: MiroirDistant,
    private readonly creerSession?: (ressource: string, cheminRelatif: string) => SessionGitLab,
  ) {}

  get dirLocal(): string {
    return this.miroir.dirLocal
  }

  async actualiser(): Promise<ResultatTiragePublic> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const tirage = await this.miroir.tirer(
      [...this.sessions.values()]
        .filter(({ protege }) => protege)
        .map(({ chemin }) => chemin),
    )
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

  async ouvrirSession(
    ressource: string,
    cheminRelatif: string,
  ): Promise<EtatSessionGitLab> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const existante = this.sessions.get(ressource)
    if (existante) {
      if (existante.chemin !== cheminRelatif) {
        throw new Error('Chemin GitLab incohérent pour cette session.')
      }
      const etat = await existante.session.ouvrir()
      existante.protege = etat.etat !== 'lecture-seule'
      return etat
    }
    if (!this.creerSession) throw new Error('Session GitLab non configurée pour ce contexte.')
    const session = this.creerSession(ressource, cheminRelatif)
    const entree = { session, chemin: cheminRelatif, protege: true }
    this.sessions.set(ressource, entree)
    try {
      const etat = await session.ouvrir()
      entree.protege = etat.etat !== 'lecture-seule'
      if (!entree.protege) this.sessions.delete(ressource)
      return etat
    } catch (erreur) {
      this.sessions.delete(ressource)
      throw erreur
    }
  }

  /** Identifiant stable d'un entretien dans cette destination. */
  ressourceEntretien(id: string): string {
    return `entretien:${this.id}:${id}`
  }

  /** Ouvre une session d'entretien à partir de son identifiant métier. */
  async ouvrirSessionEntretien(id: string): Promise<EtatSessionGitLab> {
    return this.ouvrirSession(this.ressourceEntretien(id), `entretiens/${id}.json`)
  }

  async ouvrirEntretienPourEdition(id: string): Promise<OuvertureEntretienEdition> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const etat = await this.ouvrirSessionEntretien(id)
    if (etat.etat !== 'edition') {
      const lecture = this.store.lireEntretien(id)
      return lecture.ok
        ? { ...lecture, acces: 'lecture-seule', verrouTenuParAutrui: null }
        : lecture
    }
    this.store.autoriserEcritureEntretien(id)
    try {
      const lecture = this.store.ouvrirEntretienPourEdition(id)
      if (!lecture.ok) {
        this.store.revoquerEcritureEntretien(id)
        await this.session(this.ressourceEntretien(id)).fermer()
        return lecture
      }
      return { ...lecture, acces: 'edition' }
    } catch (erreur) {
      this.store.revoquerEcritureEntretien(id)
      await this.session(this.ressourceEntretien(id)).fermer()
      throw erreur
    }
  }

  async marquerSessionSale(ressource: string): Promise<void> {
    await this.session(ressource).marquerSale()
  }

  async preserverSessionDegrade(ressource: string): Promise<boolean> {
    return this.session(ressource).preserverCandidat()
  }

  async publierSession(ressource: string): Promise<ResultatPublicationGitLab> {
    return this.session(ressource).publier()
  }

  async renouvelerSession(ressource: string): Promise<boolean> {
    return this.session(ressource).renouveler()
  }

  async revaliderSessions(): Promise<void> {
    for (const entree of this.sessions.values()) {
      await entree.session.revalider()
    }
  }

  /** Exécute les publication et renouvellements périodiques de toutes les sessions. */
  async maintenirSessions(): Promise<void> {
    for (const entree of this.sessions.values()) {
      const publication = await entree.session.publierPeriodique()
      if (!publication || publication.statut !== 'confirme') {
        await entree.session.renouvelerSiNecessaire()
      }
    }
  }

  async fermerSession(ressource: string): Promise<boolean> {
    const entree = this.sessions.get(ressource)
    if (!entree) return true
    const resultat = await entree.session.fermer()
    if (resultat.fermee) this.sessions.delete(ressource)
    return resultat.fermee
  }

  async fermerEntretien(id: string): Promise<{ fermee: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    this.store.revoquerEcritureEntretien(id)
    const ressource = this.ressourceEntretien(id)
    const entree = this.sessions.get(ressource)
    if (!entree) return { fermee: true }
    const resultat = await entree.session.fermer()
    if (resultat.fermee) {
      this.sessions.delete(ressource)
      return { fermee: true }
    }
    if (entree.session.etat().etat === 'edition') this.store.autoriserEcritureEntretien(id)
    return {
      fermee: false,
      raison: resultat.raison,
    }
  }

  async publierEntretien(id: string): Promise<{ ok: boolean; raison?: string }> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const ressource = this.ressourceEntretien(id)
    if (!this.sessions.has(ressource)) return { ok: false, raison: 'aucune session' }
    const resultat = await this.session(ressource).publier()
    if (resultat.statut === 'confirme') return { ok: true }
    return {
      ok: false,
      raison: resultat.statut === 'indetermine' ? 'indetermine' : resultat.raison,
    }
  }

  etatSession(ressource: string): EtatSessionGitLab {
    return this.session(ressource).etat()
  }

  async listerDossier(dossier: string): Promise<{ nom: string; dossier: boolean }[]> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    return this.miroir.listerDossier(dossier)
  }

  async fermer(): Promise<void> {
    if (this.termine) return
    for (const [ressource, entree] of this.sessions) {
      const fermeture = await entree.session.fermer()
      if (!fermeture.fermee) {
        throw new Error('Une session GitLab empêche la fermeture du contexte.')
      }
      this.sessions.delete(ressource)
    }
    this.termine = true
  }

  private session(ressource: string): SessionGitLab {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const entree = this.sessions.get(ressource)
    if (!entree) throw new Error('Session GitLab non ouverte dans ce contexte.')
    return entree.session
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
  const tirage = await miroir.tirer(options.cheminsRecuperables ?? [])
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
    contexte: new ContexteGitLab(
      options.id,
      store,
      miroir,
      options.creerSession,
    ),
    corpus,
    inaccessibles: tirage.inaccessibles.length > 0
      ? tirage.inaccessibles
      : undefined,
  }
}
