/**
 *  Banc de conformité de la PUBLICATION contre le Nextcloud DOCKER réel — même
 *  discipline que contrat-nextcloud.test.ts : l'abstraction est testée contre un
 *  backend qui n'a pas été écrit pour elle.
 *
 *  SKIPPÉ AUTOMATIQUEMENT si les piles ne répondent pas :
 *   npm run nc:up      (pile A : NC31 + files_lock)
 *   npm run nc-b:up    (pile B : NC29 sans files_lock)
 *
 *  Ce que le serveur mémoire ne peut pas prouver ici :
 *   - la chaîne de MKCOL réelle (un MKCOL Nextcloud refuse sans parent → 409,
 *     et les préfixes techniques ne sont pas adressables du tout),
 *   - la garde If-None-Match:* réelle sur un PUT concurrent,
 *   - le partage réel : le dossier doit être partagé à l'invité pour être
 *     visible de son propre chemin DAV (sinon existence masquée, 404).
 */

import { describe, expect, it } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { profilerServeur } from '../../src/main/webdav/sondes'
import { PublieurCorpus, ErreurDejaCorpus } from '../../src/main/distant/publication'

const BASE = 'http://localhost:8080' // pile A : NC31 + files_lock
const BASE_B = 'http://localhost:8081' // pile B : NC29 SANS files_lock
const MAX = { utilisateur: 'max', motDePasse: 'max-max-1234' }
const OLIVIER = { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' }

const pret = (base: string): Promise<boolean> =>
  fetch(`${base}/status.php`, { signal: AbortSignal.timeout(800) })
    .then((r) => r.ok)
    .catch(() => false)
const serveurPret: boolean = await pret(BASE)
const serveurBPret: boolean = await pret(BASE_B)

/** Dossier cible UNIQUE par exécution (l'état serveur persiste entre les runs) ;
 *  imbriqué pour prouver la chaîne de MKCOL parent-d'abord. Le nom de FEUILLE
 *  est aussi unique : Nextcloud monte le partage chez olivier sous le basename
 *  du dossier, jamais dans le chemin imbriqué d'origine. */
const TS = Date.now()
const CIBLE = `/remote.php/dav/files/max/Creation-${TS}/SousDossier/Corpus-${TS}`

async function nettoyer(base: string): Promise<void> {
  try {
    await new ClientWebDAV(
      { baseUrl: `${base}/remote.php/dav/files/max`, identifiants: MAX },
    ).supprimer(`Creation-${CIBLE.split('Creation-')[1].split('/')[0]}`)
  } catch {
    /* best effort : le banc suivant recréera une cible datée */
  }
}

/** Scénario complet, joué sur CHAQUE pile (variante A ET variante B). */
async function scenarioPublication(base: string) {
  const config = { baseUrl: `${base}${CIBLE}`, identifiants: MAX }

  const publieur = new PublieurCorpus(config)

  // La sonde écrit dans la cible : ses dossiers doivent déjà exister.
  await publieur.preparerRacine()

  // 2. Préconditions réelles, mesurées sur une cible qui existe désormais.
  const profil = await profilerServeur(new ClientWebDAV(config))
  expect(profil.preconditions, profil.notes?.join(' ; ')).toBe(true)

  // 3. Création sur cible imbriquée : dossiers techniques + corpus.crp gardé.
  await publieur.publierSquelette('Terrain P3')

  const client = new ClientWebDAV(config)
  const contenu = JSON.parse(await client.getTexte('corpus.crp')) as { nom?: string }
  expect(contenu.nom).toBe('Terrain P3')
  const dossiers = (await client.propfind('')).filter((e) => e.dossier).map((e) => e.chemin)
  expect(dossiers).toEqual(
    expect.arrayContaining(['entretiens', 'verrous', 'presence', 'corbeille']),
  )

  // 2. Garde réelle : republication → 412 traduit en ErreurDejaCorpus.
  await expect(publieur.publierSquelette('Autre')).rejects.toBeInstanceOf(ErreurDejaCorpus)

  // 3. Le créateur PARTAGE le dossier à olivier (geste Nextcloud hors app :
  //    l'application ne partage pas toute seule), puis olivier ouvre le corpus
  //    par son propre chemin DAV. Sans partage → existence masquée (404).
  const cheminRelatif = CIBLE.split('/files/max/')[1]
  const partage = await fetch(`${base}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
    method: 'POST',
    headers: {
      'OCS-APIRequest': 'true',
      Authorization: 'Basic ' + Buffer.from(`${MAX.utilisateur}:${MAX.motDePasse}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ path: `/${cheminRelatif}`, shareType: '0', shareWith: OLIVIER.utilisateur }),
  })
  expect(partage.ok, `partage impossible : ${partage.status}`).toBe(true)

  // Le partage est monté chez olivier sous le BASENAME du dossier partagé,
  // à sa racine fichiers — jamais dans le chemin imbriqué d'origine.
  const clientOlivier = new ClientWebDAV({
    baseUrl: `${base}/remote.php/dav/files/olivier/Corpus-${TS}`,
    identifiants: OLIVIER,
  })
  const vuParOlivier = JSON.parse(await clientOlivier.getTexte('corpus.crp')) as {
    nom?: string
  }
  expect(vuParOlivier.nom).toBe('Terrain P3')
}

describe.skipIf(!serveurPret)('Publication réelle — pile A (NC31 + files_lock)', () => {
  it(
    'création imbriquée + garde déjà-corpus + visible du second compte',
    { timeout: 60_000 },
    async () => {
      await scenarioPublication(BASE)
      await nettoyer(BASE)
    },
  )
})

describe.skipIf(!serveurBPret)('Publication réelle — pile B (NC29 sans files_lock)', () => {
  it(
    'création imbriquée + garde déjà-corpus + visible du second compte',
    { timeout: 60_000 },
    async () => {
      await scenarioPublication(BASE_B)
      await nettoyer(BASE_B)
    },
  )
})
