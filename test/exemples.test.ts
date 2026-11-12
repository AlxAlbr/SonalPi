import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ExemplesLocaux } from '../src/main/exemples'
import { CorpusStore } from '../src/main/corpusStore'
import { creerTransitionsLocales } from '../src/main/transitionContexte'
import type { EntretienFichier } from '../src/shared/format'
import type { MemoireExemples } from '../src/shared/exemples'

let racine: string, sources: string, memoire: MemoireExemples | undefined, service: ExemplesLocaux
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'sonal-exemples-'))
  sources = join(racine, 'sources')
  memoire = { sources, travaux: [], apprentissages: {}, libres: {} }
  service = new ExemplesLocaux({ ressources: join(process.cwd(), 'CorpusTest'), documents: racine,
    lire: () => memoire, ecrire: (m) => { memoire = structuredClone(m) } })
})
afterEach(() => rmSync(racine, { recursive: true, force: true }))
function installer(
  dir: string,
  exemple: 'synth' | 'synth-annote' = 'synth',
  usage: 'apprentissage' | 'libre' = 'apprentissage',
  parcoursApprentissage: 'preparation' | 'traitement' | 'analyse' | 'organisation' = 'preparation',
) {
  const preparation = service.preparerInstallation(dir, 'Mon exercice', {
    exemple,
    usage,
    ...(usage === 'apprentissage' ? { parcoursApprentissage } : {}),
  })
  try { const store = preparation.publier(); service.selectionner(dir); return store.ouvrir() }
  finally { preparation.nettoyer() }
}

describe('installation et reprise des corpus exemples', () => {
  test('un nouveau profil mémorise les emplacements sans créer de dossier ni de corpus', () => {
    memoire = undefined
    const etat = service.etat()
    expect(etat.travaux).toEqual([])
    expect(etat.sources).toBe(join(racine, 'Sonal', 'Exemples', 'Sources', 'CorpusSynth'))
    expect(etat.emplacementsApprentissage).toEqual({
      preparation: join(racine, 'Sonal', 'Apprentissage', 'Preparer_et_suivre'),
      traitement: join(racine, 'Sonal', 'Apprentissage', 'Importer_et_traiter'),
      analyse: join(racine, 'Sonal', 'Apprentissage', 'Analyser_et_interpreter'),
      organisation: join(racine, 'Sonal', 'Apprentissage', 'Organiser_et_exporter'),
    })
    expect(existsSync(etat.sources)).toBe(false)
    expect(memoire?.sources).toBe(etat.sources)
  })
  test('la préparation ne publie rien avant validation de la transition', () => {
    const dir = join(racine, 'exercice')
    const preparation = service.preparerInstallation(dir, 'Exercice', {
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation',
    })
    try {
      expect(existsSync(dir)).toBe(false)
      expect(existsSync(sources)).toBe(false)
      expect(service.etat().travaux).toHaveLength(0)
    } finally { preparation.nettoyer() }
  })
  test('une fermeture refusée conserve le contexte courant sans publier l’exemple ni ses sources', async () => {
    const dir = join(racine, 'exercice')
    const finaliser = vi.fn()
    const nettoyer = vi.fn()
    const transitions = creerTransitionsLocales({
      exemples: { preparerInstallation: (...args) => {
        const preparation = service.preparerInstallation(...args)
        return { publier: preparation.publier, nettoyer: () => { preparation.nettoyer(); nettoyer() } }
      } },
      fermerContexteActuel: async () => { throw new Error('Fermeture refusée') },
      finaliser,
    })
    await expect(transitions.creerNouveau(dir, 'Exercice', {
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation',
    })).rejects.toThrow('Fermeture refusée')
    expect(finaliser).not.toHaveBeenCalled()
    expect(nettoyer).toHaveBeenCalledOnce()
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(sources)).toBe(false)
    expect(service.etat().travaux).toHaveLength(0)
  })
  test('l’exemple n’est publié qu’après la fermeture réussie du contexte courant', async () => {
    const dir = join(racine, 'exercice')
    let terminer!: () => void
    const fermeture = new Promise<void>((resolve) => { terminer = resolve })
    const transitions = creerTransitionsLocales({
      exemples: service,
      fermerContexteActuel: () => fermeture,
      finaliser: (store, dossier, preparation) => {
        const corpus = store.finaliserOuverture(preparation)
        return { corpus, dir: dossier, nom: corpus.nom! }
      },
    })
    const ouverture = transitions.creerNouveau(dir, 'Exercice', {
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation',
    })
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(sources)).toBe(false)
    terminer()
    const resultat = await ouverture
    expect(resultat.corpus.demo?.usage).toBe('apprentissage')
    expect(existsSync(join(dir, 'corpus.crp'))).toBe(true)
  })
  test('la préparation crée un corpus vierge sans étape prévalidée', () => {
    const dir = join(racine, 'exercice')
    const corpus = installer(dir)
    expect(corpus.demo).toMatchObject({
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation', racineSources: sources,
    })
    expect(corpus.demo?.parcours?.preparation?.validees).toEqual([])
    expect(Object.values(corpus.variables).filter((v) => v.lib === 'Ville')).toHaveLength(0)
    expect(Object.keys(corpus.membership)).toHaveLength(0)
    expect(service.estApprentissage(dir)).toBe(true)
    expect(service.etat().travaux).toHaveLength(1)
    expect(service.etat().apprentissages.preparation).toBe(corpus.demo?.id)
    expect(existsSync(join(sources, 'audio', '1Coordinatrice.mp3'))).toBe(true)
  })
  test('le traitement utilise un autre corpus avec la variable de l’exercice', () => {
    const preparation = installer(join(racine, 'preparation'))
    const traitement = installer(join(racine, 'traitement'), 'synth', 'apprentissage', 'traitement')
    expect(traitement.demo?.parcoursApprentissage).toBe('traitement')
    expect(traitement.demo?.parcours?.traitement?.validees).toEqual([])
    expect(Object.values(traitement.variables).filter((v) => v.lib === 'Ville')).toHaveLength(1)
    expect(service.etat().apprentissages).toEqual({
      preparation: preparation.demo?.id,
      traitement: traitement.demo?.id,
    })
  })
  test.each(['analyse', 'organisation'] as const)('%s dispose de sa copie annotée et sa remise à zéro préserve les autres travaux', (parcours) => {
    const preparation = installer(join(racine, 'preparation'))
    const libre = installer(join(racine, 'libre'), 'synth-annote', 'libre')
    const autreParcours = parcours === 'analyse' ? 'organisation' : 'analyse'
    const autre = installer(join(racine, autreParcours), 'synth-annote', 'apprentissage', autreParcours)
    const avantAutre = readFileSync(join(racine, autreParcours, 'corpus.crp'))
    const dir = join(racine, parcours)
    const corpus = installer(dir, 'synth-annote', 'apprentissage', parcours)
    expect(corpus.demo?.parcours).toEqual({ [parcours]: { validees: [] } })
    expect(corpus.demo?.id).not.toBe(autre.demo?.id)
    expect(Object.keys(corpus.membership)).toHaveLength(4)
    const store = new CorpusStore(dir)
    const id = Object.keys(corpus.membership)[0]
    store.renommerEntretien(id, 'Mon titre personnel')
    store.marquerDemo({ ...corpus.demo!, parcours: { [parcours]: { validees: ['premiere-etape'] } } })
    const avantPreparation = readFileSync(join(racine, 'preparation', 'corpus.crp'))
    const avantLibre = readFileSync(join(racine, 'libre', 'corpus.crp'))
    const reset = service.preparerInstallation(dir, 'Démo', {
      exemple: 'synth-annote', usage: 'apprentissage', parcoursApprentissage: parcours, recommencer: true,
    })
    try { reset.publier() } finally { reset.nettoyer() }
    const apres = new CorpusStore(dir).ouvrir()
    expect(apres.demo?.id).toBe(corpus.demo?.id)
    expect(apres.demo?.parcours).toEqual({ [parcours]: { validees: [] } })
    expect(apres.membership[id].titre).toBe(corpus.membership[id].titre)
    expect(readFileSync(join(racine, 'preparation', 'corpus.crp'))).toEqual(avantPreparation)
    expect(readFileSync(join(racine, 'libre', 'corpus.crp'))).toEqual(avantLibre)
    expect(readFileSync(join(racine, autreParcours, 'corpus.crp'))).toEqual(avantAutre)
    expect(service.etat().apprentissages).toEqual({ preparation: preparation.demo?.id,
      [parcours]: corpus.demo?.id, [autreParcours]: autre.demo?.id })
    expect(service.etat().libres['synth-annote']).toBe(libre.demo?.id)
  })
  test.each([
    ['synth', 'analyse'], ['synth', 'organisation'], ['synth-annote', 'preparation'], ['synth-annote', 'traitement'],
  ] as const)('refuse le contenu %s pour le parcours %s', (exemple, parcoursApprentissage) => {
    expect(() => installer(join(racine, 'invalide'), exemple, 'apprentissage', parcoursApprentissage)).toThrow('cet usage')
  })
  test('une nouvelle session retrouve les accès, les acquis et le contexte sans réécrire le corpus', () => {
    const dir = join(racine, 'exercice')
    const corpus = installer(dir, 'synth', 'apprentissage', 'traitement')
    const store = new CorpusStore(dir)
    store.marquerDemo({ ...corpus.demo!, parcours: {
      traitement: { validees: ['charger', 'coder'], contexte: { entretienId: 'ent-42' } },
    } })
    const avant = readFileSync(join(dir, 'corpus.crp'))
    const registre = JSON.stringify(memoire)
    const session = new ExemplesLocaux({ ressources: join(process.cwd(), 'CorpusTest'), documents: racine,
      lire: () => JSON.parse(registre), ecrire: vi.fn() })
    expect(session.etat().travaux[0].marqueur?.parcours.traitement).toEqual({
      validees: ['charger', 'coder'], contexte: { entretienId: 'ent-42' },
    })
    expect(session.etat().apprentissages.traitement).toBe(corpus.demo!.id)
    expect(readFileSync(join(dir, 'corpus.crp'))).toEqual(avant)
  })
  test.each([
    { mode: 'pas-a-pas', racineSources: '/sources', validees: ['coder'] },
    { exemple: 'synth', usage: 'apprentissage', racineSources: '/sources', parcours: {} },
  ])('ne reconnaît pas un marqueur sans identité actuelle : %j', (demo) => {
    const dir = join(racine, 'non-reconnu')
    const store = new CorpusStore(dir)
    const corpus = store.ouvrir()
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify({ ...corpus, demo }))
    expect(service.reconnaitre(dir)).toBeNull()
    expect(service.etat().travaux).toEqual([])
  })
  test('la réouverture d’un exemple ne réapplique pas son contenu', () => {
    const dir = join(racine, 'annote')
    installer(dir, 'synth-annote', 'libre')
    const store = new CorpusStore(dir)
    const corpus = store.ouvrir()
    const id = Object.keys(corpus.membership)[0]
    store.renommerEntretien(id, 'Titre personnel')
    const chemin = join(dir, 'entretiens', `${id}.json`)
    const entretien = JSON.parse(readFileSync(chemin, 'utf8')) as EntretienFichier
    entretien.annotations = []
    writeFileSync(chemin, JSON.stringify(entretien))
    service.selectionner(dir)
    expect(service.etat().travaux[0].etat).toBe('pret')
    expect(store.ouvrir().membership[id].titre).toBe('Titre personnel')
    expect(JSON.parse(readFileSync(chemin, 'utf8')).annotations).toEqual([])
  })
  test('le corpus annoté référence les audios installés sur ce poste sans modifier les originaux', () => {
    const dir = join(racine, 'annote')
    const modele = readFileSync(join(process.cwd(), 'CorpusTest/CorpusSynthAnnot/corpus.crp'))
    const corpus = installer(dir, 'synth-annote', 'libre')
    let nombre = 0
    for (const id of Object.keys(corpus.membership)) {
      const entretien = JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8')) as EntretienFichier
      nombre += entretien.annotations.length
      expect(entretien.meta.audioRef?.startsWith(join(sources, 'audio'))).toBe(true)
      expect(existsSync(entretien.meta.audioRef!)).toBe(true)
    }
    expect(nombre).toBe(324)
    expect(existsSync(join(dir, 'audio'))).toBe(false)
    expect(readFileSync(join(process.cwd(), 'CorpusTest/CorpusSynthAnnot/corpus.crp'))).toEqual(modele)
  })
  test('refuse un dossier avec des données, même sans entretien ni corpus.crp', () => {
    const dir = join(racine, 'preparation')
    mkdirSync(dir)
    writeFileSync(join(dir, 'questions.txt'), 'Mon travail')
    expect(() => installer(dir)).toThrow('dossier vide')
    expect(readFileSync(join(dir, 'questions.txt'), 'utf8')).toBe('Mon travail')
  })
  test('revérifie la destination après la préparation, sans écrire dans un travail apparu entretemps', () => {
    const dir = join(racine, 'exercice')
    const preparation = service.preparerInstallation(dir, 'Exercice', {
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation',
    })
    try {
      mkdirSync(dir)
      writeFileSync(join(dir, 'note.txt'), 'Ne pas remplacer')
      expect(() => preparation.publier()).toThrow('dossier vide')
      expect(existsSync(join(dir, 'corpus.crp'))).toBe(false)
      expect(existsSync(sources)).toBe(false)
    } finally { preparation.nettoyer() }
  })
  test('refuse les collisions avec les sources et leurs liens symboliques', () => {
    mkdirSync(sources)
    expect(() => installer(join(sources, 'corpus'))).toThrow('déjà utilisé')
    const lien = join(racine, 'lien-sources')
    symlinkSync(sources, lien)
    expect(() => installer(join(lien, 'corpus'))).toThrow('déjà utilisé')
  })
  test('recommencer une démo remplace son contenu et remet sa progression au départ', () => {
    const dir = join(racine, 'preparation')
    const corpus = installer(dir)
    const store = new CorpusStore(dir)
    store.marquerDemo({
      ...store.ouvrir().demo!,
      parcours: { preparation: { validees: ['organiser-suivi'] } },
    })
    store.importerEntretien('Ajout personnel', {
      corpsTexte: null, meta: { audioRef: null }, annotations: [], ancres: [], locuteurs: [],
    }, [], [])
    const reset = service.preparerInstallation(dir, 'Préparer et suivre', {
      exemple: 'synth', usage: 'apprentissage', parcoursApprentissage: 'preparation', recommencer: true,
    })
    try { reset.publier() } finally { reset.nettoyer() }
    const apres = new CorpusStore(dir).ouvrir()
    expect(apres.demo?.id).toBe(corpus.demo?.id)
    expect(apres.demo?.parcours?.preparation?.validees).toEqual([])
    expect(Object.keys(apres.membership)).toHaveLength(0)
    expect(service.etat().apprentissages.preparation).toBe(corpus.demo?.id)
  })
  test('retrouve un dossier déplacé sans recréer ni changer ses acquis', () => {
    const ancienDir = join(racine, 'ancien'), nouveau = join(racine, 'nouveau')
    const corpus = installer(ancienDir)
    renameSync(ancienDir, nouveau)
    expect(service.etat().travaux[0].etat).toBe('absent')
    service.rattacher(nouveau, ancienDir)
    expect(service.etat().travaux).toHaveLength(1)
    expect(service.etat().travaux[0].marqueur?.id).toBe(corpus.demo?.id)
    expect(service.etat().travaux[0].dir).toBe(nouveau)
  })
  test('un dossier manquant conserve son accès enregistré', () => {
    const dir = join(racine, 'exercice')
    const corpus = installer(dir)
    rmSync(dir, { recursive: true })
    const etat = service.etat()
    expect(etat.travaux).toHaveLength(1)
    expect(etat.travaux[0].etat).toBe('absent')
    expect(etat.apprentissages.preparation).toBe(corpus.demo!.id)
  })
  test('un autre identifiant ne remplace pas le corpus enregistré au même emplacement', () => {
    const dir = join(racine, 'exercice')
    const corpus = installer(dir)
    const store = new CorpusStore(dir)
    store.marquerDemo({ ...corpus.demo!, id: 'autre-identifiant' })
    expect(() => service.rattacher(dir)).toThrow('ne correspond pas')
    expect(service.etat().apprentissages.preparation).toBe(corpus.demo!.id)
    expect(service.etat().travaux[0].etat).toBe('illisible')
  })
  test('ne déplace pas un accès vers une copie manuelle si le travail original existe encore', () => {
    const dir = join(racine, 'original'), copie = join(racine, 'copie-manuelle')
    installer(dir)
    cpSync(dir, copie, { recursive: true })
    expect(() => service.rattacher(copie)).toThrow('déjà associé')
    expect(service.etat().travaux).toHaveLength(1)
    expect(service.etat().travaux[0].dir).toBe(dir)
  })
  test('refuse une version de corpus inconnue sans perdre son accès', () => {
    const dir = join(racine, 'exercice')
    const corpus = installer(dir)
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify({ ...corpus, formatVersion: 999 }))
    expect(service.etat().travaux[0].etat).toBe('illisible')
    expect(service.etat().travaux[0].dir).toBe(dir)
  })
  test('la restauration des sources ne traverse pas un lien vers un autre travail', () => {
    service.etat()
    mkdirSync(sources)
    const autre = join(racine, 'autre')
    mkdirSync(autre)
    symlinkSync(autre, join(sources, 'srt'), 'junction')
    expect(() => service.restaurerSources()).toThrow('ne peut pas être restauré')
    expect(readdirSync(autre)).toEqual([])
    expect(existsSync(join(sources, 'audio'))).toBe(false)
  })
  test('ne remplace pas un corpus illisible par une nouvelle installation', () => {
    const dir = join(racine, 'exercice')
    installer(dir)
    writeFileSync(join(dir, 'corpus.crp'), '{illisible')
    expect(service.etat().travaux[0].etat).toBe('illisible')
    expect(() => installer(dir)).toThrow()
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe('{illisible')
  })
})
