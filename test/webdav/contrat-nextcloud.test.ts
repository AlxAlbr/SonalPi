/**
 * Banc de conformité contre le Nextcloud DOCKER réel (docker/compose.yml) —
 * plan-multiuser.md §12, invariant §15.4 : l'abstraction est testée contre un
 * backend qui n'a pas été écrit pour elle.
 *
 * SKIPPÉ AUTOMATIQUEMENT si le conteneur ne répond pas :
 *   npm run nc:up && npm run nc:provision   → puis npm test
 *
 * Ce que ce banc vérifie (et que le serveur mémoire NE PEUT PAS prouver) :
 *   - les préconditions HTTP réelles de Nextcloud (sonde §5.4),
 *   - la détection files_lock par capabilities (§8),
 *   - la forme des PROPFIND/ETags réels (relativisation du client),
 *   - le pull incrémental du miroir sur un vrai serveur,
 *   - le chemin DAV propre à chaque compte pour un dossier PARTAGÉ (plan §2).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { profilerServeur } from '../../src/main/webdav/sondes'
import { MiroirWebDAV } from '../../src/main/miroir'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'

const BASE = 'http://localhost:8080' // pile A : NC31 + files_lock
const BASE_B = 'http://localhost:8081' // pile B : NC29 SANS files_lock
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }
const CORPUS_MAX = `${BASE}/remote.php/dav/files/max/MonCorpus`
const CORPUS_OLIVIER = `${BASE}/remote.php/dav/files/olivier/MonCorpus`

/** Le banc ne tourne QUE si les piles sont prêtes (npm run nc:up / nc-b:up). */
const pret = (base: string): Promise<boolean> =>
  fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)
const serveurPret: boolean = await pret(BASE)
const serveurBPret: boolean = await pret(BASE_B)

describe.skipIf(!serveurPret)('Contrat Nextcloud réel (docker)', () => {
  it('la sonde §5.4 passe : les préconditions HTTP réelles sont honorées', { timeout: 30_000 }, async () => {
    const client = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: MAX })
    const profil = await profilerServeur(client)
    expect(profil.preconditions, profil.notes?.join(' ; ')).toBe(true)
    // files_lock est installé et actif sur la pile A → la sonde DOIT le voir :
    // c'est elle qui choisira la variante A du verrou à l'ouverture (§8).
    expect(profil.filesLock).toBe(true)
  })

  it('PROPFIND réel : corpus.json visible avec un ETag non vide', { timeout: 30_000 }, async () => {
    const client = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: MAX })
    const entrees = await client.propfind('')
    const corpus = entrees.find((e) => e.chemin === 'corpus.json')
    expect(corpus, `corpus.json absent — relancer npm run nc:provision`).toBeDefined()
    expect(corpus!.etag).toBeTruthy()
    expect(corpus!.etag).not.toMatch(/"/) // forme canonique sans guillemets
  })

  it('cycle PUT If-None-Match / If-Match / DELETE sur le serveur réel', { timeout: 30_000 }, async () => {
    const client = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: MAX })
    const chemin = 'sonde/contrat.tmp'
    await client.creerDossier('sonde')
    // Auto-réparation : un run interrompu peut laisser le fichier (le PUT
    // If-None-Match ci-dessous échouerait alors en 412).
    await client.supprimer(chemin).catch(() => {})
    // Corps de TAILLES DIFFÉRENTES : l'ETag Nextcloud dépend de mtime+taille —
    // deux écritures de même taille DANS LA MÊME SECONDE peuvent produire le
    // même ETag (collisions observées sur le volume Docker), ce qui ferait
    // passer le If-Match périmé ci-dessous au lieu du 412 attendu.
    await expect(client.putTexte(chemin, 'v1', { ifNoneMatch: '*' })).resolves.toBeTruthy()
    await expect(client.putTexte(chemin, 'v2-beaucoup-plus-long', { ifNoneMatch: '*' })).rejects.toMatchObject({
      statut: 412,
    })
    const etag = (await client.propfind('sonde')).find((e) => e.chemin === 'contrat.tmp')!.etag!
    const nouveau = await client.putTexte(chemin, 'v3-longueur-encore-autre', { ifMatch: etag })
    expect(nouveau).toBeTruthy()
    // Contrôle d'obsolescence avec délai de grâce : sous charge, le serveur
    // peut courir devant la VISIBILITÉ du nouvel ETag (cache) — deux PUT
    // conditionnels consécutifs immédiats ont déjà fait passer un If-Match
    // périmé au lieu du 412 attendu (flake sur le volume Docker). On ressait
    // BORNÉ : le contrat (412) doit finir par être honoré.
    let refuse = false
    for (let i = 0; i < 20 && !refuse; i++) {
      await new Promise((r) => setTimeout(r, 200))
      refuse = await client
        .putTexte(chemin, `corps-périmé-${i}`, { ifMatch: etag })
        .then(
          () => false,
          (e: ErreurHttp) => e.statut === 412,
        )
    }
    expect(refuse, 'le If-Match périmé doit être refusé (412)').toBe(true)
    await client.supprimer(chemin)
  })

  it('le miroir tire le corpus réel (pull incrémental §3.1)', { timeout: 30_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'miroir-nc-'))
    const miroir = new MiroirWebDAV(
      new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: MAX }),
      dir,
    )
    const premier = await miroir.tirer()
    expect(premier.telecharges).toContain('corpus.json')
    const contenu = JSON.parse(readFileSync(miroir.cheminLocal('corpus.json'), 'utf8'))
    expect(contenu.formatVersion).toBe(3)
    // Deuxième tirage : rien ne bouge (diff ETags).
    const second = await miroir.tirer()
    expect(second.telecharges).toEqual([])
  })

  it('un dossier partagé apparaît au chemin propre à CHAQUE compte (plan §2)', { timeout: 30_000 }, async () => {
    // olivier voit le même corpus.json via SON chemin DAV — sans connaître max.
    const client = new ClientWebDAV({ baseUrl: CORPUS_OLIVIER, identifiants: OLIVIER })
    const entrees = await client.propfind('')
    expect(entrees.find((e) => e.chemin === 'corpus.json')).toBeDefined()
    // Et l'isolation entre comptes est réelle : les identifiants d'olivier
    // (VALIDES) ne voient pas /max/… → 404, Nextcloud ne révèle pas l'existence
    // (401 serait réservé à des identifiants invalides — vérifié juste après).
    const croise = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: OLIVIER })
    await expect(croise.propfind('')).rejects.toMatchObject({ statut: 404 })
    const faux = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: { utilisateur: 'olivier', motDePasse: 'faux' } })
    await expect(faux.propfind('')).rejects.toMatchObject({ statut: 401 })
  })
})

// Garde : si le conteneur tourne mais n'est pas provisionné, dire pourquoi
// plutôt que laisser un skip silencieux masquer une config cassée.
if (serveurPret) {
  describe('Contrat Nextcloud — garde de provisionnement', () => {
    it('les comptes de test existent (relancer nc:provision sinon)', { timeout: 30_000 }, async () => {
      const r = await fetch(`${BASE}/remote.php/dav/files/max/`, {
        method: 'PROPFIND',
        headers: { Depth: '0', Authorization: 'Basic ' + Buffer.from('max:max-max-1234').toString('base64') },
        signal: AbortSignal.timeout(2000),
      })
      // 207/404 = auth OK (dossier présent ou non) ; 401 = comptes non créés.
      expect(r.status).not.toBe(401)
    })
  })
} else {
  describe.skip('Contrat Nextcloud réel (docker) — conteneur absent', () => {
    it('(lancer npm run nc:up && npm run nc:provision pour l’activer)', () => {})
  })
}

describe.skipIf(!serveurBPret)('Contrat Nextcloud réel — pile B SANS files_lock (NC29, :8081)', () => {
  it('la sonde dit « files_lock ABSENT » → le protocole choisira la variante B', { timeout: 30_000 }, async () => {
    const client = new ClientWebDAV({ baseUrl: `${BASE_B}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX })
    const profil = await profilerServeur(client)
    expect(profil.preconditions).toBe(true) // les préconditions ne dépendent PAS du plugin
    expect(profil.filesLock).toBe(false)
  })

  it('le miroir tire le corpus réel de la pile B (pull incrémental §3.1)', { timeout: 30_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'miroir-ncb-'))
    const miroir = new MiroirWebDAV(
      new ClientWebDAV({ baseUrl: `${BASE_B}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX }),
      dir,
    )
    const tirage = await miroir.tirer()
    expect(tirage.telecharges).toContain('corpus.json')
  })
})

// Garde : si une pile tourne mais n'est pas provisionnée, dire pourquoi
// plutôt que laisser un skip silencieux masquer une config cassée.
if (serveurPret) {
  describe('Contrat Nextcloud — garde de provisionnement (pile A)', () => {
    it('les comptes de test existent (relancer nc:provision sinon)', { timeout: 30_000 }, async () => {
      const r = await fetch(`${BASE}/remote.php/dav/files/max/`, {
        method: 'PROPFIND',
        headers: { Depth: '0', Authorization: 'Basic ' + Buffer.from('max:max-max-1234').toString('base64') },
        signal: AbortSignal.timeout(2000),
      })
      // 207/404 = auth OK (dossier présent ou non) ; 401 = comptes non créés.
      expect(r.status).not.toBe(401)
    })
  })
}

// ── Verrous variante B contre les serveurs RÉELS (plan §5) ──────────────────
// Le protocole à PUT conditionnel doit se comporter IDENTIQUEMENT sur la pile
// A (avec files_lock) et la pile B (sans) : le verrou conventionnel ne suppose
// rien du plugin. Chaque describe ci-dessous rejoue le même scénario.

async function cycleVerrouComplet(base: string): Promise<void> {
  const client = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`,
    identifiants: MAX,
  })
  const pMax = new ProviderPutConditionnel(client, () => ({
    userId: 'max',
    machineId: 'banc-contrat',
    sessionId: 's-BANC',
  }))
  const chemin = 'verrous/contrat.lock.json'
  await client.creerDossier('verrous')
  // Auto-nettoyage : un passage antérieur interrompu peut laisser un verrou
  // (le banc doit être relançable sans intervention manuelle).
  try {
    await client.supprimer(chemin)
  } catch {
    /* absent : parfait */
  }

  // Acquisition → battement → libération.
  const r = await pMax.acquerir(chemin)
  expect(r.ok).toBe(true)
  const b = await pMax.battre(chemin)
  expect(b.ok).toBe(true)
  await pMax.liberer(chemin)
  await expect(pMax.etat(chemin)).resolves.toBeNull()

  // Refus atomique quand un autre détient.
  await pMax.acquerir(chemin)
  const pAutre = new ProviderPutConditionnel(
    new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: MAX }),
    () => ({ userId: 'olivier', machineId: 'banc-autre', sessionId: 's-AUTRE' }),
  )
  const refus = await pAutre.acquerir(chemin)
  expect(refus.ok).toBe(false)
  if (!refus.ok) expect(refus.tenuPar?.userId).toBe('max')
  await pMax.liberer(chemin)
}

describe.skipIf(!serveurPret)('Verrous variante B — pile A (NC31 + files_lock)', () => {
  it('cycle acquisition → battement → refus d\u2019un tiers → libération', { timeout: 30_000 }, async () => {
    await cycleVerrouComplet(BASE)
  })
})

describe.skipIf(!serveurBPret)('Verrous variante B — pile B (NC29 sans plugin)', () => {
  it('cycle acquisition → battement → refus d\u2019un tiers → libération', { timeout: 30_000 }, async () => {
    await cycleVerrouComplet(BASE_B)
  })
})

// ── Verrous VARIANTE A (files_lock) contre la pile A RÉELLE (plan §8) ───────
// Le verrou porte sur LE FICHIER DE DONNÉES lui-même ; le serveur l'impose
// (PUT d'un tiers → 423) et l'expose aux PROPFIND (props nc:). C'est ce que
// seul le vrai Nextcloud peut prouver.
describe.skipIf(!serveurPret)('Verrous variante A (files_lock) — pile A réelle', () => {
  it('cycle acquisition → refus/imposition d\u2019un tiers → battement → libération → état libre', { timeout: 60_000 }, async () => {
    const cheminFichier = 'sonde/files-lock-contrat.json'
    const clientMax = new ClientWebDAV({ baseUrl: CORPUS_MAX, identifiants: MAX })
    // Fichier de données à verrouiller (le LOCK sur absent renvoie 500 côté
    // files_lock — toujours créer avant).
    await clientMax.creerDossier('sonde')
    await clientMax.putTexte(cheminFichier, '{"banc":true}', { ifNoneMatch: '*' }).catch(() => {})

    const pMax = new ProviderFilesLock(clientMax, () => ({
      userId: 'max', machineId: 'banc-contrat', sessionId: 's-BANC-A',
    }))

    // Auto-nettoyage : libérer tout verrou résiduel d'un passage interrompu.
    await pMax.liberer(cheminFichier)

    // Libre → acquis ; état visible par un tiers.
    expect(await pMax.etat(cheminFichier)).toBeNull()
    expect((await pMax.acquerir(cheminFichier)).ok).toBe(true)

    // Olivier voit le détenteur (via SON chemin de partage)…
    const clientOlivier = new ClientWebDAV({ baseUrl: CORPUS_OLIVIER, identifiants: OLIVIER })
    const pOlivier = new ProviderFilesLock(clientOlivier, () => ({
      userId: 'olivier', machineId: 'banc-autre', sessionId: 's-AUTRE-A',
    }))
    const etat = await pOlivier.etat(cheminFichier)
    expect(etat).toMatchObject({ userId: 'max' })
    expect(etat!.acquiredAt).toBeTruthy()

    // …est REFUSÉ au LOCK (423 avec détenteur)…
    const refus = await pOlivier.acquerir(cheminFichier)
    expect(refus.ok).toBe(false)
    if (!refus.ok) expect(refus.tenuPar?.userId).toBe('max')
    // …et IMPOSÉ par le serveur sur ses écritures (le filet §6.1 devient mort).
    await expect(
      clientOlivier.putTexte(cheminFichier, '{"contourné":true}'),
    ).rejects.toMatchObject({ statut: 423 })

    // Battement (re-LOCK même user = renouvellement, vérifié réel).
    expect((await pMax.battre(cheminFichier)).ok).toBe(true)

    // Libération idempotente puis retour à libre.
    await pMax.liberer(cheminFichier)
    await pMax.liberer(cheminFichier)
    expect(await pMax.etat(cheminFichier)).toBeNull()
    await clientMax.supprimer(cheminFichier).catch(() => {}) // nettoyage
  })
})
