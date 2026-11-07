import type { ClientWebDAV } from '../webdav/client'
import {
  decoderCorpusTheme,
  OperationsThemesCorpus,
  type InstantaneOperationTheme,
} from '../operationsThemes'
import type { EntretienFichier } from '../../shared/format'
import { RefusOperationTheme, type DemandeOperationTheme } from '../../shared/corpus/themes'

type LimitesCache = Pick<ConstructorParameters<typeof OperationsThemesCorpus>[0],
  'maintenant' | 'genIdOperation' | 'dureeCacheMs' | 'maxApercus' | 'maxOctetsCache'>

/** Prépare des aperçus depuis le serveur ; les copies du miroir ne servent jamais de repli. */
export class ApercusThemesWebDAV {
  private generation = 0
  private instantane: InstantaneOperationTheme | null = null
  private readonly cache: OperationsThemesCorpus

  constructor(
    private readonly client: ClientWebDAV,
    private readonly adapter: (avant: EntretienFichier) => EntretienFichier,
    limites: LimitesCache = {},
  ) {
    const refuserEcriture = (): never => {
      throw new RefusOperationTheme('La publication WebDAV des opérations sur les thématiques n’est pas encore livrée.')
    }
    this.cache = new OperationsThemesCorpus({
      ...limites,
      lire: () => {
        if (!this.instantane) throw new RefusOperationTheme('Aucun instantané serveur disponible.')
        return this.instantane
      },
      inventairePartiel: true,
      appliquer: refuserEcriture,
      verifierEcriture: refuserEcriture,
      transactionEnAttente: () => false,
      genIdCategorie: refuserEcriture,
    })
  }

  vider(): void {
    this.generation++
    this.cache.vider()
    this.instantane = null
  }

  async analyser(demande: DemandeOperationTheme, operationPrecedente?: string,
    destinationsPersistantes?: Array<{ token: string; id: string }>) {
    if (demande?.type !== 'transfert' && demande?.type !== 'division') {
      throw new RefusOperationTheme('L’aperçu WebDAV ne prend en charge que le transfert et la division.')
    }
    if ((demande.type === 'transfert' && !demande.conserverSource)
      || (demande.type === 'division' && demande.effacerSource)) {
      throw new RefusOperationTheme('WebDAV doit conserver la thématique source.')
    }
    const capture = this.generation
    const requete = structuredClone(demande)
    const instantane = await this.lireInstantane(capture)
    this.verifierGeneration(capture)
    this.instantane = instantane
    try {
      return this.cache.analyser(requete, operationPrecedente, destinationsPersistantes)
    } finally {
      // Les transcriptions ne restent pas en mémoire après préparation du cache d’extraits.
      this.instantane = null
    }
  }

  details(operationId: string, entretienId: string) {
    return this.cache.details(operationId, entretienId)
  }

  consommer(operationId: string, demande: DemandeOperationTheme) {
    return this.cache.consommer(operationId, demande)
  }

  private verifierGeneration(capture: number): void {
    if (capture !== this.generation) {
      throw new RefusOperationTheme('Le contexte distant a changé : recalculez l’aperçu.')
    }
  }

  private async lireFichier(chemin: string): Promise<{ contenu: string; etag: string }> {
    const lecture = await this.client.getTexteAvecEtag(chemin)
    if (!lecture.etag || /^W\//i.test(lecture.etag)) {
      throw new RefusOperationTheme('Le serveur ne fournit pas d’ETag fort pour ce fichier.')
    }
    return { contenu: lecture.contenu, etag: lecture.etag }
  }

  private async lireInstantane(capture: number): Promise<InstantaneOperationTheme> {
    this.verifierGeneration(capture)
    const avant = await this.lireFichier('corpus.crp')
    const corpus = decoderCorpusTheme(avant.contenu)
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    for (const [id, membre] of Object.entries(corpus.membership)) {
      this.verifierGeneration(capture)
      const titre = membre?.titre ?? id
      try {
        if (!id || id === '.' || id === '..' || /[/\\\0]/.test(id)) {
          throw new RefusOperationTheme('Identifiant d’entretien invalide dans le membership.')
        }
        const lecture = await this.lireFichier(`entretiens/${id}.json`)
        this.verifierGeneration(capture)
        const brut = JSON.parse(lecture.contenu) as EntretienFichier
        const data = this.adapter(structuredClone(brut))
        entretiens.push({ id, titre, ok: true, avant: brut, data })
      } catch (erreur) {
        this.verifierGeneration(capture)
        entretiens.push({ id, titre, ok: false, motif: erreur instanceof Error ? erreur.message : String(erreur) })
      }
    }
    this.verifierGeneration(capture)
    const apres = await this.lireFichier('corpus.crp')
    this.verifierGeneration(capture)
    if (avant.etag !== apres.etag || avant.contenu !== apres.contenu) {
      throw new RefusOperationTheme('Le corpus distant a changé pendant l’inventaire : recalculez l’aperçu.')
    }
    return { corpus, entretiens }
  }
}
