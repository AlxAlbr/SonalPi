import type { MatriceCorpus, Variable } from '../format'

export interface OptionsExportDonnees {
  variables: Variable[]
  matrice: MatriceCorpus
  entretiensAttendus: string[]
  montrerLocuteurs: boolean
  inclurePrivees?: boolean
}

/** Une cellule reste du texte, même si un tableur pourrait y reconnaître une formule. */
function celluleCsv(valeur: string): string {
  const texte = /^[\s\u0000-\u001f]*[=+\-@]/u.test(valeur) || /^[\t\r\n]/.test(valeur)
    ? `'${valeur}` : valeur
  return `"${texte.replaceAll('"', '""')}"`
}

/** Exporte les colonnes choisies sans transformer une source absente en ligne vide. */
export function exporterDonneesCsv(options: OptionsExportDonnees): string {
  const colonnes = options.variables.filter((v) => options.inclurePrivees || !v.priv)
  if (!colonnes.length) throw new Error('Aucune variable à exporter. Affichez au moins une variable publique ou choisissez d’inclure les variables privées.')
  const ids = options.matrice.map((entretien) => entretien.entretienId)
  const attendus = new Set(options.entretiensAttendus)
  if (new Set(ids).size !== ids.length || ids.length !== attendus.size || ids.some((id) => !attendus.has(id))) {
    throw new Error('Certains entretiens sont indisponibles ou la liste a changé. Actualisez la table avant d’exporter.')
  }
  const dictionnaires = colonnes.map((v) => new Map(v.modalites.map((m) => [m.id, m.lib])))
  const libelle = (valeurs: Record<string, string>, index: number): string => {
    const id = valeurs[colonnes[index].id]
    if (!id) return ''
    const texte = dictionnaires[index].get(id)
    if (texte === undefined) throw new Error('Une réponse ne correspond plus aux modalités disponibles. Vérifiez les données avant d’exporter.')
    return texte
  }
  const entetes = ['Entretien', 'Type de ligne', 'Locuteur']
  const utilisees = new Set(entetes)
  for (const variable of colonnes) {
    const base = `${variable.lib} (${variable.portee})`
    let titre = base
    for (let n = 2; utilisees.has(titre); n++) titre = `${base} [${n}]`
    utilisees.add(titre)
    entetes.push(titre)
  }
  const lignes = [entetes]
  for (const entretien of options.matrice) {
    lignes.push([
      entretien.titre, 'Entretien', '',
      ...colonnes.map((v, i) => v.portee === 'entretien' ? libelle(entretien.valeursGen, i) : ''),
    ])
    if (options.montrerLocuteurs) {
      for (const locuteur of entretien.locuteurs) {
        lignes.push([
          entretien.titre, 'Locuteur', locuteur.nom,
          ...colonnes.map((v, i) => v.portee === 'locuteur' ? libelle(locuteur.valeursLoc, i) : ''),
        ])
      }
    }
  }
  return '\uFEFF' + lignes.map((ligne) => ligne.map(celluleCsv).join(';')).join('\r\n') + '\r\n'
}
