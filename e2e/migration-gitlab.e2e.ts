import { expect, test, type TestInfo } from '@playwright/test'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreAccueil, attendreCorpus, fermerAiguillage } from './util'
import { instrumenterMigration, lireSondeMigration, retablirTransportMigration, tuerApplication } from './qualification/sondeMigration'
import type { EtatMigrationGitLab } from '../src/main/gitlab/suiviMigration'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import { parserAliases } from '../src/shared/entretien/anon/alias'
import { verifierReferencesDefinitions } from '../src/main/gitlab/referencesDefinitions'
import { ClientLfsGitLab } from '../src/main/gitlab/lfs'
import { accesMedia, adresse, api, config, depot, fixture, lancerQualification, lireMedias, ouvrirProfilNeuf,
  connecterSource, preparer, presente, projet, racineMedia, sha, webdav } from './qualification/migration'

test.describe('Migration GitLab réelle, données synthétiques isolées', () => {
  test.skip(!presente, 'Configuration du banc GitLab absente.')
  test.setTimeout(300_000)

  for (const externe of [false, true]) {
    test(`migration complète ${externe ? 'WebDAV' : 'GitLab LFS'}, puis audio et vidéo sur profil neuf`, async ({}, info) => {
      const f = await fixture(), cible = await projet(externe ? 'externe' : 'vide', externe)
      const profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-'))
      const neuf = mkdtempSync(join(tmpdir(), 'sonal-q-migration-neuf-'))
      const dossierMedia = `qualification-migration-${cible.id}`
      const urlMedia = externe ? `${racineMedia}/${dossierMedia}` : undefined
      if (externe) await webdav(racineMedia).mkcol(dossierMedia)
      const d = depot(cible)
      if (externe) await d.publierCommit('main', 'Configuration technique à conserver', [
        { action: 'create', file_path: '.gitattributes', content: '*.json text\n' },
      ])
      const readme = externe ? await d.lireFichier('README.md', 'main') : null
      const app = await lancerQualification(profil)
      try {
        const page = await app.firstWindow()
        const modal = await preparer(page, f.source, cible, urlMedia)
        await expect(modal.locator('.documents-conserves')).toContainText('4 document(s)')
        await expect(modal.getByText('Certains réglages Lexico n’ont pas pu être repris entièrement.', { exact: false })).toBeVisible()
        if (externe) await expect(modal.getByText('Les vidéos seront copiées, mais leur lecture depuis cet espace externe n’est pas encore disponible.', { exact: false })).toBeVisible()
        expect((await api<{ empty_repo: boolean }>(`/projects/${cible.id}`)).empty_repo).toBe(!externe)
        await modal.locator('.documents-conserves').scrollIntoViewIfNeeded()
        await page.screenshot({ path: info.outputPath('bilan-gitlab-concis.png') })
        await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
        await expect(modal).toBeHidden({ timeout: 90_000 })
        await fermerAiguillage(page, 'entretiens', 120_000)
        await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
        await attendreCorpus(page)
        const etat = lireEtat(profil)
        expect(etat.phase).toBe('terminee')
        expect(etat.bilan.medias.map((m) => m.stockageSource)).toEqual(['lfs', 'git', 'lfs'])
        expect(etat.mediasConfirmes).toHaveLength(3)
        expect(etat.bilan.commitSource).toBe(f.commit)
        expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
        const natif = await d.lireFichier('corpus.crp', 'main')
        const corpus = JSON.parse(natif!.contenu) as CorpusFichier
        expect(corpus.nom).toBe('Migration synthétique')
        expect(Object.keys(corpus.membership)).toHaveLength(4)
        expect(await d.lireFichier('README.md', 'main')).toEqual(readme)
        if (externe) expect((await d.lireFichier('.gitattributes', 'main'))?.contenu).toBe('*.json text\n')
        for (const document of etat.documents) {
          const distant = await d.lireFichier(document.chemin, 'main')
          const prive = readFileSync(join(profil, 'migrations-gitlab', etat.operationId, 'contenus', `${document.sha256}.bin`), 'utf8')
          expect(distant?.contenu).toBe(prive)
          expect(distant?.contenu).not.toContain(config.token!)
          expect(distant?.contenu).not.toContain(accesMedia.motDePasse)
        }
        const identifiants = corpus.ordreEntretiens!
        const entretiens: EntretienFichier[] = []
        for (const id of identifiants) entretiens.push(JSON.parse((await d.lireFichier(`entretiens/${id}.json`, 'main'))!.contenu))
        expect(entretiens[0].meta.audioDistant).toEqual(entretiens[1].meta.audioDistant)
        expect(entretiens[0].meta.audioDistant).not.toEqual(entretiens[2].meta.audioDistant)
        const e = entretiens[0]
        expect(e.corpsTexte).toEqual({ type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [
          { type: 'text', text: 'Lyon. Lyons. Karine. Karine. Marseille. Rue de la Gare. Local.' },
        ] }] })
        expect(e.meta.valeursGen).toEqual({ v1: 'v1m1' })
        expect(corpus.variables.v1.modalites.map((m) => m.lib)).toContain('Synthétique')
        expect(corpus.variables.v2.lib).toBe('Variable locale')
        expect(corpus.codebook.cat_002.nom).toBe('Thème propre à l’entretien')
        expect(Object.values(corpus.reglesAnon).map((r) => ({ ...r, entite: r.entite.flatMap(parserAliases) }))).toEqual(expect.arrayContaining([
          expect.objectContaining({ entite: ['Lyon', 'Lyons'], pseudos: ['Ville témoin'] }),
          expect.objectContaining({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'] }),
        ]))
        for (const entretien of entretiens) verifierReferencesDefinitions(entretien, corpus, entretien)
        expect(e.annotations).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'anon', etat: 'anonymise', pseudo: 'Rebecca', from: 22, to: 28 }),
          expect.objectContaining({ type: 'anon', etat: 'exception', from: 7, to: 12 }),
          expect.objectContaining({ type: 'codage', code: 'cat_001', from: 1, to: 5 }),
          expect.objectContaining({ type: 'commentaire', from: 1, to: 5, texte: 'Commentaire synthétique.' }),
        ]))
        expect(e.locuteurs).toEqual(expect.arrayContaining([
          expect.objectContaining({ nom: 'Locuteur sans tour', valeursLoc: { v2: 'v2m1' } }),
        ]))
        expect(JSON.stringify(e)).toContain('Note synthétique conservée.')
        expect(JSON.stringify(e)).toContain('Commentaire synthétique.')
        expect(e.definitionsAnonLocales).toEqual(expect.arrayContaining([
          { entite: ['Alias local', 'Autre alias'], pseudos: ['Déclaration locale'], etat: 'declaration' },
          { entite: ['Locale'], pseudos: ['Variante locale', 'Inutilisée'], etat: 'declaration' },
        ]))
        const lfs = new ClientLfsGitLab({ urlInstance: config.url!, urlDepot: `${adresse(cible)}.git`, utilisateur: config.utilisateur,
          autorisation: { type: 'jeton-prive', jeton: config.token! } })
        expect(etat.bilan.conservation?.autres).toHaveLength(4)
        expect(etat.autresConfirmes).toHaveLength(4)
        expect(corpus.lexico).toMatchObject({ motsOutils: ['le', 'la'], regroupements: [{ forme: 'aller', membres: ['allais'] }] })
        expect(await d.lireFichier('Autres/.env.production', 'main')).toBeNull()
        for (const fichierAutre of etat.bilan.conservation!.autres) {
          const copie = join(f.dossier, `autre-${fichierAutre.sha256}`)
          await lfs.telechargerObjet(fichierAutre, copie)
          expect(readFileSync(copie)).toEqual(f.fichiersAutres.get(fichierAutre.cheminSource))
        }
        for (const media of etat.bilan.medias) {
          const fichier = join(f.dossier, `copie-${media.sha256}`)
          if (externe) await webdav(urlMedia!).getBinaireFichier(media.cheminDestination, fichier)
          else await lfs.telechargerObjet(media, fichier)
          expect(sha(readFileSync(fichier))).toBe(sha(f.objets.get(media.cheminSource)!))
        }
        await lireMedias(page, externe)
        await page.screenshot({ path: info.outputPath('migration-terminee.png') })
        await joindrePreuve(info, 'preuve-migration', { source: f.source.id, cible: cible.id, commitSource: f.commit,
          commitCible: await d.resoudreTete('main'), destination: externe ? 'webdav' : 'gitlab',
          medias: etat.bilan.medias.map((m) => ({ taille: m.taille, sha256: m.sha256 })) })
        f.nettoyer()
        const second = await lancerQualification(neuf)
        try {
          const p = await second.firstWindow()
          expect(readdirSync(neuf)).not.toContain('migrations-gitlab')
          await ouvrirProfilNeuf(p, cible, urlMedia)
          await lireMedias(p, externe)
          await p.screenshot({ path: info.outputPath('lecture-profil-neuf.png') })
        } finally { await second.close() }
      } catch (erreur) {
        const page = await app.firstWindow()
        await page.screenshot({ path: info.outputPath('echec.png') }).catch(() => undefined)
        throw erreur
      } finally {
        await app.close(); f.nettoyer()
        rmSync(profil, { recursive: true, force: true }); rmSync(neuf, { recursive: true, force: true })
      }
    })
  }

  test('refus source=cible, cible occupée ou modifiée, et annulation sans envoi', async () => {
    const f = await fixture(), vide = await projet('gardes'), occupe = await projet('occupe', true)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-gardes-'))
    const app = await lancerQualification(profil)
    try {
      await depot(occupe).publierCommit('main', 'Donnée synthétique à conserver', [{ action: 'create', file_path: 'usager.txt', content: 'Ne pas remplacer.' }])
      const avantOccupe = await depot(occupe).resoudreTete('main')
      const page = await app.firstWindow(), modal = await connecterSource(page, f.source)
      for (const [cible, message] of [[f.source, 'deux dépôts différents'], [occupe, 'données utilisateur']] as const) {
        await modal.getByLabel('Adresse du nouveau projet GitLab', { exact: true }).fill(adresse(cible))
        await modal.getByRole('button', { name: 'Préparer le bilan', exact: true }).click()
        await expect(modal.getByRole('alert')).toContainText(message)
        await expect(modal.getByRole('region', { name: 'Bilan de migration' })).toHaveCount(0)
      }
      expect(await depot(occupe).resoudreTete('main')).toBe(avantOccupe)
      await modal.getByLabel('Adresse du nouveau projet GitLab', { exact: true }).fill(adresse(vide))
      await modal.getByRole('button', { name: 'Préparer le bilan', exact: true }).click()
      await expect(modal.getByRole('region', { name: 'Bilan de migration' })).toBeVisible({ timeout: 30_000 })
      await instrumenterMigration(app, vide.id, 'normal')
      page.removeAllListeners('dialog')
      page.once('dialog', (dialogue) => dialogue.dismiss())
      await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
      await expect(modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true })).toBeEnabled()
      expect((await lireSondeMigration(app))).toMatchObject({ publications: 0, copies: 0 })
      expect(await page.evaluate(() => window.sonal.migrer.gitlab.listerSuivis())).toEqual([])
      expect((await api<{ empty_repo: boolean }>(`/projects/${vide.id}`)).empty_repo).toBe(true)
      await depot(vide).publierCommit('main', 'Course synthétique après bilan', [{ action: 'create', file_path: 'nouveau.txt', content: 'Conserver.' }])
      const apresCourse = await depot(vide).resoudreTete('main')
      page.on('dialog', (dialogue) => dialogue.accept())
      await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('destination a changé')
      expect(await depot(vide).resoudreTete('main')).toBe(apresCourse)
      expect((await lireSondeMigration(app))).toMatchObject({ publications: 0, copies: 0 })
      expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
    } finally { await app.close(); f.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })

  test('WebDAV : fichier différent conservé, copie et publication interrompues sans réussite trompeuse', async () => {
    const f = await fixture(), cible = await projet('collision'), profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-collision-'))
    const dossier = `qualification-migration-${cible.id}`, url = `${racineMedia}/${dossier}`
    await webdav(racineMedia).mkcol(dossier)
    const app = await lancerQualification(profil)
    try {
      const page = await app.firstWindow(), modal = await preparer(page, f.source, cible, url)
      const racine = join(profil, 'migrations-gitlab'), operation = readdirSync(racine)[0]
      const docs = join(racine, operation, 'documents')
      const corpus = JSON.parse(readFileSync(join(docs, 'corpus.crp'), 'utf8')) as CorpusFichier
      const entretien = JSON.parse(readFileSync(join(docs, 'entretiens', `${corpus.ordreEntretiens![0]}.json`), 'utf8')) as EntretienFichier
      const chemin = entretien.meta.audioDistant!.chemin, c = webdav(url)
      const parents = chemin.split('/').slice(0, -1)
      for (let n = 1; n <= parents.length; n++) await c.mkcol(parents.slice(0, n).join('/'))
      await c.putTexte(chemin, 'Contenu synthétique différent à conserver.')
      await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText(/différent|correspond pas/)
      expect(await c.getTexte(chemin)).toBe('Contenu synthétique différent à conserver.')
      expect((await api<{ empty_repo: boolean }>(`/projects/${cible.id}`)).empty_repo).toBe(true)
      expect(lireEtat(profil).phase).toBe('copie')
      expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
    } finally { await app.close(); f.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })

  for (const mode of ['copie', 'ouverture'] as const) {
    test(`SIGKILL pendant ${mode === 'copie' ? 'une copie WebDAV' : 'l’ouverture après publication GitLab'}, relance et reprise sans duplication`, async ({}, info) => {
      const f = await fixture(), cible = await projet(`arret-${mode}`), profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-kill-'))
      const externe = mode === 'copie', dossier = `qualification-migration-${cible.id}`, urlMedia = externe ? `${racineMedia}/${dossier}` : undefined
      if (externe) await webdav(racineMedia).mkcol(dossier)
      let app = await lancerQualification(profil)
      try {
        await instrumenterMigration(app, cible.id, mode)
        const page = await app.firstWindow(), modal = await preparer(page, f.source, cible, urlMedia)
        await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
        await expect.poll(() => lireSondeMigration(app), { timeout: 90_000 }).toMatchObject({ suspendue: true })
        const avant = lireEtat(profil), corpusAvant = await depot(cible).lireFichier('corpus.crp', 'main')
        expect(avant.phase).toBe(externe ? 'copie' : 'ouverture')
        expect(avant.mediasConfirmes).toHaveLength(externe ? 0 : 3)
        const ids = avant.documents.filter((d) => d.chemin.startsWith('entretiens/')).map((d) => d.chemin)
        await tuerApplication(app)
        app = await lancerQualification(profil, true)
        await instrumenterMigration(app, cible.id, 'normal')
        const reprise = await app.firstWindow()
        await connecterSource(reprise, f.source)
        const formulaire = reprise.getByRole('dialog', { name: 'Migration SonalPi1 — GitLab' })
        if (externe) {
          await formulaire.getByLabel('Dossier média', { exact: true }).fill(urlMedia!)
          await formulaire.getByLabel('Login média', { exact: true }).fill(accesMedia.utilisateur)
          await formulaire.getByLabel('Mot de passe d’application', { exact: true }).fill(accesMedia.motDePasse)
        }
        await formulaire.getByRole('button', { name: 'Vérifier et reprendre', exact: true }).click()
        await expect(formulaire).toBeHidden({ timeout: 90_000 })
        const apres = lireEtat(profil)
        expect(apres.phase).toBe('terminee')
        expect(apres.documents.filter((d) => d.chemin.startsWith('entretiens/')).map((d) => d.chemin)).toEqual(ids)
        const sonde = await lireSondeMigration(app)
        expect(sonde.publications).toBe(externe ? 1 : 0)
        if (!externe) expect(await depot(cible).lireFichier('corpus.crp', 'main')).toEqual(corpusAvant)
        expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
        await joindrePreuve(info, 'preuve-arret-reprise', { signal: 'SIGKILL', source: f.source.id, cible: cible.id,
          phaseAvant: avant.phase, phaseApres: apres.phase, publicationsApresRelance: sonde.publications, identifiantsConserves: ids })
      } finally { await app.close().catch(() => undefined); f.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
    })
  }

  test('publication fractionnée : premier lot accepté à réponse perdue, corpus publié en dernier après reprise', async () => {
    test.setTimeout(600_000)
    const f = await fixture(251), cible = await projet('lots'), profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-lots-'))
    const app = await lancerQualification(profil)
    try {
      await instrumenterMigration(app, cible.id, 'perte')
      const page = await app.firstWindow(), modal = await preparer(page, f.source, cible, undefined, 251)
      await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('envoi n’est pas confirmé', { timeout: 90_000 })
      const avant = lireEtat(profil)
      expect(avant.lots.length).toBeGreaterThan(1)
      expect(avant.prochainLot).toBe(0)
      expect(avant.intention).toBeDefined()
      expect(await depot(cible).lireFichier('corpus.crp', 'main')).toBeNull()
      const premier = avant.documents[avant.lots[0].at(-1)!]
      const acquis = await depot(cible).lireFichier(premier.chemin, 'main')
      expect(acquis).not.toBeNull()
      await retablirTransportMigration(app)
      await modal.getByRole('button', { name: 'Vérifier et reprendre', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 120_000 })
      const apres = lireEtat(profil)
      expect(apres.phase).toBe('terminee')
      expect(apres.documents).toEqual(avant.documents)
      expect((await lireSondeMigration(app)).publications).toBe(avant.lots.length)
      expect(await depot(cible).lireFichier(premier.chemin, 'main')).toEqual(acquis)
      const corpus = JSON.parse((await depot(cible).lireFichier('corpus.crp', 'main'))!.contenu) as CorpusFichier
      expect(Object.keys(corpus.membership)).toHaveLength(251)
      expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
    } finally { await app.close(); f.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })

  test('publication réellement acceptée à réponse perdue, reprise explicite sans second envoi', async () => {
    const f = await fixture(), cible = await projet('perte'), profil = mkdtempSync(join(tmpdir(), 'sonal-q-migration-perte-'))
    const app = await lancerQualification(profil)
    try {
      await instrumenterMigration(app, cible.id, 'perte')
      const page = await app.firstWindow(), modal = await preparer(page, f.source, cible)
      await modal.getByRole('button', { name: 'Copier les médias et créer le corpus', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('envoi n’est pas confirmé', { timeout: 60_000 })
      const avant = await depot(cible).lireFichier('corpus.crp', 'main')
      expect(avant).not.toBeNull()
      expect(lireEtat(profil).intention).toBeDefined()
      expect(lireEtat(profil).phase).toBe('publication')
      expect((await lireSondeMigration(app)).publications).toBe(1)
      await retablirTransportMigration(app)
      await modal.getByRole('button', { name: 'Vérifier et reprendre', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 60_000 })
      expect(lireEtat(profil).phase).toBe('terminee')
      expect(lireEtat(profil).intention).toBeUndefined()
      expect((await lireSondeMigration(app)).publications).toBe(1)
      expect(await depot(cible).lireFichier('corpus.crp', 'main')).toEqual(avant)
      expect(await depot(f.source).resoudreTete('main')).toBe(f.commit)
    } finally { await app.close(); f.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
})

async function joindrePreuve(info: TestInfo, nom: string, preuve: unknown) {
  const path = info.outputPath(`${nom}.json`)
  writeFileSync(path, JSON.stringify(preuve, null, 2))
  await info.attach(nom, { path, contentType: 'application/json' })
}

function lireEtat(profil: string): EtatMigrationGitLab {
  const racine = join(profil, 'migrations-gitlab')
  const operation = readdirSync(racine).find((nom) => nom.startsWith('migration-'))!
  return JSON.parse(readFileSync(join(racine, operation, 'migration.json'), 'utf8'))
}
