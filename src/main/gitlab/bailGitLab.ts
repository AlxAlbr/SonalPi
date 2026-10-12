import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import {
  ClientGitLab,
  ErreurEcritureGitLab,
  ErreurGitLab,
  TAILLE_MAX_DOCUMENT_GITLAB,
} from './client'
import { DUREE_BAIL_GITLAB_MS } from './parametresSession'

export const DUREE_BAIL_MS = DUREE_BAIL_GITLAB_MS
const VERSION_BAIL = 2
const VERSION_BAIL_LEGACY = 1
const PROTOCOLE_BAIL = 'sonal-bail-v2'
const PROTOCOLE_BAIL_LEGACY = 'sonal-bail-v1'
const PREFIXE_BAIL = '.sonal/verrous'
const SEPARATEUR_RESSOURCE = '\u0000'
const SHA256 = /^[a-f0-9]{64}$/

export interface IdentiteBailGitLab {
  userId: string
  machineId: string
  sessionId: string
}

export interface ActionCommitGitLab {
  action: 'create' | 'update' | 'delete' | 'move' | 'chmod'
  file_path: string
  previous_path?: string
  content?: string
  encoding?: 'text' | 'base64'
  last_commit_id?: string
  execute_filemode?: boolean
}

export interface FichierGitLab {
  chemin: string
  commitId: string
  contenu: string
  executable: boolean
}

export interface GardeFichierGitLab {
  commitId: string
  executable: boolean
}

export interface DepotCommitsGitLab {
  lireFichier(chemin: string, ref: string): Promise<FichierGitLab | null>
  /** Métadonnées nécessaires à une garde, sans télécharger le contenu. */
  lireGardeFichier(chemin: string, ref: string): Promise<GardeFichierGitLab | null>
  /** Résout la tête d'une branche en SHA : toutes les lectures d'un même geste
   *  se font alors sur un instantané unique du dépôt. */
  resoudreTete(branche: string): Promise<string>
  /** Contenu brut d'un fichier, sans garde ni enveloppe base64. Un tri lit ainsi
   *  des entretiens que la lecture avec garde refuserait de transporter. */
  lireContenuBrut(chemin: string, ref: string): Promise<string | null>
  rechercherCommits(ref: string, recherche: string): Promise<Array<{ id: string; title: string }>>
  publierCommit(
    branche: string,
    message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }>
}

const marqueDroit: unique symbol = Symbol('droit-bail-gitlab')

/** Droit opaque, produit uniquement par le coordinateur GitLab. */
export interface DroitsEditionGitLab {
  readonly [marqueDroit]: true
  readonly generation: string
}

interface EtatDroit {
  chemin: string
  resourceHash: string
  generation: string
  identite: IdentiteBailGitLab
  commitId: string
  expireLe: number
  compteur: number
  invalide: boolean
  suspendu: boolean
  transition?: {
    commitId: string
    expireLe: number
    compteur: number
  }
}

const états = new WeakMap<DroitsEditionGitLab, EtatDroit>()

/** Un seul commit à la fois par destination.
 *
 *  L'API Repository de GitLab refuse deux commits simultanés sur la même
 *  branche, même quand ils portent sur des fichiers différents et que leurs
 *  gardes sont valides : le refus tient à la tête de branche, pas au contenu
 *  des actions (qualifié sur banc). La file est donc prise sur la destination
 *  entière, et pas sur la seule ressource.
 *
 *  Elle appartient à la destination : toutes les sessions d'un même corpus et
 *  ses transactions de corpus partagent celle-ci. Un lien par `BailGitLab`
 *  laisserait deux entretiens ouverts se percuter.
 *
 *  Un appel réentrant n'attend pas la file — il l'exécute directement : il est
 *  déjà dans la section critique, et l'attendre deadlockerait. */
export class FileCommitsGitLab {
  private readonly courant = new AsyncLocalStorage<true>()
  private file: Promise<unknown> = Promise.resolve()

  executer<T>(operation: () => Promise<T>): Promise<T> {
    if (this.courant.getStore()) return operation()
    return this.courant.run(true, () => {
      const resultat = this.file.then(operation, operation)
      this.file = resultat.then(() => undefined, () => undefined)
      return resultat
    })
  }
}

export interface PartieBailGitLab {
  userId: string
  generation: string
  expireLe: string
}

export type ResultatAcquisitionBailGitLab =
  | { ok: true; droit: DroitsEditionGitLab }
  | { ok: false; raison: 'tenu'; tenupar: PartieBailGitLab | null }

/** Ce qu'un bail observé dit de son détenteur, sans droit ni écriture.
 *  `legacy` signale un ancien marqueur : le coordinateur le refuse même expiré,
 *  donc l'exclusion est affichée sans condition de date. */
export interface BailObserveGitLab {
  userId: string
  machineId: string
  sessionId: string
  generation: string
  expireLe: string
  legacy: boolean
}

export interface OptionsBailGitLab {
  branche: string
  depot: DepotCommitsGitLab
  /** File de commits de la destination, partagée par toutes les sessions et
   *  par les transactions de corpus. Absente, chaque coordinateur aurait la
   *  sienne, et la garantie ne vaudrait plus rien. */
  fileCommits?: FileCommitsGitLab
  identite: () => IdentiteBailGitLab
  maintenant?: () => number
  nouvelleGeneration?: () => string
  dureeBailMs?: number
  ressourcesLegacy?: string[]
}

interface BailEnregistre {
  version: 1 | 2
  protocole: 'sonal-bail-v1' | 'sonal-bail-v2'
  resourceHash: string
  generation: string
  holder: IdentiteBailGitLab
  expireLe: string
  compteur: number
}

interface BrancheGitLab {
  commit?: { id?: string }
}

export class DepotCommitsGitLabClient implements DepotCommitsGitLab {
  constructor(private readonly client: ClientGitLab) {}

  async lireFichier(chemin: string, ref: string): Promise<FichierGitLab | null> {
    verifierCheminGitLab(chemin)
    try {
      const reponse = await this.client.lireJson<{
        file_path: string
        content: string
        encoding: string
        last_commit_id: string
        execute_filemode: boolean
      }>(
        this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}`),
        { ref },
        { tailleMaxOctets: TAILLE_MAX_DOCUMENT_GITLAB },
      )
      if (
        reponse.corps.file_path !== chemin ||
        reponse.corps.encoding !== 'base64' ||
        !reponse.corps.last_commit_id ||
        typeof reponse.corps.execute_filemode !== 'boolean'
      ) {
        throw new Error('Réponse de fichier GitLab invalide.')
      }
      const contenu = Buffer.from(reponse.corps.content, 'base64').toString('utf8')
      return {
        chemin,
        commitId: reponse.corps.last_commit_id,
        contenu,
        executable: reponse.corps.execute_filemode,
      }
    } catch (erreur) {
      if (erreur instanceof ErreurGitLab && erreur.statut === 404) return null
      throw erreur
    }
  }

  async lireGardeFichier(chemin: string, ref: string): Promise<GardeFichierGitLab | null> {
    verifierCheminGitLab(chemin)
    try {
      const entetes = await this.client.lireEntetes(
        this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}`),
        { ref },
      )
      const commitId = entetes.get('x-gitlab-last-commit-id')
      const mode = entetes.get('x-gitlab-execute-filemode')
      if (!commitId || !/^[a-f0-9]{40,64}$/.test(commitId) || (mode !== 'true' && mode !== 'false')) {
        throw new Error('Métadonnées de fichier GitLab invalides.')
      }
      return { commitId, executable: mode === 'true' }
    } catch (erreur) {
      if (erreur instanceof ErreurGitLab && erreur.statut === 404) return null
      throw erreur
    }
  }

  async resoudreTete(branche: string): Promise<string> {
    if (!branche.trim()) throw new Error('Branche GitLab manquante.')
    const reponse = await this.client.lireJson<BrancheGitLab>(
      this.client.cheminProjet(`/repository/branches/${encodeURIComponent(branche)}`),
    )
    const commit = reponse.corps.commit?.id
    if (!commit || !/^[a-f0-9]{40,64}$/.test(commit)) {
      throw new Error('La branche GitLab ne fournit pas de commit valide.')
    }
    return commit
  }

  async lireContenuBrut(chemin: string, ref: string): Promise<string | null> {
    verifierCheminGitLab(chemin)
    try {
      return await this.client.lireTexte(
        this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}/raw`),
        { ref },
      )
    } catch (erreur) {
      if (erreur instanceof ErreurGitLab && erreur.statut === 404) return null
      throw erreur
    }
  }

  async rechercherCommits(
    ref: string,
    recherche: string,
  ): Promise<Array<{ id: string; title: string }>> {
    const reponse = await this.client.lireJson<Array<{ id: string; title: string }>>(
      this.client.cheminProjet('/repository/commits'),
      { ref_name: ref, search: recherche, per_page: '20' },
      { tailleMaxOctets: 256 * 1024 },
    )
    return reponse.corps.filter((commit) =>
      typeof commit.id === 'string' && typeof commit.title === 'string')
  }

  async publierCommit(
    branche: string,
    message: string,
    actions: ActionCommitGitLab[],
  ): Promise<{ id: string }> {
    const reponse = await this.client.ecrireJson<{ id: string }>(
      this.client.cheminProjet('/repository/commits'),
      { branch: branche, commit_message: message, actions },
    )
    if (!reponse.corps.id) throw new Error('Réponse de commit GitLab invalide.')
    return reponse.corps
  }
}

export class BailGitLab {
  private readonly maintenant: () => number
  private readonly nouvelleGeneration: () => string
  private readonly dureeBailMs: number
  private readonly ressourcesLegacy: string[]
  private readonly commits: FileCommitsGitLab
  private readonly droitsAcquis = new Map<string, EtatDroit>()

  constructor(private readonly options: OptionsBailGitLab) {
    if (!options.branche.trim()) throw new Error('Branche GitLab manquante.')
    this.maintenant = options.maintenant ?? Date.now
    this.nouvelleGeneration = options.nouvelleGeneration ?? randomUUID
    this.dureeBailMs = options.dureeBailMs ?? DUREE_BAIL_MS
    this.commits = options.fileCommits ?? new FileCommitsGitLab()
    this.ressourcesLegacy = [...new Set(options.ressourcesLegacy ?? [])]
    if (!Number.isSafeInteger(this.dureeBailMs) || this.dureeBailMs < 60_000) {
      throw new Error('Durée du bail GitLab invalide.')
    }
  }

  /** Exécute une opération de commit en exclusivité sur la destination.
   *  Publications de sessions et transactions de corpus passent toutes par là,
   *  comme les mutations de bail : deux commits ne se croisent jamais. */
  serierCommit<T>(operation: () => Promise<T>): Promise<T> {
    return this.commits.executer(operation)
  }

  async acquireRessource(ressource: string): Promise<ResultatAcquisitionBailGitLab> {
    return this.serierCommit(() => this.acquerirInterne(ressource, false))
  }

  private async acquerirInterne(
    ressource: string,
    repriseExplicite: boolean,
  ): Promise<ResultatAcquisitionBailGitLab> {
    const ancien = await this.refusLegacy()
    if (ancien) return ancien
    const resourceHash = hacherRessource(ressource)
    const chemin = cheminBail(resourceHash)
    const bail = this.nouveauBail(resourceHash)
    try {
      const commit = await this.publierBail('acquisition', chemin, bail, null)
      const ancienApresEcriture = await this.refusLegacy()
      if (ancienApresEcriture) {
        await this.supprimerBail(chemin, bail, commit.id)
        return ancienApresEcriture
      }
      return { ok: true, droit: this.creerDroit(chemin, bail, commit.id) }
    } catch (erreur) {
      if (!refusMutationConnu(erreur)) throw erreur
    }

    if (repriseExplicite) {
      const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
      if (!observe) throw new Error('Bail GitLab absent lors de la reprise.')
      const courant = lireBail(observe.contenu, resourceHash)
      if (Date.parse(courant.expireLe) > this.maintenant()) {
        return { ok: false, raison: 'tenu', tenupar: partie(courant) }
      }
      const repris = this.nouveauBail(resourceHash)
      try {
        const commit = await this.publierBail('reprise', chemin, repris, observe.commitId)
        const ancienApresEcriture = await this.refusLegacy()
        if (ancienApresEcriture) {
          await this.supprimerBail(chemin, repris, commit.id)
          return ancienApresEcriture
        }
        return { ok: true, droit: this.creerDroit(chemin, repris, commit.id) }
      } catch (erreur) {
        if (!refusMutationConnu(erreur)) throw erreur
        return this.refusObserve(chemin)
      }
    }

    const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
    if (!observe) {
      try {
        const commit = await this.publierBail('acquisition', chemin, bail, null)
        const ancienApresEcriture = await this.refusLegacy()
        if (ancienApresEcriture) {
          await this.supprimerBail(chemin, bail, commit.id)
          return ancienApresEcriture
        }
        return { ok: true, droit: this.creerDroit(chemin, bail, commit.id) }
      } catch (erreur) {
        if (!refusMutationConnu(erreur)) throw erreur
      }
      return this.refusObserve(chemin)
    }
    const courant = lireBail(observe.contenu, resourceHash)
    if (Date.parse(courant.expireLe) > this.maintenant()) {
      return { ok: false, raison: 'tenu', tenupar: partie(courant) }
    }
    const repris = this.nouveauBail(resourceHash)
    try {
      const commit = await this.publierBail(
        'reprise',
        chemin,
        repris,
        observe.commitId,
      )
      const ancienApresEcriture = await this.refusLegacy()
      if (ancienApresEcriture) {
        await this.supprimerBail(chemin, repris, commit.id)
        return ancienApresEcriture
      }
      return { ok: true, droit: this.creerDroit(chemin, repris, commit.id) }
    } catch (erreur) {
      if (!refusMutationConnu(erreur)) throw erreur
      return this.refusObserve(chemin)
    }
  }

  async reprendreRessource(ressource: string): Promise<ResultatAcquisitionBailGitLab> {
    return this.serierCommit(() => this.acquerirInterne(ressource, true))
  }

  async revalider(droit: DroitsEditionGitLab): Promise<boolean> {
    const etat = this.etatActif(droit)
    if (this.maintenant() >= etat.expireLe) {
      etat.invalide = true
      return false
    }
    const observe = await this.options.depot.lireFichier(etat.chemin, this.options.branche)
    if (!observe) {
      etat.invalide = true
      return false
    }
    const courant = lireBail(observe.contenu, etat.resourceHash)
    return observe.commitId === etat.commitId &&
      courant.generation === etat.generation &&
      courant.compteur === etat.compteur &&
      Date.parse(courant.expireLe) > this.maintenant()
  }

  async renouveler(droit: DroitsEditionGitLab): Promise<boolean> {
    return this.serierCommit(() => this.renouvelerInterne(droit))
  }

  private async renouvelerInterne(droit: DroitsEditionGitLab): Promise<boolean> {
    const etat = this.etatActif(droit)
    if (etat.suspendu || etat.transition) {
      throw new Error('Droit d’édition GitLab en attente de réconciliation.')
    }
    if (this.maintenant() >= etat.expireLe) {
      etat.invalide = true
      return false
    }
    const renewed = this.sauvegardeBail(etat, this.maintenant() + this.dureeBailMs)
    try {
      const commit = await this.publierBail(
        'renouvellement',
        etat.chemin,
        renewed,
        etat.commitId,
      )
      this.majEtat(etat, renewed, commit.id)
      return true
    } catch (erreur) {
      if (refusMutationConnu(erreur)) {
        etat.invalide = true
        return false
      }
      throw erreur
    }
  }

  async liberer(droit: DroitsEditionGitLab): Promise<'libere' | 'deja-perdu'> {
    return this.serierCommit(() => this.libererInterne(droit))
  }

  private async libererInterne(droit: DroitsEditionGitLab): Promise<'libere' | 'deja-perdu'> {
    const etat = this.etatActif(droit)
    try {
      await this.options.depot.publierCommit(
        this.options.branche,
        `Sonal bail ${etat.resourceHash.slice(0, 12)} libération`,
        [{
          action: 'delete',
          file_path: etat.chemin,
          last_commit_id: etat.commitId,
        }],
      )
      etat.invalide = true
      if (this.droitsAcquis.get(etat.chemin) === etat) this.droitsAcquis.delete(etat.chemin)
      return 'libere'
    } catch (erreur) {
      if (refusMutationConnu(erreur)) {
        etat.invalide = true
        if (this.droitsAcquis.get(etat.chemin) === etat) this.droitsAcquis.delete(etat.chemin)
        return 'deja-perdu'
      }
      throw erreur
    }
  }

  preparerPublication(droit: DroitsEditionGitLab): {
    action: ActionCommitGitLab
    expireLe: number
    compteur: number
  } {
    const etat = this.etatActif(droit)
    if (etat.suspendu || etat.transition) {
      throw new Error('Droit d’édition GitLab en attente de réconciliation.')
    }
    if (this.maintenant() >= etat.expireLe) {
      etat.invalide = true
      throw new Error('Le droit d’édition GitLab est expiré.')
    }
    const bail = this.sauvegardeBail(etat, this.maintenant() + this.dureeBailMs)
    const expireLe = Date.parse(bail.expireLe)
    etat.transition = {
      commitId: etat.commitId,
      expireLe,
      compteur: bail.compteur,
    }
    return {
      action: {
        action: 'update',
        file_path: etat.chemin,
        content: JSON.stringify(bail),
        last_commit_id: etat.commitId,
      },
      expireLe,
      compteur: bail.compteur,
    }
  }

  annulerPreparation(droit: DroitsEditionGitLab): void {
    const etat = this.etatActif(droit)
    if (!etat.transition) throw new Error('Aucune publication GitLab à annuler.')
    etat.transition = undefined
  }

  confirmerPublication(
    droit: DroitsEditionGitLab,
    commitId: string,
    expireLe: number,
    compteur: number,
  ): void {
    const etat = this.etatActif(droit)
    if (
      !etat.transition ||
      etat.transition.commitId !== etat.commitId ||
      etat.transition.expireLe !== expireLe ||
      etat.transition.compteur !== compteur
    ) {
      throw new Error('Transition de publication GitLab incohérente.')
    }
    etat.commitId = commitId
    etat.expireLe = expireLe
    etat.compteur = compteur
    etat.transition = undefined
  }

  refuserPublication(droit: DroitsEditionGitLab, droitPerdu: boolean): void {
    const etat = this.etatActif(droit)
    if (!etat.transition) throw new Error('Aucune publication GitLab à suspendre.')
    etat.transition = undefined
    etat.suspendu = true
    if (droitPerdu) etat.invalide = true
  }

  /** Réactive un droit après un conflit qui ne concernait pas sa ressource.
   *  L'appelant doit avoir revérifié le bail et la garde métier. */
  reprendreApresConflitNeutre(droit: DroitsEditionGitLab): void {
    const etat = this.etatActif(droit)
    if (!etat.suspendu || etat.transition) {
      throw new Error('Le droit d’édition GitLab n’est pas suspendu après un conflit.')
    }
    etat.suspendu = false
  }

  suspendrePublicationIndeterminee(droit: DroitsEditionGitLab): void {
    const etat = this.etatActif(droit)
    if (!etat.transition) throw new Error('Aucune publication GitLab à suspendre.')
    etat.transition = undefined
    etat.suspendu = true
  }

  snapshot(droit: DroitsEditionGitLab): {
    chemin: string
    resourceHash: string
    generation: string
    identite: IdentiteBailGitLab
    commitId: string
    expireLe: number
    compteur: number
    suspendu: boolean
  } {
    const etat = this.etatActif(droit)
    return {
      chemin: etat.chemin,
      resourceHash: etat.resourceHash,
      generation: etat.generation,
      identite: { ...etat.identite },
      commitId: etat.commitId,
      expireLe: etat.expireLe,
      compteur: etat.compteur,
      suspendu: etat.suspendu,
    }
  }

  invalider(droit: DroitsEditionGitLab): void {
    const etat = états.get(droit)
    if (etat) etat.invalide = true
  }

  /** Le droit est-il encore le nôtre ?
   *
   *  Un refus de commit ne marque invalide que le droit dont la génération a
   *  bougé. L'appelant qui en porte plusieurs peut ainsi nommer celui qu'il a
   *  perdu, au lieu de présenter les deux comme intacts ou perdus. */
  droitPerdu(droit: DroitsEditionGitLab): boolean {
    const etat = états.get(droit)
    return !etat || etat.invalide
  }

  /** Adopte l'état de bail d'une publication dont on connaît le commit.
   *
   *  Une publication dont la réponse s'est perdue a pourtant bien pu aboutir.
   *  La réconciliation en retrouve le commit et la mutation de bail qu'il
   *  portait ; sans cette adoption, la libération viserait une garde périmée
   *  et laisserait le bail acquis jusqu'à son expiration. */
  constaterPublicationReconciliee(
    droit: DroitsEditionGitLab,
    commitId: string,
    bail: { compteur: number; expireLe: string },
  ): void {
    const etat = this.etatActif(droit)
    const expireLe = Date.parse(bail.expireLe)
    // La publication(Long) incrémente le compteur d'exactement un : c'est le
    // contrôle qui relie le bail retrouvé à celui que nous portions.
    if (bail.compteur !== etat.compteur + 1 || !Number.isFinite(expireLe)) {
      throw new Error('État de bail réconcilié incohérent avec la publication.')
    }
    etat.commitId = commitId
    etat.compteur = bail.compteur
    etat.expireLe = expireLe
    etat.suspendu = false
    etat.transition = undefined
  }

  /** Rend un bail que l'on sait être le nôtre.
   *
   *  Un poste qui s'arrête au milieu d'une opération laisse son bail derrière
   *  lui : personne d'autre ne peut le prendre avant son expiration, et
   *  l'utilisateur se voit refuser ses propres gestes pendant ce temps. Deux
   *  preuves autorisent la reprise : le détenteur est bien notre compte, et la
   *  génération est celle de l'opération retrouvée. Une reprise par un tiers
   *  change la génération, donc un bail qui la porte encore est le nôtre. */
  async rendreBailNotre(
    chemin: string,
    generationAttendue: string,
    detenteurAttendu?: IdentiteBailGitLab,
  ): Promise<'libere' | 'absent' | 'autre'> {
    return this.serierCommit(async () => {
      const resourceHash = resourceHashDeChemin(chemin)
      const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
      if (!observe) return 'absent'
      const courant = lireBail(observe.contenu, resourceHash)
      if (
        courant.holder.userId !== this.options.identite().userId
        || courant.generation !== generationAttendue
        || (detenteurAttendu && (courant.holder.userId !== detenteurAttendu.userId
          || courant.holder.machineId !== detenteurAttendu.machineId || courant.holder.sessionId !== detenteurAttendu.sessionId))
      ) {
        return 'autre'
      }
      try {
        await this.options.depot.publierCommit(
          this.options.branche,
          `Sonal bail ${courant.resourceHash.slice(0, 12)} reprise au démarrage`,
          [{ action: 'delete', file_path: chemin, last_commit_id: observe.commitId }],
        )
        if (this.droitsAcquis.get(chemin)?.generation === generationAttendue) this.droitsAcquis.delete(chemin)
        return 'libere'
      } catch (erreur) {
        // Un refus laisse le bail à son expiration, comme avant cette reprise.
        if (!refusMutationConnu(erreur)) throw erreur
        return 'autre'
      }
    })
  }

  /** La réconciliation ne peut rendre que les droits acquis par cette instance. */
  async rendreBailAcquis(chemin: string, generation: string): Promise<'libere' | 'absent' | 'autre'> {
    const etat = this.droitsAcquis.get(chemin)
    if (!etat || etat.invalide || etat.generation !== generation || this.maintenant() >= etat.expireLe) return 'autre'
    const resultat = await this.rendreBailNotre(chemin, generation, etat.identite)
    if (resultat !== 'autre') {
      etat.invalide = true
      if (this.droitsAcquis.get(chemin) === etat) this.droitsAcquis.delete(chemin)
    }
    return resultat
  }

  /** Le compte de cette application, pour nommer un refus sans se nommer
   *  soi-même comme détenteur d'un bail. */
  compteCourant(): string {
    return this.options.identite().userId
  }

  private async refusLegacy(): Promise<ResultatAcquisitionBailGitLab | null> {
    for (const ressource of this.ressourcesLegacy) {
      const chemin = cheminBail(hacherRessource(ressource))
      const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
      if (observe) {
        const resourceHash = resourceHashDeChemin(chemin)
        return {
          ok: false,
          raison: 'tenu',
          tenupar: partie(lireBail(observe.contenu, resourceHash, true)),
        }
      }
    }
    return null
  }

  private async supprimerBail(
    chemin: string,
    bail: BailEnregistre,
    commitId: string,
  ): Promise<void> {
    try {
      await this.options.depot.publierCommit(
        this.options.branche,
        `Sonal bail ${bail.resourceHash.slice(0, 12)} rollback acquisition`,
        [{
          action: 'delete',
          file_path: chemin,
          last_commit_id: commitId,
        }],
      )
    } catch (erreur) {
      if (!refusMutationConnu(erreur)) throw erreur
    }
  }

  private async refusObserve(chemin: string): Promise<ResultatAcquisitionBailGitLab> {
    const observe = await this.options.depot.lireFichier(chemin, this.options.branche)
    if (!observe) throw new Error('Le bail GitLab reste introuvable après un refus.')
    const resourceHash = resourceHashDeChemin(chemin)
    const courant = lireBail(observe.contenu, resourceHash)
    return { ok: false, raison: 'tenu', tenupar: partie(courant) }
  }

  private nouveauBail(resourceHash: string): BailEnregistre {
    const identite = this.options.identite()
    if (!identite.userId || !identite.machineId || !identite.sessionId) {
      throw new Error('Identité de session GitLab incomplète.')
    }
    return {
      version: VERSION_BAIL,
      protocole: PROTOCOLE_BAIL,
      resourceHash,
      generation: this.nouvelleGeneration(),
      holder: { ...identite },
      expireLe: new Date(this.maintenant() + this.dureeBailMs).toISOString(),
      compteur: 1,
    }
  }

  private async publierBail(
    motif: string,
    chemin: string,
    bail: BailEnregistre,
    commitId: string | null,
  ): Promise<{ id: string }> {
    const action: ActionCommitGitLab = commitId === null
      ? { action: 'create', file_path: chemin, content: JSON.stringify(bail) }
      : {
          action: 'update',
          file_path: chemin,
          content: JSON.stringify(bail),
          last_commit_id: commitId,
        }
    return this.options.depot.publierCommit(
      this.options.branche,
      motif === 'renouvellement'
        ? '[Sonal] Renouvellement du bail'
        : `Sonal bail ${bail.resourceHash.slice(0, 12)} ${motif}`,
      [action],
    )
  }

  private creerDroit(
    chemin: string,
    bail: BailEnregistre,
    commitId: string,
  ): DroitsEditionGitLab {
    const droit = { [marqueDroit]: true as const, generation: bail.generation }
    const expireLe = Date.parse(bail.expireLe)
    if (!Number.isFinite(expireLe)) throw new Error('Échéance de bail GitLab invalide.')
    états.set(droit, {
      chemin,
      resourceHash: bail.resourceHash,
      generation: bail.generation,
      identite: { ...bail.holder },
      commitId,
      expireLe,
      compteur: bail.compteur,
      invalide: false,
      suspendu: false,
    })
    this.droitsAcquis.set(chemin, états.get(droit)!)
    return droit
  }

  private sauvegardeBail(etat: EtatDroit, expireLe: number): BailEnregistre {
    return {
      version: VERSION_BAIL,
      protocole: PROTOCOLE_BAIL,
      resourceHash: etat.resourceHash,
      generation: etat.generation,
      holder: { ...etat.identite },
      expireLe: new Date(expireLe).toISOString(),
      compteur: etat.compteur + 1,
    }
  }

  private majEtat(etat: EtatDroit, bail: BailEnregistre, commitId: string): void {
    etat.commitId = commitId
    etat.expireLe = Date.parse(bail.expireLe)
    etat.compteur = bail.compteur
  }

  private etatActif(droit: DroitsEditionGitLab): EtatDroit {
    const etat = états.get(droit)
    if (!etat || etat.invalide) throw new Error('Droit d’édition GitLab invalide.')
    return etat
  }

}

export function verifierCheminGitLab(chemin: string): void {
  if (
    !chemin ||
    chemin.startsWith('/') ||
    chemin.includes('\\') ||
    chemin.includes('\0') ||
    chemin.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Chemin GitLab invalide : ${chemin}.`)
  }
}

export function estCheminBailGitLab(chemin: string): boolean {
  return chemin.startsWith(`${PREFIXE_BAIL}/`)
}

export function cleRessourceBailGitLab(branche: string, cheminDistant: string): string {
  if (!branche.trim()) throw new Error('Branche GitLab manquante pour le bail.')
  verifierCheminGitLab(cheminDistant)
  return `branche:${branche}${SEPARATEUR_RESSOURCE}chemin:${cheminDistant}`
}

function hacherRessource(ressource: string): string {
  if (!ressource.trim()) throw new Error('Ressource GitLab manquante.')
  return createHash('sha256').update(ressource, 'utf8').digest('hex')
}

function cheminBail(resourceHash: string): string {
  return `${PREFIXE_BAIL}/${resourceHash}.json`
}

function resourceHashDeChemin(chemin: string): string {
  const resourceHash = chemin.slice(`${PREFIXE_BAIL}/`.length, -'.json'.length)
  if (!/^[a-f0-9]{64}$/.test(resourceHash)) throw new Error('Chemin de bail GitLab invalide.')
  return resourceHash
}

function lireBail(
  contenu: string,
  resourceHash: string,
  legacy = false,
): BailEnregistre {
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch {
    throw new Error('Bail GitLab illisible.')
  }
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
    throw new Error('Bail GitLab illisible.')
  }
  const bail = brut as Partial<BailEnregistre>
  const holder = bail.holder
  const versionValide = legacy
    ? (bail.version === VERSION_BAIL || bail.version === VERSION_BAIL_LEGACY) &&
      (bail.protocole === PROTOCOLE_BAIL || bail.protocole === PROTOCOLE_BAIL_LEGACY)
    : bail.version === VERSION_BAIL && bail.protocole === PROTOCOLE_BAIL
  if (
    !versionValide ||
    bail.resourceHash !== resourceHash ||
    typeof bail.generation !== 'string' ||
    !bail.generation ||
    !holder ||
    typeof holder.userId !== 'string' ||
    typeof holder.machineId !== 'string' ||
    typeof holder.sessionId !== 'string' ||
    typeof bail.expireLe !== 'string' ||
    !Number.isFinite(Date.parse(bail.expireLe)) ||
    !Number.isSafeInteger(bail.compteur) ||
      (bail.compteur as number) < 1
  ) {
    throw new Error('Bail GitLab incompatible.')
  }
  return bail as BailEnregistre
}

function partie(bail: BailEnregistre): PartieBailGitLab {
  return {
    userId: bail.holder.userId,
    generation: bail.generation,
    expireLe: bail.expireLe,
  }
}

/** Chemin du fichier de bail d'une ressource, tous protocoles confondus. */
export function cheminBailRessourceGitLab(ressource: string): string {
  return cheminBail(hacherRessource(ressource))
}

/** Chemin du fichier de bail d'une ressource déjà décrite par son empreinte. */
export function cheminBailDepuisEmpreinteGitLab(resourceHash: string): string {
  if (!SHA256.test(resourceHash)) throw new Error('Empreinte de bail GitLab invalide.')
  return cheminBail(resourceHash)
}

/** Lit un bail observé par son chemin de dépôt, sans en tirer de droit.
 *  Lève si le contenu n'est pas un bail exploitable : l'observateur omet alors
 *  le badge plutôt que de le deviner. */
export function observerBailGitLab(
  contenu: string,
  chemin: string,
  legacy = false,
): BailObserveGitLab {
  const bail = lireBail(contenu, resourceHashDeChemin(chemin), legacy)
  return {
    userId: bail.holder.userId,
    machineId: bail.holder.machineId,
    sessionId: bail.holder.sessionId,
    generation: bail.generation,
    expireLe: bail.expireLe,
    legacy,
  }
}

function refusMutationConnu(erreur: unknown): boolean {
  return (
    (erreur instanceof ErreurEcritureGitLab && [400, 404, 409].includes(erreur.statut)) ||
    (erreur instanceof ErreurGitLab && [400, 404, 409].includes(erreur.statut))
  )
}
