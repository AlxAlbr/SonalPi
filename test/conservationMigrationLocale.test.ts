import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync, symlinkSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConservationMigrationLocale } from '../src/main/conservationMigrationLocale'
import { creerTransitionsLocales } from '../src/main/transitionContexte'
import type { DemandeMigration } from '../src/shared/corpus/migrationCrp'

const dossiers: string[] = []
afterEach(() => dossiers.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })))
function fixture() {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-conservation-')); dossiers.push(racine)
  const source = join(racine, 'source'), cible = join(racine, 'cible')
  mkdirSync(source)
  const ecrire = (chemin: string, contenu: string | Buffer) => {
    const p = join(source, chemin); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, contenu)
  }
  ecrire('terrain.crp', JSON.stringify({ nom: 'Terrain', tabEnt: [{ id: 1, nom: 'Premier', rtrPath: 'premier.Sonal', audioPath: join(source, 'voix.wav') }] }))
  ecrire('premier.Sonal', '<html>Texte synthétique</html>'); ecrire('voix.wav', Buffer.alloc(1024, 17))
  ecrire('terrain.out', 'le\nla'); ecrire('terrain.lem', 'allais\taller\nligne incomplète')
  ecrire('terrain.lexaf.json', '{"ancienResultat":true}')
  ecrire('documents/ébauche.bin', Buffer.from([0, 255, 13, 10, 254]))
  ecrire('autre/ébauche.bin', Buffer.from([3, 2, 1]))
  ecrire('credentials.enc', 'accès à ne pas transmettre'); ecrire('.git/config', 'historique technique')
  ecrire('second.crp', JSON.stringify({ tabEnt: [{ id: 2, nom: 'Second', rtrPath: 'second.Sonal', audioPath: 'second.wav' }] }))
  ecrire('second.Sonal', 'autre corpus'); ecrire('second.wav', 'autre média'); ecrire('second.lexaf.json', 'autre résultat')
  const cheminCrp = join(source, 'terrain.crp'), service = new ConservationMigrationLocale()
  const requete = (bilanFichiersId: string): DemandeMigration => ({ nom: 'Terrain', cheminCrp, dossier: cible, dateCreation: null, codebook: [], variables: [], bilanFichiersId })
  return { source, cible, cheminCrp, service, ecrire, requete }
}

describe('conservation locale des documents de migration', () => {
  it('prépare sans écrire, puis conserve les résultats et les inconnus octet pour octet, sans copier les contenus déjà repris', async () => {
    const f = fixture(), bilan = await f.service.preparer(f.cheminCrp, f.cible)
    expect(existsSync(f.cible)).toBe(false)
    expect(bilan.autres.map((p) => p.cheminDestination)).toEqual([
      'Autres/autre/ébauche.bin', 'Autres/documents/ébauche.bin', 'Autres/terrain.lem', 'Autres/terrain.lexaf.json',
    ])
    expect(bilan.autresCorpus).toBe(1)
    expect(bilan.nonRepris).toEqual(expect.arrayContaining([
      expect.objectContaining({ chemin: '.git', raison: expect.stringContaining('technique') }),
      expect.objectContaining({ chemin: 'credentials.enc', raison: expect.stringContaining('secrets') }),
      expect.objectContaining({ chemin: 'second.Sonal', raison: expect.stringContaining('autre corpus') }),
    ]))
    const avant = new Map(bilan.autres.map((p) => [p.cheminSource, readFileSync(join(f.source, p.cheminSource))]))
    const copie = await f.service.preparerCopie(f.requete(bilan.bilanId))
    expect(existsSync(join(f.cible, 'Autres'))).toBe(false)
    try { copie.installer() } finally { copie.nettoyer() }
    for (const fichier of bilan.autres) {
      expect(readFileSync(join(f.cible, fichier.cheminDestination))).toEqual(avant.get(fichier.cheminSource))
      if (process.platform !== 'win32') expect(statSync(join(f.cible, fichier.cheminDestination)).mode & 0o077).toBe(0)
      expect(readFileSync(join(f.source, fichier.cheminSource))).toEqual(avant.get(fichier.cheminSource))
    }
    expect(readdirSync(f.cible)).toEqual(['Autres'])
    expect(existsSync(join(f.cible, 'Autres', 'voix.wav'))).toBe(false)
  })

  it.each(['ajout', 'modification', 'corpus'])('refuse un bilan devenu périmé (%s) avant toute copie', async (cas) => {
    const f = fixture(), bilan = await f.service.preparer(f.cheminCrp, f.cible)
    if (cas === 'ajout') f.ecrire('nouveau.txt', 'nouveau')
    else if (cas === 'modification') f.ecrire('documents/ébauche.bin', 'modifié')
    else f.ecrire('terrain.crp', '{"nom":"Nouveau"}')
    await expect(f.service.preparerCopie(f.requete(bilan.bilanId))).rejects.toThrow(/changé/)
    expect(existsSync(join(f.cible, 'Autres'))).toBe(false)
  })

  it('écarte les liens, y compris les dossiers pointant hors du corpus', async () => {
    const f = fixture()
    symlinkSync(f.cible, join(f.source, 'lien'), 'dir')
    symlinkSync(join(f.source, 'premier.Sonal'), join(f.source, 'copie-liee.Sonal'))
    const bilan = await f.service.preparer(f.cheminCrp, f.cible)
    expect(bilan.nonRepris.filter((p) => p.raison.startsWith('Lien')).map((p) => p.chemin).sort()).toEqual(['copie-liee.Sonal', 'lien'])
    expect(bilan.autres.some((p) => p.cheminSource.includes('liee') || p.cheminSource === 'lien')).toBe(false)
  })

  it('refuse la source comme cible et un dossier Autres existant sans rien remplacer', async () => {
    const f = fixture()
    await expect(f.service.preparer(f.cheminCrp, f.source)).rejects.toThrow('ancien dossier')
    mkdirSync(join(f.cible, 'Autres'), { recursive: true })
    writeFileSync(join(f.cible, 'Autres', 'conserver.txt'), 'conserver')
    await expect(f.service.preparer(f.cheminCrp, f.cible)).rejects.toThrow('Autres')
    expect(readFileSync(join(f.cible, 'Autres', 'conserver.txt'), 'utf8')).toBe('conserver')
  })

  it('ne réinventorie pas une destination située sous la source', async () => {
    const f = fixture(), cible = join(f.source, 'nouveau')
    mkdirSync(cible); writeFileSync(join(cible, 'sans-lien.txt'), 'fichier existant')
    const bilan = await f.service.preparer(f.cheminCrp, cible)
    expect(bilan.autres.some((p) => p.cheminSource.startsWith('nouveau/'))).toBe(false)
  })

  it('refuse un changement de destination ou un identifiant de bilan inventé', async () => {
    const f = fixture(), bilan = await f.service.preparer(f.cheminCrp, f.cible)
    await expect(f.service.preparerCopie({ ...f.requete(bilan.bilanId), dossier: f.source })).rejects.toThrow('bilan')
    await expect(f.service.preparerCopie(f.requete('autre'))).rejects.toThrow('bilan')
    expect(existsSync(f.cible)).toBe(false)
  })

  it('ne remplace pas un dossier apparu au dernier moment', async () => {
    const f = fixture(), bilan = await f.service.preparer(f.cheminCrp, f.cible)
    const copie = await f.service.preparerCopie(f.requete(bilan.bilanId))
    mkdirSync(join(f.cible, 'Autres')); writeFileSync(join(f.cible, 'Autres', 'conserver.txt'), 'conserver')
    try { expect(() => copie.installer()).toThrow() } finally { copie.nettoyer() }
    expect(readFileSync(join(f.cible, 'Autres', 'conserver.txt'), 'utf8')).toBe('conserver')
    expect(readdirSync(f.cible)).toEqual(['Autres'])
  })

  it('ne laisse aucun document dans la cible si le contexte courant refuse sa fermeture', async () => {
    const f = fixture(); mkdirSync(f.cible)
    const bilan = await f.service.preparer(f.cheminCrp, f.cible), finaliser = vi.fn()
    const transitions = creerTransitionsLocales({ fermerContexteActuel: async () => { throw new Error('Fermeture refusée') }, finaliser,
      preparerDocumentsMigration: (req) => f.service.preparerCopie(req) })
    await expect(transitions.migrer(f.requete(bilan.bilanId))).rejects.toThrow('Fermeture refusée')
    expect(finaliser).not.toHaveBeenCalled()
    expect(readdirSync(f.cible)).toEqual([])
  })
})
