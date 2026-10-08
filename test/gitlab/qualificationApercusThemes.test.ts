import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../../src/main/gitlab/bailGitLab'
import { matriceCapacites } from '../../src/main/gitlab/politiqueGestes'
import type { CorpusFichier } from '../../src/shared/format'
import type { DemandeOperationTheme } from '../../src/shared/corpus/themes'
import { corpusDistantValide, entretienDistantValide } from '../webdav/fixturesCorpusDistant'
import { configuration, configurationPresente, creerRacine, definirPrefixeBanc, nouveauDepot, pile, nettoyer, commitsTouchant } from './qualificationBanc'

definirPrefixeBanc('themes-lecture')
describe.skipIf(!configurationPresente)('aperçus de thèmes GitLab réels à deux comptes', () => {
  test('SHA frais, tiers observé seulement sur le périmètre, aucune publication ni lecture de repli', { timeout: 90_000 }, async () => {
    const corpus = JSON.parse(corpusDistantValide(['e1', 'e2'])) as CorpusFichier
    corpus.codebook = Object.fromEntries(['source', 'cible'].map((id, ordre) => [id, { id, nom: id, parent: null, ordre, actif: true, codeExport: id }]))
    const racine = await creerRacine('apercu', { corpus })
    const depot = nouveauDepot(configuration.token1!)
    await depot.publierCommit('main', 'qualification des aperçus : entretiens', ['e1', 'e2'].map((id) => ({
      action: 'create' as const, file_path: `${racine}/entretiens/${id}.json`, content: entretienDistantValide({
        corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Un passage publié.' }] }] },
        annotations: [{ id: 'a', type: 'codage', code: 'source', from: 1, to: 5, auteur: 'test' }],
      }),
    })))
    const requetes: Array<{ methode: string; url: URL }> = []
    const client = new ClientGitLab({ urlInstance: configuration.url!, projetId: Number(configuration.projetId),
      autorisation: { type: 'jeton-prive', jeton: configuration.token1! } }, async (input, init) => {
      requetes.push({ methode: init?.method ?? 'GET', url: new URL(String(input)) })
      return fetch(input, init)
    })
    const dir = mkdtempSync(join(tmpdir(), 'sonal-lecture-themes-gitlab-'))
    const { contexte } = await preparerContexteGitLabLectureSeule({ id: 'qualification-themes', dirLocal: dir, client, branche: 'main', racine })
    const tiers = pile({ racine, jeton: configuration.token2!, userId: 'user2', sessionId: 'lecture-themes-tiers' })
    const ressource = cleRessourceBailGitLab('main', `${racine}/entretiens/e2.json`)
    const acquisition = await tiers.coordination.acquireRessource(ressource)
    expect(acquisition.ok).toBe(true)
    try {
      const cheminLocal = join(dir, 'entretiens/e1.json')
      writeFileSync(cheminLocal, 'miroir non publié')
      const commitsAvant = await commitsTouchant(racine)
      requetes.length = 0
      const a = await contexte.analyserOperationTheme({ type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } })
      expect(a.faisable).toBe(true)
      expect(a.disponibiliteGitLab?.entretiens).toMatchObject([{ id: 'e1', etat: 'libre-observe' }, { id: 'e2', etat: 'tenu-autrui', detenteur: 'user2' }])
      expect(a.totaux.passages).toBe(2)
      const sha = a.instantaneGitLab!.commit
      expect(requetes.filter((r) => r.url.searchParams.has('ref')).every((r) => r.url.searchParams.get('ref') === sha)).toBe(true)
      expect(contexte.detailsOperationTheme(a.operationId, 'e1').codages[0].extrait).toBeTruthy()
      expect(readFileSync(cheminLocal, 'utf8')).toBe('miroir non publié')
      const d: DemandeOperationTheme = { type: 'division', source: 'source', effacerSource: false,
        cibles: ['A', 'B'].map((token) => ({ type: 'nouvelle', token, nom: token, parent: 'source' })),
        choix: [{ codage: { entretienId: 'e1', annotationId: 'a' }, destination: 'A' }],
      }
      requetes.length = 0
      const division = await contexte.analyserOperationTheme(d)
      expect(division.disponibiliteGitLab?.entretiens).toEqual([{ id: 'e1', etat: 'libre-observe' }])
      const cheminBailTiers = cheminBailRessourceGitLab(ressource)
      expect(requetes.some((r) => decodeURIComponent(r.url.pathname).includes(cheminBailTiers))).toBe(false)
      expect(requetes.every((r) => r.methode === 'GET')).toBe(true)
      expect(await commitsTouchant(racine)).toBe(commitsAvant)
      expect(matriceCapacites('gitlab')).toMatchObject({ transfertThemes: true, divisionThemes: true, fusionThemes: true, suppressionSourceThemes: true })
    } finally {
      if (acquisition.ok) await tiers.coordination.liberer(acquisition.droit)
      await contexte.fermer()
      nettoyer(tiers)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
