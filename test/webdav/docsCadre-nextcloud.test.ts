import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { enregistrerCopieDistant, lireApercuDistant, listerDossierDistant, urlNextcloudPourCorpus } from '../../src/main/docsCadreDistant'

for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Documents imbriqués sur Nextcloud réel :${port}`, () => {
    test('navigation, aperçu, copie et disparition, sans mutation du service documentaire', { timeout: 30_000 }, async () => {
      const identifiants = { utilisateur: 'max', motDePasse: 'max-max-1234' }
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants })
      const dossier = `sonde/docs-${randomUUID()}`
      const temporaire = mkdtempSync(join(tmpdir(), 'sonal-docs-nc-'))
      await parent.creerDossier('sonde')
      await parent.creerDossier(dossier)
      try {
        const config = { baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants }
        const preparation = new ClientWebDAV(config)
        for (const d of ['DocsCadre', 'DocsCadre/DPO', 'DocsCadre/DPO/École 2', 'DocsCadre/DPO/École 2/100% modèles']) await preparation.creerDossier(d)
        const relatif = 'DPO/École 2/100% modèles/Notice é.txt'
        await preparation.putTexte(`DocsCadre/${relatif}`, 'Texte exact éà <b>.', { ifNoneMatch: '*' })
        const methodes: string[] = []
        const client = new ClientWebDAV(config, async (input, init) => {
          methodes.push(init?.method ?? 'GET')
          return fetch(input, init)
        })
        expect((await listerDossierDistant(client)).entrees).toMatchObject([{ nature: 'dossier', chemin: 'DPO' }])
        expect((await listerDossierDistant(client, 'DPO')).entrees).toMatchObject([{ nature: 'dossier', chemin: 'DPO/École 2' }])
        expect((await listerDossierDistant(client, 'DPO/École 2/100% modèles')).entrees).toMatchObject([{ nature: 'document', chemin: relatif }])
        expect((await lireApercuDistant(client, relatif)).apercu).toEqual({ genre: 'texte', contenu: 'Texte exact éà <b>.' })
        const copie = join(temporaire, 'copie.txt')
        await enregistrerCopieDistant(client, relatif, copie)
        expect(readFileSync(copie, 'utf8')).toBe('Texte exact éà <b>.')
        expect(urlNextcloudPourCorpus(config.baseUrl, 'DPO/École 2/100% modèles')).toContain('/DocsCadre/DPO/%C3%89cole%202/100%25%20mod%C3%A8les')
        await preparation.supprimer(`DocsCadre/${relatif}`)
        expect((await lireApercuDistant(client, relatif)).apercu).toEqual({ genre: 'aucun', raison: 'absent' })
        await preparation.supprimer('DocsCadre/DPO/École 2')
        expect(await listerDossierDistant(client, 'DPO/École 2')).toMatchObject({ absent: true })
        expect(methodes.every((m) => ['GET', 'PROPFIND'].includes(m))).toBe(true)
      } finally {
        await parent.supprimer(dossier)
        rmSync(temporaire, { recursive: true, force: true })
      }
    })
  })
}
