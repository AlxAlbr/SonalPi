import type { EntretienScan } from './scanAnon'
import { pseudoUtilisable } from '../export/pseudonymisation'

export interface OrigineLocuteur {
  entretienId: string
  index: number
  locuteurId?: string
  personneRef: string | null
  pseudoEtat?: 'confirme' | 'refuse'
  utilisee: boolean
}

export interface CorrespondanceLocuteur {
  nom: string
  pseudo: string
  utilisee: boolean
  origines: OrigineLocuteur[]
}

export interface DivergenceLocuteurs {
  nature: 'personne' | 'nom'
  cle: string
  pseudos: string[]
  entretiens: string[]
}

export interface InventaireCorrespondancesLocuteurs {
  correspondances: CorrespondanceLocuteur[]
  divergences: DivergenceLocuteurs[]
}

/** Inventorie les libellés, même sans tour de parole ; ne crée ni règle ni synchronisation. */
export function inventorierCorrespondancesLocuteurs(entretiens: EntretienScan[]): InventaireCorrespondancesLocuteurs {
  const couples = new Map<string, CorrespondanceLocuteur>()
  const groupes = new Map<string, { nature: 'personne' | 'nom'; cle: string; pseudos: Set<string>; entretiens: Set<string> }>()
  for (const { id, data } of entretiens) {
    for (const locuteur of data.locuteurs) {
      const nom = locuteur.nom.trim()
      const pseudo = locuteur.pseudo?.trim() ?? ''
      if (!nom || !pseudo) continue
      const cle = JSON.stringify([nom, pseudo])
      const couple = couples.get(cle) ?? { nom, pseudo, utilisee: false, origines: [] }
      couple.utilisee ||= pseudoUtilisable(locuteur)
      if (!couple.origines.some((o) => o.entretienId === id && o.index === locuteur.index)) {
        couple.origines.push({ entretienId: id, index: locuteur.index, locuteurId: locuteur.id, personneRef: locuteur.personneRef ?? null, pseudoEtat: locuteur.pseudoEtat, utilisee: pseudoUtilisable(locuteur) })
      }
      couples.set(cle, couple)
      const identites: ['personne' | 'nom', string][] = [['nom', nom.normalize('NFC').toLocaleLowerCase('fr')]]
      if (locuteur.personneRef) identites.push(['personne', locuteur.personneRef])
      for (const [nature, identite] of identites) {
        const groupeId = JSON.stringify([nature, identite])
        const groupe = groupes.get(groupeId) ?? { nature, cle: identite, pseudos: new Set<string>(), entretiens: new Set<string>() }
        groupe.pseudos.add(pseudo)
        groupe.entretiens.add(id)
        groupes.set(groupeId, groupe)
      }
    }
  }
  const correspondances = [...couples.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.pseudo.localeCompare(b.pseudo, 'fr'))
  for (const couple of correspondances) couple.origines.sort((a, b) => a.entretienId.localeCompare(b.entretienId) || a.index - b.index)
  const divergences = [...groupes.values()].filter((g) => g.pseudos.size > 1 && g.entretiens.size > 1)
    .map((g) => ({ nature: g.nature, cle: g.cle, pseudos: [...g.pseudos].sort((a, b) => a.localeCompare(b, 'fr')), entretiens: [...g.entretiens].sort() }))
    .sort((a, b) => a.nature.localeCompare(b.nature) || a.cle.localeCompare(b.cle, 'fr'))
  return { correspondances, divergences }
}
