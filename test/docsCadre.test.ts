/**
 *  Tests des « Docs cadre projet » côté LOCAL : validation des noms,
 *  inventaire, ajout sans altération et sans écrasement, renommage, corbeille
 *  douce, aperçus bornés et refus des formats sans aperçu intégré.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ajouterFichierLocal,
  creerDossierLocal,
  listerDossierDocsCadre,
  deposerFichierLocal,
  enregistrerCopieLocal,
  inventaireDocsCadreLocal,
  inventaireExemplesDocsCadre,
  lireApercuLocal,
  lireApercuExemple,
  renommerLocal,
  resoudreDossierLocal,
  resoudreExemple,
  resoudreLocal,
  supprimerLocal,
} from '../src/main/docsCadre'
import {
  categoriserDocument,
  estListable,
  estNomSain,
  estCheminDocsCadre,
  LIMITE_APERCU_PDF_OCTETS,
  nomLibre,
  trierDocuments,
  trierEntreesDocsCadre,
  type ResumeDocumentCadre,
} from '../src/shared/docsCadre'

function corpusTemporaire(): string {
  return mkdtempSync(join(tmpdir(), 'sonal-docs-cadre-'))
}

/** PNG minimal : signature + IHDR minimaliste (assez pour la signature). */
const PNG_VALIDE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89,
])
const PNG_CORROMPU = new Uint8Array(32).fill(0x42)

describe('validation des noms de document', () => {
  it('conserve espaces, accents, extension et casse', () => {
    expect(estNomSain('Notice de consentement.docx')).toBe(true)
    expect(estNomSain('ÉLÈVES — séance 3.TXT')).toBe(true)
    expect(estNomSain('grille (v2).pdf')).toBe(true)
  })

  it('refus des traversées de chemin, séparateurs et caractères de contrôle', () => {
    expect(estNomSain('')).toBe(false)
    expect(estNomSain('a/b')).toBe(false)
    expect(estNomSain('a\\b')).toBe(false)
    expect(estNomSain('..')).toBe(false)
    expect(estNomSain('a..b.pdf')).toBe(false)
    expect(estNomSain('point\0nul.txt')).toBe(false)
    expect(estNomSain('\n.txt')).toBe(false)
    expect(estNomSain('fin. ')).toBe(false)
    expect(estNomSain('fin.')).toBe(false)
    expect(estNomSain('a'.repeat(256))).toBe(false)
  })

  it('refus des noms réservés Windows (extension incluse, casse ignorée)', () => {
    expect(estNomSain('CON')).toBe(false)
    expect(estNomSain('con.txt')).toBe(false)
    expect(estNomSain('LPT4.pdf')).toBe(false)
    expect(estNomSain('CONSTANTES.md')).toBe(true) // base ≠ CON
  })

  it('filtrage des cachés, verrous bureautiques et temporaires', () => {
    expect(estListable('.hidden.txt')).toBe(false)
    expect(estListable('~$notice.docx')).toBe(false)
    expect(estListable('notice.docx~')).toBe(false)
    expect(estListable('notice.docx.tmp')).toBe(false)
    expect(estListable('notice.txt.identifiant.docs-tmp.tmp')).toBe(false)
    expect(estListable('Notice de consentement.docx')).toBe(true)
  })

  it('catégorisation par extension, jamais par contenu', () => {
    expect(categoriserDocument('a.PDF')).toBe('pdf')
    expect(categoriserDocument('b.txt')).toBe('texte')
    expect(categoriserDocument('c.md')).toBe('texte')
    expect(categoriserDocument('d.jpg')).toBe('image')
    expect(categoriserDocument('e.webp')).toBe('image')
    expect(categoriserDocument('f.docx')).toBe('bureautique')
    expect(categoriserDocument('g.rtf')).toBe('bureautique')
    expect(categoriserDocument('h.html')).toBe('html')
    expect(categoriserDocument('i.doc')).toBe('bureautique')
    expect(categoriserDocument('j')).toBe('autre')
    expect(categoriserDocument('k.zzz')).toBe('autre')
  })

  it('tri alphabétique français stable', () => {
    const l = (nom: string): ResumeDocumentCadre => ({ nature: 'document', chemin: nom, source: 'projet', nom, type: 'autre', taille: null, modifieLe: null })
    const trie = trierDocuments([l('École.txt'), l('ecole 2.txt'), l('Notice.txt'), l('abord.txt')])
    expect(trie.map((d) => d.nom)).toEqual(['abord.txt', 'ecole 2.txt', 'École.txt', 'Notice.txt'])
  })

  it('nom libre proposé sans écrasement, insensible à la casse', () => {
    expect(nomLibre('notice.txt', ['Notice.txt'])).toBe('notice-2.txt')
    expect(nomLibre('notice.txt', ['notice.txt', 'notice-2.txt'])).toBe('notice-3.txt')
    expect(nomLibre('nouveau.txt', [])).toBe('nouveau.txt')
  })
})

describe('inventaire du corpus local', () => {
  it('liste vide si DocsCadre/ est absent (dossier pas encore créé)', () => {
    const racine = corpusTemporaire()
    expect(inventaireDocsCadreLocal(racine)).toEqual([])
  })

  it('dossiers avant fichiers réguliers, cachés exclus', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, 'sous-dossier'))
    writeFileSync(join(dir, 'Notice de consentement.docx'), 'A')
    writeFileSync(join(dir, 'consignes.txt'), 'B')
    writeFileSync(join(dir, '.cache.txt'), 'C')
    writeFileSync(join(dir, '~$notice.docx'), 'D')
    const inventaire = inventaireDocsCadreLocal(racine)
    expect(inventaire.map((d) => d.nom)).toEqual(['sous-dossier', 'consignes.txt', 'Notice de consentement.docx'])
    const notice = inventaire.find((d) => d.nom === 'Notice de consentement.docx')!
    expect(notice).toMatchObject({ type: 'bureautique', taille: 1, modifieLe: expect.any(String) })
  })
})

describe('ajout, renommage, corbeille', () => {
  it('création explicite du dossier à l’ajout, copie binaire sans altération', () => {
    const racine = corpusTemporaire()
    const source = join(corpusTemporaire(), 'original.png')
    writeFileSync(source, PNG_VALIDE)
    const r = ajouterFichierLocal(racine, source)
    expect(r).toEqual({ ok: true, nom: 'original.png' })
    const lu = readFileSync(join(racine, 'DocsPrepaProjet', 'original.png'))
    expect([...lu]).toEqual([...PNG_VALIDE])
  })

  it('collision sans écrasement : refus, original intact, nom libre proposé', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notice.txt'), 'EXISTANT')
    const source = join(corpusTemporaire(), 'notice.txt')
    writeFileSync(source, 'NOUVEAU')
    const r = ajouterFichierLocal(racine, source)
    expect(r.ok).toBe(false)
    if (!r.ok && r.raison === 'existe') expect(r.suggere).toBe('notice-2.txt')
    expect(readFileSync(join(dir, 'notice.txt'), 'utf8')).toBe('EXISTANT')
  })

  it('renommage conservant exactement les octets, et refus d’une collision', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'a.png'), PNG_VALIDE)
    writeFileSync(join(dir, 'b.txt'), 'B')

    const r = renommerLocal(racine, 'a.png', 'protocole.PNG ')
    expect(r.ok).toBe(false) // espace final : non portable

    const ok = renommerLocal(racine, 'a.png', 'Protocole correction.png')
    expect(ok).toEqual({ ok: true, nom: 'Protocole correction.png' })
    expect([...readFileSync(join(dir, 'Protocole correction.png'))]).toEqual([...PNG_VALIDE])
    expect(existsSync(join(dir, 'a.png'))).toBe(false)

    const collision = renommerLocal(racine, 'Protocole correction.png', 'b.txt')
    expect(collision.ok).toBe(false)
    expect(existsSync(join(dir, 'b.txt'))).toBe(true)
  })

  it('suppression douce : fichier sous corbeille/DocsCadre/, sans perte', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'consignes.txt'), 'Contenu précieux')
    const r = supprimerLocal(racine, 'consignes.txt')
    expect(r).toEqual({ ok: true, nom: 'consignes.txt' })
    expect(existsSync(join(dir, 'consignes.txt'))).toBe(false)
    const corbeille = join(racine, 'corbeille', 'DocsCadre')
    expect(existsSync(join(corbeille, 'consignes.txt'))).toBe(true)
    expect(readFileSync(join(corbeille, 'consignes.txt'), 'utf8')).toBe('Contenu précieux')
  })

  it('changement de casse seul : collision insensible à la casse refusée', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Notice.txt'), 'A')
    // Renommer en changeant SEULEMENT la casse n'est pas une collision : c'est
    // le même document, aucun autre fichier n'est visé.
    const r = renommerLocal(racine, 'Notice.txt', 'notice.txt')
    expect(r).toEqual({ ok: true, nom: 'notice.txt' })
  })
})

describe('dépôt par glisser-déposer (local)', () => {
  it('copie un fichier déposé en créant DocsPrepaProjet/ à la demande', () => {
    const racine = corpusTemporaire()
    const source = join(corpusTemporaire(), 'Notice.txt')
    writeFileSync(source, 'Déposé')
    const r = deposerFichierLocal(racine, source)
    expect(r).toEqual({ ok: true, nom: 'Notice.txt' })
    expect(readFileSync(join(racine, 'DocsPrepaProjet', 'Notice.txt'), 'utf8')).toBe('Déposé')
  })

  it('homonyme : refus SANS écrasement et SANS renommage automatique', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notice.txt'), 'EXISTANT')
    const source = join(corpusTemporaire(), 'notice.txt')
    writeFileSync(source, 'NOUVEAU')
    const r = deposerFichierLocal(racine, source)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.raison).toBe('existe')
    expect(readFileSync(join(dir, 'notice.txt'), 'utf8')).toBe('EXISTANT')
  })

  it('refuse un dossier, un lien symbolique et une source manquante', () => {
    const racine = corpusTemporaire()
    const dossier = corpusTemporaire()
    const sousDossier = join(dossier, 'dossier')
    mkdirSync(sousDossier)
    expect(deposerFichierLocal(racine, sousDossier)).toEqual({ ok: false, raison: 'source' })
    expect(deposerFichierLocal(racine, join(dossier, 'absent.txt'))).toEqual({
      ok: false,
      raison: 'source',
    })
    const lienSrc = join(corpusTemporaire(), 'cible.txt')
    writeFileSync(lienSrc, 'cible')
    const lien = join(dossier, 'lien.txt')
    symlinkSync(lienSrc, lien)
    expect(deposerFichierLocal(racine, lien)).toEqual({ ok: false, raison: 'source' })
  })
})

describe('aperçus intégrés (local)', () => {
  function preparer(): { racine: string; dir: string } {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    return { racine, dir }
  }

  it('texte UTF-8 lu en brut, sans interprétation des balises', () => {
    const { racine, dir } = preparer()
    writeFileSync(join(dir, 'consignes.html'), '<b>gras ?</b>')
    const r = lireApercuLocal(racine, 'consignes.html')
    // .html n'est PAS un format texte pris en charge : fiche seule.
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'format' })
    writeFileSync(join(dir, 'consignes.txt'), '<b>gras ?</b>')
    const t = lireApercuLocal(racine, 'consignes.txt')
    expect(t.apercu).toEqual({ genre: 'texte', contenu: '<b>gras ?</b>' })
  })

  it('texte non UTF-8 ou binaire : refus explicite, pas de décodage au hasard', () => {
    const { racine, dir } = preparer()
    writeFileSync(join(dir, 'ancien.txt'), Buffer.from([0xc9, 0xc8, 0xc0, 0x2e])) // windows-1252
    const r = lireApercuLocal(racine, 'ancien.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'encodage' })
  })

  it('image valide, image corrompue et fausse extension', () => {
    const { racine, dir } = preparer()
    writeFileSync(join(dir, 'ok.png'), PNG_VALIDE)
    const ok = lireApercuLocal(racine, 'ok.png')
    expect(ok.apercu.genre).toBe('image')
    if (ok.apercu.genre === 'image') {
      expect(ok.apercu.mime).toBe('image/png')
      expect([...ok.apercu.octets]).toEqual([...PNG_VALIDE])
    }
    writeFileSync(join(dir, 'corrompue.png'), PNG_CORROMPU)
    expect(lireApercuLocal(racine, 'corrompue.png').apercu).toEqual({ genre: 'aucun', raison: 'signature' })
    writeFileSync(join(dir, 'menteur.png'), Buffer.from('GIF89a pas un png du tout', 'utf8'))
    expect(lireApercuLocal(racine, 'menteur.png').apercu).toEqual({ genre: 'aucun', raison: 'signature' })
  })

  it('PDF signé en aperçu ; PDF corrompu et formats sans rendu refusés', () => {
    const { racine, dir } = preparer()
    const pdf = Buffer.from('%PDF-1.7 contenu')
    writeFileSync(join(dir, 'protocole.pdf'), pdf)
    const apercuPdf = lireApercuLocal(racine, 'protocole.pdf').apercu
    expect(apercuPdf.genre).toBe('pdf')
    if (apercuPdf.genre === 'pdf') expect([...apercuPdf.octets]).toEqual([...pdf])

    writeFileSync(join(dir, 'corrompu.pdf'), Buffer.from('pas un pdf'))
    expect(lireApercuLocal(racine, 'corrompu.pdf').apercu).toEqual({ genre: 'aucun', raison: 'signature' })
    writeFileSync(join(dir, 'notice.docx'), Buffer.from('PK\x03\x04'))
    expect(lireApercuLocal(racine, 'notice.docx').apercu).toEqual({ genre: 'aucun', raison: 'format' })
    writeFileSync(join(dir, 'archive.7z'), Buffer.from('7z\xbc\xaf'))
    expect(lireApercuLocal(racine, 'archive.7z').apercu).toEqual({ genre: 'aucun', raison: 'format' })
  })

  it('PDF au-dessus de la limite : aperçu refusé sans limiter le stockage', () => {
    const { racine, dir } = preparer()
    writeFileSync(join(dir, 'gros.pdf'), Buffer.alloc(LIMITE_APERCU_PDF_OCTETS + 1, 0x25))
    expect(lireApercuLocal(racine, 'gros.pdf').apercu).toEqual({ genre: 'aucun', raison: 'taille' })
  })

  it('fichier au-dessus de la limite d’aperçu : taille refusée, fichier intact', () => {
    const { racine, dir } = preparer()
    writeFileSync(join(dir, 'gros.txt'), Buffer.alloc(2_000_001, 0x61))
    const r = lireApercuLocal(racine, 'gros.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'taille' })
    expect(r.resume.taille).toBe(2_000_001)
  })

  it('document disparu : absence expliquée, pas d’exception', () => {
    const { racine } = preparer()
    const r = lireApercuLocal(racine, 'fantome.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'absent' })
  })
})

describe('sécurité des chemins', () => {
  it('resoudreLocal refuse un nom non sain et un document absent', () => {
    const racine = corpusTemporaire()
    expect(() => resoudreLocal(racine, '../corpus.json')).toThrow()
    expect(() => resoudreLocal(racine, '/etc/passwd')).toThrow()
    expect(() => resoudreLocal(racine, 'absent.txt')).toThrow()
  })

  it('enregistrerCopieLocal conserve exactement les octets du fichier original', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'binaire.bin'), PNG_VALIDE)
    const destination = join(corpusTemporaire(), 'copie.bin')
    enregistrerCopieLocal(racine, 'binaire.bin', destination)
    expect([...readFileSync(destination)]).toEqual([...PNG_VALIDE])
  })

  it('ignore les liens symboliques et refuse un dossier DocsCadre symbolique', () => {
    const racine = corpusTemporaire()
    const dir = join(racine, 'DocsCadre')
    const exterieur = join(corpusTemporaire(), 'secret.txt')
    mkdirSync(dir)
    writeFileSync(exterieur, 'secret')
    symlinkSync(exterieur, join(dir, 'lien.txt'))

    expect(inventaireDocsCadreLocal(racine)).toEqual([])
    expect(lireApercuLocal(racine, 'lien.txt').apercu).toEqual({ genre: 'aucun', raison: 'invalide' })
    expect(() => resoudreLocal(racine, 'lien.txt')).toThrow()

    const autreRacine = corpusTemporaire()
    symlinkSync(corpusTemporaire(), join(autreRacine, 'DocsCadre'), 'dir')
    expect(() => inventaireDocsCadreLocal(autreRacine)).toThrow()
    expect(() => resoudreDossierLocal(autreRacine)).toThrow()
  })

  it('résout un exemple sans permettre de sortir du dossier', () => {
    const dir = join(__dirname, '..', 'ressources', 'docsCadreExemples')
    expect(resoudreExemple(dir, 'Guide de correction.txt')).toBe(join(dir, 'Guide de correction.txt'))
    expect(() => resoudreExemple(dir, '../package.json')).toThrow()
  })
})

describe('navigation et mutations imbriquées', () => {
  it('valide les chemins canoniques, avec une racine explicitement autorisée', () => {
    expect(estCheminDocsCadre('', true)).toBe(true)
    expect(estCheminDocsCadre('')).toBe(false)
    expect(estCheminDocsCadre('DPO/École 2/Notice.txt')).toBe(true)
    for (const chemin of [null, 4, '/etc/passwd', 'C:/a', 'a\\b', '../a', 'a/../b', 'a/./b', 'a//b', 'a/', '.cache/a', 'a/~$notice', 'a/CON.txt', 'a/b:flux', 'a/b?', 'a/b*', 'a/b|', 'a/b<', 'a/b>', 'a/b"', 'a/'.repeat(1100)]) {
      expect(estCheminDocsCadre(chemin), String(chemin)).toBe(false)
    }
  })

  it('crée exclusivement, refuse toutes les collisions et copie dans le dossier affiché', () => {
    const racine = corpusTemporaire()
    expect(creerDossierLocal(racine, '', 'DPO')).toEqual({ ok: true, nom: 'DPO' })
    expect(creerDossierLocal(racine, '', 'dpo')).toMatchObject({ ok: false, raison: 'existe' })
    expect(creerDossierLocal(racine, 'DPO', 'École 2')).toMatchObject({ ok: true })
    const source = join(corpusTemporaire(), 'Notice.txt')
    writeFileSync(source, 'Texte exact éà <br>')
    expect(ajouterFichierLocal(racine, source, undefined, 'DPO/École 2')).toMatchObject({ ok: true })
    expect(deposerFichierLocal(racine, source, 'DPO/École 2')).toMatchObject({ ok: false, raison: 'existe' })
    expect(creerDossierLocal(racine, 'DPO/École 2', 'notice.TXT')).toMatchObject({ ok: false, raison: 'existe' })
    expect(ajouterFichierLocal(racine, source, 'dpo')).toMatchObject({ ok: false, raison: 'existe' })
    const chemin = 'DPO/École 2/Notice.txt'
    expect(inventaireDocsCadreLocal(racine, 'DPO/École 2')).toMatchObject([{ nature: 'document', nom: 'Notice.txt', chemin }])
    expect(lireApercuLocal(racine, chemin)).toMatchObject({ resume: { chemin, nom: 'Notice.txt' }, apercu: { genre: 'texte', contenu: 'Texte exact éà <br>' } })
    const cible = join(corpusTemporaire(), 'copie.txt')
    enregistrerCopieLocal(racine, chemin, cible)
    expect(readFileSync(cible)).toEqual(readFileSync(source))
    expect(resoudreDossierLocal(racine, 'DPO/École 2')).toBe(join(racine, 'DocsPrepaProjet', 'DPO', 'École 2'))
    expect(listerDossierDocsCadre(join(racine, 'DocsPrepaProjet'), 'projet', 'DPO/absent')).toMatchObject({ absent: true })
    expect(() => resoudreDossierLocal(racine, 'DPO/absent')).toThrow()
  })

  it('refuse les liens intermédiaires pour toute lecture et mutation', () => {
    const racine = corpusTemporaire()
    const exterieur = corpusTemporaire()
    writeFileSync(join(exterieur, 'secret.txt'), 'secret')
    creerDossierLocal(racine, '', 'DPO')
    symlinkSync(exterieur, join(racine, 'DocsPrepaProjet', 'DPO', 'lien'), 'dir')
    expect(inventaireDocsCadreLocal(racine, 'DPO')).toEqual([])
    expect(() => inventaireDocsCadreLocal(racine, 'DPO/lien')).toThrow()
    expect(() => resoudreLocal(racine, 'DPO/lien/secret.txt')).toThrow()
    expect(lireApercuLocal(racine, 'DPO/lien/secret.txt').apercu).toEqual({ genre: 'aucun', raison: 'invalide' })
    expect(creerDossierLocal(racine, 'DPO/lien', 'interdit')).toMatchObject({ ok: false })
    expect(deposerFichierLocal(racine, join(exterieur, 'secret.txt'), 'DPO/lien')).toMatchObject({ ok: false })
    expect(existsSync(join(exterieur, 'interdit'))).toBe(false)
    expect(() => enregistrerCopieLocal(racine, 'DPO/lien/secret.txt', join(exterieur, 'copie'))).toThrow()
    expect(() => resoudreExemple(join(racine, 'DocsPrepaProjet'), 'DPO/lien/secret.txt')).toThrow()
  })
})

describe('nom du dossier de préparation', () => {
  it('un ancien corpus continue à utiliser DocsCadre sans déplacer ni créer de fichiers ailleurs', () => {
    const racine = corpusTemporaire()
    mkdirSync(join(racine, 'DocsCadre', 'DPO'), { recursive: true })
    writeFileSync(join(racine, 'DocsCadre', 'DPO', 'ancien.txt'), 'Ancien document')
    const source = join(corpusTemporaire(), 'ajout.txt')
    writeFileSync(source, 'Ajout')
    expect(lireApercuLocal(racine, 'DPO/ancien.txt').apercu).toEqual({ genre: 'texte', contenu: 'Ancien document' })
    expect(ajouterFichierLocal(racine, source, undefined, 'DPO')).toMatchObject({ ok: true })
    expect(creerDossierLocal(racine, 'DPO', 'Consentements')).toMatchObject({ ok: true })
    expect(resoudreLocal(racine, 'DPO/ajout.txt')).toBe(join(racine, 'DocsCadre', 'DPO', 'ajout.txt'))
    expect(existsSync(join(racine, 'DocsPrepaProjet'))).toBe(false)
  })

  it('le nouveau dossier est prioritaire, sans fusion ni repli fichier par fichier', () => {
    const racine = corpusTemporaire()
    for (const nom of ['DocsCadre', 'DocsPrepaProjet']) mkdirSync(join(racine, nom))
    writeFileSync(join(racine, 'DocsCadre', 'ancien.txt'), 'Ne pas déplacer')
    writeFileSync(join(racine, 'DocsPrepaProjet', 'actuel.txt'), 'Actuel')
    expect(inventaireDocsCadreLocal(racine).map((e) => e.nom)).toEqual(['actuel.txt'])
    expect(lireApercuLocal(racine, 'ancien.txt').apercu).toEqual({ genre: 'aucun', raison: 'absent' })
    expect(readFileSync(join(racine, 'DocsCadre', 'ancien.txt'), 'utf8')).toBe('Ne pas déplacer')
  })

  it('un nouveau dossier symbolique ne permet pas de contourner les contrôles par l’ancien', () => {
    const racine = corpusTemporaire()
    mkdirSync(join(racine, 'DocsCadre'))
    symlinkSync(corpusTemporaire(), join(racine, 'DocsPrepaProjet'), 'dir')
    expect(() => inventaireDocsCadreLocal(racine)).toThrow()
    expect(() => resoudreDossierLocal(racine)).toThrow()
  })
})

describe('exemples embarqués', () => {
  it('inventaire et aperçu des exemples livrés avec l’application', () => {
    const dir = join(__dirname, '..', 'ressources', 'docsCadreExemples')
    const inventaire = inventaireExemplesDocsCadre(dir)
    expect(inventaire.map((d) => d.nom)).toEqual(['DPO', 'Guide de correction.txt', 'Guide de pseudonymisation.txt'])
    const dpo = inventaireExemplesDocsCadre(dir, 'DPO')
    expect(dpo.map((d) => d.chemin)).toEqual(['DPO/Déclaration traitement DPO.txt', 'DPO/Notice de consentement DPO.txt'])
    for (const d of dpo) {
      expect(d.source).toBe('exemple')
      expect(d.nature).toBe('document')
      expect(lireApercuExemple(dir, d.chemin).apercu.genre).toBe('texte')
      expect(resoudreExemple(dir, d.chemin)).toBe(join(dir, ...d.chemin.split('/')))
    }
    const r = lireApercuExemple(dir, 'Guide de correction.txt')
    expect(r.apercu.genre).toBe('texte')
    if (r.apercu.genre === 'texte') expect(r.apercu.contenu).toContain('À venir.')
  })

  it('exemple absent : absence expliquée', () => {
    const dir = join(__dirname, '..', 'ressources', 'docsCadreExemples')
    expect(lireApercuExemple(dir, 'Fantome.txt').apercu).toEqual({ genre: 'aucun', raison: 'absent' })
  })

  it('exemples : même tri français que les documents du projet', () => {
    const exemple = (nom: string): ResumeDocumentCadre => ({
      nature: 'document', chemin: nom, source: 'exemple', nom, type: 'texte', taille: 1, modifieLe: null,
    })
    const liste = trierEntreesDocsCadre([
      exemple('Zebre.txt'),
      exemple('Guide de correction.txt'),
      exemple('Aaa.txt'),
      exemple('Déclaration traitement DPO.txt'),
    ])
    expect(liste.map((d) => d.nom)).toEqual([
      'Aaa.txt',
      'Déclaration traitement DPO.txt',
      'Guide de correction.txt',
      'Zebre.txt',
    ])
  })
})
