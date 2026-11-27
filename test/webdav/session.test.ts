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
import { autoriserRepriseVerrousPerimes, DELAIS_REESSAI_VERROU_MS, ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import type { PayloadEntretien } from '../../src/shared/format'
import { corpusDistantValide, entretienDistantValide } from './fixturesCorpusDistant'

// Les réessais sur panne passagère n'attendent pas dans les tests.
DELAIS_REESSAI_VERROU_MS.splice(0, DELAIS_REESSAI_VERROU_MS.length, 0, 0, 0)

const ID = 'ent-abc'

function banc(options: { maintenant?: () => number } = {}) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.crp', corpusDistantValide([ID]))
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
    suppressionConditionnelleRefusee: false,
    ecritureConditionnelleVerrouRefusee: false,
    /** Imite un serveur qui refuse encore la création d'un verrou qu'il vient de supprimer. */
    creationsVerrouRefusees: 0,
    suppressionVerrouEnPanne: false,
    avantSuppressionVerrou: null as (() => void) | null,
    /** Imite un serveur qui change la version d'un verrou juste après l'avoir écrit
     *  et refuse quelques relectures. */
    verrouInstable: false,
    lecturesVerrouRefusees: 0,
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
    if (requete.method === 'DELETE' && chemin.includes('/verrous/')) panne.avantSuppressionVerrou?.()
    if (requete.method === 'DELETE' && chemin.includes('/verrous/') && panne.suppressionVerrouEnPanne) {
      return new Response('panne', { status: 503 })
    }
    if (requete.method === 'DELETE' && chemin.includes('/verrous/') && requete.headers.has('If-Match') && panne.suppressionConditionnelleRefusee) {
      return new Response('refus', { status: 412 })
    }
    if (requete.method === 'PUT' && chemin.includes('/verrous/') && requete.headers.has('If-None-Match') && panne.creationsVerrouRefusees > 0) {
      panne.creationsVerrouRefusees--
      return new Response('refus', { status: 412 })
    }
    if (requete.method === 'PUT' && chemin.includes('/verrous/') && requete.headers.has('If-Match') && panne.ecritureConditionnelleVerrouRefusee) {
      return new Response('refus', { status: 412 })
    }
    if (requete.method === 'DELETE' && chemin.endsWith(`/verrous/${ID}.lock.json`)) {
      if (panne.liberation) return new Response('panne', { status: 503 })
    }
    if (panne.verrouInstable && chemin.includes('/verrous/')) {
      const relatif = `verrous/${chemin.split('/verrous/')[1]}`
      if (requete.method === 'GET' && panne.lecturesVerrouRefusees > 0) {
        panne.lecturesVerrouRefusees--
        return new Response('indisponible', { status: 503 })
      }
      const reponse = await serveur.fetch(entree, init)
      if (requete.method === 'PUT' && reponse.ok) {
        serveur.poser(relatif, serveur.contenuDe(relatif)!)
        panne.lecturesVerrouRefusees = 2
      }
      return reponse
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

  it('un enregistrement sans changement après l’ouverture ne laisse rien à publier', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    const publie = JSON.parse(b.serveur.contenuDe(`entretiens/${ID}.json`)!)
    writeFileSync(b.fichierLocal, JSON.stringify({ ...publie, lastModified: new Date().toISOString() }, null, 2))
    b.sessions.noterSale(ID)
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: false })
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'vraie modification' }))
    b.sessions.noterSale(ID)
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous', sale: true })
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
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'travail local' }))
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
    expect(await b.sessions.ouvrir(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })
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
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })
    expect(await b.sessions.fermer(ID)).toMatchObject({
      fermee: false,
      raison: 'liberation',
    })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })

    b.panne.liberation = false
    expect(await b.sessions.fermer(ID)).toEqual({ fermee: true })
    expect(b.sessions.etat(ID)).toEqual({ etat: 'aucune' })
  })
})

describe('Entretien modifié ailleurs pendant son ouverture', () => {
  it('détecté à la vérification suivante : édition arrêtée, travail local mis de côté', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'travail local' }))
    b.sessions.noterSale(ID)
    b.serveur.poser(`entretiens/${ID}.json`, entretienDistantValide({ lastModified: 'web', texte: 'modifié sur Nextcloud' }))
    await b.sessions.tic()
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })
    expect(b.retrogrades).toContain(ID)
    const copies = b.sessions.listerDivergences().map((c) => b.sessions.lireDivergence(c.chemin))
    expect(copies).toContainEqual(expect.objectContaining({ texte: 'travail local' }))
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('modifié sur Nextcloud')
  })

  it('sans travail local à envoyer : aucune copie inutile', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    b.serveur.poser(`entretiens/${ID}.json`, entretienDistantValide({ lastModified: 'web', texte: 'modifié sur Nextcloud' }))
    await b.sessions.tic()
    expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })
    expect(b.sessions.listerDivergences()).toHaveLength(0)
  })

  it('version renommée par le serveur sans changement de contenu : ni suspension ni conflit à la publication', async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    const etagAvant = b.serveur.etagDe(`entretiens/${ID}.json`)
    b.serveur.poser(`entretiens/${ID}.json`, b.serveur.contenuDe(`entretiens/${ID}.json`)!)
    expect(b.serveur.etagDe(`entretiens/${ID}.json`)).not.toBe(etagAvant)
    await b.sessions.tic()
    expect(b.sessions.etat(ID)).toMatchObject({ etat: 'a-nous' })
    // Nouveau renommage juste avant la publication : le PUT conditionnel est refusé puis renvoyé.
    b.serveur.poser(`entretiens/${ID}.json`, b.serveur.contenuDe(`entretiens/${ID}.json`)!)
    writeFileSync(b.fichierLocal, entretienDistantValide({ lastModified: 'v2', texte: 'modification locale' }))
    b.sessions.noterSale(ID)
    expect(await b.sessions.publier(ID)).toEqual({ ok: true })
    expect(b.serveur.contenuDe(`entretiens/${ID}.json`)).toContain('modification locale')
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
      participations: [],
      meta: { valeursGen: {}, audioRef: null },
    } satisfies PayloadEntretien

    expect(b.sessions.preserverRecuperation(ID, payload)).toBe(false)
    b.serveur.poser(`entretiens/${ID}.json`, '{ "contourné": true }')
    b.sessions.noterSale(ID)
    expect(await b.sessions.publier(ID)).toMatchObject({ ok: false, raison: 'divergence' })

    expect(b.sessions.preserverRecuperation(ID, payload)).toBe(true)
    const copies = b.sessions.listerDivergences()
      .map((copie) => b.sessions.lireDivergence(copie.chemin))
    // La copie du miroir, identique à la base publiée, n'avait aucun travail à garder.
    expect(copies).toHaveLength(1)
    expect(copies).toContainEqual(expect.objectContaining({ corpsTexte: payload.corpsTexte }))
  })

  it("après rétrogradation : la copie est listée, lisible puis supprimable", async () => {
    const b = banc()
    await b.miroir.tirer()
    await b.sessions.ouvrir(ID)
    // Édition locale : ce qui sera mis de côté doit être NOTRE version.
    const avantRetrogradation = JSON.parse(readFileSync(b.fichierLocal, 'utf8')) as Record<string, unknown>
    avantRetrogradation.lastModified = 'travail-local-max'
    avantRetrogradation.travail = 'apport local de max'
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
      expect(b.sessions.etat(ID)).toEqual({ etat: 'degrade', raison: 'conflit' })
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

  it('un abandon refusé conserve le journal et peut être retenté sans publication', async () => {
    const b = banc()
    await crash(b)
    const chemin = `verrous/${ID}.lock.json`
    const journal = join(b.dirMiroir, 'sessions', '.verrous-natifs.json')
    const avant = readFileSync(journal, 'utf8')
    b.panne.suppressionConditionnelleRefusee = true
    await expect(b.sessions.abandonnerOrphelin(chemin)).rejects.toThrow('Rien n’a été supprimé')
    expect(readFileSync(journal, 'utf8')).toBe(avant)
    expect(b.verrou()).toBeTruthy()
    expect(readFileSync(b.fichierLocal, 'utf8')).toContain('jamais-publié')
    b.panne.suppressionConditionnelleRefusee = false
    await b.sessions.abandonnerOrphelin(chemin)
    expect(b.verrou()).toBeUndefined()
    expect(JSON.parse(readFileSync(journal, 'utf8'))).not.toHaveProperty(ID)
  })

  it('un abandon ne supprime pas la réservation reprise juste après sa lecture', async () => {
    const b = banc()
    await crash(b)
    const chemin = `verrous/${ID}.lock.json`
    const concurrent = JSON.stringify({ userId: 'julie', machineId: 'poste-2', sessionId: 'autre' })
    b.panne.avantSuppressionVerrou = () => { b.serveur.poser(chemin, concurrent) }
    await expect(b.sessions.abandonnerOrphelin(chemin)).rejects.toThrow('Rien n’a été supprimé')
    expect(b.verrou()).toBe(concurrent)
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

describe('Verrou des définitions laissé par un crash', () => {
  const CHEMIN = 'verrous/corpus.lock.json'
  const verrouCorpus = (machineId: string, refreshedAt: string) => JSON.stringify({
    userId: 'max', machineId, sessionId: 'garde-ancien', acquiredAt: refreshedAt, refreshedAt, ttl: 300,
  })

  it('périmé et posé par ce poste : supprimé', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z'))
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
  })

  it('encore frais : conservé, son détenteur peut être en train de travailler', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, verrouCorpus('poste-1', new Date().toISOString()))
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBeTruthy()
  })

  it('encore frais mais posé avant ce lancement (fermeture interrompue) : supprimé', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, JSON.stringify({
      userId: 'max', machineId: 'poste-1', sessionId: 'garde-quitte',
      acquiredAt: new Date(Date.now() - 3_600_000).toISOString(), refreshedAt: new Date().toISOString(), ttl: 300,
    }))
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
  })

  it('posé par un autre poste : conservé, même périmé', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', '2020-01-01T00:00:00.000Z'))
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBeTruthy()
  })

  it('illisible et inchangé depuis longtemps : supprimé', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, '{ abîmé', 'Tue, 15 Sep 2026 10:00:00 GMT')
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
  })

  it('illisible mais récent : conservé', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, '{ abîmé', new Date().toUTCString())
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBeTruthy()
  })

  it('le nettoyage conserve une réservation reprise entre lecture et suppression', async () => {
    const b = banc()
    b.serveur.poser(CHEMIN, verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z'))
    const concurrent = verrouCorpus('poste-2', new Date().toISOString())
    b.panne.avantSuppressionVerrou = () => { b.serveur.poser(CHEMIN, concurrent) }
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(concurrent)
  })

  it('serveur refusant la suppression conditionnelle : le verrou périmé est conservé', async () => {
    const b = banc()
    b.panne.suppressionConditionnelleRefusee = true
    const contenu = verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z')
    b.serveur.poser(CHEMIN, contenu)
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toBe(contenu)
  })

  it('serveur refusant la suppression conditionnelle : la libération échoue sans forçage', async () => {
    const b = banc()
    b.panne.suppressionConditionnelleRefusee = true
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 's-1' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    await expect(provider.liberer(CHEMIN)).rejects.toMatchObject({ statut: 412 })
    expect(b.serveur.contenuDe(CHEMIN)).toContain('s-1')
  })

  it('serveur refusant toute écriture conditionnelle : le battement échoue sans écriture directe', async () => {
    const b = banc()
    b.panne.ecritureConditionnelleVerrouRefusee = true
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-m' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    const avant = JSON.parse(b.serveur.contenuDe(CHEMIN)!).refreshedAt
    await new Promise((r) => setTimeout(r, 5))
    expect((await provider.battre(CHEMIN)).ok).toBe(false)
    expect(JSON.parse(b.serveur.contenuDe(CHEMIN)!).refreshedAt).toBe(avant)
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    expect((await provider.battre(CHEMIN)).ok).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('poste-2')
  })

  it('création refusée juste après une suppression alors que le verrou est absent : obtenue à la demande suivante', async () => {
    const b = banc()
    b.panne.creationsVerrouRefusees = 2
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-s' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-s')
    await provider.liberer(CHEMIN)
  })

  it('création toujours refusée avec un verrou absent : refus après quelques demandes', async () => {
    const b = banc()
    b.panne.creationsVerrouRefusees = 100
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-t' }))
    expect(await provider.acquerir(CHEMIN)).toEqual({ ok: false, tenuPar: null })
    expect(b.panne.creationsVerrouRefusees).toBe(96)
  })

  it('battement raté sur une lecture périmée : la libération retire quand même notre verrou', async () => {
    const b = banc()
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-p' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    const notre = b.serveur.contenuDe(CHEMIN)!
    // Le serveur sert brièvement une autre version : le battement conclut à la perte du verrou.
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    expect((await provider.battre(CHEMIN)).ok).toBe(false)
    b.serveur.poser(CHEMIN, notre)
    await provider.liberer(CHEMIN)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
  })

  it('battement raté puis lecture encore périmée à la libération : retiré à la demande suivante', async () => {
    const b = banc()
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-q' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    const notre = b.serveur.contenuDe(CHEMIN)!
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    expect((await provider.battre(CHEMIN)).ok).toBe(false)
    await provider.liberer(CHEMIN)
    b.serveur.poser(CHEMIN, notre)
    const suivant = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-r' }))
    expect((await suivant.acquerir(CHEMIN)).ok).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-r')
  })

  it('suppression refusée puis relecture périmée : notre verrou est retiré à la publication suivante', async () => {
    const b = banc()
    b.panne.suppressionConditionnelleRefusee = true
    const premiere = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-u' }))
    expect((await premiere.acquerir(CHEMIN)).ok).toBe(true)
    const notre = b.serveur.contenuDe(CHEMIN)!
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    await premiere.liberer(CHEMIN)
    b.serveur.poser(CHEMIN, notre)
    b.panne.suppressionConditionnelleRefusee = false
    const seconde = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-v' }))
    expect((await seconde.acquerir(CHEMIN)).ok).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-v')
  })

  it('verrou repris par quelqu’un d’autre entre-temps : jamais supprimé', async () => {
    const b = banc()
    b.panne.suppressionConditionnelleRefusee = true
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 's-1' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    await provider.liberer(CHEMIN)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('poste-2')
  })

  it('libération en échec : le verrou retenu est retiré à la demande suivante de ce poste', async () => {
    const b = banc()
    const premier = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-a' }))
    expect((await premier.acquerir(CHEMIN)).ok).toBe(true)
    b.panne.suppressionVerrouEnPanne = true
    await expect(premier.liberer(CHEMIN)).rejects.toThrow()
    b.panne.suppressionVerrouEnPanne = false
    const suivant = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-b' }))
    expect((await suivant.acquerir(CHEMIN)).ok).toBe(true)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-b')
  })

  it('libération en échec puis verrou repris par un autre : jamais retiré', async () => {
    const b = banc()
    const premier = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-c' }))
    expect((await premier.acquerir(CHEMIN)).ok).toBe(true)
    b.panne.suppressionVerrouEnPanne = true
    await expect(premier.liberer(CHEMIN)).rejects.toThrow()
    b.panne.suppressionVerrouEnPanne = false
    b.serveur.poser(CHEMIN, verrouCorpus('poste-2', new Date().toISOString()))
    const suivant = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-d' }))
    expect((await suivant.acquerir(CHEMIN)).ok).toBe(false)
    expect(b.serveur.contenuDe(CHEMIN)).toContain('poste-2')
  })

  it('serveur qui change la version et refuse les relectures juste après écriture : réservation, battement et libération aboutissent', async () => {
    const b = banc()
    b.panne.verrouInstable = true
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-e' }))
    expect((await provider.acquerir(CHEMIN)).ok).toBe(true)
    expect((await provider.battre(CHEMIN)).ok).toBe(true)
    expect((await provider.battre(CHEMIN)).ok).toBe(true)
    await provider.liberer(CHEMIN)
    expect(b.serveur.contenuDe(CHEMIN)).toBeUndefined()
    const suivant = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId: 'garde-f' }))
    expect((await suivant.acquerir(CHEMIN)).ok).toBe(true)
  })

  describe('réservation expirée de ce poste, à la demande suivante', () => {
    const garde = (b: ReturnType<typeof banc>, sessionId: string) =>
      new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-1', sessionId }))
    const autoriser = (b: ReturnType<typeof banc>, oui: boolean) =>
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, (chemin) => oui && chemin === CHEMIN)

    it('retirée puis reprise si le corpus l’autorise', async () => {
      const b = banc()
      b.serveur.poser(CHEMIN, verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z'))
      autoriser(b, true)
      expect((await garde(b, 'garde-g').acquerir(CHEMIN)).ok).toBe(true)
      expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-g')
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, null)
    })

    it('conservée si une opération locale l’interdit', async () => {
      const b = banc()
      b.serveur.poser(CHEMIN, verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z'))
      autoriser(b, false)
      expect((await garde(b, 'garde-h').acquerir(CHEMIN)).ok).toBe(false)
      expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-ancien')
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, null)
    })

    it('conservée si elle est encore active ou vient d’un autre poste', async () => {
      const b = banc()
      autoriser(b, true)
      b.serveur.poser(CHEMIN, verrouCorpus('poste-1', new Date().toISOString()))
      expect((await garde(b, 'garde-i').acquerir(CHEMIN)).ok).toBe(false)
      b.serveur.poser(CHEMIN, verrouCorpus('poste-2', '2020-01-01T00:00:00.000Z'))
      expect((await garde(b, 'garde-j').acquerir(CHEMIN)).ok).toBe(false)
      expect(b.serveur.contenuDe(CHEMIN)).toContain('poste-2')
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, null)
    })

    it('encore active mais posée par un lancement précédent : retirée tout de suite', async () => {
      const b = banc()
      const avantLancement = new Date(Date.now() - 3_600_000).toISOString()
      b.serveur.poser(CHEMIN, JSON.stringify({
        userId: 'max', machineId: 'poste-1', sessionId: 'garde-quitte', acquiredAt: avantLancement, refreshedAt: new Date().toISOString(), ttl: 300,
      }))
      autoriser(b, true)
      expect((await garde(b, 'garde-l').acquerir(CHEMIN)).ok).toBe(true)
      expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-l')
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, null)
    })

    it('conservée si le serveur refuse la suppression conditionnelle', async () => {
      const b = banc()
      b.panne.suppressionConditionnelleRefusee = true
      b.serveur.poser(CHEMIN, verrouCorpus('poste-1', '2020-01-01T00:00:00.000Z'))
      autoriser(b, true)
      expect((await garde(b, 'garde-k').acquerir(CHEMIN)).ok).toBe(false)
      expect(b.serveur.contenuDe(CHEMIN)).toContain('garde-ancien')
      autoriserRepriseVerrousPerimes(b.serveur.baseUrl, null)
    })
  })

  it('absent : rien à faire', async () => {
    const b = banc()
    expect(await b.sessions.libererVerrouCorpusPerime()).toBe(false)
  })
})
