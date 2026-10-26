<script setup lang="ts">
import { abregerEntite, etatRegleAnon, type LignePresentationAnon, type TriAnon } from '../../../../shared/corpus/presentationAnon'
import BadgesAnon from './BadgesAnon.vue'
const props = defineProps<{
  lignes: LignePresentationAnon[]
  selection: string | null
  tri: TriAnon
  descendant: boolean
  frais: boolean
  collisions: Set<string>
  categories: string[]
  lectureSeule: boolean
  ajoutVarianteDisponible?: boolean
  retraitVarianteDisponible?: boolean
  renommageDisponible?: boolean
  dissociationDisponible?: boolean
  suppressionDisponible?: boolean
}>()
const emit = defineEmits<{
  selectionner: [id: string]
  trier: [colonne: TriAnon]
  categoriser: [id: string, categorie: string]
  modifierPseudos: [id: string]
  dissocier: [id: string]
  supprimerPartout: [id: string]
}>()
function ariaTri(colonne: TriAnon) {
  return props.tri !== colonne ? 'none' : props.descendant ? 'descending' : 'ascending'
}
</script>

<template>
  <table class="pseudo-table">
    <colgroup><col class="col-entite" /><col class="col-pseudo" /><col class="col-etat" /><col class="col-actions" /></colgroup>
    <thead>
      <tr>
        <th :aria-sort="ariaTri('entite')"><button @click="emit('trier', 'entite')">Entité originale {{ tri === 'entite' ? descendant ? '↓' : '↑' : '↕' }}</button></th>
        <th :aria-sort="ariaTri('pseudo')"><button @click="emit('trier', 'pseudo')">Pseudonyme / remplacement {{ tri === 'pseudo' ? descendant ? '↓' : '↑' : '↕' }}</button></th>
        <th>État corpus</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="ligne in lignes" :key="ligne.regle.id" :class="[etatRegleAnon(ligne.scan?.total, frais), { sel: selection === ligne.regle.id }]">
        <td class="cell-entite" :title="ligne.regle.entite.join(' / ')">{{ abregerEntite(ligne.regle.entite.join(' / ')) }}</td>
        <td class="cell-pseudo"><button v-if="renommageDisponible !== undefined || ajoutVarianteDisponible !== undefined || retraitVarianteDisponible !== undefined" class="variante" :disabled="(!renommageDisponible && !ajoutVarianteDisponible && !retraitVarianteDisponible) || lectureSeule" :aria-label="`Modifier les pseudonymes de ${ligne.regle.entite.join(' / ')}`" title="Modifier le pseudonyme ; séparer deux variantes par /" @click="emit('modifierPseudos', ligne.regle.id)">{{ ligne.regle.pseudos.join(' / ') }}</button><span v-else>{{ ligne.regle.pseudos.join(' / ') }}</span><span v-if="collisions.has(ligne.regle.id)" class="collision" title="Pseudo également déclaré pour une autre entité ; les règles restent indépendantes" aria-label="Collision de pseudo"> ⚠</span></td>
        <td class="cell-etat"><BadgesAnon :compteurs="ligne.scan?.total" :variantes="ligne.scan?.variantes" :frais="frais" /></td>
        <td class="cell-actions">
          <button class="loupe" :aria-label="`Voir les entretiens pour ${ligne.regle.entite.join(' / ')}`" :aria-pressed="selection === ligne.regle.id" title="Voir les entretiens concernés" @click="emit('selectionner', ligne.regle.id)">🔍</button>
          <button v-if="dissociationDisponible !== undefined" class="dissocier" :disabled="!dissociationDisponible || lectureSeule" :aria-label="`Dissocier globalement ${ligne.regle.entite.join(' / ')}`" :title="lectureSeule ? 'Corpus en lecture seule' : dissociationDisponible ? 'Dissocier du corpus en conservant les pseudonymes dans chaque entretien' : 'La dissociation n’est pas disponible pour ce corpus'" @click="emit('dissocier', ligne.regle.id)"><span aria-hidden="true">📄</span></button>
          <button v-if="suppressionDisponible !== undefined" class="supprimer-partout" :disabled="!suppressionDisponible || lectureSeule" :aria-label="`Supprimer partout ${ligne.regle.entite.join(' / ')}`" :title="lectureSeule ? 'Corpus en lecture seule' : suppressionDisponible ? 'Supprimer partout cette règle et les choix qui en dépendent' : 'La suppression partout n’est pas disponible pour ce corpus'" @click="emit('supprimerPartout', ligne.regle.id)"><span aria-hidden="true">✖</span></button>
          <select v-if="categories.length" class="cat-select" :value="ligne.regle.categorie ?? ''" :disabled="lectureSeule" :aria-label="`Catégorie de ${ligne.regle.entite.join(' / ')}`" @change="emit('categoriser', ligne.regle.id, ($event.target as HTMLSelectElement).value)">
            <option value="">—</option>
            <option v-if="ligne.regle.categorie && !categories.includes(ligne.regle.categorie)" :value="ligne.regle.categorie">{{ ligne.regle.categorie }}</option>
            <option v-for="categorie in categories" :key="categorie" :value="categorie">{{ categorie }}</option>
          </select>
          <span v-else-if="ligne.regle.categorie" class="categorie">{{ ligne.regle.categorie }}</span>
        </td>
      </tr>
      <tr v-if="!lignes.length"><td colspan="4">Aucune règle ne correspond aux filtres.</td></tr>
    </tbody>
  </table>
</template>

<style scoped>
.pseudo-table { width: 100%; min-width: 400px; table-layout: fixed; border-collapse: collapse; font-size: .85rem; }
.col-entite, .col-pseudo { width: 30%; }
.col-etat { width: 24%; }
.col-actions { width: 16%; }
th, td { border: 1px solid #ddd; padding: .4rem .5rem; text-align: left; overflow-wrap: anywhere; }
th { background: #f3f6fa; position: sticky; top: 0; z-index: 1; overflow-wrap: normal; }
th button { border: 0; background: transparent; cursor: pointer; text-align: center; font: inherit; font-weight: bold; }
th:nth-child(-n+3), td:nth-child(-n+3) { text-align: center; }
.cell-etat :deep(.badges-anon) { justify-content: center; max-width: 100%; }
.cell-entite { color: #626262; font-style: italic; }
.cell-pseudo { color: #1565c0; font-weight: bold; min-width: 100px; white-space: pre-wrap; }
.variante { color: inherit; font: inherit; border: 0; border-bottom: 1px dashed currentColor; padding: 0; background: transparent; cursor: pointer; white-space: inherit; text-align: center; }
.variante:disabled { cursor: default; border-bottom: 0; }
.ok { background: #e8f5e9; }
.todo { background: #fff3e0; }
.sel { outline: 2px solid #1565c0; outline-offset: -2px; }
.cell-actions { text-align: center; }
.loupe { border: 0; background: transparent; cursor: pointer; padding: .25rem; }
.supprimer-partout, .dissocier { display: inline-flex; align-items: center; justify-content: center; width: 33px; height: 33px; margin: .15rem; padding: 0; font-size: 1rem; vertical-align: middle; cursor: pointer; }
.supprimer-partout { color: #b00020; }
.supprimer-partout:disabled, .dissocier:disabled { cursor: default; opacity: .5; }
.cat-select, .categorie { display: block; max-width: 100%; margin: .25rem auto 0; border: 1px solid #bbb; border-radius: 999px; padding: .1rem .3rem; font-size: .72rem; background: white; }
.collision { color: #855000; }
</style>
