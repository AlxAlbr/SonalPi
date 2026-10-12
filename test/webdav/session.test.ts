/**
 * Tests de la SESSION d'écriture contre le serveur
 * WebDAV embarqué : acquisition/refus, publication sous garde If-Match,
 * ordre publier-puis-déverrouiller, battement raté → rétrogradation.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroirWebDAV'
import { SessionsDEntretien, type IdentiteSession } from '../../src/main/distant/sessions'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import type { PayloadEntretien } from '../../src/shared/format'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

const ID = 'ent-abc'

function banc(options: { maintenant?: () => number } = {}) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.json', corpusDistantValide([ID]))
  serveur.poser(`${'entretiens'}/${ID}.json`, entretienDistantValide({ lastModified: 'v1', texte: '' }))
  const dirMiroir = mkdtempSync(join(tmpdir(), 'session-'))
  const panne = {
    lecture: false,
    attendreLecture: null as Promise<void> | null,
    lectureCommencee: null as (() => void) | null,
    publication: false,
    publicationAppliqueePuisPerdue: false,
    liberation: false,
    attendrePublication: null as Promise<void> | null,
    publicationCommencee: null as (() => void) | null,
    battement: false,
  }
  const fetch: typeof serveur.fetch = async (entree, init) => {
    const requete = new Request(entree, init)
    const chemin = new URL(requete.url).pathname
    if (requete.method === 'GET' && chemin.endsWith(`/entretiens/${ID}.json`)) {
      panne.lectureCommencee?.()
      if (panne.attendreLecture) await panne.attendreLecture
      if (panne.lecture) return new Response('panne', { status: 503 })
    }
    if (requete.method === 'PUT' && chemin.endsWith(`/verrous/${ID}.lock.json`) && panne.battement) {
      return new Response('panne', { status: 503 })
    }
    if (requete.method === 'PUT' && chemin.endsWith(`/entretiens/${ID}.json`)) {
      panne.publicationCommencee?.()
      if (panne.attendrePublication) await panne.attendrePublication
      if (panne.publication) return new Response('panne', { status: 503 })
      if (panne.publicationAppliqueePuisPerdue) {
        await serveur.fetch(entree, init)
        throw new TypeError('réponse perdue')
      }
    }
    if (requete.method === 'DELETE' && chemin.endsWith(`/verrous/${ID}.lock.json`)) {
      if (panne.liberation) return new Response('panne', { status: 503 })
    }
    return serveur.fetch(entree, init)
  }
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    fetch,
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
    undefined,
    { maintenant: options.maintenant },
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
    panne,
  }
}

describe('Ouverture de session', () => {  it('verrou libre : acquis, le contenu SERVEUR est tiré dans le miroir', async () => {
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

  it("une erreur après acquisition libère le verrou ou garde l'état récupérable", async () => {
    const b = banc()
    await b.miroir.tirer()
    b.panne.lecture = true
    await expect(b.sessions.ouvrir(ID)).rejects.toThrow()
    expect(b.verrou()).toBeUndefined()

    b.panne.liberation = true
    await expect(b.sessions.ouvrir(ID)).rejects.toThrow()
    expect(b.verrou()).toBeTruthy()
    expect(b.sessions.etat(ID).etat).toBe('a-nous')

    b.panne.lecture = false
    b.panne.liberation = false
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
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

describe('Désignation audio distante — micro-session', () => {
  it('entretien FERMÉ : pose meta.audioDistant, publie, libère le verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    expect(b.verrou()).toBeUndefined()

    const r = await b.sessions.designerAudio(ID, 'audios/e1.mp3')
    expect(r.ok).toBe(true)
    // Le serveur porte la désignation, transport explicite…
    const serveur = JSON.parse(b.serveur.contenuDe(`entretiens/${ID}.json`)!) as {
      meta?: { audioDistant?: { chemin: string; fournisseur?: string } }
    }
    expect(serveur.meta?.audioDistant).toEqual({
      chemin: 'audios/e1.mp3',
      fournisseur: 'webdav',
    })
    // …et le verrou a bien été LIBÉRÉ (micro-session complète).
    expect(b.verrou()).toBeUndefined()
    // La copie locale du miroir aussi (elle servira au prochain pull audio).
    const local = JSON.parse(readFileSync(b.fichierLocal, 'utf8')) as {
      meta?: { audioDistant?: { chemin: string; fournisseur?: string } }
    }
    expect(local.meta?.audioDistant).toEqual({
      chemin: 'audios/e1.mp3',
      fournisseur: 'webdav',
    })
  })

  it("refuse la micro-session si l'entretien est déjà ouvert en édition", async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)

    const r = await b.sessions.designerAudio(ID, 'audios/e1.mp3')
    expect(r).toEqual({ ok: false, raison: 'session-active' })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).not.toContain('audioDistant')
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
  })

  it('construit la désignation depuis la version serveur post-verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    b.serveur.poser(
      `entretiens/${ID}.json`,
      JSON.stringify({
        lastModified: 'tiers',
        texte: 'version fraîche',
        meta: { valeursGen: { ville: 'lyon' }, audioRef: null },
      }),
    )

    expect(await b.sessions.designerAudio(ID, 'audios/e1.mp3')).toEqual({ ok: true })
    const publie = JSON.parse(b.serveur.contenuDe(`entretiens/${ID}.json`)!)
    expect(publie.texte).toBe('version fraîche')
    expect(publie.meta.valeursGen).toEqual({ ville: 'lyon' })
    expect(publie.meta.audioDistant).toEqual({
      chemin: 'audios/e1.mp3',
      fournisseur: 'webdav',
    })
    expect(b.verrou()).toBeUndefined()
  })

  it('verrou tenu par autrui : refus sans toucher ni serveur ni miroir', async () => {
    const b = banc()
    await b.miroir.tirer()
    const autres = new SessionsDEntretien(b.client, b.miroir, () => ({
      userId: 'olivier',
      machineId: 'poste-2',
      sessionId: 's-AUTRE',
    }))
    await autres.ouvrir(ID)

    const r = await b.sessions.designerAudio(ID, 'audios/e1.mp3')
    expect(r).toMatchObject({ ok: false, raison: 'tenu-par-autrui' })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).not.toContain('audioDistant')
  })

  it('échec certain de publication : restaure le miroir et libère sans republier', async () => {
    const b = banc()
    await b.miroir.tirer()
    const avant = readFileSync(b.fichierLocal, 'utf8')
    b.panne.publication = true

    await expect(b.sessions.designerAudio(ID, 'audios/e1.mp3')).rejects.toThrow()
    expect(readFileSync(b.fichierLocal, 'utf8')).toBe(avant)
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toBe(avant)
    expect(b.verrou()).toBeUndefined()
    expect(b.sessions.etat(ID)).toEqual({ etat: 'aucune' })
  })

  it('réponse perdue après le commit : reconnaît la publication avant de fermer', async () => {
    const b = banc()
    await b.miroir.tirer()
    b.panne.publicationAppliqueePuisPerdue = true

    await expect(b.sessions.designerAudio(ID, 'audios/e1.mp3')).resolves.toEqual({ ok: true })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('audioDistant')
    expect(readFileSync(b.fichierLocal, 'utf8')).toContain('audioDistant')
    expect(b.verrou()).toBeUndefined()
  })
})

describe('Publication', () => {
  it('publie le contenu local avec garde If-Match et note le nouvel ETag', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Édition locale (autosave) : le fichier miroir change côté disque…
    const etagServeurAvant = b.serveur.etagDe(`entretiens/${ID}.json`)!
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'modification locale' }))
    b.sessions.noterSale(ID)
    const r = await b.sessions.publier(ID)
    expect(r.ok).toBe(true)
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toBe(readFileSync(b.fichierLocal, 'utf8'))
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).not.toBe(etagServeurAvant)
    // Le manifeste connaît le NOUVEL ETag → un pull ne re-télécharge pas notre publication.
    const deuxiemeTirage = await b.miroir.tirer()
    expect(deuxiemeTirage.telecharges).toEqual([])
  })

  it('une modification arrivée pendant le PUT reste sale', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'première modification' }))
    b.sessions.noterSale(ID)
    let debloquer!: () => void
    b.panne.attendrePublication = new Promise<void>((resolve) => {
      debloquer = resolve
    })
    const commencee = new Promise<void>((resolve) => {
      b.panne.publicationCommencee = resolve
    })

    const publication = b.sessions.publier(ID)
    await commencee
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v3', texte: 'modification tardive' }))
    b.sessions.noterSale(ID)
    debloquer()
    expect(await publication).toEqual({ ok: true })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: true })

    b.panne.attendrePublication = null
    expect(await b.sessions.publier(ID)).toEqual({ ok: true })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: false })
  })

  it('réponse perdue après commit : confirme le contenu serveur et marque la session propre', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, JSON.stringify({ lastModified: 'v2', texte: 'hors ligne' }))
    b.sessions.noterSale(ID)
    b.panne.publicationAppliqueePuisPerdue = true

    await expect(b.sessions.publier(ID)).resolves.toEqual({ ok: true })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: false })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('hors ligne')
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
  })

  it('publication sans modifications : no-op (aucun trafic inutile)', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    const etag = b.serveur.etagDe(`entretiens/${ID}.json`)
    await b.sessions.publier(ID)
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).toBe(etag)
  })

  it('une autosave identique à sa base ne publie rien mais acquitte sa seule révision', async () => {
    const b = banc(); await b.miroir.tirer(); await b.sessions.ouvrir(ID)
    const etag = b.serveur.etagDe(`entretiens/${ID}.json`)
    b.sessions.noterSale(ID)
    expect(await b.sessions.publier(ID)).toEqual({ ok: true })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: false })
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).toBe(etag)
    await b.sessions.fermer(ID)
  })

  it('une modification pendant la vérification de base reste sale et intacte', async () => {
    const b = banc(); await b.miroir.tirer(); await b.sessions.ouvrir(ID); b.sessions.noterSale(ID)
    let liberer!: () => void
    b.panne.attendreLecture = new Promise<void>((resolve) => { liberer = resolve })
    const commencee = new Promise<void>((resolve) => { b.panne.lectureCommencee = resolve })
    const publication = b.sessions.publier(ID); await commencee
    const nouveau = entretienDistantValide({ lastModified: 'v2', texte: 'autosave plus récente' })
    writeFileSync(b.fichierLocal, nouveau); b.sessions.noterSale(ID); liberer()
    expect(await publication).toEqual({ ok: true })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: true })
    expect(readFileSync(b.fichierLocal, 'utf8')).toBe(nouveau)
    b.panne.attendreLecture = null
    expect(await b.sessions.publier(ID)).toEqual({ ok: true }); await b.sessions.fermer(ID)
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
    // …et l'état reste dégradé jusqu'à la fermeture explicite de l'entretien.
    expect(b.sessions.etat(ID).etat).toBe('degrade')
    expect(await b.sessions.ouvrir(ID)).toEqual({ etat: 'degrade' })
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })
})

describe('Fermeture — ordre invariant publier PUIS déverrouiller', () => {
  it('contenu sale : publication finale puis libération du verrou', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'première modification' }))
    b.sessions.noterSale(ID)
    await b.sessions.publier(ID)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v3', texte: 'dernière modification' }))
    b.sessions.noterSale(ID) // re-modification après publication
    await b.sessions.fermer(ID)
    expect(b.verrou()).toBeUndefined() // libéré
    // Le saut de ligne de transport n’altère aucune donnée du dernier état local.
    expect(JSON.parse(b.serveur.contenuDe(`entretiens/${ID}.json`)!)).toEqual(JSON.parse(readFileSync(b.fichierLocal, 'utf8')))
  })

  it('contenu non publié (jamais sale) : fermeture = simple libération', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.verrou()).toBeUndefined()
  })

  it('un échec de publication bloque la fermeture et reste récupérable', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'modification non publiée' }))
    b.sessions.noterSale(ID)
    b.panne.publication = true

    expect(await b.sessions.fermerToutes()).toMatchObject({
      fermees: [],
      bloquees: [{ id: ID, raison: 'publication' }],
    })
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: true })
    expect(b.verrou()).toBeTruthy()

    b.panne.publication = false
    expect(await b.sessions.fermerToutes()).toEqual({ fermees: [ID], bloquees: [] })
    expect(b.verrou()).toBeUndefined()
  })

  it('fermerToutes acquitte un état dégradé dont le verrou est déjà libéré', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    b.sessions.noterSale(ID)

    expect(await b.sessions.publier(ID)).toMatchObject({ ok: false, raison: 'divergence' })
    expect(b.verrou()).toBeUndefined()
    expect(await b.sessions.fermerToutes()).toEqual({ fermees: [ID], bloquees: [] })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'aucune' })
    expect(() => b.sessions.dispose()).not.toThrow()
  })

  it('dispose refuse d’oublier une session encore active', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    expect(() => b.sessions.dispose()).toThrow('encore actives')
    await b.sessions.fermer(ID)
    expect(() => b.sessions.dispose()).not.toThrow()
    await expect(b.sessions.ouvrir(ID)).rejects.toThrow('fermeture')
  })

  it('un échec de libération n’est pas annoncé comme une fermeture réussie', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.panne.liberation = true

    expect(await b.sessions.fermer(ID)).toMatchObject({
      fermee: false,
      raison: 'liberation',
    })
    expect(b.sessions.etat(ID).etat).toBe('a-nous')
    expect(b.verrou()).toBeTruthy()

    b.panne.liberation = false
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.verrou()).toBeUndefined()
  })

  it('une session dégradée reste acquittable si sa première libération échoue', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    b.sessions.noterSale(ID)
    b.panne.liberation = true

    expect(await b.sessions.publier(ID)).toMatchObject({ ok: false, raison: 'divergence' })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade' })
    expect(await b.sessions.fermer(ID)).toMatchObject({
      fermee: false,
      raison: 'liberation',
    })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade' })

    b.panne.liberation = false
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'aucune' })
  })
})

describe('Rétrogradation', () => {
  it('tolère une panne de renouvellement seulement jusqu’à l’expiration du droit', async () => {
    let maintenant = Date.now()
    const b = banc({ maintenant: () => maintenant })
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, JSON.stringify({ lastModified: 'local', texte: 'à préserver' }))
    b.sessions.noterSale(ID)
    b.panne.battement = true

    maintenant += 419_000
    await b.sessions.tic()
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: true })
    expect(b.retrogrades).toEqual([])

    maintenant += 2_000
    await b.sessions.tic()
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade' })
    expect(b.retrogrades).toEqual([ID])
    expect(b.sessions.listerDivergences()).toHaveLength(1)
    expect(b.sessions.lireDivergence(b.sessions.listerDivergences()[0].chemin))
      .toMatchObject({ texte: 'à préserver' })
  })

  it('refuse une publication si le droit a expiré avant le prochain battement', async () => {
    let maintenant = Date.now()
    const b = banc({ maintenant: () => maintenant })
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, JSON.stringify({ lastModified: 'local', texte: 'non publié' }))
    b.sessions.noterSale(ID)
    maintenant += 421_000

    await expect(b.sessions.publier(ID)).resolves.toEqual({
      ok: false,
      raison: 'droit-expire',
    })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).not.toContain('non publié')
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade' })
  })

  it('un renouvellement réussi repousse l’expiration locale', async () => {
    let maintenant = Date.now()
    const b = banc({ maintenant: () => maintenant })
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)

    maintenant += 300_000
    await b.sessions.tic()
    b.panne.battement = true
    maintenant += 300_000
    await b.sessions.tic()

    expect(b.sessions.etat(ID).etat).toBe('a-nous')
    expect(b.retrogrades).toEqual([])
  })

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
    expect(b.sessions.etat(ID).etat).toBe('degrade')
    expect(await b.sessions.ouvrir(ID)).toEqual({ etat: 'degrade' })
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.sessions.etat(ID).etat).toBe('aucune')
  })
})

/* ── Copies de divergence : lister / lire / supprimer ───────────────────*/

describe("Copies de divergence — l'API du dialogue de fusion (E3b)", () => {
  it('préserve séparément le dernier état reçu du renderer après rétrogradation', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    const payload = {
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', text: 'debounce récent' }] },
      annotations: [],
      ancres: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    } satisfies PayloadEntretien

    expect(b.sessions.preserverRecuperation(ID, payload)).toBe(false)
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    b.sessions.noterSale(ID)
    expect(await b.sessions.publier(ID)).toMatchObject({ ok: false, raison: 'divergence' })

    expect(b.sessions.preserverRecuperation(ID, payload)).toBe(true)
    const copies = b.sessions.listerDivergences()
      .map((copie) => b.sessions.lireDivergence(copie.chemin))
    expect(copies).toHaveLength(2)
    expect(copies).toContainEqual(expect.objectContaining({ corpsTexte: payload.corpsTexte }))
  })

  it("après rétrogradation : la copie est listée, lisible puis supprimable", async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Édition locale : ce qui sera mis de côté doit être NOTRE version.
    const avantRetrogradation = JSON.parse(readFileSync(b.fichierLocal, 'utf8')) as Record<string, unknown>
    avantRetrogradation.lastModified = 'travail-local-max'
    writeFileSync(b.fichierLocal, JSON.stringify(avantRetrogradation))
    // Oliviers force le verrou de max → tic de battement → rétrogradation.
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
    b.sessions.noterSale(ID)
    await b.sessions.tic()

    // La copie existe et est correctement nommée/identifiée.
    const divergences = b.sessions.listerDivergences()
    expect(divergences).toHaveLength(1)
    expect(divergences[0].chemin).toMatch(
      new RegExp(`^sessions/${ID}\\.divergence-s-1\\.copie-[0-9a-f-]{36}\\.json$`),
    )
    expect(divergences[0].id).toBe(ID)
    expect(divergences[0].sessionId).toBe('s-1')
    expect(divergences[0].date).toBeTruthy()

    // Lecture : c'est bien la copie locale mise de côté (pas la version serveur).
    expect(b.sessions.lireDivergence(divergences[0].chemin)).toEqual(avantRetrogradation)

    // Chemins invalides (traversal / convention absente) → rejetés.
    expect(b.sessions.lireDivergence('sessions/../../etc.passwd.json')).toBeNull()
    expect(b.sessions.lireDivergence('entretiens/nimporte.json')).toBeNull()
    // Suppression d'un chemin invalide : no-op silencieux.
    b.sessions.supprimerDivergence('sessions/../../etc.passwd.json')
    expect(b.sessions.listerDivergences()).toHaveLength(1)

    // Choix explicite du dialogue : jeter la copie (idempotent).
    b.sessions.supprimerDivergence(divergences[0].chemin)
    expect(b.sessions.listerDivergences()).toHaveLength(0)
    expect(existsSync(join(b.dirMiroir, divergences[0].chemin))).toBe(false)
    b.sessions.supprimerDivergence(divergences[0].chemin) // déjà partie : ok
  })

  it('deux divergences successives de la même session conservent les deux copies', async () => {
    const b = banc()
    await b.miroir.tirer()
    const travauxLocaux = [
      { lastModified: 'travail-local-1', texte: 'premier apport' },
      { lastModified: 'travail-local-2', texte: 'second apport' },
    ]

    for (const [index, travail] of travauxLocaux.entries()) {
      await b.sessions.ouvrir(ID)
      writeFileSync(b.fichierLocal, JSON.stringify(travail))
      b.sessions.noterSale(ID)
      b.serveur.poser(
        `entretiens/${ID}.json`,
        JSON.stringify({ lastModified: `serveur-${index + 1}`, texte: 'tiers' }),
      )
      expect(await b.sessions.publier(ID)).toMatchObject({ ok: false, raison: 'divergence' })

      // La rétrogradation libère le verrou, puis la fermeture acquitte son état.
      expect(b.serveur.etagDe(`verrous/${ID}.lock.json`)).toBeUndefined()
      expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade' })
      expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    }

    const divergences = b.sessions.listerDivergences()
    expect(divergences).toHaveLength(2)
    expect(new Set(divergences.map((d) => d.chemin)).size).toBe(2)
    expect(divergences.every((d) => d.sessionId === 's-1')).toBe(true)
    expect(
      divergences
        .map((d) => b.sessions.lireDivergence(d.chemin))
        .sort((a, b) => String(a?.lastModified).localeCompare(String(b?.lastModified))),
    ).toEqual(travauxLocaux)
  })

  it('accepte encore les anciens noms de copie', () => {
    const b = banc()
    const chemin = `sessions/${ID}.divergence-s-ancienne.json`
    const contenu = { lastModified: 'ancienne-copie', texte: 'préservé' }
    const dossier = join(b.dirMiroir, 'sessions')
    mkdirSync(dossier, { recursive: true })
    writeFileSync(join(b.dirMiroir, chemin), JSON.stringify(contenu))

    expect(b.sessions.listerDivergences()).toMatchObject([
      { chemin, id: ID, sessionId: 's-ancienne' },
    ])
    expect(b.sessions.lireDivergence(chemin)).toEqual(contenu)
    b.sessions.supprimerDivergence(chemin)
    expect(b.sessions.listerDivergences()).toEqual([])
  })

  it('sans rétrogradation : aucune divergence listée', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    await b.sessions.fermer(ID)
    expect(b.sessions.listerDivergences()).toEqual([])
    expect(b.sessions.lireDivergence(`sessions/${ID}.divergence-s-1.json`)).toBeNull()
  })
})

/* ── Pull sous verrou, badges, reprise crash ─────────────────────────*/

describe('Pull et exclusions de session', () => {
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
    // Pull SANS exclusion (lecture seule, sans verrous) : écraserait — c'est précisément
    // ce que la couche session interdit pendant une session.
  })
})

describe('Badges de verrou fiables', () => {
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

describe('Reprise après crash', () => {
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

  it('le journal protège la copie locale avant le premier tirage du redémarrage', async () => {
    const b = banc()
    await crash(b)
    const copieLocale = readFileSync(b.fichierLocal, 'utf8')
    b.serveur.poser(
      `entretiens/${ID}.json`,
      JSON.stringify({ lastModified: 'serveur-après-crash', texte: 'serveur' }),
    )
    const sessionsRelancees = new SessionsDEntretien(
      b.client,
      b.miroir,
      () => ({ userId: 'max', machineId: 'poste-1', sessionId: 's-RELANCE' }),
    )

    const idsProteges = sessionsRelancees.idsRecuperablesLocalement()
    expect(idsProteges).toEqual([ID])
    const tirage = await b.miroir.tirer(
      idsProteges.map((id) => `entretiens/${id}.json`),
    )

    expect(tirage.telecharges).not.toContain(`entretiens/${ID}.json`)
    expect(readFileSync(b.fichierLocal, 'utf8')).toBe(copieLocale)
  })

  it('un ancien crash sans journal est protégé par le verrou distant observé avant tirage', async () => {
    const b = banc()
    await crash(b)
    const copieLocale = readFileSync(b.fichierLocal, 'utf8')
    unlinkSync(join(b.dirMiroir, 'sessions', '.verrous-natifs.json'))
    b.serveur.poser(
      `entretiens/${ID}.json`,
      JSON.stringify({ lastModified: 'serveur-après-crash', texte: 'serveur' }),
    )
    const sessionsRelancees = new SessionsDEntretien(
      b.client,
      b.miroir,
      () => ({ userId: 'max', machineId: 'poste-1', sessionId: 's-RELANCE' }),
    )

    const orphelins = await sessionsRelancees.orphelins()
    expect(orphelins.map((orphelin) => orphelin.id)).toEqual([ID])
    await b.miroir.tirer(
      orphelins.map((orphelin) => `entretiens/${orphelin.id}.json`),
    )

    expect(readFileSync(b.fichierLocal, 'utf8')).toBe(copieLocale)
  })

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

  it('« reprendre et publier » : publie la copie locale PUIS libère', async () => {
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
    // La copie locale reste au miroir (matière à divergence future).
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
