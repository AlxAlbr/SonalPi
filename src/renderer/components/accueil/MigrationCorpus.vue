<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { mapperDefinitions, mapperTabAnon, mapperParamsAnon, type ApercuCrp, type VerificationDossierMigration } from '../../../shared/corpus/migrationCrp'
import type { ImportTraitementsLexicoV1 } from '../../../shared/lexico/traitements'
import type { BilanFichiersMigrationLocale } from '../../../shared/corpus/conservationMigration'
import BilanMigration from './BilanMigration.vue'

/** Prépare le bilan local avant de créer le corpus et de conserver ses documents. */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { migrerDepuisV1 } = utiliserSonal()
const cheminCrp = ref<string | null>(null)
const apercu = ref<ApercuCrp | null>(null)
const erreurCrp = ref<string | null>(null)
const lexicoV1 = ref<ImportTraitementsLexicoV1 | null>(null)
const bilanFichiers = ref<BilanFichiersMigrationLocale | null>(null)
const dossier = ref<string | null>(null)
const verif = ref<VerificationDossierMigration | null>(null)
const avertiNonVide = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)

async function choisirCrp() {
  enCours.value = true
  erreurCrp.value = null
  erreur.value = null
  apercu.value = null
  lexicoV1.value = null
  cheminCrp.value = null
  bilanFichiers.value = null
  dossier.value = null
  verif.value = null
  avertiNonVide.value = false
  try {
    const r = await window.sonal.migrer.choisirCrp()
    if (!r) return
    if (!r.analyse.ok) { erreurCrp.value = r.analyse.message; return }
    cheminCrp.value = r.chemin
    apercu.value = r.analyse.apercu
    lexicoV1.value = r.lexicoV1
  } catch (e) {
    erreurCrp.value = e instanceof Error ? e.message : 'Lecture du corpus impossible.'
  } finally { enCours.value = false }
}

async function choisirDossier() {
  enCours.value = true
  erreur.value = null
  avertiNonVide.value = false
  bilanFichiers.value = null
  try {
    const d = await window.sonal.migrer.choisirDossier(apercu.value?.nom ?? '')
    if (!d) return
    dossier.value = d
    verif.value = await window.sonal.migrer.verifierDossier(d)
    if (!verif.value.ok) {
      erreur.value = verif.value.raison === 'demo'
        ? 'Ce dossier contient un corpus de démonstration. Choisissez un autre dossier.'
        : 'Ce dossier contient déjà un corpus. Choisissez un autre dossier ; aucun fichier ne sera remplacé.'
      return
    }
    bilanFichiers.value = await window.sonal.migrer.preparerFichiers(cheminCrp.value!, d)
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Préparation des documents impossible.'
  } finally { enCours.value = false }
}

const pret = computed(() => !enCours.value && !!apercu.value && !!dossier.value && !!bilanFichiers.value &&
  verif.value?.ok && (!verif.value.nonVide || avertiNonVide.value),
)
async function migrer() {
  if (!pret.value || !apercu.value || !cheminCrp.value || !dossier.value || !bilanFichiers.value) return
  enCours.value = true
  erreur.value = null
  try {
    const { codebook, variables } = mapperDefinitions(apercu.value.raw)
    let n = 0
    await migrerDepuisV1({
      nom: apercu.value.nom, cheminCrp: cheminCrp.value, dateCreation: apercu.value.dateCreation,
      dossier: dossier.value, codebook, variables,
      reglesAnon: mapperTabAnon(apercu.value.raw.tabAnon, () => `reg-crp-${++n}`),
      paramsAnon: mapperParamsAnon(apercu.value.raw.paramsAnonCorpus),
      traitementsLexico: lexicoV1.value ? JSON.parse(JSON.stringify(lexicoV1.value.traitements)) : undefined,
      bilanFichiersId: bilanFichiers.value.bilanId,
    }, apercu.value.raw.tabEnt ?? [])
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'La migration est interrompue. Les fichiers sources restent intacts.'
    enCours.value = false
  }
}
function fermer() { if (!enCours.value) emit('fermer') }
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="fermer">
      <div class="modale-migration" role="dialog" aria-modal="true" aria-labelledby="titre-migration-locale">
        <h3 id="titre-migration-locale">Migration SonalPi1 — Local</h3>
        <p>Créez un corpus SonalPi2 dans un autre dossier. L’ancien corpus restera intact.</p>
        <div class="question">
          <label>1 — Corpus SonalPi1</label>
          <button class="choisir-crp" :disabled="enCours" @click="choisirCrp">{{ cheminCrp ?? 'Choisir un fichier .crp…' }}</button>
        </div>
        <p v-if="erreurCrp" class="msg-migration" role="alert">{{ erreurCrp }}</p>
        <div v-if="apercu" class="apercu-crp">
          <h4 class="apercu-nom">{{ apercu.nom }}</h4>
          <p class="apercu-date">{{ apercu.nbEntretiens }} entretien(s)</p>
          <div class="question">
            <label>2 — Nouveau dossier SonalPi2</label>
            <button class="choisir-dossier" :disabled="enCours" @click="choisirDossier">{{ dossier ?? 'Choisir un dossier…' }}</button>
          </div>
          <label v-if="verif?.ok && verif.nonVide" class="avertir-non-vide">
            <input v-model="avertiNonVide" type="checkbox" :disabled="enCours" />
            Ce dossier contient déjà des fichiers. Je confirme leur conservation ; aucun fichier existant ne doit être remplacé.
          </label>
          <BilanMigration :apercu="apercu" :lexico="lexicoV1" :conservation="bilanFichiers" />
          <p>Les médias restent à leur emplacement actuel : ils sont référencés, pas copiés.</p>
        </div>
        <p v-if="enCours" role="status">Lecture et copie des fichiers en cours…</p>
        <p v-if="erreur" class="msg-migration" role="alert">{{ erreur }}</p>
        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="fermer">Annuler</button>
          <button class="valider" :disabled="!pret" @click="migrer">{{ enCours ? 'Migration…' : 'Migrer vers SonalPi2' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale { position: fixed; inset: 0; background: #0007; display: flex; align-items: center; justify-content: center; z-index: 50; }
.modale-migration { background: white; border-radius: 10px; padding: 1.2rem; width: min(580px, 92vw); max-height: 90vh; overflow-y: auto; font-size: 0.85rem; }
.question { display: flex; flex-direction: column; gap: 0.4rem; margin: 1rem 0; }
button { padding: 0.4rem 0.7rem; cursor: pointer; overflow-wrap: anywhere; }
button:disabled { cursor: not-allowed; }
.apercu-nom { margin-bottom: 0.3rem; }
.avertir-non-vide { display: block; background: #fff4df; padding: 0.6rem; border-radius: 5px; }
.msg-migration { color: #b71c1c; }
.pied-modale { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
</style>
