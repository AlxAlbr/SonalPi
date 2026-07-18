<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'

const {
  variables,
  matrice,
  modalitesDe,
  poserGen,
  poserLoc,
  membership,
  reprise,
  reprendre,
  messageVar,
  ajouterVariable,
  renommerVariable,
  supprimerVariable,
  ajouterModalite,
  renommerModalite,
  supprimerModalite,
} = utiliserSonal()
</script>

<template>
    <section class="ecran donnees-ecran">
      <div class="table-tete">
        <h2>Table de données</h2>
        <p class="hint">
          Édite les valeurs directement dans la grille — chaque cellule écrit
          dans l'entretien concerné.
        </p>
        <!-- D-S11 rév. : entrer ici a FERMÉ (et sauvegardé) l'entretien tenu ;
             le point de reprise le rouvre là où on en était (texte + audio). -->
        <button v-if="reprise" class="btn-reprise" @click="reprendre">
          ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
        </button>
      </div>
      <!-- Définitions des variables/modalités (déménagé du Corpus) : c'est ICI qu'on
           définit la structure de la base, la grille ci-dessous en est la saisie. -->
      <section class="variables-def">
        <p v-if="messageVar" class="msg-thm">{{ messageVar }}</p>
        <div class="corpus-tete">
          <h3>Variables</h3>
          <span>
            <button class="mini" @click="ajouterVariable('entretien')">+ entretien</button>
            <button class="mini" @click="ajouterVariable('locuteur')">+ locuteur</button>
          </span>
        </div>
        <ul class="liste-var">
          <li v-for="v in variables" :key="v.id">
            <div class="var-tete">
              <span class="portee" :class="v.portee">{{ v.portee === 'entretien' ? 'ent' : 'loc' }}</span>
              <input class="nom-var" :value="v.lib" @change="renommerVariable(v.id, $event)" />
              <button class="x" title="Supprimer la variable" @click="supprimerVariable(v.id)">✕</button>
            </div>
            <div class="modalites">
              <span v-for="m in v.modalites" :key="m.id" class="mod">
                <input class="nom-mod" :value="m.lib" @change="renommerModalite(v.id, m.id, $event)" />
                <button class="x-mod" @click="supprimerModalite(v.id, m.id)">✕</button>
              </span>
              <button class="mini" @click="ajouterModalite(v.id)">+ mod</button>
            </div>
          </li>
        </ul>
      </section>

      <p v-if="variables.length === 0" class="vide">Aucune variable — ajoute-en ci-dessus (+ entretien / + locuteur).</p>
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
              <tr>
                <td class="ligne-ent">📄 {{ e.titre }}</td>
                <td v-for="v in variables" :key="v.id" class="cell-val">
                  <select
                    v-if="v.portee === 'entretien'"
                    :value="e.valeursGen[v.id] ?? ''"
                    @change="poserGen(e.entretienId, v.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">—</option>
                    <option v-for="m in modalitesDe(v.id)" :key="m.id" :value="m.id">{{ m.lib }}</option>
                  </select>
                </td>
              </tr>
              <tr v-for="l in e.locuteurs" :key="e.entretienId + '-' + l.index" class="ligne-loc">
                <td>👤 {{ l.nom }}</td>
                <td v-for="v in variables" :key="v.id" class="cell-val">
                  <select
                    v-if="v.portee === 'locuteur'"
                    :value="l.valeursLoc[v.id] ?? ''"
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

<style scoped>
.hint {
  color: #666;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.donnees-ecran {
  max-width: 100%;
}
.table-tete h2 {
  font-size: 1.05rem;
  margin: 0.3rem 0;
}
.matrice-scroll {
  overflow-x: auto;
  margin-top: 0.3rem;
}
.matrice {
  border-collapse: collapse;
  font-size: 0.72rem;
}
.matrice th,
.matrice td {
  border: 1px solid #e5e5ef;
  padding: 0.2rem 0.4rem;
  text-align: left;
  white-space: nowrap;
}
.matrice th {
  background: #f0f0f5;
}
.ligne-ent td {
  font-weight: 600;
  background: #fafafe;
}
.ligne-loc td:first-child {
  padding-left: 0.9rem;
  color: #8a6d3b;
}
.matrice.editable td.cell-val {
  padding: 0.1rem 0.2rem;
}
.matrice.editable select {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  font-size: 0.72rem;
  background: #fff;
}
.btn-reprise {
  margin: 0 0 0.8rem;
}
/* --- Définitions de variables + modalités (déménagé du Corpus) --- */
.variables-def {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  background: #fafafe;
  margin-bottom: 1rem;
  max-width: 640px;
}
.liste-var {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.liste-var > li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.35rem;
  background: #fff;
}
.var-tete {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.portee {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  color: #fff;
}
.portee.entretien {
  background: #5c6bc0;
}
.portee.locuteur {
  background: #8a6d3b;
}
.nom-var {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
.modalites {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.3rem;
  padding-left: 0.3rem;
}
.mod {
  display: inline-flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #f6f6fa;
  padding: 0 0.1rem 0 0.3rem;
}
.nom-mod {
  border: none;
  background: transparent;
  font-size: 0.75rem;
  width: 4.5rem;
}
.x-mod {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.7rem;
}
</style>
