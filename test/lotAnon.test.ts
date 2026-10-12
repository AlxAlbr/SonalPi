import { describe, expect, test } from 'vitest'
import { regrouperCiblesAnon } from '../src/shared/corpus/lotAnon'
import { appliquerRegleAnonEntretienAvecBilan } from '../src/shared/entretien/anon/applicationMasse'
import { empreinteAnon } from '../src/shared/entretien/anon/classification'
import { fixturePseudonymisation } from './fixtures/pseudonymisation'

describe('contrats de validation des occurrences', () => {
  test('regroupe les listes sans perdre le choix explicite toutes et sans muter les entrées', () => {
    const cibles = [
      { entretienId: 'e1', regleId: 'r1', empreinte: 'version', plages: [{ from: 1, to: 5 }] },
      { entretienId: 'e1', regleId: 'r1', empreinte: 'version', toutes: true, plages: [{ from: 1, to: 5 }] },
    ]
    const avant = structuredClone(cibles)
    const { groupes, echecs } = regrouperCiblesAnon(cibles)
    expect(echecs).toEqual([])
    expect(groupes.get('e1')).toMatchObject({ toutes: true, plages: [{ from: 1, to: 5 }] })
    expect(cibles).toEqual(avant)
  })

  test.each(['regle', 'version'] as const)('refuse entièrement un entretien aux doublons de %s incompatibles', (divergence) => {
    const { groupes, echecs } = regrouperCiblesAnon([
      { entretienId: 'e1', regleId: 'r1', empreinte: 'v1' },
      { entretienId: 'e1', regleId: divergence === 'regle' ? 'r2' : 'r1', empreinte: 'v2' },
      { entretienId: 'e2', regleId: 'r1' },
    ])
    expect([...groupes.keys()]).toEqual(['e2'])
    expect(echecs.map((e) => e.id)).toEqual(['e1'])
  })

  test('détaille les mutations effectives, notamment exception vers anonymisée', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const data = entretiens[0].data
    const regle = regles[0]
    const empreinte = empreinteAnon(data, regle)
    const resultat = appliquerRegleAnonEntretienAvecBilan(data, regle, {
      empreinte, retirer: [{ from: 1, to: 5 }], retirerException: [{ from: 7, to: 12 }], plages: [{ from: 7, to: 12 }],
    })
    expect(resultat).toEqual({ nb: 3, actions: { poses: 1, retraits: 1, exceptionsAjoutees: 0, exceptionsRetirees: 1 } })
  })

  test.each(['sans-empreinte', 'position-invalide', 'decision-independante', 'actions-incompatibles'] as const)(
    'refuse %s sans toucher les sources', (cas) => {
      const { regles, entretiens } = fixturePseudonymisation()
      const data = entretiens[0].data
      const regle = regles[0]
      if (cas === 'decision-independante') delete data.annotations[0].regle
      const avant = structuredClone(data)
      const empreinte = cas === 'sans-empreinte' ? undefined : empreinteAnon(data, regle)
      const plage = cas === 'position-invalide' ? { from: 2, to: 5 } : { from: 1, to: 5 }
      expect(() => appliquerRegleAnonEntretienAvecBilan(data, regle, {
        empreinte, retirer: [plage], exception: cas === 'actions-incompatibles' ? [plage] : [],
      })).toThrow()
      expect(data).toEqual(avant)
    },
  )

  test('respecte le poids ProseMirror des sauts internes au paragraphe', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const data = entretiens[0].data
    data.annotations = []
    data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Avant' }, { type: 'hardBreak' }, { type: 'text', text: 'Lyon' },
    ] }] }
    const resultat = appliquerRegleAnonEntretienAvecBilan(data, regles[0], { toutes: true })
    expect(resultat.actions.poses).toBe(1)
    expect(data.annotations[0]).toMatchObject({ from: 7, to: 11 })
  })

  test('poser une exception déjà présente n’en crée pas une seconde', () => {
    const { regles, entretiens } = fixturePseudonymisation()
    const data = entretiens[0].data
    const regle = regles[0]
    const avant = structuredClone(data)
    const resultat = appliquerRegleAnonEntretienAvecBilan(data, regle, {
      empreinte: empreinteAnon(data, regle), exception: [{ from: 7, to: 12 }, { from: 7, to: 12 }],
    })
    expect(resultat.nb).toBe(0)
    expect(data).toEqual(avant)
  })
})
