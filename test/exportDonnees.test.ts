import { describe, expect, test } from 'vitest'
import { exporterDonneesCsv, type OptionsExportDonnees } from '../src/shared/corpus/exportDonnees'
import { lireCsvDonnees } from './fixtures/lireCsvDonnees'

function donnees(): OptionsExportDonnees {
  return {
    variables: [
      { id: 'v1', lib: 'Lieu', portee: 'entretien', priv: false, ordre: 0, vExport: 1, modalites: [{ id: 'm1', lib: 'À Lyon', mExport: 1 }] },
      { id: 'v2', lib: 'Ancienneté', portee: 'locuteur', priv: false, ordre: 1, vExport: 2, modalites: [{ id: 'm2', lib: 'Depuis 2012', mExport: 1 }] },
      { id: 'v3', lib: 'Contact privé', portee: 'entretien', priv: true, ordre: 2, vExport: 3, modalites: [{ id: 'm3', lib: 'confidentiel', mExport: 1 }] },
      { id: 'v4', lib: 'Note privée', portee: 'locuteur', priv: true, ordre: 3, vExport: 4, modalites: [{ id: 'm4', lib: 'personnel', mExport: 1 }] },
    ],
    matrice: [
      { entretienId: 'e1', titre: 'Coordinatrice', valeursGen: { v1: 'm1', v3: 'm3' }, locuteurs: [{ index: 0, nom: 'Fatima', valeursLoc: { v2: 'm2', v4: 'm4' } }] },
      { entretienId: 'e2', titre: 'Retraité', valeursGen: {}, locuteurs: [{ index: 0, nom: 'Paul', valeursLoc: {} }] },
    ],
    entretiensAttendus: ['e1', 'e2'], montrerLocuteurs: true,
  }
}

describe('CSV de la table de données', () => {
  test('les deux portées conservent leurs propriétaires, les absences et l’ordre de la table', () => {
    const options = donnees()
    const avant = structuredClone(options)
    const csv = exporterDonneesCsv(options)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(lireCsvDonnees(csv)).toEqual([
      ['Entretien', 'Type de ligne', 'Locuteur', 'Lieu (entretien)', 'Ancienneté (locuteur)'],
      ['Coordinatrice', 'Entretien', '', 'À Lyon', ''],
      ['Coordinatrice', 'Locuteur', 'Fatima', '', 'Depuis 2012'],
      ['Retraité', 'Entretien', '', '', ''],
      ['Retraité', 'Locuteur', 'Paul', '', ''],
    ])
    expect(options).toEqual(avant)
  })

  test('les variables privées et leurs réponses ne sortent que sur demande explicite', () => {
    const options = donnees()
    const defaut = exporterDonneesCsv(options)
    for (const texte of ['Contact privé', 'Note privée', 'confidentiel', 'personnel']) expect(defaut).not.toContain(texte)
    const inclus = lireCsvDonnees(exporterDonneesCsv({ ...options, inclurePrivees: true }))
    expect(inclus[0].slice(-2)).toEqual(['Contact privé (entretien)', 'Note privée (locuteur)'])
    expect(inclus[1].slice(-2)).toEqual(['confidentiel', ''])
    expect(inclus[2].slice(-2)).toEqual(['', 'personnel'])
  })

  test('seules les colonnes retenues sortent, dans l’ordre demandé', () => {
    const options = donnees()
    options.variables = [options.variables[1], options.variables[0]]
    const lignes = lireCsvDonnees(exporterDonneesCsv(options))
    expect(lignes[0].slice(3)).toEqual(['Ancienneté (locuteur)', 'Lieu (entretien)'])
    expect(lignes[1].slice(3)).toEqual(['', 'À Lyon'])
  })

  test('le filtre entretien retire les lignes des locuteurs', () => {
    const options = donnees()
    options.variables = [options.variables[0]]
    options.montrerLocuteurs = false
    expect(lireCsvDonnees(exporterDonneesCsv(options))).toHaveLength(3)
    expect(exporterDonneesCsv(options)).not.toContain('Fatima')
  })

  test('guillemets, point-virgule et retours à la ligne restent dans la même cellule', () => {
    const options = donnees()
    const valeur = 'Une « réponse »; "citée"\r\nsur deux lignes'
    options.variables[0].modalites[0].lib = valeur
    options.matrice[0].titre = 'Entretien; "A"'
    const csv = exporterDonneesCsv(options)
    expect(csv).toContain('"Entretien; ""A"""')
    const lignes = lireCsvDonnees(csv)
    expect(lignes[1][0]).toBe('Entretien; "A"')
    expect(lignes[1][3]).toBe(valeur)
  })

  test.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1+1', '\t=1+1', '\rtexte', '\ntexte', '\u0000=1+1'])('les formules potentielles sont neutralisées : %j', (valeur) => {
    const options = donnees()
    options.matrice[0].titre = valeur
    options.matrice[0].locuteurs[0].nom = valeur
    options.variables[0].lib = valeur
    options.variables[0].modalites[0].lib = valeur
    const lignes = lireCsvDonnees(exporterDonneesCsv(options))
    expect(lignes[0][3]).toBe(`'${valeur} (entretien)`)
    expect(lignes[1][0]).toBe(`'${valeur}`)
    expect(lignes[1][3]).toBe(`'${valeur}`)
    expect(lignes[2][2]).toBe(`'${valeur}`)
  })

  test('les libellés identiques ont des en-têtes distincts', () => {
    const options = donnees()
    options.variables[1] = { ...options.variables[0], id: 'doublon' }
    expect(lireCsvDonnees(exporterDonneesCsv(options))[0].slice(3)).toEqual(['Lieu (entretien)', 'Lieu (entretien) [2]'])
  })

  test('un entretien absent ou inattendu empêche un export présenté comme complet', () => {
    const options = donnees()
    expect(() => exporterDonneesCsv({ ...options, matrice: options.matrice.slice(0, 1) })).toThrow(/indisponibles/)
    expect(() => exporterDonneesCsv({ ...options, entretiensAttendus: ['e1', 'e3'] })).toThrow(/liste a changé/)
    expect(() => exporterDonneesCsv({ ...options, matrice: [options.matrice[0], options.matrice[0]] })).toThrow(/indisponibles/)
  })

  test('une réponse inconnue ne devient pas une absence de réponse', () => {
    const options = donnees()
    options.matrice[0].valeursGen.v1 = 'inconnue'
    expect(() => exporterDonneesCsv(options)).toThrow(/modalités disponibles/)
  })

  test('sans colonne publique, seul le choix explicite des privées autorise l’export', () => {
    const options = donnees()
    options.variables = options.variables.filter((v) => v.priv)
    expect(() => exporterDonneesCsv(options)).toThrow(/Aucune variable/)
    expect(() => exporterDonneesCsv({ ...options, inclurePrivees: true })).not.toThrow()
  })

  test('un corpus vide conserve une ligne d’en-tête exploitable', () => {
    const options = donnees()
    expect(lireCsvDonnees(exporterDonneesCsv({ ...options, matrice: [], entretiensAttendus: [] }))).toHaveLength(1)
  })
})
