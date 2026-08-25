// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  CATEGORIES_NOTE_DEFAUT,
  normaliserCategoriesNote,
  normaliserNotes,
  prochainRang,
  renumeroterRangs,
  genIdNote,
  genIdCategorieNote,
  compterUsagesCategorieNote,
} from '../src/shared/entretien/notes'
import {
  sanitiserCorpsNote,
  corpsNoteEnTexte,
  echapperTexte,
  lireLiensNote,
  ATTR_LIENS_NOTE,
} from '../src/renderer/notes/sanitiser'
import { importerSonal } from '../src/renderer/import/importSonal'
import type { Note } from '../src/shared/format'

function doc(): Document {
  return new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html')
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('notes — normalisation', () => {
  test('absence de catégories → bacs par défaut', () => {
    const c = normaliserCategoriesNote(undefined)
    expect(c.map((x) => x.id)).toEqual(CATEGORIES_NOTE_DEFAUT.map((x) => x.id))
  })
  test('liste vide → bacs par défaut', () => {
    expect(normaliserCategoriesNote([]).length).toBe(CATEGORIES_NOTE_DEFAUT.length)
  })
  test('catégories personnalisées conservées (copie)', () => {
    const src = [{ id: 'x', nom: 'synthèse', couleur: '#fff' }]
    const c = normaliserCategoriesNote(src)
    expect(c).toEqual(src)
    expect(c).not.toBe(src) // copie défensive
  })
  test('absence de notes → []', () => {
    expect(normaliserNotes(undefined)).toEqual([])
  })
  test('normalisation robuste d\'une note dégénérée', () => {
    const [n] = normaliserNotes([
      { id: 'n1', categorieId: '', date: undefined, statut: 'public', corps: undefined, rang: 'x' } as unknown as Note,
    ])
    expect(n.categorieId).toBe('ncat_generale')
    expect(n.date).toBeNull()
    expect(n.statut).toBe('public')
    expect(n.corps).toBe('')
    expect(n.rang).toBe(0)
  })

  test('compterUsagesCategorieNote compte les notes de TOUS les entretiens', () => {
    const ents = [
      { notes: [{ categorieId: 'a' }, { categorieId: 'b' }] },
      { notes: [{ categorieId: 'a' }] },
      {}, // entretien sans notes
    ]
    expect(compterUsagesCategorieNote(ents, 'a')).toBe(2)
    expect(compterUsagesCategorieNote(ents, 'b')).toBe(1)
    expect(compterUsagesCategorieNote(ents, 'x')).toBe(0)
  })
})

describe('notes — rangs', () => {
  const notes: Note[] = [
    { id: 'a', categorieId: 'ncat_generale', date: null, statut: 'prive', corps: '', rang: 2, creeLe: '', modifieLe: null },
    { id: 'b', categorieId: 'ncat_generale', date: null, statut: 'prive', corps: '', rang: 0, creeLe: '', modifieLe: null },
    { id: 'c', categorieId: 'ncat_generale', date: null, statut: 'prive', corps: '', rang: 1, creeLe: '', modifieLe: null },
  ]
  test('prochainRang = max + 1 (0 si vide)', () => {
    expect(prochainRang(notes)).toBe(3)
    expect(prochainRang([])).toBe(0)
  })
  test('renumeroterRangs rend les rangs denses selon l\'ordre du tableau', () => {
    const tri = [...notes].sort((a, b) => a.rang - b.rang)
    const r = renumeroterRangs(tri)
    expect(r.map((n) => n.rang)).toEqual([0, 1, 2])
    expect(r.map((n) => n.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('notes — ids', () => {
  test('genIdNote préfixe unique-ish', () => {
    expect(genIdNote()).toMatch(/^note_/)
    expect(genIdNote()).not.toBe(genIdNote())
  })
  test('genIdCategorieNote préfixe', () => {
    expect(genIdCategorieNote()).toMatch(/^ncat_/)
  })
})

describe('sanitiser — corps de note', () => {
  test('échappe le texte brut', () => {
    expect(echapperTexte('a<b>c')).toBe('a&lt;b&gt;c')
  })
  test('conserve <mark> et échappe le texte autour', () => {
    const s = sanitiserCorpsNote('texte <mark>important</mark> & suite', doc())
    expect(s).toBe('texte <mark>important</mark> &amp; suite')
  })
  test('aplatit les tags non autorisés (garde le texte)', () => {
    const s = sanitiserCorpsNote('<b>gras</b> <script>alert(1)</script>ok', doc())
    expect(s).toBe('gras alert(1)ok')
  })
  test('retire les <mark> vides', () => {
    expect(sanitiserCorpsNote('a<mark></mark>b', doc())).toBe('ab')
  })
  test('br devient saut de ligne', () => {
    expect(sanitiserCorpsNote('ligne1<br>ligne2', doc())).toBe('ligne1\nligne2')
  })
})

describe('sanitiser — liaison passages importants ↔ commentaires', () => {
  test('un data-liens valide est conservé sur le <mark>', () => {
    const s = sanitiserCorpsNote(`<mark ${ATTR_LIENS_NOTE}="a-abc a-def">p</mark>`, doc())
    expect(s).toBe(`<mark ${ATTR_LIENS_NOTE}="a-abc a-def">p</mark>`)
  })
  test('les ids invalides sont filtrés de la liste', () => {
    const s = sanitiserCorpsNote(`<mark ${ATTR_LIENS_NOTE}="a-abc &lt;b&gt; y_2">p</mark>`, doc())
    expect(s).toBe(`<mark ${ATTR_LIENS_NOTE}="a-abc y_2">p</mark>`)
  })
  test('une valeur intégralement invalide laisse un <mark> nu', () => {
    const s = sanitiserCorpsNote('<mark data-liens="&lt;script&gt;">p</mark>', doc())
    expect(s).toBe('<mark>p</mark>')
  })
  test('tout autre attribut est jeté (jamais de v-html pollué)', () => {
    const s = sanitiserCorpsNote('<mark data-x="1" onclick="evil()" class="z">t</mark>', doc())
    expect(s).toBe('<mark>t</mark>')
  })
  test('un <mark> vide disparaît même porteur de liens', () => {
    expect(sanitiserCorpsNote(`a<mark ${ATTR_LIENS_NOTE}="a-x"></mark>b`, doc())).toBe('ab')
  })
  test('lireLiensNote rend les ids valides, dédupliqués', () => {
    const d = parse(`<mark data-liens="a-b a-b a-c  ">x</mark>`)
    expect(lireLiensNote(d.body.querySelector('mark')!)).toEqual(['a-b', 'a-c'])
    const d2 = parse('<mark>nu</mark>')
    expect(lireLiensNote(d2.body.querySelector('mark')!)).toEqual([])
  })
})

describe('corpsNoteEnTexte — vue expand', () => {
  test('marques rendues en ▸…◂, texte préservé', () => {
    const t = corpsNoteEnTexte('intro <mark>passage</mark> fin', doc())
    expect(t).toBe('intro ▸passage◂ fin')
  })
})

describe('import .sonal — migration des notes V1', () => {
  const html = (notes: string) => `<!DOCTYPE html><html><head></head><body>
    <div id="contenuText"><div class="lblseg" data-loc="1"><span data-rk="1">Bonjour</span></div></div>
    <textarea id="txtnotes">${notes}</textarea>
    <script id="loc-json" type="application/json">["Interviewer","Loc1"]</script>
  </body></html>`

  test('texte libre V1 → une note « générale » sans date, privée', () => {
    const r = importerSonal(html('mes notes de terrain'), parse(html('mes notes de terrain')))
    expect(r.payload.notes).toHaveLength(1)
    const n = r.payload.notes![0]
    expect(n.categorieId).toBe('ncat_generale')
    expect(n.date).toBeNull()
    expect(n.statut).toBe('prive')
    expect(n.corps).toBe('mes notes de terrain')
    expect(n.rang).toBe(0)
    expect(r.legacy.notes).toBe('mes notes de terrain') // préservé
  })

  test('aucune note V1 → liste vide, le payload ne porte PAS les catégories (elles vivent au corpus)', () => {
    const r = importerSonal(html('   '), parse(html('   ')))
    expect(r.payload.notes).toEqual([])
    expect('categoriesNote' in r.payload).toBe(false)
  })

  test('le corps est échappé si la note contient du <', () => {
    const r = importerSonal(html('a < b & c'), parse(html('a < b & c')))
    expect(r.payload.notes![0].corps).toBe('a &lt; b &amp; c')
  })
})
