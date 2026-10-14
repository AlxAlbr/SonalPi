import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientGitLab, autorisationJetonPersonnel } from '../../src/main/gitlab/client'
import { ClientLfsGitLab, identifierFichierGitLab, pointeurLfsGitLab } from '../../src/main/gitlab/lfs'
import { installerFluxGitLab, TransfertGitLab } from '../../src/main/gitlab/transfert'

const URL_INSTANCE = 'https://gitlab.example.org'
const racines: string[] = []
afterEach(() => racines.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function dossier() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-transferts-gitlab-'))
  racines.push(dir)
  return dir
}
function identite(octets: Uint8Array) {
  return { taille: octets.byteLength, sha256: createHash('sha256').update(octets).digest('hex') }
}
function reponseFlux(octets: Uint8Array) {
  let position = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controleur) {
      if (position === octets.byteLength) return controleur.close()
      const fin = Math.min(position + 16 * 1024, octets.byteLength)
      controleur.enqueue(octets.slice(position, fin))
      position = fin
    },
  }))
}

function lfs(options: { objetExistant?: boolean; corrompre?: boolean; origineExterne?: boolean; perdreReponse?: boolean } = {}) {
  let objet = Buffer.alloc(0)
  let oid = ''
  const taillesMorceaux: number[] = []
  const fetchImpl = vi.fn(async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree))
    if (url.pathname.endsWith('/objects/batch')) {
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Basic ${Buffer.from('user:secret').toString('base64')}`)
      const demande = JSON.parse(String(init?.body))
      oid = demande.objects[0].oid
      const action = {
        href: `${options.origineExterne ? 'https://autre.example.org' : URL_INSTANCE}/objet`,
        header: { Authorization: 'acces-limite-objet' },
      }
      return new Response(JSON.stringify({ objects: [{ ...demande.objects[0], actions: demande.operation === 'upload'
        ? options.objetExistant ? {} : { upload: action, verify: { ...action, href: `${URL_INSTANCE}/verification` } }
        : { download: action },
      }] }))
    }
    expect(new Headers(init?.headers).get('Authorization')).toBe('acces-limite-objet')
    expect(new Headers(init?.headers).get('PRIVATE-TOKEN')).toBeNull()
    expect(init?.redirect).toBe('error')
    if (url.pathname === '/verification') {
      expect(JSON.parse(String(init?.body)).oid).toBe(oid)
      return new Response(null, { status: 200 })
    }
    if (init?.method === 'PUT') {
      expect(init.body).toBeInstanceOf(ReadableStream)
      const lecteur = (init.body as ReadableStream<Uint8Array>).getReader()
      const morceaux: Buffer[] = []
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        taillesMorceaux.push(value.byteLength)
        morceaux.push(Buffer.from(value))
      }
      objet = Buffer.concat(morceaux)
      if (options.perdreReponse) throw new Error('Réponse perdue après upload')
      return new Response(null)
    }
    return reponseFlux(options.corrompre ? Buffer.from('objet corrompu') : objet)
  })
  const client = new ClientLfsGitLab({
    urlInstance: URL_INSTANCE, urlDepot: `${URL_INSTANCE}/groupe/corpus.git`, utilisateur: 'user',
    autorisation: autorisationJetonPersonnel('secret'),
  }, fetchImpl)
  return { client, fetchImpl, taillesMorceaux, donnerObjet(contenu: Buffer) { objet = contenu } }
}

describe('transferts binaires GitLab et LFS simulés', () => {
  it('copie un flux binaire vérifié sans décodage texte ni écrasement', async () => {
    const contenu = Buffer.alloc(2 * 1024 * 1024 + 17, 0xff)
    const destination = join(dossier(), 'audio.mp3')
    const progression = vi.fn()
    await installerFluxGitLab(reponseFlux(contenu), destination, identite(contenu), progression)
    expect(readFileSync(destination).equals(contenu)).toBe(true)
    expect(progression).toHaveBeenLastCalledWith(contenu.byteLength, contenu.byteLength)
    await expect(installerFluxGitLab(reponseFlux(contenu), destination, identite(contenu))).rejects.toThrow()
    expect(readFileSync(destination).equals(contenu)).toBe(true)
  })

  it.each(['taille', 'empreinte'])('ne laisse aucune copie visible après une vérification incorrecte (%s)', async (erreur) => {
    const contenu = Buffer.from([0, 255, 2, 3])
    const destination = join(dossier(), 'audio.mp3')
    const attendue = identite(contenu)
    if (erreur === 'taille') attendue.taille -= 1
    else attendue.sha256 = 'a'.repeat(64)
    await expect(installerFluxGitLab(reponseFlux(contenu), destination, attendue)).rejects.toThrow()
    expect(existsSync(destination)).toBe(false)
  })

  it('récupère un média au même commit que les documents, sans plafond JSON', async () => {
    const contenu = Buffer.alloc(3 * 1024 * 1024, 0x91)
    const commit = 'a'.repeat(40)
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => init?.method === 'HEAD'
      ? new Response(null, { headers: { 'X-Gitlab-Size': String(contenu.length), 'X-Gitlab-Content-Sha256': identite(contenu).sha256 } })
      : reponseFlux(contenu))
    const client = new ClientGitLab({
      urlInstance: URL_INSTANCE, projetId: 1, autorisation: autorisationJetonPersonnel('secret'),
      tailleMaxReponseOctets: 10,
    }, fetchImpl)
    const transfert = new TransfertGitLab(client, async () => commit, 'corpus')
    const destination = join(dossier(), 'audio.mp3')
    await transfert.telechargerFichier('medias/audio.mp3', destination)
    expect(readFileSync(destination).equals(contenu)).toBe(true)
    for (const [url] of fetchImpl.mock.calls) {
      expect(new URL(String(url)).searchParams.get('ref')).toBe(commit)
      expect(decodeURIComponent(String(url))).toContain('corpus/medias/audio.mp3')
    }
  })

  it('téléverse l’objet LFS en flux, le vérifie et le relit avant confirmation', async () => {
    const contenu = Buffer.alloc(2 * 1024 * 1024 + 23, 0x83)
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    const { client, fetchImpl, taillesMorceaux } = lfs()
    const progression = vi.fn()
    await client.televerserObjet(fichier, identite(contenu), progression)
    expect(Math.max(...taillesMorceaux)).toBeLessThanOrEqual(64 * 1024)
    expect(progression).toHaveBeenLastCalledWith(contenu.length, contenu.length)
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PUT', 'POST', 'POST', 'GET'])
    expect(pointeurLfsGitLab(identite(contenu))).toContain(`oid sha256:${identite(contenu).sha256}`)
    expect(await identifierFichierGitLab(fichier)).toEqual(identite(contenu))
    const copie = join(dossier(), 'copie.mp3')
    await client.telechargerObjet(identite(contenu), copie)
    expect(readFileSync(copie).equals(contenu)).toBe(true)
  })

  it('reconnaît un objet acquis seulement après une preuve de contenu', async () => {
    const contenu = Buffer.from([9, 6, 0, 255])
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    const { client, fetchImpl, donnerObjet } = lfs({ objetExistant: true })
    donnerObjet(contenu)
    await client.televerserObjet(fichier, identite(contenu))
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST', 'GET'])
  })

  it('n’annonce pas un objet confirmé si la relecture ne correspond pas', async () => {
    const contenu = Buffer.from([9, 6, 0, 255])
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    await expect(lfs({ corrompre: true }).client.televerserObjet(fichier, identite(contenu))).rejects.toThrow()
  })

  it('ne renvoie pas automatiquement un upload à la réponse perdue', async () => {
    const contenu = Buffer.from([9, 6, 0, 255])
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    const { client, fetchImpl } = lfs({ perdreReponse: true })
    await expect(client.televerserObjet(fichier, identite(contenu))).rejects.toThrow('Réponse perdue')
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('refuse les actions LFS vers un autre serveur avant de lui transmettre des accès', async () => {
    const contenu = Buffer.from([1, 2])
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    const { client, fetchImpl } = lfs({ origineExterne: true })
    await expect(client.televerserObjet(fichier, identite(contenu))).rejects.toThrow('adresse non autorisée')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuse un média local changé depuis le bilan avant toute requête', async () => {
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, 'modifié')
    const { client, fetchImpl } = lfs()
    await expect(client.televerserObjet(fichier, identite(Buffer.from('origine')))).rejects.toThrow('source préparée')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('annule avant le prochain transfert sans toucher la source', async () => {
    const contenu = Buffer.from([1, 2])
    const fichier = join(dossier(), 'media.mp3')
    writeFileSync(fichier, contenu)
    const { client, fetchImpl } = lfs()
    const annulation = new AbortController()
    annulation.abort()
    await expect(client.televerserObjet(fichier, identite(contenu), undefined, annulation.signal)).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readFileSync(fichier)).toEqual(contenu)
  })
})
