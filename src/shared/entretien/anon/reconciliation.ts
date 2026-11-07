/**
 *  RÉCONCILIATION POST-PULL — la projection multi-utilisateur du dialogue de
 *  portée (règles corpus vs lignes d'entretien).
 *
 *  Dans SonalPi2, une règle ne vit qu'au corpus ; l'entretien porte des brouillons et
 *  des occurrences standalone (« portée entretien »). En multi-user, une règle
 *  corpus partageant l'entité d'une ligne locale peut APPARAÎTRE PENDANT notre
 *  session (un collègue l'a poussée entre deux pulls) : au prochain pull qui
 *  ramène un `corpus.crp` modifié, on détecte ces divergences de pseudo et on
 *  ouvre LE MÊME dialogue qu'à la promotion (« Aligner / Garder les deux ») —
 *  jamais de divergence silencieuse.
 *
 *  Fonctions PURES, table de vérité testée : la couche renderer ne fait que
 *  projeter ses `LigneAnon` ici et brancher le résultat sur le dialogue.
 */

import type { RegleAnon } from '../../format'
import { scinderPseudos } from './pseudos'
import { parserAliases } from './alias'
import type { LigneAnon } from './brouillonsAnon'

/** Une divergence de portée détectée après un tirage. */
export interface DivergencePortee {
  /** Entité concernée (forme affichable de la ligne locale). */
  entite: string
  /** D'où vient l'état local : brouillon (0 occurrence) ou occurrences posées. */
  cas: 'brouillon' | 'fichier'
  /** Pseudo(s) locaux (ce que l'entretien a déclaré, standalone). */
  pseudosLocaux: string[]
  regleId: string
  reglePseudos: string[]
}

/** Détecte les lignes locales (brouillon OU occurrences standalone)
 *  dont l'entité est désormais régie par une règle corpus aux pseudos différents.
 *  Les lignes déjà liées au corpus (`etat === 'corpus'`) sont ignorées :
 *  elles ont déjà résolu leur divergence. Ordre déterministe : celui des lignes.
 *
 *  NB : la redondance transitoire (règle présente des deux côtés < TTL)
 *  n'est PAS une divergence — justement parce qu'une ligne déjà liée ne
 *  déclenche rien ici.
 */
export function detecterDivergencesPortee(
  lignes: LigneAnon[],
  regles: RegleAnon[],
): DivergencePortee[] {
  const sorties: DivergencePortee[] = []
  for (const ligne of lignes) {
    if (ligne.etat === 'corpus') continue // déjà réglé (liée à sa règle)
    const regle = trouverReglePourEntite(regles, ligne.cle)
    if (!regle) continue // pas de règle corpus pour cette entité : rien à faire
    const pseudosLocaux = scinderPseudos(ligne.pseudo)
    if (pseudosLocaux.length === 0) continue
    const memes = memesPseudos(pseudosLocaux, regle.pseudos)
    if (memes) continue // même pseudo : coexistence bénigne, pas un conflit
    sorties.push({
      entite: ligne.entite,
      cas: ligne.etat === 'brouillon' ? 'brouillon' : 'fichier',
      pseudosLocaux,
      regleId: regle.id,
      reglePseudos: regle.pseudos,
    })
  }
  return sorties
}

/** La règle corpus qui régit cette entité (PARTAGE d'alias : la cle de la ligne —
 *  ou l'un des aliases de son groupe — peut être portée par la règle). */
function trouverReglePourEntite(regles: RegleAnon[], cle: string): RegleAnon | undefined {
  const cles = new Set(cle.toLowerCase().split('/'))
  return regles.find((r) =>
    r.entite.some((e) => parserAliases(e).some((a) => cles.has(a.toLowerCase()))),
  )
}

/** Mêmes pseudos (insensible à la casse, ordre indifférent). */
export function memesPseudos(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const vus = new Set(b.map((p) => p.toLowerCase()))
  return a.every((p) => vus.has(p.toLowerCase()))
}
