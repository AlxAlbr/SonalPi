/** Résultat du protocole de fermeture avant le second appel à app.quit(). */
export interface ResultatPreparationFermeture {
  renderersVides: boolean
  nettoyage: 'ignore' | 'termine' | 'echec' | 'expire'
}

interface OptionsFermetureApplication {
  viderRenderers: () => Promise<boolean>
  nettoyerDistant: (() => Promise<void>) | null
  quitter: () => void
  delaiNettoyageMs?: number
}

/** Attend les autosaves puis borne le nettoyage distant avant de quitter. */
export async function executerFermetureApplication(
  options: OptionsFermetureApplication,
): Promise<ResultatPreparationFermeture> {
  const renderersVides = await options.viderRenderers()
  let nettoyage: ResultatPreparationFermeture['nettoyage'] = 'ignore'

  if (renderersVides && options.nettoyerDistant) {
    let minuterie: ReturnType<typeof setTimeout> | undefined
    nettoyage = await Promise.race([
      options.nettoyerDistant().then(
        () => 'termine' as const,
        () => 'echec' as const,
      ),
      new Promise<'expire'>((resolve) => {
        minuterie = setTimeout(
          () => resolve('expire'),
          options.delaiNettoyageMs ?? 6_000,
        )
      }),
    ])
    if (minuterie) clearTimeout(minuterie)
  }

  options.quitter()
  return { renderersVides, nettoyage }
}
