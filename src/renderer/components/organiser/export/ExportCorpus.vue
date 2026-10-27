<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import {
  LIBELLES_OPTIONS,
  type FormatExport,
  type OptionsExport,
} from '../../../../shared/export/types'
import type {
  ApercuRapportPseudonymisationCorpus,
  DemandeLotCorpus,
  ResultatLotCorpus,
} from '../../../export/exportCorpus'

const props = defineProps<{ actif: boolean }>()

const {
  exporterCorpusLot,
  enregistrerExportGuide,
  exporterQualcoderLot,
  exportCorpusEnCours: occupe,
  listeCas,
  preparerRapportCorpus,
  enregistrerRapportCorpus,
  listeEntretiens,
  ouvertId,
} = utiliserSonal()

/** Liste des entretiens du corpus, dans l'ordre de la grille. */
const entretiens = computed(() => listeEntretiens())

/** Le rapport et le résultat s'affichent à côté des réglages. */
const etape = ref<'options' | 'rapport' | 'traitement' | 'resume'>('options')
const modeExport = ref<'lecture' | 'qualcoder'>('lecture')
const casSelectionnes = ref<Set<string>>(new Set(listeCas.value.map((cas) => cas.id)))

/** Entretiens cochés (tous par défaut). */
const selectionnes = ref<Set<string>>(new Set(entretiens.value.map((e) => e.id)))
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
const rapportDemande = ref(false)
const apercuRapport = ref<ApercuRapportPseudonymisationCorpus | null>(null)

/** Traitement en cours : progression « k / n — Titre… », arrêt demandé. */
const progression = ref<{ faits: number; total: number; titre: string } | null>(null)
const arretDemande = ref(false)
const arretPrisEnCompte = ref(false)
const resultat = ref<ResultatLotCorpus | null>(null)
const resultatQualcoder = ref<
  | { etat: 'succes'; dossier: string }
  | { etat: 'annule' }
  | { etat: 'echec'; message: string }
  | null
>(null)

const message = ref<string | null>(null)
const messageEstErreur = ref(true)

let generationRapport = 0

// Un changement de réglage demande une nouvelle vérification avant l'export.
watch([selectionnes, modeExport, casSelectionnes, formats, options, copierMedias, rapportDemande], () => {
  generationRapport += 1
  apercuRapport.value = null
  resultat.value = null
  resultatQualcoder.value = null
  message.value = null
  etape.value = 'options'
}, { deep: true, flush: 'sync' })

// Les sources peuvent être modifiées dans un autre outil : le rapport devra être relu.
watch(() => props.actif, (actif) => {
  if (actif) return
  generationRapport += 1
  apercuRapport.value = null
  if (etape.value === 'rapport') etape.value = 'options'
}, { flush: 'sync' })

/** La sélection ne conserve que les entretiens encore présents. */
watch(entretiens, (liste) => {
  for (const id of selectionnes.value) {
    if (!liste.some((e) => e.id === id)) selectionnes.value.delete(id)
  }
})

watch(listeCas, (liste) => {
  for (const id of casSelectionnes.value) {
    if (!liste.some((cas) => cas.id === id)) casSelectionnes.value.delete(id)
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

function changerCas(event: Event, id: string): void {
  const target = event.target as HTMLInputElement
  if (target.checked) casSelectionnes.value.add(id)
  else casSelectionnes.value.delete(id)
}

function changerTousLesCas(event: Event): void {
  const target = event.target as HTMLInputElement
  casSelectionnes.value = target.checked ? new Set(listeCas.value.map((cas) => cas.id)) : new Set()
}

function basculerFormat(f: FormatExport): void {
  if (formats.value.has(f)) {
    if (formats.value.size === 1) return
    formats.value.delete(f)
  } else {
    formats.value.add(f)
  }
  apercuRapport.value = null
  message.value = null
}

function demandeCourante(): DemandeLotCorpus | null {
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  if (selection.length === 0) return null
  return {
    selection,
    idOuvert: ouvertId.value,
    formats: [...formats.value],
    options: { ...options.value },
    copierMedias: copierMediasVisible.value && copierMedias.value,
    enregistrerRapport: false,
  }
}

async function lancerQualcoder(): Promise<void> {
  if (occupe.value || selectionnes.value.size === 0) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  etape.value = 'traitement'
  const selection = entretiens.value
    .filter((e) => selectionnes.value.has(e.id))
    .map((e) => ({ id: e.id, titre: e.titre, date: e.date }))
  try {
    const r = await exporterQualcoderLot(selection, [...casSelectionnes.value])
    resultatQualcoder.value = r
    etape.value = 'resume'
  } catch (erreur) {
    message.value = `L'export QualCoder a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = 'options'
  } finally {
    occupe.value = false
    progression.value = null
  }
}

/** Le premier clic prépare l'aperçu demandé, sans lancer l'export final. */
async function lancerExport(): Promise<void> {
  if (modeExport.value === 'qualcoder') {
    await lancerQualcoder()
    return
  }
  const demande = demandeCourante()
  if (!demande || occupe.value) return
  if (options.value.anon && rapportDemande.value && !apercuRapport.value) {
    occupe.value = true
    message.value = null
    messageEstErreur.value = true
    try {
      const generation = generationRapport
      const preparation = await preparerRapportCorpus(demande)
      if (generation !== generationRapport) return
      if (preparation.etat === 'erreur') {
        message.value = preparation.message
        return
      }
      apercuRapport.value = preparation.apercu
      etape.value = 'rapport'
    } finally {
      occupe.value = false
    }
    return
  }
  await lancerExportFinal()
}

async function lancerExportFinal(): Promise<void> {
  const demande = demandeCourante()
  if (!demande || occupe.value) return
  occupe.value = true
  arretDemande.value = false
  arretPrisEnCompte.value = false
  message.value = null
  messageEstErreur.value = true
  etape.value = 'traitement'
  try {
    const r = await exporterCorpusLot(
      demande,
      {
        surProgression: (faits, total, titre) => {
          progression.value = { faits, total, titre }
        },
        continu: () => !arretDemande.value,
      },
    )
    resultat.value = r
    enregistrerExportGuide(demande, r)
    etape.value = 'resume'
  } catch (erreur) {
    message.value = `L'export du corpus a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    etape.value = apercuRapport.value ? 'rapport' : 'options'
  } finally {
    occupe.value = false
    progression.value = null
  }
}

async function sauvegarderRapport(): Promise<void> {
  if (!apercuRapport.value || occupe.value) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  try {
    const enregistrement = await enregistrerRapportCorpus(apercuRapport.value)
    if (enregistrement.etat === 'erreur') {
      message.value = enregistrement.message
    } else if (enregistrement.etat === 'succes') {
      messageEstErreur.value = false
      message.value = `Rapport enregistré : ${enregistrement.chemin}`
    }
  } finally {
    occupe.value = false
  }
}

function revenirAuxOptions(): void {
  apercuRapport.value = null
  message.value = null
  etape.value = 'options'
}

/** L'arrêt attend la fin de l'entretien courant pour conserver des fichiers complets. */
function demanderArret(): void {
  arretDemande.value = true
  arretPrisEnCompte.value = true
}
</script>

<template>
  <section class="export-corpus">
    <aside class="panneau reglages-export" data-tour="reglages-export-guide">
      <div class="corpus-tete"><h3>Exporter le corpus</h3></div>
      <p class="accueil-intro">Choisissez les entretiens et leur présentation. Vérifiez le récapitulatif à droite avant d’exporter.</p>
      <fieldset class="champs-export" :disabled="occupe">
        <div>
          <h4>Entretiens à exporter</h4>
          <p v-if="entretiens.length === 0" class="vide">Aucun entretien dans le corpus.</p>
          <template v-else>
            <label class="option tous-option">
              <input type="checkbox" v-model="tous" />
              Tous les entretiens ({{ entretiens.length }})
            </label>
            <div class="grille-selection">
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
            <fieldset class="mode-export">
              <legend>Type d’export</legend>
              <label class="option">
                <input v-model="modeExport" type="radio" value="lecture" />
                Formats de lecture (TXT, HTML, DOCX, PDF)
              </label>
              <label class="option">
                <input v-model="modeExport" type="radio" value="qualcoder" />
                Projet QualCoder (.qda)
              </label>
            </fieldset>
          </template>
        </div>

        <div v-if="entretiens.length > 0">
          <h4>{{ modeExport === 'qualcoder' ? 'Cas à intégrer au projet QualCoder' : 'Formats et éléments à intégrer' }}</h4>
          <template v-if="modeExport === 'qualcoder'">
            <p class="avertissement-anon">
              Le projet QualCoder contiendra les sources sélectionnées, leurs passages,
              les cas choisis et les attributs disponibles. Les règles dynamiques ne
              deviendront pas des règles QualCoder.
            </p>
            <p class="limite-rapport">
              Cette première version exporte le texte source. La pseudonymisation et
              le rapport détaillé des pertes restent à valider avant de partager un projet.
            </p>
            <div class="selection-cas">
              <label class="option tous-option">
                <input
                  type="checkbox"
                  :checked="listeCas.length > 0 && casSelectionnes.size === listeCas.length"
                  @change="changerTousLesCas"
                />
                Tous les cas ({{ listeCas.length }})
              </label>
              <label v-for="cas in listeCas" :key="cas.id" class="option cas-export">
                <input type="checkbox" :checked="casSelectionnes.has(cas.id)" @change="changerCas($event, cas.id)" />
                <span>{{ cas.nom }} <small>({{ cas.regles.length ? 'avec règle' : 'manuel' }})</small></span>
              </label>
              <p v-if="listeCas.length === 0" class="vide">Aucun cas dans ce corpus.</p>
            </div>
          </template>
          <template v-else>
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
            <label v-if="options.anon" class="option rapport-option">
              <input type="checkbox" v-model="rapportDemande" />
              Consulter le rapport de pseudonymisation avant l'export
            </label>
            <p v-if="options.anon" class="avertissement-anon">
              Seuls les pseudonymes configurés sont appliqués. Les autres
              éléments restent en clair ; cette opération ne garantit pas l'anonymat.
            </p>
          </div>
          </template>
        </div>
      </fieldset>
    </aside>

    <section class="resultats-export" aria-label="Vérifications et résultat de l’export" :aria-busy="occupe">
      <div v-if="etape === 'options'" class="corps recapitulatif-export">
        <h2>Préparer l’export</h2>
        <p class="etape">{{ selectionnes.size }} entretien{{ selectionnes.size > 1 ? 's' : '' }} sélectionné{{ selectionnes.size > 1 ? 's' : '' }} sur {{ entretiens.length }}</p>
        <template v-if="selectionnes.size > 0">
          <p v-if="modeExport === 'qualcoder'">Un projet QualCoder (.qda), avec {{ casSelectionnes.size }} cas. Le texte source sera exporté sans pseudonymisation.</p>
          <template v-else>
            <h3>Fichiers prévus</h3>
            <ul><li v-for="format in FORMATS_LOT.filter(f => formats.has(f))" :key="format">{{ libellesFormats[format] }}</li></ul>
            <p>Un index récapitulatif accompagnera les fichiers.</p>
            <h3>Éléments à intégrer</h3>
            <ul><li v-for="option in LIBELLES_OPTIONS.filter(o => o.cle !== 'anon' && options[o.cle])" :key="option.cle">{{ option.label }}</li></ul>
            <p v-if="copierMediasVisible && copierMedias">Les médias accessibles seront copiés avec les pages HTML.</p>
            <p v-if="options.anon" class="avertissement-anon">Les pseudonymes configurés seront appliqués. Vérifiez les informations restantes avant de partager les fichiers.</p>
            <p v-else class="avertissement-anon">Les transcriptions seront exportées sans pseudonymisation.</p>
            <p v-if="options.anon && rapportDemande">Le rapport s’affichera ici pour vérification avant de lancer l’export.</p>
          </template>
          <details class="entretiens-recap">
            <summary>Voir les entretiens sélectionnés</summary>
            <ul><li v-for="e in entretiens.filter(e => selectionnes.has(e.id))" :key="e.id">{{ e.titre }}</li></ul>
          </details>
        </template>
        <p v-else class="vide">Cochez au moins un entretien dans le panneau de gauche.</p>
        <p class="destination-export">Le dossier de destination vous sera demandé au lancement. Les entretiens du corpus ne seront pas modifiés.</p>
        <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
        <div class="actions">
          <button class="exporter" :disabled="occupe || selectionnes.size === 0" @click="lancerExport">
            {{ occupe ? 'Préparation…' : options.anon && rapportDemande && modeExport === 'lecture' ? 'Vérifier le rapport avant l’export' : `Exporter ${selectionnes.size} entretien${selectionnes.size > 1 ? 's' : ''}` }}
          </button>
        </div>
      </div>

      <!-- Le rapport reste consultable à côté des réglages. -->
        <div v-else-if="etape === 'rapport' && apercuRapport" class="corps">
          <p class="etape">Rapport de pseudonymisation avant l'export</p>
          <p class="limite-rapport">
            Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.
          </p>
          <div v-if="apercuRapport.indisponibles.length > 0" class="avertissement-anon">
            <b>Aperçu incomplet :</b>
            <div v-for="item in apercuRapport.indisponibles" :key="item.id">
              {{ item.titre }} — {{ item.raison }}
            </div>
          </div>
          <div class="rapport-contenu">
            <article v-for="entretien in apercuRapport.entretiens" :key="entretien.id">
              <h3>{{ entretien.titre }}</h3>
              <section v-for="detail in entretien.formats" :key="detail.format">
                <h4 v-if="entretien.formats.length > 1">Format {{ detail.format.toUpperCase() }}</h4>
                <h5>Pseudonymisation appliquée</h5>
                <ul><li v-for="ligne in detail.rapport.appliquees" :key="ligne.code">{{ ligne.message }}</li></ul>
                <h5>Éléments conservés</h5>
                <ul><li v-for="ligne in detail.rapport.conserves" :key="ligne.code">{{ ligne.message }}</li></ul>
                <h5>Éléments à vérifier manuellement</h5>
                <ul v-if="detail.rapport.aVerifier.length > 0">
                  <li v-for="ligne in detail.rapport.aVerifier" :key="ligne.code">{{ ligne.message }}</li>
                </ul>
                <p v-else>Aucun élément à signaler.</p>
              </section>
            </article>
          </div>
          <p
            v-if="message"
            :class="messageEstErreur ? 'message-erreur' : 'message-information'"
            :role="messageEstErreur ? 'alert' : 'status'"
          >{{ message }}</p>
          <div class="actions actions-rapport">
            <button class="retour" :disabled="occupe" @click="revenirAuxOptions">Modifier les réglages</button>
            <button class="enregistrer" :disabled="occupe" @click="sauvegarderRapport">Enregistrer le rapport</button>
            <button class="exporter" :disabled="occupe" @click="lancerExportFinal">
              {{ occupe ? '⏳ Traitement…' : '📥 Lancer l’export' }}
            </button>
          </div>
        </div>

        <!-- Progression par entretien et arrêt à la fin du fichier courant. -->
        <div v-else-if="etape === 'traitement'" class="corps" role="status">
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
          <div v-if="modeExport === 'lecture'" class="actions">
            <button v-if="!arretDemande" class="annuler" @click="demanderArret">Annuler après l'entretien courant</button>
            <button v-else class="annuler" disabled>⏳ Arrêt en cours…</button>
          </div>
        </div>

        <!-- Bilan du projet QualCoder. -->
        <div v-else-if="etape === 'resume' && resultatQualcoder" class="corps" aria-live="polite">
          <p class="etape">
            <template v-if="resultatQualcoder.etat === 'succes'">Projet QualCoder créé ✅</template>
            <template v-else-if="resultatQualcoder.etat === 'annule'">Export QualCoder annulé</template>
            <template v-else>Export QualCoder en échec ❌</template>
          </p>
          <p v-if="resultatQualcoder.etat === 'succes'" class="dossier">
            Dossier : <code>{{ resultatQualcoder.dossier }}</code>
          </p>
          <p v-if="resultatQualcoder.etat === 'echec'" class="message-erreur" role="alert">
            {{ resultatQualcoder.message }}
          </p>
          <div class="actions">
            <button class="retour" @click="revenirAuxOptions">Préparer un autre export</button>
          </div>
        </div>

        <!-- Bilan du lot : réussites, échecs expliqués et dossier de destination. -->
        <div v-else-if="etape === 'resume' && resultat" class="corps" aria-live="polite">
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
                Le rapport détaillé par entretien peut être enregistré avant le lancement de l’export.
              </p>
              <div v-for="r in resultat.rapportResume" :key="r.id" class="ligne-rapport">
                <b>{{ r.titre }}</b> — {{ r.appliquees }} appliqué(s), {{ r.conserves }} conservé(s),
                {{ r.aVerifier }} à vérifier.
              </div>
            </details>
          </template>

          <div class="actions">
            <button class="retour" @click="revenirAuxOptions">Préparer un autre export</button>
          </div>
        </div>
    </section>
  </section>
</template>

<style scoped>
.export-corpus { display: grid; grid-template-columns: var(--largeur-organisation) minmax(0, 1fr); gap: 1rem; height: 100%; min-height: 0; }
.reglages-export, .resultats-export { min-width: 0; min-height: 0; overflow-y: auto; }
.reglages-export { font-size: .82rem; }
.champs-export { border: 0; padding: 0; margin: 0; min-width: 0; }
h4 { margin: 1rem 0 .5rem; font-size: .85rem; }
.resultats-export { border: 1px solid #ddd; border-radius: 8px; background: #fff; }
h2 { margin: 0; font-size: 1.1rem; }
.corps { padding: 1rem 1.2rem; }
.recapitulatif-export { max-width: 52rem; line-height: 1.45; }
.recapitulatif-export h3 { font-size: .95rem; }
.entretiens-recap { margin-top: 1rem; }
.entretiens-recap summary { cursor: pointer; }
.destination-export { color: #666; font-size: .85rem; }
@media (max-width: 780px) {
  .export-corpus { grid-template-columns: minmax(0, 1fr); height: auto; }
  .reglages-export, .resultats-export { overflow: visible; }
}
.etape { font-size: .95rem; margin: 1rem 0 .8rem; color: #333; }
.vide { color: #777; }
.grille-selection {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: .15rem 1rem;
  max-height: 28vh;
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
.mode-export { border: 1px solid #ddd; border-radius: 5px; padding: .5rem .7rem; margin: .8rem 0 0; }
.mode-export legend { padding: 0 .3rem; font-weight: 600; }
.selection-cas { max-height: 42vh; overflow-y: auto; border: 1px solid #ddd; border-radius: 5px; padding: .5rem .7rem; }
.cas-export { border-bottom: 1px solid #eee; }
.cas-export:last-of-type { border-bottom: 0; }
.option { display: flex; align-items: baseline; gap: .6rem; padding: .3rem 0; cursor: pointer; }
.options { display: flex; flex-direction: column; gap: .1rem; }
.rapport-option { margin-top: .25rem; border-top: 1px solid #ddd; padding-top: .65rem; }
hr { border: none; border-top: 1px solid #eee; margin: .8rem 0; }
.avertissement-anon { margin: .4rem 0 0; padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #7a5c00; border: 1px solid #ffe082; font-size: .85rem; }
.progression { font-size: 1rem; }
.dossier { font-size: .9rem; word-break: break-all; }
.message-erreur, .message-information { margin: .6rem 0 0; padding: .6rem .8rem; border-radius: 5px; font-size: .9rem; white-space: pre-wrap; }
.message-erreur { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
.message-information { background: #edf7ed; color: #1b5e20; border: 1px solid #a5d6a7; }
.resume-ligne { display: flex; align-items: baseline; gap: .5rem; padding: .15rem 0; font-size: .9rem; }
.resume-ligne .titre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.resume-ligne .raison { color: #b71c1c; font-size: .85rem; }
.resume-ligne.abandonne { color: #777; }
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions button:disabled { opacity: .55; cursor: default; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .annuler { flex: 1; border: 1px solid #b71c1c; color: #b71c1c; background: #fff; }
.actions .enregistrer { flex: 2; border: 1px solid #1565c0; color: #0d47a1; background: #e3f2fd; }
.actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions-rapport { flex-wrap: wrap; }
.actions .exporter:hover:not(:disabled) { background: #256a28; }
.limite-rapport { padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #5f4900; font-size: .85rem; }
.rapport-contenu article { margin-top: 1rem; padding-top: .75rem; border-top: 1px solid #ddd; }
.rapport-contenu h3 { margin: 0 0 .5rem; font-size: 1rem; }
.rapport-contenu h4 { margin: .7rem 0 .35rem; font-size: .9rem; color: #555; }
.rapport-contenu h5 { margin: .55rem 0 .2rem; font-size: .9rem; }
.rapport-contenu ul { margin: 0; padding-left: 1.25rem; }
.rapport-contenu p { margin: 0; font-size: .9rem; }
.rapport-global { margin-top: .8rem; }
.rapport-global summary { cursor: pointer; font-weight: 600; }
.ligne-rapport { padding: .2rem 0; font-size: .9rem; }
</style>
