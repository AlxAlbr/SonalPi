/**
 *  SCÉNARIO À DEUX POSTES contre les Nextcloud DOCKER réels —
 *  la répétition générale « deux chercheuses, un corpus » :
 *
 *   Poste MAX (propriétaire) et poste OLIVIER (partagé, SON propre chemin DAV),
 *   chacun avec son MIROIR local distinct, son store et ses transactions —
 *   exactement ce que feraient deux instances de l'app.
 *
 *   1. les deux postes tirent le miroir ;
 *   2. max publie une définition sous transaction ;
 *   3. olivier tire PUIS publie la sienne : le GET frais absorbe la version
 *      de max — les deux thèmes coexistent, JAMAIS d'écrasement ;
 *   4. verrou corpus tenu par max → la transaction d'olivier est REFUSÉE
 *      avec son nom (« définitions en cours de modification par max ») ;
 *   5. suppression d'entretien sous DOUBLE verrou : refusée tant que
 *      olivier tient l'entretien, puis réussie — membership publié d'abord,
 *      MOVE vers corbeille/ ensuite, les deux verrous rendus.
 *
 *  Joué contre LA MÊME trame sur la pile A (files_lock → variante A pour le
 *  verrou ENTRETIEN) ET la pile B (sans plugin → variante B). Skippé si une
 *  pile ne répond pas (npm run nc:up / nc-b:up + nc(:b):provision).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import type { VerrouProvider } from '../../src/main/verrous/types'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import type { IdentiteSession } from '../../src/main/distant/sessions'
import { FORMAT_VERSION, type CorpusFichier } from '../../src/shared/format'

const BASE_A = 'http://localhost:8080' // NC31 + files_lock
const BASE_B = 'http://localhost:8081' // NC29 SANS plugin
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }

const pret = (base: string): Promise<boolean> =>
  fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)
const pileAPrete: boolean = await pret(BASE_A)
const pileBPrete: boolean = await pret(BASE_B)

/* ── Amorce : l'état initial du corpus partagé (auto-porteur, relançable) ──*/

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Scénario deux postes',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      'ent-deux-postes': {
        titre: 'Entretien scénario',
        date: null,
        lastModified: '2026-01-01T00:00:00Z',
      },
    },
  }
  return JSON.stringify(c, null, 2)
}

function entretienInitial(): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
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

/** Un POSTE complet : chemin DAV qui lui est propre (partage Nextcloud),
 *  miroir local isolé, store en lecture seule, transactions branchées. */
function creerPoste(baseUrlDav: string, identifiants: { utilisateur: string; motDePasse: string }, idSession: string, verrouNatif: boolean): Poste {
  const client = new ClientWebDAV({ baseUrl: baseUrlDav, identifiants })
  const identite: () => IdentiteSession = () => ({
    userId: identifiants.utilisateur,
    machineId: `poste-${identifiants.utilisateur}`,
    sessionId: idSession,
  })
  const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), `sonal-2p-${identifiants.utilisateur}-`)))
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true
  const tx = new TransactionsCorpus(client, miroir, () => store, identite, { verrouNatif })
  return { client, miroir, store, tx }
}

/** Prépare l'état serveur et nettoie les résidus d'un passage antérieur.
 *  Le scénario doit pouvoir être rejoué sans intervention manuelle. */
async function amorcerServeur(base: string): Promise<{ original: string | null }> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  let original: string | null = null
  try {
    original = await client.getTexte('corpus.json')
  } catch {
    /* pas encore de corpus */
  }
  // Verrous résiduels (passage interrompu) : libérer sans précondition.
  await client.supprimer('verrous/corpus.lock.json').catch(() => {})
  await client.supprimer('verrous/ent-deux-postes.lock.json').catch(() => {})
  await client.deverrouiller('entretiens/ent-deux-postes.json').catch(() => {})
  // État de données initial connu : membership avec UN entretien + son fichier.
  await client.putTexte('corpus.json', corpusInitial())
  await client.putTexte('entretiens/ent-deux-postes.json', entretienInitial())
  await client.supprimer('corbeille/ent-deux-postes.json').catch(() => {})
  return { original }
}

/** Restaure l'état d'avant le scénario (le banc contrat lit corpus.json). */
async function nettoyer(base: string, original: string | null): Promise<void> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  if (original !== null) await client.putTexte('corpus.json', original).catch(() => {})
  else await client.supprimer('corpus.json').catch(() => {})
  await client.supprimer('entretiens/ent-deux-postes.json').catch(() => {})
  await client.supprimer('corbeille/ent-deux-postes.json').catch(() => {})
  await client.supprimer('verrous/corpus.lock.json').catch(() => {})
  await client.supprimer('verrous/ent-deux-postes.lock.json').catch(() => {})
  await client.deverrouiller('entretiens/ent-deux-postes.json').catch(() => {})
}

/** Le verrou ENTRETIEN posé PAR OLIVIER (tiers) selon la variante de la pile. */
function providerTiersEntretien(poste: Poste, base: string, natif: boolean): VerrouProvider {
  return natif
    ? new ProviderFilesLock(poste.client, () => ({ userId: 'olivier', machineId: 'poste-olivier', sessionId: 's-OLI-2P' }))
    : new ProviderPutConditionnel(
        new ClientWebDAV({
          baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus`,
          identifiants: OLIVIER,
        }),
        () => ({ userId: 'olivier', machineId: 'poste-olivier', sessionId: 's-OLI-2P' }),
      )
}

function cheminVerrouEntretien(natif: boolean): string {
  return natif ? 'entretiens/ent-deux-postes.json' : 'verrous/ent-deux-postes.lock.json'
}

async function corpusServeur(base: string): Promise<CorpusFichier> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  return JSON.parse(await client.getTexte('corpus.json')) as CorpusFichier
}

/** LA TRAME commune — identique sur les deux piles, seule la variante du verrou entretien diffère. Le protocole s'adapte, l'utilisateur ne choisit rien. */
async function jouerScenarioDeuxPostes(base: string, verrouNatif: boolean): Promise<void> {
  const davMax = `${base}/remote.php/dav/files/max/MonCorpus`
  const davOlivier = `${base}/remote.php/dav/files/olivier/MonCorpus`
  const { original } = await amorcerServeur(base)
  try {
    const max = creerPoste(davMax, MAX, 's-MAX-2P', verrouNatif)
    const olivier = creerPoste(davOlivier, OLIVIER, 's-OLI-2P', verrouNatif)

    // 1. Les deux postes ouvrent le corpus (pull incrémental chacun chez soi).
    await max.miroir.tirer()
    await olivier.miroir.tirer()

    // 2. MAX publie une définition sous transaction (~2 aller-retours).
    const catMax = await max.tx.executer(() => max.store.ajouterCategorie('Thème de Max', null))
    let c = await corpusServeur(base)
    expect(c.codebook[catMax.id]?.nom).toBe('Thème de Max')

    // 3. OLIVIER tire puis publie SA définition : le GET frais de sa transaction absorbe la publication de max,
    //    sans écrasement — c'est TOUT le point des transactions courtes.
    await olivier.miroir.tirer()
    const catOlivier = await olivier.tx.executer(() =>
      olivier.store.ajouterCategorie("Thème d'Olivier", null),
    )
    c = await corpusServeur(base)
    expect(c.codebook[catMax.id]?.nom).toBe('Thème de Max')
    expect(c.codebook[catOlivier.id]?.nom).toBe("Thème d'Olivier")
    // Et max voit le thème d'olivier au prochain pull.
    await max.miroir.tirer()
    expect(max.store.ouvrir().codebook[catOlivier.id]).toBeDefined()

    // 4. VERROU CORPUS tenu par max (session longue simulée) → la transaction d'olivier est REFUSÉE NOMINATIVEMENT,
    //    rien ne part en cachette.
    const pVerrouLong = new ProviderPutConditionnel(max.client, () => ({
      userId: 'max',
      machineId: 'poste-max',
      sessionId: 's-MAX-LONGUE',
    }))
    expect((await pVerrouLong.acquerir('verrous/corpus.lock.json')).ok).toBe(true)
    await expect(olivier.tx.executer(() => olivier.store.poserNom('Pirate'))).rejects.toThrow(/max/)
    c = await corpusServeur(base)
    expect(c.nom).toBe('Scénario deux postes') // rien n'a bougé
    await pVerrouLong.liberer('verrous/corpus.lock.json')

    // 5. SUPPRESSION sous double verrou, ordre canonique :
    //    a) olivier tient le verrou ENTRETIEN → max est refusé, corpus intact ;
    const pTiers = providerTiersEntretien(olivier, base, verrouNatif)
    expect((await pTiers.acquerir(cheminVerrouEntretien(verrouNatif))).ok).toBe(true)
    await expect(max.tx.supprimerEntretien('ent-deux-postes')).rejects.toThrow(/olivier/)
    c = await corpusServeur(base)
    expect(c.membership['ent-deux-postes']).toBeDefined()
    //    b) olivier libère → max supprime : membership publié D'ABORD,
    //       MOVE serveur ENSUITE, puis les DEUX verrous rendus.
    await pTiers.liberer(cheminVerrouEntretien(verrouNatif))
    await max.tx.supprimerEntretien('ent-deux-postes')
    c = await corpusServeur(base)
    expect(c.membership['ent-deux-postes']).toBeUndefined()
    const clientMaxLecture = new ClientWebDAV({ baseUrl: davMax, identifiants: MAX })
    await expect(clientMaxLecture.getTexte('entretiens/ent-deux-postes.json')).rejects.toMatchObject({ statut: 404 })
    expect(await clientMaxLecture.getTexte('corbeille/ent-deux-postes.json')).toContain('formatVersion')
    const verrousRestants = (await clientMaxLecture.propfind('verrous')).map((v) => v.chemin)
    expect(verrousRestants).not.toContain('corpus.lock.json')
    if (verrouNatif) {
      // Variante A : plus aucun cadenas natif sur le fichier (déplacé ou non).
      expect(await clientMaxLecture.etatVerrouNatif('entretiens/ent-deux-postes.json')).toBeNull()
    } else {
      await expect(pTiers.etat('verrous/ent-deux-postes.lock.json')).resolves.toBeNull()
    }
  } finally {
    await nettoyer(base, original)
  }
}

describe.skipIf(!pileAPrete)('Scénario deux postes — pile A réelle (variante A pour le verrou entretien)', () => {
  it(
    'pulls séparés → transactions concurrentes coexistent → refus nominatif → suppression double verrou',
    { timeout: 120_000 },
    async () => {
      await jouerScenarioDeuxPostes(BASE_A, true)
    },
  )
})

describe.skipIf(!pileBPrete)('Scénario deux postes — pile B réelle (variante B partout)', () => {
  it(
    'pulls séparés → transactions concurrentes coexistent → refus nominatif → suppression double verrou',
    { timeout: 120_000 },
    async () => {
      await jouerScenarioDeuxPostes(BASE_B, false)
    },
  )
})
