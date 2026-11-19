import type { ReferenceParticipation, RefusRapprochementLocuteur } from '../locuteurs'
import type { InventaireIdentitesLocuteurs, VueParticipationLocuteur } from './personnes'
import { cleParticipationCorrection } from './apercusCorrectionsLocuteurs'
import { suggestionsLocuteurs } from './rapprochementsLocuteurs'

/** Relie les notes par entretien et id local, jamais par le seul id d'une voix. */
export function notesSelectionLocuteurs(inventaire: InventaireIdentitesLocuteurs, selection: readonly ReferenceParticipation[]) {
  const cles = new Set(selection.map(cleParticipationCorrection))
  return inventaire.notes.filter((n) => n.participationIds.some((participationId) => cles.has(cleParticipationCorrection({ entretienId: n.entretienId, participationId }))))
}

export function examinerLocuteurs(inventaire: InventaireIdentitesLocuteurs, limite = 100) {
  const identites = new Map(inventaire.locuteurs.map((l) => [l.id, l]))
  const cle = (p: VueParticipationLocuteur) => p.locuteurRef && identites.has(p.locuteurRef)
    ? JSON.stringify(['locuteur', p.locuteurRef]) : JSON.stringify(['participation', p.entretienId, p.participationId])
  const groupes = new Map<string, VueParticipationLocuteur[]>()
  for (const p of inventaire.participations) {
    const id = cle(p)
    if (!groupes.has(id)) groupes.set(id, [])
    groupes.get(id)!.push(p)
  }
  const membres = (p: VueParticipationLocuteur) => groupes.get(cle(p)) ?? []
  const reference = (p: VueParticipationLocuteur): ReferenceParticipation => ({ entretienId: p.entretienId, participationId: p.participationId })
  const libelle = (p: VueParticipationLocuteur) => `${p.locuteurRef && identites.has(p.locuteurRef) ? identites.get(p.locuteurRef)!.nom : p.nom || 'Locuteur sans nom'} · ${[...new Set(membres(p).map((m) => m.entretienTitre))].join(', ')}`
  const convertir = (p: VueParticipationLocuteur) => ({ entretienId: p.entretienId,
    participation: { ...p, id: p.participationId, locuteurRef: p.locuteurRef && identites.has(p.locuteurRef) ? p.locuteurRef : null } })
  const parReference = new Map(inventaire.participations.map((p) => [cleParticipationCorrection(p), p]))
  const tous = inventaire.participations.map(convertir)
  const propositions: { cle: string; a: ReferenceParticipation; b: ReferenceParticipation; titre: string; selection: ReferenceParticipation[] }[] = []
  const vus = new Set<string>()
  recherche: for (const a of inventaire.participations.slice(0, limite)) for (const candidat of suggestionsLocuteurs(convertir(a), tous)) {
    const b = parReference.get(cleParticipationCorrection({ entretienId: candidat.entretienId, participationId: candidat.participation.id! }))!
    const paire = JSON.stringify([cle(a), cle(b)].sort())
    if (vus.has(paire)) continue
    vus.add(paire)
    propositions.push({ cle: paire, a: reference(a), b: reference(b), titre: `${libelle(a)} ↔ ${libelle(b)}`,
      selection: [...membres(a), ...membres(b)].map(reference) })
    if (propositions.length >= limite) break recherche
  }
  const distinctions: { cle: string; reference: ReferenceParticipation; cible: RefusRapprochementLocuteur; titre: string }[] = []
  vus.clear()
  for (const p of inventaire.participations) for (const r of p.rapprochementsRefuses ?? []) {
    const cible = r.type === 'locuteur' ? groupes.get(JSON.stringify(['locuteur', r.locuteurId]))?.[0]
      : parReference.get(cleParticipationCorrection(r))
    const cleCible = cible ? cle(cible) : JSON.stringify(r)
    const paire = JSON.stringify([cle(p), cleCible].sort())
    if (vus.has(paire)) continue
    vus.add(paire)
    const nom = cible ? libelle(cible) : r.type === 'locuteur' ? identites.get(r.locuteurId)?.nom ?? 'Locuteur absent' : 'Voix absente de son entretien'
    distinctions.push({ cle: paire, reference: reference(p), cible: { ...r }, titre: `${libelle(p)} ↔ ${nom}` })
  }
  const sansEntretien = inventaire.locuteurs.filter((l) => !inventaire.participations.some((p) => p.locuteurRef === l.id))
  return { propositions, distinctions, sansEntretien }
}
