import { exigerAbsenceDissociationWebDAV } from '../../shared/corpus/barriereDissociationWebDAV'
import { randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import type { ClientWebDAV } from '../webdav/client'
import { ErreurHttp } from '../webdav/client'
import type { VerrouProvider } from '../verrous/types'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { appliquerImportCorrespondances, type SuiviImportCorrespondances } from '../../shared/corpus/importCorrespondances'
import { appliquerCorrespondancesEntretiens } from '../../shared/corpus/importCorrespondancesEntretiens'
import type { InstantaneOperationTheme } from '../operationsThemes'
import { empreinteCorrespondance, type TablesCorrespondance } from '../tablesCorrespondance'
import { JournalCorrespondancesWebDAV, etagImportWebDAVFort, idImportWebDAVSain, type JournalImportWebDAV, type FichierImportWebDAV } from './journalCorrespondancesWebDAV'

type Preparation = ReturnType<TablesCorrespondance['consommerImport']>
type Verrou = { provider: VerrouProvider; chemin: string }
interface Dependances {
  client: ClientWebDAV
  store: CorpusStore
  dirLocal: string
  sessionsLocales: () => string[]
  verrouCorpus: () => Verrou
  verrouEntretien: (id: string) => Verrou
  miroir: (chemin: string, contenu: string, etag: string) => void
  maintenant?: () => number
  operationId?: () => string
}
class LimiteInventaire extends Error {}
class RefusSourceImport extends Error {}
class RefusVerrouImport extends Error {}

/** Publie un choix préparé par étapes ; une panne laisse une reprise explicite, jamais une compensation. */
export class CorrespondancesWebDAV {
  private readonly journal: JournalCorrespondancesWebDAV
  private enCours = false
  constructor(private readonly deps: Dependances) {
    this.journal = new JournalCorrespondancesWebDAV(deps.dirLocal, empreinteCorrespondance(deps.client.config.baseUrl.replace(/\/+$/, '')))
  }
  get occupe(): boolean { return this.enCours }
  lireSuivi(): SuiviImportCorrespondances | null {
    const j = this.journal.lire()
    if (!j || j.termine) return null
    const corpus = this.decoderCorpus(j.fichiers[0].apres)
    return { operationId: j.operationId, confirmes: j.fichiers.filter((f) => f.etat === 'confirme').length,
      restants: j.fichiers.filter((f) => f.etat === 'a-faire' || f.etat === 'envoi').length,
      indeterminee: j.fichiers.some((f) => f.etat === 'envoi'),
      definitionsCorpus: j.fichiers[0].etat !== 'garde', bilanPrevu: structuredClone(j.bilan),
      cibles: j.fichiers.slice(1).map((f) => {
        const entretienId = /^entretiens\/(.+)\.json$/.exec(f.chemin)![1]
        const membre = Object.hasOwn(corpus.membership, entretienId) ? corpus.membership[entretienId] : undefined
        return { entretienId, titre: typeof membre?.titre === 'string' ? membre.titre : entretienId, etat: f.etat }
      }) }
  }
  private maintenant(): number { return (this.deps.maintenant ?? Date.now)() }
  private exigerLibre(): void { if (this.enCours) throw new Error('Un import WebDAV est déjà en cours.') }
  private exigerNouveau(): void {
    this.exigerLibre()
    if (this.lireSuivi()) throw new Error('Un import WebDAV reste à reprendre. Aucun nouvel import n’est autorisé.')
  }
  private exigerSansSessions(ids: string[]): void {
    if (this.deps.sessionsLocales().some((id) => ids.includes(id))) throw new Error('Fermez les sessions locales ou récupérables des cibles avant d’importer.')
  }

  async instantane(): Promise<InstantaneOperationTheme> {
    this.exigerNouveau()
    const avant = await this.lire('corpus.json')
    const corpus = this.decoderCorpus(avant.contenu)
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    let octets = Buffer.byteLength(avant.contenu)
    for (const [id, membre] of Object.entries(corpus.membership)) {
      const titre = typeof membre?.titre === 'string' ? membre.titre : id
      try {
        if (!idImportWebDAVSain(id)) throw new Error('Identifiant d’entretien invalide.')
        const lecture = await this.lire(`entretiens/${id}.json`)
        octets += Buffer.byteLength(lecture.contenu)
        if (octets > 32 * 1024 * 1024) throw new LimiteInventaire('L’inventaire des correspondances dépasse 32 Mio.')
        const brut = this.decoderEntretien(lecture.contenu)
        const data = this.deps.store.adapterEntretienOperationTheme(structuredClone(brut))
        entretiens.push({ id, titre, ok: true, avant: brut, data })
      } catch (e) {
        if (e instanceof LimiteInventaire) throw e
        entretiens.push({ id, titre, ok: false, motif: 'Entretien publié indisponible ou non pris en charge.' })
      }
    }
    const apres = await this.lire('corpus.json')
    if (avant.etag !== apres.etag || avant.contenu !== apres.contenu) throw new Error('Le corpus a changé pendant l’inventaire. Recalculez l’aperçu.')
    return { corpus, entretiens }
  }

  async appliquer(preparation: Preparation) {
    this.exigerNouveau()
    if (preparation.store !== this.deps.store) throw new Error('Le corpus a changé. Recalculez l’aperçu.')
    const cibles = new Map(preparation.cibles.map((c) => [c.id, c]))
    const ids = [...new Set(preparation.choixCibles.map((c) => {
      const cible = cibles.get(c.cibleId)
      if (!cible || !idImportWebDAVSain(cible.entretienId)) throw new Error('Cible inconnue ou invalide. Recalculez l’aperçu.')
      return cible.entretienId
    }))].sort()
    if (!ids.length || ids.length > 100) throw new Error('Sélectionnez de 1 à 100 entretiens pour cet import WebDAV.')
    this.enCours = true
    try {
      return await this.avecVerrous(ids, async (renouveler, garantir) => {
        const sourceCorpus = await this.lire('corpus.json')
        const corpus = this.decoderCorpus(sourceCorpus.contenu)
        exigerAbsenceDissociationWebDAV(corpus)
        if (empreinteCorrespondance(corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez avant d’importer.')
        const sources = new Map<string, { contenu: string; etag: string }>()
        const entretiens: Record<string, EntretienFichier> = Object.create(null)
        for (const id of ids) {
          if (!Object.hasOwn(corpus.membership, id)) throw new Error('Un entretien cible ne fait plus partie du corpus.')
          const source = await this.lire(`entretiens/${id}.json`)
          const data = this.decoderEntretien(source.contenu)
          if (empreinteCorrespondance(data) !== preparation.empreintesEntretiens[id]) throw new Error('Un entretien cible a changé depuis l’aperçu. Recalculez avant d’importer.')
          this.deps.store.adapterEntretienOperationTheme(structuredClone(data))
          sources.set(id, source); entretiens[id] = data
        }
        const global = appliquerImportCorrespondances(corpus.reglesAnon ?? {}, preparation.lignes, preparation.choix, () => `reg-${randomUUID()}`)
        const apres = structuredClone(corpus)
        const definitionsModifiees = global.bilan.ajouts + global.bilan.variantes + global.bilan.remplacements > 0
        if (definitionsModifiees) apres.reglesAnon = global.regles
        const local = appliquerCorrespondancesEntretiens({ lignes: preparation.lignes }, { ...apres, reglesAnon: global.regles }, entretiens, preparation.cibles, preparation.choixCibles)
        const fichiers: FichierImportWebDAV[] = [{ chemin: 'corpus.json', avant: sourceCorpus.contenu,
          apres: definitionsModifiees ? this.serialiser(apres, sourceCorpus.contenu) : sourceCorpus.contenu,
          etagAvant: sourceCorpus.etag, etat: definitionsModifiees ? 'a-faire' : 'garde' }]
        for (const id of ids) {
          const source = sources.get(id)!
          const modifie = local.apres[id]
          fichiers.push({ chemin: `entretiens/${id}.json`, avant: source.contenu,
            apres: modifie ? this.serialiser({ ...modifie, lastModified: new Date(this.maintenant()).toISOString() }, source.contenu) : source.contenu,
            etagAvant: source.etag, etat: modifie ? 'a-faire' : 'garde' })
        }
        global.bilan.ignores -= new Set(preparation.choixCibles.map((c) => cibles.get(c.cibleId)!.ligneId)).size
        const j: JournalImportWebDAV = { version: 1, destination: empreinteCorrespondance(this.deps.client.config.baseUrl.replace(/\/+$/, '')),
          operationId: this.deps.operationId?.() ?? randomUUID(), fichiers, bilan: { ...global.bilan, entretiens: local.bilan }, termine: false }
        await this.verifierPlan(j, false)
        this.journal.ecrire(j)
        return this.publier(j, renouveler, garantir)
      })
    } catch {
      this.refuserAvecSuivi()
    } finally { this.enCours = false }
  }

  async reprendre(operationId: string, confirmee: boolean) {
    this.exigerLibre()
    if (confirmee !== true) throw new Error('Confirmez explicitement la reprise de cet import WebDAV.')
    const j = this.journal.lire()
    if (!j || j.operationId !== operationId) throw new Error('Import absent ou appartenant à une autre destination.')
    if (j.termine) return structuredClone(j.bilan)
    const ids = j.fichiers.slice(1).map((f) => /^entretiens\/(.+)\.json$/.exec(f.chemin)![1])
    this.enCours = true
    try {
      return await this.avecVerrous(ids, async (renouveler, garantir) => {
        await this.verifierPlan(j, true)
        this.journal.ecrire(j)
        return this.publier(j, renouveler, garantir)
      })
    } catch (e) {
      this.refuserAvecSuivi(e)
    } finally { this.enCours = false }
  }

  private refuserAvecSuivi(erreur?: unknown): never {
    const suivi = this.lireSuivi()
    if (!suivi) throw new Error('Import WebDAV refusé avant publication. Vérifiez les versions, sessions, droits et verrous avant de recalculer.')
    const motif = erreur instanceof RefusSourceImport || erreur instanceof RefusVerrouImport ? ` ${erreur.message}` : ''
    throw new Error(`Import WebDAV incomplet : ${suivi.confirmes} fichiers confirmés, ${suivi.restants} à reprendre${suivi.indeterminee ? ', dont une publication indéterminée' : ''}. Reprise explicite requise ; aucune compensation ni écrasement concurrent.${motif}`)
  }
  private async verifierPlan(j: JournalImportWebDAV, reprise: boolean): Promise<void> {
    const copie = structuredClone(j)
    for (const f of copie.fichiers) {
      const lecture = await this.lire(f.chemin)
      if (f.etat === 'confirme' || (reprise && f.etat === 'envoi' && lecture.contenu === f.apres)) {
        if (lecture.contenu !== f.apres) throw new RefusSourceImport('Un fichier déjà publié a changé ; aucun écrasement autorisé.')
        f.etat = 'confirme'
      } else {
        if (lecture.contenu !== f.avant || (!reprise && lecture.etag !== f.etagAvant)) throw new RefusSourceImport('Une source du plan a changé ; aucun écrasement autorisé.')
        // La reprise confirmée adopte une garde fraîche uniquement pour les mêmes octets sous verrous.
        if (reprise) f.etagAvant = lecture.etag
        if (f.etat === 'envoi') f.etat = 'a-faire'
      }
    }
    copie.fichiers.forEach((f, index) => {
      j.fichiers[index].etat = f.etat
      j.fichiers[index].etagAvant = f.etagAvant
    })
  }
  private async publier(j: JournalImportWebDAV, renouveler: () => Promise<void>, garantir: () => void) {
    for (const f of j.fichiers) {
      if (f.etat === 'a-faire') {
        await renouveler()
        await this.verifierPlan(j, false)
        garantir()
        f.etat = 'envoi'
        this.journal.ecrire(j)
        garantir()
        let etag: string | null
        try { etag = await this.deps.client.putTexte(f.chemin, f.apres, { ifMatch: f.etagAvant }) } catch (e) {
          if (e instanceof ErreurHttp && [400, 401, 403, 404, 409, 412, 413, 423].includes(e.statut)) {
            f.etat = 'a-faire'; this.journal.ecrire(j); throw new Error('Le serveur a refusé ce PUT.')
          }
          const relu = await this.lire(f.chemin)
          if (relu.contenu !== f.apres) throw new Error('Publication indéterminée ; aucun nouvel envoi.')
          etag = relu.etag
        }
        if (!etagImportWebDAVFort(etag)) {
          const relu = await this.lire(f.chemin)
          if (relu.contenu !== f.apres) throw new Error('Publication non confirmée.')
          etag = relu.etag
        }
        f.etat = 'confirme'
        this.journal.ecrire(j)
        this.deps.miroir(f.chemin, f.apres, etag)
      } else if (f.etat === 'confirme') {
        const relu = await this.lire(f.chemin)
        this.deps.miroir(f.chemin, f.apres, relu.etag)
      }
    }
    await this.verifierPlan(j, false)
    j.termine = true
    this.journal.ecrire(j)
    return structuredClone(j.bilan)
  }
  private async avecVerrous<T>(ids: string[], fn: (renouveler: () => Promise<void>, garantir: () => void) => Promise<T>): Promise<T> {
    this.exigerSansSessions(ids)
    const verrous: Array<Verrou & { echeance: number }> = []
    try {
      for (const v of [this.deps.verrouCorpus(), ...ids.map((id) => this.deps.verrouEntretien(id))]) {
        this.exigerSansSessions(ids)
        const debut = this.maintenant()
        const acquisition = await v.provider.acquerir(v.chemin)
        if (!acquisition.ok) throw new RefusVerrouImport('Un verrou reste tenu. Aucune libération automatique : vérifiez les autres postes et faites libérer le verrou par son détenteur avant de confirmer la reprise.')
        verrous.push({ ...v, echeance: debut + acquisition.dureeGarantieMs })
      }
      this.exigerSansSessions(ids)
      return await fn(async () => {
        for (const v of verrous) {
          const debut = this.maintenant()
          const battement = await v.provider.battre(v.chemin)
          if (!battement.ok) throw new Error('Le verrou n’est plus garanti.')
          v.echeance = debut + battement.dureeGarantieMs
        }
      }, () => {
        this.exigerSansSessions(ids)
        if (verrous.some((v) => this.maintenant() + 60_000 >= v.echeance)) throw new Error('Un verrou va expirer ; aucun PUT envoyé.')
      })
    } finally {
      for (const v of verrous.reverse()) await v.provider.liberer(v.chemin).catch(() => {})
    }
  }
  private async lire(chemin: string): Promise<{ contenu: string; etag: string }> {
    const lecture = await this.deps.client.getTexteAvecEtag(chemin)
    if (!etagImportWebDAVFort(lecture.etag)) throw new Error('Le serveur ne fournit pas d’ETag fort : import refusé.')
    return { contenu: lecture.contenu, etag: lecture.etag }
  }
  private decoderCorpus(contenu: string): CorpusFichier {
    try {
      const corpus = JSON.parse(contenu) as CorpusFichier
      if (corpus?.formatVersion !== FORMAT_VERSION || !corpus.membership || typeof corpus.membership !== 'object' || Array.isArray(corpus.membership)) throw new Error()
      return corpus
    } catch { throw new Error('Le corpus publié n’est pas pris en charge.') }
  }
  private decoderEntretien(contenu: string): EntretienFichier {
    try {
      const data = JSON.parse(contenu) as EntretienFichier
      if (data?.formatVersion !== FORMAT_VERSION) throw new Error()
      return data
    } catch { throw new Error('Enregistrez cet entretien dans le format actuel avant l’import WebDAV.') }
  }
  private serialiser(data: unknown, avant: string): string {
    const contenu = JSON.stringify(data, null, 2)
    // Nextcloud peut conserver un ETag à mtime et taille identiques.
    return Buffer.byteLength(contenu) === Buffer.byteLength(avant) ? `${contenu}\n` : contenu
  }
}
