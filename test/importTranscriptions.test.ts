// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import { importerFichier } from '../src/renderer/formatSonal/sas'

function importer(nom: string, contenu: string) {
  return importerFichier(nom, contenu, (html) => new DOMParser().parseFromString(html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ''), 'text/html')).payload
}

function blocs(payload: ReturnType<typeof importer>) {
  const doc = payload.corpsTexte as {
    content: Array<{ attrs: { loc: number | null }; content?: Array<{ text?: string }> }>
  }
  return doc.content.map((bloc) => ({
    loc: bloc.attrs.loc,
    texte: (bloc.content ?? []).map((n) => n.text ?? '').join('').trim(),
  }))
}

function sousTitres(textes: string[], separateur = '\n') {
  return textes.map((texte, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i + 1},000\n${texte}\n`)
    .join('\n').replace(/\n/g, separateur)
}

describe('import TXT tabulé', () => {
  test.each(['\n', '\r\n', '\r'])('temps et locuteurs sont reconnus avec les fins de ligne %j', (separateur) => {
    const payload = importer('entretien.TXT', [
      '\uFEFF0.00\tSPEAKER_00\tBonjour tout le monde.',
      '',
      '73.90\tSPEAKER_01\tSalut !',
    ].join(separateur))
    expect(payload.locuteurs.map((l) => [l.index, l.nom])).toEqual([[1, 'SPEAKER_00'], [2, 'SPEAKER_01']])
    expect(blocs(payload)).toEqual([{ loc: 1, texte: 'Bonjour tout le monde.' }, { loc: 2, texte: 'Salut !' }])
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 73.9, 73.9])
    expect(payload.ancres.at(-1)?.t).toBe(73.9)
  })

  test('un même locuteur forme un tour, sans coller les mots ni perdre les repères internes', () => {
    const payload = importer('tadddam.txt', '0\tAlice\tPremier passage\n2.5\tAlice\tla suite\n4\tBob\tRéponse')
    expect(blocs(payload)).toEqual([{ loc: 1, texte: 'Premier passage la suite' }, { loc: 2, texte: 'Réponse' }])
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 2.5, 4, 4])
    expect(payload.ancres[1].pos).toBeGreaterThan(payload.ancres[0].pos)
  })

  test('les décimales à virgule, les tabulations dans le texte et les temps égaux sont conservés', () => {
    const payload = importer('entretien.txt', '0,25\tÉlodie Martin\tUn\tmot\n0,25\tBob\tOui')
    expect(blocs(payload)[0].texte).toBe('Un\tmot')
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(['Élodie Martin', 'Bob'])
    expect(payload.ancres.every((a) => a.t === 0.25)).toBe(true)
  })

  test('un passage unique ne reçoit pas de fin inventée', () => {
    const payload = importer('entretien.txt', '73.90\tAlice\tBonjour')
    expect(payload.ancres.map((a) => a.t)).toEqual([73.9])
  })

  test('texte et noms restent littéraux dans le document intermédiaire', () => {
    const nom = 'Alice </script><script>intrus</script>'
    const texte = 'Un <exemple> & des entités &lt;mot&gt;.'
    const payload = importer('entretien.txt', `0\t${nom}\t${texte}`)
    expect(payload.locuteurs[0].nom).toBe(nom)
    expect(blocs(payload)[0].texte).toBe(texte)
  })

  test.each([
    ['-1\tAlice\tBonjour', 'secondes'],
    ['NaN\tAlice\tBonjour', 'secondes'],
    ['Infinity\tAlice\tBonjour', 'secondes'],
    ['12secondes\tAlice\tBonjour', 'secondes'],
    ['1e3\tAlice\tBonjour', 'secondes'],
    ['\tAlice\tBonjour', 'secondes'],
    ['1\t\tBonjour', 'locuteur'],
    ['1\tAlice\t', 'texte'],
    ['1\tAlice', 'trois colonnes'],
  ])('une ligne invalide est rejetée : %s', (ligne, erreur) => {
    expect(() => importer('entretien.txt', ligne)).toThrow(new RegExp(`Ligne 1.*${erreur}`))
  })

  test('aucune ligne erronée ne disparaît silencieusement, et le numéro inclut les lignes vides', () => {
    expect(() => importer('entretien.txt', '0\tAlice\tBonjour\n\nligne incomplète\n2\tBob\tSalut'))
      .toThrow(/Ligne 3.*trois colonnes/)
    expect(() => importer('entretien.txt', '10\tAlice\tBonjour\n2\tBob\tSalut'))
      .toThrow(/Ligne 2.*précède/)
  })

  test.each([
    ['Texte brut.\nDeuxième ligne.', [], ['Texte brut.', 'Deuxième ligne.']],
    ['Alice : Bonjour\nBob : Salut', ['Alice', 'Bob'], ['Bonjour', 'Salut']],
    ['00:00:01 Alice\nBonjour\n00:00:04 Bob\nSalut', ['Alice', 'Bob'], ['Bonjour', 'Salut']],
    ['00:00:01\t\tAlice\nBonjour\n00:00:04\t\tBob\nSalut', ['Alice', 'Bob'], ['Bonjour', 'Salut']],
  ])('les formats TXT existants restent reconnus : %s', (contenu, noms, textes) => {
    const payload = importer('entretien.txt', contenu)
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(noms)
    expect(blocs(payload).map((b) => b.texte)).toEqual(textes)
  })
})

describe('locuteurs et lignes de sous-titres', () => {
  test.each(['Alice', 'Élodie Martin', 'Jean Pierre de la Tour', 'SPEAKER_00', 'Anne-Marie', 'O’Neill', "O'Neill", 'Speaker 12'])('le préfixe %s devient un locuteur', (nom) => {
    const payload = importer('entretien.srt', sousTitres([`${nom} : Bonjour`, 'Bob: Salut']))
    expect(payload.locuteurs.map((l) => l.nom)).toEqual([nom, 'Bob'])
    expect(blocs(payload)).toEqual([{ loc: 1, texte: 'Bonjour' }, { loc: 2, texte: 'Salut' }])
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 1, 1, 2])
  })

  test('les passages sans préfixe restent sans locuteur, même dans un fichier mixte', () => {
    const payload = importer('entretien.srt', sousTitres([
      'Alice: Bonjour', 'Un passage sans nom', 'None: Sans personne identifiée', 'Bob : Salut',
    ]))
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(['Alice', 'Bob'])
    expect(blocs(payload).map((b) => b.loc)).toEqual([1, null, null, 2])
    expect(blocs(payload)[2].texte).toBe('Sans personne identifiée')
  })

  test('les tours sont regroupés par locuteur, avec toutes les bornes temporelles', () => {
    const payload = importer('entretien.srt', sousTitres(['Alice: Bonjour', 'Alice: la suite', 'Bob: Oui']))
    expect(blocs(payload)).toEqual([{ loc: 1, texte: 'Bonjour la suite' }, { loc: 2, texte: 'Oui' }])
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 1, 2, 2, 3])
  })

  test('une mention de Speaker au milieu du texte n’est pas effacée', () => {
    const payload = importer('entretien.srt', sousTitres(['Alice: Je lis Speaker 12: dans le document.']))
    expect(blocs(payload)[0].texte).toBe('Je lis Speaker 12: dans le document.')
  })

  test('un horaire ou une URL ne devient pas un locuteur', () => {
    const payload = importer('entretien.srt', sousTitres(['12:30 rendez-vous', 'https://exemple.fr']))
    expect(payload.locuteurs).toEqual([])
    expect(blocs(payload).map((b) => b.texte)).toEqual(['12:30 rendez-vous', 'https://exemple.fr'])
  })

  test.each(['\n', '\r\n', '\r'])('un SRT multiligne garde ses espaces (%j)', (separateur) => {
    const payload = importer('entretien.srt', sousTitres(['Alice: Bonjour\ntout le monde'], separateur))
    expect(blocs(payload)[0].texte).toBe('Bonjour tout le monde')
  })

  test('WebVTT garde les voix, les espaces et les temps malgré les paramètres et les commentaires', () => {
    const payload = importer('entretien.vtt', `WEBVTT\n\nNOTE un commentaire\nà ignorer\n\nSTYLE\n::cue { color: red; }\n\npassage-1\n00:00.000 --> 00:02.000 align:start\n<v Alice>Bonjour\ntout le monde</v>\n\npassage-2\n00:02.000 --> 00:04.000\n<v Bob>Salut</v>\n`)
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(['Alice', 'Bob'])
    expect(blocs(payload)).toEqual([{ loc: 1, texte: 'Bonjour tout le monde' }, { loc: 2, texte: 'Salut' }])
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 2, 2, 4])
  })
})
