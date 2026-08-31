<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import { mapperDefinitions, mapperTabAnon, mapperParamsAnon, type ApercuCrp, type VerificationDossierMigration } from '../../shared/corpus/migrationCrp'

/**
 *  Modale de migration SonalPi1 → SonalPi2.
 *  Trois temps, aucun effet de bord avant la validation finale :
 *  1. choix du `.crp` (dialogue + lecture + encodage dans le main,
 *     analyse PURE côté shared) → APERÇU (nom, date, nb d'entretiens, thèmes,
 *     variables, règles d'anonymisation) ;
 *  2. choix du DOSSIER DÉDIÉ (pré-rempli Documents/Sonal/<nom>) avec la garde
 *     « on n'écrase jamais » (dejaCorpus / démo refusés ; un dossier non vide
 *     sans corpus.json demande un avertissement confirmé) ;
 *  3. MIGRATION : définitions mappées → `migrer:executer` écrit le corpus
 *     SonalPi2 (nom + meta.sourceV1), l'ajoute aux récents et l'ouvre.
 */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { migrerDepuisV1 } = utiliserSonal()

// --- État du flux ---
const cheminCrp = ref<string | null>(null)
const apercu = ref<ApercuCrp | null>(null)
const erreurCrp = ref<string | null>(null)
const dossier = ref<string | null>(null)
const verif = ref<VerificationDossierMigration | null>(null)
const avertiNonVide = ref(false)
const enCours = ref(false)
const erreur = ref<string | null>(null)

const dateAffichee = computed(() => {
  const d = apercu.value?.dateCreation
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('fr-FR')
})

async function choisirCrp() {
  erreurCrp.value = null
  apercu.value = null
  cheminCrp.value = null
  try {
    const r = await window.sonal.migrer.choisirCrp()
    if (!r) return // dialogue annulé
    if (!r.analyse.ok) {
      erreurCrp.value = r.analyse.message
      return
    }
    cheminCrp.value = r.chemin
    apercu.value = r.analyse.apercu
  } catch (e) {
    // Un échec IPC ne doit pas rester SILENCIEUX (une erreur de préload ou de main sans handler donne un rejet —
    // l'afficher plutôt que « rien »).
    erreurCrp.value = e instanceof Error ? e.message : 'Échec de la lecture du .crp.'
  }
}

async function choisirDossier() {
  erreur.value = null
  avertiNonVide.value = false
  try {
    const d = await window.sonal.migrer.choisirDossier(apercu.value?.nom ?? '')
    if (!d) return
    dossier.value = d
    verif.value = await window.sonal.migrer.verifierDossier(d)
    if (!verif.value.ok) {
      erreur.value =
        verif.value.raison === 'demo'
          ? 'Ce dossier est le corpus d’un mode démo — passe en SonalPi2 dans un dossier dédié.'
          : 'Ce dossier contient déjà un corpus — choisis un dossier dédié (on n’écrase jamais).'
    }
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Échec du choix du dossier.'
  }
}

const pret = computed(() => {
  if (enCours.value) return false
  if (!apercu.value) return false
  if (!dossier.value || !verif.value?.ok) return false
  if (verif.value.nonVide && !avertiNonVide.value) return false
  return true
})

async function migrer() {
  if (!pret.value || !apercu.value || !cheminCrp.value || !dossier.value) return
  enCours.value = true
  erreur.value = null
  try {
    // Le `.crp` est la source de vérité des définitions — ET de l'anonymisation corpus (E4) :
    // règles `tabAnon` (thématique → catégorie comprise) et `paramsAnonCorpus` → `paramsAnon`.
    const { codebook, variables } = mapperDefinitions(apercu.value.raw)
    let n = 0
    const genId = () => `reg-crp-${++n}`
    await migrerDepuisV1(
      {
        nom: apercu.value.nom,
        cheminCrp: cheminCrp.value,
        dateCreation: apercu.value.dateCreation,
        dossier: dossier.value,
        codebook,
        variables,
        reglesAnon: mapperTabAnon(apercu.value.raw.tabAnon, genId),
        paramsAnon: mapperParamsAnon(apercu.value.raw.paramsAnonCorpus),
      },
      apercu.value.raw.tabEnt ?? [], // entretiens à importer (.Sonal + audio)
    )
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Échec de la migration.'
    enCours.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-migration">
        <h3>🚚 Migrer un corpus SonalPi1…</h3>
        <p class="intro">
          Votre corpus `.crp` est lu, puis recréé en SonalPi2 dans un <b>dossier dédié</b> :
          rien n’est écrit tant que vous n’avez pas validé, et l’ancien dossier SonalPi1
          n’est jamais touché.
        </p>
        <!-- Tout le contenu effectif SonalPi1 est migré (texte + codages, audio,
             thèmes, variables EAV, notes, anonymisation, commentaires) ; les
             seules exclusions restent hors périmètre (corpus distants, zip). -->

        <!-- 1 — choix du .crp + aperçu -->
        <div class="question">
          <span class="q-lbl">1 — Choisissez le fichier `.crp` du corpus SonalPi1</span>
          <button class="choisir-crp" :disabled="enCours" @click="choisirCrp">
            {{ cheminCrp ?? 'Choisir un fichier .crp…' }}
          </button>
        </div>
        <p v-if="erreurCrp" class="msg-migration">{{ erreurCrp }}</p>

        <div v-if="apercu" class="apercu-crp">
          <div class="apercu-tete">
            <span class="apercu-nom">{{ apercu.nom }}</span>
            <span class="apercu-date">créé le {{ dateAffichee }} · {{ apercu.nbEntretiens }} entretien(s)</span>
          </div>
          <div v-if="apercu.themes.length" class="apercu-bloc">
            <span class="apercu-lbl">Thèmes ({{ apercu.themes.length }})</span>
            <ul class="ligne-theme">
              <li v-for="(t, i) in apercu.themes" :key="i">
                <span class="pastille" :style="t.couleur ? { background: t.couleur } : {}"></span>
                {{ t.nom }}<span v-if="t.taille" class="petit"> · {{ t.taille }}px</span>
              </li>
            </ul>
          </div>
          <div v-if="apercu.variables.length" class="apercu-bloc">
            <span class="apercu-lbl">Variables ({{ apercu.variables.length }})</span>
            <ul class="ligne-variable">
              <li v-for="(v, i) in apercu.variables" :key="i">
                {{ v.lib }}
                <span class="petit">{{ v.portee === 'locuteur' ? 'par locuteur' : "d'entretien" }}<template v-if="v.priv"> · privée</template></span>
              </li>
            </ul>
          </div>
          <div v-if="apercu.reglesAnon.length" class="apercu-bloc">
            <span class="apercu-lbl">Règles d’anonymisation ({{ apercu.reglesAnon.length }})</span>
            <ul class="ligne-anon">
              <li v-for="(r, i) in apercu.reglesAnon" :key="i">« {{ r.entite }} » → {{ r.remplacement }}</li>
            </ul>
          </div>
          <p class="note-e2" v-if="apercu.nbEntretiens > 0">
            Les entretiens (.Sonal) et leurs audio sont migrés dans la foulée ; un `.Sonal`
            manquant devient un entretien vide, avec son audio.
          </p>
        </div>

        <!-- 2 — dossier dédié + gardes -->
        <div v-if="apercu" class="question">
          <span class="q-lbl">2 — Choisissez le dossier dédié à ce corpus (un dossier = un corpus)</span>
          <button class="choisir-dossier" :disabled="enCours" @click="choisirDossier">
            {{ dossier ?? 'Choisir un dossier…' }}
          </button>
          <label v-if="verif?.ok && verif.nonVide" class="avertir-non-vide">
            <input v-model="avertiNonVide" type="checkbox" :disabled="enCours" />
            Je comprends : ce dossier contient des fichiers non liés — ils resteront, SonalPi2 y pose
            corpus.json + entretiens/ + png/.
          </label>
        </div>

        <p v-if="erreur" class="msg-migration">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="migrer">
            {{ enCours ? 'Migration…' : 'Migrer vers SonalPi2' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modale-migration {
  width: min(620px, 94vw);
  max-height: 88vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.modale-migration h3 {
  margin: 0;
  color: #1565c0;
}
.intro {
  margin: 0;
  font-size: 0.8rem;
  color: #555;
}
.question {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.q-lbl {
  font-size: 0.82rem;
  font-weight: 600;
}
.choisir-crp,
.choisir-dossier {
  text-align: left;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fafafa;
  padding: 0.45rem 0.6rem;
  font-size: 0.8rem;
  color: #1565c0;
  cursor: pointer;
  word-break: break-all;
}
.choisir-crp:hover:not(:disabled),
.choisir-dossier:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.choisir-crp:disabled,
.choisir-dossier:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
/* Aperçu */
.apercu-crp {
  border: 1px solid #d7e3f2;
  border-radius: 8px;
  background: #f7faff;
  padding: 0.6rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.apercu-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}
.apercu-nom {
  font-size: 1rem;
  font-weight: 700;
}
.apercu-date {
  font-size: 0.74rem;
  color: #777;
}
.apercu-bloc {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.apercu-lbl {
  font-size: 0.74rem;
  font-weight: 700;
  color: #1565c0;
}
.apercu-bloc ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.8rem;
  max-height: 88px;
  overflow-y: auto;
}
.apercu-bloc li {
  font-size: 0.74rem;
  color: #444;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.pastille {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  border: 1px solid #ccc;
  display: inline-block;
  flex: none;
}
.petit {
  font-size: 0.68rem;
  color: #999;
}
.note-e2 {
  margin: 0;
  font-size: 0.7rem;
  font-style: italic;
  color: #999;
}
.avertir-non-vide {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  font-size: 0.74rem;
  color: #8a6d1a;
  background: #fdf6e3;
  border: 1px solid #ecd9a0;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
}
.msg-migration {
  margin: 0;
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
}
.pied-modale {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.annuler,
.valider {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
}
.valider {
  border-color: #1565c0;
  background: #2e73d8;
  color: #fff;
}
.annuler:disabled,
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>