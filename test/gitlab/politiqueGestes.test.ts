import { describe, expect, test } from 'vitest'
import {
  exigerGeste,
  PORTEEES_OVERTES_GITLAB,
  gesteAutorise,
  gestureCas,
  gestureRecueil,
  gestureTri,
  matriceCapacites,
  porteeGeste,
  type FournisseurCorpus,
} from '../../src/main/gitlab/politiqueGestes'
import type { CommandeCas } from '../../src/shared/corpus/cas'
import type { CommandeRecueils } from '../../src/shared/corpus/recueils'

const FOURNISSEURS: FournisseurCorpus[] = ['local', 'webdav', 'gitlab']

describe('portée des gestes du corpus', () => {
  function casSansPassage() {
    return { rattachements: [] } as never
  }

  test('chaque commande résolue porte un geste connu', () => {
    const commandesCas: CommandeCas[] = [
      { type: 'creer-famille', famille: {} as never, cas: [] },
      { type: 'completer-famille', famille: {} as never, cas: [] },
      { type: 'dissoudre-famille', famille: {} as never, membresAttendus: [] } as never,
      { type: 'creer', cas: casSansPassage() },
      { type: 'creer-lot', cas: [casSansPassage()] },
      { type: 'renommer', casId: 'c', attendu: 'a', nom: 'b' },
      { type: 'modifier-memo', casId: 'c', attendu: 'a', memo: 'b' },
      { type: 'supprimer-cas', casId: 'c', attenduModifieLe: 'x' },
      { type: 'ajouter-rattachements', casIds: [], rattachement: {} as never },
      { type: 'retirer-rattachement', casId: 'c', rattachementId: 'r', attendu: {} as never },
      { type: 'creer-attribut', definition: {} as never },
      { type: 'modifier-attribut', attributId: 'a', attendu: {} as never, patch: {} },
      { type: 'supprimer-attribut', attributId: 'a' },
      { type: 'definir-valeur-attribut', casId: 'c', attributId: 'a', attendu: null, valeur: 'x' },
      { type: 'ajouter-derivation-famille', familleId: 'f', membresAttendus: [], derivation: {} as never },
      { type: 'retirer-derivation-famille', familleId: 'f', membresAttendus: [], derivation: {} as never } as never,
      { type: 'ajouter-derivation-cas', casId: 'c', membresAttendus: [], derivation: {} as never },
      { type: 'retirer-derivation-cas', casId: 'c', membresAttendus: [], derivation: {} as never } as never,
    ]
    for (const commande of commandesCas) {
      expect(porteeGeste(gestureCas(commande)), commande.type).not.toBeNull()
    }

    const commandesRecueils: CommandeRecueils[] = [
      { type: 'creer', id: 'r', nom: 'n' },
      { type: 'renommer', recueilId: 'r', attendu: 'a', nom: 'b' },
      { type: 'changer-mode', recueilId: 'r', attendu: 'original', mode: 'pseudonymise' },
      { type: 'supprimer-recueil', recueilId: 'r', attenduModifieLe: 'x' },
      { type: 'inserer-item', recueilId: 'r', attenduOrdre: [], item: { id: 'i', type: 'texte', texte: 'x' }, avantId: null },
      { type: 'inserer-item', recueilId: 'r', attenduOrdre: [], item: { id: 'i', type: 'passage', source: { entretienId: 'e', repereId: 'p' }, commentaireEditorial: '' }, avantId: null },
      { type: 'modifier-item', recueilId: 'r', itemId: 'i', attendu: {} as never, item: {} as never },
      { type: 'supprimer-item', recueilId: 'r', itemId: 'i', attendu: {} as never },
      { type: 'deplacer-item', recueilId: 'r', itemId: 'i', avantId: null, attenduOrdre: [] },
      { type: 'deplacer-section', recueilId: 'r', titreId: 't', avantId: null, attenduOrdre: [] },
      { type: 'supprimer-section', recueilId: 'r', titreId: 't', attenduOrdre: [] } as never,
    ]
    for (const commande of commandesRecueils) {
      expect(porteeGeste(gestureRecueil(commande)), commande.type).not.toBeNull()
    }

    for (const mode of ['alpha', 'ajout', 'modif', 'longueur'] as const) {
      expect(porteeGeste(gestureTri(mode)), mode).not.toBeNull()
    }
  })

  test('créer un cas avec un passage est un geste qui lit les entretiens', () => {
    const avecPassage = { type: 'creer', cas: { rattachements: [{ source: { entretienId: 'e', repereId: 'p' } }] } } as never
    expect(porteeGeste(gestureCas(avecPassage))).toBe('definitions-avec-sources')
  })

  test('reprendre un passage se distingue des autres insertions de recueil', () => {
    const texte = gestureRecueil({ type: 'inserer-item', recueilId: 'r', attenduOrdre: [], item: { id: 'i', type: 'texte', texte: 'x' }, avantId: null })
    const passage = gestureRecueil({ type: 'inserer-item', recueilId: 'r', attenduOrdre: [], item: { id: 'i', type: 'passage', source: { entretienId: 'e', repereId: 'p' }, commentaireEditorial: '' }, avantId: null })
    expect(porteeGeste(texte)).toBe('definitions-corpus')
    expect(porteeGeste(passage)).toBe('definitions-avec-sources')
  })

  test('les tris par contenu lisent les entretiens, les autres non', () => {
    expect(porteeGeste(gestureTri('alpha'))).toBe('definitions-corpus')
    expect(porteeGeste(gestureTri('ajout'))).toBe('definitions-corpus')
    expect(porteeGeste(gestureTri('modif'))).toBe('tri-contenus')
    expect(porteeGeste(gestureTri('longueur'))).toBe('tri-contenus')
  })

  test('les gestes qui lisent les entretiens se distinguent des tris et des suppressions', () => {
    for (const geste of [
      'recueil.passage',
      'cas.ajouter-rattachement',
      'cas.ajouter-derivation-famille',
      'cas.ajouter-derivation-cas',
    ]) {
      expect(porteeGeste(geste), geste).toBe('definitions-avec-sources')
    }
    for (const geste of [
      'theme.supprimer',
      'note.supprimer-categorie',
      'variable.supprimer',
      'modalite.supprimer',
      'anon.supprimer-regle',
    ]) {
      expect(porteeGeste(geste), geste).toBe('suppression-definition')
    }
    expect(porteeGeste('entretien.trier-contenus')).toBe('tri-contenus')
  })

  test('GitLab ouvre les suppressions de définitions et le retrait d’un entretien', () => {
    for (const geste of [
      'theme.supprimer',
      'note.supprimer-categorie',
      'variable.supprimer',
      'modalite.supprimer',
      'anon.supprimer-regle',
      'entretien.supprimer',
      'entretien.analyser-suppression',
    ]) {
      expect(gesteAutorise('gitlab', geste), geste).toBe(true)
      expect(() => exigerGeste('gitlab', geste), geste).not.toThrow()
    }
  })

  test('les écritures ciblées sont rétablies sur WebDAV et qualifications sur GitLab', () => {
    for (const geste of ['valeurs.lot', 'regles.lot']) {
      expect(gesteAutorise('webdav', geste), geste).toBe(true)
      expect(gesteAutorise('gitlab', geste), geste).toBe(true)
    }
  })

  test('les gestes hors portée restent refusés sur tous les corpus distants', () => {
    for (const geste of [
      'note.editer',
      'personnes.commande',
      'journal.annuler',
      'corpus.marquer-demo',
    ]) {
      expect(gesteAutorise('local', geste), geste).toBe(true)
      expect(gesteAutorise('webdav', geste), geste).toBe(false)
      expect(gesteAutorise('gitlab', geste), geste).toBe(false)
    }
  })

  test('un geste inconnu est refusé partout', () => {
    for (const fournisseur of FOURNISSEURS) {
      expect(gesteAutorise(fournisseur, 'geste.inconnu')).toBe(false)
      expect(() => exigerGeste(fournisseur, 'geste.inconnu')).toThrow(/n’est pas connue/)
    }
  })

  test('les deux capacités d’entretien s’ouvrent séparément', () => {
    const ouvertes = [...PORTEEES_OVERTES_GITLAB]
    PORTEEES_OVERTES_GITLAB.length = 0
    try {
      PORTEEES_OVERTES_GITLAB.push('valeurs-entretien')
      expect(matriceCapacites('gitlab')).toMatchObject({
        tableDonnees: true,
        pseudonymisationEntretiens: false,
      })
      expect(gesteAutorise('gitlab', 'valeurs.lot')).toBe(true)
      expect(gesteAutorise('gitlab', 'regles.lot')).toBe(false)

      PORTEEES_OVERTES_GITLAB.length = 0
      PORTEEES_OVERTES_GITLAB.push('pseudonymisation-entretiens')
      expect(matriceCapacites('gitlab')).toMatchObject({
        tableDonnees: false,
        pseudonymisationEntretiens: true,
      })
      expect(gesteAutorise('gitlab', 'valeurs.lot')).toBe(false)
      expect(gesteAutorise('gitlab', 'regles.lot')).toBe(true)
    } finally {
      PORTEEES_OVERTES_GITLAB.length = 0
      PORTEEES_OVERTES_GITLAB.push(...ouvertes)
    }
  })

  test('fermer une portée de GitLab ferme la capacité qui en dépend', () => {
    expect(matriceCapacites('gitlab')).toMatchObject({
      definitionsAvecSources: true,
      triContenu: true,
      suppressionEntretien: true,
      tableDonnees: true,
      pseudonymisationEntretiens: true,
    })
    const ouvertes = [...PORTEEES_OVERTES_GITLAB]
    PORTEEES_OVERTES_GITLAB.length = 0
    try {
      expect(matriceCapacites('gitlab')).toMatchObject({
        definitionsAvecSources: false,
        triContenu: false,
        suppressionEntretien: false,
        tableDonnees: false,
        pseudonymisationEntretiens: false,
      })
      expect(gesteAutorise('gitlab', 'cas.ajouter-rattachement')).toBe(false)
      expect(gesteAutorise('gitlab', 'entretien.supprimer')).toBe(false)
      expect(() => exigerGeste('gitlab', 'entretien.trier-contenus')).toThrow(/n’est pas disponible/)
    } finally {
      PORTEEES_OVERTES_GITLAB.push(...ouvertes)
    }
  })

  test('la matrice de GitLab ouvre les définitions, le tri, le retrait et les écritures d’entretien', () => {
    expect(matriceCapacites('gitlab')).toEqual({
      definitions: true,
      definitionsAvecSources: true,
      triContenu: true,
      ajoutEntretien: true,
      editionEntretien: true,
      suppressionEntretien: true,
      renommageEntretien: true,
      metadonneesEntretien: false,
      tableDonnees: true,
      pseudonymisationEntretiens: true,
      notes: false,
      personnes: false,
      annulationJournal: false,
      designationMedia: true,
      televersementMedia: false,
      docsCadre: false,
    })
  })

  test('les parcours déjà acquis ne régressent pas', () => {
    const webdav = matriceCapacites('webdav')
    expect(webdav.definitionsAvecSources).toBe(true)
    expect(webdav.suppressionEntretien).toBe(true)
    expect(webdav.tableDonnees).toBe(true)
    expect(webdav.pseudonymisationEntretiens).toBe(true)
    expect(webdav.personnes).toBe(true)
    expect(webdav.designationMedia).toBe(true)
    expect(webdav.televersementMedia).toBe(true)
    const local = matriceCapacites('local')
    expect(local).toMatchObject({
      definitions: true,
      definitionsAvecSources: true,
      suppressionEntretien: true,
      notes: true,
      personnes: true,
      annulationJournal: true,
    })
  })
})
