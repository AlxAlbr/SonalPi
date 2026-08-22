import { ref } from 'vue'
import type { CorpusFichier, EntreeRecent } from '../../shared/format'

/**
 * Scope PROFIL : le dossier de corpus courant + les récents (settings.json
 * du profil). N'ouvre PAS le corpus au modèle — il renvoie le `CorpusFichier` et
 * laisse l'orchestration (App) l'appliquer via le scope corpus. Working set minimal :
 * juste des métadonnées de dossiers, jamais de contenu d'entretien.
 *
 * Les récents sont TAGUÉS local/distant : l'appelant branche — un récent distant
 * se rouvre via `distant:ouvrir(id)`, JAMAIS son chemin miroir en tant que dossier
 * local.
 */
export function useProfil() {
  const dossierCourantNom = ref('')
  const recents = ref<EntreeRecent[]>([])

  async function rafraichirRecents() {
    recents.value = await window.sonal.corpus.recents()
  }
  async function majDossierCourant() {
    dossierCourantNom.value = (await window.sonal.corpus.dossierCourant()).nom
  }
  /** Picker de dossier → renvoie le corpus ouvert + son chemin (ou null si
   *  annulé). Met à jour le nom courant + les récents ; l'appelant applique le
   *  corpus au modèle (le `dir` sert à restaurer le mode démo). */
  async function choisirDossier(): Promise<{ corpus: CorpusFichier; dir: string } | null> {
    const res = await window.sonal.corpus.choisirDossier()
    if (!res) return null
    dossierCourantNom.value = res.nom
    await rafraichirRecents()
    return { corpus: res.corpus, dir: res.dir }
  }
  /** Rouvre un corpus récent (par chemin) → renvoie son contenu. */
  async function ouvrirDossier(dir: string): Promise<CorpusFichier> {
    const res = await window.sonal.corpus.ouvrirDossier(dir)
    dossierCourantNom.value = res.nom
    await rafraichirRecents()
    return res.corpus
  }
  /** Retire un RACCOURCI des récents (local OU distant) — ni le dossier sur
   *  disque, ni le miroir, ni le serveur ne sont touchés. On envoie une COPIE
   *  plate (l'entrée du renderer est un proxy Vue réactif : le clonage
   *  structuré de l'IPC peut le refuser). */
  async function retirerRecent(entree: EntreeRecent): Promise<void> {
    const cle =
      entree.type === 'distant'
        ? { type: 'distant' as const, id: entree.id }
        : { type: 'local' as const, dir: entree.dir }
    await window.sonal.corpus.retirerRecent(cle)
    await rafraichirRecents()
  }

  return { dossierCourantNom, recents, rafraichirRecents, majDossierCourant, choisirDossier, ouvrirDossier, retirerRecent }
}
