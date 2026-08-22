/**
 * Tests de la SESSION d'écriture (plan-multiuser.md §4) contre le serveur
 * WebDAV embarqué : acquisition/refus, publication sous garde If-Match,
 * ordre publier-puis-déverrouiller (§4.4), battement raté → rétrogradation.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/miroir'
import { SessionsDEntretien, type IdentiteSession } from '../../src/main/distant/sessions'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const ID = 'ent-abc'

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.json', '{"membership":{}}')
  serveur.poser(`${'entretiens'}/${ID}.json`, JSON.stringify({ lastModified: 'v1', texte: '' }))
  const dirMiroir = mkdtempSync(join(tmpdir(), 'session-'))
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const miroir = new MiroirWebDAV(client, dirMiroir)
  const identite: { value: IdentiteSession } = {
    value: { userId: 'max', machineId: 'poste-1', sessionId: 's-1' },
  }
  const retrogrades: string[] = []
  /** Identité MUTABLE : les tests de reprise crash changent le sessionId
   *  (relancement d'app) sans reconstruire le banc. */
  const sessions = new SessionsDEntretien(
    client,
    miroir,
    () => ({ ...identite.value }),
    (id) => retrogrades.push(id),
  )
  return {
    serveur,
    client,
    sessions,
    miroir,
    dirMiroir,
    retrogrades,
    identite,
    fichierLocal: join(dirMiroir, 'entretiens', `${ID}.json`),
    verrou: () => serveur.contenuDe(`verrous/${ID}.lock.json`),
    etatVerrou: () => serveur.etagDe(`verrous/${ID}.lock.json`),
  }
}

describe('Ouverture de session (§4.1)', () => {
  it('verrou libre : acquis, le contenu SERVEUR est tiré dans le miroir', async () => {
    const b = banc()
    // Contenu local périmé avant ouverture…
    await b.miroir.tirer()
    b.serveur.poser(`entretiens/${ID}.json`, JSON.stringify({ lastModified: 'v2', texte: 'serveur' }))
    const r = await b.sessions.ouvrir(ID)
    expect(r.etat).toBe('a-nous')
    // …l'ouverture a ramené la version serveur (pas confiance au local).
    expect(readFileSync(b.fichierLocal, 'utf8')).toContain('serveur')
    expect(b.verrou()).toBeTruthy()
  })

  it('verrou tenu par autrui : refus avec détenteur, aucun verrou créé par nous', async () => {
    const b = banc()
    const autres = new SessionsDEntretien(b.client, b.miroir, () => ({
      userId: 'olivier',
      machineId: 'poste-2',
      sessionId: 's-AUTRE',
    }))
    await autres.ouvrir(ID)
    const r = await b.sessions.ouvrir(ID)
    expect(r).toMatchObject({ etat: 'tenu-par-autrui', tenuPar: { userId: 'olivier' } })
  })
})

describe('Publication (§4.3)', () => {
  it('publie le contenu local avec garde If-Match et note le nouvel ETag', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Édition locale (autosave) : le fichier miroir change côté disque…
    const etagServeurAvant = b.serveur.etagDe(`entretiens/${ID}.json`)!
    b.sessions.noterSale(ID)
    const r = await b.sessions.publier(ID)
    expect(r.ok).toBe(true)
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toBe(readFileSync(b.fichierLocal, 'utf8'))
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).not.toBe(etagServeurAvant)
    // Le manifeste connaît le NOUVEL ETag → un pull ne re-télécharge pas notre publication.
    const deuxiemeTirage = await b.miroir.tirer()
    expect(deuxiemeTirage.telecharges).toEqual([])
  })

  it('publication sans modifications : no-op (aucun trafic inutile)', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    const etag = b.serveur.etagDe(`entretiens/${ID}.json`)
    await b.sessions.publier(ID)
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).toBe(etag)
  })

  it('le serveur a changé SOUS nos pieds (412) → divergence, copie locale mise de côté', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Contournement : quelqu'un écrase le fichier via l'UI web (sans verrou).
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    b.sessions.noterSale(ID)
    const r = await b.sessions.publier(ID)
    expect(r.ok).toBe(false)
    expect(r.raison).toBe('divergence')
    // La session est dégradée : copie de divergence locale hors serveur…
    expect(existsSync(join(b.dirMiroir, 'sessions'))).toBe(true)
    expect(b.retrogrades).toContain(ID)
    // …et plus aucune session écrivable.
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })
})

describe('Fermeture — ordre invariant publier PUIS déverrouiller (§4.4)', () => {
  it('contenu sale : publication finale puis libération du verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.sessions.noterSale(ID)
    await b.sessions.publier(ID)
    b.sessions.noterSale(ID) // re-modification après publication
    await b.sessions.fermer(ID)
    expect(b.verrou()).toBeUndefined() // libéré
    // Et le contenu publié est bien le dernier état local.
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toBe(readFileSync(b.fichierLocal, 'utf8'))
  })

  it('contenu non publié (jamais sale) : fermeture = simple libération', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    await b.sessions.fermer(ID)
    expect(b.verrou()).toBeUndefined()
  })
})

describe('Rétrogradation (§5.2)', () => {
  it('battement raté après forçage : callback + copie de divergence locale', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Oliviers force le verrou de max.
    const clientOlivier = new ClientWebDAV(
      { baseUrl: b.serveur.baseUrl, identifiants: b.serveur.identifiants },
      b.serveur.fetch,
    )
    const pOlivier = new ProviderPutConditionnel(clientOlivier, () => ({
      userId: 'olivier',
      machineId: 'poste-2',
      sessionId: 's-OLI',
    }))
    await pOlivier.forcer(`verrous/${ID}.lock.json`)
    // Max modifie localement, puis tic de battement → rétrogradation immédiate.
    b.sessions.noterSale(ID)
    await b.sessions.tic()
    expect(b.retrogrades).toEqual([ID])
    expect(existsSync(join(b.dirMiroir, 'sessions'))).toBe(true)
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })
})

/* ── E1 finition : pull sous verrou, badges, reprise crash (§4.5) ───────────*/

describe('Pull et exclusions de session (E1)', () => {
  it('le pull n\'écrase JAMAIS la copie de travail d\'un fichier sous notre verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Édition locale (autosave) : le miroir avance du serveur…
    const localModifie = JSON.stringify({ lastModified: 'local-en-cours', texte: 'moi' })
    writeFileSync(b.fichierLocal, localModifie)
    // …pendant ce temps, quelqu'un écrase le fichier via l'UI web.
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    // Pull AVEC exclusion (comme distant:tirer côté main) : intouchable.
    const t = await b.miroir.tirer([`entretiens/${ID}.json`])
    expect(t.telecharges).toEqual([])
    expect(readFileSync(b.fichierLocal, 'utf8')).toBe(localModifie)
    // Pull SANS exclusion (comportement E0) : écraserait — c'est précisément
    // ce que la couche session interdit pendant une session.
  })
})

describe('Badges de verrou fiables (§3.1)', () => {
  it("état public des verrous : contenu décodé, NOTRE session omise, illisible → null", async () => {
    const b = banc()
    await b.miroir.tirer()
    // Un verrou tenu par OLIVIER (autre machine/session)…
    const clientOlivier = new ClientWebDAV(
      { baseUrl: b.serveur.baseUrl, identifiants: b.serveur.identifiants },
      b.serveur.fetch,
    )
    const pOlivier = new ProviderPutConditionnel(clientOlivier, () => ({
      userId: 'olivier', machineId: 'poste-2', sessionId: 's-OLI',
    }))
    await pOlivier.acquerir(`verrous/${ID}.lock.json`)
    // …et un verrou à NOUS (même sessionId que l'identité courante).
    b.serveur.poser(
      `verrous/autre.lock.json`,
      JSON.stringify({
        userId: 'max', machineId: 'poste-1', sessionId: 's-1',
        acquiredAt: '2026-01-01T00:00:00Z', refreshedAt: '2026-01-01T00:00:00Z', ttl: 300,
      }),
    )
    // Et un fichier corrompu.
    b.serveur.poser(`verrous/casse.lock.json`, '{ pas du json')
    const liste = await b.client.propfind('verrous')
    const entrees = liste
      .filter((e) => !e.dossier && e.chemin.endsWith('.lock.json'))
      .map((e) => ({ chemin: `verrous/${e.chemin}`, etag: e.etag }))
    const publics = await b.sessions.etatVerrousPublics(entrees)
    const parNom = Object.fromEntries(publics.map((p) => [p.chemin, p.contenu]))
    expect(parNom[`verrous/${ID}.lock.json`]).toMatchObject({ userId: 'olivier' })
    expect(parNom['verrous/autre.lock.json']).toBeNull() // NOTRE session → pas de badge
    expect(parNom['verrous/casse.lock.json']).toBeNull() // illisible → jamais deviné
  })
})

describe('Reprise après crash (§4.5)', () => {
  /** Simule le crash : ouverture avec sessionId s-CRASH, puis « relancement »
   *  (l'identité courante passe à s-NOUVELLE). Le verrou reste posé. */
  async function crash(b: ReturnType<typeof banc>) {
    b.identite.value = { userId: 'max', machineId: 'poste-1', sessionId: 's-CRASH' }
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.sessions.noterSale(ID)
    await b.sessions.publier(ID) // publication périodique avant le crash
    // Édition locale APRÈS la dernière publication, puis crash sans fermeture.
    const nonPublie = JSON.stringify({ lastModified: 'jamais-publié', texte: 'travail perdu ?' })
    writeFileSync(b.fichierLocal, nonPublie)
    b.identite.value = { userId: 'max', machineId: 'poste-1', sessionId: 's-NOUVELLE' }
  }

  it('détection : un verrou de NOTRE machine mais d\'UNE AUTRE session est orphelin', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    expect(o).toHaveLength(1)
    expect(o[0].id).toBe(ID)
    expect(o[0].verrou.sessionId).toBe('s-CRASH')
    // Le verrou est TOUJOURS tenu côté serveur.
    expect(b.verrou()).toBeTruthy()
  })

  it('« reprendre et publier » : publie la copie locale PUIS libère (ordre §4.4)', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    const r = await b.sessions.reprendreOrphelin(o[0].cheminVerrou)
    expect(r.ok).toBe(true)
    // Le travail local non publié est bien parti sur le serveur…
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('jamais-publié')
    // …et le verrou est libéré.
    expect(b.verrou()).toBeUndefined()
    // Plus rien à reprendre.
    expect(await b.sessions.orphelins()).toHaveLength(0)
  })

  it('« abandonner » : libère SANS publier (la copie locale reste dans le miroir)', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    await b.sessions.abandonnerOrphelin(o[0].cheminVerrou)
    expect(b.verrou()).toBeUndefined()
    // Rien n'a été publié : le serveur garde la dernière version publiée.
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).not.toContain('jamais-publié')
    // La copie locale reste au miroir (matière à divergence future, §6).
    expect(readFileSync(b.fichierLocal, 'utf8')).toContain('jamais-publié')
  })

  it('reprise avec contournement (412) : on ne publie PAS, le verrou reste', async () => {
    const b = banc()
    await crash(b)
    // Quelqu'un a écrit via l'UI web PENDANT le crash.
    b.serveur.poser(`entretiens/${ID}.json`, '{ "écrit derrière le verrou": true }')
    const o = await b.sessions.orphelins()
    const r = await b.sessions.reprendreOrphelin(o[0].cheminVerrou)
    expect(r.ok).toBe(false)
    expect(r.raison).toBe('divergence')
    // Ni écrasement serveur ni libération : l'utilisateur tranche ensuite.
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('derrière le verrou')
    expect(b.verrou()).toBeTruthy()
  })
})
