<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import {
  LIBELLES_OPTIONS,
  type FormatExport,
  type OptionsExport,
} from '../../../shared/export/types'
import type { ResultatLotCorpus } from '../../services/exportCorpus'

const {
  exportCorpusOuvert,
  fermerExportCorpus,
  exporterCorpusLot,
  listeEntretiens,
  ouvertId,
} = utiliserSonal()

/** Liste des entretiens du corpus, dans l'ordre de la grille. */
const entretiens = computed(() => listeEntretiens())

/** Étape courante : sélection → options → traitement → résumé. */
const etape = ref<'selection' | 'options' | 'traitement' | 'resume'>('selection')

/** Entretiens cochés (tous par défaut). */
const selectionnes = ref<Set<string>>(new Set())
const tous = computed({
  get: () => entretiens.value.length > 0 && selectionnes.value.size === entretiens.value.length,
  set: (v: boolean) => {
    selectionnes.value = v ? new Set(entretiens.value.map((e) => e.id)) : new Set()
  },
})

/** Formats de lecture cochés : TXT et HTML par entretien, DOCX/PDF combinés. */
const FORMATS_LOT: FormatExport[] = ['txt', 'html', 'docx', 'pdf']
const formats = ref<Set<FormatExport>>(new Set(['txt']))

/** Options : mêmes libellés que l'export d'entretien, appliquées par entretien. */
const options = ref<OptionsExport>({
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: false,
  thm: true,
  anon: true,
})
const copierMedias = ref(true)
const enregistrerRapport = ref(false)

/** Traitement en cours : progression « k / n — Titre… », arrêt demandé. */
const progression = ref<{ faits: number; total: number; titre: string } | null>(null)
const arretDemande = ref(false)
const arretPrisEnCompte = ref(false)
const resultat = ref<ResultatLotCorpus | null>(null)

const message = ref<string | null>(null)
const occupe = ref(false)

// Chaque ouverture repart de l'étape de sélection, avec TOUS les entretiens.
watch(exportCorpusOuvert, (ouvert) => {
  if (!ouvert) return
  etape.value = 'selection'
  selectionnes.value = new Set(entretiens.value.map((e) => e.id))
  formats.value = new Set(['txt'])
  copierMedias.value = true
  enregistrerRapport.value = false
  progression.value = null
  arretDemande.value = false
  arretPrisEnCompte.value = false
  resultat.value = null
  message.value = null
  occupe.value = false
})

/** La liste du corpus change pendant un traitement : la sélection reste
 *  bornée aux entretiens qui existent encore. */
watch(entretiens, (liste) => {
  for (const id of selectionnes.value) {
    if (!liste.some((e) => e.id === id)) selectionnes.value.delete(id)
  }
})

const libellesFormats: Record<FormatExport, string> = {
  txt: 'Texte brut (.txt) — un fichier par entretien',
  html: 'Page web autonome (.html) — un fichier par entretien, codage + son',
  docx: 'Document combiné (.docx) — une section par entretien',
  pdf: 'PDF combiné — une section par entretien',
  sonal: '',
  srt: '',
  vtt: '',
}

/** L'option « copier les médias » n'a de sens que si l'HTML sort. */
const copierMediasVisible = computed(() => formats.value.has('html'))

function basculerFormat(f: FormatExport): void {
  if (formats.value.has(f)) {
    if (formats.value.size === 1) return // au moins un format
    formats.value.delete(f)
  } else {
    formats.value.add(f)
  }
}

function etapeSuivante(): void {
  if (selectionnes.value.size === 0 || formats.value.size === 0) return
  message.value = null
  etape.value = 'options'
}

function revenirSelection(): void {
  message.value = null
  etape.value = 'selection'
}

async function lancerExport(): Promise<void> {
  if (occupe.value) return
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  if (selection.length === 0) return
  occupe.value = true
  arretDemande.value = false
  arretPrisEnCompte.value = false
  message.value = null
  etape.value = 'traitement'
  try {
    const r = await exporterCorpusLot(
      {
        selection,
        idOuvert: ouvertId.value,
        formats: [...formats.value],
        options: { ...options.value },
        copierMedias: copierMediasVisible.value && copierMedias.value,
        enregistrerRapport: enregistrerRapport.value,
      },
      {
        surProgression: (faits, total, titre) => {
          progression.value = { faits, total, titre }
        },
        continu: () => !arretDemande.value,
      },
    )
    resultat.value = r
    etape.value = 'resume'
  } catch (erreur) {
    message.value = `L'export du corpus a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = 'options'
  } finally {
    occupe.value = false
    progression.value = null
  }
}

/** Annulation : le lot s'arrête APRÈS l'entretien courant (jamais au milieu
 *  d'un fichier, les écritures restent atomiques). */
function demanderArret(): void {
  arretDemande.value = true
  arretPrisEnCompte.value = true
}

function fermer(): void {
  if (occupe.value) return
  fermerExportCorpus()
}

function surTouche(event: KeyboardEvent): void {
  if (event.key === 'Escape' && exportCorpusOuvert.value && !occupe.value) fermer()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="exportCorpusOuvert" class="fond-export-corpus" role="dialog" aria-modal="true" aria-label="Exporter le corpus">
      <section class="modale-export-corpus">
        <header>
          <h2>📤 Exporter le corpus</h2>
          <button title="Fermer" :disabled="occupe" @click="fermer">Fermer ✕</button>
        </header>

        <!-- ÉTAPE 1 — sélection des entretiens (grille multi-colonnes). -->
        <div v-if="etape === 'selection'" class="corps">
          <p class="etape">1 — Choisissez les entretiens à exporter</p>
          <p v-if="entretiens.length === 0" class="vide">Aucun entretien dans le corpus.</p>
          <template v-else>
            <label class="option tous-option">
              <input type="checkbox" v-model="tous" />
              Tous les entretiens ({{ entretiens.length }})
            </label>
            <div class="grille-selection" :style="{ '--colonnes': entretiens.length > 20 ? 3 : 2 }">
              <label v-for="e in entretiens" :key="e.id" class="ligne-entretien">
                <input
                  type="checkbox"
                  :checked="selectionnes.has(e.id)"
                  @change="selectionnes.has(e.id) ? selectionnes.delete(e.id) : selectionnes.add(e.id)"
                />
                <span class="titre">{{ e.titre }}</span>
                <span v-if="e.date" class="date">{{ e.date }}</span>
              </label>
            </div>
            <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
            <div class="actions">
              <button class="annuler" :disabled="occupe" @click="fermer">Annuler</button>
              <button
                class="suivant"
                :disabled="selectionnes.size === 0"
                @click="etapeSuivante"
              >Suivant →</button>
            </div>
          </template>
        </div>

        <!-- ÉTAPE 2 — formats, options, pseudonymisation, rapport. -->
        <div v-else-if="etape === 'options'" class="corps">
          <p class="etape">2 — Formats et éléments à intégrer (pour {{ selectionnes.size }} entretien{{ selectionnes.size > 1 ? 's' : '' }})</p>
          <div class="formats">
            <label v-for="f in FORMATS_LOT" :key="f" class="option">
              <input
                type="checkbox"
                :checked="formats.has(f)"
                @change="basculerFormat(f)"
              />
              {{ libellesFormats[f] }}
            </label>
          </div>
          <hr />
          <div class="options">
            <template v-for="{ cle, label } in LIBELLES_OPTIONS" :key="cle">
              <label class="option">
                <input type="checkbox" v-model="options[cle]" />
                {{ label }}
              </label>
            </template>
            <label v-if="copierMediasVisible" class="option">
              <input type="checkbox" v-model="copierMedias" />
              Copier les médias accessibles (dossier <code>medias/</code>)
            </label>
            <label class="option">
              <input type="checkbox" v-model="enregistrerRapport" />
              Enregistrer le rapport détaillé de pseudonymisation
            </label>
            <p v-if="options.anon" class="avertissement-anon">
              Seuls les pseudonymes configurés sont appliqués. Les autres
              éléments restent en clair ; cette opération ne garantit pas l'anonymat.
            </p>
          </div>
          <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
          <div class="actions">
            <button class="retour" :disabled="occupe" @click="revenirSelection">← Retour</button>
            <button class="exporter" :disabled="occupe" @click="lancerExport">
              📥 Exporter {{ selectionnes.size }} entretien{{ selectionnes.size > 1 ? 's' : '' }}
            </button>
          </div>
        </div>

        <!-- ÉTAPE 3 — traitement : progression par entretien, arrêt possible. -->
        <div v-else-if="etape === 'traitement'" class="corps">
          <p class="etape">Export en cours…</p>
          <p class="progression">
            <template v-if="progression">
              <b>{{ progression.faits }} / {{ progression.total }}</b> — {{ progression.titre }}
            </template>
            <template v-else>Préparation…</template>
          </p>
          <p v-if="arretPrisEnCompte" class="avertissement-anon">
            Arrêt demandé : l'export s'arrête après l'entretien en cours.
          </p>
          <div class="actions">
            <button v-if="!arretDemande" class="annuler" @click="demanderArret">Annuler après l'entretien courant</button>
            <button v-else class="annuler" disabled>⏳ Arrêt en cours…</button>
          </div>
        </div>

        <!-- ÉTAPE 4 — résumé final : réussites, échecs expliqués, dossier. -->
        <div v-else-if="etape === 'resume' && resultat" class="corps">
          <p class="etape">
            <template v-if="resultat.etat === 'succes'">Export terminé ✅</template>
            <template v-else-if="resultat.etat === 'annule'">Export arrêté ⏹</template>
            <template v-else>Export en échec ❌</template>
          </p>
          <p v-if="resultat.etat !== 'echec' && resultat.dossier" class="dossier">
            Dossier : <code>{{ resultat.dossier }}</code>
          </p>
          <p v-if="resultat.etat === 'echec'" class="message-erreur" role="alert">{{ resultat.message }}</p>

          <template v-if="resultat.etat !== 'echec'">
            <div class="resume-lot">
              <div v-for="f in resultat.faits" :key="f.id" class="resume-ligne" :class="f.etat">
                <span class="icone">
                  {{ f.etat === 'succes' ? '✅' : f.etat === 'abandonne' ? '⏹' : '❌' }}
                </span>
                <span class="titre">{{ f.titre }}</span>
                <span v-if="f.raison" class="raison">{{ f.raison }}</span>
              </div>
            </div>

            <details v-if="resultat.etat === 'succes' && resultat.rapportResume.length > 0" class="rapport-global">
              <summary>Rapport de pseudonymisation ({{ resultat.rapportResume.length }} entretien{{ resultat.rapportResume.length > 1 ? 's' : '' }})</summary>
              <p class="limite-rapport">
                Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.
                Le rapport détaillé par entretien peut être enregistré à l'étape précédente.
              </p>
              <div v-for="r in resultat.rapportResume" :key="r.id" class="ligne-rapport">
                <b>{{ r.titre }}</b> — {{ r.appliquees }} appliqué(s), {{ r.conserves }} conservé(s),
                {{ r.aVerifier }} à vérifier.
              </div>
            </details>
          </template>

          <div class="actions">
            <button class="retour" @click="fermerExportCorpus">Fermer</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-export-corpus { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .45); box-sizing: border-box; }
.modale-export-corpus { position: absolute; top: 8vh; left: 50%; transform: translateX(-50%); width: min(720px, 94vw); max-height: 84vh; background: #fff; border-radius: 10px; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); overflow: hidden; display: flex; flex-direction: column; }
.modale-export-corpus > header { display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 1rem; border-bottom: 1px solid #ccc; flex: 0 0 auto; }
h2 { margin: 0; font-size: 1.1rem; }
.modale-export-corpus > header button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
.modale-export-corpus > header button:disabled { opacity: .5; cursor: default; }
.corps { padding: 0 1rem 1rem; overflow-y: auto; }
.etape { font-size: .95rem; margin: 1rem 0 .8rem; color: #333; }
.vide { color: #777; }
.grille-selection {
  display: grid;
  grid-template-columns: repeat(var(--colonnes, 2), 1fr);
  gap: .15rem 1rem;
  max-height: 46vh;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 5px;
  padding: .5rem;
  box-sizing: border-box;
}
.ligne-entretien { display: flex; align-items: baseline; gap: .5rem; padding: .2rem 0; cursor: pointer; }
.ligne-entretien .titre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ligne-entretien .date { color: #999; font-size: .8rem; }
.tous-option { border-bottom: 1px solid #ddd; padding-bottom: .5rem; margin-bottom: .5rem; }
.option { display: flex; align-items: baseline; gap: .6rem; padding: .3rem 0; cursor: pointer; }
.options { display: flex; flex-direction: column; gap: .1rem; }
hr { border: none; border-top: 1px solid #eee; margin: .8rem 0; }
.avertissement-anon { margin: .4rem 0 0; padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #7a5c00; border: 1px solid #ffe082; font-size: .85rem; }
.progression { font-size: 1rem; }
.dossier { font-size: .9rem; word-break: break-all; }
.message-erreur { margin: .6rem 0 0; padding: .6rem .8rem; border-radius: 5px; font-size: .9rem; white-space: pre-wrap; background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
.resume-ligne { display: flex; align-items: baseline; gap: .5rem; padding: .15rem 0; font-size: .9rem; }
.resume-ligne .titre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resume-ligne .raison { color: #b71c1c; font-size: .85rem; }
.resume-ligne.abandonne { color: #777; }
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions button:disabled { opacity: .55; cursor: default; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .annuler { flex: 1; border: 1px solid #b71c1c; color: #b71c1c; background: #fff; }
.actions .suivant, .actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions .exporter:hover:not(:disabled), .actions .suivant:hover:not(:disabled) { background: #256a28; }
.limite-rapport { padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #5f4900; font-size: .85rem; }
.rapport-global { margin-top: .8rem; }
.rapport-global summary { cursor: pointer; font-weight: 600; }
.ligne-rapport { padding: .2rem 0; font-size: .9rem; }
</style>
