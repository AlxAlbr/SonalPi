import { describe, expect, test } from 'vitest'
import {
  appliquerCommandeCas,
  normaliserCas,
  normaliserNomCas,
  retirerRattachementsCasEntretien,
  type Cas,
  type DependancesCas,
  type RattachementCas,
  referencesAjouteesCommandeCas,
} from '../src/shared/corpus/cas'

const creeLe = '2026-09-01T10:00:00.000Z'
const modifieLe = '2026-09-01T11:00:00.000Z'
const apres = '2026-09-01T12:00:00.000Z'

const deps: DependancesCas = {
  maintenant: () => apres,
  personneExiste: (id) => id === 'personne-1' || id === 'personne-2',
  entretienExiste: (id) => id === 'entretien-1' || id === 'entretien-2',
}

function rattachement(
  id = 'rattachement-1',
  entretienId = 'entretien-1',
  repereId = 'repere-1',
): RattachementCas {
  return {
    id,
    source: { entretienId, repereId },
    provenance: 'manuel',
    creeLe,
  }
}

function casPersonne(id: string, nom: string, personneId = 'personne-1'): Cas {
  return {
    id,
    nom,
    memo: '',
    creeLe,
    modifieLe,
    regles: [{ type: 'personne', personneId, inclureEnqueteurs: false }],
    rattachements: [],
  }
}

function creer(cas: Cas, dictionnaire: Record<string, Cas> = {}): Record<string, Cas> {
  return appliquerCommandeCas(dictionnaire, { type: 'creer', cas }, deps)
}

describe('cas — modèle analytique pur', () => {
  test('crée atomiquement un lot de cas et le rejoue sans changer les identités', () => {
    const nouveaux: Cas[] = [
      { ...casPersonne('c1', 'Marie'), regles: [{ type: 'personnes', membres: [
        { personneId: 'personne-1', inclureEnqueteurs: false },
        { personneId: 'personne-2', inclureEnqueteurs: true },
      ] }] },
      { ...casPersonne('c2', 'Dossier'), regles: [{ type: 'entretiens', entretienIds: ['entretien-1', 'entretien-2'] }] },
    ]
    const dictionnaire: Record<string, Cas> = {}
    appliquerCommandeCas(dictionnaire, { type: 'creer-lot', cas: nouveaux }, deps)
    expect(dictionnaire).toEqual({ c1: nouveaux[0], c2: nouveaux[1] })
    const avant = structuredClone(dictionnaire)
    appliquerCommandeCas(dictionnaire, { type: 'creer-lot', cas: structuredClone(nouveaux) }, deps)
    expect(dictionnaire).toEqual(avant)
    expect(dictionnaire.c1).not.toBe(nouveaux[0])
  })

  test('une collision ou une source disparue ne laisse aucun cas partiellement créé', () => {
    const premier = casPersonne('c1', 'Marie')
    const dictionnaire = creer(casPersonne('existant', 'Déjà là'))
    const avant = structuredClone(dictionnaire)
    for (const dernier of [
      casPersonne('c2', 'Déjà là'),
      casPersonne('c2', ' marie '),
      casPersonne('c1', 'Autre'),
      casPersonne('c2', 'Absente', 'personne-absente'),
      { ...casPersonne('c2', 'Source absente'), regles: [{ type: 'entretiens' as const, entretienIds: ['absent'] }] },
    ]) {
      expect(() => appliquerCommandeCas(dictionnaire, { type: 'creer-lot', cas: [premier, dernier] }, deps)).toThrow()
      expect(dictionnaire).toEqual(avant)
    }
    expect(() => appliquerCommandeCas(dictionnaire, { type: 'creer-lot', cas: [] }, deps)).toThrow(/vide/)
  })

  test('valide les unions homogènes sans accepter de règle vide ou dupliquée', () => {
    const invalides: unknown[] = [
      { type: 'personnes', membres: [] },
      { type: 'personnes', membres: [{ personneId: 'personne-1' }] },
      { type: 'entretiens', entretienIds: [] },
      { type: 'entretiens', entretienIds: ['entretien-1', 'entretien-1'] },
      { type: 'entretiens', entretienIds: [null] },
      { type: 'personnes', membres: [
        { personneId: 'personne-1', inclureEnqueteurs: false },
        { personneId: 'personne-1', inclureEnqueteurs: true },
      ] },
    ]
    for (const regle of invalides) {
      expect(() => creer({ ...casPersonne('c1', 'Invalide'), regles: [regle] } as Cas)).toThrow()
    }
    expect(() => creer({ ...casPersonne('c1', 'Mixte de règles'), regles: [
      { type: 'personne', personneId: 'personne-1', inclureEnqueteurs: false },
      { type: 'entretiens', entretienIds: ['entretien-1'] },
    ] })).toThrow(/sans les mélanger/)
  })

  test('les règles d’entretiens absents restent lisibles et les références d’un lot sont dédupliquées', () => {
    const cas: Cas = {
      ...casPersonne('c1', 'Sources'),
      regles: [{ type: 'entretiens', entretienIds: ['disparu'] }],
      rattachements: [rattachement()],
    }
    expect(normaliserCas({ c1: cas })).toEqual({ c1: cas })
    expect(referencesAjouteesCommandeCas({ type: 'creer-lot', cas: [cas, { ...cas, id: 'c2', nom: 'Autre' }] }))
      .toEqual([rattachement().source])
  })

  test('crée un cas depuis une personne, un premier passage ou volontairement vide', () => {
    const dictionnaire = creer(casPersonne('cas-1', 'Marie'))
    const manuel: Cas = {
      id: 'cas-2',
      nom: 'Événement A',
      memo: 'À documenter.',
      creeLe,
      modifieLe,
      regles: [],
      rattachements: [rattachement()],
    }
    creer(manuel, dictionnaire)

    expect(dictionnaire['cas-1'].regles[0]).toMatchObject({ personneId: 'personne-1' })
    expect(dictionnaire['cas-2'].rattachements[0].source).toEqual({
      entretienId: 'entretien-1',
      repereId: 'repere-1',
    })
    expect(JSON.stringify(dictionnaire['cas-2'])).not.toContain('from')
    expect(JSON.stringify(dictionnaire['cas-2'])).not.toContain('texte')

    const vide = { ...casPersonne('cas-3', 'Vide'), regles: [] }
    creer(vide, dictionnaire)
    const avantRejeu = structuredClone(dictionnaire)
    creer(structuredClone(vide), dictionnaire)
    expect(dictionnaire).toEqual(avantRejeu)
    expect(dictionnaire['cas-3']).toEqual(vide)
    expect(() => creer(casPersonne('cas-4', 'Absente', 'personne-absente'), dictionnaire))
      .toThrow(/personne n'existe plus/)
  })

  test('un cas vide conserve les validations et ne remplace pas la sélection d’un ajout', () => {
    const vide = { ...casPersonne('cas-vide', 'Vide'), regles: [] }
    const dictionnaire = creer(vide)
    expect(() => creer({ ...vide, id: 'autre', nom: ' vide ' }, dictionnaire)).toThrow(/porte déjà/)
    expect(() => creer({ ...vide, id: 'autre', nom: ' ' }, dictionnaire)).toThrow(/invalide/)
    expect(() => creer({ ...vide, id: 'autre', nom: 'Autre', creeLe: 'invalide' }, dictionnaire)).toThrow(/invalide/)
    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements', casIds: [], rattachement: rattachement(),
      nouveauCas: { ...vide, id: 'autre', nom: 'Autre' },
    }, deps)).toThrow(/sélection associée/)
    expect(Object.keys(dictionnaire)).toEqual(['cas-vide'])
  })

  test('associe un même passage à un cas vide et un cas avec règle sans changer les règles', () => {
    const dictionnaire = creer({ ...casPersonne('manuel', 'Manuel'), regles: [] })
    creer(casPersonne('automatique', 'Avec règle'), dictionnaire)
    const regles = structuredClone(dictionnaire.automatique.regles)
    const ajout = rattachement()
    const commande = {
      type: 'ajouter-rattachements' as const, casIds: ['manuel', 'automatique'], rattachement: ajout,
    }
    appliquerCommandeCas(dictionnaire, commande, deps)
    appliquerCommandeCas(dictionnaire, commande, deps)
    expect(dictionnaire.manuel.rattachements).toEqual([ajout])
    expect(dictionnaire.automatique.rattachements).toEqual([ajout])
    appliquerCommandeCas(dictionnaire, {
      type: 'retirer-rattachement', casId: 'automatique', rattachementId: ajout.id, attendu: ajout,
    }, deps)
    expect(dictionnaire.automatique.regles).toEqual(regles)
    expect(dictionnaire.manuel.rattachements).toEqual([ajout])
  })

  test('garantit l’unicité des noms après trim, Unicode de compatibilité et casse', () => {
    const dictionnaire = creer(casPersonne('cas-1', 'Élodie'))
    expect(normaliserNomCas('  E\u0301LODIE  ')).toBe(normaliserNomCas('Élodie'))
    expect(() => creer(casPersonne('cas-2', '  E\u0301LODIE  ', 'personne-2'), dictionnaire))
      .toThrow(/porte déjà ce nom/)
    expect(() => creer(casPersonne('cas-1', 'Autre identité'), dictionnaire))
      .toThrow(/identité de cas/)
    creer(casPersonne('cas-2', 'Paul', 'personne-2'), dictionnaire)
    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'renommer', casId: 'cas-2', attendu: 'Paul', nom: '  e\u0301lodie ',
    }, deps)).toThrow(/porte déjà ce nom/)
    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'renommer', casId: 'cas-1', attendu: 'Élodie', nom: '  ',
    }, deps)).toThrow(/obligatoire/)
  })

  test('rejoue sans effet une création et un ajout multi-cas identiques', () => {
    const premier = casPersonne('cas-1', '  Marie  ')
    const dictionnaire = creer(premier)
    const avantCreation = structuredClone(dictionnaire)
    creer(structuredClone(premier), dictionnaire)
    expect(dictionnaire).toEqual(avantCreation)

    creer(casPersonne('cas-2', 'Paul', 'personne-2'), dictionnaire)
    const ajout = rattachement()
    appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements', casIds: ['cas-1', 'cas-2'], rattachement: ajout,
    }, deps)
    const apresPremierAjout = structuredClone(dictionnaire)
    appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements', casIds: ['cas-1', 'cas-2'], rattachement: ajout,
    }, deps)

    expect(dictionnaire).toEqual(apresPremierAjout)
    expect(dictionnaire['cas-1'].rattachements).toHaveLength(1)
    expect(dictionnaire['cas-2'].rattachements).toHaveLength(1)

    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements',
      casIds: ['cas-1'],
      rattachement: rattachement('rattachement-1', 'autre-entretien', 'autre-repere'),
    }, deps)).toThrow(/identité de rattachement/)
    expect(dictionnaire).toEqual(apresPremierAjout)
  })

  test('crée un cas manuel et associe les cas existants dans une seule commande rejouable', () => {
    const dictionnaire = creer(casPersonne('cas-1', 'Marie'))
    const ajout = rattachement()
    const nouveauCas: Cas = {
      id: 'cas-2',
      nom: 'Événement A',
      memo: 'Créé pendant l’association.',
      creeLe,
      modifieLe,
      regles: [],
      rattachements: [ajout],
    }
    const commande = {
      type: 'ajouter-rattachements' as const,
      casIds: ['cas-1'],
      rattachement: ajout,
      nouveauCas,
    }

    appliquerCommandeCas(dictionnaire, commande, deps)
    const apresPremierAjout = structuredClone(dictionnaire)
    appliquerCommandeCas(dictionnaire, commande, deps)

    expect(dictionnaire).toEqual(apresPremierAjout)
    expect(dictionnaire['cas-1'].rattachements).toEqual([ajout])
    expect(dictionnaire['cas-2']).toEqual(nouveauCas)
  })

  test('prévalide tout ajout multi-cas avant la première mutation', () => {
    const dictionnaire = creer(casPersonne('cas-1', 'Marie'))
    creer(casPersonne('cas-2', 'Paul', 'personne-2'), dictionnaire)
    dictionnaire['cas-2'].rattachements.push(rattachement('autre-id'))
    const avant = structuredClone(dictionnaire)

    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements',
      casIds: ['cas-1', 'cas-2'],
      rattachement: rattachement(),
    }, deps)).toThrow(/déjà rattaché/)
    expect(dictionnaire).toEqual(avant)

    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'ajouter-rattachements',
      casIds: ['cas-1', 'cas-absent'],
      rattachement: rattachement('r2', 'e2', 'p2'),
    }, deps)).toThrow(/n'existe plus/)
    expect(dictionnaire).toEqual(avant)
  })

  test('applique les préconditions ciblées et conserve un cas après son dernier retrait', () => {
    const dictionnaire = creer({
      ...casPersonne('cas-1', 'Marie'),
      memo: 'Initial',
      regles: [],
      rattachements: [rattachement()],
    })

    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'renommer', casId: 'cas-1', attendu: 'Ancien nom', nom: 'Nouveau',
    }, deps)).toThrow(/nom du cas a changé/)
    appliquerCommandeCas(dictionnaire, {
      type: 'modifier-memo', casId: 'cas-1', attendu: 'Initial', memo: 'Nouveau mémo',
    }, deps)
    expect(dictionnaire['cas-1']).toMatchObject({ memo: 'Nouveau mémo', modifieLe: apres })

    const attendu = structuredClone(dictionnaire['cas-1'].rattachements[0])
    appliquerCommandeCas(dictionnaire, {
      type: 'retirer-rattachement', casId: 'cas-1', rattachementId: attendu.id, attendu,
    }, deps)
    expect(dictionnaire['cas-1'].rattachements).toEqual([])
    expect(dictionnaire['cas-1']).toBeDefined()
    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'retirer-rattachement', casId: 'cas-1', rattachementId: attendu.id, attendu,
    }, deps)).toThrow(/déjà été retiré/)
  })

  test('normalise sans résoudre les références et exclut tout cas mal formé', () => {
    const valide = {
      ...casPersonne('cas-1', '  Marie  ', 'personne-disparue'),
      rattachements: [rattachement('r1', 'entretien-absent', 'repere-absent')],
    }
    const normalises = normaliserCas({
      'cas-1': valide,
      'cas-invalide': { ...casPersonne('autre-id', 'Invalide') },
      'cas-vide': { ...casPersonne('cas-vide', 'Vide devenu'), regles: [], rattachements: [] },
    })

    expect(normalises['cas-1'].nom).toBe('Marie')
    expect(normalises['cas-1'].rattachements[0].source.entretienId).toBe('entretien-absent')
    expect(normalises['cas-vide']).toBeDefined()
    expect(normalises['cas-invalide']).toBeUndefined()
    expect(normalises['cas-1']).not.toBe(valide)
  })

  test('retire seulement les rattachements de l’entretien supprimé', () => {
    const dictionnaire = creer({
      ...casPersonne('cas-1', 'Marie'),
      rattachements: [
        rattachement('r1', 'entretien-1', 'repere-1'),
        rattachement('r2', 'entretien-2', 'repere-2'),
      ],
    })
    const retrait = retirerRattachementsCasEntretien(dictionnaire, 'entretien-1', apres)
    expect(retrait).toEqual({ casAffectes: 1, rattachementsRetires: 1 })
    expect(dictionnaire['cas-1'].rattachements).toEqual([
      rattachement('r2', 'entretien-2', 'repere-2'),
    ])
    expect(dictionnaire['cas-1'].regles).toHaveLength(1)
    expect(dictionnaire['cas-1'].modifieLe).toBe(apres)
  })

  test('supprime uniquement la définition du cas avec la version attendue', () => {
    const dictionnaire = creer(casPersonne('cas-1', 'Marie'))
    expect(() => appliquerCommandeCas(dictionnaire, {
      type: 'supprimer-cas', casId: 'cas-1', attenduModifieLe: 'date-périmée',
    }, deps)).toThrow(/cas a changé/)
    appliquerCommandeCas(dictionnaire, {
      type: 'supprimer-cas', casId: 'cas-1', attenduModifieLe: modifieLe,
    }, deps)
    expect(dictionnaire).toEqual({})
  })
})
