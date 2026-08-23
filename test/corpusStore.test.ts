import { describe, test, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { fusionnerReglesAnon } from '../src/shared/corpus/import'
import { mapperDefinitions } from '../src/shared/corpus/migrationCrp'
import { analyserCrp } from '../src/shared/corpus/migrationCrp'
import { creerRegle } from '../src/shared/corpus/reglesAnon'
import { ajusterScanApresApplication, type ScanRegle } from '../src/shared/corpus/scanAnon'
import { ecrireSeedDemo } from './seedDemo'
import type { PayloadEntretien, EntretienFichier, CorpusFichier } from '../src/shared/format'

/** Store sur la BASELINE de démo « Karine » (e1 + 7 thèmes) — l'ex-amorçage
 *  produit, désormais une fixture posée AVANT ouverture (S8 rév.). */
function storeNeuf(): { store: CorpusStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-store-'))
  ecrireSeedDemo(dir)
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
          attrs: { loc: null },
          content: [{ type: 'text', text: marqueur }],
        },
      ],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function lireFichier(dir: string, rel: string): EntretienFichier {
  return JSON.parse(readFileSync(join(dir, rel), 'utf8'))
}

describe('CorpusStore — amorçage & round-trip', () => {
  test('un dossier VIERGE s’amorce VIDE : aucun entretien, codebook = bloc Pondérations SonalPi', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-store-vierge-'))
    const corpus = new CorpusStore(dir).ouvrir()
    expect(corpus.formatVersion).toBe(3)
    expect(corpus.membership).toEqual({}) // AUCUN entretien de démo (S8 rév.)
    expect(Object.keys(corpus.codebook).sort()).toEqual(['cat_001', 'cat_002', 'cat_003', 'cat_004'])
    expect(corpus.codebook.cat_001).toMatchObject({ nom: 'Pondérations', couleur: '#ffffff', parent: null })
    expect(corpus.codebook.cat_001.taille).toBeUndefined() // le parent n'a AUCUN effet
    const enfants = ['cat_002', 'cat_003', 'cat_004'].map((id) => corpus.codebook[id])
    expect(enfants.map((c) => c.parent)).toEqual(['cat_001', 'cat_001', 'cat_001'])
    expect(enfants.map((c) => c.taille)).toEqual([24, 22, 20]) // l'effet = la taille seule
    expect(enfants.every((c) => c.couleur === '#ffffff')).toBe(true) // soulignement invisible
  })

  test('poserNom pose le `nom` de projet et le persiste (indépendant du dossier)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-store-nom-'))
    const store = new CorpusStore(dir)
    expect(store.ouvrir().nom).toBeUndefined() // un corpus neuf n'a pas de nom
    const corpus = store.poserNom('Enquête 2024')
    expect(corpus.nom).toBe('Enquête 2024')
    // persisté dans corpus.json, et survit à une réouverture
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).nom).toBe('Enquête 2024')
    expect(new CorpusStore(dir).ouvrir().nom).toBe('Enquête 2024')
  })

  test('la baseline de démo des tests reste lisible par le store (fixture partagée unit/e2e)', () => {
    const { store } = storeNeuf()
    const corpus = store.ouvrir()
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

  test('brouillonsAnon : écrits puis relus tels quels (champ additif, pas de bump de version)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.lireEntretien('e1')
    const p = payload('CONTENU-ANON')
    p.brouillonsAnon = [
      { entite: 'Karine', pseudo: 'Marie' },
      { entite: 'Lyon' }, // entité seule : pseudo optionnel
    ]
    store.ecrireEntretien('e1', p)
    const lu = store.lireEntretien('e1')
    expect(lu.ok).toBe(true)
    if (lu.ok) expect(lu.data.brouillonsAnon).toEqual(p.brouillonsAnon)
    // Un entretien écrit SANS le champ (v1) → absent à la lecture : le renderer
    // normalise en [] à l'ouverture (useEntretien) — additif, aucune migration.
    store.ecrireEntretien('e1', payload('SANS-BROUILLONS'))
    const lu2 = store.lireEntretien('e1')
    expect(lu2.ok && lu2.data.brouillonsAnon).toBeUndefined()
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
    expect(lireFichier(dir, 'entretiens/e1.json').formatVersion).toBe(3)
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
    expect(lireFichier(dir, 'entretiens/e1.json.bak1').formatVersion).toBe(3)
  })
})

describe('CorpusStore — version du format natif', () => {
  test('un entretien de formatVersion inconnue est refusé (pas lu)', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const f = join(dir, 'entretiens', 'e1.json')
    const data = JSON.parse(readFileSync(f, 'utf8'))
    data.formatVersion = 999
    writeFileSync(f, JSON.stringify(data), 'utf8')
    expect(store.lireEntretien('e1')).toEqual({ ok: false, raison: 'version' })
  })

  test('un entretien v1 est MIGRÉ à la lecture : deb/fin des blocs → ancres {pos, t}', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const f = join(dir, 'entretiens', 'e1.json')
    const v1 = {
      formatVersion: 1,
      lastModified: '2020-01-01T00:00:00.000Z',
      corpsTexte: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { loc: 1, deb: 0, fin: 2.5 }, content: [{ type: 'text', text: 'Un deux.' }] },
          { type: 'paragraph', attrs: { loc: 1, deb: null, fin: null }, content: [{ type: 'text', text: 'Trois.' }] },
          { type: 'paragraph', attrs: { loc: 2, deb: 4, fin: 6 }, content: [{ type: 'text', text: 'Quatre.' }] },
        ],
      },
      annotations: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }
    writeFileSync(f, JSON.stringify(v1), 'utf8')

    const lu = store.lireEntretien('e1')
    expect(lu.ok).toBe(true)
    if (lu.ok) {
      expect(lu.data.formatVersion).toBe(3)
      // « Un deux. » (8 car.) → deb pos 1, fin pos 9 ; bloc scindé (nulls) → rien ;
      // « Quatre. » (7 car.) : début de bloc 1+(2+8)+(2+6)=19, fin 26.
      expect(lu.data.ancres).toEqual([
        { pos: 1, t: 0 },
        { pos: 9, t: 2.5 },
        { pos: 19, t: 4 },
        { pos: 26, t: 6 },
      ])
      const doc = lu.data.corpsTexte as { content: Array<{ attrs: unknown }> }
      expect(doc.content.map((b) => b.attrs)).toEqual([{ loc: 1 }, { loc: 1 }, { loc: 2 }])
      expect(lu.data.lastModified).toBe('2020-01-01T00:00:00.000Z') // migrer ≠ éditer
    }
    // La migration est écrite sur disque (la relecture n'a plus rien à migrer).
    expect(lireFichier(dir, 'entretiens/e1.json').formatVersion).toBe(3)
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
})

describe('CorpusStore — cycle de vie du membership', () => {
  test('le fichier d’entretien porte le NOM D’ORIGINE (SRT/audio) + un code aléatoire', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()

    // Import SRT : le titre = nom du fichier sans extension → il nomme le fichier.
    const a = store.importerEntretien('1-Coordinatrice', payload('X')).id
    expect(a).toMatch(/^1-Coordinatrice_[a-z0-9]+$/)
    expect(existsSync(join(dir, 'entretiens', a + '.json'))).toBe(true)

    // Audio seul : on garde le nom de l'AUDIO.
    const b = store.creerEntretienVide('entretienQ2audio').id
    expect(b).toMatch(/^entretienQ2audio_[a-z0-9]+$/)
    expect(existsSync(join(dir, 'entretiens', b + '.json'))).toBe(true)

    // Le titre AFFICHÉ reste le nom d'origine (espaces/accents préservés),
    // seuls les caractères interdits sont assainis pour l'id (espaces et /
    // → tirets, que l'on compacte).
    const c = store.importerEntretien('Été 2024 / session 1', payload('Y')).id
    expect(c).toMatch(/^Été-2024-session-1_[a-z0-9]+$/)
    expect(store.ouvrir().membership[c].titre).toBe('Été 2024 / session 1')
  })

  test('créer, renommer, supprimer (vers corbeille, pas d’effacement)', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()

    const { id } = store.creerEntretienVide('Nouvel entretien')
    expect(Object.keys(store.ouvrir().membership)).toContain(id)

    store.renommerEntretien(id, 'Renommé')
    expect(store.ouvrir().membership[id].titre).toBe('Renommé')

    // Un audio RÉFÉRENCÉ (chemin absolu externe) + sa forme d'onde (PNG dérivé
    // dans `png/`) existent pour cet entretien. L'audio n'est JAMAIS dans le corpus.
    const audioExterne = join(dir, 'sources', id + '.wav')
    mkdirSync(join(dir, 'sources'), { recursive: true })
    writeFileSync(audioExterne, 'fake-audio', 'utf8')
    mkdirSync(join(dir, 'png'), { recursive: true })
    writeFileSync(join(dir, 'png', id + '.png'), 'fake-onde', 'utf8')

    store.supprimerEntretien(id)
    expect(Object.keys(store.ouvrir().membership)).not.toContain(id)
    // Rien n'est effacé : le fichier entretien ET le PNG dérivé partent en corbeille/.
    expect(existsSync(join(dir, 'corbeille', id + '.json'))).toBe(true)
    expect(existsSync(join(dir, 'corbeille', id + '.png'))).toBe(true)
    expect(existsSync(join(dir, 'png', id + '.png'))).toBe(false)
    // L'audio EXTERNE n'est JAMAIS touché (c'est le nouveau modèle — parité SonalPi).
    expect(existsSync(audioExterne)).toBe(true)
  })

  test('lire un entretien absent est un refus typé', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    expect(store.lireEntretien('inexistant')).toEqual({ ok: false, raison: 'absent' })
  })
})

describe('CorpusStore — audio par RÉFÉRENCE (v3)', () => {
  /** Crée un WAV factice (pas décodé — juste pour existsSync) hors du corpus. */
  function audioExterne(dir: string, nom = 'ent.wav'): string {
    const chemin = join(dir, 'sources', nom)
    mkdirSync(join(dir, 'sources'), { recursive: true })
    writeFileSync(chemin, 'fake-audio', 'utf8')
    return chemin
  }

  test('assignerAudio ne copie PAS : audioRef = chemin absolu, fichier intact', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source = audioExterne(dir, 'rec.wav')

    const res = store.assignerAudio(id, source)
    expect(res).not.toBeNull()
    expect(res!.audioRef).toBe(source) // chemin absolu stocké tel quel

    // Le fichier n'est PAS copié dans le corpus (ni `audio/`, ni `png/`).
    expect(existsSync(join(dir, 'audio', id + '.wav'))).toBe(false)
    expect(existsSync(join(dir, 'png', id + '.wav'))).toBe(false)
    // Le fichier source est intact (non déplacé).
    expect(existsSync(source)).toBe(true)
  })

  test('cheminMediaAbs : whitelist — sert un chemin référencé, refuse les autres', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source = audioExterne(dir, 'ok.wav')
    store.assignerAudio(id, source)

    // Chemin référencé → servi.
    expect(store.cheminMediaAbs(source)).toBe(source)
    // Chemin non référencé (même s'il existe) → refusé (404 côté protocole).
    const intrus = join(dir, 'sources', 'intrus.wav')
    writeFileSync(intrus, 'x', 'utf8')
    expect(store.cheminMediaAbs(intrus)).toBeNull()
    // Chemin qui ressemble à une ref mais ne l'est pas → refusé.
    expect(store.cheminMediaAbs(source + '.bak')).toBeNull()
  })

  test('cheminWaveform : résolu par id (opaque), refuse un id avec séparateur', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    mkdirSync(join(dir, 'png'), { recursive: true })
    writeFileSync(join(dir, 'png', id + '.png'), 'png', 'utf8')

    expect(store.cheminWaveform(id)).toBe(join(dir, 'png', id + '.png'))
    expect(store.cheminWaveform(id + '../x')).toBeNull() // tentative de traversal
    expect(store.cheminWaveform('inexistant')).toBeNull()
  })

  test('cache refsAudio : invalidé par assignerAudio, la nouvelle ref est servie', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source1 = audioExterne(dir, 'a.wav')
    const source2 = audioExterne(dir, 'b.wav')

    store.assignerAudio(id, source1)
    expect(store.cheminMediaAbs(source1)).toBe(source1)
    // Avant la 2e assignation, source2 n'est pas whitelistée.
    expect(store.cheminMediaAbs(source2)).toBeNull()

    store.assignerAudio(id, source2) // invalide le cache
    expect(store.cheminMediaAbs(source2)).toBe(source2)
    // source1 n'est plus whitelistée (l'entretien pointe maintenant vers source2).
    expect(store.cheminMediaAbs(source1)).toBeNull()
  })

  test('cache refsAudio : invalidé par supprimerEntretien', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source = audioExterne(dir, 'sup.wav')
    store.assignerAudio(id, source)
    expect(store.cheminMediaAbs(source)).toBe(source)

    store.supprimerEntretien(id) // invalide le cache
    expect(store.cheminMediaAbs(source)).toBeNull()
  })

  /* ── Association audio MACHINE-LOCALE sur un poste distant ── */

  test('associerAudioLocal : RÉFÉRENCE sans copier, ne touche PAS au JSON partagé', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const sourceOriginale = audioExterne(dir, 'poste-a.wav')
    store.assignerAudio(id, sourceOriginale)
    // Simule l'AUTRE poste : le fichier référencé n'existe pas ici.
    rmSync(sourceOriginale)

    const fichierLocal = audioExterne(dir, 'poste-b.m4a')
    const res = store.associerAudioLocal(id, fichierLocal)
    expect(res).not.toBeNull()
    expect(res!.audioRef).toBe(fichierLocal)

    // Pas de COPIE (parité assignerAudio) ; la source est intacte.
    expect(existsSync(join(dir, 'audio'))).toBe(false)
    expect(existsSync(fichierLocal)).toBe(true)
    // Le JSON PARTAGÉ n'a pas bougé : il pointe toujours chez le poste A.
    const data = JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8')) as {
      meta: { audioRef: string }
    }
    expect(data.meta.audioRef).toBe(sourceOriginale)
    // L'association vit dans le fichier machine-local.
    const locaux = JSON.parse(readFileSync(join(dir, 'audio-locaux.json'), 'utf8')) as Record<string, string>
    expect(locaux[id]).toBe(fichierLocal)
  })

  test('retombée locale : verifierAudios/audios()/cheminMediaAbs résolvent le fichier local', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const sourceDistante = audioExterne(dir, 'chez-max.wav')
    store.assignerAudio(id, sourceDistante)
    rmSync(sourceDistante) // ce fichier n'existe pas SUR NOTRE poste

    // Sans association locale : manquant, média refusé.
    expect(store.verifierAudios()[id]).toBe('manquant')
    expect(store.cheminMediaAbs(sourceDistante)).toBeNull()

    const fichierLocal = audioExterne(dir, 'chez-moi.wav')
    store.associerAudioLocal(id, fichierLocal)

    // La retombée fait tout redescendre comme si l'audio était là :
    expect(store.verifierAudios()[id]).toBe('ok')
    expect(store.audios()[id]?.audio).toBe(fichierLocal)
    // La requête porte LA REF PARTAGÉE → sert le fichier EFFECTIF local.
    expect(store.cheminMediaAbs(sourceDistante)).toBe(fichierLocal)
    // Et elle peut aussi porter directement le chemin local (génération d'onde).
    expect(store.cheminMediaAbs(fichierLocal)).toBe(fichierLocal)
  })

  test('associerAudioLocal : source inexistante → null, rien écrit', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    expect(store.associerAudioLocal(id, join(dir, 'nulle-part.wav'))).toBeNull()
    expect(existsSync(join(dir, 'audio-locaux.json'))).toBe(false)
  })

  test('audios() : audio = audioRef absolu, waveform = scan de png/', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source = audioExterne(dir, 'aud.wav')
    store.assignerAudio(id, source)
    // Pose un PNG dérivé.
    mkdirSync(join(dir, 'png'), { recursive: true })
    writeFileSync(join(dir, 'png', id + '.png'), 'png', 'utf8')

    const res = store.audios()
    expect(res[id].audio).toBe(source)
    expect(res[id].waveform).toBe(`png/${id}.png`)
  })

  test('verifierAudios : ok / manquant selon existsSync', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { id } = store.creerEntretienVide('Ent')
    const source = audioExterne(dir, 'ok.wav')
    store.assignerAudio(id, source)

    expect(store.verifierAudios()[id]).toBe('ok')
    // Supprimer le fichier source → manquant.
    writeFileSync(source, '', 'utf8') // existe toujours → ok
    const { id: id2 } = store.creerEntretienVide('Ent2')
    const source2 = join(dir, 'sources', 'gone.wav')
    writeFileSync(source2, 'x', 'utf8')
    store.assignerAudio(id2, source2)
    // Simuler un fichier disparu (suppression du disque).
    const fs = require('node:fs')
    fs.unlinkSync(source2)
    expect(store.verifierAudios()[id2]).toBe('manquant')
  })
})

describe('CorpusStore — migration v2→v3', () => {
  test('audioRef relatif → absolu + PNG audio/ → png/ + bump formatVersion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migr-'))
    const now = new Date().toISOString()
    // Corpus v2 avec un entretien dont l'audio est copié dans `audio/` (legacy).
    const corpus: CorpusFichier = {
      formatVersion: 2,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: { e1: { titre: 'E1', date: null, lastModified: now } },
    }
    const e1: EntretienFichier = {
      formatVersion: 2,
      lastModified: now,
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: 'audio/e1.mp3' },
    }
    mkdirSync(join(dir, 'entretiens'), { recursive: true })
    mkdirSync(join(dir, 'audio'), { recursive: true })
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
    writeFileSync(join(dir, 'entretiens', 'e1.json'), JSON.stringify(e1, null, 2), 'utf8')
    writeFileSync(join(dir, 'audio', 'e1.mp3'), 'fake-mp3', 'utf8')
    writeFileSync(join(dir, 'audio', 'e1.png'), 'fake-png', 'utf8')

    const store = new CorpusStore(dir)
    const c = store.ouvrir() // déclenche la migration v2→v3

    // Corpus bumpé à v3.
    expect(c.formatVersion).toBe(3)
    // audioRef résolu en absolu vers le fichier existant dans `audio/`.
    const lu = store.lireEntretien('e1')
    expect(lu.ok && lu.data.formatVersion).toBe(3)
    expect(lu.ok && lu.data.meta.audioRef).toBe(join(dir, 'audio', 'e1.mp3'))
    // Le mp3 legacy reste dans `audio/` (référencé en absolu).
    expect(existsSync(join(dir, 'audio', 'e1.mp3'))).toBe(true)
    // Le PNG waveform a déménagé vers `png/`.
    expect(existsSync(join(dir, 'audio', 'e1.png'))).toBe(false)
    expect(existsSync(join(dir, 'png', 'e1.png'))).toBe(true)
  })

  test('migration v2→v3 idempotente (re-ouvrir ne recasse rien)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migr-idem-'))
    const now = new Date().toISOString()
    const corpus: CorpusFichier = {
      formatVersion: 2,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: { e1: { titre: 'E1', date: null, lastModified: now } },
    }
    const e1: EntretienFichier = {
      formatVersion: 2,
      lastModified: now,
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: 'audio/e1.mp3' },
    }
    mkdirSync(join(dir, 'entretiens'), { recursive: true })
    mkdirSync(join(dir, 'audio'), { recursive: true })
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
    writeFileSync(join(dir, 'entretiens', 'e1.json'), JSON.stringify(e1, null, 2), 'utf8')
    writeFileSync(join(dir, 'audio', 'e1.mp3'), 'fake-mp3', 'utf8')

    const store = new CorpusStore(dir)
    store.ouvrir() // 1re ouverture → migration
    store.ouvrir() // 2e ouverture → déjà v3, rien à faire
    const lu = store.lireEntretien('e1')
    expect(lu.ok && lu.data.formatVersion).toBe(3)
    expect(lu.ok && lu.data.meta.audioRef).toBe(join(dir, 'audio', 'e1.mp3'))
  })

  test('audioRef null reste null après migration', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migr-null-'))
    const now = new Date().toISOString()
    const corpus: CorpusFichier = {
      formatVersion: 2,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: { e1: { titre: 'E1', date: null, lastModified: now } },
    }
    const e1: EntretienFichier = {
      formatVersion: 2,
      lastModified: now,
      corpsTexte: { type: 'doc', content: [] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }
    mkdirSync(join(dir, 'entretiens'), { recursive: true })
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
    writeFileSync(join(dir, 'entretiens', 'e1.json'), JSON.stringify(e1, null, 2), 'utf8')

    const store = new CorpusStore(dir)
    store.ouvrir()
    const lu = store.lireEntretien('e1')
    expect(lu.ok && lu.data.meta.audioRef).toBeNull()
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
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: marqueur }] }] },
    annotations: [],
    ancres: [],
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

  test('supprimerCategorie avec exceptId EXCLUT l’entretien courant du compte', () => {
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

describe('CorpusStore — CRUD du codebook (thèmes)', () => {
  test('ajouter une catégorie → id opaque, codeExport cat_NNN libre, ordre en fin', () => {
    const { store } = storeNeuf()
    store.ouvrir() // seed cat_001..007 (3 démo + bloc Pondérations)
    const { id, corpus } = store.ajouterCategorie('Émotions')
    expect(id).toMatch(/^cat-/)
    expect(corpus.codebook[id].nom).toBe('Émotions')
    expect(corpus.codebook[id].codeExport).toBe('cat_008')
    expect(corpus.codebook[id].actif).toBe(true)
    expect(corpus.codebook[id].ordre).toBe(7)
  })

  test('modifier (renommer / recolorer) édite la définition — les entretiens ne sont pas touchés', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    // Un entretien qui référence cat_001 par id.
    const { id: ent } = store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [{ id: 'a', type: 'codage', from: 1, to: 3, auteur: 'x', code: 'cat_001' }],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    const avant = readFileSync(join(dir, 'corpus.json'), 'utf8') // pour repérage
    void avant

    const corpus = store.modifierCategorie('cat_001', { nom: 'Famille élargie', couleur: '#0331ff' })
    expect(corpus.codebook.cat_001.nom).toBe('Famille élargie')
    expect(corpus.codebook.cat_001.couleur).toBe('#0331ff')
    // L'entretien n'a PAS changé : il porte toujours l'id cat_001, pas le libellé.
    const data = store.lireEntretien(ent)
    expect(data.ok && data.data.annotations[0].code).toBe('cat_001')
  })

  test('retailler pose la taille de police ; taille: undefined PRÉSENT dans le patch la retire', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const corpus = store.modifierCategorie('cat_001', { taille: 24 })
    expect(corpus.codebook.cat_001.taille).toBe(24)
    expect(JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).codebook.cat_001.taille).toBe(24)
    // Retour à la taille du texte : la clé disparaît du fichier (spread + stringify).
    store.modifierCategorie('cat_001', { taille: undefined })
    const surDisque = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
    expect('taille' in surDisque.codebook.cat_001).toBe(false)
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
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }, [])
    expect(store.compterUsagesCategorie('cat_002')).toBe(2)
    expect(store.compterUsagesCategorie('cat_003')).toBe(0)
    expect(store.usagesParCategorie().cat_002).toBe(2)
  })

  test('supprimer est REFUSÉE si la catégorie est utilisée (avec compteur)', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    store.importerEntretien('E', {
      corpsTexte: { type: 'doc', content: [] },
      annotations: [{ id: 'a', type: 'codage', from: 1, to: 3, auteur: 'x', code: 'cat_002' }],
      ancres: [],
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

describe('CorpusStore — EAV (variables/modalités/valeurs/matrice)', () => {
  /** Entretien avec une valeur gen et une valeur loc (par leur propriétaire). */
  const entretienAvecValeurs = (varGen: string, modGen: string, varLoc: string, modLoc: string) => ({
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
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
      ancres: [],
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
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: { [v]: m }, audioRef: null },
    }, [])
    expect(store.supprimerVariable(v)).toEqual({ ok: false, usages: 1 })
  })
})

describe('CorpusStore — règles corpus & scan anon (lecture)', () => {
  test('scanAnon/reglesAnon : relit le disque et classe les occurrences par règle', () => {
    const { store, dir } = storeNeuf()
    // La baseline e1 contient « Karine habite Lyon depuis sa retraite. »
    // → « Lyon » y apparaît une fois, non traitée.
    expect(store.reglesAnon()).toEqual([])
    expect(store.scanAnon()).toEqual([])

    // Pose une règle corpus « Lyon » dans corpus.json (écriture directe :
    // 3a est lecture seule, la création viendra en 3b).
    const corpus = store.ouvrir()
    corpus.reglesAnon.r1 = { id: 'r1', entite: ['Lyon'], pseudos: ['L1'] }
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2))

    expect(store.reglesAnon()).toEqual([{ id: 'r1', entite: ['Lyon'], pseudos: ['L1'] }])
    const [scan] = store.scanAnon()
    expect(scan.regle.id).toBe('r1')
    expect(scan.total).toEqual({ anon: 0, exc: 0, non: 1, incl: +0 })
    expect(scan.parEntretien.e1).toEqual({ anon: 0, exc: 0, non: 1, incl: +0 })
  })

  test('scanAnon : une occurrence anonymisée par la règle compte « anonymisé »', () => {
    const { store, dir } = storeNeuf()
    const corpus = store.ouvrir()
    corpus.reglesAnon.r2 = { id: 'r2', entite: ['Lyon'], pseudos: ['L1'] }
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2))
    // e1 : « Karine habite Lyon depuis sa retraite. » → « Lyon » démarre à l'offset 15.
    const e = lireFichier(dir, 'entretiens/e1.json')
    e.annotations.push({ id: 'a', type: 'anon', from: 15, to: 19, auteur: '', etat: 'anonymise', pseudo: 'L1' })
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(e, null, 2))

    const [scan] = store.scanAnon()
    expect(scan.total).toEqual({ anon: 1, exc: 0, non: 0, incl: +0 })
  })
})

describe('ajusterScanApresApplication — compteurs ajustés sans re-scan', () => {
  const scan: ScanRegle[] = [
    {
      regle: { id: 'reg-1', entite: ['Karine'], pseudos: ['Marie'] },
      total: { anon: 3, exc: 1, non: 5, incl: +0 },
      parEntretien: {
        e1: { anon: 2, exc: 0, non: 3, incl: +0 },
        e2: { anon: 1, exc: 1, non: 2, incl: +0 },
      },
    },
    {
      regle: { id: 'reg-2', entite: ['Lyon'], pseudos: ['Ville'] },
      total: { anon: 0, exc: 0, non: 4, incl: +0 },
      parEntretien: { e1: { anon: 0, exc: 0, non: 4, incl: +0 } },
    },
  ]

  test('déplace « à traiter » vers « anonymisé » pour la règle visée seulement', () => {
    const r = ajusterScanApresApplication(scan, 'reg-1', [
      { id: 'e1', nb: 2 },
      { id: 'e2', nb: 1 },
    ])
    expect(r[0].parEntretien.e1).toEqual({ anon: 4, exc: 0, non: 1, incl: +0 })
    expect(r[0].parEntretien.e2).toEqual({ anon: 2, exc: 1, non: 1, incl: +0 })
    expect(r[0].total).toEqual({ anon: 6, exc: 1, non: 2, incl: +0 })
    expect(r[1]).toBe(scan[1]) // règle non visée : inchangée (même référence)
  })

  test('borné : nb supérieur au compteur ne produit jamais de négatif ; id absent ignoré', () => {
    const r = ajusterScanApresApplication(scan, 'reg-1', [
      { id: 'e2', nb: 99 },
      { id: 'e9', nb: 3 }, // absent du scan : ignoré.
    ])
    expect(r[0].parEntretien.e2).toEqual({ anon: 3, exc: 1, non: 0, incl: +0 })
    expect(r[0].total).toEqual({ anon: 5, exc: 1, non: 3, incl: +0 })
  })

  test('ne mute pas le scan d\'origine', () => {
    const avant = JSON.stringify(scan)
    ajusterScanApresApplication(scan, 'reg-1', [{ id: 'e1', nb: 1 }])
    expect(JSON.stringify(scan)).toBe(avant)
  })
})

describe('CorpusStore — CRUD règles corpus & garde d’isolation (3b)', () => {
  test('creer/réutiliser/ajouter pseudo/supprimer une règle', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    // Création
    const { regle: r } = store.regleAnonCreer('Karine', ['Marie'])
    expect(store.regleAnonParEntite('Karine')?.id).toBe(r.id)
    expect(store.regleAnonParEntite('karine')?.id).toBe(r.id) // insensible à la casse
    // Garder les deux
    store.regleAnonAjouterPseudo(r.id, 'Rebecca')
    expect(store.regleAnonParEntite('Karine')?.pseudos).toEqual(['Marie', 'Rebecca'])
    // Cap à 2 : un 3ᵉ refusé
    const regle = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).reglesAnon[r.id]
    expect(regle.pseudos).toEqual(['Marie', 'Rebecca'])
    // Suppression
    expect(() => store.regleAnonSupprimer(r.id)).not.toThrow()
    expect(store.regleAnonParEntite('Karine')).toBeUndefined()
  })

  test("regleAnonCreer est défensive : une entité qui a déjà une règle n'en obtient PAS une seconde", () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const premiere = store.regleAnonCreer('Karine', ['Marie'])
    expect(premiere.existait).toBe(false)
    // Re-création (autre casse, autres pseudos) → la règle existante revient
    // intacte, `existait` signale le cas, aucun doublon sur disque.
    const seconde = store.regleAnonCreer('KARINE', ['Autre'])
    expect(seconde.existait).toBe(true)
    expect(seconde.regle.id).toBe(premiere.regle.id)
    expect(seconde.regle.pseudos).toEqual(['Marie']) // pas touchée.
    const regles = JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8')).reglesAnon
    expect(Object.keys(regles)).toHaveLength(1)
  })

  test('creerRegle (pur) renvoie la règle existante sans muter le corpus', () => {
    const { store } = storeNeuf()
    const corpus = store.ouvrir() // copie fraîche, reglesAnon vide.
    creerRegle(corpus, 'Karine', ['Marie'], () => 'reg-1')
    const avant = JSON.stringify(corpus.reglesAnon)
    const r = creerRegle(corpus, 'karine', ['Autre'], () => 'reg-2')
    expect(r.id).toBe('reg-1')
    expect(JSON.stringify(corpus.reglesAnon)).toBe(avant) // aucune mutation.
  })

  test("regleAnonUtiliseeAilleurs : vrai si un AUTRE entretien référence la règle", () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { regle: r } = store.regleAnonCreer('Karine', ['Marie'])
    // e1 (baseline) gagne une occurrence rule-backed.
    const e = lireFichier(dir, 'entretiens/e1.json')
    e.annotations.push({ id: 'a', type: 'anon', from: 1, to: 7, auteur: '', etat: 'anonymise', pseudo: 'Marie', regle: r.id })
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(e, null, 2))
    // e1 lui-même exclu → faux ; un impossible autre id → vrai.
    expect(store.regleAnonUtiliseeAilleurs(r.id, 'e1')).toBe(false)
    expect(store.regleAnonUtiliseeAilleurs(r.id)).toBe(true)
    expect(store.regleAnonUtiliseeAilleurs(r.id, 'autre')).toBe(true)
  })

  test('supprimerLigneAnon corpus bloqué si la règle est utilisée ailleurs', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { regle: r } = store.regleAnonCreer('Karine', ['Marie'])
    // e1 référence la règle → elle n'est PAS isolée → suppression interdite.
    const e = lireFichier(dir, 'entretiens/e1.json')
    e.annotations.push({ id: 'a', type: 'anon', from: 1, to: 7, auteur: '', etat: 'anonymise', pseudo: 'Marie', regle: r.id })
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(e, null, 2))
    expect(store.regleAnonUtiliseeAilleurs(r.id, 'e2')).toBe(true)
    // Après avoir retiré la référence de e1, la règle devient isolée.
    e.annotations = []
    writeFileSync(join(dir, 'entretiens/e1.json'), JSON.stringify(e, null, 2))
    expect(store.regleAnonUtiliseeAilleurs(r.id, 'e2')).toBe(false)
  })
})

describe('CorpusStore — application en masse d’une règle sur un entretien fermé (3b)', () => {
  test('applique les occurrences « à traiter » en rule-backed, laisse les couverts', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const { regle: r } = store.regleAnonCreer('Karine', ['Marie'])
    // e1 : « Karine habite Lyon depuis sa retraite. » → 1 « Karine » à traiter.
    const res = store.appliquerRegleAnon('e1', r.id)
    expect(res.nb).toBe(1)
    expect(res.titre).toBe('Entretien Karine')
    const e = lireFichier(dir, 'entretiens/e1.json')
    const posed = e.annotations.filter((a) => a.type === 'anon' && a.regle === r.id)
    expect(posed).toHaveLength(1)
    expect(posed[0].pseudo).toBe('Marie')
    // Re-application : plus rien à traiter.
    expect(store.appliquerRegleAnon('e1', r.id).nb).toBe(0)
  })

  test('règle inconnue ou entretien absent → 0 sans erreur', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    expect(store.appliquerRegleAnon('e1', 'reg-inconnu').nb).toBe(0)
    expect(store.appliquerRegleAnon('absent', 'reg-inconnu').nb).toBe(0)
  })
})

describe('CorpusStore — migration SonalPi V1 → V2 (migrerDepuisV1)', () => {
  /** Un `.crp` V1 → définitions mappées → store sur le dossier dédié. */
  function definitionsDepuisFixture() {
    const crp = readFileSync(join(process.cwd(), 'test/fixtures/corpusV1.crp'), 'utf8')
    const a = analyserCrp(crp, 'MonCorpus.crp')
    if (!a.ok) throw new Error('fixture invalide')
    return { apercu: a.apercu, ...mapperDefinitions(a.apercu.raw) }
  }

  test('crée corpus.json avec nom + meta.sourceV1 + définitions (pas le bloc par défaut)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migre-'))
    const { apercu, codebook, variables } = definitionsDepuisFixture()
    const corpus = new CorpusStore(dir).migrerDepuisV1(
      apercu.nom,
      { cheminCrp: '/home/user/MonCorpus.crp', dateCreation: apercu.dateCreation },
      codebook,
      variables,
    )
    expect(corpus.formatVersion).toBe(3)
    expect(corpus.nom).toBe('MonCorpus')
    expect(corpus.meta?.sourceV1).toEqual({
      cheminCrp: '/home/user/MonCorpus.crp',
      dateCreation: null, // le .crp sauvé n'a pas de dateCreation
    })
    // Définitions du .crp (Q7), RIEN du bloc Pondérations par défaut de l'amorçage.
    expect(Object.keys(corpus.codebook).sort()).toEqual([
      'cat_001', 'cat_002', 'cat_003', 'cat_004', 'cat_005', 'cat_006',
    ])
    expect(Object.keys(corpus.variables).sort()).toEqual(['v1', 'v2', 'v3'])
    expect(corpus.membership).toEqual({})

    // Lisible à l'ouverture : ouvrir() ne ré-amorce pas (corpus.json présent).
    const relu = new CorpusStore(dir).ouvrir()
    expect(relu.nom).toBe('MonCorpus')
    expect(relu.meta?.sourceV1?.cheminCrp).toBe('/home/user/MonCorpus.crp')
    // Structure sur disque : corpus.json + entretiens/ (png/ créés plus tard).
    expect(existsSync(join(dir, 'corpus.json'))).toBe(true)
    expect(existsSync(join(dir, 'entretiens'))).toBe(true)
  })

  test('refuse (throw) un dossier qui est DÉJÀ un corpus — on n’écrase jamais', () => {
    const { dir } = storeNeuf() // baseline démo déjà écrit dans dir
    const { codebook, variables } = definitionsDepuisFixture()
    expect(() =>
      new CorpusStore(dir).migrerDepuisV1('X', { cheminCrp: '/x.crp', dateCreation: null }, codebook, variables),
    ).toThrow(/déjà un corpus/)
  })

  test('re-migrer le même .crp vers un AUTRE dossier est le cas multi-crp (un .crp → un dossier)', async () => {
    const { apercu, codebook, variables } = definitionsDepuisFixture()
    const d1 = mkdtempSync(join(tmpdir(), 'sonal-migre1-'))
    const d2 = mkdtempSync(join(tmpdir(), 'sonal-migre2-'))
    const c1 = new CorpusStore(d1).migrerDepuisV1(apercu.nom, { cheminCrp: '/a.crp', dateCreation: null }, codebook, variables)
    const c2 = new CorpusStore(d2).migrerDepuisV1(apercu.nom, { cheminCrp: '/a.crp', dateCreation: null }, codebook, variables)
    expect(c1.nom).toBe(c2.nom)
    expect(Object.keys(c2.codebook)).toHaveLength(6)
    // Idempotence de la FUSION : re-fusionner les mêmes définitions ne change rien.
    // (la garde « on n'écrase jamais » interdit de ré-appeler migrerDepuisV1 sur d1)
    expect(() => new CorpusStore(d1).migrerDepuisV1(apercu.nom, { cheminCrp: '/a.crp', dateCreation: null }, codebook, variables)).toThrow()
  })
})

describe('CorpusStore — garde lectureSeule (E0 corpus distant)', () => {
  /** Store de démo en mode « miroir distant » (lecture seule : pas encore de verrou ni
   *  de publication → toute écriture refusée). */
  function storeRo() {
    const s = storeNeuf()
    s.store.lectureSeule = true
    return s
  }

  test('les lectures restent possibles', () => {
    const { store } = storeRo()
    expect(() => store.ouvrir()).not.toThrow()
    expect(Object.keys(store.ouvrir().membership).length).toBeGreaterThan(0)
  })

  test('toute écriture est refusée avec un message clair', () => {
    const { store } = storeRo()
    const [id] = Object.keys(store.ouvrir().membership)
    expect(() => store.ecrireEntretien(id, payload('x'))).toThrow(/verrou n'est pas tenu/)
    expect(() => store.poserNom('nouveau nom')).toThrow(/lecture seule/)
    expect(() => store.creerEntretienVide('nouveau')).toThrow(/lecture seule/)
    expect(() => store.renommerEntretien(id, 'titre')).toThrow(/lecture seule/)
    expect(() => store.supprimerEntretien(id)).toThrow(/lecture seule/)
    expect(() => store.ajouterCategorie('thème')).toThrow(/lecture seule/)
    expect(() => store.ajouterVariable('var', 'entretien')).toThrow(/lecture seule/)
    expect(() => store.regleAnonCreer('ACME', ['A.'])).toThrow(/lecture seule/)
    expect(() => store.marquerDemo({ mode: 'pas-a-pas', racineSources: '/x', validees: [] })).toThrow(/lecture seule/)
    // Rien n'a bougé sur disque.
    const { store: temoin } = storeNeuf()
    void temoin
    expect(store.ouvrir()).toEqual(new CorpusStore(store['dir']).ouvrir())
  })

  test('le flag est par instance : un nouveau store local écrit normalement', () => {
    const { dir } = storeRo()
    const local = new CorpusStore(dir) // défaut : false
    expect(() => local.poserNom('local again')).not.toThrow()
    expect(local.ouvrir().nom).toBe('local again')
  })
})

describe('CorpusStore — paramètres de pseudonymisation (étape 4a)', () => {
  test('absents → défauts (priorité corpus, motsLiaison actifs) ; écriture persistée et relue', () => {
    const { store, dir } = storeNeuf()
    store.ouvrir()
    const defauts = store.lireParamsAnon()
    expect(defauts.prioriteValidation).toBe('corpus')
    expect(defauts.motsLiaison?.actif).toBe(true)
    expect(defauts.motsLiaison?.liste.length).toBeGreaterThan(0)
    const ecrit = store.ecrireParamsAnon({
      prioriteValidation: 'entretien',
      motsLiaison: { actif: false, liste: ['à', 'de'] },
    })
    expect(ecrit.prioriteValidation).toBe('entretien')
    expect(ecrit.motsLiaison).toEqual({ actif: false, liste: ['à', 'de'] })
    // Persisté dans corpus.json (relecture par un nouveau store).
    const relu = new CorpusStore(dir).lireParamsAnon()
    expect(relu.prioriteValidation).toBe('entretien')
    expect(relu.motsLiaison?.actif).toBe(false)
  })
})

describe('CorpusStore — thématiques d\u2019entités (étape 4c)', () => {
  test('défauts désactivés avec liste PER/LOC/ORG/DAT ; assignation et retrait de catégorie', () => {
    const { store } = storeNeuf()
    store.ouvrir()
    const thematiques = store.lireParamsAnon().thematiques!
    expect(thematiques.actif).toBe(false)
    expect(thematiques.liste).toEqual(['PER', 'LOC', 'ORG', 'DAT'])
    // Assignation : la règle porte sa catégorie (persistée).
    const { regle: r } = store.regleAnonCreer('Mairie de Lyon', ['Mairie'])
    const maj = store.regleAnonCategoriser(r.id, 'ORG')
    expect(maj?.categorie).toBe('ORG')
    // Retrait : le champ disparaît.
    const retire = store.regleAnonCategoriser(r.id, null)
    expect(retire?.categorie).toBeUndefined()
    expect('categorie' in (retire ?? {})).toBe(false)
    // Règle inconnue → null sans erreur.
    expect(store.regleAnonCategoriser('inconnue', 'PER')).toBeNull()
  })
})

describe('CorpusStore — E4 : tabAnon + paramsAnonCorpus écrits à la création', () => {
  test('règles du .crp (catégories comprises) + params persistés ; import .sonal idempotent', async () => {
    const { mapperTabAnon, mapperParamsAnon } = await import('../src/shared/corpus/migrationCrp')
    const dir = mkdtempSync(join(tmpdir(), 'sonal-e4-'))
    const crp = readFileSync(join(process.cwd(), 'test/fixtures/corpusV1.crp'), 'utf8')
    const a = analyserCrp(crp, 'MonCorpus.crp')
    if (!a.ok) throw new Error('fixture invalide')
    const { apercu } = a
    let n = 0
    const regles = mapperTabAnon(apercu.raw.tabAnon, () => `reg-crp-${++n}`)
    const paramsAnon = mapperParamsAnon(apercu.raw.paramsAnonCorpus)

    const corpus = new CorpusStore(dir).migrerDepuisV1(
      apercu.nom,
      { cheminCrp: '/m/MonCorpus.crp', dateCreation: null },
      [],
      [],
      regles,
      paramsAnon,
    )
    // Les 3 règles du .crp sont là, catégories et double pseudo compris.
    expect(Object.keys(corpus.reglesAnon)).toHaveLength(3)
    const mairie = Object.values(corpus.reglesAnon).find((r) => r.entite[0] === 'Maison des Habitants')
    expect(mairie?.categorie).toBe('ORG')
    const enq = Object.values(corpus.reglesAnon).find((r) => r.entite[0] === 'Enquêteur')
    expect(enq?.pseudos).toEqual(['Énola', 'Camille'])
    expect(enq?.categorie).toBe('LOC')
    // Paramètres : priorité + thématiques actives (venus du .crp).
    expect(corpus.paramsAnon?.prioriteValidation).toBe('corpus')
    expect(corpus.paramsAnon?.thematiques?.actif).toBe(true)

    // Doctrine V1 « le global gagne » : un .sonal ré-important la même entité
    // est dédupliqué par alias — la règle .crp (et sa catégorie) reste seule.
    fusionnerReglesAnon(corpus, [{ id: 'reg-sonal-1', entite: ['Enquêteur'], pseudos: ['Autre'] }])
    const enqueteur = Object.values(corpus.reglesAnon).filter((r) => r.entite.includes('Enquêteur'))
    expect(enqueteur).toHaveLength(1)
    expect(enqueteur[0].id).toMatch(/^reg-crp-/)
    expect(enqueteur[0].categorie).toBe('LOC')
  })
})
