import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type { ApiMigrationGitLab, BilanMigrationGitLab, DemandeSourceMigrationGitLab, ResultatMigrationGitLab, SourceMigrationGitLab, SuiviMigrationGitLab } from '../../../shared/corpus/migrationGitLab'
import type { ProjetGitLabPrepare } from '../../../shared/gitlab'
import { convertirEntretienMigrationGitLab } from '../../formatSonal/migrationGitLab'

/** Prépare les conversions privées et suit l'opération explicitement confirmée. */
export function useMigrationGitLab(
  etat: { enCours: Ref<boolean>; erreur: Ref<string | null> },
  api: ApiMigrationGitLab = window.sonal.migrer.gitlab,
  parseur: (html: string) => Document = (html) => new DOMParser().parseFromString(html, 'text/html'),
  operations: Pick<ApiMigrationGitLab, 'executer' | 'reprendre'> = api,
  surTerminee?: () => void,
) {
  const source = ref<SourceMigrationGitLab | null>(null)
  const cheminCrp = ref('')
  const urlCible = ref('')
  const externe = ref(false)
  const baseMediaUrl = ref('')
  const baseMediaUtilisateur = ref('')
  const baseMediaMotDePasse = ref('')
  const bilan = ref<BilanMigrationGitLab | null>(null)
  const progression = ref('')
  const suivis = ref<SuiviMigrationGitLab[]>([])
  const operationId = ref<string | null>(null)
  const publicationEnCours = ref(false)
  let generation = 0
  let actif = true
  const retirerProgression = api.surProgression((p) => {
    if (!actif || p.operationId !== operationId.value) return
    progression.value = p.etape === 'copie' ? `Copie des médias : ${p.faits}/${p.total}${p.chemin ? ` — ${p.chemin}` : ''}${p.octets !== undefined ? ` (${Math.round(p.octets / 1024 / 1024)} Mio)` : ''}`
      : p.etape === 'autres' ? `Conservation des documents : ${p.faits}/${p.total}${p.chemin ? ` — ${p.chemin}` : ''}`
      : p.etape === 'publication' ? `Création du corpus : ${p.faits + 1}/${p.total}` : 'Ouverture du corpus…'
  })

  function invaliderBilan(): void {
    generation += 1
    bilan.value = null
    etat.erreur.value = null
  }

  watch([cheminCrp, urlCible, externe, baseMediaUrl, baseMediaUtilisateur, baseMediaMotDePasse], invaliderBilan, { flush: 'sync' })

  function abandonner(): void {
    invaliderBilan()
    const preparationId = source.value?.preparationId
    source.value = null
    cheminCrp.value = ''
    if (preparationId) void api.abandonner(preparationId).catch(() => undefined)
  }

  onScopeDispose(() => {
    actif = false
    retirerProgression()
    if (publicationEnCours.value && operationId.value) void api.annuler(operationId.value).catch(() => undefined)
    abandonner()
    baseMediaMotDePasse.value = ''
  })

  async function chargerSource(demande: DemandeSourceMigrationGitLab): Promise<ProjetGitLabPrepare> {
    abandonner()
    const courante = generation
    const decouverte = await api.decouvrir(demande)
    if (!actif || courante !== generation) {
      await api.abandonner(decouverte.preparationId)
      throw new Error('La source a changé. Préparez de nouveau la migration.')
    }
    utiliserSource(decouverte)
    return decouverte.projet
  }

  function utiliserSource(preparation: SourceMigrationGitLab): void {
    source.value = preparation
    cheminCrp.value = preparation.corpus.length === 1 ? preparation.corpus[0] : ''
  }

  async function preparerBilan(compteId: string): Promise<void> {
    const couranteSource = source.value
    if (!couranteSource || !cheminCrp.value || !urlCible.value.trim() || etat.enCours.value) return
    invaliderBilan()
    const courante = generation
    etat.enCours.value = true
    progression.value = 'Lecture du corpus et vérification de la destination…'
    try {
      const resultat = await api.preparer({
        preparationId: couranteSource.preparationId,
        cheminCrp: cheminCrp.value,
        cible: { compteId, urlProjet: urlCible.value.trim() },
        ...(externe.value ? {
          baseMedia: {
            urlBase: baseMediaUrl.value.trim(),
            utilisateur: baseMediaUtilisateur.value.trim(),
            motDePasse: baseMediaMotDePasse.value,
          },
        } : {}),
      })
      if (!actif || courante !== generation) return
      for (let index = 0; index < resultat.entretiens.length; index += 1) {
        progression.value = `Vérification des entretiens : ${index + 1}/${resultat.entretiens.length}`
        const lecture = await api.lireEntretien(resultat.preparationId, index)
        if (!actif || courante !== generation) return
        if (!lecture && resultat.entretiens[index].cheminSonal) {
          throw new Error(`La transcription de « ${resultat.entretiens[index].titre} » n’a pas pu être lue.`)
        }
        await api.ajouterConversion(resultat.bilanId, index, convertirEntretienMigrationGitLab(lecture, parseur))
        if (!actif || courante !== generation) return
      }
      bilan.value = resultat
    } catch (erreur) {
      if (actif && courante === generation) {
        etat.erreur.value = erreur instanceof Error ? erreur.message : 'Préparation de la migration impossible.'
      }
    } finally {
      if (actif) {
        etat.enCours.value = false
        progression.value = ''
      }
    }
  }

  async function chargerSuivis(): Promise<void> {
    try {
      const liste = await api.listerSuivis()
      if (actif) suivis.value = liste
    } catch (erreur) {
      if (actif) etat.erreur.value = erreur instanceof Error ? erreur.message : 'Le suivi ne peut pas être lu.'
    }
  }

  async function suivre(id: string, action: () => Promise<ResultatMigrationGitLab>): Promise<void> {
    if (etat.enCours.value) return
    operationId.value = id
    publicationEnCours.value = true
    etat.enCours.value = true
    etat.erreur.value = null
    let terminee = false
    try {
      const resultat = await action()
      terminee = resultat.etat === 'terminee'
      if (actif && resultat.etat !== 'terminee') etat.erreur.value = resultat.message
      if (actif) await chargerSuivis()
    } catch (erreur) {
      if (actif) etat.erreur.value = erreur instanceof Error ? erreur.message : 'La migration est interrompue.'
    } finally {
      publicationEnCours.value = false
      operationId.value = null
      if (actif) { etat.enCours.value = false; progression.value = '' }
      if (actif && terminee) surTerminee?.()
    }
  }

  async function executer(): Promise<void> {
    const confirme = bilan.value
    if (!confirme || etat.enCours.value) return
    if (!window.confirm(`Copier ${confirme.medias.length} média(s), conserver ${confirme.conservation?.autres.length ?? 0} document(s) dans « Autres » et créer « ${confirme.apercu.nom} » dans « ${confirme.cible.nomProjet} » ? La source restera intacte. Les copies acquises seront conservées en cas d’arrêt.`)) return
    await suivre(`migration-${confirme.bilanId}`, () => operations.executer(confirme.bilanId, true))
  }

  async function reprendre(suivi: SuiviMigrationGitLab): Promise<void> {
    if (etat.enCours.value || !window.confirm(`Vérifier les copies et reprendre « ${suivi.bilan.apercu.nom} » vers « ${suivi.bilan.cible.nomProjet} » ? La source restera intacte ; aucun fichier existant ne sera remplacé.`)) return
    const baseMedia = suivi.bilan.destinationMedia === 'externe' && baseMediaMotDePasse.value
      ? { urlBase: baseMediaUrl.value.trim(), utilisateur: baseMediaUtilisateur.value.trim(), motDePasse: baseMediaMotDePasse.value } : undefined
    await suivre(suivi.operationId, () => operations.reprendre(suivi.operationId, true, baseMedia))
  }

  async function arreter(): Promise<void> {
    if (operationId.value) await api.annuler(operationId.value)
  }

  return {
    source, cheminCrp, urlCible, externe,
    baseMediaUrl, baseMediaUtilisateur, baseMediaMotDePasse,
    bilan, progression, suivis, publicationEnCours,
    chargerSource, utiliserSource, preparerBilan, abandonner, invaliderBilan, chargerSuivis, executer, reprendre, arreter,
  }
}
