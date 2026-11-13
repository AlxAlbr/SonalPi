import { afterEach, describe, expect, test } from 'vitest'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { basename, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { MigrationV1, proposerDestinationMigration } from '../src/main/migrationV1'
import { CorpusStore } from '../src/main/corpusStore'
import { lireFichierCorpus } from '../src/main/ouvertureFichier'
import iconv from 'iconv-lite'
import { executerTransitionPreparee } from '../src/main/transitionContexte'
import { MIGRATION_ANNULEE, nomDepuisCrp } from '../src/shared/migrationV1'
import type { PayloadEntretien } from '../src/shared/format'

const dossiers: string[] = []
function banc() {
  const base = mkdtempSync(join(tmpdir(), 'sonal-migration-v1-'))
  dossiers.push(base)
  const source = join(base, 'V1')
  mkdirSync(source)
  const cheminCrp = join(source, 'Nom du fichier.crp')
  const interne = join(source, 'audio.wav')
  const externe = join(base, 'externe.wav')
  writeFileSync(interne, 'MEDIA-INTERNE')
  writeFileSync(externe, 'MEDIA-EXTERNE')
  writeFileSync(join(source, 'e.sonal'), '<div id="contenuText">Un entretien.</div>')
  const raw = { nom: 'Nom interne différent', tabEnt: [
    { id: 1, nom: 'Interne', rtrPath: 'e.sonal', audioPath: interne },
    { id: 2, nom: 'Externe', rtrPath: 'e.sonal', audioPath: externe },
  ] }
  const ecrire = () => writeFileSync(cheminCrp, JSON.stringify(raw))
  ecrire()
  const req = { cheminCrp, nom: nomDepuisCrp(cheminCrp), dossier: join(base, 'V2') }
  return { base, source, cheminCrp, interne, externe, raw, ecrire, req }
}
function payload(): PayloadEntretien {
  return {
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte converti.' }] }] },
    annotations: [], ancres: [], locuteurs: [], brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}
async function preparer(job: MigrationV1) {
  const { nbEntretiens } = await job.preparer()
  for (let i = 0; i < nbEntretiens; i++) {
    const lu = job.lireEntretien(i)
    if (lu) expect(lu.contenu).toContain('contenuText')
    job.ajouterEntretien(i, payload(), [])
  }
}
function publier(job: MigrationV1) {
  job.verifierAvantBascule()
  job.verrouillerBascule()
  job.promouvoir()
  const store = new CorpusStore(job.dossier, true)
  store.ouvrir()
  job.marquerOuverte()
  return store
}
function temporaires(base: string) { return readdirSync(base).filter((f) => f.startsWith('.sonal-migration-')) }
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('migration V1 dans une cible non active', () => {
  test('copie les médias internes, conserve les externes et ne renomme la source qu’après ouverture', async () => {
    const b = banc()
    const original = readFileSync(b.cheminCrp)
    const job = new MigrationV1(b.req)
    await preparer(job)
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(readFileSync(b.cheminCrp)).toEqual(original)
    expect(() => job.terminer()).toThrow(/pas encore été ouvert/)
    const store = publier(job)
    const c = store.ouvrir()
    expect(c.nom).toBe('Nom du fichier')
    const ids = Object.keys(c.membership)
    const entretiens = ids.map((id) => store.lireEntretien(id)).map((e) => { if (!e.ok) throw new Error('absent'); return e.data })
    const copie = entretiens[0].meta.audioRef!
    expect(copie.startsWith(join(b.req.dossier, 'medias') + sep)).toBe(true)
    expect(readFileSync(copie, 'utf8')).toBe('MEDIA-INTERNE')
    expect(entretiens[1].meta.audioRef).toBe(b.externe)
    expect(readdirSync(join(b.req.dossier, 'medias'))).toHaveLength(1)
    expect(job.terminer()).toBeNull()
    expect(existsSync(b.cheminCrp)).toBe(false)
    expect(readFileSync(`${b.cheminCrp}.sauvegarde-v1`)).toEqual(original)
    expect(readFileSync(b.interne, 'utf8')).toBe('MEDIA-INTERNE')
    expect(readFileSync(b.externe, 'utf8')).toBe('MEDIA-EXTERNE')
    renameSync(`${b.cheminCrp}.sauvegarde-v1`, b.cheminCrp)
    expect(lireFichierCorpus(b.cheminCrp).classification.type).toBe('v1')
    expect(readFileSync(b.cheminCrp)).toEqual(original)
    renameSync(b.cheminCrp, `${b.cheminCrp}.sauvegarde-v1`)
    renameSync(b.source, join(b.base, 'V1-hors-ligne'))
    expect(store.lireEntretien(ids[0]).ok).toBe(true)
    expect(readFileSync(copie, 'utf8')).toBe('MEDIA-INTERNE')
    expect(store.verifierAudios()[ids[1]]).toBe('ok')
    expect(temporaires(b.base)).toEqual([])
  })

  test('décode les CRP et transcriptions Windows-1252 sans altérer leurs sources', async () => {
    const b = banc()
    b.raw.tabEnt[0].nom = 'Échange'
    const original = iconv.encode(JSON.stringify(b.raw), 'win1252')
    writeFileSync(b.cheminCrp, original)
    const texte = '<div id="contenuText">Émilie a parlé de santé.</div>'
    writeFileSync(join(b.source, 'e.sonal'), iconv.encode(texte, 'win1252'))
    const job = new MigrationV1(b.req)
    await job.preparer()
    expect(job.lireEntretien(0)?.contenu).toBe(texte)
    job.ajouterEntretien(0, payload(), [])
    job.ajouterEntretien(1, payload(), [])
    expect(Object.values(publier(job).ouvrir().membership).map((e) => e.titre)).toContain('Échange')
    expect(job.terminer()).toBeNull()
    expect(readFileSync(`${b.cheminCrp}.sauvegarde-v1`)).toEqual(original)
  })

  test('reprend les réglages Lexico et conserve les documents supplémentaires sans copier les secrets', async () => {
    const b = banc()
    const base = b.cheminCrp.replace(/\.crp$/i, '')
    writeFileSync(`${base}.out`, 'le\nla')
    writeFileSync(`${base}.lem`, 'allais\taller\tV')
    writeFileSync(`${base}.lexaf.json`, '{"ancienResultat":true}')
    mkdirSync(join(b.source, 'documents'))
    const original = Buffer.from([0, 255, 13, 10])
    writeFileSync(join(b.source, 'documents', 'notes.bin'), original)
    writeFileSync(join(b.source, '.env.production'), 'SECRET=NE_PAS_COPIER')
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    expect(store.ouvrir().lexico?.motsOutils).toEqual(['le', 'la'])
    expect(readFileSync(join(b.req.dossier, 'Autres', 'documents', 'notes.bin'))).toEqual(original)
    expect(readFileSync(join(b.req.dossier, 'Autres', 'Nom du fichier.lexaf.json'), 'utf8')).toBe('{"ancienResultat":true}')
    expect(existsSync(join(b.req.dossier, 'Autres', '.env.production'))).toBe(false)
    expect(job.terminer()).toBeNull()
  })

  test.each(['entretien', 'interne', 'externe'])('bloque un fichier référencé manquant : %s', (cas) => {
    const b = banc()
    if (cas === 'entretien') b.raw.tabEnt[0].rtrPath = 'absent.sonal'
    else b.raw.tabEnt[cas === 'interne' ? 0 : 1].audioPath = join(b.base, 'absent.wav')
    b.ecrire()
    expect(() => new MigrationV1(b.req)).toThrow(/Fichiers référencés manquants ou illisibles/)
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(existsSync(b.cheminCrp)).toBe(true)
    expect(temporaires(b.base)).toEqual([])
  })

  test.each([null, [], { rtrPath: 42 }, { audioPath: 42 }])('une référence malformée ne devient pas un entretien vide : %j', (entree) => {
    const b = banc()
    writeFileSync(b.cheminCrp, JSON.stringify({ tabEnt: [entree] }))
    expect(() => new MigrationV1(b.req)).toThrow(/références des entretiens V1 sont invalides/)
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(temporaires(b.base)).toEqual([])
  })

  test('un entretien sans fichier ou média déclaré est autorisé', async () => {
    const b = banc()
    b.raw.tabEnt = [{ id: 1, nom: 'À transcrire', rtrPath: '', audioPath: '' }]
    b.ecrire()
    const job = new MigrationV1(b.req)
    await job.preparer()
    expect(job.lireEntretien(0)).toBeNull()
    job.ajouterEntretien(0, payload(), [])
    const store = publier(job)
    expect(Object.keys(store.ouvrir().membership)).toHaveLength(1)
    await job.annuler()
    expect(existsSync(b.cheminCrp)).toBe(true)
  })

  test('déduplique un média interne partagé et distingue les homonymes', async () => {
    const b = banc()
    mkdirSync(join(b.source, 'autre'))
    const homonyme = join(b.source, 'autre', basename(b.interne))
    writeFileSync(homonyme, 'AUTRE-CONTENU')
    b.raw.tabEnt.push({ id: 3, nom: 'Même média', rtrPath: '', audioPath: b.interne },
      { id: 4, nom: 'Homonyme', rtrPath: '', audioPath: homonyme })
    b.ecrire()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    const refs = Object.keys(store.ouvrir().membership).map((id) => {
      const e = store.lireEntretien(id)
      return e.ok ? e.data.meta.audioRef : null
    })
    expect(refs[0]).toBe(refs[2])
    expect(refs[3]).not.toBe(refs[0])
    expect(readFileSync(refs[3]!, 'utf8')).toBe('AUTRE-CONTENU')
    expect(readdirSync(join(b.req.dossier, 'medias'))).toHaveLength(2)
  })

  test.skipIf(process.platform === 'win32')('classe les médias par emplacement réel, pas par le chemin du lien', async () => {
    const b = banc()
    const aliasExterne = join(b.source, 'alias-externe.wav')
    const aliasInterne = join(b.base, 'alias-interne.wav')
    symlinkSync(b.externe, aliasExterne)
    symlinkSync(b.interne, aliasInterne)
    b.raw.tabEnt[0].audioPath = aliasInterne
    b.raw.tabEnt[1].audioPath = aliasExterne
    b.ecrire()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    const refs = Object.keys(store.ouvrir().membership).map((id) => {
      const e = store.lireEntretien(id)
      return e.ok ? e.data.meta.audioRef : null
    })
    expect(refs[0]!.startsWith(b.req.dossier + sep)).toBe(true)
    expect(refs[1]).toBe(b.externe)
  })
})

describe('annulation et refus avant bascule', () => {
  test('annule une copie en cours, nettoie la préparation et permet une nouvelle tentative', async () => {
    const b = banc()
    writeFileSync(b.interne, Buffer.alloc(16 * 1024 * 1024))
    const job = new MigrationV1(b.req)
    const resultat = job.preparer()
    const rejet = expect(resultat).rejects.toThrow(MIGRATION_ANNULEE)
    await new Promise<void>((resolve) => setImmediate(resolve))
    await job.annuler()
    await rejet
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(temporaires(b.base)).toEqual([])
    expect(existsSync(b.cheminCrp)).toBe(true)
    const suivante = new MigrationV1(b.req)
    await preparer(suivante)
    await suivante.annuler()
    expect(temporaires(b.base)).toEqual([])
  })

  test.each(['CRP', 'transcription', 'média interne', 'média externe'])('refuse une source modifiée sans renommer le CRP : %s', async (cas) => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const chemin = { CRP: b.cheminCrp, transcription: join(b.source, 'e.sonal'), 'média interne': b.interne, 'média externe': b.externe }[cas]!
    writeFileSync(chemin, 'Une nouvelle version')
    expect(() => job.verifierAvantBascule()).toThrow(/source a changé/)
    await job.annuler()
    expect(existsSync(b.cheminCrp)).toBe(true)
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(temporaires(b.base)).toEqual([])
  })

  test('refuse une copie altérée ou un corpus incomplet', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await job.preparer()
    expect(() => job.verifierAvantBascule()).toThrow(/pas entièrement préparé/)
    job.ajouterEntretien(0, payload(), [])
    expect(() => job.ajouterEntretien(0, payload(), [])).toThrow(/migration en cours/)
    job.ajouterEntretien(1, payload(), [])
    const stage = join(b.base, temporaires(b.base)[0], 'medias')
    writeFileSync(join(stage, readdirSync(stage)[0]), 'CORROMPU')
    expect(() => job.verifierAvantBascule()).toThrow(/média copié a changé/)
    await job.annuler()
    expect(existsSync(b.cheminCrp)).toBe(true)
  })

  test('accepte une destination existante vide sans conserver de chemins temporaires', async () => {
    const b = banc()
    mkdirSync(b.req.dossier)
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    expect(store.ouvrir().nom).toBe(b.req.nom)
    expect(temporaires(b.base)).toEqual([])
    for (const id of Object.keys(store.ouvrir().membership)) {
      const e = store.lireEntretien(id)
      expect(e.ok && e.data.meta.audioRef?.includes('.sonal-migration-')).toBe(false)
    }
  })

  test('un fichier apparu dans la destination est conservé et interdit la promotion', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    mkdirSync(b.req.dossier)
    writeFileSync(join(b.req.dossier, 'travail.txt'), 'À conserver')
    job.verrouillerBascule()
    expect(() => job.promouvoir()).toThrow(/neuf ou vide/)
    await job.nettoyer()
    expect(readFileSync(join(b.req.dossier, 'travail.txt'), 'utf8')).toBe('À conserver')
    expect(existsSync(b.cheminCrp)).toBe(true)
  })

  test('un emplacement parent déplacé interdit la bascule et signale le nettoyage impossible', async () => {
    const b = banc()
    const parent = join(b.base, 'destinations')
    mkdirSync(parent)
    const job = new MigrationV1({ ...b.req, dossier: join(parent, 'V2') })
    await preparer(job)
    const temporaire = temporaires(parent)[0]
    renameSync(parent, `${parent}-deplace`)
    mkdirSync(parent)
    writeFileSync(join(parent, 'notes.txt'), 'À conserver')
    expect(() => job.verifierAvantBascule()).toThrow(/emplacement de destination a changé/)
    await expect(job.annuler()).rejects.toThrow('Nettoyage impossible')
    expect(existsSync(join(`${parent}-deplace`, temporaire))).toBe(true)
    expect(readFileSync(join(parent, 'notes.txt'), 'utf8')).toBe('À conserver')
    expect(existsSync(b.cheminCrp)).toBe(true)
  })

  test.skipIf(process.platform === 'win32')('le nettoyage refuse une préparation remplacée par un lien vers un dossier utilisateur', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const temporaire = join(b.base, temporaires(b.base)[0])
    renameSync(temporaire, `${temporaire}-deplace`)
    const utilisateur = join(b.base, 'travail-utilisateur')
    mkdirSync(utilisateur)
    writeFileSync(join(utilisateur, 'notes.txt'), 'À conserver')
    symlinkSync(utilisateur, temporaire)
    expect(() => job.verifierAvantBascule()).toThrow(/préparation a changé/)
    await expect(job.annuler()).rejects.toThrow('Nettoyage impossible')
    expect(readFileSync(join(utilisateur, 'notes.txt'), 'utf8')).toBe('À conserver')
    expect(existsSync(b.cheminCrp)).toBe(true)
    expect(existsSync(b.req.dossier)).toBe(false)
  })

  test('une fermeture de session refusée ne publie pas la cible', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    job.verrouillerBascule()
    await expect(executerTransitionPreparee(
      () => { job.verifierAvantBascule(); return job },
      async () => { throw new Error('session non fermée') },
      (cible) => cible.promouvoir(),
    )).rejects.toThrow('session non fermée')
    await job.nettoyer()
    expect(existsSync(b.req.dossier)).toBe(false)
    expect(existsSync(b.cheminCrp)).toBe(true)
  })

  test('refuse un dossier non vide ou interne aux sources sans toucher aux données', () => {
    const b = banc()
    mkdirSync(b.req.dossier)
    writeFileSync(join(b.req.dossier, 'travail'), 'Intact')
    expect(() => new MigrationV1(b.req)).toThrow(/neuf ou vide/)
    expect(() => new MigrationV1({ ...b.req, dossier: join(b.source, 'V2') })).toThrow(/en dehors/)
    expect(readFileSync(join(b.req.dossier, 'travail'), 'utf8')).toBe('Intact')
    expect(temporaires(b.base)).toEqual([])
  })
})

describe('sauvegarde finale et nom proposé', () => {
  test('une collision de sauvegarde ne détruit ni le fichier existant ni la V2', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    writeFileSync(`${b.cheminCrp}.sauvegarde-v1`, 'Sauvegarde à conserver')
    expect(job.terminer()).toMatch(/prêt.*n’a pas pu être renommé/)
    expect(existsSync(b.cheminCrp)).toBe(true)
    expect(readFileSync(`${b.cheminCrp}.sauvegarde-v1`, 'utf8')).toBe('Sauvegarde à conserver')
    expect(store.ouvrir().nom).toBe(b.req.nom)
  })

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('un refus de permission au renommage laisse une V2 valide et la source intacte', async () => {
    const b = banc()
    const job = new MigrationV1(b.req)
    await preparer(job)
    const store = publier(job)
    chmodSync(b.source, 0o500)
    try {
      expect(job.terminer()).toMatch(/n’a pas pu être renommé/)
      expect(existsSync(b.cheminCrp)).toBe(true)
      expect(store.ouvrir().nom).toBe(b.req.nom)
    } finally { chmodSync(b.source, 0o700) }
  })

  test('propose un dossier libre sans créer de données et retient le nom du fichier', () => {
    const b = banc()
    expect(nomDepuisCrp(b.cheminCrp)).toBe('Nom du fichier')
    expect(nomDepuisCrp('C:\\V1\\Projet.CRP')).toBe('Projet')
    const premiere = proposerDestinationMigration(b.cheminCrp, 'Mon projetV2')
    expect(premiere).toBe(join(b.base, 'Mon projetV2'))
    expect(existsSync(premiere)).toBe(false)
    mkdirSync(premiere)
    expect(proposerDestinationMigration(b.cheminCrp, 'Mon projetV2')).toBe(`${premiere} (2)`)
  })
})
