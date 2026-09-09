<script setup lang="ts">
import { ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const props = defineProps<{ actif: boolean }>()
const {
  entreesJournalCorpus,
  rafraichirJournalCorpus,
  annulerEntreeJournalCorpus,
  idDistantCourant,
  dossierCourantDir,
} = utiliserSonal()

const occupe = ref(false)
const erreur = ref('')

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function actualiser(): Promise<void> {
  occupe.value = true
  erreur.value = ''
  try {
    await rafraichirJournalCorpus()
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

async function annuler(id: string): Promise<void> {
  if (occupe.value || idDistantCourant.value) return
  occupe.value = true
  erreur.value = ''
  try {
    const resultat = await annulerEntreeJournalCorpus(id)
    if (!resultat.ok) erreur.value = resultat.raison
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

watch([() => props.actif, dossierCourantDir], () => {
  if (props.actif) void actualiser()
}, { immediate: true })
</script>

<template>
  <section class="panneau journal-corpus" aria-label="Journal du corpus" :aria-busy="occupe">
    <div class="corpus-tete">
      <h3>Journal</h3>
      <button class="mini" :disabled="occupe" aria-label="Actualiser le Journal" @click="actualiser">⟳</button>
    </div>
    <p class="aide-journal">Actions annulables prises en charge depuis les outils du corpus pendant cette session (10 dernières).</p>
    <p v-if="idDistantCourant" class="information">L’annulation des actions du corpus distant n’est pas encore disponible.</p>
    <p v-if="erreur" class="erreur" role="alert">{{ erreur }}</p>
    <p v-if="!entreesJournalCorpus.length" class="vide">Aucune action enregistrée.</p>
    <ol v-else class="entrees-journal">
      <li v-for="entree in entreesJournalCorpus" :key="entree.id" :class="entree.etat">
        <time :datetime="entree.horodatage">{{ heure(entree.horodatage) }}</time>
        <span class="libelle">{{ entree.libelle }}</span>
        <button
          class="annuler-action"
          :disabled="occupe || !!idDistantCourant || entree.etat !== 'annulable'"
          :aria-label="`Annuler : ${entree.libelle}`"
          :title="entree.etat === 'annulable' ? `Annuler : ${entree.libelle}` : entree.raison"
          @click="annuler(entree.id)"
        >↩</button>
        <small v-if="entree.raison">{{ entree.raison }}</small>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.journal-corpus { min-width: 0; }
.aide-journal { color: #52606d; font-size: 0.82rem; line-height: 1.4; }
.information { padding: 8px; background: #fff5d8; font-size: 0.82rem; }
.erreur { color: #a82020; }
.entrees-journal { display: grid; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.entrees-journal li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px 8px; align-items: start; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
.entrees-journal time { color: #64748b; font-size: 0.75rem; }
.entrees-journal .libelle { font-size: 0.84rem; line-height: 1.3; }
.annuler-action { width: 30px; min-height: 28px; padding: 2px; }
.entrees-journal small { grid-column: 2 / 4; color: #8a4b08; line-height: 1.3; }
.entrees-journal li.inapplicable .libelle,
.entrees-journal li.bloquee .libelle { color: #7b8794; }
</style>
