/**
 *  SCÉNARIO d'APPLICATION EN MASSE à deux postes, contre les Nextcloud DOCKER
 *  réels (la couture multi-user du panneau Pseudos).
 *
 *   Max applique une règle corpus en masse sur trois entretiens fermés.
 *   OLIVIER tient le verrou de l'un d'eux et y a déjà posé SA propre
 *   annotation : l'application échoue NOMMÉMENT sur cet entretien (les deux
 *   autres réussissent). Olivier libère ensuite ; la règle est ré-appliquée,
 *   et les occurrences posées en masse COEXISTENT avec l'annotation
 *   d'olivier — jamais d'écrasement.
 *
 *  Le verrou ENTRETIEN suit la variante mesurée à l'ouverture :
 *  variante A contre la pile A (files_lock), variante B contre la pile B.
 *  Skippé si une pile ne répond pas (npm run nc:up / nc-b:up).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import type { IdentiteSession } from '../../src/main/distant/sessions'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'

const ENTITE = 'Karine'
const BASE_A = 'http://localhost:8080'
const BASE_B = 'http://localhost:8081'
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }

const pret = (base: string): Promise<boolean> =>
  fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)
const pileAPrete: boolean = await pret(BASE_A)
const pileBPrete: boolean = await pret(BASE_B)

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Scénario anon masse',
    codebook: {},
    variables: {},
    reglesAnon: { 'reg-1': { id: 'reg-1', entite: [ENTITE], pseudos: ['Marie'] } },
    personnes: {},
    membership: {
      e1: { titre: 'Entretien un', date: null, lastModified: '2026-01-01T00:00:00Z' },
      e2: { titre: 'Entretien deux', date: null, lastModified: '2026-01-01T00:00:00Z' },
      e3: { titre: 'Entretien trois', date: null, lastModified: '2026-01-01T00:00:00Z' },
    },
  }
  return JSON.stringify(c, null, 2)
}

/** Deux occurrences « Karine » dans le texte. */
function entretien(): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Bonjour Karine ici.' }] },
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Et Karine encore.' }] },
      ],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null },
  })
}

interface Poste {
  client: ClientWebDAV
  miroir: MiroirWebDAV
  store: CorpusStore
  tx: TransactionsCorpus
}

function creerPoste(
  baseUrlDav: string,
  qui: { utilisateur: string; motDePasse: string },
  idSession: string,
  verrouNatif: boolean,
): Poste {
  const client = new ClientWebDAV({ baseUrl: baseUrlDav, identifiants: qui })
  const identite: () => IdentiteSession = () => ({
    userId: qui.utilisateur,
    machineId: `poste-${qui.utilisateur}`,
    sessionId: idSession,
  })
  const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), `sonal-masse-${qui.utilisateur}-`)))
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true // distant : les écritures passent par transaction
  const tx = new TransactionsCorpus(client, miroir, () => store, identite, { verrouNatif })
  return { client, miroir, store, tx }
}

async function amorcerServeur(base: string): Promise<void> {
  const client = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX })
  // Verrous résiduels éventuels (passage interrompu) : libérer sans précondition.
  await client.supprimer('verrous/corpus.lock.json').catch(() => {})
  for (const id of ['e1', 'e2', 'e3']) await client.supprimer(`verrous/${id}.lock.json`).catch(() => {})
  for (const id of ['e1', 'e2', 'e3']) await client.deverrouiller(`entretiens/${id}.json`).catch(() => {})
  await client.putTexte('corpus.json', corpusInitial())
  for (const id of ['e1', 'e2', 'e3']) await client.putTexte(`entretiens/${id}.json`, entretien())
}

/* ── LA TRAME commune — variante A sur la pile A, variante B sur la pile B ──*/

async function jouerMasseDeuxPostes(base: string, verrouNatif: boolean): Promise<void> {
  const davMax = `${base}/remote.php/dav/files/max/MonCorpus`
  const davOlivier = `${base}/remote.php/dav/files/olivier/MonCorpus`
  await amorcerServeur(base)

  const max = creerPoste(davMax, MAX, 's-MAX-MASSE', verrouNatif)
  const olivier = creerPoste(davOlivier, OLIVIER, 's-OLI-MASSE', verrouNatif)
  await max.miroir.tirer()
  await olivier.miroir.tirer()

  // Olivier prend le verrou de e3 et y pose SA propre annotation (session de travail simulée : écriture sous verrou avec If-Match).
  // L'annotation porte sur « Bonjour »,
  // sans chevaucher les occurrences « Karine » visées par la règle.
  const pOlivier = verrouNatif
    ? new ProviderFilesLock(olivier.client, () => ({ userId: 'olivier', machineId: 'poste-olivier', sessionId: 's-OLI-MASSE' }))
    : new ProviderPutConditionnel(olivier.client, () => ({ userId: 'olivier', machineId: 'poste-olivier', sessionId: 's-OLI-MASSE' }))
  const cheminVerrouE3 = verrouNatif ? 'entretiens/e3.json' : 'verrous/e3.lock.json'
  expect((await pOlivier.acquerir(cheminVerrouE3)).ok).toBe(true)
  const brutE3 = await olivier.client.getTexte('entretiens/e3.json')
  const dataE3 = JSON.parse(brutE3) as EntretienFichier
  dataE3.annotations.push({ id: 'a-oli-1', type: 'anon', from: 0, to: 7, auteur: 'olivier', etat: 'anonymise', pseudo: 'Koko' })
  const nouveauEtag = await olivier.client.putTexte('entretiens/e3.json', JSON.stringify(dataE3, null, 2))
  void nouveauEtag

  // Max applique la règle en masse sur les TROIS entretiens : e1/e2 réussissent,
  // e3 est refusé NOMMÉMENT (verrou tenu par olivier).
  const res = await max.tx.appliquerRegleLot([
    { entretienId: 'e1', regleId: 'reg-1' },
    { entretienId: 'e2', regleId: 'reg-1' },
    { entretienId: 'e3', regleId: 'reg-1' },
  ])
  expect(res.succes.map((x) => [x.id, x.nb]).sort()).toEqual([
    ['e1', 2],
    ['e2', 2],
  ])
  expect(res.echecs).toHaveLength(1)
  expect(res.echecs[0].id).toBe('e3')
  expect(res.echecs[0].raison).toContain('olivier')

  // Côté serveur : e1/e2 portent les occurrences de la masse. L'annotation
  // d'olivier sur e3 est intacte ; aucune occurrence de masse n'y est posée.
  const lireAnnotations = async (id: string) =>
    (JSON.parse(await max.client.getTexte(`entretiens/${id}.json`)) as EntretienFichier).annotations.filter(
      (a) => a.type === 'anon',
    )
  expect(await lireAnnotations('e1')).toHaveLength(2)
  expect(await lireAnnotations('e2')).toHaveLength(2)
  const e3Pendant = await lireAnnotations('e3')
  expect(e3Pendant).toHaveLength(1)
  expect(e3Pendant[0].auteur).toBe('olivier')

  // OlivieR libère ; la règle est ré-appliquée sur e3 → succès.
  await pOlivier.liberer(cheminVerrouE3)
  const res2 = await max.tx.appliquerRegleLot([{ entretienId: 'e3', regleId: 'reg-1' }])
  expect(res2.succes).toEqual([{ id: 'e3', nb: 2, titre: 'Entretien trois' }])
  expect(res2.echecs).toEqual([])

  // COEXISTENCE finale sur e3 : l'annotation d'olivier + les DEUX posées en masse ; rien n'a été écrasé par le second passage.
  const e3Final = await lireAnnotations('e3')
  expect(e3Final).toHaveLength(3)
  expect(e3Final.filter((a) => a.auteur === 'olivier')).toHaveLength(1)
  expect(e3Final.filter((a) => a.auteur === 'corpus')).toHaveLength(2)
}

describe.skipIf(!pileAPrete)('Anonymisation en masse deux postes — pile A (files_lock)', () => {
  it(
    'verrou autrui → échec nommé sans bloquer le lot ; après libération → coexistence',
    { timeout: 120_000 },
    async () => {
      await jouerMasseDeuxPostes(BASE_A, true)
    },
  )
})

describe.skipIf(!pileBPrete)('Anonymisation en masse deux postes — pile B (sans plugin)', () => {
  it(
    'verrou autrui → échec nommé sans bloquer le lot ; après libération → coexistence',
    { timeout: 120_000 },
    async () => {
      await jouerMasseDeuxPostes(BASE_B, false)
    },
  )
})
