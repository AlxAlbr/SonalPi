<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import { estMedia, extensionDe, EXT_VIDEO } from '../../shared/media'

/**
 * Modale « Désigner dans le Nextcloud… » (plan-audio-distant.md A3) : lier un
 * entretien à un fichier MÉDIA (audio OU vidéo) QUI VIT SUR LE SERVEUR.
 * Navigation par dossiers (PROPFIND Depth:1 côté main — `distant:listerDossier`),
 * `audios/` proposé comme point d'entrée quand il existe. Les fichiers hors
 * périmètre média (`EXT_MEDIA` partagée) sont visibles mais NON sélectionnables
 * — désigner un PDF ne ferait que remplir les miroirs d'un fichier illisible.
 *
 * La désignation est une ÉCRITURE PARTAGÉE : elle passe par le protocole de
 * session (micro-session D4 si l'entretien est fermé). Un refus (verrou tenu
 * par autrui) reste affiché dans la modale — jamais d'écrasement silencieux.
 */
const { designationAudioId, fermerDesignationAudio, confirmerDesignationAudio, membership, progressionDistant, pourcentageProgression } =
  utiliserSonal()

/** Dossier courant (relatif à la racine du corpus ; '' = racine). */
const dossier = ref('')
const entrees = ref<{ nom: string; dossier: boolean }[] | null>(null)
const charge = ref(false)
const erreur = ref<string | null>(null)
const raisonRefus = ref<string | null>(null)
/** Fichier sélectionné (chemin relatif complet) — la confirmation porte LUI. */
const selection = ref<string | null>(null)

const titre = computed(() => {
  const id = designationAudioId.value
  return id ? (membership.value[id]?.titre ?? id) : ''
})

async function lister(d: string): Promise<{ nom: string; dossier: boolean }[] | null> {
  charge.value = false
  erreur.value = null
  try {
    const r = await window.sonal.distant.listerDossier(d)
    if (r === null) {
      erreur.value = 'corpus local'
      entrees.value = []
      return null
    }
    entrees.value = r.entrees
    dossier.value = d
    return r.entrees
  } catch {
    erreur.value = 'dossier inaccessible (droits ?)'
    entrees.value = []
    return null
  } finally {
    charge.value = true
  }
}

// À chaque ouverture : partir de `audios/` si le corpus en a un (convention
// de rangement par défaut), sinon de la racine.
watch(designationAudioId, async (id) => {
  if (!id) return
  selection.value = null
  raisonRefus.value = null
  entrees.value = null
  const racineEntrees = await lister('')
  const audiosExiste = racineEntrees?.some((e) => e.dossier && e.nom === 'audios')
  if (audiosExiste) await lister('audios')
})

function ouvrirDossier(nom: string) {
  selection.value = null
  void lister(dossier.value ? `${dossier.value}/${nom}` : nom)
}

function remonter() {
  selection.value = null
  const i = dossier.value.lastIndexOf('/')
  void lister(i === -1 ? '' : dossier.value.slice(0, i))
}

function choisirFichier(nom: string) {
  raisonRefus.value = null
  selection.value = dossier.value ? `${dossier.value}/${nom}` : nom
}

async function confirmer() {
  if (!selection.value) return
  raisonRefus.value = null
  try {
    await confirmerDesignationAudio(selection.value)
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'refus'
    raisonRefus.value =
      raison === 'tenu-par-autrui'
        ? '🔒 Verrou tenu par un autre poste — réessayez plus tard.'
        : raison === 'divergence'
          ? 'Le fichier a changé sur le serveur entre-temps — réessayez.'
          : 'La désignation a été refusée.'
  }
}

/* ── Téléversement (plan-audio-distant.md D5) ───────────────────────────
 *  « ➕ Téléverser un fichier de ce poste… » : dialogue natif → PUT vers le
 *  dossier COURANT de la navigation (`audios/` par défaut — créé s'il manque)
 *  → désignation dans la foulée (un seul geste pour l'utilisateur). Collision
 *  de nom → proposition du suffixe en un clic, JAMAIS d'écrasement silencieux. */
const televersement = ref<{ source: string; suggere: string } | null>(null)
const enTeleversement = ref(false)

function baseNom(chemin: string): string {
  return chemin.split(/[\\/]/).pop() ?? chemin
}

/** Icône par nature de fichier (cas vidéo du plan audio distant) : 🎬 vidéo,
 *  🔊 audio, 📄 hors périmètre (non sélectionnable). */
function iconeFichier(nom: string): string {
  if (!estMedia(nom)) return '📄'
  return EXT_VIDEO.includes(extensionDe(nom)) ? '🎬' : '🔊'
}

/** Libellé du bouton de téléversement : progression pendant l'envoi,
 *  geste sinon. */
const libelleTeleverser = computed(() => {
  if (!enTeleversement.value) return '➕ Téléverser un fichier de ce poste…'
  if (
    progressionDistant.value?.sens === 'televersement' &&
    pourcentageProgression.value !== null
  ) {
    return `téléversement… ${pourcentageProgression.value} %`
  }
  return 'téléversement…'
})

async function choisirEtTeleverser(nomForce?: string) {
  // Reprise après collision : on réutilise le MÊME fichier local sous le nom
  // suggéré ; sinon dialogue natif et nom d'origine.
  const source =
    nomForce && televersement.value ? televersement.value.source : await window.sonal.dialog.choisirAudio()
  if (!source) return
  const nom = nomForce ?? baseNom(source)
  const cible = dossier.value ? `${dossier.value}/${nom}` : nom
  enTeleversement.value = true
  raisonRefus.value = null
  try {
    const r = await window.sonal.distant.televerserAudio(source, cible)
    if (!r.ok) {
      if (r.raison === 'existe' && r.suggere) {
        // Garde anti-écrasement : proposer le suffixe EN UN CLIC.
        televersement.value = { source, suggere: baseNom(r.suggere) }
        raisonRefus.value = `« ${nom} » existe déjà sur le serveur — l'envoyer sous « ${baseNom(r.suggere)} » ?`
        return
      }      raisonRefus.value =
        r.raison === 'lecture-impossible'
          ? 'Fichier illisible sur ce poste.'
          : r.raison === '413' || r.raison === '507'
            ? 'Fichier refusé par le serveur (limite de l’instance Nextcloud ou quota atteint).'
            : 'Échec du téléversement (réseau ou droits insuffisants).'
      return
    }
    // Succès : rafraîchir la liste et DÉSIGNER DANS LA FOULÉE (un geste).
    televersement.value = null
    await lister(dossier.value)
    await confirmerDesignationAudio(cible)
  } catch (e) {
    const raison = e instanceof Error ? e.message : 'refus'
    raisonRefus.value =
      raison === 'tenu-par-autrui'
        ? '🔒 Fichier envoyé, mais verrou tenu par autrui pour la désignation — réessayez « Désigner ».'
        : `Fichier envoyé, mais désignation refusée (${raison}) — réessayez.`
  } finally {
    enTeleversement.value = false
    // Le transfert est fini (succès ou échec) : plus d'événement IPC ne
    // viendra — on efface la progression affichée.
    progressionDistant.value = null
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="designationAudioId" class="voile-designation">
      <div class="modale-designation">
        <h3>🔗 Désigner le média dans le Nextcloud</h3>
        <p class="intro">
          Entretien « <b>{{ titre }}</b
          > » — choisissez le fichier audio ou vidéo partagé. Il sera copié chez chaque
          membre au prochain Actualiser ; vérifiez qu'il est accessible à tous
          les membres du corpus.
        </p>

        <div class="fil">
          <button class="mini" :disabled="!dossier" @click="remonter">⬆️ racine du corpus</button>
          <span class="chemin">/{{ dossier }}</span>
        </div>

        <ul class="liste">
          <li v-if="!charge" class="vide">chargement…</li>
          <li v-else-if="erreur" class="vide">{{ erreur }}</li>
          <li v-else-if="entrees!.length === 0" class="vide">dossier vide</li>
          <template v-for="e in entrees ?? []" :key="dossier + '/' + e.nom">
            <li v-if="e.dossier">
              <button class="item dossier" @click="ouvrirDossier(e.nom)">📁 {{ e.nom }}</button>
            </li>
            <li v-else-if="!estMedia(e.nom)" class="hors-media">
              <!-- Hors périmètre média : visible mais NON désignable — le miroir
                   le téléchargerait pour rien, le lecteur ne saurait le lire. -->
              <span class="item hors-media-item">📄 {{ e.nom }}</span>
            </li>
            <li v-else>
              <button
                class="item fichier"
                :class="{ choisi: selection === (dossier ? `${dossier}/${e.nom}` : e.nom) }"
                @click="choisirFichier(e.nom)"
              >
                {{ iconeFichier(e.nom) }} {{ e.nom }}
              </button>
            </li>
          </template>
          <!-- plan-audio-distant.md D5 : envoyer un fichier LOCAL vers le
               dossier courant, puis désignation automatique. -->
          <li class="televerser">
            <button class="item ajouter" :disabled="enTeleversement" @click="choisirEtTeleverser()">
              {{ libelleTeleverser }}
            </button>
            <button
              v-if="televersement"
              class="mini"
              @click="choisirEtTeleverser(televersement.suggere)"
            >
              Envoyer sous « {{ televersement.suggere }} »
            </button>
          </li>
        </ul>

        <p v-if="raisonRefus" class="note refus">{{ raisonRefus }}</p>

        <div class="actions">
          <button class="mini" @click="fermerDesignationAudio">Annuler</button>
          <button class="mini primaire" :disabled="!selection" @click="confirmer">
            Désigner ce média
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-designation {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.modale-designation {
  background: var(--fond, #fff);
  border-radius: 8px;
  padding: 16px 20px;
  width: min(520px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.intro {
  font-size: 0.9em;
  color: #555;
}
.fil {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
}
.chemin {
  font-family: monospace;
  font-size: 0.85em;
  color: #666;
}
.liste {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 6px;
  min-height: 180px;
  max-height: 320px;
}
.vide {
  color: #999;
  padding: 12px;
  text-align: center;
}
.item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
}
.item:hover {
  background: rgba(0, 0, 0, 0.05);
}
.item.fichier.choisi {
  background: rgba(64, 120, 220, 0.18);
  outline: 1px solid rgba(64, 120, 220, 0.5);
}
.hors-media-item {
  color: #aaa;
  cursor: default;
  font-style: italic;
}
.item.ajouter {
  color: #356;
  border-top: 1px dashed #ccc;
  margin-top: 4px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.primaire {
  font-weight: 600;
}
.note.refus {
  color: #a33;
  font-size: 0.9em;
  margin: 8px 0 0;
}
</style>
