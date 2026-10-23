import { describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { preparerContexteNextcloud } from '../../src/main/distant/contexte'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const ID = 'e1'
const identite = () => ({
  userId: 'max',
  machineId: 'poste-max',
  sessionId: 'session-courante',
})

function corpus(): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION,
    nom: 'Corpus distant',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      [ID]: {
        titre: 'Entretien un',
        date: null,
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    },
  }
}

function entretien(texte: string): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', text: texte }] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
  }
}

function banc() {
  const serveur = new ServeurWebDAVMemoire()
  serveur.poser('corpus.json', JSON.stringify(corpus()))
  serveur.poser(`entretiens/${ID}.json`, JSON.stringify(entretien('serveur')))
  const client = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-contexte-distant-'))
  return { serveur, client, dirLocal }
}

describe('contexte de corpus distant', () => {
  test('prépare toute l’ouverture sans activer la présence', async () => {
    const b = banc()

    const preparation = await preparerContexteNextcloud({
      id: 'compte-1',
      dirLocal: b.dirLocal,
      client: b.client,
      identite,
      verrouNatif: false,
    })

    expect(preparation.corpus.nom).toBe('Corpus distant')
    expect(preparation.contexte.id).toBe('compte-1')
    expect(preparation.contexte.store.lectureSeule).toBe(true)
    expect(preparation.contexte.sessions.idsTenus()).toEqual([])
    expect(b.serveur.contenuDe('presence/max-poste-max.json')).toBeUndefined()

    preparation.contexte.demarrer()
    await preparation.contexte.presence.battre()
    expect(b.serveur.contenuDe('presence/max-poste-max.json')).toContain('poste-max')
    await expect(preparation.contexte.actualiser()).resolves.toMatchObject({
      telecharges: [],
      corbeille: [],
      verrous: [],
      presences: [],
    })

    await preparation.contexte.fermer()
    await expect(preparation.contexte.actualiser()).rejects.toThrow('fermé')
  })

  test('un inventaire de verrous en panne n’empêche pas le tirage', async () => {
    const b = banc()
    const client = new ClientWebDAV(
      { baseUrl: b.serveur.baseUrl, identifiants: b.serveur.identifiants },
      async (requete, init) => {
        const methode = init?.method ?? (requete instanceof Request ? requete.method : 'GET')
        const url = requete instanceof Request ? requete.url : String(requete)
        return methode === 'PROPFIND' && new URL(url).pathname.endsWith('/verrous')
          ? new Response(null, { status: 503 })
          : b.serveur.fetch(requete, init)
      },
    )
    const preparation = await preparerContexteNextcloud({
      id: 'compte-1',
      dirLocal: b.dirLocal,
      client,
      identite,
      verrouNatif: false,
    })

    // Le contenu est consultable, et l'interface est prévenue que les badges
    // ne disent rien.
    expect(preparation.verrousIndisponibles).toBe(true)
    await expect(preparation.contexte.actualiser()).resolves.toMatchObject({
      verrous: [],
      verrousIndisponibles: true,
    })
    expect(preparation.contexte.store.lireEntretien(ID)).toMatchObject({ ok: true })
  })

  test('porte les intentions de session et de définitions', async () => {
    const b = banc()
    const preparation = await preparerContexteNextcloud({
      id: 'compte-1',
      dirLocal: b.dirLocal,
      client: b.client,
      identite,
      verrouNatif: false,
    })

    await expect(preparation.contexte.ouvrirEntretienPourEdition(ID))
      .resolves.toMatchObject({ ok: true, acces: 'edition' })
    await expect(preparation.contexte.fermerEntretien(ID))
      .resolves.toEqual({ fermee: true })

    await preparation.contexte.executerDefinitions(() =>
      preparation.contexte.store.renommerEntretien(ID, 'Titre modifié'))
    expect(preparation.contexte.store.ouvrir().membership[ID].titre).toBe('Titre modifié')

    const attendu = preparation.contexte.store.ouvrir().lexico!
    await preparation.contexte.executerDefinitions(() =>
      preparation.contexte.store.traitementsLexicoCommander({
        type: 'remplacer',
        attendu,
        traitements: { ...attendu, motsOutils: ['le'] },
      }))
    expect(preparation.contexte.store.ouvrir().lexico?.motsOutils).toEqual(['le'])
    const distant = JSON.parse(b.serveur.contenuDe('corpus.json')!) as CorpusFichier
    expect(distant.lexico?.motsOutils).toEqual(['le'])

    await preparation.contexte.fermer()
  })

  test('protège une copie journalisée avant le premier tirage complet', async () => {
    const b = banc()
    mkdirSync(join(b.dirLocal, 'entretiens'), { recursive: true })
    mkdirSync(join(b.dirLocal, 'sessions'), { recursive: true })
    writeFileSync(join(b.dirLocal, 'corpus.json'), JSON.stringify(corpus()), 'utf8')
    writeFileSync(
      join(b.dirLocal, 'entretiens', `${ID}.json`),
      JSON.stringify(entretien('travail local à récupérer')),
      'utf8',
    )
    writeFileSync(
      join(b.dirLocal, 'sessions', '.verrous-natifs.json'),
      JSON.stringify({ [ID]: '2026-01-01T00:00:00.000Z' }),
      'utf8',
    )

    const preparation = await preparerContexteNextcloud({
      id: 'compte-1',
      dirLocal: b.dirLocal,
      client: b.client,
      identite,
      verrouNatif: false,
    })

    const local = JSON.parse(
      readFileSync(join(b.dirLocal, 'entretiens', `${ID}.json`), 'utf8'),
    ) as EntretienFichier
    expect(local.corpsTexte).toMatchObject({
      content: [expect.objectContaining({ text: 'travail local à récupérer' })],
    })
    expect(preparation.contexte.sessions.idsRecuperablesLocalement()).toEqual([ID])

    await preparation.contexte.fermer()
  })
})
