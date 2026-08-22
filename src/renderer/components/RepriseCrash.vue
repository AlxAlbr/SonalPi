<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Dialogue de REPRISE APRÈS CRASH (plan-multiuser.md §4.5) — listé à
 * l'ouverture d'un corpus distant : verrous orphelins de NOTRE machine (crash
 * sans libération). Trois choix par orphelin :
 *   « Reprendre et publier » : la copie locale (dernier autosave) est publiée
 *     PUIS le verrou libéré — l'ordre invariant §4.4 s'applique aussi ici ;
 *   « Abandonner » : déverrouille SANS publier (la copie locale reste dans le
 *     miroir et repartira en divergence si elle resurgit, §6) ;
 *   « Plus tard » : rien — le verrou reste tenu, personne ne peut écraser
 *     entre-temps (c'est le scénario où ce modèle brille).
 */
const { orphelinsDistants, membership, reprendreOrphelin, abandonnerOrphelin } = utiliserSonal()

/** Orphelins dont l'entretien existe encore au corpus (sinon : renommé,
 *  supprimé par un collègue pendant notre absence — même affichage générique). */
const liste = computed(() =>
  orphelinsDistants.value.map((o) => ({
    ...o,
    titre: membership.value[o.id]?.titre ?? o.id,
  })),
)

const enCours = ref<string | null>(null)
async function reprendre(chemin: string) {
  enCours.value = chemin
  try {
    await reprendreOrphelin(chemin)
  } finally {
    enCours.value = null
  }
}
async function abandonner(chemin: string) {
  enCours.value = chemin
  try {
    await abandonnerOrphelin(chemin)
  } finally {
    enCours.value = null
  }
}

const heureDe = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <Teleport to="body">
    <div v-if="liste.length > 0" class="voile-reprise">
      <div class="modale-reprise">
        <h3>🔄 Session(s) interrompue(s)</h3>
        <p class="intro">
          L'application s'est fermée anormalement alors que des entretiens étaient
          <b>ouverts sous verrou</b> sur ce poste. Personne n'a pu les modifier
          entre-temps. Que faire de chaque session ?
        </p>
        <ul class="liste-orphelins">
          <li v-for="o in liste" :key="o.cheminVerrou" class="orphelin">
            <div class="orph-infos">
              <span class="orph-titre">« {{ o.titre }} »</span>
              <span class="orph-detail">
                verrou posé par {{ o.userId }} ({{ o.machineId }}) le {{ heureDe(o.acquiredAt) }}
              </span>
            </div>
            <div class="orph-actions">
              <button class="primaire" :disabled="enCours === o.cheminVerrou" @click="reprendre(o.cheminVerrou)">
                Reprendre et publier
              </button>
              <button :disabled="enCours === o.cheminVerrou" @click="abandonner(o.cheminVerrou)">
                Abandonner (déverrouille sans publier)
              </button>
            </div>
          </li>
        </ul>
        <p class="note">
          « Reprendre et publier » restaure le travail local sur le serveur.
          « Abandonner » garde le contenu local de côté mais libère le verrou pour
          les autres — à choisir si vous ne faites pas confiance aux dernières
          modifications locales.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-reprise {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modale-reprise {
  background: #fff;
  border-radius: 10px;
  padding: 1.2rem 1.4rem;
  max-width: 40rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
.intro {
  font-size: 0.9rem;
  color: #444;
}
.liste-orphelins {
  list-style: none;
  padding: 0;
  margin: 0.8rem 0;
}
.orphelin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid #e5e5ef;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.5rem;
}
.orph-titre {
  font-weight: 600;
  display: block;
}
.orph-detail {
  font-size: 0.8rem;
  color: #666;
}
.orph-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.orph-actions button {
  padding: 0.35rem 0.7rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
}
.orph-actions .primaire {
  border-color: #2e7d32;
  color: #2e7d32;
}
.note {
  font-size: 0.78rem;
  color: #777;
}
</style>
