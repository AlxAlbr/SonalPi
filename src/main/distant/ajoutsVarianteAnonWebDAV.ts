import { randomUUID } from 'node:crypto'
import { ErreurHttp, type ClientWebDAV } from '../webdav/client'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import type { IdentiteSession } from './sessions'
import type { DemandeAjoutVarianteAnon, ResultatAjoutVarianteAnon } from '../../shared/corpus/variantesAnon'
import { empreinteCorrespondance } from '../tablesCorrespondance'
import { etagImportWebDAVFort } from './journalCorrespondancesWebDAV'
import { candidatAjoutVarianteWebDAV, corpusAjoutVarianteWebDAV, JournalAjoutVarianteAnonWebDAV, type EnvoiAjoutVarianteWebDAV } from './journalAjoutVarianteAnonWebDAV'

const CORPUS = 'corpus.crp', VERROU = 'verrous/corpus.lock.json'
const MARGE = 60_000

/** Ajoute une variante sous le seul droit corpus ; les entretiens restent indépendants. */
export class AjoutsVarianteAnonWebDAV {
  private readonly journal: JournalAjoutVarianteAnonWebDAV
  private readonly destination: string
  private enCours = false
  private retenu?: { provider: ProviderPutConditionnel; fin: number; intention: string; identite: IdentiteSession; generation: string }
  constructor(private readonly options: {
    client: ClientWebDAV; dirLocal: string; identite: () => IdentiteSession
    miroir: (contenu: string, etag: string) => void; maintenant?: () => number
  }) {
    this.destination = empreinteCorrespondance(options.client.config.baseUrl.replace(/\/+$/, ''))
    this.journal = new JournalAjoutVarianteAnonWebDAV(options.dirLocal, this.destination)
  }
  private maintenant() { return (this.options.maintenant ?? Date.now)() }
  get occupe() { return this.enCours }
  lireEnvoi() { return this.journal.lire() }
  exigerDisponible() {
    if (this.enCours || this.journal.lire()) throw new Error('Un ajout de variante WebDAV reste à vérifier. Actualisez le corpus avant toute autre modification de ses définitions. Aucun rejeu autorisé.')
  }
  async appliquer(demande: DemandeAjoutVarianteAnon): Promise<ResultatAjoutVarianteAnon> {
    this.exigerDisponible()
    demande = structuredClone(demande)
    this.enCours = true
    const operationId = `ajout-variante-${randomUUID()}`
    const identite = { ...this.options.identite(), sessionId: operationId }
    const provider = new ProviderPutConditionnel(this.options.client, () => identite)
    let acquis = false, intention: EnvoiAjoutVarianteWebDAV | undefined, envoiCommence = false, responseAcceptee = false, issueConnue = false
    let fin = 0, generation = ''
    try {
      const debut = this.maintenant(), droit = await provider.acquerir(VERROU)
      if (!droit.ok) throw new Error('Les règles sont temporairement utilisées ailleurs. Réessayez après actualisation.')
      acquis = true; fin = debut + droit.dureeGarantieMs
      const detenteur = await provider.etat(VERROU)
      if (!detenteur || detenteur.userId !== identite.userId || detenteur.machineId !== identite.machineId
        || detenteur.sessionId !== identite.sessionId) throw new Error('Le droit sur les règles ne peut pas être vérifié.')
      generation = detenteur.acquiredAt
      const source = await this.options.client.getTexteAvecEtag(CORPUS)
      if (!etagImportWebDAVFort(source.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort. Aucun ajout envoyé.')
      const candidat = candidatAjoutVarianteWebDAV(source.contenu, demande)
      if (!candidat.resultat.ajoute) { this.options.miroir(source.contenu, source.etag); return candidat.resultat }
      intention = { version: 1, destination: this.destination, operationId, demande, avant: source.contenu,
        apres: candidat.apres, etagAvant: source.etag, etat: 'envoi' }
      this.journal.ecrire(intention)
      // La sauvegarde de l’intention peut prendre du temps : vérifier le droit ensuite.
      if (this.maintenant() + MARGE >= fin) throw new Error('Le droit sur les règles va expirer. Aucun ajout envoyé.')
      const debutBattement = this.maintenant(), droitFrais = await provider.battre(VERROU)
      if (!droitFrais.ok) throw new Error('Le droit sur les règles a été perdu. Aucun ajout envoyé.')
      fin = debutBattement + droitFrais.dureeGarantieMs
      const frais = await this.options.client.getTexteAvecEtag(CORPUS)
      if (frais.etag !== source.etag || frais.contenu !== source.contenu) throw new Error('Le corpus a changé avant l’ajout. Actualisez puis recommencez.')
      if (this.maintenant() + MARGE >= fin) throw new Error('Le droit sur les règles va expirer. Aucun ajout envoyé.')
      envoiCommence = true
      await this.options.client.putTexte(CORPUS, candidat.apres, { ifMatch: source.etag })
      responseAcceptee = true
      intention.etat = 'confirme'; this.journal.ecrire(intention); issueConnue = true
      await this.installerCourant()
      this.journal.effacer()
      return candidat.resultat
    } catch (e) {
      const certain = !envoiCommence || !responseAcceptee && e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)
      if (intention && certain) this.journal.effacer()
      else if (intention && !issueConnue) this.retenu = { provider, fin, identite, generation, intention: JSON.stringify({ ...intention, etat: 'envoi' }) }
      throw e
    } finally {
      if (acquis && !this.retenu) await this.rendreDroit({ provider, fin, identite, generation })
      this.enCours = false
    }
  }
  private async rendreDroit(droit: { provider: ProviderPutConditionnel; fin: number; identite: IdentiteSession; generation: string }) {
    if (this.maintenant() >= droit.fin || !droit.generation) return
    try {
      const v = await droit.provider.etat(VERROU), id = droit.identite
      if (this.maintenant() < droit.fin && v?.userId === id.userId && v.machineId === id.machineId
        && v.sessionId === id.sessionId && v.acquiredAt === droit.generation) await droit.provider.liberer(VERROU)
    } catch { /* Le droit reste sur le serveur si sa provenance ne peut plus être vérifiée. */ }
  }
  private async installerCourant() {
    const source = await this.options.client.getTexteAvecEtag(CORPUS)
    if (!etagImportWebDAVFort(source.etag)) throw new Error('La copie du corpus reste à actualiser : son état ne peut pas être vérifié.')
    corpusAjoutVarianteWebDAV(source.contenu)
    this.options.miroir(source.contenu, source.etag)
  }
  /** Une relecture reconnaît l’envoi accepté ; elle ne republie jamais son candidat. */
  async reconcilier() {
    if (this.enCours) throw new Error('Attendez la fin de l’ajout avant d’actualiser le corpus.')
    const j = this.journal.lire()
    if (!j) return
    if (this.retenu && this.retenu.intention !== JSON.stringify({ ...j, etat: 'envoi' })) throw new Error('L’intention d’ajout a changé. Aucun rejeu autorisé.')
    this.enCours = true
    try {
      if (j.etat === 'envoi') {
        const source = await this.options.client.getTexteAvecEtag(CORPUS)
        if (!etagImportWebDAVFort(source.etag) || source.contenu !== j.apres) throw new Error('L’ajout reste indéterminé. L’original ne prouve pas un refus ; aucun rejeu autorisé.')
        j.etat = 'confirme'; this.journal.ecrire(j)
      }
      await this.installerCourant()
      this.journal.effacer()
      const retenu = this.retenu; this.retenu = undefined
      // Un processus rouvert ne dispose pas de ce provider et ne rend aucun droit ancien.
      if (retenu) await this.rendreDroit(retenu)
    } finally { this.enCours = false }
  }
}
