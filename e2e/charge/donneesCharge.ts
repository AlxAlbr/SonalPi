import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import type { Annotation } from '../../src/shared/entretien/annotation'

export interface ProfilCharge {
  caracteres: number
  mots: number
  paragraphes: number
  annotations: number
  tailleFichierOctets: number
}

interface PlageParagraphe {
  from: number
  longueur: number
  debutLineaire: number
}

const PHRASE =
  "La personne interrogée décrit son expérience, les changements observés et les décisions prises avec ses collègues sur le terrain. "

function creerParagraphes(tailleVisee: number): { contenu: unknown[]; texte: string; plages: PlageParagraphe[] } {
  const contenu: unknown[] = []
  const textes: string[] = []
  const plages: PlageParagraphe[] = []
  let restant = tailleVisee
  let positionPm = 1
  let positionLineaire = 0
  let index = 1

  while (restant > 0) {
    const prefixe = `Tour ${index}. `
    let texte = ''
    while (texte.length < 420) texte += prefixe + PHRASE
    texte = texte.slice(0, Math.min(420, restant))
    contenu.push({
      type: 'paragraph',
      attrs: { loc: index % 2 === 0 ? 2 : 1 },
      content: [{ type: 'text', text: texte }],
    })
    textes.push(texte)
    plages.push({ from: positionPm, longueur: texte.length, debutLineaire: positionLineaire })
    positionPm += texte.length + 2
    positionLineaire += texte.length
    restant -= texte.length
    index++
  }

  return { contenu, texte: textes.join('\n'), plages }
}

function creerAnnotations(nombre: number, tailleTexte: number, plages: PlageParagraphe[]): Annotation[] {
  if (nombre > Math.floor(tailleTexte / 2)) {
    throw new Error(`Le nombre d'annotations (${nombre}) est trop élevé pour ${tailleTexte} caractères.`)
  }
  const annotations: Annotation[] = []
  let indexPlage = 0

  for (let i = 0; i < nombre; i++) {
    const cible = Math.floor(((i + 0.5) * tailleTexte) / nombre)
    while (
      indexPlage < plages.length - 1 &&
      plages[indexPlage].debutLineaire + plages[indexPlage].longueur <= cible
    ) indexPlage++
    const plage = plages[indexPlage]
    const positionLocale = Math.min(cible - plage.debutLineaire, plage.longueur - 1)
    const from = plage.from + positionLocale
    const to = Math.min(from + 14, plage.from + plage.longueur)
    const variante = i % 10

    if (variante < 6) {
      annotations.push({ id: `charge-${i}`, type: 'codage', from, to, auteur: 'Test de charge', code: `cat_00${(i % 3) + 1}` })
    } else if (variante < 8) {
      annotations.push({ id: `charge-${i}`, type: 'anon', from, to, auteur: 'Test de charge', pseudo: `Personne ${i % 20}`, etat: 'anonymise' })
    } else {
      annotations.push({ id: `charge-${i}`, type: 'commentaire', from, to, auteur: 'Test de charge', texte: `Commentaire synthétique ${i}.` })
    }
  }
  return annotations
}

export function ecrireProfilCharge(
  userDataDir: string,
  tailleVisee: number,
  nombreAnnotations: number,
): ProfilCharge {
  const dirCorpus = join(userDataDir, 'corpus')
  const dirEntretiens = join(dirCorpus, 'entretiens')
  mkdirSync(dirEntretiens, { recursive: true })
  const maintenant = new Date().toISOString()
  const { contenu, texte, plages } = creerParagraphes(tailleVisee)
  const annotations = creerAnnotations(nombreAnnotations, texte.replaceAll('\n', '').length, plages)
  const corpus: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Corpus de charge',
    codebook: {
      cat_001: { id: 'cat_001', nom: 'Expérience', couleur: '#2864dc', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      cat_002: { id: 'cat_002', nom: 'Changement', couleur: '#d56620', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' },
      cat_003: { id: 'cat_003', nom: 'Décision', couleur: '#268453', ordre: 2, parent: null, actif: true, codeExport: 'cat_003' },
    },
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      charge: { titre: `Entretien ${tailleVisee} caractères`, date: null, lastModified: maintenant, rangAjout: 1 },
    },
    ordreEntretiens: ['charge'],
  }
  const entretien: EntretienFichier = {
    formatVersion: FORMAT_VERSION,
    lastModified: maintenant,
    corpsTexte: { type: 'doc', content: contenu },
    annotations,
    ancres: [],
    locuteurs: [
      { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Personne interrogée', valeursLoc: {}, personneRef: null },
    ],
    meta: { valeursGen: {}, audioRef: null },
    brouillonsAnon: [],
    notes: [],
    reperesPassages: [],
  }
  const cheminEntretien = join(dirEntretiens, 'charge.json')
  writeFileSync(join(dirCorpus, 'corpus.crp'), JSON.stringify(corpus), 'utf8')
  writeFileSync(cheminEntretien, JSON.stringify(entretien), 'utf8')
  writeFileSync(
    join(userDataDir, 'settings.json'),
    JSON.stringify({ recents: [dirCorpus] }, null, 2),
    'utf8',
  )

  return {
    caracteres: texte.replaceAll('\n', '').length,
    mots: texte.trim().split(/\s+/u).length,
    paragraphes: contenu.length,
    annotations: annotations.length,
    tailleFichierOctets: statSync(cheminEntretien).size,
  }
}
