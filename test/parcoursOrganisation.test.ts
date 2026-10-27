import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { creerParcoursOrganisation, NOM_RECUEIL_GUIDE, type DepsParcoursOrganisation } from '../src/renderer/composables/parcours/organisation'

function exercice() {
  const deps: DepsParcoursOrganisation = {
    vue: ref('organiser'), sousEspaceOrganisation: ref('accueil'),
    membership: ref(Object.fromEntries(['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants']
      .map((titre, n) => [`e${n}`, { titre, date: null, lastModified: '2026-01-01' }]))),
    cas: ref({}), recueils: ref({}), recueilOuvertId: ref(null),
    sauvegardeCas: ref('à jour'), sauvegardeRecueil: ref('à jour'), ouvertId: ref(null), exportRealise: ref(null),
  }
  return { deps, etapes: creerParcoursOrganisation(deps).etapes }
}
function structurer(deps: DepsParcoursOrganisation) {
  deps.recueils.value.r1 = { id: 'r1', nom: NOM_RECUEIL_GUIDE, creeLe: '', modifieLe: '', modeTexte: 'pseudonymise',
    items: [{ id: 't1', type: 'titre', niveau: 1, libelle: 'Être utile' },
      { id: 'c1', type: 'texte', texte: 'Que signifie être utile pour les bénévoles ?' }] }
}
function exporter(deps: DepsParcoursOrganisation) {
  deps.exportRealise.value = {
    demande: { selection: Object.entries(deps.membership.value).map(([id, r]) => ({ id, titre: r.titre, date: null })),
      formats: ['txt'], options: { anon: true, entete: true, notes: true, vars: true, time: true, loc: false, thm: true },
      copierMedias: false, enregistrerRapport: false },
    resultat: { etat: 'succes', dossier: '/sortie', rapportResume: [], rapportTexte: '',
      faits: Object.entries(deps.membership.value).map(([id, r]) => ({ id, titre: r.titre, etat: 'succes' })) },
  }
}

describe('parcours Organiser et exporter', () => {
  it('propose quatre gestes sans prévalider le corpus annoté et guide vers son espace', () => {
    const { deps, etapes } = exercice()
    expect(etapes.map((e) => e.fait())).toEqual([false, false, false, false])
    expect(etapes[2].requiere).toBe('structurer-recueil')
    deps.vue.value = 'analyser'
    expect(etapes[0].cible()).toBe('[data-tour="ouvrir-organiser"]')
    deps.vue.value = 'organiser'
    expect(etapes[0].cible()).toBe('[data-tour="ouvrir-organisation-cas"]')
  })

  it('demande une règle enregistrée sur le bon entretien, pas un cas vide ou une prévisualisation', () => {
    const { deps, etapes } = exercice()
    deps.cas.value.c1 = { id: 'c1', nom: 'Coordinatrice', memo: '', creeLe: '', modifieLe: '', regles: [], rattachements: [] }
    expect(etapes[0].fait()).toBe(false)
    deps.cas.value.c1.regles = [{ type: 'entretiens', entretienIds: ['e1'] }]
    expect(etapes[0].fait()).toBe(false)
    deps.cas.value.c1.regles = [{ type: 'entretiens', entretienIds: ['e0'] }]
    expect(etapes[0].fait()).toBe(true)
    deps.sauvegardeCas.value = 'conflit'
    expect(etapes[0].fait()).toBe(false)
  })

  it('demande un titre et un commentaire non vides dans le même recueil sauvegardé', () => {
    const { deps, etapes } = exercice()
    structurer(deps)
    expect(etapes[1].fait()).toBe(true)
    deps.sauvegardeRecueil.value = 'enregistrement…'
    expect(etapes[1].fait()).toBe(false)
    deps.sauvegardeRecueil.value = 'à jour'
    deps.recueils.value.r1.items[1] = { id: 'c1', type: 'texte', texte: '  ' }
    expect(etapes[1].fait()).toBe(false)
    structurer(deps)
    deps.recueils.value.r1.nom = 'Autre recueil'
    expect(etapes[1].fait()).toBe(false)
  })

  it('demande un passage lié à la coordinatrice dans le recueil structuré', () => {
    const { deps, etapes } = exercice()
    structurer(deps)
    expect(etapes[2].fait()).toBe(false)
    deps.recueils.value.r1.items.push({ id: 'p1', type: 'passage', source: { entretienId: 'e1', repereId: 'rep1' }, commentaireEditorial: '' })
    expect(etapes[2].fait()).toBe(false)
    const item = deps.recueils.value.r1.items[2]
    if (item.type !== 'passage') throw new Error('Passage attendu.')
    item.source.entretienId = 'e0'
    expect(etapes[2].fait()).toBe(true)
    item.source.repereId = ''
    expect(etapes[2].fait()).toBe(false)
  })

  it('ne valide ni une annulation, ni un échec, ni un lot partiel ou sans pseudonymisation', () => {
    const { deps, etapes } = exercice()
    exporter(deps)
    expect(etapes[3].fait()).toBe(true)
    deps.exportRealise.value!.resultat = { etat: 'annule', dossier: null, faits: [] }
    expect(etapes[3].fait()).toBe(false)
    deps.exportRealise.value!.resultat = { etat: 'echec', message: 'Écriture impossible' }
    expect(etapes[3].fait()).toBe(false)
    exporter(deps)
    const resultat = deps.exportRealise.value!.resultat
    if (resultat.etat !== 'succes') throw new Error('Résultat attendu.')
    resultat.faits[0].etat = 'echec'
    expect(etapes[3].fait()).toBe(false)
    exporter(deps)
    deps.exportRealise.value!.demande.selection.pop()
    expect(etapes[3].fait()).toBe(false)
    exporter(deps)
    deps.exportRealise.value!.demande.formats = ['html']
    expect(etapes[3].fait()).toBe(false)
    exporter(deps)
    deps.exportRealise.value!.demande.options.anon = false
    expect(etapes[3].fait()).toBe(false)
  })
})
