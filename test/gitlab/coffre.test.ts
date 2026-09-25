import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  CoffreComptes,
  idDeCompteGitLab,
  idDeCorpus,
  type Chiffreur,
} from '../../src/main/distant/coffre'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => Buffer.from(secret.slice('chiffre:'.length), 'base64').toString(),
}

describe('coffre GitLab', () => {
  test('sépare le compte secret des destinations projet, branche et racine', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-gitlab-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreur)
    const compte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://gitlab.example.org/institution/',
      utilisateur: 'max',
      jeton: 'jeton-secret',
    })
    const destinationA = coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'équipe/pilote',
      racine: 'donnees/corpus-a/',
    })
    const destinationB = coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'main',
    })

    expect(compte).toMatchObject({
      fournisseur: 'gitlab',
      urlInstance: 'https://gitlab.example.org/institution',
      utilisateur: 'max',
    })
    expect(destinationA).toMatchObject({
      fournisseur: 'gitlab',
      compteId: compte.id,
      projetId: 42,
      branche: 'équipe/pilote',
      racine: 'donnees/corpus-a',
    })
    expect(destinationB.id).not.toBe(destinationA.id)
    expect(coffre.jetonGitLab(compte.id)).toBe('jeton-secret')
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)
    expect(coffre.lister()).toEqual([])

    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('jeton-secret')
    expect(JSON.parse(persiste)).toMatchObject({ formatVersion: 3 })

    const memeCompte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://GITLAB.example.org:443/institution',
      utilisateur: ' max ',
      jeton: 'jeton-renouvele',
    })
    expect(memeCompte.id).toBe(compte.id)
    expect(coffre.jetonGitLab(compte.id)).toBe('jeton-renouvele')
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)

    coffre.oublier(compte.id)
    expect(coffre.jetonGitLab(compte.id)).toBeNull()
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)
    coffre.oublierDestinationGitLab(destinationA.id)
    expect(coffre.listerDestinationsGitLab()).toEqual([destinationB])
  })

  test('migre un coffre WebDAV v2 sans changer ses identifiants', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-v2-')), 'comptes.json')
    const id = idDeCorpus('https://nuage.example.org/corpus', 'max')
    writeFileSync(fichier, JSON.stringify({
      formatVersion: 2,
      comptes: {
        [id]: {
          id,
          urlServeur: 'https://nuage.example.org/corpus',
          utilisateur: 'max',
          motDePasseChiffre: chiffreur.chiffre('secret-webdav'),
        },
      },
    }))

    const coffre = new CoffreComptes(fichier, chiffreur)

    expect(coffre.lister()).toEqual([{
      fournisseur: 'webdav',
      id,
      urlServeur: 'https://nuage.example.org/corpus',
      utilisateur: 'max',
      motDePasseChiffre: chiffreur.chiffre('secret-webdav'),
    }])
    expect(coffre.motDePasse(id)).toBe('secret-webdav')
    expect(JSON.parse(readFileSync(fichier, 'utf8'))).toMatchObject({
      formatVersion: 3,
      destinationsGitLab: {},
    })
  })

  test('calcule un compte stable sans dépendre du jeton', () => {
    expect(idDeCompteGitLab('https://gitlab.example.org/', 'max')).toBe(
      idDeCompteGitLab('https://GITLAB.example.org:443', ' max '),
    )
  })
})
