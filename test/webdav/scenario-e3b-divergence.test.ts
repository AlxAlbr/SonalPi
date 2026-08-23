/**
 * SCÉNARIO de divergence/fusion contre les Nextcloud DOCKER réels —
 * le cycle complet de la DIVERGENCE à la FUSION assistée, à deux postes :
 *
 *   Poste MAX tient le verrou entretien et travaille localement ; un TIERS
 *   contourne le verrou (écriture « UI web ») ; la publication de max finit
 *   en 412 → RÉTROGRADATION avec copie de divergence mise de côté HORS
 *   serveur. Puis :
 *
 *   1. l'API copies de divergence liste/lit la copie (= la version LOCALE,
 *      jamais celle du serveur) ;
 *   2. la FUSION : le texte est identique des deux côtés → fusion
 *      automatique proposée — les apports de la copie (annotation de max)
 *      rejoignent la version serveur (qui porte celle du tiers) — JAMAIS de
 *      merge de texte, JAMAIS d'écrasement ;
 *   3. reprise sous verrou (après « Abandonner » sur le verrou résiduel de la
 *      session dégradée), publication de la fusion → le serveur porte LES
 *      DEUX annotations ; copie jetée explicitement ;
 *   4. réconciliation POST-PULL : une règle corpus
 *      poussée par olivier PENDANT la session apparaît au prochain tirage —
 *      la ligne locale (brouillon « St-Anne ») diverge de la règle (« HSA »)
 *      → détectée, matière du dialogue « Aligner / Garder les deux ».
 *
 * Joué contre LA MÊME trame sur la pile A (files_lock → variante A pour le
 * verrou ENTRETIEN) ET la pile B (sans plugin → variante B). Skippé si une
 * pile ne répond pas (npm run nc:up / nc-b:up + nc(:b):provision).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { SessionsDEntretien, type IdentiteSession } from '../../src/main/distant/sessions'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import {
  corpsIdentiques,
  fusionnerEntretiens,
} from '../../src/shared/entretien/fusion'
import { detecterDivergencesPortee } from '../../src/shared/entretien/anon/reconciliation'
import { lignesAnonUnifiees } from '../../src/shared/entretien/anon/brouillonsAnon'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'

const ID = 'ent-div-e3b'
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

/* ── Amorce : état initial connu, auto-porteur, relançable ──────────────────*/

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Scénario E3b divergence',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      [ID]: { titre: 'Entretien divergence', date: null, lastModified: '2026-01-01T00:00:00Z' },
    },
  }
  return JSON.stringify(c, null, 2)
}

/** Texte IDENTIQUE dans toutes les versions — c'est la garde de la fusion
 *  automatique : on ne fusionne jamais deux textes différents. */
const CORPS = {
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Bonjour Hopital Saint-Anne.' }] }],
}

function entretien(partiel: Partial<EntretienFichier>): string {
  const f: EntretienFichier = {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: CORPS,
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    ...partiel,
  }
  return JSON.stringify(f)
}

interface Poste {
  client: ClientWebDAV
  miroir: MiroirWebDAV
  store: CorpusStore
  tx: TransactionsCorpus
}

function creerPoste(baseUrlDav: string, identifiants: { utilisateur: string; motDePasse: string }, idSession: string, verrouNatif: boolean): Poste {
  const client = new ClientWebDAV({ baseUrl: baseUrlDav, identifiants })
  const identite: () => IdentiteSession = () => ({
    userId: identifiants.utilisateur,
    machineId: `poste-${identifiants.utilisateur}`,
    sessionId: idSession,
  })
  const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), `sonal-e3b-${identifiants.utilisateur}-`)))
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true
  const tx = new TransactionsCorpus(client, miroir, () => store, identite, { verrouNatif })
  return { client, miroir, store, tx }
}

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
  await client.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await client.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
  // État de données initial connu : membership avec UN entretien + son fichier.
  await client.putTexte('corpus.json', corpusInitial())
  await client.putTexte(`entretiens/${ID}.json`, entretien({}))
  return { original }
}

/** Restaure l'état d'avant le scénario. */
async function nettoyer(base: string, original: string | null): Promise<void> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  if (original !== null) await client.putTexte('corpus.json', original).catch(() => {})
  else await client.supprimer('corpus.json').catch(() => {})
  await client.supprimer(`entretiens/${ID}.json`).catch(() => {})
  await client.supprimer(`verrous/${ID}.lock.json`).catch(() => {})
  await client.supprimer('verrous/corpus.lock.json').catch(() => {})
  await client.deverrouiller(`entretiens/${ID}.json`).catch(() => {})
}

async function entretienServeur(base: string): Promise<EntretienFichier> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  return JSON.parse(await client.getTexte(`entretiens/${ID}.json`)) as EntretienFichier
}

/* ── LA TRAME commune — identique sur les deux piles ───────────────────────*/

async function jouerScenarioDivergenceE3b(base: string, verrouNatif: boolean): Promise<void> {
  const davMax = `${base}/remote.php/dav/files/max/MonCorpus`
  const davOlivier = `${base}/remote.php/dav/files/olivier/MonCorpus`
  const { original } = await amorcerServeur(base)
  try {
    const max = creerPoste(davMax, MAX, 's-MAX-E3B', verrouNatif)

    // 0. Max ouvre le corpus distant puis SA SESSION d'écriture.
    await max.miroir.tirer()
    const retrogrades: string[] = []
    const sessions = new SessionsDEntretien(
      max.client,
      max.miroir,
      () => ({ userId: 'max', machineId: 'poste-max', sessionId: 's-MAX-E3B' }),
      (id) => retrogrades.push(id),
      undefined,
      { verrouNatif },
    )
    expect((await sessions.ouvrir(ID)).etat).toBe('a-nous')

    // 1. Édition locale de max : une annotation anon + un brouillon + une
    //    valeur EAV. Le TEXTE ne bouge pas (garde de fusion).
    writeFichierLocal(max.miroir.dirLocal, entretien({
      annotations: [{ id: 'anno-max', type: 'anon', from: 2, to: 21, auteur: 'max', pseudo: 'St-Anne' }],
      brouillonsAnon: [{ entite: 'Hopital Saint-Anne', pseudo: 'St-Anne' }],
      meta: { valeursGen: { 'var-lieu': 'mod-max' }, audioRef: null },
    }))
    sessions.noterSale(ID)

    // 2. CONTOURNEMENT DU VERROU par le tiers (« UI web ») :
    //    - variante A : le filet files_lock rend la mort — l'écriture du
    //      tiers sous NOTRE verrou est REFUSÉE 423 ; il faut
    //      d'abord que le verrou saute (déverrouillage admin forcé),
    //    - variante B : rien n'empêche l'écriture directe.
    const clientOlivier = new ClientWebDAV({
      baseUrl: davOlivier,
      identifiants: OLIVIER,
    })
    const versionOlivier = entretien({
      annotations: [{ id: 'anno-olivier', type: 'anon', from: 2, to: 21, auteur: 'olivier', pseudo: 'HSA' }],
    })
    if (verrouNatif) {
      await expect(clientOlivier.putTexte(`entretiens/${ID}.json`, versionOlivier)).rejects.toMatchObject({ statut: 423 })
      await max.client.deverrouiller(`entretiens/${ID}.json`) // le verrou saute
    }
    await clientOlivier.putTexte(`entretiens/${ID}.json`, versionOlivier)

    // 3. Publication de max → 412 → RÉTROGRADATION, copie mise de côté.
    const r = await sessions.publier(ID)
    expect(r).toEqual({ ok: false, raison: 'divergence' })
    expect(retrogrades).toEqual([ID])
    expect(sessions.etat(ID).etat).toBe('aucune')

    // 4. L'API copies de divergence : la copie existe, identifiée, et
    //    son contenu est LA VERSION LOCALE de max (pas celle du serveur).
    const copies = sessions.listerDivergences()
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ id: ID, sessionId: 's-MAX-E3B' })
    const copie = sessions.lireDivergence(copies[0].chemin) as EntretienFichier
    expect(copie.annotations.map((a) => a.id)).toEqual(['anno-max'])
    expect(copie.meta.valeursGen['var-lieu']).toBe('mod-max')

    // 5. FUSION : tirer la version serveur (celle du tiers), vérifier la
    //    garde « même texte », fusionner — les apports de la copie s'ajoutent,
    //    ceux du serveur sont conservés. JAMAIS d'écrasement.
    await max.miroir.tirer()
    const courant = lireFichierLocal(max.miroir.dirLocal)
    expect(courant.annotations.map((a) => a.id)).toEqual(['anno-olivier'])
    expect(corpsIdentiques(courant.corpsTexte, copie.corpsTexte)).toBe(true)
    const { fusion, ajouts } = fusionnerEntretiens(courant, copie)
    expect(ajouts.annotations).toBe(1)
    expect(ajouts.valeurs).toBeGreaterThanOrEqual(1)
    expect(fusion.annotations.map((a) => a.id).sort()).toEqual(['anno-max', 'anno-olivier'])

    // 6. REPRISE sous verrou : le verrou résiduel de la session dégradée est
    //    d'abord ABANDONNÉ (choix du dialogue de reprise), puis ré-acquis.
    const cheminVerrou = verrouNatif ? `entretiens/${ID}.json` : `verrous/${ID}.lock.json`
    await sessions.abandonnerOrphelin(cheminVerrou)
    expect((await sessions.ouvrir(ID)).etat).toBe('a-nous')

    // 7. La fusion est écrite localement puis PUBLIÉE : le serveur porte LES
    //    DEUX annotations — ni le travail de max ni celui du tiers n'est perdu.
    writeFichierLocal(max.miroir.dirLocal, JSON.stringify(fusion))
    sessions.noterSale(ID)
    expect(await sessions.publier(ID)).toEqual({ ok: true })
    const apresFusion = await entretienServeur(base)
    expect(apresFusion.annotations.map((a) => a.id).sort()).toEqual(['anno-max', 'anno-olivier'])

    // 8. La copie absorbée est JETÉE explicitement (jamais automatique).
    sessions.supprimerDivergence(copies[0].chemin)
    expect(sessions.listerDivergences()).toEqual([])

    // 9. Fermeture dans l'ordre invariant : plus aucun verrou résiduel.
    await sessions.fermer(ID)
    if (verrouNatif) {
      expect(await max.client.etatVerrouNatif(`entretiens/${ID}.json`)).toBeNull()
    } else {
      await expect(max.client.getTexte(`verrous/${ID}.lock.json`)).rejects.toMatchObject({ statut: 404 })
    }

    /* ── Réconciliation POST-PULL ─────────────────────────────────────────*/
    // Les lignes locales sont calculées AVANT le tirage (règles absentes).
    const lignesAvantPull = lignesAnonUnifiees(copie.brouillonsAnon ?? [], [], () => '', {}, [])
    expect(lignesAvantPick(lignesAvantPull)).toBe(true)

    // Oliviers pousse une RÈGLE CORPUS pendant la session (transaction).
    const olivier = creerPoste(davOlivier, OLIVIER, 's-OLI-E3B', verrouNatif)
    await olivier.miroir.tirer()
    const resultat = await olivier.tx.executer(() =>
      olivier.store.regleAnonCreer('Hopital Saint-Anne', ['HSA']),
    )
    const regle = resultat.regle
    expect(regle.pseudos).toContain('HSA')

    // Au prochain tirage de max, la règle apparaît : la ligne locale
    // (brouillon « St-Anne ») est désormais régie par une règle aux pseudos
    // DIFFÉRENTS → divergence de portée détectée, matière du dialogue.
    await max.miroir.tirer()
    const divergences = detecterDivergencesPortee(lignesAvantPull, max.store.reglesAnon())
    expect(divergences).toHaveLength(1)
    expect(divergences[0].cas).toBe('brouillon')
    expect(divergences[0].pseudosLocaux).toEqual(['St-Anne'])
    expect(divergences[0].reglePseudos).toContain('HSA')

    // Et une fois ALIGNÉE (pseudo de la règle appliqué), elle ne diverge plus.
    const alignees = lignesAvantPull.map((l) => ({ ...l, pseudo: 'HSA' }))
    expect(detecterDivergencesPortee(alignees, max.store.reglesAnon())).toHaveLength(0)
  } finally {
    await nettoyer(base, original)
  }
}

/** La ligne attendue : un brouillon standalone, pseudo local « St-Anne ». */
function lignesAvantPick(lignes: { etat: string; pseudo: string }[]): boolean {
  return lignes.length === 1 && lignes[0].etat === 'brouillon' && lignes[0].pseudo === 'St-Anne'
}

/* ── Accès disque du poste (le miroir vit hors serveur) ─────────────────────*/

function cheminLocal(dirLocal: string): string {
  return join(dirLocal, 'entretiens', `${ID}.json`)
}
function writeFichierLocal(dirLocal: string, contenu: string): void {
  writeFileSync(cheminLocal(dirLocal), contenu, 'utf8')
}
function lireFichierLocal(dirLocal: string): EntretienFichier {
  return JSON.parse(readFileSync(cheminLocal(dirLocal), 'utf8')) as EntretienFichier
}

describe.skipIf(!pileAPrete)('Scénario E3b divergence→fusion — pile A réelle (variante A)', () => {
  it(
    'contournement 423 puis divergence 412 → copie listée/lue → fusion publiée → I-POR-3 post-pull',
    { timeout: 120_000 },
    async () => {
      await jouerScenarioDivergenceE3b(BASE_A, true)
    },
  )
})

describe.skipIf(!pileBPrete)('Scénario E3b divergence→fusion — pile B réelle (variante B)', () => {
  it(
    'contournement direct → divergence 412 → copie listée/lue → fusion publiée → I-POR-3 post-pull',
    { timeout: 120_000 },
    async () => {
      await jouerScenarioDivergenceE3b(BASE_B, false)
    },
  )
})
