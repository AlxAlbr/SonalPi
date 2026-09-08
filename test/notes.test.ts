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
  normaliserNotesLues,
  corpsNoteEnTexte,
  echapperTexte,
  surlignerHtml,
  lireLiensNote,
  libelleRefCommentaire,
  corpsAvecRefsCommentaires,
  decoreRefsCommentaires,
  pruneRefsCommentaires,
  CLASSE_REF_NOTE,
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
      { id: 'n1', categorieId: '', titre: undefined, date: undefined, statut: 'public', corps: undefined, rang: 'x' } as unknown as Note,
    ])
    expect(n.categorieId).toBe('ncat_generale')
    expect(n.titre).toBe('') // ancien fichier sans titre → chaîne vide
    expect(n.date).toBeNull()
    expect(n.statut).toBe('public')
    expect(n.corps).toBe('')
    expect(n.locuteurIds).toEqual([])
    expect(n.rang).toBe(0)
  })
  test('normalise les locuteurs concernés', () => {
    const [n] = normaliserNotes([
      { id: 'n1', categorieId: 'a', titre: '', date: null, statut: 'prive', corps: '',
        locuteurIds: ['l1', '', 'l1', 'l2'], rang: 0, creeLe: '', modifieLe: null },
    ])
    expect(n.locuteurIds).toEqual(['l1', 'l2'])
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
    { id: 'a', categorieId: 'ncat_generale', titre: '', date: null, statut: 'prive', corps: '', rang: 2, creeLe: '', modifieLe: null },
    { id: 'b', categorieId: 'ncat_generale', titre: '', date: null, statut: 'prive', corps: '', rang: 0, creeLe: '', modifieLe: null },
    { id: 'c', categorieId: 'ncat_generale', titre: '', date: null, statut: 'prive', corps: '', rang: 1, creeLe: '', modifieLe: null },
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

describe('sanitiser — notes lues depuis un corpus', () => {
  test('retire les charges XSS avant leur entrée dans l’état du renderer', () => {
    const d = doc()
    const fenetre = d.defaultView as (Window & { __xssCorpus?: number }) | null
    const [note] = normaliserNotesLues([
      {
        id: 'n-xss',
        categorieId: 'ncat_generale',
        titre: 'Corpus hostile',
        date: null,
        statut: 'prive',
        corps:
          '<img src="invalide" onerror="globalThis.__xssCorpus=1">' +
          '<script>globalThis.__xssCorpus=2</script>' +
          '<svg onload="globalThis.__xssCorpus=3">dessin</svg>' +
          '<mark onclick="globalThis.__xssCorpus=4">passage</mark>' +
          '<a href="javascript:globalThis.__xssCorpus=5">lien</a>',
        rang: 0,
        creeLe: '2026-01-01T00:00:00.000Z',
        modifieLe: null,
      },
    ], d)

    expect(fenetre?.__xssCorpus).toBeUndefined()
    expect(note.corps).toBe('globalThis.__xssCorpus=2dessin<mark>passage</mark>lien')
    expect(note.corps).not.toMatch(/<(?:img|svg|script|a)\b|\bon\w+\s*=|javascript:/i)
  })

  test('ne conserve que les passages et les identifiants de liens valides', () => {
    const [note] = normaliserNotesLues([
      {
        id: 'n-attribut',
        categorieId: 'ncat_generale',
        titre: '',
        date: null,
        statut: 'public',
        corps: '<em data-liens="a-ok mauvais&lt;id" style="background:url(javascript:x)">lié</em>',
        rang: 0,
        creeLe: '',
        modifieLe: null,
      },
    ], doc())

    expect(note.corps).toBe('<em data-liens="a-ok">lié</em>')
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
  test('un <em> est conservé, avec ou sans liens valides', () => {
    expect(sanitiserCorpsNote('<em>voix du terrain</em>', doc()))
      .toBe('<em>voix du terrain</em>')
    expect(sanitiserCorpsNote(`<em ${ATTR_LIENS_NOTE}="a-xyz">lié</em>`, doc()))
      .toBe(`<em ${ATTR_LIENS_NOTE}="a-xyz">lié</em>`)
  })
  test('un <em> porteur d\'attributs étrangers est nettoyé', () => {
    expect(sanitiserCorpsNote('<em style="color:red" onclick="x()">t</em>', doc()))
      .toBe('<em>t</em>')
  })
  test('les passages vides mark OU em disparaissent', () => {
    expect(sanitiserCorpsNote('a<mark></mark>b<em> </em>c', doc())).toBe('abc')
  })
  test('imbrication mark/em survit à la sanitisation', () => {
    expect(sanitiserCorpsNote('<mark>important <em>et lié</em></mark>', doc()))
      .toBe('<mark>important <em>et lié</em></mark>')
  })
})

describe('références de commentaires dans les cartes', () => {
  const commentaires = new Map([
    ['a-1', { auteur: 'alice', texte: 'un début de commentaire assez long pour être tronqué ici oui' }],
    ['a-2', { auteur: '', texte: 'court' }],
  ])
  const resolver = (id: string) => commentaires.get(id) ?? null

  test('libelleRefCommentaire tronque et nomme « sans auteur » si vide', () => {
    expect(libelleRefCommentaire('alice', 'court')).toBe('alice : court')
    expect(libelleRefCommentaire('', 'x'.repeat(50)).endsWith('…')).toBe(true)
    expect(libelleRefCommentaire('', 'court').startsWith('sans auteur')).toBe(true)
  })

  test('une référence [auteur : début…] suit chaque passage lié résolu', () => {
    const s = corpsAvecRefsCommentaires(
      `avant <em ${ATTR_LIENS_NOTE}="a-1">lié</em> après`,
      doc(),
      resolver,
    )
    expect(s).toContain('</em> <span class="ref-note-commentaire" data-ref="a-1" contenteditable="false">')
    expect(s).toContain('[alice : un début de commentaire assez long pour …]</span> après')
  })

  test('plusieurs liens sur un passage → autant de références', () => {
    const s = corpsAvecRefsCommentaires(
      `<em ${ATTR_LIENS_NOTE}="a-1 a-2">lié</em>`,
      doc(),
      resolver,
    )
    expect(s.match(/ref-note-commentaire/g)).toHaveLength(2)
    expect(s).toContain('[sans auteur : court]')
  })

  test('un id non résolu (commentaire supprimé) ne produit pas de référence', () => {
    const s = corpsAvecRefsCommentaires(
      `<em ${ATTR_LIENS_NOTE}="a-perdu">lié</em>`,
      doc(),
      resolver,
    )
    expect(s).not.toContain('ref-note-commentaire')
    // Le passage reste tel quel (la carte affiche un em lié sans référence).
    expect(s).toBe(`<em ${ATTR_LIENS_NOTE}="a-perdu">lié</em>`)
  })

  test('un corps sans attribut de liaison est rendu tel quel', () => {
    expect(corpsAvecRefsCommentaires('<mark>gras</mark>', doc(), resolver)).toBe('<mark>gras</mark>')
  })
})

describe('références dans la zone d\'édition (décor vivant)', () => {
  const commentaires = new Map([['a-1', { auteur: 'alice', texte: 'un commentaire' }]])
  const resolver = (id: string) => commentaires.get(id) ?? null

  function conteneur(html: string): HTMLElement {
    const d = doc()
    const c = d.createElement('div')
    c.innerHTML = html
    return c
  }

  test('decoreRefsCommentaires pose les refs après chaque passage lié', () => {
    const c = conteneur(`<p><em ${ATTR_LIENS_NOTE}="a-1">lié</em> suite</p>`)
    decoreRefsCommentaires(c, document, resolver)
    const ref = c.querySelector(`.${CLASSE_REF_NOTE}`)
    expect(ref?.textContent).toBe('[alice : un commentaire]')
    expect(ref?.getAttribute('contenteditable')).toBe('false')
    expect(ref?.previousElementSibling?.textContent).toBe('lié')
  })

  test('decoreRefsCommentaires reconstruit sans dupliquer', () => {
    const c = conteneur(`<em ${ATTR_LIENS_NOTE}="a-1">lié</em>`)
    decoreRefsCommentaires(c, document, resolver)
    decoreRefsCommentaires(c, document, resolver)
    expect(c.querySelectorAll(`.${CLASSE_REF_NOTE}`)).toHaveLength(1)
  })

  test('pruneRefsCommentaires retire les refs au lien disparu, garde les autres', () => {
    const c = conteneur(
      `<em ${ATTR_LIENS_NOTE}="a-1">lié</em><span class="${CLASSE_REF_NOTE}" data-ref="a-1">[alice]</span>` +
      `<span class="${CLASSE_REF_NOTE}" data-ref="a-perdu">[fantôme]</span>`,
    )
    pruneRefsCommentaires(c)
    const restantes = c.querySelectorAll(`.${CLASSE_REF_NOTE}`)
    expect(restantes).toHaveLength(1)
    expect(restantes[0].getAttribute('data-ref')).toBe('a-1')
  })

  test('le sanitisé JETTE entièrement les spans de référence (jamais sauvegardés)', () => {
    const s = sanitiserCorpsNote(
      `<em ${ATTR_LIENS_NOTE}="a-1">lié</em><span class="${CLASSE_REF_NOTE}" data-ref="a-1">[alice : un commentaire]</span> suite`,
      doc(),
    )
    expect(s).toBe(`<em ${ATTR_LIENS_NOTE}="a-1">lié</em> suite`)
  })
})

describe('surlignerHtml — surbrillance de la recherche', () => {
  test('requête vide → HTML inchangé', () => {
    expect(surlignerHtml('<mark>a</mark>', '  ', doc())).toBe('<mark>a</mark>')
  })
  test('une occurrence est enveloppée d\'un span .surbrillance-note', () => {
    const s = surlignerHtml('du texte important ici', 'important', doc())
    expect(s).toBe('du texte <span class="surbrillance-note">important</span> ici')
  })
  test('insensible à la casse, toutes les occurrences', () => {
    const s = surlignerHtml('Abc abc ABC', 'abc', doc())
    expect(s.match(/surbrillance-note/g)).toHaveLength(3)
    expect(s).toContain('>Abc</span>')
  })
  test('le texte hors correspondances est préservé tel quel', () => {
    expect(surlignerHtml('a &lt;b&gt; cible fin', 'cible', doc()))
      .toBe('a &lt;b&gt; <span class="surbrillance-note">cible</span> fin')
  })
  test('les balises de passage survivent au surlignage', () => {
    const s = surlignerHtml('<mark>passage</mark> et em <em>lié</em>', 'li', doc())
    expect(s).toBe('<mark>passage</mark> et em <em><span class="surbrillance-note">li</span>é</em>')
  })
  test('jamais de correspondance dans un attribut ou un nom de balise', () => {
    // « em » apparaît dans le nom de balise et dans l'id de lien ; seul le
    //  TEXTE (débute par « em ») est surligné.
    const s = surlignerHtml(`<em ${ATTR_LIENS_NOTE}="a-em">empêché</em>`, 'em', doc())
    expect(s).toBe(`<em ${ATTR_LIENS_NOTE}="a-em"><span class="surbrillance-note">em</span>pêché</em>`)
  })
})

describe('corpsNoteEnTexte — vue expand', () => {
  test('marques rendues en ▸…◂, texte préservé', () => {
    const t = corpsNoteEnTexte('intro <mark>passage</mark> fin', doc())
    expect(t).toBe('intro ▸passage◂ fin')
  })
})

describe('import .sonal — migration des notes SonalPi1', () => {
  const html = (notes: string) => `<!DOCTYPE html><html><head></head><body>
    <div id="contenuText"><div class="lblseg" data-loc="1"><span data-rk="1">Bonjour</span></div></div>
    <textarea id="txtnotes">${notes}</textarea>
    <script id="loc-json" type="application/json">["Interviewer","Loc1"]</script>
  </body></html>`

  test('texte libre SonalPi1 → une note « générale » sans date, privée', () => {
    const r = importerSonal(parse(html('mes notes de terrain')))
    expect(r.payload.notes).toHaveLength(1)
    const n = r.payload.notes![0]
    expect(n.categorieId).toBe('ncat_generale')
    expect(n.date).toBeNull()
    expect(n.statut).toBe('prive')
    expect(n.corps).toBe('mes notes de terrain')
    expect(n.rang).toBe(0)
    expect(r.legacy.notes).toBe('mes notes de terrain') // préservé
  })

  test('aucune note SonalPi1 → liste vide, le payload ne porte PAS les catégories (elles vivent au corpus)', () => {
    const r = importerSonal(parse(html('   ')))
    expect(r.payload.notes).toEqual([])
    expect('categoriesNote' in r.payload).toBe(false)
  })

  test('le corps est échappé si la note contient du <', () => {
    const r = importerSonal(parse(html('a < b & c')))
    expect(r.payload.notes![0].corps).toBe('a &lt; b &amp; c')
  })
})
