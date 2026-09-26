import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import { MiroirDistant } from '../distant/miroir'
import type {
  ObservationCoordinationDistante,
  ResultatObservationVerrous,
} from '../distant/coordination'
import type { EntreeVerrouPublic, ResultatTiragePublic } from '../../shared/distant'
import {
  FORMAT_VERSION,
  type Categorie,
  type CorpusFichier,
  type OuvertureEntretienEdition,
  type PayloadEntretien,
  type RegleAnon,
  type Variable,
  type VerrouTenuParAutrui,
} from '../../shared/format'
import type { PartieBailGitLab } from './bailGitLab'
import { ClientGitLab } from './client'
import { LecteurGitLab, InstantaneLectureGitLab } from './lecture'
import { ObservationBailsGitLab } from './observationBails'
import type { ResultatPublicationGitLab } from './publication'
import type { EtatSessionGitLab, SessionGitLab } from './session'
import type { TransactionsGitLab } from './transactions'

export interface OptionsContexteGitLabLectureSeule {
  id: string
  dirLocal: string
  client: ClientGitLab
  branche: string
  racine?: string
  cheminsRecuperables?: string[]
  creerSession?: (ressource: string, cheminRelatif: string) => SessionGitLab
  creerTransactions?: (store: CorpusStore) => TransactionsGitLab
}

export interface PreparationContexteGitLabLectureSeule {
  contexte: ContexteGitLab
  corpus: CorpusFichier
  inaccessibles?: { chemin: string; raison: string }[]
  /** Badges d'exclusion relevés au même commit que le tirage d'ouverture. */
  verrous: EntreeVerrouPublic[]
  verrousIndisponibles?: boolean
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
    public readonly transactions?: TransactionsGitLab,
    private readonly observation?: ObservationCoordinationDistante,
    private readonly instantane?: InstantaneLectureGitLab,
  ) {}

  get dirLocal(): string {
    return this.miroir.dirLocal
  }

  /** Ressources de bail effectivement tenues par ce poste : leurs baux ne
   *  produisent aucun badge. */
  sessionsTenues(): string[] {
    return [...this.sessions.entries()]
      .filter(([, entree]) => entree.protege)
      .map(([ressource]) => ressource)
  }

  async actualiser(): Promise<ResultatTiragePublic> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    try {
      const tirage = await this.miroir.tirer(
        [...this.sessions.values()]
          .filter(({ protege }) => protege)
          .map(({ chemin }) => chemin),
      )
      const observation = await this.observerVerrous()
      return {
        telecharges: tirage.telecharges,
        corbeille: tirage.corbeille,
        verrous: observation.entrees,
        verrousIndisponibles: observation.indisponible || undefined,
        inaccessibles: tirage.inaccessibles.length > 0
          ? tirage.inaccessibles
          : undefined,
        date: tirage.date,
      }
    } finally {
      // Le tirage suivant résoudra un nouveau commit.
      this.instantane?.oublier()
    }
  }

  /** Badges d'exclusion du cycle courant, sans commit.
   *  Un inventaire de baux raté ne retire aucun contenu déjà tiré : les listes
   *  le signalent, et l'exclusion se vérifie à l'ouverture, par le bail. */
  async observerVerrous(): Promise<ResultatObservationVerrous> {
    if (!this.observation) return { entrees: [], indisponible: false }
    try {
      return await this.observation.observerVerrous()
    } catch {
      return { entrees: [], indisponible: true }
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

  creerEntretienVide(titre: string): Promise<{ id: string; corpus: CorpusFichier }> {
    if (!this.transactions) throw new Error('Ajout GitLab non configuré pour ce contexte.')
    return this.transactions.creerEntretienVide(titre)
  }

  importerEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnon: RegleAnon[],
  ): Promise<{ id: string; corpus: CorpusFichier }> {
    if (!this.transactions) throw new Error('Import GitLab non configuré pour ce contexte.')
    return this.transactions.importerEntretien(
      titre,
      payload,
      codebook,
      variables,
      reglesAnon,
    )
  }

  async ouvrirEntretienPourEdition(id: string): Promise<OuvertureEntretienEdition> {
    if (this.termine) throw new Error('Le contexte distant est fermé.')
    const etat = await this.ouvrirSessionEntretien(id)
    if (etat.etat !== 'edition') {
      const lecture = this.store.lireEntretien(id)
      if (!lecture.ok) return lecture
      return {
        ...lecture,
        acces: 'lecture-seule',
        verrouTenuParAutrui: etat.etat === 'lecture-seule'
          ? nommerDetenteur(etat.tenupar)
          : null,
      }
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

/** Le bail GitLab retient le compte qui tient l'entretien, ni le poste ni
 *  l'instant d'acquisition : les champs inconnus restent vides et l'interface
 *  omet ce qu'elle ne sait pas. Un bail illisible ne nomme personne. */
function nommerDetenteur(tenupar: PartieBailGitLab | null): VerrouTenuParAutrui | null {
  if (!tenupar) return null
  return { userId: tenupar.userId, machineId: '', acquiredAt: '' }
}

/** Prépare une consultation GitLab sans sonde ni mutation du projet. */
export async function preparerContexteGitLabLectureSeule(
  options: OptionsContexteGitLabLectureSeule,
): Promise<PreparationContexteGitLabLectureSeule> {
  const instantane = new InstantaneLectureGitLab(
    options.client,
    options.branche,
    options.racine,
  )
  const miroir = new MiroirDistant(
    options.dirLocal,
    () => instantane.ouvrir(),
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
  const contexte: ContexteGitLab = new ContexteGitLab(
    options.id,
    store,
    miroir,
    options.creerSession,
    options.creerTransactions?.(store),
    new ObservationBailsGitLab({
      instantane,
      branche: options.branche,
      racine: options.racine,
      idsEntretiens: () => Object.keys(store.ouvrir().membership),
      ressource: (id: string): string => contexte.ressourceEntretien(id),
      ressourcesTenues: () => [...contexte.sessionsTenues()],
    }),
    instantane,
  )
  try {
    // Badges relevés au commit du tirage d'ouverture : le premier affichage
    // n'attend pas le cycle périodique suivant.
    const observation = await contexte.observerVerrous()
    return {
      contexte,
      corpus,
      verrous: observation.entrees,
      verrousIndisponibles: observation.indisponible || undefined,
      inaccessibles: tirage.inaccessibles.length > 0
        ? tirage.inaccessibles
        : undefined,
    }
  } finally {
    instantane.oublier()
  }
}
