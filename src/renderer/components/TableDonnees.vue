<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'

const {
  variables,
  matrice,
  modalitesDe,
  poserGen,
  poserLoc,
  tenu,
} = utiliserSonal()
</script>

<template>
    <section class="ecran donnees-ecran">
      <div class="table-tete">
        <h2>Table de données</h2>
        <p class="hint">
          Édite les valeurs directement dans la grille. La ligne d'un entretien
          <b>ouvert</b> 🔒 est verrouillée — édite-la dans sa fiche (écran Entretien).
        </p>
      </div>
      <p v-if="variables.length === 0" class="vide">Aucune variable — définis-en à l'écran Corpus.</p>
      <div v-else class="matrice-scroll">
        <table class="matrice editable">
          <thead>
            <tr>
              <th>Ligne</th>
              <th v-for="v in variables" :key="v.id">
                {{ v.lib }} <small>({{ v.portee === 'entretien' ? 'ent' : 'loc' }})</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="e in matrice" :key="e.entretienId">
              <tr :class="{ tenu: tenu(e.entretienId) }">
                <td class="ligne-ent">
                  📄 {{ e.titre }}<span v-if="tenu(e.entretienId)" class="cadenas" title="ouvert dans l'éditeur">🔒</span>
                </td>
                <td v-for="v in variables" :key="v.id" class="cell-val">
                  <select
                    v-if="v.portee === 'entretien'"
                    :value="e.valeursGen[v.id] ?? ''"
                    :disabled="tenu(e.entretienId)"
                    @change="poserGen(e.entretienId, v.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">—</option>
                    <option v-for="m in modalitesDe(v.id)" :key="m.id" :value="m.id">{{ m.lib }}</option>
                  </select>
                </td>
              </tr>
              <tr
                v-for="l in e.locuteurs"
                :key="e.entretienId + '-' + l.index"
                class="ligne-loc"
                :class="{ tenu: tenu(e.entretienId) }"
              >
                <td>👤 {{ l.nom }}</td>
                <td v-for="v in variables" :key="v.id" class="cell-val">
                  <select
                    v-if="v.portee === 'locuteur'"
                    :value="l.valeursLoc[v.id] ?? ''"
                    :disabled="tenu(e.entretienId)"
                    @change="poserLoc(e.entretienId, l.index, v.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">—</option>
                    <option v-for="m in modalitesDe(v.id)" :key="m.id" :value="m.id">{{ m.lib }}</option>
                  </select>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
</template>
