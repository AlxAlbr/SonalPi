import type { EntretienFichier } from '../../shared/format'
import {
  operationThemeRetireThemes,
  RefusOperationTheme,
  type DemandeOperationTheme,
  type ApercuOperationTheme,
} from '../../shared/corpus/themes'
import { decoderCorpusTheme, OperationsThemesCorpus, type InstantaneOperationTheme } from '../operationsThemes'
import type { ResultatObservationVerrous } from '../distant/coordination'
import { normaliserRacineGitLab } from '../distant/coffre'
import { DepotCommitsGitLabClient } from './bailGitLab'
import { ClientGitLab, ErreurReponseTropVolumineuseGitLab } from './client'
import { LecteurGitLab } from './lecture'

type Limites = Pick<ConstructorParameters<typeof OperationsThemesCorpus>[0],
  'maintenant' | 'genIdOperation' | 'dureeCacheMs' | 'maxApercus' | 'maxOctetsCache'>
interface Options extends Limites {
  client: ClientGitLab
  branche: string
  racine?: string
  adapter: (avant: EntretienFichier) => EntretienFichier
  observer: (ids: string[], lecteurRacine: LecteurGitLab) => Promise<ResultatObservationVerrous>
  sessionsLocales: () => string[]
}

/** Inventorie un commit publié et observe uniquement les entretiens à modifier, sans prendre de bail. */
export class ApercusThemesGitLab {
  private generation = 0
  private instantane: InstantaneOperationTheme | null = null
  private readonly cache: OperationsThemesCorpus
  private readonly depot: DepotCommitsGitLabClient
  private readonly racine: string

  constructor(private readonly options: Options) {
    this.depot = new DepotCommitsGitLabClient(options.client)
    this.racine = normaliserRacineGitLab(options.racine ?? '')
    const refuser = (): never => { throw new RefusOperationTheme('La publication GitLab des opérations sur les thématiques n’est pas encore livrée.') }
    this.cache = new OperationsThemesCorpus({ ...options,
      lire: () => {
        if (!this.instantane) throw new RefusOperationTheme('Aucun instantané GitLab disponible.')
        return this.instantane
      },
      inventairePartiel: true, appliquer: refuser, verifierEcriture: refuser,
      transactionEnAttente: () => false, genIdCategorie: refuser,
    })
  }

  vider(): void {
    this.generation++
    this.instantane = null
    this.cache.vider()
  }

  details(operationId: string, entretienId: string) { return this.cache.details(operationId, entretienId) }

  async analyser(demande: DemandeOperationTheme, precedent?: string,
    destinationsPersistantes?: Array<{ token: string; id: string }>): Promise<ApercuOperationTheme> {
    const capture = this.generation
    const requete = structuredClone(demande)
    const lecteur = await LecteurGitLab.depuisBranche(this.options.client, this.options.branche, this.racine)
    this.verifierGeneration(capture)
    const preparation = await this.preparer(requete, precedent, lecteur, capture, destinationsPersistantes)
    const apercu = preparation.apercu
    const obstacles = [...apercu.obstacles]
    const destructive = operationThemeRetireThemes(requete)
    if (destructive && preparation.membres > 248) obstacles.push({ phase: 'finalisation', motif: 'La suppression de thématiques GitLab est limitée à 248 membres.' })
    if (destructive && preparation.incomplet) obstacles.push({ phase: 'finalisation', motif: 'Tous les membres doivent être disponibles pour retirer les thématiques.' })
    const bloquees = new Set(apercu.obstacles.flatMap((o) => o.entretienId ? [o.entretienId] : []))
    const ids = apercu.parEntretien.filter((e) => e.aModifier && !bloquees.has(e.id)).map((e) => e.id)
    let observation: ResultatObservationVerrous
    try {
      observation = ids.length ? await this.options.observer(ids, new LecteurGitLab(this.options.client, lecteur.commit))
        : { entrees: [], indisponible: false }
      if (!Array.isArray(observation.entrees) || typeof observation.indisponible !== 'boolean') throw new Error('Observation incomplète.')
    } catch { observation = { entrees: [], indisponible: true } }
    this.verifierGeneration(capture)
    const locaux = new Set(this.options.sessionsLocales())
    const entretiens: NonNullable<ApercuOperationTheme['disponibiliteGitLab']>['entretiens'] = ids.map((id) => {
      if (locaux.has(id)) return { id, etat: 'session-locale', motif: 'Fermez la session locale ou récupérable avant cette réaffectation.' }
      if (observation.indisponible) return { id, etat: 'inconnu', motif: 'L’observation des baux est indisponible ou incomplète.' }
      const bail = observation.entrees.find((e) => e.chemin === `entretiens/${id}.json`)
      if (bail && !bail.contenu) return { id, etat: 'inconnu', motif: 'Le marqueur observé ne permet pas de connaître le détenteur.' }
      return bail ? { id, etat: 'tenu-autrui', detenteur: bail.contenu?.userId,
        motif: 'Cet entretien est tenu par un autre poste.' } : { id, etat: 'libre-observe' }
    })
    const aucunLibre = ids.length > 0 && !entretiens.some((e) => e.etat === 'libre-observe')
    if (aucunLibre) obstacles.push({ phase: 'entretiens', motif: 'Aucun entretien à modifier n’est observé libre ; actualisez avant de confirmer.' })
    const finalisationBloquee = obstacles.some((o) => o.phase === 'finalisation')
    return this.cache.completerApercu(apercu.operationId, {
      execution: 'entretiens-sequentiels', instantaneGitLab: { commit: lecteur.commit },
      disponibiliteGitLab: { observeLe: new Date((this.options.maintenant ?? Date.now)()).toISOString(), entretiens },
      obstacles, faisable: apercu.faisable && !finalisationBloquee && !aucunLibre,
      motif: obstacles.find((o) => o.phase === 'finalisation')?.motif ?? obstacles[0]?.motif,
    })
  }

  consommer(operationId: string, demande: DemandeOperationTheme) {
    return this.cache.consommer(operationId, demande)
  }

  private async preparer(demande: DemandeOperationTheme, precedent: string | undefined,
    lecteur: LecteurGitLab, capture: number, destinationsPersistantes?: Array<{ token: string; id: string }>) {
    const lecture = await this.depot.lireFichier(this.chemin('corpus.json'), lecteur.commit)
    this.verifierGeneration(capture)
    if (!lecture) throw new RefusOperationTheme('Le corpus publié est absent de GitLab.')
    const corpus = decoderCorpusTheme(lecture.contenu)
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    for (const [id, membre] of Object.entries(corpus.membership)) {
      this.verifierGeneration(capture)
      const titre = membre?.titre ?? id
      try {
        if (!id || id === '.' || id === '..' || /[/\\\0]/.test(id)) throw new RefusOperationTheme('Identifiant d’entretien invalide dans le membership.')
        const fichier = await this.depot.lireFichier(this.chemin(`entretiens/${id}.json`), lecteur.commit)
        this.verifierGeneration(capture)
        if (!fichier) throw new RefusOperationTheme('L’entretien publié est absent de GitLab.')
        const avant = JSON.parse(fichier.contenu) as EntretienFichier
        entretiens.push({ id, titre, ok: true, avant, data: this.options.adapter(structuredClone(avant)) })
      } catch (e) {
        this.verifierGeneration(capture)
        const motif = e instanceof ErreurReponseTropVolumineuseGitLab
          ? 'L’entretien dépasse la borne individuelle de lecture avec garde GitLab.'
          : e instanceof Error ? e.message : String(e)
        entretiens.push({ id, titre, ok: false, motif })
      }
    }
    this.instantane = { corpus, entretiens }
    try {
      return {
        apercu: this.cache.analyser(demande, precedent, destinationsPersistantes),
        membres: entretiens.length,
        incomplet: entretiens.some((e) => !e.ok),
      }
    } finally {
      // Le cache ne conserve que les empreintes et les extraits courts.
      this.instantane = null
    }
  }

  private chemin(relatif: string): string { return this.racine ? `${this.racine}/${relatif}` : relatif }
  private verifierGeneration(capture: number): void {
    if (capture !== this.generation) throw new RefusOperationTheme('Le contexte GitLab a changé : recalculez l’aperçu.')
  }
}
