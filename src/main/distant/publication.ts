/**
 *  Publication initiale d'un corpus distant : créer un corpus DIRECTEMENT sur
 *  le serveur Nextcloud.
 *
 *  Le squelette est construit en mémoire (`squeletteCorpus`, partagé avec
 *  l'amorce locale) et posé directement sur le serveur ; le miroir local
 *  n'apparaît qu'ensuite, créé par le tirage de l'ouverture. Aucun fichier
 *  temporaire, donc aucune fenêtre de crash avec temporaire orphelin ; une
 *  reprise après échec réseau est naturellement idempotente.
 *
 *  Le renderer ne voit jamais cette classe : il ne connaît que l'IPC
 *  `distant:creer`. Les tests la branchent sur un serveur WebDAV via le fetch
 *  injectable.
 */

import {
  ClientWebDAV,
  ErreurHttp,
  type ConfigWebDAV,
  type ImplementationFetch,
} from '../webdav/client'
import { squeletteCorpus } from '../../shared/corpus/squelette'

/** La cible contient déjà un corpus (`corpus.json` présent au moment du PUT :
 *  soit il y était avant l'appel, soit un collègue a publié entre-temps —
 *  c'est le serveur qui tranche les courses). Refus net, rien d'écrasé :
 *  l'utilisateur passe par « Ouvrir un corpus distant ». */
export class ErreurDejaCorpus extends Error {
  constructor() {
    super(
      'Un corpus existe déjà à cet emplacement sur le serveur — ' +
        'utilisez « Ouvrir un corpus distant » pour l’ouvrir.',
    )
    this.name = 'ErreurDejaCorpus'
  }
}

export class PublieurCorpus {
  constructor(
    /** Racine DAV du futur corpus (le dossier peut ne pas exister encore). */
    private readonly config: ConfigWebDAV,
    private readonly faireRequete: ImplementationFetch = fetch,
  ) {}

  private client(baseUrl?: string): ClientWebDAV {
    return new ClientWebDAV(
      baseUrl ? { ...this.config, baseUrl } : this.config,
      this.faireRequete,
    )
  }

  /** Prépare la chaîne de dossiers menant à la racine du corpus.
   *
   *  Stratégie en deux temps. D'abord repérer le plus long PRÉFIXE EXISTANT
   *  par PROPFIND descendant : les préfixes techniques d'un Nextcloud
   *  (`remote.php`, `dav`…) ne sont pas adressables en MKCOL (réponses 404 ou
   *  500), inutile d'essayer de les créer. Ensuite créer les segments
   *  manquants parent-d'abord : un MKCOL sans parent répond 409.
   *
   *  Méthode publique car l'ordre compte : la sonde de préconditions écrit
   *  dans la cible et échoue si le dossier n'existe pas encore. Le flux de
   *  création fait donc preparerRacine(), puis la sonde, puis la publication.
   *
   *  Renvoie `feuilleCreee` : la cible elle-même n'existait pas avant l'appel
   *  (permet un nettoyage honnête si une étape ultérieure refuse). */
  async preparerRacine(): Promise<{ feuilleCreee: boolean }> {
    const url = new URL(this.config.baseUrl.replace(/\/+$/, ''))
    const segments = url.pathname.split('/').filter(Boolean)
    // Plus long préfixe existant, des parents de la feuille vers l'origine.
    let existant = 0
    for (let k = segments.length - 1; k >= 1; k--) {
      const prefixe = [url.origin, ...segments.slice(0, k)].join('/')
      try {
        await this.client(prefixe).propfind('')
        existant = k
        break
      } catch {
        /* absent ou non adressable : remonter vers l'origine */
      }
    }
    const feuilleCreee = existant < segments.length
    // Créer les segments manquants, du plus proche au plus profond.
    for (let i = existant; i < segments.length; i++) {
      // Parent sans barre finale même au premier segment (sinon double slash).
      const parent = [url.origin, ...segments.slice(0, i)].join('/')
      await this.client(parent).creerDossier(segments[i])
    }
    return { feuilleCreee }
  }

  /** Publie un corpus neuf à la racine visée :
   *  1. chaîne de dossiers (`preparerRacine`) ;
   *  2. dossiers techniques (`entretiens/`, `verrous/`, `presence/`,
   *     `corbeille/`) ;
   *  3. PUT `corpus.json` sous `If-None-Match: *`, garde atomique qui refuse
   *     tout écrasement d'un corpus existant.
   *  Pas de verrou à la naissance : le corpus naît complet en un PUT, rien
   *  n'est à protéger ; la première écriture concurrente passera par le
   *  protocole de verrou habituel. */
  async publierSquelette(nom?: string): Promise<void> {
    await this.preparerRacine()
    const client = this.client()
    await client.mkcol('entretiens')
    await client.mkcol('verrous')
    await client.mkcol('presence')
    await client.mkcol('corbeille')
    try {
      await client.putTexte('corpus.json', JSON.stringify(squeletteCorpus(nom), null, 2), {
        ifNoneMatch: '*',
      })
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) throw new ErreurDejaCorpus()
      throw e
    }
  }
}
