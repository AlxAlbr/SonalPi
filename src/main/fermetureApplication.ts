/** Résultat du protocole de fermeture avant le second appel à app.quit(). */
export interface ResultatPreparationFermeture {
  renderersVides: boolean
  nettoyage: 'ignore' | 'termine' | 'echec' | 'expire' | 'abandonne'
}

interface OptionsFermetureApplication {
  viderRenderers: () => Promise<boolean>
  nettoyerDistant: (() => Promise<void>) | null
  quitter: () => void
  delaiNettoyageMs?: number
  /** Se résout si l'utilisateur demande de fermer sans attendre la fin de l'envoi. */
  abandon?: Promise<void>
}

/** Temps laissé au nettoyage distant : un serveur lent peut demander plusieurs nouvelles tentatives.
 *  L'utilisateur peut écourter l'attente ; son travail reste alors sur le poste et sera proposé au prochain lancement. */
export const DELAI_NETTOYAGE_FERMETURE_MS = 45_000

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
          options.delaiNettoyageMs ?? DELAI_NETTOYAGE_FERMETURE_MS,
        )
      }),
      ...(options.abandon ? [options.abandon.then(() => 'abandonne' as const)] : []),
    ])
    if (minuterie) clearTimeout(minuterie)
  }

  options.quitter()
  return { renderersVides, nettoyage }
}
