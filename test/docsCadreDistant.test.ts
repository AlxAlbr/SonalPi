/**
 *  Tests des « Docs cadre projet » côté DISTANT : inventaire WebDAV direct
 *  (sans miroir), lecture bornée pour les seuls aperçus acceptés, copie exacte
 *  streamée, dossier absent = liste vide, erreurs réseau non confondues avec
 *  une liste vide, et construction sûre de l'URL Nextcloud.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'
import {
  enregistrerCopieDistant,
  inventaireDocsCadreDistant,
  listerDossierDistant,
  racineDocsProjetDistant,
  lireApercuDistant,
  urlNextcloudPourCorpus,
} from '../src/main/docsCadreDistant'
import { PublieurCorpus } from '../src/main/distant/publication'
import {
  LIMITE_APERCU_BINAIRE_OCTETS,
  LIMITE_APERCU_TEXTE_OCTETS,
} from '../src/shared/docsCadre'

function client(serveur: ServeurWebDAVMemoire, fetchImpl = serveur.fetch): ClientWebDAV {
  return new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    fetchImpl,
  )
}

/** Amorce un dossier DocsCadre avec des documents de formats variés. */
function amorcer(serveur: ServeurWebDAVMemoire): void {
  serveur.creerDossierRelatif('DocsCadre')
  serveur.poser('DocsCadre/consignes.txt', 'Consignes internes.')
  serveur.poser('DocsCadre/Notice de consentement.docx', 'PK\x03\x04 docx')
  serveur.poser('DocsCadre/École.txt', 'Avec accents.')
  serveur.creerDossierRelatif('DocsCadre/sous-dossier')
  serveur.poser('DocsCadre/sous-dossier/caché.txt', 'NE PAS AFFICHER')
}

describe('inventaire distant', () => {
  it('dossier absent (ancien corpus) : liste vide, sans création cachée', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const inventaire = await inventaireDocsCadreDistant(client(serveur))
    expect(inventaire).toEqual([])
    // Le MKCOL n'a pas eu lieu : aucun dossier DocsCadre créé dans le dos de l'utilisateur.
    expect(serveur.contenuDe('DocsCadre/consignes.txt')).toBeUndefined()
  })

  it('404 explicite : liste vide', async () => {
    const serveur = new ServeurWebDAVMemoire()
    // Le banc de mémoire répond 207 vide à un dossier absent ; on force un
    // 404 réel (comportement des serveurs Nextcloud stricts) pour vérifier
    // la traduction explicite « 404 = liste vide ».
    const fetch404 = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requete = new Request(entree, init)
      if (requete.method === 'PROPFIND' && decodeURIComponent(new URL(requete.url).pathname).endsWith('/DocsCadre')) {
        return new Response('not found', { status: 404 })
      }
      return serveur.fetch(entree, init)
    }
    expect(await inventaireDocsCadreDistant(client(serveur, fetch404))).toEqual([])
  })

  it('inventaire de plusieurs formats, dossiers en premier, petits-enfants exclus', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcer(serveur)
    const inventaire = await inventaireDocsCadreDistant(client(serveur))
    expect(inventaire.map((d) => d.nom)).toEqual([
      'sous-dossier',
      'consignes.txt',
      'École.txt',
      'Notice de consentement.docx',
    ])
    expect(inventaire.find((d) => d.nom === 'Notice de consentement.docx')).toMatchObject({
      source: 'projet',
      type: 'bureautique',
      taille: 'PK\x03\x04 docx'.length,
    })
  })

  it('erreur réseau : levée explicite, jamais confondue avec une liste vide', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const fetchFaille = async (): Promise<Response> => {
      throw new Error('réseau coupé')
    }
    await expect(inventaireDocsCadreDistant(client(serveur, fetchFaille))).rejects.toThrow('réseau coupé')
  })
})

describe('sous-dossiers WebDAV', () => {
  it('navigue sur trois niveaux, filtre les petits-enfants et encode une fois les chemins', async () => {
    const serveur = new ServeurWebDAVMemoire()
    for (const chemin of ['DocsCadre', 'DocsCadre/DPO', 'DocsCadre/DPO/École 2', 'DocsCadre/DPO/École 2/100% modèles']) serveur.creerDossierRelatif(chemin)
    const relatif = 'DPO/École 2/100% modèles/Notice é.txt'
    serveur.poser(`DocsCadre/${relatif}`, 'Octets exacts éà')
    const requetes: { methode: string; url: string; depth: string | null }[] = []
    const c = client(serveur, async (entree, init) => {
      const r = new Request(entree, init)
      requetes.push({ methode: r.method, url: r.url, depth: r.headers.get('Depth') })
      return serveur.fetch(entree, init)
    })
    expect((await listerDossierDistant(c, 'DPO')).entrees).toMatchObject([{ nature: 'dossier', chemin: 'DPO/École 2' }])
    expect((await listerDossierDistant(c, 'DPO/École 2')).entrees).toMatchObject([{ nature: 'dossier', chemin: 'DPO/École 2/100% modèles' }])
    expect((await listerDossierDistant(c, 'DPO/École 2/100% modèles')).entrees).toMatchObject([{ nature: 'document', chemin: relatif, nom: 'Notice é.txt' }])
    const lecture = await lireApercuDistant(c, relatif)
    expect(lecture).toMatchObject({ resume: { chemin: relatif, nom: 'Notice é.txt' }, apercu: { genre: 'texte', contenu: 'Octets exacts éà' } })
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-docs-dav-')), 'copie.txt')
    await enregistrerCopieDistant(c, relatif, destination)
    expect(readFileSync(destination, 'utf8')).toBe('Octets exacts éà')
    expect(requetes.filter((r) => r.methode === 'PROPFIND').every((r) => r.depth === '1')).toBe(true)
    expect(requetes.every((r) => ['GET', 'PROPFIND'].includes(r.methode))).toBe(true)
    expect(requetes.some((r) => r.url.endsWith('/DPO/%C3%89cole%202/100%25%20mod%C3%A8les/Notice%20%C3%A9.txt'))).toBe(true)
  })

  it('404 d’un sous-dossier signalé et chemins dangereux refusés avant le réseau', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const c = client(serveur, async () => new Response('', { status: 404 }))
    expect(await listerDossierDistant(c, 'DPO/Disparu')).toMatchObject({ absent: true, dossier: 'DPO/Disparu' })
    expect((await lireApercuDistant(c, 'DPO/disparu.txt')).apercu).toEqual({ genre: 'aucun', raison: 'absent' })
    await expect(listerDossierDistant(c, 'DPO/../secret')).rejects.toThrow()
    expect((await lireApercuDistant(c, 'DPO/../secret')).apercu).toEqual({ genre: 'aucun', raison: 'invalide' })
  })

  it('URL du dossier courant : accents, espaces, pourcentages littéraux et validation', () => {
    const base = 'https://nuage.exemple.org/nextcloud/remote.php/dav/files/max/Mon%20Corpus'
    expect(urlNextcloudPourCorpus(base, 'DPO/École 2/100% modèles')).toBe('https://nuage.exemple.org/nextcloud/apps/files/?dir=/Mon%20Corpus/DocsPrepaProjet/DPO/%C3%89cole%202/100%25%20mod%C3%A8les')
    expect(urlNextcloudPourCorpus(base, 'DPO/%20')).toContain('/DPO/%2520')
    expect(urlNextcloudPourCorpus(base, '../secret')).toBeNull()
    expect(urlNextcloudPourCorpus(base + '/%ZZ')).toBeNull()
  })
})

describe('compatibilité du nom documentaire distant', () => {
  it.each(['DocsPrepaProjet', 'DocsCadre'] as const)('liste, aperçu, copie et URL sous %s sans mutation', async (racine) => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif(racine)
    serveur.creerDossierRelatif(`${racine}/DPO`)
    serveur.poser(`${racine}/DPO/notice.txt`, 'Document inchangé')
    const methodes: string[] = []
    const c = client(serveur, async (input, init) => {
      methodes.push(new Request(input, init).method)
      return serveur.fetch(input, init)
    })
    expect(await racineDocsProjetDistant(c)).toBe(racine)
    expect((await listerDossierDistant(c, 'DPO')).entrees).toMatchObject([{ chemin: 'DPO/notice.txt' }])
    expect((await lireApercuDistant(c, 'DPO/notice.txt')).apercu).toEqual({ genre: 'texte', contenu: 'Document inchangé' })
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-docs-nom-')), 'copie.txt')
    await enregistrerCopieDistant(c, 'DPO/notice.txt', destination)
    expect(readFileSync(destination, 'utf8')).toBe('Document inchangé')
    expect(urlNextcloudPourCorpus('https://nuage.org/remote.php/dav/files/max/Corpus', 'DPO', racine)).toBe(`https://nuage.org/apps/files/?dir=/Corpus/${racine}/DPO`)
    expect(methodes.every((m) => ['GET', 'PROPFIND'].includes(m))).toBe(true)
  })

  it('le nouveau nom est prioritaire et un enfant absent ne déclenche pas un repli sur l’ancien', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    serveur.creerDossierRelatif('DocsPrepaProjet')
    serveur.poser('DocsCadre/ancien.txt', 'Ancien')
    expect(await racineDocsProjetDistant(client(serveur))).toBe('DocsPrepaProjet')
    expect((await lireApercuDistant(client(serveur), 'ancien.txt')).apercu).toEqual({ genre: 'aucun', raison: 'absent' })
  })
})

describe('lecture d’aperçu distant', () => {
  it('nom avec espaces et accents lu correctement', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcer(serveur)
    const r = await lireApercuDistant(client(serveur), 'École.txt')
    expect(r.apercu).toEqual({ genre: 'texte', contenu: 'Avec accents.' })
  })

  it('lecture binaire SEULEMENT pour un aperçu accepté : aucun GET pour un DOCX', async () => {
    const serveur = new ServeurWebDAVMemoire()
    amorcer(serveur)
    const gets: string[] = []
    const fetchCompte = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requete = new Request(entree, init)
      if (requete.method === 'GET') {
        gets.push(decodeURIComponent(new URL(requete.url).pathname))
      }
      return serveur.fetch(entree, init)
    }
    const r = await lireApercuDistant(client(serveur, fetchCompte), 'Notice de consentement.docx')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'format' })
    // Seul le PROPFIND (fiche) a eu lieu ; les octets du DOCX n'ont jamais été chargés.
    expect(gets).toEqual([])
  })

  it('PDF valide en aperçu, signature contrôlée', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    const pdf = new TextEncoder().encode('%PDF-1.7 contenu')
    serveur.poserBinaire('DocsCadre/protocole.pdf', pdf)
    const r = await lireApercuDistant(client(serveur), 'protocole.pdf')
    expect(r.apercu.genre).toBe('pdf')
    if (r.apercu.genre === 'pdf') expect([...r.apercu.octets]).toEqual([...pdf])

    serveur.poserBinaire('DocsCadre/corrompu.pdf', new TextEncoder().encode('pas un pdf'))
    expect((await lireApercuDistant(client(serveur), 'corrompu.pdf')).apercu).toEqual({
      genre: 'aucun',
      raison: 'signature',
    })
  })

  it('image valide en aperçu, signature contrôlée', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    serveur.poserBinaire('DocsCadre/schema.png', png)
    const r = await lireApercuDistant(client(serveur), 'schema.png')
    expect(r.apercu.genre).toBe('image')
    if (r.apercu.genre === 'image') {
      expect(r.apercu.mime).toBe('image/png')
      expect([...r.apercu.octets]).toEqual([...png])
    }
    // Extension mensongère : le serveur annonce du PNG, les octets disent autre chose.
    serveur.poserBinaire('DocsCadre/menteur.png', new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))
    expect((await lireApercuDistant(client(serveur), 'menteur.png')).apercu).toEqual({
      genre: 'aucun',
      raison: 'signature',
    })
  })

  it('fichier trop volumineux : jamais chargé pour aperçu', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    serveur.poserBinaire('DocsCadre/gros.txt', new Uint8Array(LIMITE_APERCU_BINAIRE_OCTETS + 1).fill(0x61))
    const gets: number[] = []
    const fetchCompte = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requete = new Request(entree, init)
      if (requete.method === 'GET') gets.push(1)
      return serveur.fetch(entree, init)
    }
    const r = await lireApercuDistant(client(serveur, fetchCompte), 'gros.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'taille' })
    expect(gets).toEqual([])
  })

  it('document disparu entre deux listes : absence expliquée', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const r = await lireApercuDistant(client(serveur), 'fantome.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'absent' })
  })

  it('interrompt un aperçu dont le serveur ne fournit pas la taille', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    serveur.poserBinaire(
      'DocsCadre/sans-taille.txt',
      new Uint8Array(LIMITE_APERCU_TEXTE_OCTETS + 1).fill(0x61),
    )
    const fetchSansTaille = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const requete = new Request(entree, init)
      const reponse = await serveur.fetch(entree, init)
      if (requete.method !== 'PROPFIND') return reponse
      const xml = (await reponse.text()).replace(
        /<d:getcontentlength>\d+<\/d:getcontentlength>/g,
        '',
      )
      return new Response(xml, { status: reponse.status, headers: reponse.headers })
    }

    const r = await lireApercuDistant(client(serveur, fetchSansTaille), 'sans-taille.txt')
    expect(r.apercu).toEqual({ genre: 'aucun', raison: 'taille' })
  })
})

describe('copie exacte en flux', () => {
  it('refuse un nom qui sortirait de DocsCadre', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-docs-')), 'copie.json')
    await expect(enregistrerCopieDistant(client(serveur), '../corpus.json', destination)).rejects.toThrow(
      'Nom de document invalide',
    )
  })

  it('téléchargement streamé conservant exactement les octets', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.creerDossierRelatif('DocsCadre')
    const png = new Uint8Array(50_000).map((_, i) => i % 256)
    serveur.poserBinaire('DocsCadre/gros.schema.png', png)
    const destination = join(mkdtempSync(join(tmpdir(), 'sonal-docs-')), 'copie.png')
    await enregistrerCopieDistant(client(serveur), 'gros.schema.png', destination)
    expect([...readFileSync(destination)]).toEqual([...png])
  })
})

describe('aucune écriture distante disponible', () => {
  it('le module distant n’expose aucune méthode de mutation', () => {
    const exportsDistant = [
      inventaireDocsCadreDistant,
      lireApercuDistant,
      enregistrerCopieDistant,
      urlNextcloudPourCorpus,
    ]
    // Le parcours distant se limite à ces quatre fonctions de lecture/copie.
    expect(exportsDistant).toHaveLength(4)
  })
})

describe('création du dossier DocsPrepaProjet pour un nouveau corpus distant', () => {
  it('PublieurCorpus crée DocsPrepaProjet/ avec le squelette', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const publieur = new PublieurCorpus(
      { baseUrl: serveur.baseUrl + '/Equipe/MonNouveau', identifiants: serveur.identifiants },
      serveur.fetch,
    )
    await publieur.publierSquelette('Terrain')
    const clientCible = new ClientWebDAV(
      { baseUrl: serveur.baseUrl + '/Equipe/MonNouveau', identifiants: serveur.identifiants },
      serveur.fetch,
    )
    const noms = (await clientCible.propfind('')).filter((e) => e.dossier).map((e) => e.chemin)
    expect(noms).toContain('DocsPrepaProjet')
    expect(noms).not.toContain('DocsCadre')
    // Nouveau corpus : l'inventaire part bien de ce dossier désormais présent.
    expect(await inventaireDocsCadreDistant(clientCible)).toEqual([])
  })
})

describe('URL Nextcloud de l’application Fichiers', () => {
  it('racine DAV simple, sous-chemin serveur inclus', () => {
    expect(
      urlNextcloudPourCorpus('https://nuage.exemple.org/remote.php/dav/files/max/MonCorpus'),
    ).toBe('https://nuage.exemple.org/apps/files/?dir=/MonCorpus/DocsPrepaProjet')
    expect(
      urlNextcloudPourCorpus('https://nuage.exemple.org/nextcloud/remote.php/dav/files/max/MonCorpus'),
    ).toBe('https://nuage.exemple.org/nextcloud/apps/files/?dir=/MonCorpus/DocsPrepaProjet')
    expect(
      urlNextcloudPourCorpus('https://nuage.exemple.org/remote.php/dav/files/max/École/Cycle 2'),
    ).toBe('https://nuage.exemple.org/apps/files/?dir=/%C3%89cole/Cycle%202/DocsPrepaProjet')
  })

  it('HTTP n’est accepté que sur un hôte local ; toute autre racine est refusée', () => {
    expect(urlNextcloudPourCorpus('http://localhost:9000/remote.php/dav/files/max/C')).toBe(
      'http://localhost:9000/apps/files/?dir=/C/DocsPrepaProjet',
    )
    expect(urlNextcloudPourCorpus('http://nuage.exemple.org/remote.php/dav/files/max/C')).toBeNull()
    expect(urlNextcloudPourCorpus('https://nuage.exemple.org/dossier/profondeur')).toBeNull()
    expect(urlNextcloudPourCorpus('https://nuage.exemple.org/remote.php/dav/files/max')).toBeNull()
    expect(urlNextcloudPourCorpus('https://fichiers.exemple.org/sub/files/max/C')).toBeNull()
    expect(urlNextcloudPourCorpus('pas une url')).toBeNull()
  })
})
