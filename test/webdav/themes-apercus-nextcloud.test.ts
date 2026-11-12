import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { CorpusStore } from '../../src/main/corpusStore'
import { ApercusThemesWebDAV } from '../../src/main/distant/apercusThemesWebDAV'
import type { CorpusFichier } from '../../src/shared/format'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

const comptes = {
  max: { utilisateur: 'max', motDePasse: 'max-max-1234' },
  olivier: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' },
}
for (const port of [8080, 8081]) {
  const base = `http://localhost:${port}`
  const pret = await fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
  describe.skipIf(!pret)(`Aperçus des thèmes sur Nextcloud réel :${port}`, () => {
    test('GET avec ETag, lecture partagée, membre absent et aucune écriture d’analyse', { timeout: 30_000 }, async () => {
      const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: comptes.max })
      const dossier = `sonde/themes-apercus-${randomUUID()}`
      await parent.creerDossier('sonde')
      await parent.creerDossier(dossier)
      try {
        const requetes: string[] = []
        const client = new ClientWebDAV({ baseUrl: `${parent.config.baseUrl}/${dossier}`, identifiants: comptes.max }, async (input, init) => {
          requetes.push(init?.method ?? 'GET')
          return fetch(input, init)
        })
        const c = JSON.parse(corpusDistantValide(['e1', 'absent'])) as CorpusFichier
        c.codebook = Object.fromEntries(['source', 'cible'].map((id, ordre) => [id, {
          id, nom: id, parent: null, ordre, actif: true, codeExport: id,
        }]))
        const contenuCorpus = JSON.stringify(c)
        const contenuEntretien = entretienDistantValide({
          corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte partagé.' }] }] },
          annotations: [{ id: 'a', type: 'codage', code: 'source', from: 1, to: 6, auteur: 'test' }],
        })
        await client.creerDossier('entretiens')
        await client.putTexte('corpus.crp', contenuCorpus, { ifNoneMatch: '*' })
        await client.putTexte('entretiens/e1.json', contenuEntretien, { ifNoneMatch: '*' })
        requetes.length = 0
        const lecture = await client.getTexteAvecEtag('entretiens/e1.json')
        expect(lecture).toEqual({ contenu: contenuEntretien, etag: expect.any(String) })
        expect(lecture.etag).toBeTruthy()
        expect(lecture.etag).not.toMatch(/^W\//)
        const dir = mkdtempSync(join(tmpdir(), 'sonal-themes-nc-'))
        const store = new CorpusStore(dir)
        store.lectureSeule = true
        writeFileSync(join(dir, 'corpus.crp'), 'miroir périmé, jamais lu')
        const apercus = new ApercusThemesWebDAV(client, (avant) => store.adapterEntretienOperationTheme(avant))
        const a = await apercus.analyser({ type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } })
        expect(a.faisable).toBe(true)
        expect(a.totaux.passages).toBe(1)
        expect(a.obstacles).toEqual([{ phase: 'entretiens', entretienId: 'absent', motif: expect.any(String) }])
        expect(apercus.details(a.operationId, 'e1').codages[0].extrait).toBe('Texte')
        expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe('miroir périmé, jamais lu')
        const partage = new ClientWebDAV({
          baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: comptes.olivier,
        })
        expect(await partage.getTexteAvecEtag('entretiens/e1.json')).toEqual(lecture)
        expect((await client.getTexteAvecEtag('corpus.crp')).contenu).toBe(contenuCorpus)
        expect(await client.getTexteAvecEtag('entretiens/e1.json')).toEqual(lecture)
        expect(requetes.every((methode) => methode === 'GET')).toBe(true)
      } finally {
        await parent.supprimer(dossier)
      }
    })
  })
}
