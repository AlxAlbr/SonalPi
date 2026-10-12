/**
 *  FUSION ASSISTÉE d'une copie de DIVERGENCE.
 *
 *  Quand une publication finit en 412 (contournement du verrou : édition via
 *  l'UI web, forçage), la couche session rétrograde. Elle met la copie locale
 *  de côté hors serveur sous un nom unique :
 *  `sessions/<id>.divergence-<sessionId>.copie-<uuid>.json`.
 *  La copie n'est ni perdue ni publiée en silence.
 *  Ce module porte les décisions pures du dialogue de réconciliation.
 *
 *  Politique : les charges utiles sont largement fusionnables par
 *  construction — annotations/ancres par id opaque, locuteurs par index,
 *  valeurs EAV par clef, brouillons par entité. MAIS le texte ne se fusionne
 *  pas : `corpsTexte` identique → fusion automatique proposée ; différent →
 *  choix explicite (garder de côté / jeter), jamais de merge de texte.
 */

import type { EntretienFichier } from '../format'
import { memoriserDefinitionLocale, normaliserPseudosDeclares } from './anon/definitionsLocales'
import { cleEntite } from './anon/brouillonsAnon'

/** Les deux textes sont-ils identiques (doc ProseMirror canonique) ?
 *  Garde de la fusion automatique : des positions `from/to` valables chez nous le sont partout —
 *  sinon, aucune garantie, on ne fusionne pas les annotations. */
export function corpsIdentiques(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface BilanFusion {
  /** Le nombre d'éléments apportés PAR LA COPIE (absents du courant). */
  ajouts: { annotations: number; ancres: number; reperesPassages: number; locuteurs: number; valeurs: number }
}

/** Fusionne LA COPIE DE DIVERGENCE dans la version courante (celle du serveur,
 *  fraîchement obtenue sous notre verrou) : union par id, le courant gagne les conflits —
 *  rien de déjà présent n'est modifié, seuls les apports de la copie s'ajoutent.
 *  Retourne un NOUVEAU fichier ; les entrées ne bougent pas.
 *
 *  Pré-requis (vérifier `corpsIdentiques` AVANT) : même texte → mêmes
 *  positions, les annotations rapatriées restent calées.
 */
export function fusionnerEntretiens(courant: EntretienFichier, copie: EntretienFichier): { fusion: EntretienFichier } & BilanFusion {
  const idsAnnotations = new Set(courant.annotations.map((a) => a.id))
  const annotations = [...courant.annotations]
  for (const a of copie.annotations) {
    if (!idsAnnotations.has(a.id)) {
      annotations.push(a)
      idsAnnotations.add(a.id)
    }
  }

  // Ancres : PAS d'id (position + temps, cf. audio.ts). Textes identiques →
  // positions comparables : union par `pos`, le courant gagne les doublons.
  const posAncres = new Set(courant.ancres.map((a) => a.pos))
  const ancres = [...courant.ancres]
  let ancresAjoutees = 0
  for (const a of copie.ancres) {
    if (!posAncres.has(a.pos)) {
      ancres.push(a)
      posAncres.add(a.pos)
      ancresAjoutees += 1
    }
  }
  ancres.sort((x, y) => x.pos - y.pos)

  const idsReperes = new Set((courant.reperesPassages ?? []).map((repere) => repere.id))
  const reperesPassages = [...(courant.reperesPassages ?? [])]
  for (const repere of copie.reperesPassages ?? []) {
    if (!idsReperes.has(repere.id)) {
      reperesPassages.push(repere)
      idsReperes.add(repere.id)
    }
  }

  // Locuteurs : l'identité stable est l'INDEX (position ordinale du tour).
  const indexesLocuteurs = new Set(courant.locuteurs.map((l) => l.index))
  const locuteurs = structuredClone(courant.locuteurs)
  let locuteursAjoutes = 0
  for (const l of copie.locuteurs) {
    if (!indexesLocuteurs.has(l.index)) {
      locuteurs.push(structuredClone(l))
      indexesLocuteurs.add(l.index)
      locuteursAjoutes += 1
    }
  }
  locuteurs.sort((a, b) => a.index - b.index)

  // Valeurs EAV : clef (cible, idVar) — le courant gagne, la copie complète.
  let valeursAjoutees = 0
  const valeursGen = { ...courant.meta.valeursGen }
  for (const [idVar, idMod] of Object.entries(copie.meta.valeursGen)) {
    if (!(idVar in valeursGen)) {
      valeursGen[idVar] = idMod
      valeursAjoutees += 1
    }
  }
  // valeursLoc : portées par chaque locuteur (par index).
  for (const l of locuteurs) {
    const copieLoc = copie.locuteurs.find((x) => x.index === l.index)
    if (!copieLoc?.valeursLoc || !l.valeursLoc) continue
    for (const [idVar, idMod] of Object.entries(copieLoc.valeursLoc)) {
      if (!(idVar in l.valeursLoc)) {
        l.valeursLoc[idVar] = idMod
        valeursAjoutees += 1
      }
    }
  }

  // Brouillons : un par entité — la copie n'apporte que les absents.
  const clesBrouillons = new Set(
    (courant.brouillonsAnon ?? []).map((b) => cleEntite(b.entite)),
  )
  const brouillons = [...(courant.brouillonsAnon ?? [])]
  for (const b of copie.brouillonsAnon ?? []) {
    if (!clesBrouillons.has(cleEntite(b.entite))) {
      brouillons.push(b)
      clesBrouillons.add(cleEntite(b.entite))
    }
  }

  // Multi-pseudo déclaré : union par clef, ordre préservé, sans doublon.
  const pseudosDeclares = normaliserPseudosDeclares(courant.pseudosDeclares ?? {})
  for (const [cle, pseudos] of Object.entries(normaliserPseudosDeclares(copie.pseudosDeclares ?? {}))) {
    const deja = pseudosDeclares[cle] ?? []
    const vus = new Set(deja.map((p) => p.toLowerCase()))
    const ajoutsPseudos = pseudos.filter((p) => !vus.has(p.toLowerCase()))
    if (ajoutsPseudos.length > 0) {
      pseudosDeclares[cle] = [...deja, ...ajoutsPseudos]
      valeursAjoutees += ajoutsPseudos.length
    }
  }

  const locales = structuredClone(courant.definitionsAnonLocales ?? [])
  for (const definition of copie.definitionsAnonLocales ?? []) {
    const existante = locales.find((d) => cleEntite(d.entite.join('/')) === cleEntite(definition.entite.join('/')))
    if (existante && JSON.stringify(existante) !== JSON.stringify(definition)) throw new Error('Définitions locales divergentes : résolution explicite requise avant fusion.')
    memoriserDefinitionLocale(locales, definition)
  }
  return {
    fusion: {
      ...courant,
      ...(locales.length || courant.definitionsAnonLocales || copie.definitionsAnonLocales ? { definitionsAnonLocales: locales } : {}),
      annotations,
      ancres,
      reperesPassages,
      locuteurs,
      meta: { ...courant.meta, valeursGen },
      brouillonsAnon: brouillons,
      pseudosDeclares,
    },
    ajouts: {
      annotations: annotations.length - courant.annotations.length,
      ancres: ancresAjoutees,
      reperesPassages: reperesPassages.length - (courant.reperesPassages ?? []).length,
      locuteurs: locuteursAjoutes,
      valeurs: valeursAjoutees,
    },
  }
}
