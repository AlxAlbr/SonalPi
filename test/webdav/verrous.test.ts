/**
 * Tests de la couche VERROU contre le serveur WebDAV
 * embarqué : test-and-set atomique, battement/preuve de vie, détection de
 * forçage, péremption (horloges décalées), forçage concurrent.
 */

import { describe, expect, it } from 'vitest'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ProviderPutConditionnel, contenuVerrou } from '../../src/main/verrous/providerPutConditionnel'
import { MARGE_DERIVE_S, estPerime, type ContenuVerrou } from '../../src/main/verrous/types'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const CHEMIN = 'verrous/ent-abc.lock.json'
const IDENTITE_MAX = () => ({ userId: 'max', machineId: 'portable-max', sessionId: 's-MAX' })
const IDENTITE_OLIVIER = () => ({ userId: 'olivier', machineId: 'fixe-olivier', sessionId: 's-OLI' })

function providerSur(
  serveur: ServeurWebDAVMemoire,
  identite = IDENTITE_MAX,
): ProviderPutConditionnel {
  return new ProviderPutConditionnel(
    new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, serveur.fetch),
    identite,
  )
}

describe('Acquisition — test-and-set atomique', () => {
  it('premier demandeur : ok avec un ETag de garde', async () => {
    const p = providerSur(new ServeurWebDAVMemoire())
    const r = await p.acquerir(CHEMIN)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.etag).toMatch(/^etag-/)
  })

  it('demandeur simultané : le SERVEUR tranche → refus avec l\u2019identité du détenteur', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const pMax = providerSur(serveur)
    const pOlivier = providerSur(serveur, IDENTITE_OLIVIER)
    await pMax.acquerir(CHEMIN)
    const r = await pOlivier.acquerir(CHEMIN)
    expect(r.ok).toBe(false)
    if (!r.ok && r.tenuPar) {
      expect(r.tenuPar.userId).toBe('max')
      expect(r.tenuPar.sessionId).toBe('s-MAX')
    } else {
      throw new Error('refus sans détenteur affichable')
    }
  })

  it('le contenu posé porte l\u2019identité complète', async () => {
    const serveur = new ServeurWebDAVMemoire()
    await providerSur(serveur).acquerir(CHEMIN)
    const brut = JSON.parse(serveur.contenuDe(CHEMIN)!) as ContenuVerrou
    expect(brut).toMatchObject({
      userId: 'max',
      machineId: 'portable-max',
      sessionId: 's-MAX',
      ttl: 300,
    })
    expect(brut.refreshedAt).toBe(brut.acquiredAt) // fraîchement posé
  })
})

describe('Battement — preuve de vie ET détection de forçage', () => {
  it('battement normal : ok, refreshedAt avance', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const p = providerSur(serveur)
    await p.acquerir(CHEMIN)
    const avant = JSON.parse(serveur.contenuDe(CHEMIN)!).refreshedAt as string
    // Le temps passe (horloge injectée par la date du contenu re-battu).
    const r = await new Promise<{ ok: boolean }>((resolve) =>
      setTimeout(async () => resolve(await p.battre(CHEMIN)), 15),
    )
    expect(r.ok).toBe(true)
    const apres = JSON.parse(serveur.contenuDe(CHEMIN)!).refreshedAt as string
    expect(apres >= avant || apres === avant).toBe(true)
  })

  it('notre verrou a été FORCÉ : le battement échoue → rétrogradation', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const pMax = providerSur(serveur)
    const pOlivier = providerSur(serveur, IDENTITE_OLIVIER)
    await pMax.acquerir(CHEMIN)
    // Oliviers force le verrou périmé de max (DELETE + PUT atomiques).
    await pOlivier.forcer(CHEMIN)
    // Au battement suivant, max apprend la nouvelle.
    const r = await pMax.battre(CHEMIN)
    expect(r.ok).toBe(false)
    // Et une tentative de libération de max ne détruit PAS le verrou d'olivier.
    await pMax.liberer(CHEMIN)
    const etat = await pOlivier.etat(CHEMIN)
    expect(etat?.sessionId).toBe('s-OLI')
  })

  it('battre sans jamais avoir acquis : refus immédiat', async () => {
    const p = providerSur(new ServeurWebDAVMemoire())
    await expect(p.battre(CHEMIN)).resolves.toMatchObject({ ok: false })
  })
})

describe('Libération et état', () => {
  it('libérer rend le verrou disponible ; libérer deux fois est inoffensif', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const p = providerSur(serveur)
    await p.acquerir(CHEMIN)
    await p.liberer(CHEMIN)
    await expect(p.etat(CHEMIN)).resolves.toBeNull()
    await expect(p.liberer(CHEMIN)).resolves.toBeUndefined() // idempotent
    // Un autre peut maintenant acquérir.
    await expect(providerSur(serveur, IDENTITE_OLIVIER).acquerir(CHEMIN)).resolves.toMatchObject({
      ok: true,
    })
  })

  it('état : null sur verrou absent ou fichier illisible', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const p = providerSur(serveur)
    await expect(p.etat('verrous/absent.lock.json')).resolves.toBeNull()
    serveur.creerDossierRelatif('verrous')
    serveur.poser('verrous/corrompu.lock.json', '{pas du json')
    await expect(p.etat('verrous/corrompu.lock.json')).resolves.toBeNull()
  })
})

describe('Forçage — verrou PÉRIMÉ uniquement, course entre forçeurs', () => {
  it('forcer un verrou absent équivaut à acquérir', async () => {
    const p = providerSur(new ServeurWebDAVMemoire())
    const r = await p.forcer(CHEMIN)
    expect(r.ok).toBe(true)
  })

  it('course : deux forçages simultanés → un seul gagne chaque étape', async () => {
    const serveur = new ServeurWebDAVMemoire()
    // Un verrou périmé posé directement sur le serveur.
    serveur.poser(
      CHEMIN,
      JSON.stringify(contenuVerrou({ userId: 'x', machineId: 'm', sessionId: 's-X' }, 300)),
    )
    const pMax = providerSur(serveur)
    const pOlivier = providerSur(serveur, IDENTITE_OLIVIER)
    const [rMax, rOli] = await Promise.all([pMax.forcer(CHEMIN), pOlivier.forcer(CHEMIN)])
    const gagnants = [rMax, rOli].filter((r) => r.ok)
    expect(gagnants).toHaveLength(1)
    const perdant = gagnants[0] === rMax ? rOli : rMax
    expect(perdant.ok).toBe(false)
  })
})

describe('Péremption — fonctions pures, horloges décalées ±10 min', () => {
  const base = contenuVerrou(
    { userId: 'x', machineId: 'm', sessionId: 's' },
    300,
    new Date('2026-08-01T10:00:00Z'),
  )

  it('TTL + marge pas encore écoulée : non périmé (même avec 9 min de décale)', () => {
    const maintenant = Date.parse('2026-08-01T10:00:00Z') + (300 + MARGE_DERIVE_S - 540) * 1000
    expect(estPerime(base, maintenant)).toBe(false)
  })

  it('TTL + marge dépassée : périmé', () => {
    const maintenant = Date.parse('2026-08-01T10:00:00Z') + (300 + MARGE_DERIVE_S + 60) * 1000
    expect(estPerime(base, maintenant)).toBe(true)
  })

  it('exactement à la limite : pas encore périmé (la marge protège)', () => {
    const limite = Date.parse(base.refreshedAt) + base.ttl * 1000 + MARGE_DERIVE_S * 1000
    expect(estPerime(base, limite)).toBe(false)
    expect(estPerime(base, limite + 1)).toBe(true)
  })

  it('un verlu rafraîchi repousse sa péremption', () => {
    const rafraichi: ContenuVerrou = { ...base, refreshedAt: '2026-08-01T10:07:00Z' }
    const t7min = Date.parse('2026-08-01T10:07:00Z')
    expect(estPerime(rafraichi, t7min)).toBe(false)
  })
})

describe('Régression — acquérir → battre → libérer (leçon du contrat réel)', () => {
  it('la libération porte l\u2019ETag APRÈS battement, pas celui de l\u2019acquisition', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const p = providerSur(serveur)
    await p.acquerir(CHEMIN)
    const b = await p.battre(CHEMIN)
    expect(b.ok).toBe(true)
    await p.liberer(CHEMIN)
    // Sans mise à jour de la garde au battement, le DELETE échouait en 412
    // (avalé par l'idempotence) et le verrou restait posé pour toujours.
    await expect(p.etat(CHEMIN)).resolves.toBeNull()
  })
})
