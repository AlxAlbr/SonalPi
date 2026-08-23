/**
 * SCÉNARIO de PROMOTION CONCURRENTE d'une entité vers le corpus,
 * contre les Nextcloud DOCKER réels.
 *
 *   Max pousse « Hopital Saint-Anne » vers le corpus (transaction).
 *   OLIVIER, qui n'a PAS re-tiré depuis, pousse LA MÊME entité depuis son
 *   poste : sa transaction voit la règle de Max dans le GET frais
 *   d'après-verrou, et elle la RÉUTILISE au lieu d'en créer une seconde
 *   (`existait: true`). Le serveur ne porte JAMAIS deux règles pour la même
 *   entité ; l'UI ouvrira son dialogue Aligner / Garder les deux sur ce
 *   signal.
 *
 * Joué contre LA MÊME trame sur la pile A (files_lock) ET la pile B (sans
 * plugin) ; le verrou CORPUS est toujours en PUT conditionnel.
 * Skippé si une pile ne répond pas (npm run nc:up / nc-b:up).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import type { IdentiteSession } from '../../src/main/distant/sessions'
import { FORMAT_VERSION, type CorpusFichier } from '../../src/shared/format'

const ENTITE = 'Hopital Saint-Anne'
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
    nom: 'Scénario promotion concurrente',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {},
  }
  return JSON.stringify(c, null, 2)
}

interface Poste {
  client: ClientWebDAV
  miroir: MiroirWebDAV
  store: CorpusStore
  tx: TransactionsCorpus
}

/** Un poste = son chemin DAV propre, son miroir, son store, ses transactions. */
function creerPoste(baseUrlDav: string, qui: { utilisateur: string; motDePasse: string }, idSession: string): Poste {
  const client = new ClientWebDAV({ baseUrl: baseUrlDav, identifiants: qui })
  const identite: () => IdentiteSession = () => ({
    userId: qui.utilisateur,
    machineId: `poste-${qui.utilisateur}`,
    sessionId: idSession,
  })
  const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), `sonal-promo-${qui.utilisateur}-`)))
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true // distant : les écritures passent par transaction
  const tx = new TransactionsCorpus(client, miroir, () => store, identite, {})
  return { client, miroir, store, tx }
}

async function amorcerServeur(base: string): Promise<void> {
  const client = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX })
  // Verrou résiduel éventuel (passage interrompu) : libérer sans précondition.
  await client.supprimer('verrous/corpus.lock.json').catch(() => {})
  await client.putTexte('corpus.json', corpusInitial())
}

async function reglesServeur(base: string): Promise<CorpusFichier['reglesAnon']> {
  const client = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX })
  return (JSON.parse(await client.getTexte('corpus.json')) as CorpusFichier).reglesAnon
}

/* ── LA TRAME commune — identique sur les deux piles ───────────────────────*/

async function jouerPromotionConcurrente(base: string): Promise<void> {
  const davMax = `${base}/remote.php/dav/files/max/MonCorpus`
  const davOlivier = `${base}/remote.php/dav/files/olivier/MonCorpus`
  await amorcerServeur(base)

  const max = creerPoste(davMax, MAX, 's-MAX-PROMO')
  const olivier = creerPoste(davOlivier, OLIVIER, 's-OLI-PROMO')

  // Chacun tire UNE FOIS à l'ouverture du corpus (état : aucune règle).
  await max.miroir.tirer()
  await olivier.miroir.tirer()

  // Max promeut l'entité → création normale.
  const resMax = await max.tx.executer(() => max.store.regleAnonCreer(ENTITE, ['HSA']))
  expect(resMax.existait).toBe(false)

  // Olivier promeut LA MÊME entité SANS pull intermédiaire (miroir périmé ;
  // sa lecture locale dirait « aucune règle ») : la transaction réutilise
  // celle de Max, jamais de doublon.
  const resOlivier = await olivier.tx.executer(() => olivier.store.regleAnonCreer(ENTITE, ['St-Anne']))
  expect(resOlivier.existait).toBe(true)
  expect(resOlivier.regle.id).toBe(resMax.regle.id)
  expect(resOlivier.regle.pseudos).toEqual(['HSA']) // intacte : matière du dialogue UI

  // Le serveur ne porte qu'UNE règle pour l'entité.
  const regles = await reglesServeur(base)
  expect(Object.keys(regles)).toHaveLength(1)

  // Une entité VRAIMENT nouvelle se crée normalement (la garde ne surbloque pas).
  const resAutre = await max.tx.executer(() => max.store.regleAnonCreer('Karine Dubois', ['KD']))
  expect(resAutre.existait).toBe(false)
  expect(Object.keys(await reglesServeur(base))).toHaveLength(2)
}

describe.skipIf(!pileAPrete)('Promotion concurrente — pile A (NC31 + files_lock)', () => {
  it(
    'deux postes, même entité sans pull intermédiaire → une seule règle',
    { timeout: 120_000 },
    async () => {
      await jouerPromotionConcurrente(BASE_A)
    },
  )
})

describe.skipIf(!pileBPrete)('Promotion concurrente — pile B (NC29 sans plugin)', () => {
  it(
    'deux postes, même entité sans pull intermédiaire → une seule règle',
    { timeout: 120_000 },
    async () => {
      await jouerPromotionConcurrente(BASE_B)
    },
  )
})
