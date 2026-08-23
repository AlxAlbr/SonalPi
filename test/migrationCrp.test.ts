import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { encode } from 'iconv-lite'
import { analyserCrp, VERSIONS_CRP_SUPPORTEES, mapperCodebook, mapperVariables, mapperDefinitions, mapperEntretiensV1, mapperTabAnon, mapperParamsAnon } from '../src/shared/corpus/migrationCrp'
import { fusionnerImport } from '../src/shared/corpus/import'
import { decoderCrp } from '../src/main/encodage'
import type { CorpusFichier } from '../src/shared/format'

/**
 * Lecture + aperçu du `.crp` SonalPi V1.
 * Le parseur est PUR (`shared/corpus/migrationCrp.ts`) ; le décodage
 * d'encodage vit dans le main (`src/main/encodage.ts`, chardet + iconv-lite
 * comme la V1). Ici : parse du JSON V1 réel (fixtures + windows-1252),
 * gardes d'entrée (version inconnue / JSON invalide / structure), normalisations
 * défensives (taille '', couleurs '', priv string, champ gen/loc).
 */

function fixture(nom: string): string {
  return readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
}

describe('analyserCrp — corpus V1 SAVÉ (sans nom/dateCreation/version, comme en réel)', () => {
  const analyse = analyserCrp(fixture('corpusV1.crp'), 'MonCorpus.crp')

  test('parse OK et identité : repli sur le nom de fichier', () => {
    expect(analyse.ok).toBe(true)
    if (!analyse.ok) return
    expect(analyse.apercu.nom).toBe('MonCorpus') // pas de `nom` dans le .crp → basename
    expect(analyse.apercu.dateCreation).toBeNull()
    expect(analyse.apercu.nbEntretiens).toBe(3)
  })

  test('thèmes : couleurs vides et tailles "" normalisées en null, nombres préservés', () => {
    if (!analyse.ok) return
    const { themes } = analyse.apercu
    expect(themes).toHaveLength(6)
    // Pondérations : couleur '' → null, taille '' → null
    expect(themes[0]).toEqual({ nom: 'Pondérations', couleur: null, taille: null })
    // ★★★ Très important : taille 24 préservée
    expect(themes[1]).toEqual({ nom: '★★★ Très important', couleur: null, taille: 24 })
    // Thème principal : hex préservé tel quel
    expect(themes[4]).toEqual({ nom: 'Thème principal', couleur: '#0331ff', taille: null })
  })

  test('variables : champ gen/loc → portée, priv string → booléen', () => {
    if (!analyse.ok) return
    const { variables } = analyse.apercu
    expect(variables).toHaveLength(3)
    expect(variables[0]).toEqual({ lib: 'sexe', portee: 'locuteur', priv: false })
    expect(variables[1]).toEqual({ lib: 'PCS', portee: 'entretien', priv: false })
    expect(variables[2]).toEqual({ lib: 'diplôme', portee: 'entretien', priv: true })
  })

  test('règles d’anon : aperçu {entite, remplacement}', () => {
    if (!analyse.ok) return
    const { reglesAnon } = analyse.apercu
    expect(reglesAnon).toHaveLength(3)
    expect(reglesAnon[0]).toEqual({ entite: 'Émilie', remplacement: 'Claire' })
    // thematique / remplacementAlt existent dans le .crp mais hors aperçu
    expect(reglesAnon[1]).toEqual({ entite: 'Maison des Habitants', remplacement: 'Maison de quartier' })
  })

  test('les données V1 BRUTES voyagent telles quelles', () => {
    if (!analyse.ok) return
    const { raw } = analyse.apercu
    expect(raw.tabEnt).toHaveLength(3)
    // rtrPath relatif, audioPath ABSOLU (déjà au format v3)
    expect(raw.tabEnt![1].rtrPath).toBe('entretien2.sonal')
    expect(raw.tabEnt![1].audioPath).toBe('/home/user/Corpus/Source/audio/E1.mp3')
    expect(raw.tabEnt![1].imgPath).toBe('E1.png')
    // tabDic sans lib ({v:1,m:0} existe en réel) et tabDat avec l='all'
    expect(raw.tabDic![0]).toEqual({ v: 1, m: 0 })
    expect(raw.tabDat![2]).toEqual({ e: '2', v: 2, l: 'all', m: 1 })
    // settings pseudo persistés tels quels
    expect(raw.paramsAnonCorpus).toMatchObject({ prioriteValidation: 'corpus' })
  })
})

describe('analyserCrp — corpus V1 CRÉÉ par nouveauCorpus (nom + version "1.0")', () => {
  const analyse = analyserCrp(fixture('corpusV1-nouveau.crp'), 'autre.crp')

  test('nom/dateCreation repris, version "1.0" acceptée', () => {
    expect(analyse.ok).toBe(true)
    if (!analyse.ok) return
    expect(analyse.apercu.nom).toBe('Mon Projet de Recherche')
    expect(analyse.apercu.dateCreation).toBe('2026-05-01T10:00:00.000Z')
    expect(analyse.apercu.nbEntretiens).toBe(0) // tabEnt [] est valide
    // types STRING du gabarit nouveauCorpus tolérés (act:'true', cmpct:'false')
    expect(analyse.apercu.themes[1].taille).toBe(24)
  })

  test('VERSIONS_CRP_SUPPORTEES est la liste blanche (garde d’entrée)', () => {
    expect(VERSIONS_CRP_SUPPORTEES).toEqual(['1.0'])
  })
})

describe('analyserCrp — encodage windows-1252 (Q2, parité V1)', () => {
  test('un .crp en windows-1252 est décodé puis analysé sans perdre les accents', () => {
    // Mini-corpus réaliste AVEC accents (chars présents en windows-1252 :
    // on n'utilise pas ★, absent de cet encodage).
    const json1252 = JSON.stringify({
      nom: 'Corpus Émile',
      tabEnt: [
        { id: 1, nom: 'entretien1', rtrPath: 'entretien1.sonal', audioPath: '', tabLoc: ['', 'Émilie'] },
      ],
      tabThm: [{ code: 'cat_001', nom: 'Pondérations', couleur: '', taille: '', rang: '0', act: true }],
      tabVar: [{ v: 1, lib: 'diplôme', champ: 'gen', priv: 'false' }],
      tabAnon: [{ entite: 'Émilie', remplacement: 'Claire' }],
    })
    const brut = encode(json1252, 'windows-1252') // Buffer encodé win1252
    expect(brut.includes(0xc9)).toBe(true) // 'É' = 0xC9 en windows-1252

    const contenu = decoderCrp(brut) // le main lit + décode
    const analyse = analyserCrp(contenu, 'Corpus1252.crp')
    expect(analyse.ok).toBe(true)
    if (!analyse.ok) return
    expect(analyse.apercu.nom).toBe('Corpus Émile')
    expect(analyse.apercu.themes[0].nom).toBe('Pondérations')
    expect(analyse.apercu.variables[0].lib).toBe('diplôme')
    expect(analyse.apercu.reglesAnon[0]).toEqual({ entite: 'Émilie', remplacement: 'Claire' })
  })

  test('decoderCrp laisse passer un .crp déjà en UTF-8', () => {
    const utf8 = fixture('corpusV1.crp')
    expect(decoderCrp(Buffer.from(utf8, 'utf8'))).toBe(utf8)
  })
})

describe('analyserCrp — refus propres (jamais d’exception)', () => {
  test('JSON invalide → raison "json"', () => {
    const analyse = analyserCrp('{ pas du json', 'moche.crp')
    expect(analyse).toMatchObject({ ok: false, raison: 'json' })
    if (analyse.ok) return
    expect(analyse.message).toContain('.crp illisible')
  })

  test('version inconnue → raison "version" (garde d’entrée)', () => {
    const analyse = analyserCrp(JSON.stringify({ version: '9.9', tabEnt: [] }), 'futur.crp')
    expect(analyse).toMatchObject({ ok: false, raison: 'version' })
    if (analyse.ok) return
    expect(analyse.message).toContain('9.9')
  })

  test('pas un objet JSON → raison "structure"', () => {
    const analyse = analyserCrp(JSON.stringify([1, 2, 3]), 'liste.crp')
    expect(analyse).toMatchObject({ ok: false, raison: 'structure' })
  })

  test('tabEnt manquant → raison "structure"', () => {
    const analyse = analyserCrp(JSON.stringify({ tabThm: [] }), 'vide.crp')
    expect(analyse).toMatchObject({ ok: false, raison: 'structure' })
    if (analyse.ok) return
    expect(analyse.message).toContain('tabEnt')
  })

  test('des entrées bizarres (null) ne font pas planter l’aperçu', () => {
    const analyse = analyserCrp(
      JSON.stringify({
        tabEnt: [],
        tabThm: [null, { code: 'cat_001', nom: 'Seul', couleur: null, taille: '12', rang: 0, act: 'true' }],
        tabVar: [{ v: 1, lib: 'x', champ: 'gen', priv: 'true' }, 'pas un objet'],
        tabAnon: [null, { entite: 'A', remplacement: 'B' }, { remplacement: 'orpheline' }],
      }),
      'tolérant.crp',
    )
    expect(analyse.ok).toBe(true)
    if (!analyse.ok) return
    expect(analyse.apercu.themes).toHaveLength(1)
    expect(analyse.apercu.themes[0]).toEqual({ nom: 'Seul', couleur: null, taille: 12 })
    expect(analyse.apercu.variables).toHaveLength(1)
    expect(analyse.apercu.reglesAnon).toHaveLength(1) // entité vide filtrée
  })
})

// ── Mapping tabThm/tabVar/tabDic → codebook/variables V2 ──

describe('mapperCodebook (tabThm → Categorie[], parité cat_NNN)', () => {
  // tabThm du corpusV1.crp : Pondérations(rang 0) + 3 pondérations(rang 1) +
  // Thème principal(rang 0) + Sous-thème(rang 1, sous « Thème principal »).
  const analyse = analyserCrp(fixture('corpusV1.crp'), 'x.crp')
    const tabThm = analyse.ok ? analyse.apercu.raw.tabThm : []
    const codebook = mapperCodebook(tabThm)

    test('un Categorie par thème, id = code V1 (parité cat_NNN), ordre = position', () => {
      expect(codebook.map((c) => c.id)).toEqual([
        'cat_001', 'cat_002', 'cat_003', 'cat_004', 'cat_005', 'cat_006',
      ])
      expect(codebook.map((c) => c.ordre)).toEqual([0, 1, 2, 3, 4, 5])
      expect(codebook.every((c) => c.codeExport === c.id)).toBe(true)
    })

    test('taille "" → undefined ; nombre nu préservé (parité importSonal)', () => {
      expect(codebook[0]).toMatchObject({ nom: 'Pondérations', taille: undefined, couleur: undefined })
      expect(codebook[1].taille).toBe(24) // ★★★ Très important
      expect(codebook[2].taille).toBe(22)
    })

    test('couleur hex préservée, vide → undefined (Q4 : défaut V2)', () => {
      expect(codebook[4]).toMatchObject({ nom: 'Thème principal', couleur: '#0331ff' })
      expect(codebook[5].couleur).toBe('#42a5f5')
    })

    test('hiérarchie reconstruite depuis les rang (parent), comme importSonal', () => {
      expect(codebook[0].parent).toBeNull() // Pondérations : racine
      expect(codebook[1].parent).toBe('cat_001') // pondérations sous Pondérations
      expect(codebook[3].parent).toBe('cat_001')
      expect(codebook[4].parent).toBeNull() // Thème principal : racine
      expect(codebook[5].parent).toBe('cat_005') // Sous-thème sous Thème principal
    })

    test('act → actif ; booléens ET chaînes gérés', () => {
      expect(codebook.every((c) => c.actif)).toBe(true)
      const codebook2 = mapperCodebook([
        { code: 'cat_001', nom: '', rang: '0', act: false },
        { code: 'cat_002', nom: '', rang: '0', act: 'false' },
        { code: 'cat_003', nom: '', rang: '0', act: 'true' },
      ])
      expect(codebook2.map((c) => c.actif)).toEqual([false, false, true])
    })

    test('thème sans code écarté ; nom absent → repli sur le code', () => {
      const codebook2 = mapperCodebook([
        { nom: 'orphelin', rang: '0' },
        { code: 'cat_010', rang: '0' },
      ])
      expect(codebook2).toHaveLength(1)
      expect(codebook2[0]).toMatchObject({ id: 'cat_010', nom: 'cat_010' })
    })

    test('un thème Pondérations supprimé en V1 est ABSENT du codebook V2 (même arbre)', () => {
      // L'utilisateur a supprimé Pondérations (cat_001) et ★☆☆ (cat_004) en V1 :
      // tabThm ne les porte plus. La migration n'en recrée AUCUN (pas le bloc
      // défaut de `amorcer()` ; `mapperCodebook` suit tabThm à la lettre).
      const codebook2 = mapperCodebook([
        { code: 'cat_002', couleur: '', nom: '★★★ Très important', taille: 24, rang: '0', act: true },
        { code: 'cat_005', couleur: '#0331ff', nom: 'Thème principal', taille: '', rang: '0', act: true },
        { code: 'cat_006', couleur: '#42a5f5', nom: 'Sous-thème', taille: '', rang: '1', act: true },
      ])
      expect(codebook2.map((c) => c.id)).toEqual(['cat_002', 'cat_005', 'cat_006'])
      // Sous-thème reste sous Thème principal (la hiérarchie ne dépend pas des
      // cat_001..004 réservés) ; les racines restent racines.
      expect(codebook2.map((c) => c.parent)).toEqual([null, null, 'cat_005'])
      // ordre compacté (position dans le tableau V1), codeExport = id.
      expect(codebook2.map((c) => c.ordre)).toEqual([0, 1, 2])
      expect(codebook2.every((c) => c.codeExport === c.id)).toBe(true)
    })
  })

describe('mapperVariables (tabVar/tabDic → Variable[], champ gen/loc + priv string)', () => {
  const analyse = analyserCrp(fixture('corpusV1.crp'), 'x.crp')
  const raw = analyse.ok ? analyse.apercu.raw : null
  const variables = raw ? mapperVariables(raw.tabVar, raw.tabDic) : []

  test('ids déterministes v{n} + vExport (parité eav/import .sonal)', () => {
    expect(variables.map((v) => v.id)).toEqual(['v1', 'v2', 'v3'])
    expect(variables.map((v) => v.vExport)).toEqual([1, 2, 3])
    expect(variables.map((v) => v.ordre)).toEqual([0, 1, 2])
  })

  test('champ : loc → portee locuteur, gen → portee entretien', () => {
    expect(variables[0]).toMatchObject({ lib: 'sexe', portee: 'locuteur', priv: false })
    expect(variables[1]).toMatchObject({ lib: 'PCS', portee: 'entretien', priv: false })
    expect(variables[2]).toMatchObject({ lib: 'diplôme', portee: 'entretien', priv: true }) // priv 'true' string
  })

  test('tabDic → modalités, ids v{n}m{m} ; la modalité m=0 vide est conservée', () => {
    expect(variables[0].modalites.map((m) => m.id)).toEqual(['v1m0', 'v1m1', 'v1m2', 'v1m3'])
    expect(variables[0].modalites[0]).toEqual({ id: 'v1m0', lib: '', mExport: 0 }) // {v:1,m:0} sans lib
    expect(variables[0].modalites[1]).toMatchObject({ lib: 'Homme', mExport: 1 })
    expect(variables[2].modalites.map((m) => m.mExport)).toEqual([0, 1, 2])
  })

  test('modalité orpheline (variable absente de tabVar) ignorée', () => {
    const vs = mapperVariables([{ v: 1, lib: 'x', champ: 'gen', priv: 'false' }], [
      { v: 1, m: 1, lib: 'ok' },
      { v: 99, m: 1, lib: 'orpheline' },
    ])
    expect(vs).toHaveLength(1)
    expect(vs[0].modalites.map((m) => m.lib)).toEqual(['ok'])
  })
})

describe('mapperDefinitions + fusionnerImport', () => {
  test('définitions du .crp fusionnées dans un corpus V2 neuf, idempotent', () => {
    const analyse = analyserCrp(fixture('corpusV1.crp'), 'x.crp')
    if (!analyse.ok) throw new Error('fixture invalide')
    const { codebook, variables } = mapperDefinitions(analyse.apercu.raw)
    expect(codebook).toHaveLength(6)
    expect(variables).toHaveLength(3)

    const corpus: CorpusFichier = {
      formatVersion: 3,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {},
    }
    fusionnerImport(corpus, codebook, variables)
    expect(Object.keys(corpus.codebook).sort()).toEqual([
      'cat_001', 'cat_002', 'cat_003', 'cat_004', 'cat_005', 'cat_006',
    ])
    expect(Object.keys(corpus.variables).sort()).toEqual(['v1', 'v2', 'v3'])
    expect(corpus.codebook.cat_002.parent).toBe('cat_001')
    expect(corpus.variables.v3.modalites).toHaveLength(3)

    // Idempotence : re-fusionner (re-migration / double import) n'ajoute RIEN.
    const avant = JSON.stringify(corpus)
    fusionnerImport(corpus, codebook, variables)
    expect(JSON.stringify(corpus)).toBe(avant)
  })

  test('les copies embarquées des entretiens ne sont PAS lues (Q7 : le .crp fait foi)', () => {
    // Un tabEnt DOMMAGEABLE (copie divergente) ne doit pas contaminer les
    // définitions : mapperDefinitions ne consulte que les tableaux du corpus.
    const analyse = analyserCrp(
      JSON.stringify({
        tabEnt: [{ id: 1, nom: 'x', rtrPath: 'x.sonal', tabVar: [{ v: 99, lib: 'contaminé', champ: 'gen', priv: 'false' }] }],
        tabVar: [{ v: 1, lib: 'propre', champ: 'gen', priv: 'false' }],
      }),
      'derive.crp',
    )
    if (!analyse.ok) throw new Error('fixture invalide')
    const { variables } = mapperDefinitions(analyse.apercu.raw)
    expect(variables.map((v) => v.id)).toEqual(['v1'])
    expect(variables[0].lib).toBe('propre')
  })
})

// ── Mapping des entretiens (tabEnt[] → titre/rtrPath/audioRef) ──

describe('mapperEntretiensV1 (tabEnt[] → données d’import)', () => {
  const analyse = analyserCrp(fixture('corpusV1.crp'), 'x.crp')
  const raw = analyse.ok ? analyse.apercu.raw : null
  const entrees = raw ? mapperEntretiensV1(raw.tabEnt) : []

  test('un entretien par tabEnt[] : titre V1, rtrPath relatif, audioRef absolu ou null', () => {
    expect(entrees.map((e) => e.titre)).toEqual(['entretien1', 'entretien2', 'entretien3'])
    expect(entrees.map((e) => e.rtrPath)).toEqual([
      'entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal',
    ])
    // audioPath '' → null (pas d'audio) ; audioPath ABSOLU → audioRef tel quel (déjà v3).
    expect(entrees[0].audioRef).toBeNull()
    expect(entrees[1].audioRef).toBe('/home/user/Corpus/Source/audio/E1.mp3')
    expect(entrees[2].audioRef).toBeNull()
  })

  test('normalisations défensives : nom/rtrPath/audioPath manquants ou vides', () => {
    const out = mapperEntretiensV1([
      { id: 7 }, // ni nom ni rtrPath ni audioPath
      { id: 0, nom: '  ', rtrPath: '', audioPath: '' },
      { nom: 'AvecNom' }, // id absent → index+1
      'pas un objet',
    ])
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ id: 7, titre: 'Entretien 7', rtrPath: null, audioRef: null })
    expect(out[1]).toEqual({ id: 0, titre: 'Entretien 0', rtrPath: null, audioRef: null })
    expect(out[2]).toEqual({ id: 3, titre: 'AvecNom', rtrPath: null, audioRef: null }) // index+1
  })

  test('tabEnt absent → liste vide (corpus sans entretien)', () => {
    expect(mapperEntretiensV1(undefined)).toEqual([])
    expect(mapperEntretiensV1(null)).toEqual([])
  })
})

describe('E4 — mapping tabAnon + paramsAnonCorpus du .crp', () => {
  test('tabAnon → règles V2 : thématique → catégorie, remplacementAlt → 2ᵉ pseudo, entrées vides ignorées', () => {
    let n = 0
    const regles = mapperTabAnon(
      [
        { entite: 'Émilie', remplacement: 'Claire' },
        { entite: 'Mairie', remplacement: 'Mairie de quartier', thematique: 'ORG' },
        { entite: 'Enquêteur', remplacement: 'Énola', remplacementAlt: 'Camille', thematique: 'LOC' },
        { entite: '   ', remplacement: 'X' }, // sans entité : ignoré
      ],
      () => `reg-crp-${++n}`,
    )
    expect(regles).toHaveLength(3)
    expect(regles[0]).toEqual({ id: 'reg-crp-1', entite: ['Émilie'], pseudos: ['Claire'] })
    expect('categorie' in regles[0]).toBe(false)
    expect(regles[1].categorie).toBe('ORG')
    expect(regles[2].pseudos).toEqual(['Énola', 'Camille'])
    expect(regles[2].categorie).toBe('LOC')
    // Absent / non-tableau → vide (jamais d'exception).
    expect(mapperTabAnon(undefined, () => 'i')).toEqual([])
  })

  test('paramsAnonCorpus → ParamsAnon : lecture défensive champ à champ', () => {
    expect(
      mapperParamsAnon({
        motsLiaison: ['à', 'de'],
        motsLiaisonActif: false,
        thematiques: { actif: true, liste: ['PER'] },
        prioriteValidation: 'entretien',
      }),
    ).toEqual({
      prioriteValidation: 'entretien',
      motsLiaison: { actif: false, liste: ['à', 'de'] },
      thematiques: { actif: true, liste: ['PER'] },
    })
    // Absent → priorité par défaut, champs optionnels omis.
    expect(mapperParamsAnon(undefined)).toEqual({ prioriteValidation: 'corpus' })
    // Valeur inconnue → défaut ; liste thématiques absente → défauts V1.
    expect(mapperParamsAnon({ prioriteValidation: 'bizarre' }).prioriteValidation).toBe('corpus')
    expect(mapperParamsAnon({ thematiques: { actif: true } }).thematiques?.liste).toEqual([
      'PER', 'LOC', 'ORG', 'DAT',
    ])
  })
})
