/**
 * Banc de conformité WebDAV (plan-multiuser.md §12) : le client, les sondes et
 * le miroir joués contre le serveur embarqué, SANS autre hypothèse sur lui que
 * le contrat (préconditions, ETags, multistatus).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ClientWebDAV,
  ErreurHttp,
  analyserMultistatus,
} from '../../src/main/webdav/client'
import { profilerServeur, sonderPreconditions } from '../../src/main/webdav/sondes'
import { MiroirWebDAV } from '../../src/main/miroir'
import { CoffreComptes, idDeCorpus, type Chiffreur } from '../../src/main/distant/coffre'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

function clientSur(serveur: ServeurWebDAVMemoire): ClientWebDAV {
  return new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
}

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
    // …puis MOVE vers corbeille/ (suppression §4.7), destination occupée refusée.
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
})

describe('Sondes — profil de capacités mesuré sur le serveur réel', () => {
  it('un serveur correct passe la sonde §5.4 ; files_lock absent → variante B', async () => {
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

describe('MiroirWebDAV — pull incrémental §3.1', () => {
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

describe('CoffreComptes — secret chiffré, jamais en clair sur disque', () => {
  const chiffreurFactice: Chiffreur = {
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
    expect(config.id).toBe(idDeCorpus('https://nuage.test/remote.php/dav/files/max/Corpus'))
    expect(coffre.motDePasse(config.id)).toBe('secret-app')
    // Le fichier sur disque ne contient PAS le mot de passe en clair.
    const brut = readFileSync(fichier, 'utf8')
    expect(brut).not.toContain('secret-app')
    expect(brut).toContain(Buffer.from('chiffré(secret-app)').toString('base64'))
    coffre.oublier(config.id)
    expect(coffre.lister()).toEqual([])
    expect(coffre.motDePasse(config.id)).toBeNull()
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
    expect(coffre.motDePasse(idDeCorpus('u'))).toBeNull()
  })
})
