import { describe, test, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import type { PayloadEntretien, EntretienFichier } from '../src/shared/format'

function storeNeuf(): { store: CorpusStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-store-'))
  return { store: new CorpusStore(dir), dir }
}

/** Payload avec un marqueur textuel distinctif (pour tracer les versions/.bak). */
function payload(marqueur: string): PayloadEntretien {
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { loc: null, deb: null, fin: null },
          content: [{ type: 'text', text: marqueur }],
        },
      ],
    },
    annotations: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function lireFichier(dir: string, rel: string): EntretienFichier {
  return JSON.parse(readFileSync(join(dir, rel), 'utf8'))
}

describe('CorpusStore — amorçage & round-trip', () => {
  test('ouvrir amorce un corpus (membership + entretien seed lisibles)', () => {
    const { store } = storeNeuf()
    const corpus = store.ouvrir()
    expect(corpus.formatVersion).toBe(1)
    expect(Object.keys(corpus.membership)).toEqual(['e1'])
    expect(corpus.membership.e1.titre).toBe('Entretien Karine')

    const lu = store.lireEntretien('e1')
    expect(lu.ok).toBe(true)
    if (lu.ok) {
      expect(JSON.stringify(lu.data.corpsTexte)).toContain('Karine habite Lyon')
      expect(lu.data.locuteurs.map((l) => l.nom)).toEqual(['Enquêteur', 'Karine'])
    }
  })

  test('écrire puis relire rend les mêmes données (round-trip)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('CONTENU-MODIFIÉ'))
    const lu = store.lireEntretien('e1')
    expect(lu.ok && JSON.stringify(lu.data.corpsTexte)).toContain('CONTENU-MODIFIÉ')
  })

  test('la liste des entretiens vient du SEUL membership (pas d’un scan)', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    // Un fichier .json parasite dans entretiens/ ne doit PAS apparaître.
    writeFileSync(join(dir, 'entretiens', 'zzz-orphelin.json'), '{}', 'utf8')
    expect(Object.keys(store.ouvrir().membership)).toEqual(['e1'])
  })
})

describe('CorpusStore — écriture atomique', () => {
  test('aucun .tmp ne subsiste après écriture, et le contenu est valide', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('X'))
    const restes = readdirSync(join(dir, 'entretiens')).filter((f) => f.endsWith('.tmp'))
    expect(restes).toEqual([])
    // (La sûreté au vrai crash repose sur l'atomicité de rename() — non simulée ici.)
    expect(lireFichier(dir, 'entretiens/e1.json').formatVersion).toBe(1)
  })
})

describe('CorpusStore — filet .bak à 2 générations, tourné PAR SESSION', () => {
  test('l’autosave ne tourne pas ; chaque ouverture tourne une fois', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir() // écrit le seed « Karine »

    // Session 1 : ouverture (arme la rotation) + deux enregistrements.
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('S1-a')) // 1er write → rotation : seed → .bak1
    store.ecrireEntretien('e1', payload('S1-b')) // autosave → PAS de rotation
    expect(JSON.stringify(lireFichier(dir, 'entretiens/e1.json.bak1').corpsTexte)).toContain('Karine')
    expect(existsSync(join(dir, 'entretiens/e1.json.bak2'))).toBe(false)

    // Session 2 : nouvelle ouverture + un enregistrement.
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('S2-a')) // rotation : .bak1(seed)→.bak2, courant(S1-b)→.bak1

    // .bak1 = fin de session 1 (S1-b), .bak2 = état d'avant session 1 (seed).
    expect(JSON.stringify(lireFichier(dir, 'entretiens/e1.json.bak1').corpsTexte)).toContain('S1-b')
    expect(JSON.stringify(lireFichier(dir, 'entretiens/e1.json.bak2').corpsTexte)).toContain('Karine')
    // Un .bak reste un entretien ouvrable (JSON valide, versionné).
    expect(lireFichier(dir, 'entretiens/e1.json.bak1').formatVersion).toBe(1)
  })
})

describe('CorpusStore — version & fraîcheur (D6)', () => {
  test('un entretien de formatVersion inconnue est refusé (pas lu)', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const f = join(dir, 'entretiens', 'e1.json')
    const data = JSON.parse(readFileSync(f, 'utf8'))
    data.formatVersion = 999
    writeFileSync(f, JSON.stringify(data), 'utf8')
    expect(store.lireEntretien('e1')).toEqual({ ok: false, raison: 'version' })
  })

  test('un corpus de version inconnue fait échouer l’ouverture', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const f = join(dir, 'corpus.json')
    const c = JSON.parse(readFileSync(f, 'utf8'))
    c.formatVersion = 999
    writeFileSync(f, JSON.stringify(c), 'utf8')
    expect(() => store.ouvrir()).toThrow(/non supportée/)
  })

  test('un entretien plus ancien que le membership est signalé périmé', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('à jour')) // membership.lastModified avance

    // Simule un fichier restauré d'une vieille sauvegarde (lastModified ancien).
    const f = join(dir, 'entretiens', 'e1.json')
    const data = JSON.parse(readFileSync(f, 'utf8'))
    data.lastModified = '2000-01-01T00:00:00.000Z'
    writeFileSync(f, JSON.stringify(data), 'utf8')

    const lu = store.lireEntretien('e1')
    expect(lu.ok && lu.perime).toBe(true)
  })

  test('à jour → non périmé', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.lireEntretien('e1')
    store.ecrireEntretien('e1', payload('frais'))
    const lu = store.lireEntretien('e1')
    expect(lu.ok && lu.perime).toBe(false)
  })
})

describe('CorpusStore — cycle de vie du membership', () => {
  test('créer, renommer, supprimer (vers corbeille, pas d’effacement)', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()

    const { id } = store.creerEntretien('Nouvel entretien')
    expect(Object.keys(store.ouvrir().membership)).toContain(id)

    store.renommerEntretien(id, 'Renommé')
    expect(store.ouvrir().membership[id].titre).toBe('Renommé')

    store.supprimerEntretien(id)
    expect(Object.keys(store.ouvrir().membership)).not.toContain(id)
    // Le fichier n'est pas effacé : il part en corbeille/.
    expect(existsSync(join(dir, 'corbeille', id + '.json'))).toBe(true)
  })

  test('lire un entretien absent est un refus typé', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    expect(store.lireEntretien('inexistant')).toEqual({ ok: false, raison: 'absent' })
  })
})

describe('CorpusStore — sas d’import & fusion du codebook', () => {
  const cat = (id: string, nom: string) => ({
    id,
    nom,
    ordre: 0,
    parent: null,
    actif: true,
    codeExport: id,
  })
  const payload = (marqueur: string) => ({
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null, deb: null, fin: null }, content: [{ type: 'text', text: marqueur }] }] },
    annotations: [],
    locuteurs: [{ index: 1, nom: 'A', valeursLoc: {}, personneRef: null }],
    meta: { valeursGen: {}, audioRef: null },
    legacy: { notes: 'n' },
  })

  test('importer crée l’entretien (avec payload + legacy) et l’ajoute au membership', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const { id } = store.importerEntretien('Importé', payload('TEXTE-IMPORTÉ'), [cat('cat_005', 'Cat1')])
    const lu = store.lireEntretien(id)
    expect(lu.ok && JSON.stringify(lu.data.corpsTexte)).toContain('TEXTE-IMPORTÉ')
    expect(lu.ok && lu.data.legacy).toEqual({ notes: 'n' })
    expect(store.ouvrir().membership[id].titre).toBe('Importé')
  })

  test('deux imports partageant un code → codebook fusionné SANS doublon', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.importerEntretien('A', payload('A'), [cat('cat_005', 'Cat1'), cat('cat_006', 'SousCat1')])
    store.importerEntretien('B', payload('B'), [cat('cat_005', 'Cat1'), cat('cat_009', 'Autre')])
    const codes = Object.keys(store.ouvrir().codebook).sort()
    // cat_005 n'apparaît qu'une fois ; les 3 seed + cat_005/6/9.
    expect(codes).toContain('cat_005')
    expect(codes).toContain('cat_006')
    expect(codes).toContain('cat_009')
    expect(codes.filter((c) => c === 'cat_005')).toHaveLength(1)
  })

  test('double import du même fichier → variables fusionnées SANS doublon (règle n°3)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const vars = [
      { id: 'v1', lib: 'Lieu', portee: 'entretien' as const, priv: false, ordre: 0, vExport: 1, modalites: [] },
      { id: 'v2', lib: 'sexe', portee: 'locuteur' as const, priv: false, ordre: 1, vExport: 2, modalites: [] },
    ]
    store.importerEntretien('A', payload('A'), [], vars)
    store.importerEntretien('A-bis', payload('A'), [], vars) // même fichier réimporté
    const ids = Object.keys(store.ouvrir().variables).sort()
    expect(ids).toEqual(['v1', 'v2'])
  })

  test('supprimerCategorie avec exceptId EXCLUT l’entretien courant du compte (D-S10)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const codage = { id: 'a1', type: 'codage' as const, from: 0, to: 1, auteur: 'm', code: 'cat_005' }
    const e1 = store.importerEntretien('E1', { ...payload('X'), annotations: [codage] }, [cat('cat_005', 'X')]).id
    store.importerEntretien('E2', payload('Y'), []) // aucun codage

    // Sans exceptId : E1 utilise cat_005 → refus.
    expect(store.supprimerCategorie('cat_005').ok).toBe(false)
    // Avec exceptId = E1 : on l'exclut, plus personne d'AUTRE ne l'utilise → autorisé.
    expect(store.supprimerCategorie('cat_005', e1).ok).toBe(true)
    expect(store.ouvrir().codebook['cat_005']).toBeUndefined()
  })
})

describe('CorpusStore — CRUD du codebook (thèmes, étape 5)', () => {
  test('ajouter une catégorie → prochain code libre, ordre en fin', () => {
    const { store } = storeNeuf()
    store.ouvrir() // seed cat_001..003
    const { id, corpus } = store.ajouterCategorie('Émotions')
    expect(id).toBe('cat_004')
    expect(corpus.codebook.cat_004.nom).toBe('Émotions')
    expect(corpus.codebook.cat_004.actif).toBe(true)
    expect(corpus.codebook.cat_004.ordre).toBe(3)
  })

  test('modifier (renommer / recolorer) édite la définition — les entretiens ne sont pas touchés', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    // Un entretien qui référence cat_001 par id.
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [{ id: 'a', type: 'codage', from: 1, to: 3, auteur: 'x', code: 'cat_001' }],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    const avant = readFileSync(join(dir, 'corpus.json'), 'utf8') // pour repérage
    void avant

    const corpus = store.modifierCategorie('cat_001', { nom: 'Famille élargie', couleur: '#0331ff' })
    expect(corpus.codebook.cat_001.nom).toBe('Famille élargie')
    expect(corpus.codebook.cat_001.couleur).toBe('#0331ff')
    // L'entretien n'a PAS changé : il porte toujours l'id cat_001, pas le libellé.
    const ent = Object.keys(store.ouvrir().membership).find((k) => k.startsWith('ent'))!
    const data = store.lireEntretien(ent)
    expect(data.ok && data.data.annotations[0].code).toBe('cat_001')
  })

  test('déplacer échange l’ordre avec le voisin', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const avant = Object.values(store.ouvrir().codebook).sort((a, b) => a.ordre - b.ordre).map((c) => c.id)
    store.deplacerCategorie(avant[0], 1) // descend le premier
    const apres = Object.values(store.ouvrir().codebook).sort((a, b) => a.ordre - b.ordre).map((c) => c.id)
    expect(apres[0]).toBe(avant[1])
    expect(apres[1]).toBe(avant[0])
  })

  test('compter les usages d’un code (requête sur les entretiens)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [
        { id: 'a', type: 'codage', from: 1, to: 3, auteur: 'x', code: 'cat_002' },
        { id: 'b', type: 'codage', from: 4, to: 6, auteur: 'x', code: 'cat_002' },
      ],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    expect(store.compterUsagesCode('cat_002')).toBe(2)
    expect(store.compterUsagesCode('cat_003')).toBe(0)
    expect(store.usagesParCode().cat_002).toBe(2)
  })

  test('supprimer est REFUSÉE si la catégorie est utilisée (avec compteur)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [{ id: 'a', type: 'codage', from: 1, to: 3, auteur: 'x', code: 'cat_002' }],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    expect(store.supprimerCategorie('cat_002')).toEqual({ ok: false, usages: 1 })
    expect(store.ouvrir().codebook.cat_002).toBeDefined() // toujours là
  })

  test('supprimer une catégorie inutilisée réussit', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const r = store.supprimerCategorie('cat_003')
    expect(r.ok).toBe(true)
    expect(store.ouvrir().codebook.cat_003).toBeUndefined()
  })
})

describe('CorpusStore — EAV (variables/modalités/valeurs/matrice, étape 6)', () => {
  /** Entretien avec une valeur gen et une valeur loc (par leur propriétaire). */
  const entretienAvecValeurs = (varGen: string, modGen: string, varLoc: string, modLoc: string) => ({
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    locuteurs: [{ index: 1, nom: 'A', valeursLoc: { [varLoc]: modLoc }, personneRef: null }],
    meta: { valeursGen: { [varGen]: modGen }, audioRef: null },
  })

  test('ajouter variable + modalités (définitions au corpus)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const { id, corpus } = store.ajouterVariable('Sexe', 'locuteur')
    expect(corpus.variables[id].portee).toBe('locuteur')
    expect(corpus.variables[id].vExport).toBe(1)
    const c2 = store.ajouterModalite(id, 'F')
    const c3 = store.ajouterModalite(id, 'M')
    void c2
    expect(c3.variables[id].modalites.map((m) => m.lib)).toEqual(['F', 'M'])
    expect(c3.variables[id].modalites[1].mExport).toBe(2)
  })

  test('la matrice est une REQUÊTE : valeurs lues chez leur propriétaire (pas de l="all")', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const { id: vGen } = store.ajouterVariable('Terrain', 'entretien')
    const cg = store.ajouterModalite(vGen, 'Lyon')
    const mGen = cg.variables[vGen].modalites[0].id
    const { id: vLoc } = store.ajouterVariable('Sexe', 'locuteur')
    const cl = store.ajouterModalite(vLoc, 'F')
    const mLoc = cl.variables[vLoc].modalites[0].id

    store.importerEntretien('E', entretienAvecValeurs(vGen, mGen, vLoc, mLoc), [])

    const mat = store.matriceCorpus()
    const ligne = mat.find((e) => e.titre === 'E')!
    expect(ligne.valeursGen[vGen]).toBe(mGen) // valeur entretien chez l'entretien
    expect(ligne.locuteurs[0].valeursLoc[vLoc]).toBe(mLoc) // valeur locuteur chez le locuteur
    // Aucun sentinelle « all » nulle part.
    expect(JSON.stringify(mat)).not.toContain('"all"')
  })

  test('supprimer une modalité UTILISÉE est refusée (avec compteur)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const { id: v } = store.ajouterVariable('Sexe', 'locuteur')
    const c = store.ajouterModalite(v, 'F')
    const m = c.variables[v].modalites[0].id
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      locuteurs: [{ index: 1, nom: 'A', valeursLoc: { [v]: m }, personneRef: null }],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    expect(store.supprimerModalite(v, m)).toEqual({ ok: false, usages: 1 })
    // inutilisée → OK
    const c2 = store.ajouterModalite(v, 'M')
    const m2 = c2.variables[v].modalites.find((x) => x.lib === 'M')!.id
    expect(store.supprimerModalite(v, m2).ok).toBe(true)
  })

  test('supprimer une variable utilisée est refusée', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const { id: v } = store.ajouterVariable('Terrain', 'entretien')
    const c = store.ajouterModalite(v, 'Lyon')
    const m = c.variables[v].modalites[0].id
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      locuteurs: [],
      meta: { valeursGen: { [v]: m }, audioRef: null },
    }, [])
    expect(store.supprimerVariable(v)).toEqual({ ok: false, usages: 1 })
  })
})
