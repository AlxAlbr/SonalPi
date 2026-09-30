import { describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import {
  BailGitLab,
  cleRessourceBailGitLab,
  DepotCommitsGitLabClient,
  FileCommitsGitLab,
} from '../../src/main/gitlab/bailGitLab'
import { ClientGitLab, TAILLE_MAX_DOCUMENT_GITLAB } from '../../src/main/gitlab/client'
import {
  MAX_ACTIONS_PUBLICATION,
  PublieurGitLab,
  verifierBornesPublication,
} from '../../src/main/gitlab/publication'

const MiB = 1024 * 1024
import { DepotMemoire } from './depotMemoire'

/** Un entretien de la taille demandée, au format réel : c'est la taille qui
 *  est en jeu dans les bornes, pas la forme du contenu. */
function entretienLong(octets: number): string {
  const entretien = { formatVersion: 8, texte: 'x'.repeat(octets) }
  return JSON.stringify(entretien, null, 2)
}

/** Dépôt qui répond à la lecture d'un fichier par le contenu fourni. */
async function lireFichierAvecTaille(contenu: string): Promise<{ depot: DepotCommitsGitLabClient }> {
  const reponse = JSON.stringify({
    file_path: 'entretiens/e1.json',
    content: Buffer.from(contenu, 'utf8').toString('base64'),
    encoding: 'base64',
    last_commit_id: 'a'.repeat(40),
    execute_filemode: false,
  })
  const fetchImpl: typeof fetch = async () => new Response(reponse, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  const client = new ClientGitLab({
    urlInstance: 'https://gitlab.example.org',
    projetId: 42,
    autorisation: { type: 'jeton-prive', jeton: 'jeton-test' },
  }, fetchImpl)
  return { depot: new DepotCommitsGitLabClient(client) }
}

function identidade(sessionId: string) {
  return { userId: 'alice', machineId: 'poste-a', sessionId }
}

function bail(
  depot: DepotMemoire,
  sessionId: string,
  maintenant: () => number,
  fileCommits?: FileCommitsGitLab,
): BailGitLab {
  let generation = 0
  return new BailGitLab({
    branche: 'main',
    depot,
    identite: () => identidade(sessionId),
    maintenant,
    nouvelleGeneration: () => `generation-${sessionId}-${++generation}`,
    dureeBailMs: 60_000,
    fileCommits,
  })
}

describe('bail GitLab versionné', () => {
  test('acquisition exclusive et séparation des sessions du même compte', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', maintenant)
    const posteB = bail(depot, 'session-b', maintenant)

    const premier = await posteA.acquireRessource('entretien:e1')
    const second = await posteB.acquireRessource('entretien:e1')

    expect(premier.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, raison: 'tenu' })
    if (!premier.ok || second.ok) throw new Error('Acquisition test invalide.')
    expect(premier.droit.generation).toBe('generation-session-a-1')
    expect(second.tenupar?.userId).toBe('alice')
    const chemin = posteA.snapshot(premier.droit).chemin
    expect(chemin).toMatch(/^\.sonal\/verrous\/[a-f0-9]{64}\.json$/)
    expect(chemin).not.toContain('e1')
    expect(JSON.parse(depot.fichiers.get(chemin)?.contenu ?? '{}')).toMatchObject({
      version: 2,
      protocole: 'sonal-bail-v2',
    })
  })

  test('un seul compte obtient la session pour deux comptes distincts', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const ressource = cleRessourceBailGitLab('main', 'entretiens/e1.json')
    const posteA = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({ userId: 'alice', machineId: 'poste-a', sessionId: 'session-a' }),
      maintenant,
      nouvelleGeneration: () => 'generation-a',
    })
    const posteB = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({ userId: 'bob', machineId: 'poste-b', sessionId: 'session-b' }),
      maintenant,
      nouvelleGeneration: () => 'generation-b',
    })

    const resultats = await Promise.all([
      posteA.acquireRessource(ressource),
      posteB.acquireRessource(ressource),
    ])
    expect(resultats.filter((resultat) => resultat.ok)).toHaveLength(1)
    const refuse = resultats.find((resultat) => !resultat.ok)
    expect(refuse).toMatchObject({ ok: false, raison: 'tenu' })
    if (!refuse || refuse.ok) throw new Error('Refus test invalide.')
    expect(['alice', 'bob']).toContain(refuse.tenupar?.userId)
  })

  test('refuse une nouvelle acquisition lorsqu’un ancien marqueur existe', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const ressourceLegacy = 'destination-ancien:entretien:e1'
    const hashLegacy = createHash('sha256').update(ressourceLegacy).digest('hex')
    depot.fichiers.set(`.sonal/verrous/${hashLegacy}.json`, {
      contenu: JSON.stringify({
        version: 1,
        protocole: 'sonal-bail-v1',
        resourceHash: hashLegacy,
        generation: 'ancienne-generation',
        holder: { userId: 'alice', machineId: 'poste-avant', sessionId: 'session-avant' },
        expireLe: new Date(Date.UTC(2026, 0, 1, 0, 5)).toISOString(),
        compteur: 3,
      }),
      commitId: '1'.repeat(40),
      executable: false,
    })

    const nouveau = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => identidade('session-apres-migration'),
      maintenant,
      ressourcesLegacy: [ressourceLegacy],
    })
    const resultat = await nouveau.acquireRessource(
      cleRessourceBailGitLab('main', 'entretiens/e1.json'),
    )
    expect(resultat).toMatchObject({
      ok: false,
      raison: 'tenu',
      tenupar: { userId: 'alice' },
    })
    expect(depot.commits).toHaveLength(0)
  })

  test('la reprise change la génération et bloque l’ancien détenteur', async () => {
    const depot = new DepotMemoire()
    const instantBase = Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', () => instantBase)
    const posteB = bail(depot, 'session-b', () => instantBase + 120_000)
    const ancien = await posteA.acquireRessource('entretien:e1')
    expect(ancien.ok).toBe(true)
    if (!ancien.ok) throw new Error('Acquisition test invalide.')

    const repris = await posteB.acquireRessource('entretien:e1')
    expect(repris.ok).toBe(true)

    if (!repris.ok) throw new Error('Reprise test invalide.')
    await expect(posteA.renouveler(ancien.droit)).resolves.toBe(false)
    expect(() => posteA.snapshot(ancien.droit)).toThrow('invalide')
  })
})

describe('publication GitLab sous droit', () => {
  test('lit le mode et revalide une garde sans télécharger le contenu', async () => {
    const methodes: string[] = []
    const fetchImpl: typeof fetch = async (_entree, init) => {
      methodes.push(init?.method ?? 'GET')
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'x-gitlab-last-commit-id': 'a'.repeat(40),
            'x-gitlab-execute-filemode': 'true',
          },
        })
      }
      return new Response(JSON.stringify({
        file_path: 'entretiens/e1.json',
        content: Buffer.from('{}').toString('base64'),
        encoding: 'base64',
        last_commit_id: 'a'.repeat(40),
        execute_filemode: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const depot = new DepotCommitsGitLabClient(new ClientGitLab({
      urlInstance: 'https://gitlab.example.org',
      projetId: 42,
      autorisation: { type: 'jeton-prive', jeton: 'jeton-test' },
    }, fetchImpl))

    await expect(depot.lireFichier('entretiens/e1.json', 'main')).resolves.toMatchObject({
      contenu: '{}',
      executable: true,
    })
    await expect(depot.lireGardeFichier('entretiens/e1.json', 'main')).resolves.toEqual({
      commitId: 'a'.repeat(40),
      executable: true,
    })
    expect(methodes).toEqual(['GET', 'HEAD'])
  })

  test('refuse un GET dont le mode exécutable est absent ou invalide', async () => {
    async function depotRepondant(corps: Record<string, unknown>): Promise<DepotCommitsGitLabClient> {
      const reponse = JSON.stringify(corps)
      const fetchImpl: typeof fetch = async () => new Response(reponse, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      return new DepotCommitsGitLabClient(new ClientGitLab({
        urlInstance: 'https://gitlab.example.org',
        projetId: 42,
        autorisation: { type: 'jeton-prive', jeton: 'jeton-test' },
      }, fetchImpl))
    }
    const base = {
      file_path: 'entretiens/e1.json',
      content: Buffer.from('{}').toString('base64'),
      encoding: 'base64',
      last_commit_id: 'a'.repeat(40),
    }

    // Une valeur absente n'est jamais remplacée par false : une instance
    // GitLab qui ne dit pas le mode est incompatible, pas silencieusement lue.
    const sansMode = await depotRepondant(base)
    await expect(sansMode.lireFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow('Réponse de fichier GitLab invalide.')
    const modeInvalide = await depotRepondant({ ...base, execute_filemode: 'peut-être' })
    await expect(modeInvalide.lireFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow('Réponse de fichier GitLab invalide.')
  })

  test('refuse un HEAD dont le mode exécutable est absent ou invalide', async () => {
    async function depotRepondant(entetes: Record<string, string>): Promise<DepotCommitsGitLabClient> {
      const fetchImpl: typeof fetch = async (_entree, init) => {
        if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: entetes })
        throw new Error('requête inattendue')
      }
      return new DepotCommitsGitLabClient(new ClientGitLab({
        urlInstance: 'https://gitlab.example.org',
        projetId: 42,
        autorisation: { type: 'jeton-prive', jeton: 'jeton-test' },
      }, fetchImpl))
    }

    // Sans en-tête de mode, la lecture légère ne devine pas un JSON non
    // exécutable : une garde fausse serait publiée sans le savoir.
    const sansMode = await depotRepondant({ 'x-gitlab-last-commit-id': 'a'.repeat(40) })
    await expect(sansMode.lireGardeFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow('Métadonnées de fichier GitLab invalides.')
    const modeInvalide = await depotRepondant({
      'x-gitlab-last-commit-id': 'a'.repeat(40),
      'x-gitlab-execute-filemode': 'peut-être',
    })
    await expect(modeInvalide.lireGardeFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow('Métadonnées de fichier GitLab invalides.')
    const sansCommit = await depotRepondant({ 'x-gitlab-execute-filemode': 'false' })
    await expect(sansCommit.lireGardeFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow('Métadonnées de fichier GitLab invalides.')
  })

  test('inclut la mutation du bail dans le commit des données', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const coordination = bail(depot, 'session-a', maintenant)
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-1',
      nature: 'session-entretien',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({
      statut: 'confirme',
      commitId: expect.stringMatching(/^[a-f0-9]{40}$/),
      compteurBail: 2,
    })

    const dernier = depot.commits.at(-1)
    expect(dernier?.actions).toHaveLength(2)
    expect(dernier?.actions[1]).toMatchObject({
      action: 'update',
      file_path: coordination.snapshot(droit.droit).chemin,
    })
    expect(coordination.snapshot(droit.droit).compteur).toBe(2)
  })

  test('refuse par son nom un plan trop volumineux, bail laissé intact', async () => {
    const depot = new DepotMemoire()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const coordination = bail(depot, 'session-a', maintenant)
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    const actions = Array.from({ length: MAX_ACTIONS_PUBLICATION }, (_vide, index) => ({
      action: 'update' as const,
      chemin: `entretiens/e${index}.json`,
      contenu: '{}',
      commitId: 'a'.repeat(40),
    }))

    // La limite d'actions métier plus le bail dépasse la borne du commit.
    await expect(publieur.publierSousDroit({
      operationId: 'operation-borne',
      nature: 'transaction-corpus',
      actions,
    }, droit.droit)).rejects.toThrow(
      new RegExp(`${MAX_ACTIONS_PUBLICATION + 1} actions`),
    )
    expect(depot.commits).toHaveLength(1)
    // Le droit reste utilisable : la préparation de bail a été annulée.
    expect(() => coordination.preparerPublication(droit.droit)).not.toThrow()
  })

  test('un corps trop lourd est refusé avant l’envoi', () => {
    const action = { action: 'update', file_path: 'corpus.json', content: 'x'.repeat(1024) }
    expect(() => verifierBornesPublication('main', 'Sonal operation', [action])).not.toThrow()
    const lourd = Array.from({ length: 3 }, (_vide, index) => ({
      ...action,
      file_path: `corpus-${index}.json`,
      content: 'x'.repeat(MiB),
    }))
    expect(() => verifierBornesPublication('main', 'Sonal operation', lourd))
      .toThrow(/Kio acceptés par GitLab/)
  })

  test('un entretien lisible reste publiable', async () => {
    // Un entretien de deux heures trente, à la taille mesurée sur les corpus
    // réels. Il doit passer les deux bornes : c'est l'invariant qui a motivé
    // leur relèvement, et il se vérifie sur un cas concret plutôt qu'à
    // l'intuition.
    const entretien = entretienLong(567 * 1024)
    const lire = await lireFichierAvecTaille(entretien)

    // La lecture avec garde passe.
    const fichier = await lire.depot.lireFichier('entretiens/e1.json', 'main')
    expect(fichier?.contenu).toBe(entretien)

    // La publication du même fichier passe aussi.
    expect(() => verifierBornesPublication('main', 'Sonal operation', [{
      action: 'update',
      file_path: 'entretiens/e1.json',
      content: entretien,
      last_commit_id: 'a'.repeat(40),
    }])).not.toThrow()
  })

  test('la lecture avec garde refuse juste au-dessus de sa valeur', async () => {
    // La borne porte sur la réponse base64, pas sur le fichier : elle admet
    // environ trois quarts de sa valeur en octets de contenu.
    const lisible = await lireFichierAvecTaille(entretienLong(1_400 * 1024))
    await expect(lisible.depot.lireFichier('entretiens/e1.json', 'main'))
      .resolves.toMatchObject({ chemin: 'entretiens/e1.json' })

    // Au-delà, la source est refusée par son nom : l'entretien qui dépasse la
    // borne est nommé, et le plafond seul ne sort jamais seul.
    const tropGros = await lireFichierAvecTaille(entretienLong(1_600 * 1024))
    await expect(tropGros.depot.lireFichier('entretiens/e1.json', 'main'))
      .rejects.toThrow(/trop volumineuse/)
  })

  test('le plus grand fichier lisible reste publiable', async () => {
    // La lecture est élargie par le base64, la publication par l'échappement :
    // à bornes égales, le plus grand fichier lisible tient sous le plan de
    // publication. C'est l'invariant à garder si les deux bornes sont relevées
    // à nouveau.
    const lisible = await lireFichierAvecTaille(entretienLong(1_500 * 1024))
    const fichier = await lisible.depot.lireFichier('entretiens/e1.json', 'main')
    expect(fichier).not.toBeNull()
    expect(() => verifierBornesPublication('main', 'Sonal operation', [{
      action: 'update',
      file_path: 'entretiens/e1.json',
      content: fichier?.contenu ?? '',
      last_commit_id: 'a'.repeat(40),
    }])).not.toThrow()
  })

  test('le plan de publication refuse juste au-dessus de sa valeur', () => {
    expect(() => verifierBornesPublication('main', 'Sonal operation', [{
      action: 'update', file_path: 'corpus.json',
      content: 'x'.repeat(TAILLE_MAX_DOCUMENT_GITLAB - 8 * 1024),
    }])).not.toThrow()
    expect(() => verifierBornesPublication('main', 'Sonal operation', [{
      action: 'update', file_path: 'corpus.json',
      content: 'x'.repeat(TAILLE_MAX_DOCUMENT_GITLAB),
    }])).toThrow(/Kio acceptés par GitLab/)
  })

  test('deux ressources différentes ne publient jamais en même temps', async () => {
    const depot = new DepotMemoire()
    depot.charger(new Map([
      ['entretiens/e1.json', '{}'],
      ['entretiens/e2.json', '{}'],
    ]))
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const premier = await coordination.acquireRessource('entretien:e1')
    const second = await coordination.acquireRessource('entretien:e2')
    if (!premier.ok || !second.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    for (let tour = 0; tour < 4; tour += 1) {
      depot.ralentirProchainCommit(15)
      await Promise.all([
        publieur.publierSousDroit({
          operationId: `operation-e1-${tour}`,
          nature: 'session-entretien',
          actions: [{
            action: 'update',
            chemin: 'entretiens/e1.json',
            contenu: JSON.stringify({ tour }),
            commitId: depot.fichiers.get('entretiens/e1.json')!.commitId,
          }],
        }, premier.droit),
        publieur.publierSousDroit({
          operationId: `operation-e2-${tour}`,
          nature: 'session-entretien',
          actions: [{
            action: 'update',
            chemin: 'entretiens/e2.json',
            contenu: JSON.stringify({ tour }),
            commitId: depot.fichiers.get('entretiens/e2.json')!.commitId,
          }],
        }, second.droit),
      ])
    }
    // GitLab refuse deux commits simultanés sur une même branche, même sur des
    // fichiers distincts : la file de la destination doit donc les séparer.
    expect(depot.plusGrandEnvol.valeur).toBe(1)
    expect(depot.commits).toHaveLength(2 + 8)
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('{"tour":3}')
  })

  test('deux coordinateurs distincts partagent la file de la destination', async () => {
    const depot = new DepotMemoire()
    depot.charger(new Map([
      ['entretiens/e1.json', '{}'],
      ['entretiens/e2.json', '{}'],
    ]))
    // Deux coordinateurs, comme le montage réel : une session d'entretien et
    // les transactions de corpus ont chacun le leur, pour la même destination.
    const fileCommits = new FileCommitsGitLab()
    const alice = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1), fileCommits)
    const bob = bail(depot, 'session-b', () => Date.UTC(2026, 0, 1), fileCommits)
    const premier = await alice.acquireRessource('entretien:e1')
    const second = await bob.acquireRessource('entretien:e2')
    if (!premier.ok || !second.ok) throw new Error('Acquisition test invalide.')
    const publieurAlice = new PublieurGitLab({ branche: 'main', depot, coordination: alice })
    const publieurBob = new PublieurGitLab({ branche: 'main', depot, coordination: bob })

    for (let tour = 0; tour < 4; tour += 1) {
      depot.ralentirProchainCommit(15)
      await Promise.all([
        publieurAlice.publierSousDroit({
          operationId: `partage-a-${tour}`,
          nature: 'session-entretien',
          actions: [{
            action: 'update',
            chemin: 'entretiens/e1.json',
            contenu: JSON.stringify({ tour }),
            commitId: depot.fichiers.get('entretiens/e1.json')!.commitId,
          }],
        }, premier.droit),
        publieurBob.publierSousDroit({
          operationId: `partage-b-${tour}`,
          nature: 'session-entretien',
          actions: [{
            action: 'update',
            chemin: 'entretiens/e2.json',
            contenu: JSON.stringify({ tour }),
            commitId: depot.fichiers.get('entretiens/e2.json')!.commitId,
          }],
        }, second.droit),
      ])
    }

    expect(depot.plusGrandEnvol.valeur).toBe(1)
  })

  test('sans file partagée, deux coordinateurs se croisent bien', async () => {
    // Ce test ne décrit pas un comportement wishes : il fixe pourquoi la file
    // appartient à la destination. Deux coordinateurs sans lien commun ont deux
    // files, et leurs commits se chevauchent.
    const depot = new DepotMemoire()
    depot.charger(new Map([
      ['entretiens/e1.json', '{}'],
      ['entretiens/e2.json', '{}'],
    ]))
    const alice = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const bob = bail(depot, 'session-b', () => Date.UTC(2026, 0, 1))
    const premier = await alice.acquireRessource('entretien:e1')
    const second = await bob.acquireRessource('entretien:e2')
    if (!premier.ok || !second.ok) throw new Error('Acquisition test invalide.')
    const publieurAlice = new PublieurGitLab({ branche: 'main', depot, coordination: alice })
    const publieurBob = new PublieurGitLab({ branche: 'main', depot, coordination: bob })
    depot.ralentirProchainCommit(20)
    await Promise.all([
      publieurAlice.publierSousDroit({
        operationId: 'isole-a',
        nature: 'session-entretien',
        actions: [{
          action: 'update',
          chemin: 'entretiens/e1.json',
          contenu: '{"v":1}',
          commitId: depot.fichiers.get('entretiens/e1.json')!.commitId,
        }],
      }, premier.droit),
      publieurBob.publierSousDroit({
        operationId: 'isole-b',
        nature: 'session-entretien',
        actions: [{
          action: 'update',
          chemin: 'entretiens/e2.json',
          contenu: '{"v":1}',
          commitId: depot.fichiers.get('entretiens/e2.json')!.commitId,
        }],
      }, second.droit),
    ])

    expect(depot.plusGrandEnvol.valeur).toBe(2)
  })

  test('une publication et une acquisition de bail ne se croisent pas', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const courant = await coordination.acquireRessource('entretien:e1')
    if (!courant.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    const [, autre] = await Promise.all([
      publieur.publierSousDroit({
        operationId: 'operation-croisee',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/e9.json', contenu: '{}' }],
      }, courant.droit),
      coordination.acquireRessource('entretien:e2'),
    ])
    expect(autre.ok).toBe(true)
    expect(depot.plusGrandEnvol.valeur).toBe(1)
  })

  test('une opération déjà dans la file n’attend pas la file', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const courant = await coordination.acquireRessource('entretien:e1')
    if (!courant.ok) throw new Error('Acquisition test invalide.')
    // Un appel réentrant s'exécute : il est déjà dans la section critique.
    await coordination.serierCommit(async () => {
      expect(await coordination.snapshot(courant.droit).resourceHash).toBeTruthy()
      expect(coordination.snapshot(courant.droit).expireLe).toBeGreaterThan(0)
    })
  })

  test('un refus dont toutes les gardes tiennent est renvoyé une fois', async () => {
    const depot = new DepotMemoire()
    depot.charger(new Map([['entretiens/e1.json', '{"v":1}']]))
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const courant = await coordination.acquireRessource('entretien:e1')
    if (!courant.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({
      branche: 'main', depot, coordination, attendre: async () => {},
    })
    // Le dépôt simule une collision de branche : refus, sans toucher aux gardes.
    depot.refuser(400)

    await expect(publieur.publierSousDroit({
      operationId: 'operation-collision',
      nature: 'session-entretien',
      actions: [{
        action: 'update',
        chemin: 'entretiens/e1.json',
        contenu: '{"v":2}',
        commitId: depot.fichiers.get('entretiens/e1.json')!.commitId,
      }],
    }, courant.droit)).resolves.toMatchObject({ statut: 'confirme' })

    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('{"v":2}')
  })

  test('un refus dont une garde a bougé n’est pas renvoyé', async () => {
    const depot = new DepotMemoire()
    depot.charger(new Map([['entretiens/e1.json', '{"v":1}']]))
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const courant = await coordination.acquireRessource('entretien:e1')
    if (!courant.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    const garde = depot.fichiers.get('entretiens/e1.json')!.commitId
    // Un tiers a réellement modifié l'entretien entre la lecture et l'envoi.
    const original = depot.publierCommit.bind(depot)
    depot.publierCommit = async (branche, message, actions) => {
      if (message.startsWith('Sonal ')) {
        depot.modifierHorsProtocole('entretiens/e1.json', '{"v":9}')
        return original(branche, message, actions)
      }
      return original(branche, message, actions)
    }

    await expect(publieur.publierSousDroit({
      operationId: 'operation-conflit',
      nature: 'session-entretien',
      actions: [{
        action: 'update',
        chemin: 'entretiens/e1.json',
        contenu: '{"v":2}',
        commitId: garde,
      }],
    }, courant.droit)).resolves.toMatchObject({ statut: 'refuse', raison: 'conflit' })

    // Le refus n'a pas été réessayé : une seule tentative de données.
    const donnees = depot.commits.filter((commit) => commit.message.startsWith('Sonal '))
    expect(donnees).toHaveLength(1)
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('{"v":9}')
  })

  describe('reprise d’un bail laissé par ce poste', () => {
    async function bailGenere(coordination: BailGitLab, ressource: string) {
      const acquisition = await coordination.acquireRessource(ressource)
      if (!acquisition.ok) throw new Error('Acquisition test invalide.')
      return {
        generation: coordination.snapshot(acquisition.droit).generation,
        chemin: coordination.snapshot(acquisition.droit).chemin,
        droit: acquisition.droit,
      }
    }

    test('rend un bail dont nous sommes encore le détenteur', async () => {
      const depot = new DepotMemoire()
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const pris = await bailGenere(coordination, 'corpus:main')

      expect(await coordination.rendreBailNotre(pris.chemin, pris.generation)).toBe('libere')
      expect(depot.fichiers.has(pris.chemin)).toBe(false)
      // Le droit en mémoire ne vaut plus rien de published : la reprise est un
      // gesture de démarrage, elle ne passe pas par un droit détenu.
      expect(coordination.snapshot(pris.droit).generation).toBe(pris.generation)
    })

    test('ne rend pas un bail repris par un tiers', async () => {
      const depot = new DepotMemoire()
      const alice = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const bob = bail(depot, 'session-b', () => Date.UTC(2026, 0, 1))
      const pris = await bailGenere(alice, 'corpus:main')
      await alice.liberer(pris.droit)
      const repris = await bailGenere(bob, 'corpus:main')

      // Génération différente : la preuve manque, on ne touche à rien.
      expect(await alice.rendreBailNotre(repris.chemin, pris.generation)).toBe('autre')
      expect(depot.fichiers.has(repris.chemin)).toBe(true)
    })

    test('ne rend pas un bail tenu par un autre compte', async () => {
      const depot = new DepotMemoire()
      const alice = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const pris = await bailGenere(alice, 'corpus:main')
      // Le même compte, mais pas nous : on ne rend rien.
      const autre = new BailGitLab({
        branche: 'main',
        depot,
        identite: () => ({ userId: 'olivier', machineId: 'poste-b', sessionId: 's-b' }),
        maintenant: () => Date.UTC(2026, 0, 1),
        dureeBailMs: 60_000,
      })
      expect(await autre.rendreBailNotre(pris.chemin, pris.generation)).toBe('autre')
      expect(depot.fichiers.has(pris.chemin)).toBe(true)
    })

    test('un bail déjà rendu ne fait rien', async () => {
      const depot = new DepotMemoire()
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const pris = await bailGenere(coordination, 'corpus:main')
      await coordination.liberer(pris.droit)
      expect(await coordination.rendreBailNotre(pris.chemin, pris.generation)).toBe('absent')
    })
  })

  test('journalise puis supprime une publication confirmée', async () => {
    const depot = new DepotMemoire()
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-publie-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const droit = await coordination.acquireRessource('entretien:e1')
      if (!droit.ok) throw new Error('Acquisition test invalide.')
      const publieur = new PublieurGitLab({ branche: 'main', depot, coordination, journal })

      await expect(publieur.publierSousDroit({
        operationId: 'operation-journal-confirme',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit)).resolves.toMatchObject({ statut: 'confirme' })
      expect(journal.lister()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une réponse perdue mais un commit passé est réconcilié sur place', async () => {
    const depot = new DepotMemoire()
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-reconcilie-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const droit = await coordination.acquireRessource('entretien:e1')
      if (!droit.ok) throw new Error('Acquisition test invalide.')
      depot.echouerApresAccepter(new Error('réponse perdue'))
      const publieur = new PublieurGitLab({ branche: 'main', depot, coordination, journal })

      // Le commit a abouti : la réconciliation le retrouve, et l'appelant
      // n'est pas told qu'il ignore ce qui est arrivé.
      await expect(publieur.publierSousDroit({
        operationId: 'operation-reconciliee',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit)).resolves.toMatchObject({ statut: 'confirme' })
      expect(journal.lister()).toEqual([])
      // Le bail reste alors récupérable : la libération porte la bonne garde.
      await expect(coordination.liberer(droit.droit)).resolves.toBe('libere')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('une réponse perdue et un sort inconnu restent journalisés', async () => {
    const depot = new DepotMemoire()
    const root = mkdtempSync(join(tmpdir(), 'sonal-journal-indetermine-'))
    try {
      const journal = new JournalPublicationGitLab('destination-test', root)
      const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
      const droit = await coordination.acquireRessource('entretien:e1')
      if (!droit.ok) throw new Error('Acquisition test invalide.')
      depot.echouerApresAccepter(new Error('réponse perdue'))
      // L'historique reste illisible : personne ne peut conclure.
      depot.rendreCommitsIllisibles()
      const publieur = new PublieurGitLab({ branche: 'main', depot, coordination, journal })

      await expect(publieur.publierSousDroit({
        operationId: 'operation-journal-indetermine',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit)).resolves.toMatchObject({ statut: 'indetermine' })
      expect(journal.lister()[0]).toMatchObject({
        etat: 'indetermine',
        operationId: 'operation-journal-indetermine',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('sérialise deux publications du même droit', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })
    depot.ralentirProchainCommit(20)

    const resultats = await Promise.all([
      publieur.publierSousDroit({
        operationId: 'operation-parallele-1',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
      }, droit.droit),
      publieur.publierSousDroit({
        operationId: 'operation-parallele-2',
        nature: 'session-entretien',
        actions: [{ action: 'create', chemin: 'entretiens/autre.json', contenu: '{}' }],
      }, droit.droit),
    ])

    expect(resultats.map((resultat) => resultat.statut)).toEqual(['confirme', 'confirme'])
    expect(coordination.snapshot(droit.droit).compteur).toBe(3)
    expect(depot.commits.slice(-2).map((commit) => commit.message)).toEqual([
      'Sonal operation-parallele-1',
      'Sonal operation-parallele-2',
    ])
  })

  test('refuse atomiquement une garde de contenu périmée', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    await depot.publierCommit('main', 'base de test', [
      { action: 'create', file_path: 'entretiens/e1.json', content: 'v1' },
    ])
    const base = depot.fichiers.get('entretiens/e1.json')!
    depot.modifierHorsProtocole('entretiens/e1.json', 'externe')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-conflit',
      nature: 'session-entretien',
      actions: [{
        action: 'update',
        chemin: 'entretiens/e1.json',
        contenu: 'v2',
        commitId: base.commitId,
      }],
    }, droit.droit)).resolves.toEqual({ statut: 'refuse', raison: 'conflit' })
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('externe')
    expect(coordination.snapshot(droit.droit).suspendu).toBe(true)
  })

  test('une ancienne génération ne peut plus publier après reprise', async () => {
    const depot = new DepotMemoire()
    let maintenant = Date.UTC(2026, 0, 1)
    const posteA = bail(depot, 'session-a', () => maintenant)
    const posteB = bail(depot, 'session-b', () => maintenant)
    const ancien = await posteA.acquireRessource('entretien:e1')
    if (!ancien.ok) throw new Error('Acquisition test invalide.')
    maintenant += 60_000
    const repris = await posteB.reprendreRessource('entretien:e1')
    if (!repris.ok) throw new Error('Reprise test invalide.')
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination: posteA })

    await expect(publieur.publierSousDroit({
      operationId: 'ancienne-generation',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, ancien.droit)).resolves.toEqual({ statut: 'refuse', raison: 'droit-perdu' })
    expect(depot.fichiers.has('entretiens/e1.json')).toBe(false)
  })

  test('suspend une publication acceptée dont la réponse est perdue', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    depot.echouerApresAccepter(new Error('connexion perdue'))
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-indeterminee',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({
      statut: 'indetermine',
      operationId: 'operation-indeterminee',
    })
    expect(depot.fichiers.get('entretiens/e1.json')?.contenu).toBe('{}')
    await expect(coordination.renouveler(droit.droit)).rejects.toThrow('réconciliation')
  })

  test('ne rejoue pas une mutation explicitement refusée par GitLab', async () => {
    const depot = new DepotMemoire()
    const coordination = bail(depot, 'session-a', () => Date.UTC(2026, 0, 1))
    const droit = await coordination.acquireRessource('entretien:e1')
    if (!droit.ok) throw new Error('Acquisition test invalide.')
    depot.refuser(429)
    const publieur = new PublieurGitLab({ branche: 'main', depot, coordination })

    await expect(publieur.publierSousDroit({
      operationId: 'operation-limitee',
      actions: [{ action: 'create', chemin: 'entretiens/e1.json', contenu: '{}' }],
    }, droit.droit)).resolves.toEqual({ statut: 'refuse', raison: 'limite' })
    expect(depot.commits).toHaveLength(1)
  })
})
