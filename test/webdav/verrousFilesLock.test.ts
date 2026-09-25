/**
 *  Tests de la VARIANTE A — files_lock natif — contre le
 *  serveur WebDAV embarqué (qui émule le contrat vérifié sur la pile réelle :
 *  LOCK/UNLOCK + X-User-Lock, 200/423/412, imposition du verrou aux tiers,
 *  props nc: dans les PROPFIND).
 *
 *  Ce que cette variante doit prouver ici : le même comportement que la
 *  variante B (cycle complet,
 *  zéro perte), avec un verrou qui porte sur LE FICHIER DE DONNÉES lui-même
 *  et une détection d'orphelins par JOURNAL LOCAL (le serveur ne connaît ni
 *  machine ni session).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import {
  SessionsDEntretien,
  type IdentiteSession,
} from '../../src/main/distant/sessions'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

const ID = 'ent-abc'

function banc() {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
  serveur.poser('corpus.json', corpusDistantValide([ID]))
  serveur.poser(`entretiens/${ID}.json`, entretienDistantValide({ lastModified: 'v1', texte: '' }))
  const dirMiroir = mkdtempSync(join(tmpdir(), 'fileslock-'))
  const clientMax = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const miroir = new MiroirWebDAV(clientMax, dirMiroir)
  /** Identité MUTABLE : les scénarios de crash changent le sessionId. */
  const identite: { value: IdentiteSession } = {
    value: { userId: 'max', machineId: 'poste-1', sessionId: 's-1' },
  }
  const retrogrades: string[] = []
  const sessions = new SessionsDEntretien(
    clientMax,
    miroir,
    () => ({ ...identite.value }),
    (id) => retrogrades.push(id),
    undefined,
    { verrouNatif: true }, // VARIANTE A
  )
  const clientOlivier = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: { utilisateur: 'olivier', motDePasse: 'pass-oli' } },
    serveur.fetch,
  )
  return {
    serveur,
    client: clientMax,
    clientOlivier,
    sessions,
    miroir,
    dirMiroir,
    retrogrades,
    identite,
    fichierLocal: join(dirMiroir, 'entretiens', `${ID}.json`),
    journal: () => join(dirMiroir, 'sessions', '.verrous-natifs.json'),
    verrouNatif: () => serveur.verrouNatifDe(`entretiens/${ID}.json`),
  }
}

describe('Provider files_lock', () => {
  it('acquisition → état → battement → libération ; refus atomique d\u2019un tiers', async () => {
    const b = banc()
    await b.miroir.tirer()
    const pMax = new ProviderFilesLock(b.client, () => ({
      userId: 'max',
      machineId: 'poste-1',
      sessionId: 's-1',
    }))
    const chemin = `entretiens/${ID}.json` // le verrou porte sur le FICHIER DE DONNÉES

    // Libre → acquis.
    expect(await pMax.etat(chemin)).toBeNull()
    const r = await pMax.acquerir(chemin)
    expect(r.ok).toBe(true)

    // État lisible par un tiers (matière des badges / bandeau lecture seule).
    const pOlivier = new ProviderFilesLock(b.clientOlivier, () => ({
      userId: 'olivier',
      machineId: 'poste-2',
      sessionId: 's-AUTRE',
    }))
    const vuParOlivier = await pOlivier.etat(chemin)
    expect(vuParOlivier).toMatchObject({ userId: 'max' })

    // Refus pour un autre utilisateur (423), détenteur affiché.
    const refus = await pOlivier.acquerir(chemin)
    expect(refus.ok).toBe(false)
    if (!refus.ok) expect(refus.tenuPar?.userId).toBe('max')

    // Battement (re-LOCK) ok tant que nous tenons.
    expect((await pMax.battre(chemin)).ok).toBe(true)

    // Libération idempotente puis retour à libre.
    await pMax.liberer(chemin)
    await pMax.liberer(chemin) // déjà parti : sans effet
    expect(await pMax.etat(chemin)).toBeNull()
  })
})

describe('Session en variante A — cycle inchangé', () => {
  it('ouverture pose le verrou NATIF sur entretiens/<id>.json ; fermeture le libère', async () => {
    const b = banc()
    await b.miroir.tirer()
    const r = await b.sessions.ouvrir(ID)
    expect(r.etat).toBe('a-nous')
    // Verrou visible côté serveur, détenu par max…
    expect(b.verrouNatif()).toMatchObject({ utilisateur: 'max' })
    // …consigné au journal local (détection des orphelins)…
    expect(Object.keys(JSON.parse(readFileSync(b.journal(), 'utf8')))).toContain(ID)
    // …et la publication du détenteur passe (imposée seulement aux TIERS).
    b.sessions.noterSale(ID)
    await expect(b.sessions.publier(ID)).resolves.toMatchObject({ ok: true })
    await b.sessions.fermer(ID)
    expect(b.verrouNatif()).toBeUndefined()
    // Journal purgé à la fermeture propre.
    expect(readFileSync(b.journal(), 'utf8')).not.toContain(ID)
  })

  it('refus si le fichier est verrouillé — MÊME par le même user Nextcloud (autre session)', async () => {
    const b = banc()
    await b.miroir.tirer()
    // Un AUTRE poste du MÊME utilisateur a pris le verrou (re-LOCK possible :
    // files_lock ne distingue pas les sessions — c'est NOTRE garde qui refuse).
    b.serveur.poserVerrouDirect(`entretiens/${ID}.json`, 'max')
    const r = await b.sessions.ouvrir(ID)
    expect(r).toMatchObject({ etat: 'tenu-par-autrui', tenuPar: { userId: 'max' } })
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })

  it('imposition serveur : le PUT d\u2019un tiers est rejeté 423 pendant notre session', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Olivier tente de contourner par SON client (comme via l'UI web)…
    const tentative = b.clientOlivier.putTexte(
      `entretiens/${ID}.json`,
      '{"contourné":true}',
    )
    await expect(tentative).rejects.toMatchObject({ statut: 423 })
  })

  it('battement raté après prise en main par un tiers → rétrogradation + purge journal', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.sessions.noterSale(ID) // travail local non publié
    // Olivier prend le verrou (simulation admin/forçage : direct côté banc).
    b.serveur.oterVerrouDirect(`entretiens/${ID}.json`)
    b.serveur.poserVerrouDirect(`entretiens/${ID}.json`, 'olivier')
    await b.sessions.tic()
    expect(b.retrogrades).toEqual([ID])
    // Copie locale mise de côté, droit d'écriture retiré et état visible.
    expect(b.sessions.etat(ID).etat).toBe('degrade')
    expect(readFileSync(b.journal(), 'utf8')).not.toContain(ID)
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })
})

describe('Orphelins en variante A — détection par journal local', () => {
  async function crash(b: ReturnType<typeof banc>) {
    b.identite.value = { userId: 'max', machineId: 'poste-1', sessionId: 's-CRASH' }
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.sessions.noterSale(ID)
    await b.sessions.publier(ID)
    // Travail local APRÈS la dernière publication, puis crash sans fermeture.
    const nonPublie = JSON.stringify({ lastModified: 'jamais-publié', texte: 'travail perdu ?' })
    writeFileSync(b.fichierLocal, nonPublie)
    b.identite.value = { userId: 'max', machineId: 'poste-1', sessionId: 's-NOUVELLE' }
  }

  it('détection : verrou encore posé + présent au journal → orphelin proposé', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    expect(o).toHaveLength(1)
    expect(o[0].id).toBe(ID)
    expect(o[0].cheminVerrou).toBe(`entretiens/${ID}.json`) // chemin NATIF
    expect(b.verrouNatif()).toBeTruthy() // toujours tenu côté serveur
  })

  it('verrou libéré entre-temps : l\u2019entrée du journal est purgée silencieusement', async () => {
    const b = banc()
    await crash(b)
    b.serveur.oterVerrouDirect(`entretiens/${ID}.json`)
    expect(await b.sessions.orphelins()).toHaveLength(0)
    expect(readFileSync(b.journal(), 'utf8')).not.toContain(ID)
  })

  it('« reprendre et publier » : publie la copie locale PUIS libère', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    const r = await b.sessions.reprendreOrphelin(o[0].cheminVerrou)
    expect(r.ok).toBe(true)
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('jamais-publié')
    expect(b.verrouNatif()).toBeUndefined()
    expect(await b.sessions.orphelins()).toHaveLength(0)
  })

  it('« abandonner » : libère SANS publier (copie locale conservée au miroir)', async () => {
    const b = banc()
    await crash(b)
    const o = await b.sessions.orphelins()
    await b.sessions.abandonnerOrphelin(o[0].cheminVerrou)
    expect(b.verrouNatif()).toBeUndefined()
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).not.toContain('jamais-publié')
    expect(readFileSync(b.fichierLocal, 'utf8')).toContain('jamais-publié')
  })

  it('divergence pendant le crash : reprise REFUSÉE, ni écrasement ni libération', async () => {
    const b = banc()
    await crash(b)
    // Quelqu'un a écrit DERRIÈRE le verrou (contournement) : le manifeste porte l'ETag de NOTRE dernière publication,
    // le serveur porte autre chose.
    b.serveur.poser(`entretiens/${ID}.json`, '{ "écrit derrière le verrou": true }')
    const o = await b.sessions.orphelins()
    const r = await b.sessions.reprendreOrphelin(o[0].cheminVerrou)
    expect(r.ok).toBe(false)
    expect(r.raison).toBe('divergence')
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('derrière le verrou')
    expect(b.verrouNatif()).toBeTruthy()
  })
})
