/**
 *  Banc de conformité WebDAV : le client, les sondes et le miroir joués
 *  contre le serveur embarqué, SANS autre hypothèse sur lui que le contrat
 *  (préconditions, ETags, multistatus).
 */

import { describe, expect, it, test } from 'vitest'
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { join, normalize } from 'node:path'
import {
  ClientWebDAV,
  ErreurDelaiWebDAV,
  ErreurHttp,
  analyserMultistatus,
} from '../../src/main/webdav/client'
import { profilerServeur, sonderFilesLock, sonderPreconditions } from '../../src/main/webdav/sondes'
import { MiroirWebDAV } from '../../src/main/distant/miroir'
import {
  canoniserUrlServeur,
  CoffreComptes,
  idDeCorpus,
  migrerReferencesProfil,
  type Chiffreur,
} from '../../src/main/distant/coffre'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { CorpusStore } from '../../src/main/corpusStore'
import { ecrireSeedDemo } from '../seedDemo'
import type { EntretienFichier } from '../../src/shared/format'

function clientSur(serveur: ServeurWebDAVMemoire): ClientWebDAV {
  return new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
}

/** Store de résolution audio : seed démo (e1) ;
 *  les tests écrivent ensuite refs/désignations directement sur disque,
 *  et le miroir écrit lui aussi hors du store. */
function storeAudio(): { store: CorpusStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-audio-distant-'))
  ecrireSeedDemo(dir)
  return { store: new CorpusStore(dir), dir }
}

function ecrireEntretien(dir: string, meta: EntretienFichier['meta']): void {
  const f = join(dir, 'entretiens', 'e1.json')
  const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
  data.meta = meta
  writeFileSync(f, JSON.stringify(data), 'utf8')
}

describe('CorpusStore — résolution EFFECTIVE des audios désignés', () => {
  test('priorité 1 : désignation distante dont la copie miroir est là → elle gagne', () => {
    const refLocale = join(tmpdir(), `chez-assigneur-${Math.random().toString(36).slice(2)}.mp3`)
    writeFileSync(refLocale, 'REF', 'utf8')
    const { store, dir } = storeAudio()
    ecrireEntretien(dir, {
      valeursGen: {},
      audioRef: refLocale,
      audioDistant: { chemin: 'audios/e1.mp3' },
    })
    mkdirSync(join(dir, 'audios'), { recursive: true })
    writeFileSync(join(dir, 'audios', 'e1.mp3'), 'MIROIR', 'utf8') // le pull l'a rapportée

    const audios = store.audios()
    expect(audios.e1?.audio).toBe(join(dir, 'audios', 'e1.mp3'))
  })

  test('copie pas encore téléchargée : retombée locale (continuité de travail)', () => {
    const refLocale = join(tmpdir(), `associe-localement-${Math.random().toString(36).slice(2)}.mp3`)
    writeFileSync(refLocale, 'LOCAL', 'utf8')
    const { store, dir } = storeAudio()
    ecrireEntretien(dir, {
      valeursGen: {},
      audioRef: join(tmpdir(), 'introuvable-ici.mp3'), // le poste assigneur, pas nous
      audioDistant: { chemin: 'audios/e1.mp3' }, // PAS encore dans le miroir
    })
    // audio-locaux.json : fichier machine-local (le store ne l'écrit que via associerAudioLocal)
    writeFileSync(join(dir, 'audio-locaux.json'), JSON.stringify({ e1: refLocale }), 'utf8')

    const audios = store.audios()
    expect(audios.e1?.audio).toBe(normalize(refLocale))
  })

  test('désignation SANS audioRef : la copie miroir est la seule piste partagée', () => {
    const { store, dir } = storeAudio()
    ecrireEntretien(dir, { valeursGen: {}, audioRef: null, audioDistant: { chemin: 'sons/e1.ogg' } })
    mkdirSync(join(dir, 'sons'), { recursive: true })
    writeFileSync(join(dir, 'sons', 'e1.ogg'), 'OGG', 'utf8')

    const audios = store.audios()
    expect(audios.e1?.audio).toBe(join(dir, 'sons', 'e1.ogg'))
  })

  test('whitelist sonal-media://abs : la copie miroir d’une désignation passe, un chemin arbitraire non', () => {
    const { store, dir } = storeAudio()
    ecrireEntretien(dir, { valeursGen: {}, audioRef: null, audioDistant: { chemin: 'audios/e1.mp3' } })
    mkdirSync(join(dir, 'audios'), { recursive: true })
    const copie = join(dir, 'audios', 'e1.mp3')
    writeFileSync(copie, 'MP3', 'utf8')

    expect(store.cheminMediaAbs(copie)).toBe(copie) // désignation stockée du corpus courant
    expect(
      store.cheminMediaAbs(join(tmpdir(), `autre-corpus-${Math.random().toString(36).slice(2)}`, 'audios', 'e1.mp3')),
    ).toBeNull()
  })
})

describe('ClientWebDAV — transport sécurisé et borné', () => {
  it('refuse HTTP hors boucle locale avant tout envoi des identifiants', () => {
    let appels = 0
    expect(() => new ClientWebDAV(
      {
        baseUrl: 'http://webdav.exemple.org/corpus',
        identifiants: { utilisateur: 'max', motDePasse: 'secret' },
      },
      async () => {
        appels += 1
        return new Response(null, { status: 200 })
      },
    )).toThrow(/HTTPS.*localhost/i)
    expect(appels).toBe(0)
  })

  it.each([
    'http://localhost.exemple.org/corpus',
    'ftp://localhost/corpus',
    'https://max:secret@webdav.exemple.org/corpus',
    'https://webdav.exemple.org/corpus#fragment',
  ])('refuse une URL non sûre %s', (baseUrl) => {
    expect(() => new ClientWebDAV({
      baseUrl,
      identifiants: { utilisateur: 'max', motDePasse: 'secret' },
    }, async () => new Response(null, { status: 200 }))).toThrow()
  })

  it.each([
    'https://webdav.exemple.org/corpus',
    'http://localhost:8080/corpus',
    'http://127.0.0.1:8080/corpus',
    'http://[::1]:8080/corpus',
  ])('accepte le transport autorisé %s', (baseUrl) => {
    expect(() => new ClientWebDAV({
      baseUrl,
      identifiants: { utilisateur: 'max', motDePasse: 'secret' },
    }, async () => new Response(null, { status: 200 }))).not.toThrow()
  })

  it('la sonde Nextcloud ne contourne pas le refus de HTTP distant', async () => {
    let appels = 0
    await expect(sonderFilesLock(
      'http://webdav.exemple.org/corpus',
      { utilisateur: 'max', motDePasse: 'secret' },
      async () => {
        appels += 1
        return new Response(null, { status: 200 })
      },
    )).resolves.toBe(false)
    expect(appels).toBe(0)
  })

  it('interrompt une requête JSON qui dépasse son délai', async () => {
    const client = new ClientWebDAV(
      {
        baseUrl: 'https://webdav.exemple.org/corpus',
        identifiants: { utilisateur: 'max', motDePasse: 'secret' },
      },
      async (_entree, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }),
      { requeteMs: 10 },
    )

    await expect(client.getTexte('corpus.json')).rejects.toBeInstanceOf(ErreurDelaiWebDAV)
  })

  it('conserve le délai jusqu’à la consommation complète du corps', async () => {
    const client = new ClientWebDAV(
      {
        baseUrl: 'https://webdav.exemple.org/corpus',
        identifiants: { utilisateur: 'max', motDePasse: 'secret' },
      },
      async (_entree, init) => ({
        status: 200,
        text: () => new Promise<string>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        }),
      }) as Response,
      { requeteMs: 10 },
    )

    await expect(client.getTexte('corpus.json')).rejects.toBeInstanceOf(ErreurDelaiWebDAV)
  })

  it('refuse les redirections afin de ne pas transmettre Basic à une autre origine', async () => {
    const client = new ClientWebDAV(
      {
        baseUrl: 'https://webdav.exemple.org/corpus',
        identifiants: { utilisateur: 'max', motDePasse: 'secret' },
      },
      async (_entree, init) => {
        expect(init?.redirect).toBe('error')
        return new Response(null, { status: 200 })
      },
    )
    await expect(client.getTexte('corpus.json')).resolves.toBe('')
  })
})

describe('ClientWebDAV — contrat de préconditions', () => {
  it('PUT If-None-Match:* : création exclusive atomique (201 puis 412)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const client = clientSur(serveur)
    await expect(client.putTexte('verrous/e1.lock.json', '{}', { ifNoneMatch: '*' })).resolves.toBeTruthy()
    await expect(client.putTexte('verrous/e1.lock.json', '{}', { ifNoneMatch: '*' })).rejects.toMatchObject({
      statut: 412,
    })
  })

  it('PUT If-Match : publie sous le bon ETag, refuse un mauvais (jamais d\u2019écrasement)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('entretiens/e1.json', 'v1')
    const client = clientSur(serveur)
    const etag = serveur.etagDe('entretiens/e1.json')!
    // Bon ETag → passe, renvoie le nouvel ETag.
    const nouveau = await client.putTexte('entretiens/e1.json', 'v2', { ifMatch: etag })
    expect(nouveau).not.toBeNull()
    expect(nouveau).not.toBe(etag)
    // Mauvais ETag → 412.
    await expect(
      client.putTexte('entretiens/e1.json', 'v3', { ifMatch: etag }),
    ).rejects.toBeInstanceOf(ErreurHttp)
    expect(serveur.contenuDe('entretiens/e1.json')).toBe('v2')
  })

  it('DELETE conditionnel et MOVE atomique vers la corbeille', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('entretiens/e1.json', 'x')
    const client = clientSur(serveur)
    const etag = serveur.etagDe('entretiens/e1.json')!
    // DELETE avec mauvais ETag refusé…
    await expect(client.supprimer('entretiens/e1.json', 'faux')).rejects.toMatchObject({ statut: 412 })
    // …puis MOVE vers corbeille/ (suppression), destination occupée refusée.
    serveur.poser('corbeille/e1.json', 'ancien')
    await expect(client.deplacer('entretiens/e1.json', 'corbeille/e1.json')).rejects.toMatchObject({
      statut: 412,
    })
    await client.supprimer('corbeille/e1.json')
    await client.deplacer('entretiens/e1.json', 'corbeille/e1.json')
    expect(existsSync(join('/tmp', 'x'))).toBe(false) // garde anti-faux-positif
    expect(serveur.contenuDe('entretiens/e1.json')).toBeUndefined()
    expect(serveur.contenuDe('corbeille/e1.json')).toBe('x')
  })

  it('PROPFIND Depth:1 : entrées enfants relativisées, dossiers marqués', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    serveur.poser('entretiens/e1.json', '{}')
    const client = clientSur(serveur)
    const racine = await client.propfind('')
    expect(racine.map((e) => e.chemin)).toContain('corpus.json')
    expect(racine.find((e) => e.chemin === 'entretiens')?.dossier).toBe(true)
    const entretiens = await client.propfind('entretiens')
    expect(entretiens).toHaveLength(1)
    expect(entretiens[0]).toMatchObject({ chemin: 'e1.json', dossier: false })
    expect(entretiens[0].etag).toMatch(/^etag-/)
  })

  it('refuse un serveur qui ignore l\u2019authentification Basic attendue', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: { utilisateur: 'max', motDePasse: 'FAUX' } },
      serveur.fetch,
    )
    await expect(client.getTexte('corpus.json')).rejects.toMatchObject({ statut: 401 })
  })
})

describe('analyserMultistatus — mini-parseur XML borné', () => {
  it('lit préfixes variés, entités, barres finales de collections', () => {
    const xml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response><D:href>/dav/Mon%20Corpus/</D:href><D:propstat><D:prop>
    <D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>
  <D:response><D:href>/dav/Mon%20Corpus/a&amp;b.json</D:href><D:propstat><D:prop>
    <D:resourcetype/><D:getetag>&quot;abc&quot;</D:getetag></D:prop></D:propstat></D:response>
</D:multistatus>`
    const sorties = analyserMultistatus(xml)
    expect(sorties).toEqual([
      { chemin: 'dav/Mon Corpus', etag: null, dossier: true },
      { chemin: 'dav/Mon Corpus/a&b.json', etag: 'abc', dossier: false },
    ])
  })

  it('lit getcontentlength (progression des transferts)', () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/dav/corpus/</d:href><d:propstat><d:prop>
    <d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/corpus/grosse.mp4</d:href><d:propstat><d:prop>
    <d:resourcetype/><d:getetag>"e1"</d:getetag>
    <d:getcontentlength>1073741824</d:getcontentlength></d:prop></d:propstat></d:response>
  <d:response><d:href>/dav/corpus/sans-taille.mp3</d:href><d:propstat><d:prop>
    <d:resourcetype/><d:getetag>"e2"</d:getetag></d:prop></d:propstat></d:response>
</d:multistatus>`
    const sorties = analyserMultistatus(xml)
    expect(sorties.find((e) => e.chemin === 'dav/corpus/grosse.mp4')?.taille).toBe(1_073_741_824)
    // Absente (serveur avare) → undefined ;
    // la garde du miroir ne doit pas refuser un fichier,
    // dont la taille est simplement inconnue.
    expect(sorties.find((e) => e.chemin === 'dav/corpus/sans-taille.mp3')?.taille).toBeUndefined()
  })
})

describe('Sondes — profil de capacités mesuré sur le serveur réel', () => {
  it('un serveur correct passe la sonde de préconditions ; files_lock absent → variante B', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const profil = await profilerServeur(clientSur(serveur))
    expect(profil.preconditions).toBe(true)
    expect(profil.filesLock).toBe(false) // le banc n'émule pas capabilities Nextcloud
  })

  it('la sonde détecte un serveur qui ignore les préconditions (refus)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    // Sabotage ciblé du test-and-set : le PUT If-None-Match écrase au lieu de refuser.
    const fetchDefaillant: typeof fetch = async (entree, init) => {
      const r = new Request(entree, init)
      if (r.method === 'PUT' && r.headers.get('If-None-Match') === '*') {
        return new Response(null, { status: 201 }) // ment : accepte tout
      }
      return serveur.fetch(entree, init)
    }
    const resultat = await sonderPreconditions(new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      fetchDefaillant,
    ))
    expect(resultat.ok).toBe(false)
    expect(resultat.note).toBeTruthy()
  })
})

describe('MiroirWebDAV — pull incrémental', () => {
  function miroirSur(serveur: ServeurWebDAVMemoire): { miroir: MiroirWebDAV; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'miroir-test-'))
    return { miroir: new MiroirWebDAV(clientSur(serveur), dir), dir }
  }

  it('premier tirage : télécharge le contenu JSON, pas les dossiers de protocole', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{"membership":{}}')
    serveur.poser('entretiens/e1.json', '{"lastModified":"2026-08-01"}')
    serveur.creerDossierRelatif('verrous')
    serveur.creerDossierRelatif('presence')
    serveur.poser('verrous/e2.lock.json', '{"userId":"olivier"}')
    serveur.poser('presence/max.json', '{}')
    const { miroir, dir } = miroirSur(serveur)

    const tirage = await miroir.tirer()
    expect(tirage.telecharges.sort()).toEqual(['corpus.json', 'entretiens/e1.json'])
    expect(readFileSync(miroir.cheminLocal('corpus.json'), 'utf8')).toBe('{"membership":{}}')
    // verrous/ et presence/ ne sont PAS du contenu…
    expect(existsSync(miroir.cheminLocal('verrous/e2.lock.json'))).toBe(false)
    expect(existsSync(miroir.cheminLocal('presence/max.json'))).toBe(false)
    // …mais les verrous vus sont remontés pour les badges.
    expect(tirage.verrous).toEqual([
      { chemin: 'verrous/e2.lock.json', etag: serveur.etagDe('verrous/e2.lock.json') },
    ])
  })

  it('deuxième tirage sans changement : rien ne re-télécharge (diff par ETags)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')

    let gets = 0
    const clientCompteur = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (e, i) => {
        if (new Request(e, i).method === 'GET') gets += 1
        return serveur.fetch(e, i)
      },
    )
    const miroir = new MiroirWebDAV(clientCompteur, mkdtempSync(join(tmpdir(), 'miroir-t2-')))
    await miroir.tirer() // amorce : 1 GET
    expect(gets).toBe(1)
    gets = 0
    const second = await miroir.tirer()
    expect(gets).toBe(0)
    expect(second.telecharges).toEqual([])
  })

  it('changement côté serveur : seul le fichier changé est re-téléchargé', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', 'v1')
    serveur.poser('entretiens/e1.json', 'a')
    serveur.poser('entretiens/e2.json', 'b')
    const { miroir } = miroirSur(serveur)
    await miroir.tirer()

    serveur.poser('entretiens/e1.json', 'a-modifié') // nouveau contenu → nouvel ETag
    const tirage = await miroir.tirer()
    expect(tirage.telecharges).toEqual(['entretiens/e1.json'])
    expect(readFileSync(miroir.cheminLocal('entretiens/e1.json'), 'utf8')).toBe('a-modifié')
  })

  it('fichier disparu côté serveur : déplacé en corbeille du miroir, jamais effacé', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    serveur.poser('entretiens/e1.json', 'x')
    const { miroir, dir } = miroirSur(serveur)
    await miroir.tirer()

    // Le serveur « supprime » e1.json : on reconstruit le banc sans lui.
    const serveurVide = new ServeurWebDAVMemoire()
    serveurVide.poser('corpus.json', '{}')
    const miroir2 = new MiroirWebDAV(
      new ClientWebDAV({ baseUrl: serveurVide.baseUrl, identifiants: serveurVide.identifiants }, serveurVide.fetch),
      dir,
    )
    const tirage = await miroir2.tirer()
    expect(tirage.corbeille).toEqual(['entretiens/e1.json'])
    expect(existsSync(miroir.cheminLocal('entretiens/e1.json'))).toBe(false)
    expect(readFileSync(join(dir, 'corbeille-miroir/entretiens/e1.json'), 'utf8')).toBe('x')
  })
})

describe('MiroirWebDAV — audios désignés', () => {
  function miroirSur(serveur: ServeurWebDAVMemoire): { miroir: MiroirWebDAV; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'miroir-audio-'))
    return { miroir: new MiroirWebDAV(clientSur(serveur), dir), dir }
  }

  /** Amorce un corpus dont l'entretien e1 désigne `audios/e1.mp3`. */
  function amorcerAvecDesignation(serveur: ServeurWebDAVMemoire): void {
    serveur.poser('corpus.json', '{}')
    serveur.poser('entretiens/e1.json', JSON.stringify({ meta: { audioDistant: { chemin: 'audios/e1.mp3' } } }))
    serveur.creerDossierRelatif('audios')
    serveur.poser('audios/e1.mp3', 'MP3BINAIRES')
  }

  it('le tirage télécharge le fichier désigné, et lui seul', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcerAvecDesignation(serveur)
    serveur.poser('audios/jamais-designe.mp3', 'AUTRE') // pas référencé : ne doit PAS partir
    const { miroir, dir } = miroirSur(serveur)

    const tirage = await miroir.tirer()
    expect(tirage.telecharges).toContain('audios/e1.mp3')
    expect(tirage.telecharges).not.toContain('audios/jamais-designe.mp3')
    expect(tirage.inaccessibles).toEqual([])
    expect(readFileSync(join(dir, 'audios/e1.mp3'), 'utf8')).toBe('MP3BINAIRES')
    expect(existsSync(join(dir, 'audios/jamais-designe.mp3'))).toBe(false)
  })

  it('idempotent : deuxième tirage sans changement = aucun re-téléchargement', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcerAvecDesignation(serveur)
    let getsAudios = 0
    const clientCompteur = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (e, i) => {
        const r = new Request(e, i)
        if (r.method === 'GET' && r.url.includes('.mp3')) getsAudios += 1
        return serveur.fetch(e, i)
      },
    )
    const miroir = new MiroirWebDAV(clientCompteur, mkdtempSync(join(tmpdir(), 'miroir-audio-2-')))
    await miroir.tirer()
    expect(getsAudios).toBe(1)
    const second = await miroir.tirer()
    expect(getsAudios).toBe(1) // inchangé
    expect(second.inaccessibles).toEqual([])
  })

  it('audio changé côté serveur (nouvel ETag) → re-téléchargé', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcerAvecDesignation(serveur)
    const { miroir, dir } = miroirSur(serveur)
    await miroir.tirer()

    serveur.poser('audios/e1.mp3', 'MP3-VERSION-2')
    const tirage = await miroir.tirer()
    expect(tirage.telecharges).toEqual(['audios/e1.mp3'])
    expect(readFileSync(join(dir, 'audios/e1.mp3'), 'utf8')).toBe('MP3-VERSION-2')
  })

  it('désignation retirée → la copie miroir part en corbeille au tirage suivant', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcerAvecDesignation(serveur)
    const { miroir, dir } = miroirSur(serveur)
    await miroir.tirer()

    // Un autre poste a retiré la désignation ; le pull texte local reflète déjà son JSON.
    // On simule en écrivant directement la copie miroir.
    writeFileSync(
      miroir.cheminLocal('entretiens/e1.json'),
      JSON.stringify({ meta: {} }),
      'utf8',
    )
    const tirage = await miroir.tirer()
    expect(tirage.corbeille).toEqual(['audios/e1.mp3'])
    expect(existsSync(miroir.cheminLocal('audios/e1.mp3'))).toBe(false)
    expect(readFileSync(join(dir, 'corbeille-miroir/audios/e1.mp3'), 'utf8')).toBe('MP3BINAIRES')
  })

  it('désigné mais inaccessible (404) : tirage non bloqué, puis rattrapage quand le fichier apparaît', async () => {
    const serveur = new ServeurWebDAVMemoire()
    // Le JSON désigne, mais le fichier audio n'est pas encore là/accessible.
    serveur.poser('corpus.json', '{}')
    serveur.poser('entretiens/e1.json', JSON.stringify({ meta: { audioDistant: { chemin: 'audios/e1.mp3' } } }))
    const { miroir, dir } = miroirSur(serveur)

    const premier = await miroir.tirer() // propfind('audios') → 404 : NE JETTE PAS
    expect(premier.inaccessibles).toEqual([{ chemin: 'audios/e1.mp3', raison: '404' }])
    expect(existsSync(join(dir, 'audios/e1.mp3'))).toBe(false)

    // Les droits « s'ouvrent » (ou le fichier arrive) :
    // le prochain tirage re-tente tout seul ;
    // l'ETag n'avait PAS été noté au manifeste.
    serveur.creerDossierRelatif('audios')
    serveur.poser('audios/e1.mp3', 'ARRIVE-PLUS-TARD')
    const second = await miroir.tirer()
    expect(second.inaccessibles).toEqual([])
    expect(second.telecharges).toEqual(['audios/e1.mp3'])
    expect(readFileSync(join(dir, 'audios/e1.mp3'), 'utf8')).toBe('ARRIVE-PLUS-TARD')
  })

  it('garde anti-traversal : une désignation qui remonte hors du corpus est ignorée', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    serveur.poser(
      'entretiens/e1.json',
      JSON.stringify({ meta: { audioDistant: { chemin: '../../secret.mp3' } } }),
    )
    const { miroir } = miroirSur(serveur)

    const tirage = await miroir.tirer()
    expect(tirage.telecharges).not.toContain('../../secret.mp3')
    expect(tirage.inaccessibles).toEqual([])
  })

  it('download STREAMÉ : un gros binaire désigné arrive INTACT sur disque', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcerAvecDesignation(serveur)
    // Octets aléatoires non décodables en UTF-8 (le serveur mémoire les garde binaires) ;
    // 1,5 Mo suffit à traverser plusieurs chunks du pipeline.
    const gros = new Uint8Array(randomBytes(1_500_000))
    serveur.poserBinaire('audios/e1.mp3', gros)
    const { miroir, dir } = miroirSur(serveur)

    const tirage = await miroir.tirer()
    expect(tirage.inaccessibles).toEqual([])
    expect(tirage.telecharges).toContain('audios/e1.mp3')
    const lu = readFileSync(join(dir, 'audios/e1.mp3'))
    expect(lu.length).toBe(gros.length)
    expect(Buffer.compare(lu, Buffer.from(gros))).toBe(0) // octet pour octet
  })
})

describe('Téléversement — putBinaire + garde anti-écrasement', () => {
  function miroirSur(serveur: ServeurWebDAVMemoire): { miroir: MiroirWebDAV; dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'miroir-tel-'))
    return { miroir: new MiroirWebDAV(clientSur(serveur), dir), dir }
  }

  it('putBinaire fait un aller-retour fidèle (octets identiques au GET)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const client = clientSur(serveur)
    const octets = new Uint8Array([0xff, 0x00, 0x7f, 0x12, 0x34])
    await expect(client.putBinaire('audios/e1.mp3', octets)).resolves.toBeTruthy()
    const lu = await client.getBinaire('audios/e1.mp3')
    expect([...lu]).toEqual([...octets])
  })

  it('téléverse dans un dossier MANQUANT (parents créés par MKCOL)', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    const { miroir } = miroirSur(serveur)

    const r = await miroir.televerserFichier(
      'audios/2026/e1.mp3', // ni audios/ ni 2026 n'existent
      new Uint8Array([1, 2, 3]),
    )
    expect(r.ok).toBe(true)
    expect(serveur.contenuDe('audios/2026/e1.mp3')).toBeDefined()
  })

  it('collision : refus SANS écraser, suggestion suffixée, puis envoi sous le suffixe', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    serveur.creerDossierRelatif('audios')
    serveur.poser('audios/e1.mp3', 'DU-COLLEGUE')
    const { miroir } = miroirSur(serveur)

    const premier = await miroir.televerserFichier('audios/e1.mp3', new Uint8Array([9]))
    expect(premier).toMatchObject({ ok: false, raison: 'existe', suggere: 'audios/e1-2.mp3' })
    // LE FICHIER DU COLLÈGUE EST INTACT :
    expect(serveur.contenuDe('audios/e1.mp3')).toBe('DU-COLLEGUE')

    const second = await miroir.televerserFichier('audios/e1-2.mp3', new Uint8Array([8, 8]))
    expect(second.ok).toBe(true)
    expect(serveur.contenuDe('audios/e1-2.mp3')).toBeDefined()
  })

  it('chemin invalide (remontée hors corpus) : refus sans requête', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    const { miroir } = miroirSur(serveur)

    const r = await miroir.televerserFichier('../dehors.mp3', new Uint8Array([1]))
    expect(r).toMatchObject({ ok: false, raison: 'chemin-invalide' })
  })

  it('téléversement STREAMÉ depuis un chemin disque : octets identiques au serveur', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('corpus.json', '{}')
    serveur.creerDossierRelatif('audios')
    const { miroir } = miroirSur(serveur)

    // Source locale binaire (non décodable UTF-8) — le chemin est passé, pas les octets ;
    // c'est le PUT qui lit le fichier en flux.
    const sourceLocale = join(mkdtempSync(join(tmpdir(), 'source-video-')), 'entretien.mp4')
    const octets = new Uint8Array(randomBytes(1_000_000))
    writeFileSync(sourceLocale, octets)

    const r = await miroir.televerserFichier('audios/entretien.mp4', sourceLocale, 'video/mp4')
    expect(r.ok).toBe(true)
    const recu = serveur.binaireDe('audios/entretien.mp4')
    expect(recu).toBeDefined()
    expect(Buffer.compare(Buffer.from(recu!), Buffer.from(octets))).toBe(0)
  })

  it('PROGRESSION : download signalé jusqu’à 100 %, fichier intact', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const gros = new Uint8Array(randomBytes(300_000))
    serveur.poserBinaire('audios/gros.mp4', gros)
    const dir = mkdtempSync(join(tmpdir(), 'miroir-progress-'))
    const cible = join(dir, 'gros.mp4')
    const evenements: Array<{ octets: number; total: number | null }> = []

    await clientSur(serveur).getBinaireFichier('audios/gros.mp4', cible, (octets, total) =>
      evenements.push({ octets, total }),
    )

    // Le pipe peut être assez rapide pour ne laisser passer que le flush final :
    // l'invariant, c'est CET événement-là.
    expect(evenements.length).toBeGreaterThan(0)
    const dernier = evenements[evenements.length - 1]
    expect(dernier.octets).toBe(gros.length)
    expect(dernier.total).toBe(gros.length) // content-length exposé par le banc
    expect(readFileSync(cible)).toEqual(Buffer.from(gros)) // rien perdu en route
    // Monotone : chaque événement voit au moins autant d'octets que le précédent.
    for (let i = 1; i < evenements.length; i++) {
      expect(evenements[i].octets).toBeGreaterThanOrEqual(evenements[i - 1].octets)
    }
  })

  it('PROGRESSION : upload signalé jusqu’à 100 %', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const client = clientSur(serveur)
    const sourceLocale = join(mkdtempSync(join(tmpdir(), 'progress-up-')), 'prise.webm')
    const octets = new Uint8Array(randomBytes(250_000))
    writeFileSync(sourceLocale, octets)
    const evenements: Array<{ octets: number; total: number | null }> = []

    await client.putFichier(
      'audios/prise.webm',
      sourceLocale,
      { contentType: 'video/webm' },
      (octetsE, totalE) => evenements.push({ octets: octetsE, total: totalE }),
    )

    const dernier = evenements[evenements.length - 1]
    expect(dernier.octets).toBe(octets.length)
    expect(dernier.total).toBe(octets.length) // taille du fichier source, connue d'avance
    expect(serveur.binaireDe('audios/prise.webm')).toBeDefined()
  })
})

describe('CoffreComptes — secret chiffré, jamais en clair sur disque', () => {
  const chiffreurFactice: Chiffreur = {
    disponible: () => true,
    chiffre: (s) => Buffer.from(`chiffré(${s})`).toString('base64'),
    dechiffre: (c) => {
      const clair = Buffer.from(c, 'base64').toString('utf8')
      if (!clair.startsWith('chiffré(')) throw new Error('indéchiffrable')
      return clair.slice(8, -1)
    },
  }

  it('enregistre, relit le mot de passe déchiffré, oublie', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'coffre-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreurFactice)
    const config = coffre.enregistrer({
      urlServeur: 'https://nuage.test/remote.php/dav/files/max/Corpus/',
      utilisateur: 'max',
      motDePasse: 'secret-app',
    })
    expect(config.id).toBe(
      idDeCorpus('https://nuage.test/remote.php/dav/files/max/Corpus', 'max'),
    )
    expect(coffre.motDePasse(config.id)).toBe('secret-app')
    // Le fichier sur disque ne contient PAS le mot de passe en clair.
    const brut = readFileSync(fichier, 'utf8')
    expect(brut).not.toContain('secret-app')
    expect(brut).toContain(Buffer.from('chiffré(secret-app)').toString('base64'))
    expect(statSync(fichier).mode & 0o777).toBe(0o600)
    expect(existsSync(`${fichier}.tmp`)).toBe(false)
    coffre.oublier(config.id)
    expect(coffre.lister()).toEqual([])
    expect(coffre.motDePasse(config.id)).toBeNull()
  })

  it('sans stockage sécurisé, conserve le secret seulement pendant la session', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'coffre-degrade-')), 'comptes.json')
    const chiffreurIndisponible: Chiffreur = {
      disponible: () => false,
      chiffre: () => {
        throw new Error('chiffrement indisponible')
      },
      dechiffre: (c) => Buffer.from(c.slice(4), 'base64').toString('utf8'),
    }
    const coffre = new CoffreComptes(fichier, chiffreurIndisponible)
    const compte = coffre.enregistrer({
      urlServeur: 'https://nuage.test/corpus',
      utilisateur: 'max',
      motDePasse: 'secret-session',
    })

    expect(coffre.motDePasse(compte.id)).toBe('secret-session')
    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('secret-session')
    expect(persiste).not.toContain(Buffer.from('secret-session').toString('base64'))
    expect(JSON.parse(persiste).comptes[compte.id].motDePasseChiffre).toBeUndefined()

    const apresRedemarrage = new CoffreComptes(fichier, chiffreurIndisponible)
    expect(apresRedemarrage.lister()).toHaveLength(1)
    expect(apresRedemarrage.motDePasse(compte.id)).toBeNull()
    apresRedemarrage.memoriserMotDePasse(compte.id, 'secret-ressaisi')
    expect(apresRedemarrage.motDePasse(compte.id)).toBe('secret-ressaisi')
    expect(readFileSync(fichier, 'utf8')).not.toContain('secret-ressaisi')
  })

  it('retire du disque un ancien secret obfusqué sans le perdre pendant la session', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'coffre-b64-')), 'comptes.json')
    const id = idDeCorpus('https://nuage.test/corpus', 'max')
    writeFileSync(
      fichier,
      JSON.stringify({
        formatVersion: 2,
        comptes: {
          [id]: {
            id,
            urlServeur: 'https://nuage.test/corpus',
            utilisateur: 'max',
            motDePasseChiffre: `b64:${Buffer.from('ancien-secret').toString('base64')}`,
          },
        },
      }),
      'utf8',
    )
    const chiffreurIndisponible: Chiffreur = {
      disponible: () => false,
      chiffre: () => {
        throw new Error('chiffrement indisponible')
      },
      dechiffre: (c) => Buffer.from(c.slice(4), 'base64').toString('utf8'),
    }
    const coffre = new CoffreComptes(fichier, chiffreurIndisponible)

    coffre.assainirSecretsPersistes()

    expect(coffre.motDePasse(id)).toBe('ancien-secret')
    expect(readFileSync(fichier, 'utf8')).not.toContain('motDePasseChiffre')
    expect(statSync(fichier).mode & 0o777).toBe(0o600)
  })

  it('un secret indéchiffrable (trousseau perdu) renvoie null, jamais une exception', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'coffre-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreurFactice)
    coffre.enregistrer({ urlServeur: 'u', utilisateur: 'm', motDePasse: 'p' })
    // Corruption directe du champ chiffré (simule un changement de plateforme OS).
    const lu = JSON.parse(readFileSync(fichier, 'utf8')) as {
      comptes: Record<string, { motDePasseChiffre: string }>
    }
    for (const c of Object.values(lu.comptes)) c.motDePasseChiffre = 'zombie'
    writeFileSync(fichier, JSON.stringify(lu), 'utf8')
    const apresRedemarrage = new CoffreComptes(fichier, chiffreurFactice)
    expect(apresRedemarrage.motDePasse(idDeCorpus('u', 'm'))).toBeNull()
  })

  it('refuse un coffre corrompu au lieu de le remplacer par un coffre vide', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'coffre-')), 'comptes.json')
    writeFileSync(fichier, '{incomplet', 'utf8')
    const coffre = new CoffreComptes(fichier, chiffreurFactice)
    expect(() => coffre.lister()).toThrow('corrompu')
    expect(readFileSync(fichier, 'utf8')).toBe('{incomplet')
  })

  it('distingue deux corpus du même serveur et deux utilisateurs du même corpus', () => {
    const racine = 'https://nuage.exemple/remote.php/dav/files/max/'
    const corpusA = idDeCorpus(`${racine}Corpus-A`, 'max')
    const corpusB = idDeCorpus(`${racine}Corpus-B`, 'max')
    expect(corpusA).not.toBe(corpusB)
    expect(idDeCorpus(`${racine}Corpus-A`, 'lea')).not.toBe(corpusA)
    expect(corpusA).toMatch(/^sha256-[A-Za-z0-9_-]{43}$/)
    expect(
      idDeCorpus('https://nuage.test/remote.php/dav/files/max/Corpus', 'max'),
    ).toBe('sha256-RBIlD2U5sR0L8HMHd4YZMjy5a4ZddNKOXbZnLcvb_lM')
  })

  it('canonise les variantes équivalentes avant de calculer l’id', () => {
    const a = ' HTTPS://Nuage.Exemple:443/remote.php/dav/files/max/Corpus/// '
    const b = 'https://nuage.exemple/remote.php/dav/files/max/Corpus'
    expect(canoniserUrlServeur(a)).toBe(b)
    expect(idDeCorpus(a, ' max ')).toBe(idDeCorpus(b, 'max'))
    expect(canoniserUrlServeur(`${b}/%7edossier?q=%6dax&f=%2f`)).toBe(
      `${b}/~dossier?q=max&f=%2F`,
    )
  })

  it('migre le coffre v1 et les récents vers les identifiants SHA-256', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coffre-migration-'))
    const fichier = join(dir, 'comptes-distant.json')
    const settings = join(dir, 'settings.json')
    const ancienId = Buffer.from('https://nuage.test/remote.php/dav/files/max/Corpus')
      .toString('base64url')
      .slice(0, 32)
    const motDePasseChiffre = chiffreurFactice.chiffre('secret-app')
    const ancienMiroir = join(dir, 'miroirs', ancienId)
    mkdirSync(ancienMiroir, { recursive: true })
    writeFileSync(join(ancienMiroir, 'corpus.json'), '{"ancien":true}', 'utf8')
    writeFileSync(
      fichier,
      JSON.stringify({
        formatVersion: 1,
        comptes: {
          [ancienId]: {
            id: ancienId,
            urlServeur: 'https://NUAGE.test:443/remote.php/dav/files/max/Corpus/',
            utilisateur: 'max',
            motDePasseChiffre,
          },
        },
      }),
      'utf8',
    )
    const nouvelId = idDeCorpus(
      'https://nuage.test/remote.php/dav/files/max/Corpus',
      'max',
    )
    writeFileSync(
      settings,
      JSON.stringify({
        recents: ['/local'],
        recentsDistant: [ancienId, nouvelId, ancienId, 'inconnu'],
        signataire: 'Max',
      }),
      'utf8',
    )

    const migrationInterrompue = new CoffreComptes(fichier, chiffreurFactice, () => {
      throw new Error('écriture des références impossible')
    })
    expect(() => migrationInterrompue.lister()).toThrow('écriture des références impossible')
    expect(JSON.parse(readFileSync(fichier, 'utf8')).formatVersion).toBe(1)

    const coffre = new CoffreComptes(fichier, chiffreurFactice, (migrations) =>
      migrerReferencesProfil(dir, migrations),
    )
    const [config] = coffre.lister()
    expect(config.id).toBe(nouvelId)
    expect(coffre.motDePasse(nouvelId)).toBe('secret-app')
    expect(existsSync(ancienMiroir)).toBe(true)
    expect(existsSync(join(dir, 'miroirs', nouvelId))).toBe(false)
    expect(JSON.parse(readFileSync(fichier, 'utf8')).formatVersion).toBe(2)
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({
      recents: ['/local'],
      recentsDistant: [nouvelId, 'inconnu'],
      signataire: 'Max',
    })
  })
})
