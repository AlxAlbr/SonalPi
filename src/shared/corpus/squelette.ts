/**
 *  Squelette d'un NOUVEAU corpus V2 — partagé par la création LOCALE
 *  (`CorpusStore.amorcer`) et la création DISTANTE
 *  (`PublieurCorpus.publierSquelette`), pour que les deux chemins produisent
 *  exactement le même codebook par défaut.
 *
 *  Fonction pure : aucun accès disque ni réseau ; l'appelant écrit lui-même
 *  le résultat (sur disque ou sur le serveur).
 */

import { FORMAT_VERSION, type CorpusFichier } from '../format'

/** Un corpus V2 vierge : le codebook par défaut (les 4 catégories Pondérations), tous les autres blocs vides. `nom` est le nom de projet ;
 *  il est absent pour une amorce locale nue, qui le reçoit ensuite par `poserNom`. */
export function squeletteCorpus(nom?: string): CorpusFichier {
  const blanc = '#ffffff'
  const codebook = {
    cat_001: { id: 'cat_001', nom: 'Pondérations', couleur: blanc, ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
    cat_002: { id: 'cat_002', nom: '★★★ Très important', couleur: blanc, taille: 24, ordre: 1, parent: 'cat_001', actif: true, codeExport: 'cat_002' },
    cat_003: { id: 'cat_003', nom: '★★☆ Assez important', couleur: blanc, taille: 22, ordre: 2, parent: 'cat_001', actif: true, codeExport: 'cat_003' },
    cat_004: { id: 'cat_004', nom: '★☆☆ Important', couleur: blanc, taille: 20, ordre: 3, parent: 'cat_001', actif: true, codeExport: 'cat_004' },
  }
  const corpus: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    ...(nom !== undefined ? { nom } : {}),
    codebook,
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {},
  }
  return corpus
}
