/**
 *  Capacité de service des plages d'une base média.
 *
 *  Savoir lire par plages est une propriété du serveur et du compte qui
 *  l'utilise — pas du format du média, ni du réseau du poste. Elle est donc
 *  mesurée, jamais déduite : l'en-tête `Accept-Ranges` est absent des deux
 *  serveurs qualifiés alors que leurs plages fonctionnent, et présent
 *  parfois chez des serveurs qui les ignorent.
 *
 *  La mesure est paresseuse et sans écriture : aucun fichier jetable n'est
 *  créé. Elle porte sur le média choisi par la personne, à travers le même
 *  client que la lecture, et se résume à quelques kilo-octets lus.
 *
 *  Le résultat est caché par base déclarée, jamais par média : c'est le
 *  serveur qui change de comportement, pas le fichier.
 */

import type { ClientWebDAV } from '../webdav/client'
import { ErreurLectureMedia, informationMedia, lirePlage } from '../webdav/lectureMedia'

/** Trois états, et pas deux : « on ne sait pas encore » n'est pas « non ». */
export type CapacitePlages = 'inconnue' | 'oui' | 'non'

/** La sonde s'arrête bien avant la fin du média : quelques kilo-octets
 *  suffisent à prouver que le serveur sert la plage demandée. */
const OCTETS_SONDE = 4096

/** Capacité d'UNE base média déclarée (URL du dossier + compte). */
export class CapacitePlagesBase {
  private etat: CapacitePlages = 'inconnue'
  private mesureEnCours: Promise<CapacitePlages> | null = null

  get valeur(): CapacitePlages {
    return this.etat
  }

  /** Mesure si elle n'a pas déjà été faite, et ne recommence pas après un
   *  verdict : une panne réseau ne prouve rien sur le serveur. */
  async mesurer(client: ClientWebDAV, chemin: string): Promise<CapacitePlages> {
    if (this.etat !== 'inconnue') return this.etat
    this.mesureEnCours ??= sonder(client, chemin)
      .then((capacite) => {
        if (capacite !== 'inconnue') this.etat = capacite
        return capacite
      })
      .finally(() => {
        this.mesureEnCours = null
      })
    return this.mesureEnCours
  }
}

async function sonder(client: ClientWebDAV, chemin: string): Promise<CapacitePlages> {
  let taille: number | null
  try {
    taille = (await informationMedia(client, chemin)).taille
  } catch (erreur) {
    // Un fichier absent ou des droits refusés ne sont pas une capacité : ils
    // remontent à l'interface, qui affiche l'indisponibilité.
    if (
      erreur instanceof ErreurLectureMedia &&
      (erreur.motif === 'fichier-absent' || erreur.motif === 'droits')
    ) {
      throw erreur
    }
    return 'inconnue'
  }
  if (taille === 0) return 'inconnue' // fichier vide : il n'y a rien à sonder

  // Une plage fermée borne aussi le trafic lorsque le serveur ne publie pas
  // la taille. Un petit fichier peut répondre jusqu'à sa propre fin.
  const plage = {
    debut: 0,
    fin: taille === null ? OCTETS_SONDE - 1 : Math.min(OCTETS_SONDE, taille) - 1,
  }
  try {
    const lecture = await lirePlage(client, chemin, plage, { limite: OCTETS_SONDE })
    await vider(lecture)
    return 'oui'
  } catch (erreur) {
    if (
      erreur instanceof ErreurLectureMedia &&
      (erreur.motif === 'plage-non-honoree' || erreur.motif === 'plage-incoherente')
    ) {
      return 'non'
    }
    return 'inconnue'
  }
}

/** Lit la sonde jusqu'à sa limite, puis coupe la requête. */
async function vider(lecture: {
  corps: ReadableStream<Uint8Array>
  annuler: () => void
}): Promise<void> {
  try {
    const lecteur = lecture.corps.getReader()
    for (;;) {
      const { done } = await lecteur.read()
      if (done) return
    }
  } finally {
    lecture.annuler()
  }
}
