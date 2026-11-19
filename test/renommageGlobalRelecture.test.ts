import { expect, test } from 'vitest'
import type { EntretienFichier, PayloadEntretien } from '../src/shared/format'
import { verifierRelectureRenommage } from '../src/shared/entretien/renommageGlobal'

function payload(): PayloadEntretien {
  return { corpsTexte: { type: 'doc', content: [] }, annotations: [], ancres: [], reperesPassages: [],
    participations: [
      { id: 'a', index: 7, nom: 'Nom local', locuteurRef: 'commun', valeursLoc: { v: 'm' }, pseudo: 'Pseudo', interviewer: true },
      { id: 'b', index: 11, nom: 'Autre nom', locuteurRef: null, valeursLoc: {} },
    ], meta: { valeursGen: {}, audioRef: null }, notes: [], legacy: { notes: 'À conserver' } }
}
function fichier(p: PayloadEntretien): EntretienFichier { return { ...structuredClone(p), formatVersion: 10, lastModified: '2026-01-01T00:00:00Z' } }

test('seuls les noms de l’identité ciblée changent, sans dépendre de l’ordre des propriétés JSON', () => {
  const avant = payload(), apres = fichier(avant)
  apres.participations[0] = { ...apres.participations[0], nom: 'Nom global' }
  apres.meta = { audioRef: null, valeursGen: {} }
  expect(() => verifierRelectureRenommage(avant, apres, 'commun')).not.toThrow()
  expect(avant.participations[0].nom).toBe('Nom local')
})

test.each(['texte', 'notes', 'valeur', 'pseudo', 'role', 'reference', 'id', 'index', 'autre-nom', 'disparition'])('une divergence de %s empêche la reprise de l’autosauvegarde', (champ) => {
  const avant = payload(), apres = fichier(avant)
  apres.participations[0].nom = 'Nom global'
  if (champ === 'texte') apres.corpsTexte = { type: 'doc', content: [{ type: 'paragraph' }] }
  if (champ === 'notes') apres.notes = undefined
  if (champ === 'valeur') apres.participations[0].valeursLoc = { v: 'autre' }
  if (champ === 'pseudo') apres.participations[0].pseudo = 'Autre choix'
  if (champ === 'role') apres.participations[0].interviewer = false
  if (champ === 'reference') apres.participations[0].locuteurRef = 'autre'
  if (champ === 'id') apres.participations[0].id = 'remplacement'
  if (champ === 'index') apres.participations[0].index = 42
  if (champ === 'autre-nom') apres.participations[1].nom = 'Nom tiers changé'
  if (champ === 'disparition') apres.participations.shift()
  expect(() => verifierRelectureRenommage(avant, apres, 'commun')).toThrow('Le contenu de l’entretien a changé')
})
