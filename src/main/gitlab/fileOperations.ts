/**
 *  File d'opérations d'un contexte GitLab.
 *
 *  Une seule opération à la fois : une transaction de corpus, un tirage et son
 *  installation, ou l'entrée en fermeture. Sans cela, un tirage commencé avant
 *  une publication pourrait réinstaller une base plus ancienne après le succès
 *  de cette publication.
 *
 *  La fermeture verrouille l'entrée, puis attend l'opération déjà engagée :
 *  aucune ancienne transaction ne doit encore publier après l'installation du
 *  nouveau contexte.
 */
export class FileOperationsContexte {
  private courante: Promise<unknown> = Promise.resolve()
  private verrouillee = false
  private attente = 0

  /** Refuse toute nouvelle opération, puis attend la fin de l'opération
   *  déjà engagée. */
  async fermer(): Promise<void> {
    this.verrouillee = true
    await this.courante.then(
      () => undefined,
      () => undefined,
    )
  }

  executer<T>(operation: () => Promise<T>): Promise<T> {
    if (this.verrouillee) {
      return Promise.reject(new Error('Le contexte GitLab est fermé.'))
    }
    this.attente += 1
    const resultat = this.courante.then(operation, operation)
    this.courante = resultat.then(
      () => undefined,
      () => undefined,
    )
    return resultat.finally(() => {
      this.attente -= 1
    })
  }
}
