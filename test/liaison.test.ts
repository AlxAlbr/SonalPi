import { describe, test, expect } from 'vitest'
import { detecterAffixeLiaison, suggestionCoeur } from '../src/shared/entretien/anon/liaison'
import {
  aplatir,
  occurrencesDe,
  plageVersPM,
  instructionsValiderAnon,
} from '../src/shared/entretien/anon'
import type { MotsLiaisonParams } from '../src/shared/format'

/**
 * Mots de liaison / articles (4b-B) : à la validation d'une entité à affixe
 * (« à Lyon »), proposer l'entité-cœur (« Lyon ») avec son pseudo rogner.
 * Deux couches testées ici :
 *  - la DÉTECTION pure (`detecterAffixeLiaison`) : affixe en tête, cœur non
 *    vide et capitalisé, pseudo rogner du même geste ;
 *  - la DÉCISION complète (`suggestionCoeur`) : réglage, invariants
 *    multi-alias / multi-pseudo, règle-cœur déjà existante.
 */

const REGLAGE: MotsLiaisonParams = {
  actif: true,
  liste: ['à', 'de', 'd', 'du', 'des', 'au', 'aux', 'en', 'chez', 'dans', 'sur', 'pour'],
}

describe('detecterAffixeLiaison — détection de l\u2019entité-cœur', () => {
  test('affixe simple : « à Lyon » → « Lyon », pseudo repris tel quel', () => {
    expect(detecterAffixeLiaison('à Lyon', 'une grande ville', REGLAGE.liste)).toEqual({
      entiteCoeur: 'Lyon',
      pseudoCoeur: 'une grande ville',
    })
  })

  test('scénario complet : « dans une grande ville » → seul « dans » est rogner', () => {
    // « une » n'est pas un mot de liaison de la liste (pas d'indéfinis) :
    // le rognage s'arrête dès le premier token hors liste.
    expect(detecterAffixeLiaison('à Lyon', 'dans une grande ville', REGLAGE.liste)).toEqual({
      entiteCoeur: 'Lyon',
      pseudoCoeur: 'une grande ville',
    })
  })

  test('affixe multi-mots consécutifs : « devant la Maison » (liste étendue)', () => {
    expect(detecterAffixeLiaison('devant la Maison', 'X', ['devant', 'la'])).toEqual({
      entiteCoeur: 'Maison',
      pseudoCoeur: 'X',
    })
  })

  test('ponctuation et espaces des bords sont rognés avant analyse', () => {
    expect(detecterAffixeLiaison('  “à Lyon.”  ', '« Ville »', REGLAGE.liste)).toEqual({
      entiteCoeur: 'Lyon',
      pseudoCoeur: 'Ville',
    })
  })

  test('garde de capitalisation : « de fait » ne propose rien', () => {
    expect(detecterAffixeLiaison('de fait', 'X', REGLAGE.liste)).toBeNull()
  })

  test('cœur vide : « à », « au » seuls ne proposent rien', () => {
    expect(detecterAffixeLiaison('à', 'X', REGLAGE.liste)).toBeNull()
    expect(detecterAffixeLiaison('au', 'X', REGLAGE.liste)).toBeNull()
  })

  test('affixe INTERNE : « Maison des Habitants » ne propose rien (tête uniquement)', () => {
    expect(detecterAffixeLiaison('Maison des Habitants', 'X', REGLAGE.liste)).toBeNull()
  })

  test('sans affixe : « Lyon » seul ne propose rien', () => {
    expect(detecterAffixeLiaison('Lyon', 'une grande ville', REGLAGE.liste)).toBeNull()
  })

  test('pseudo SANS affixe repris tel quel ; pseudo tout-en-liaisons jamais vide', () => {
    expect(detecterAffixeLiaison('chez Dupont', 'Anonyme', REGLAGE.liste)?.pseudoCoeur).toBe('Anonyme')
    // Tout le pseudo est un mot de liaison : on ne rogne pas (cœur vide interdit).
    expect(detecterAffixeLiaison('de Lyon', 'au', REGLAGE.liste)?.pseudoCoeur).toBe('au')
  })

  test('élision : « d\u2019une » n\u2019est PAS reconnue comme affixe (choix assumé)', () => {
    expect(detecterAffixeLiaison('de Lyon', 'd’une grande ville', REGLAGE.liste)).toEqual({
      entiteCoeur: 'Lyon',
      pseudoCoeur: 'd’une grande ville',
    })
  })

  test('comparaison insensible à la casse avec la liste (« De Lyon »)', () => {
    expect(detecterAffixeLiaison('De Lyon', 'X', REGLAGE.liste)?.entiteCoeur).toBe('Lyon')
  })
})

describe('suggestionCoeur — décision complète (réglage + invariants + doublon)', () => {
  test('réglage absent, désactivé ou à liste vide → aucune proposition', () => {
    expect(suggestionCoeur(undefined, 'à Lyon', 'X', [])).toBeNull()
    expect(suggestionCoeur({ actif: false, liste: REGLAGE.liste }, 'à Lyon', 'X', [])).toBeNull()
    expect(suggestionCoeur({ actif: true, liste: [] }, 'à Lyon', 'X', [])).toBeNull()
  })

  test('multi-alias (« Lyon/Lyons ») et multi-pseudo (« Claire / Rebecca ») → rien', () => {
    expect(suggestionCoeur(REGLAGE, 'à Lyon/Lyons', 'X', [])).toBeNull()
    expect(suggestionCoeur(REGLAGE, 'à Claire', 'Claire / Rebecca', [])).toBeNull()
  })

  test('règle-cœur déjà existante (brouillon, entretien OU corpus) → pas de question', () => {
    const cles = ['lyon', 'autre']
    expect(suggestionCoeur(REGLAGE, 'à Lyon', 'X', cles)).toBeNull()
    // Une cle d'ALIAS existante couvre aussi le cœur (« Lyon/Lyons » posé).
    expect(suggestionCoeur(REGLAGE, 'à Lyon', 'X', ['lyon/lyons'])).toBeNull()
    expect(suggestionCoeur(REGLAGE, 'à Lyon', 'X', ['paris'])).toEqual({
      entiteCoeur: 'Lyon',
      pseudoCoeur: 'X',
    })
  })
})

describe('scénario utilisateur — acceptation puis règle plus large (incluses)', () => {
  const TEXTE = 'J’habite à Lyon. Je suis de Lyon.'
  const DOC = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: TEXTE }] }],
  }
  const X = aplatir(DOC)
  const texteEntre = (f: number, t: number) => TEXTE.slice(f - 1, t - 1)

  function plage(sousChaine: string, k = 0) {
    const pl = occurrencesDe(X.texte, sousChaine)[k]
    return plageVersPM(X, pl.from, pl.to)!
  }

  function occurrence(id: string, p: { from: number; to: number }, pseudo: string) {
    return {
      id,
      type: 'anon' as const,
      auteur: 'max',
      from: p.from,
      to: p.to,
      pseudo,
      etat: 'anonymise' as const,
    }
  }

  test('« Lyon » accepté pose TOUTES ses occurrences, y compris dans « je suis de Lyon »', () => {
    const lyons = [plage('Lyon', 0), plage('Lyon', 1)]
    let n = 0
    const r = instructionsValiderAnon([], lyons, 'lyon', 'une grande ville', texteEntre, () => `n${++n}`)
    expect(r.poser).toHaveLength(2)
  })

  test('ensuite « de Lyon » validé par-dessus : le large absorbe l’étroit (incluse conservée)', () => {
    // État après acceptation de « Lyon » : les DEUX occurrences sont barrées.
    let n = 0
    const genId = () => `n${++n}`
    const lyons = [plage('Lyon', 0), plage('Lyon', 1)]
    const posees = instructionsValiderAnon([], lyons, 'lyon', 'une grande ville', texteEntre, genId)
    const annotations = posees.poser.map((o) => occurrence(o.id, o, o.pseudo))
    // Validation de « de Lyon » → match sur la seconde occurrence seulement.
    const deLyon = plage('de Lyon')
    const r = instructionsValiderAnon(annotations, [deLyon], 'de lyon', 'd’une grande ville', texteEntre, genId)
    // L'occurrence large est posée PAR-DESSUS, sans rien retirer : « Lyon »
    // devient incluse masquée et réapparaîtra telle quelle au retrait.
    expect(r.poser).toEqual([
      { id: 'n3', from: deLyon.from, to: deLyon.to, pseudo: 'd’une grande ville' },
    ])
    expect(r.relabel).toEqual([])
    // Et la suggestion ne se serait PAS reproduite : « Lyon » existe déjà
    // parmi les lignes (couvert par suggestionCoeur, testé ci-dessus).
  })

  test('l’exception sur « Lyon » bloque au contraire TOUTE pose de « de Lyon »', () => {
    const lyon2 = plage('Lyon', 1) // celle de « je suis de Lyon »
    const exception = { ...occurrence('a-exc', lyon2, 'une grande ville'), etat: 'exception' as const }
    const deLyon = plage('de Lyon')
    const r = instructionsValiderAnon([exception], [deLyon], 'de lyon', 'd’une grande ville', texteEntre, () => 'nX')
    // Une exception ne repasse jamais à traiter : le match reste en clair.
    expect(r.poser).toEqual([])
  })
})
