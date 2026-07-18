import { ref } from 'vue'
import type { CorpusFichier, DossierCorpus } from '../../shared/format'

/**
 * Scope PROFIL (D-S12) : le dossier de corpus courant + les récents (settings.json
 * du profil). N'ouvre PAS le corpus au modèle — il renvoie le `CorpusFichier` et
 * laisse l'orchestration (App) l'appliquer via le scope corpus. Working set minimal :
 * juste des métadonnées de dossiers, jamais de contenu d'entretien.
 */
export function useProfil() {
  const dossierCourantNom = ref('')
  const recents = ref<DossierCorpus[]>([])

  async function rafraichirRecents() {
    recents.value = await window.sonal.corpus.recents()
  }
  async function majDossierCourant() {
    dossierCourantNom.value = (await window.sonal.corpus.dossierCourant()).nom
  }
  /** Picker de dossier → renvoie le corpus ouvert (ou null si annulé). Met à jour
   *  le nom courant + les récents ; l'appelant applique le corpus au modèle. */
  async function choisirDossier(): Promise<CorpusFichier | null> {
    const res = await window.sonal.corpus.choisirDossier()
    if (!res) return null
    dossierCourantNom.value = res.nom
    await rafraichirRecents()
    return res.corpus
  }
  /** Rouvre un corpus récent (par chemin) → renvoie son contenu. */
  async function ouvrirDossier(dir: string): Promise<CorpusFichier> {
    const res = await window.sonal.corpus.ouvrirDossier(dir)
    dossierCourantNom.value = res.nom
    await rafraichirRecents()
    return res.corpus
  }
  /** Retire un RACCOURCI des récents — le dossier sur disque n'est pas touché. */
  async function retirerRecent(dir: string): Promise<void> {
    recents.value = await window.sonal.corpus.retirerRecent(dir)
  }

  return { dossierCourantNom, recents, rafraichirRecents, majDossierCourant, choisirDossier, ouvrirDossier, retirerRecent }
}
