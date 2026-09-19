// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  entreeSentinelle,
  entreeSansPseudos,
  entreePseudonymisable,
  NOM_SENTINELLE,
  NOM_SENTINELLE_2,
  PSEUDO_SENTINELLE,
  NOTES_LEGACY_SENTINELLE,
  CODE_HOSTILE,
  COULEUR_HOSTILE,
  CODE_SECOND,
} from './fixtures/export/entretiens'
import { sonalPseudonymise } from '../src/renderer/import/exportSonal'
import { genererTxt, genererHtml } from '../src/shared/export/formatsTexte'
import { optionsEfficaces, type OptionsExport } from '../src/shared/export/types'

const OPTS: OptionsExport = {
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: true,
}

/** Texte d'une page HTML exportée, scripts exclus (le contenu est splitté en spans). */
function texteDe(html: string): string {
  const brut = html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  return new DOMParser().parseFromString(brut, 'text/html').body.textContent ?? ''
}

describe('.sonal pseudonymisé — application des pseudos configurés', () => {
  test('remplace le locuteur préparé et conserve en clair celui sans pseudo', () => {
    const out = sonalPseudonymise(entreeSentinelle())
    expect(out).not.toContain(NOM_SENTINELLE)
    expect(out).toContain(NOM_SENTINELLE_2)
    expect(out).not.toContain('data-nomloc')
    expect(out).toContain(PSEUDO_SENTINELLE)
  })

  test('les anciennes notes SonalPi1 (migrées privées) ne sortent plus', () => {
    const out = sonalPseudonymise(entreeSentinelle())
    expect(out).not.toContain(NOTES_LEGACY_SENTINELLE)
    expect(out).not.toContain('window.__notesInjete')
  })

  test('les variables privées ne sortent plus', () => {
    const out = sonalPseudonymise(entreeSentinelle())
    expect(out).not.toContain('Privée-SENTINELLE')
    expect(out).not.toContain('Secret-SENTINELLE')
  })

  test('les règles et brouillons d anonymisation ne sortent plus', () => {
    const out = sonalPseudonymise(entreeSentinelle())
    expect(out).toMatch(/id="anon-json"[^>]*>\s*\{\s*\[\]\s*\}\s*<\/script>/)
  })
})

describe('formats documentaires pseudonymisés — application non bloquante', () => {
  test('TXT : les éléments sans pseudo restent en clair', () => {
    const out = genererTxt({ entree: entreeSansPseudos(), titre: 'T', notes: [], audioUrl: null }, OPTS)
    expect(out).toContain(NOM_SENTINELLE)
    expect(out).toContain(NOM_SENTINELLE_2)
  })

  test('TXT pseudonymisable : aucun nom réel', () => {
    const out = genererTxt({ entree: entreePseudonymisable(), titre: 'T', notes: [], audioRef: null }, OPTS)
    expect(out).not.toContain(NOM_SENTINELLE)
    expect(out).not.toContain(NOM_SENTINELLE_2)
    expect(out).toContain(PSEUDO_SENTINELLE)
  })

  test('HTML pseudonymisé : aucun nom réel, aucun chemin absolu de média', () => {
    const ctx = { entree: entreePseudonymisable(), titre: 'T', notes: [], audioRef: 'C:\\corpus\\ent.wav' }
    const out = genererHtml(ctx, OPTS)
    expect(out).not.toContain(NOM_SENTINELLE)
    expect(out).not.toContain(NOM_SENTINELLE_2)
    // Le chemin absolu local ne sort pas d'un export pseudonymisé.
    expect(out).not.toContain('file://')
  })
})

describe('codebook hostile — aucune injection dans la page autonome', () => {
  test('le code hostile n est jamais un sélecteur ni une classe CSS', () => {
    const out = genererHtml({ entree: entreeSentinelle(), titre: 'T', notes: [], audioRef: null }, OPTS)
    // Sélecteurs et classes : uniquement les identifiants sûrs dérivés.
    expect(out).not.toContain(`.${CODE_HOSTILE}`)
    expect(out).not.toContain(`class="${CODE_HOSTILE}`)
    expect(out).toContain('scat-')
  })

  test('la couleur hostile n est jamais interpolée dans le CSS ni le style', () => {
    const out = genererHtml({ entree: entreeSentinelle(), titre: 'T', notes: [], audioRef: null }, OPTS)
    expect(out).not.toContain('window.__couleurInjete')
    expect(out).not.toContain('</style><script')
    // La couleur saine du second code reste rendue.
    expect(out).toContain('#00ff00')
  })

  test('les multicodages conservent leurs deux catégories', () => {
    const out = genererHtml({ entree: entreeSentinelle(), titre: 'T', notes: [], audioRef: null }, OPTS)
    const idsSecond = out.match(new RegExp(`scat-[0-9a-f]+`, 'g')) ?? []
    expect(new Set(idsSecond).size).toBeGreaterThanOrEqual(2)
  })

  test('le texte contenant des marqueurs DOCX passe en clair dans le TXT', () => {
    const out = genererTxt({ entree: entreeSentinelle(), titre: 'T', notes: [], audioRef: null }, OPTS)
    expect(out).toContain('{g} **gras** littéral.')
  })
})

describe('optionsEfficaces — les options sans objet tombent à false', () => {
  test('un format sans l option ne la laisse pas à true', () => {
    const opts: OptionsExport = { ...OPTS }
    expect(optionsEfficaces('srt', opts)).toMatchObject({
      entete: false,
      notes: false,
      vars: false,
      thm: false,
      time: true,
    })
    expect(optionsEfficaces('sonal', opts)).toMatchObject({
      entete: false,
      notes: false,
      vars: false,
      time: false,
      loc: false,
      thm: false,
    })
  })
})
