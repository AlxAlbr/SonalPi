/**
 * Tests de la SESSION d'écriture (plan-multiuser.md §4) contre le serveur
 * WebDAV embarqué : acquisition/refus, publication sous garde If-Match,
 * ordre publier-puis-déverrouiller (§4.4), battement raté → rétrogradation.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
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
  const identite: IdentiteSession = { userId: 'max', machineId: 'poste-1', sessionId: 's-1' }
  const retrogrades: string[] = []
  const sessions = new SessionsDEntretien(
    client,
    miroir,
    () => ({ ...identite }),
    (id) => retrogrades.push(id),
  )
  return {
    serveur,
    client,
    sessions,
    miroir,
    dirMiroir,
    retrogrades,
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
