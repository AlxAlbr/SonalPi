/**
 *  Suppression d'un entretien sur un dépôt GitLab.
 *
 *  Le retrait est publié sous deux droits — celui du corpus et celui de
 *  l'entretien — dans un seul commit : le `corpus.json` qui ne référence plus
 *  l'entretien, le déplacement de son JSON vers une archive, et le
 *  renouvellement des deux baux. Ou rien de tout cela n'existe.
 *
 *  Les sauvegardes et les PNG ne sont pas dans le dépôt : ils appartiennent au
 *  seul miroir local, et le plan qui les archive est distinct du plan distant.
 *  C'est ce qui distingue cette suppression d'une transaction de définitions :
 *  son commit ne répare pas tout, un tirage ne sait pas où sont ses `.bak`.
 */

import { createHash } from 'node:crypto'
import type { PlanSuppressionEntretien } from '../transactionsFichiers'
import type { CorpusFichier } from '../../shared/format'

/** Dossier d'archive, sous la racine du corpus. Le miroir l'ignore : seul le
 *  dépôt GitLab porte l'historique du JSON retiré. */
export const DOSSIER_ARCHIVE = 'corbeille'

/** Ce que la suppression publie, et ce qu'elle archive de son côté. */
export interface PlanSuppressionDistant {
  readonly operationId: string
  readonly entretienId: string
  /** Chemin distant du JSON d'entretien avant retrait. */
  readonly cheminSource: string
  /** Chemin d'archive choisi une fois pour toutes, et enregistré tel quel. */
  readonly cheminArchive: string
  /** SHA-256 du JSON déplacé : seule preuve de ce que l'archive contient. */
  readonly empreinteArchive: string
  /** Membership publié après retrait, avec ses références ajustées. */
  readonly corpusApres: CorpusFichier
  /** Archivage purement local : l'entretien, ses sauvegardes et ses PNG. */
  readonly planLocal: PlanSuppressionEntretien
}

/** Empreinte du JSON déplacé, relevée pendant la préparation.
 *  Elle permet de reconnaître l'archive sans transporter son contenu. */
export function empreinteArchive(contenu: string): string {
  return createHash('sha256').update(contenu, 'utf8').digest('hex')
}

/** Suffixe stable d'une opération : une reprise après redémarrage retrouve la
 *  même archive, et deux tentatives ne s'échangent pas leurs fichiers. */
export function suffixeArchive(operationId: string): string {
  return createHash('sha256').update(operationId, 'utf8').digest('hex').slice(0, 8)
}

/** Archive distante d'un entretien retiré.
 *
 *  Le premier nom est `corbeille/<id>.json`. S'il est déjà pris, un suffixe
 *  stable dérivé de l'opération le rend non conflictuel — et ce chemin exact
 *  est écrit dans le journal, donc rejoué à l'identique après un arrêt. Deux
 *  noms pris sont un refus explicite : on n'écrase jamais une archive. */
export async function choisirDestinationArchive(
  entretienId: string,
  operationId: string,
  existe: (chemin: string) => Promise<boolean>,
): Promise<string> {
  const prefere = cheminArchive(entretienId)
  if (!await existe(prefere)) return prefere
  const suffixe = suffixeArchive(operationId)
  const alternatif = `${prefere.slice(0, -'.json'.length)}.${suffixe}.json`
  if (!await existe(alternatif)) return alternatif
  throw new Error(
    `Deux archives de « ${entretienId} » sont déjà prises sur GitLab. `
    + 'Déplacez-les ou renommez l’entretien avant de le supprimer.',
  )
}

function cheminArchive(entretienId: string): string {
  return `${DOSSIER_ARCHIVE}/${entretienId}.json`
}
