import { randomUUID } from 'node:crypto'
import { ErreurHttp, type ClientWebDAV } from '../webdav/client'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import type { IdentiteSession } from './sessions'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type RegleAnon } from '../../shared/format'
import { verifierBarriereDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { verifierChoixPseudosAnon } from '../../shared/corpus/choixPseudosAnon'
import { etagImportWebDAVFort } from './journalCorrespondancesWebDAV'
import { JournalGardePseudosWebDAV, type EnvoiGardePseudosWebDAV } from './journalGardePseudosWebDAV'
import { empreinteCorrespondance } from '../tablesCorrespondance'

export class RefusAvantEnvoiPseudos extends Error {}

const cheminCorpus = 'verrous/corpus.lock.json'
const droitsIncertains = new WeakSet<ProviderPutConditionnel>()

/** Garde la définition jusqu’à une issue connue du PUT, même si l’entretien est déjà verrouillé. */
export class GardePseudosWebDAV {
  private readonly journal: JournalGardePseudosWebDAV
  private readonly destination: string
  private retenu?: { provider: ProviderPutConditionnel; envoi: EnvoiGardePseudosWebDAV }
  private enCours = false
  constructor(private readonly client: ClientWebDAV, private readonly identite: () => IdentiteSession, dirLocal: string,
    private readonly surConfirmation?: (chemin: string, contenu: string, etag: string) => void) {
    this.destination = empreinteCorrespondance(client.config.baseUrl.replace(/\/+$/, ''))
    this.journal = new JournalGardePseudosWebDAV(dirLocal, this.destination)
  }
  verrouIncertain(provider: ProviderPutConditionnel) { return droitsIncertains.has(provider) }
  lireEnvoi() { return this.journal.lire() }
  exigerDisponible() {
    if (this.journal.lire()) throw new Error('Une publication d’entretien WebDAV reste indéterminée. Actualisez le corpus pour relire son issue avant toute nouvelle mutation ; aucun rejeu ni forçage de verrou.')
  }
  /** Reconnaît seulement l’image acceptée ; l’original ne prouve jamais un refus. */
  async reconcilier(): Promise<void> {
    const j = this.journal.lire()
    if (!j) return
    if (this.enCours) throw new Error('Une publication d’entretien WebDAV est en cours. Attendez son issue.')
    if (this.retenu && JSON.stringify(this.retenu.envoi) !== JSON.stringify(j)) throw new Error('L’intention de publication a changé. Aucun rejeu autorisé.')
    const provider = this.retenu?.provider ?? this.provider()
    if (!this.retenu) {
      if (!(await provider.acquerir(cheminCorpus)).ok) throw new Error('Le verrou corpus d’une publication incertaine reste tenu. Aucun forçage autorisé.')
      this.retenu = { provider, envoi: j }
      droitsIncertains.add(provider)
    }
    this.enCours = true
    try {
      if (!(await provider.battre(cheminCorpus)).ok) throw new Error('Le droit de la publication incertaine a été perdu.')
      const source = await this.client.getTexteAvecEtag(j.chemin)
      if (!etagImportWebDAVFort(source.etag) || source.contenu !== j.contenu) throw new Error('La publication reste indéterminée. Aucun rejeu ni libération automatique autorisé.')
      this.surConfirmation?.(j.chemin, j.contenu, source.etag)
      this.journal.effacer()
      droitsIncertains.delete(provider)
      this.retenu = undefined
      await provider.liberer(cheminCorpus)
    } finally { this.enCours = false }
  }
  private provider() {
    const identite = { ...this.identite(), sessionId: `garde-${randomUUID()}` }
    return new ProviderPutConditionnel(this.client, () => identite)
  }
  async publier<T>(contenu: string, contenuAvant: string, envoi: (garantir: () => void) => Promise<T>, chemin: string): Promise<T> {
    await this.reconcilier()
    const provider = this.provider()
    if (!(await provider.acquerir(cheminCorpus)).ok) throw new Error('Les définitions sont temporairement verrouillées. La copie locale reste à publier.')
    try { return await this.publierSousVerrou(contenu, contenuAvant, envoi, provider, chemin) }
    finally { if (!this.verrouIncertain(provider)) await provider.liberer(cheminCorpus).catch(() => {}) }
  }
  /** Réutilise uniquement le provider déjà acquis par une transaction main. */
  async publierSousVerrou<T>(contenu: string, contenuAvant: string, envoi: (garantir: () => void) => Promise<T>, provider: ProviderPutConditionnel,
    chemin: string, nouvellesRegles: Record<string, RegleAnon> = {}): Promise<T> {
    this.exigerDisponible()
    const debut = Date.now()
    const preuve = await provider.battre(cheminCorpus)
    if (!preuve.ok) throw new Error('Le verrou des définitions a été perdu. Aucun PUT envoyé.')
    const source = await this.client.getTexteAvecEtag('corpus.json')
    if (!etagImportWebDAVFort(source.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort. Aucun PUT envoyé.')
    let corpus: CorpusFichier; let avant: EntretienFichier; let candidat: EntretienFichier
    try { corpus = JSON.parse(source.contenu); avant = JSON.parse(contenuAvant); candidat = JSON.parse(contenu) }
    catch { throw new Error('La base publiée ou le candidat est illisible. Aucun PUT envoyé.') }
    if (corpus.formatVersion !== FORMAT_VERSION || candidat.formatVersion !== FORMAT_VERSION
      || !Array.isArray(avant.annotations) || !Array.isArray(candidat.annotations)) throw new Error('La publication n’est pas prise en charge dans ce format.')
    const id = /^entretiens\/([^/]+)\.json$/.exec(chemin)?.[1]
    if (!id) throw new Error('La destination de publication d’entretien est invalide.')
    verifierBarriereDissociationWebDAV(corpus, candidat, id)
    const regles: Record<string, RegleAnon> = Object.assign(Object.create(null), corpus.reglesAnon ?? {})
    for (const [id, regle] of Object.entries(nouvellesRegles)) {
      if (Object.hasOwn(regles, id)) throw new Error('Une règle importée existe déjà. Recalculez l’import.')
      regles[id] = regle
    }
    verifierChoixPseudosAnon(candidat.annotations, regles, avant.annotations)
    const frais = await this.client.getTexteAvecEtag('corpus.json')
    if (frais.etag !== source.etag || frais.contenu !== source.contenu) throw new Error('Les définitions ont changé. Aucun PUT envoyé.')
    if (Date.now() + 60_000 >= debut + preuve.dureeGarantieMs) throw new Error('Le verrou des définitions va expirer. Aucun PUT envoyé.')
    const intention: EnvoiGardePseudosWebDAV = { version: 1, destination: this.destination, chemin, contenu }
    try { this.journal.ecrire(intention) } catch (e) {
      try { this.journal.effacer() } catch { this.retenu = { provider, envoi: intention }; droitsIncertains.add(provider) }
      throw e
    }
    if (Date.now() + 60_000 >= debut + preuve.dureeGarantieMs) {
      this.journal.effacer()
      throw new Error('Le verrou des définitions va expirer. Aucun PUT envoyé.')
    }
    this.enCours = true
    try {
      const resultat = await envoi(() => {
        if (Date.now() + 60_000 >= debut + preuve.dureeGarantieMs) throw new RefusAvantEnvoiPseudos('Le verrou des définitions va expirer. Aucun PUT envoyé.')
      })
      this.journal.effacer()
      return resultat
    } catch (e) {
      if (e instanceof RefusAvantEnvoiPseudos || (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut))) this.journal.effacer()
      else { this.retenu = { provider, envoi: intention }; droitsIncertains.add(provider) }
      throw e
    } finally { this.enCours = false }
  }
}
