import { createHash, randomUUID } from 'node:crypto'
import {
  ClientGitLab,
  ErreurEcritureGitLab,
  ErreurGitLab,
} from './client'
import { DUREE_BAIL_GITLAB_MS } from './parametresSession'

export const DUREE_BAIL_MS = DUREE_BAIL_GITLAB_MS
const VERSION_BAIL = 2
const VERSION_BAIL_LEGACY = 1
const PROTOCOLE_BAIL = 'sonal-bail-v2'
const PROTOCOLE_BAIL_LEGACY = 'sonal-bail-v1'
const PREFIXE_BAIL = '.sonal/verrous'
const SEPARATEUR_RESSOURCE = '\u0000'

export interface IdentiteBailGitLab {
  userId: string
  machineId: string
  sessionId: string
}

export interface ActionCommitGitLab {
  action: 'create' | 'update' | 'delete' | 'move'
  file_path: string
  previous_path?: string
  content?: string
  encoding?: 'text' | 'base64'
  last_commit_id?: string
}

export interface FichierGitLab {
  chemin: string
  commitId: string
  contenu: string
}

export interface DepotCommitsGitLab {
  lireFichier(chemin: string, ref: string): Promise<FichierGitLab | null>
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
  expireLe: string
  legacy: boolean
}

export interface OptionsBailGitLab {
  branche: string
  depot: DepotCommitsGitLab
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
      }>(
        this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}`),
        { ref },
        { tailleMaxOctets: 256 * 1024 },
      )
      if (
        reponse.corps.file_path !== chemin ||
        reponse.corps.encoding !== 'base64' ||
        !reponse.corps.last_commit_id
      ) {
        throw new Error('Réponse de fichier GitLab invalide.')
      }
      const contenu = Buffer.from(reponse.corps.content, 'base64').toString('utf8')
      return {
        chemin,
        commitId: reponse.corps.last_commit_id,
        contenu,
      }
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

  constructor(private readonly options: OptionsBailGitLab) {
    if (!options.branche.trim()) throw new Error('Branche GitLab manquante.')
    this.maintenant = options.maintenant ?? Date.now
    this.nouvelleGeneration = options.nouvelleGeneration ?? randomUUID
    this.dureeBailMs = options.dureeBailMs ?? DUREE_BAIL_MS
    this.ressourcesLegacy = [...new Set(options.ressourcesLegacy ?? [])]
    if (!Number.isSafeInteger(this.dureeBailMs) || this.dureeBailMs < 60_000) {
      throw new Error('Durée du bail GitLab invalide.')
    }
  }

  async acquireRessource(ressource: string): Promise<ResultatAcquisitionBailGitLab> {
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
    const ancien = await this.refusLegacy()
    if (ancien) return ancien
    const resourceHash = hacherRessource(ressource)
    const chemin = cheminBail(resourceHash)
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
      return 'libere'
    } catch (erreur) {
      if (refusMutationConnu(erreur)) {
        etat.invalide = true
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

/** Lit un bail observé par son chemin de dépôt, sans en tirer de droit.
 *  Lève si le contenu n'est pas un bail exploitable : l'observateur omet alors
 *  le badge plutôt que de le deviner. */
export function observerBailGitLab(contenu: string, chemin: string): BailObserveGitLab {
  const bail = lireBail(contenu, resourceHashDeChemin(chemin), true)
  return {
    userId: bail.holder.userId,
    machineId: bail.holder.machineId,
    expireLe: bail.expireLe,
    legacy: bail.version === VERSION_BAIL_LEGACY || bail.protocole === PROTOCOLE_BAIL_LEGACY,
  }
}

function refusMutationConnu(erreur: unknown): boolean {
  return (
    (erreur instanceof ErreurEcritureGitLab && [400, 404, 409].includes(erreur.statut)) ||
    (erreur instanceof ErreurGitLab && [400, 404, 409].includes(erreur.statut))
  )
}
