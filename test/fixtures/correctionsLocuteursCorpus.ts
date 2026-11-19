import type { InventaireIdentitesLocuteurs } from '../../src/shared/corpus/personnes'
import type { LigneRepertoireLocuteurs } from '../../src/shared/corpus/repertoireLocuteurs'

export function inventaireCorrections(): InventaireIdentitesLocuteurs {
  return {
    locuteurs: [{ id: 'p1', nom: 'Alice' }, { id: 'p2', nom: 'Bob' }, { id: 'p3', nom: 'Chloé' }],
    participations: [
      { entretienId: 'A', entretienTitre: 'Entretien A', participationId: 'local', index: 0, nom: 'Alice locale', locuteurRef: 'p1', interviewer: true, valeursLoc: { v: 'm' } },
      { entretienId: 'B', entretienTitre: 'Entretien B masqué', participationId: 'local', index: 0, nom: 'Mme Alice', locuteurRef: 'p1', interviewer: false, valeursLoc: {} },
      { entretienId: 'C', entretienTitre: 'Entretien C', participationId: 'local', index: 0, nom: 'Bob local', locuteurRef: 'p2', interviewer: false, valeursLoc: {} },
      { entretienId: 'D', entretienTitre: 'Entretien D', participationId: 'local', index: 0, nom: 'Chloé', locuteurRef: 'p3', interviewer: false, valeursLoc: {} },
    ],
    notes: [], indisponibles: [],
  }
}
export function lignesCorrections(inventaire: InventaireIdentitesLocuteurs): LigneRepertoireLocuteurs[] {
  return inventaire.locuteurs.map((l) => ({
    cle: l.id, nom: l.nom.trim(), locuteurId: l.id, mots: 0, interventions: 0,
    participations: inventaire.participations.filter((p) => p.locuteurRef === l.id)
      .map((p) => ({ entretienId: p.entretienId, entretienTitre: p.entretienTitre, participationId: p.participationId, nom: p.nom })),
  }))
}
