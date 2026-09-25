/** Contrats communs aux corpus WebDAV et GitLab, sans secret retourné au renderer. */
import type { OuvertureCorpus } from './format'
import type { DestinationGitLabPublic } from './gitlab'
import type { DestinationWebDAVPublic } from './webdav'

export type DestinationDistantePublic = DestinationWebDAVPublic | DestinationGitLabPublic

/** Progression d'un transfert binaire :
 *  émise périodiquement par le main pendant le pull miroir (« rapatriement ») et le téléversement.
 *  `total` null si le serveur n'expose pas la taille. */
export interface ProgressionTransfert {
  sens: 'rapatriement' | 'televersement'
  chemin: string // relatif au corpus (cible serveur dans les deux cas)
  octets: number // transférés depuis le début de CE fichier
  total: number | null
}

/** Ouverture d'un corpus distant : le corpus vient du MIROIR local (`userData/miroirs/<id>`)
 *  fraîchement tiré — le renderer ne sait pas faire la différence avec un corpus local :
 *  c'est voulu. Le pull d'ouverture livre aussi l'état des verrous (badges fiables,
 *  sans second aller-retour). */
export interface OuvertureDistante extends OuvertureCorpus {
  distant: DestinationDistantePublic
  verrous: EntreeVerrouPublic[]
  /** Audios désignés non rapatriés par le pull d'ouverture (403/404/réseau)
   *  — alimente l'étiquette du lecteur dès l'arrivée.
   *  Champ optionnel : absent si rien à signaler. */
  inaccessibles?: { chemin: string; raison: string }[]
}

/** État PUBLIC d'un fichier verrou — ce que l'UI affiche (« tenu par X depuis HH:MM »).
 *  Aucun champ de protocole (sessionId, ttl) ne traverse le pont. */
export interface EtatVerrouPublic {
  userId: string
  machineId: string
  acquiredAt: string // ISO
}

/** Une entrée `verrous/` vue au pull, avec son contenu décodé (null = fichier illisible/corrompu —
 *  badge omis, jamais deviné). Les verrous de NOTRE propre session sont filtrés côté main :
 *  un badge « tenu par moi » sur la carte que je suis en train d'éditer n'apporte rien. */
export interface EntreeVerrouPublic {
  chemin: string // « verrous/<id>.lock.json »
  etag: string | null
  contenu: EtatVerrouPublic | null
}

/** Résultat d'un tirage (pull incrémental par ETags). */
export interface ResultatTiragePublic {
  telecharges: string[]
  corbeille: string[]
  verrous: EntreeVerrouPublic[]
  /** Audios désignés (meta.audioDistant) dont la récupération a échoué (403/404/réseau) —
   *  matière des badges « audio inaccessible ». Non bloquant : le prochain tirage re-tentera.
   *  Absent si corpus local ou rien à signaler. */
  inaccessibles?: { chemin: string; raison: string }[]
  /** Présences vivantes des autres postes — informatif, jamais décisionnel.
   *  Absent si corpus local. */
  presences?: PresencePublic[]
  date: string
}

/** Présence informative : qui consulte quoi, SANS valeur décisionnelle (la décision,
 *  c'est le verrou). Une présence > 10 min est morte (filtrée). */
export interface PresencePublic {
  userId: string
  machineId: string
  entretienOuvert: string | null
  refreshedAt: string // ISO
}

/** Verrou orphelin détecté à l'ouverture du corpus (crash sans libération),
 *  proposé au dialogue « reprendre / abandonner ». */
export interface OrphelinDistant {
  cheminVerrou: string // « verrous/<id>.lock.json »
  id: string // id de l'entretien (extrait du chemin)
  userId: string
  machineId: string
  acquiredAt: string // ISO
}

/** Raison publique d'une suspension de session. */
export type RaisonDegradationSession =
  | 'droit-perdu'
  | 'conflit'
  | 'droits'
  | 'limite'
  | 'indetermine'
  | 'reseau'

/** État d'une session d'écriture distante exposé au renderer. */
export type EtatSessionPublic =
  | { etat: 'aucune' }
  | { etat: 'a-nous'; dernierPubli: string | null; sale: boolean }
  | { etat: 'degrade'; raison?: RaisonDegradationSession }

/** Résultat explicite d'une fermeture de session d'écriture. */
export type ResultatFermetureSession =
  | { fermee: true }
  | {
      fermee: false
      raison: 'publication' | 'liberation'
      message?: string
    }

/** Bilan d'une fermeture de toutes les sessions avant une bascule. */
export interface ResultatFermetureToutes {
  fermees: string[]
  bloquees: Array<{
    id: string
    raison: 'publication' | 'liberation'
    message?: string
  }>
}

/** Une copie de DIVERGENCE mise de côté après une rétrogradation de publication 412 —
 *  matière du dialogue de fusion assistée.
 *  Le contenu ne traverse le pont que sur demande explicite (`lireDivergence`). */
export interface DivergenceDistante {
  chemin: string // « sessions/<id>.divergence-<sessionId>.copie-<uuid>.json » (relatif miroir)
  id: string // id de l'entretien concerné
  sessionId: string // session d'écriture qui a subi la rétrogradation
  date: string // ISO (mtime de la copie — affichage « copie du JJ/MM HH:MM »)
}

/** Services du corpus distant courant, selon les capacités de son fournisseur. */
export interface ApiDistant {
  stockageSecuriseDisponible(): Promise<boolean>
  tirer(): Promise<ResultatTiragePublic | null>
  listerDossier(dossier: string): Promise<{ entrees: { nom: string; dossier: boolean }[] } | null>
  designerAudio(id: string, cheminAudio: string): Promise<{
    ok: boolean
    raison?: string
    tenuPar?: string
  }>
  televerserAudio(sourceLocale: string, cheminCible: string): Promise<{
    ok: boolean
    raison?: string
    suggere?: string
  }>
  orphelins(): Promise<OrphelinDistant[] | null>
  surProgression(cb: (progression: ProgressionTransfert) => void): () => void
  reprendreOrphelin(cheminVerrou: string): Promise<{ ok: boolean; raison?: string }>
  abandonnerOrphelin(cheminVerrou: string): Promise<void>
  listerDivergences(): Promise<DivergenceDistante[]>
  lireDivergence(chemin: string): Promise<unknown>
  supprimerDivergence(chemin: string): Promise<void>
  noterEntretienOuvert(id: string | null): Promise<void>
}
