<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { texteLisible } from './tableauBordAffichage'

// Panneau gauche du tableau de bord : les colonnes, lignes et badges du suivi.
// La grille et l'édition des cases restent à droite, dans TableauBord.vue.
const {
  tableaubord,
  ajouterColonne,
  ajouterBadge,
  ajouterLigne,
  supprimerBadge,
  lectureSeule,
} = utiliserSonal()

const editable = computed(() => !lectureSeule.value)

/* Ajouts : un champ par carte, Entrée valide. L'emplacement choisi est l'élément
 *  après lequel insérer ; vide = en premier. */
const nomNouvelleColonne = ref('')
const nouvelleTraversante = ref(false)
const apresNouvelleColonne = ref('')
const nomNouvelleLigne = ref('')
const apresNouvelleLigne = ref('')
const nomNouveauBadge = ref('')
const couleurNouveauBadge = ref('#3399ff')

/** Si l'emplacement choisi disparaît, on revient au défaut : après le dernier
 *  élément, ou en premier si la liste est vide. */
function suivreEmplacement(ids: string[], choix: Ref<string>): void {
  if (!ids.includes(choix.value)) choix.value = ids.at(-1) ?? ''
}
watch(
  () => tableaubord.value?.colonnes.map((colonne) => colonne.id).join('\u0000') ?? '',
  () => suivreEmplacement(tableaubord.value?.colonnes.map((colonne) => colonne.id) ?? [], apresNouvelleColonne),
  { immediate: true },
)
watch(
  () => tableaubord.value?.lignes.map((ligne) => ligne.id).join('\u0000') ?? '',
  () => suivreEmplacement(tableaubord.value?.lignes.map((ligne) => ligne.id) ?? [], apresNouvelleLigne),
  { immediate: true },
)

async function creerColonne() {
  const nom = nomNouvelleColonne.value.trim()
  if (!nom) return
  await ajouterColonne(nom, nouvelleTraversante.value, apresNouvelleColonne.value || null)
  nomNouvelleColonne.value = ''
  nouvelleTraversante.value = false
  apresNouvelleColonne.value = tableaubord.value?.colonnes.at(-1)?.id ?? ''
}
async function creerLigne() {
  const nom = nomNouvelleLigne.value.trim()
  if (!nom) return
  await ajouterLigne(nom, apresNouvelleLigne.value || null)
  nomNouvelleLigne.value = ''
  apresNouvelleLigne.value = tableaubord.value?.lignes.at(-1)?.id ?? ''
}
async function creerBadge() {
  const nom = nomNouveauBadge.value.trim()
  if (!nom) return
  try {
    await ajouterBadge(nom, couleurNouveauBadge.value)
    nomNouveauBadge.value = ''
  } catch {
    // Le message du composable s'affiche au-dessus de la grille.
  }
}

/** Badges jamais posés dans une case : seuls ceux-là sont supprimables. */
const badgesUtilises = computed(() => new Set(
  Object.values(tableaubord.value?.cellules ?? {})
    .flatMap((rangee) => Object.values(rangee))
    .map((cellule) => cellule.badgeId)
    .filter((id): id is string => id !== undefined),
))
async function retirerBadge(id: string) {
  if (!editable.value || badgesUtilises.value.has(id)) return
  const badge = tableaubord.value!.badges.find((b) => b.id === id)
  if (!badge) return
  await supprimerBadge(id, badge.nom)
}
</script>

<template>
  <div class="panneau panneau-tableau-bord">
    <div class="corpus-tete">
      <h3>Tableau de bord</h3>
    </div>
    <p v-if="!tableaubord" class="vide">Tableau indisponible.</p>
    <template v-else-if="editable">
      <section class="carte">
        <h3>Colonne</h3>
        <div class="rang-creer">
          <input v-model="nomNouvelleColonne" placeholder="Nom de la colonne…" @keydown.enter="creerColonne" />
          <button @click="creerColonne">+ Ajouter</button>
        </div>
        <label class="choix-emplacement" title="Où insérer la nouvelle colonne">
          <span>Après</span>
          <select v-model="apresNouvelleColonne" aria-label="Emplacement de la nouvelle colonne">
            <option value="">— En premier —</option>
            <option v-for="colonne in tableaubord.colonnes" :key="colonne.id" :value="colonne.id">
              {{ colonne.nom }}
            </option>
          </select>
        </label>
        <label class="choix-traversante" title="Une seule case pour tous les entretiens">
          <input v-model="nouvelleTraversante" type="checkbox" /> traversante
        </label>
      </section>
      <section class="carte">
        <h3>Ligne</h3>
        <div class="rang-creer">
          <input v-model="nomNouvelleLigne" placeholder="Nom de la ligne…" @keydown.enter="creerLigne" />
          <button @click="creerLigne">+ Ajouter</button>
        </div>
        <label class="choix-emplacement" title="Où insérer la nouvelle ligne">
          <span>Après</span>
          <select v-model="apresNouvelleLigne" aria-label="Emplacement de la nouvelle ligne">
            <option value="">— En premier —</option>
            <option v-for="ligne in tableaubord.lignes" :key="ligne.id" :value="ligne.id">
              {{ ligne.nom }}
            </option>
          </select>
        </label>
      </section>
      <section class="carte">
        <h3>Badges</h3>
        <div class="rang-badges">
          <span
            v-for="badge in tableaubord.badges"
            :key="badge.id"
            class="badge"
            :title="badgesUtilises.has(badge.id) ? 'Badge posé dans le tableau' : undefined"
            :style="{ background: badge.couleur, color: texteLisible(badge.couleur) }"
          >
            {{ badge.nom }}
            <button v-if="!badgesUtilises.has(badge.id)" class="mini" title="Supprimer ce badge" @click="retirerBadge(badge.id)">✕</button>
          </span>
        </div>
        <div class="rang-creer">
          <input v-model="nomNouveauBadge" class="badge-nom" placeholder="Nom du badge…" @keydown.enter="creerBadge" />
          <input v-model="couleurNouveauBadge" type="color" class="badge-couleur" title="Couleur du nouveau badge" />
          <button @click="creerBadge">+ Créer</button>
        </div>
      </section>
    </template>
    <p v-else class="aide-lecture">Le suivi est en lecture seule : colonnes, lignes et badges ne peuvent pas être modifiés.</p>
  </div>
</template>

<style scoped>
.panneau-tableau-bord { display: flex; flex-direction: column; gap: 0.5rem; }
.panneau-tableau-bord .corpus-tete { margin-bottom: 0; }
.vide, .aide-lecture { color: #66707f; font-size: 0.78rem; margin: 0; }
.carte { background: #fff; border: 1px solid #c8ccd4; border-radius: 8px; padding: 0.5rem 0.6rem 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
.carte h3 { margin: 0; font-size: 0.76rem; color: #444; text-transform: uppercase; letter-spacing: 0.03em; }
.rang-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
.rang-creer { display: flex; align-items: center; gap: 0.35rem; }
.rang-creer input:not([type='color']) { flex: 1; min-width: 0; }
.badge-nom { width: 100%; }
.badge-couleur { width: 2.2rem; flex: none; padding: 0 0.1rem; }
.badge { display: inline-block; border-radius: 9px; padding: 0 0.4rem; font-size: 0.72rem; font-weight: 600; line-height: 1.35; }
.badge .mini { color: inherit; opacity: .7; }
.badge .mini:hover { opacity: 1; }
.choix-traversante { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: #444; white-space: nowrap; }
.choix-emplacement { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: #444; }
.choix-emplacement select { flex: 1; min-width: 0; }
.mini { border: none; background: transparent; cursor: pointer; font-size: 0.6rem; padding: 0 0.1rem; color: #8a8f9c; }
.mini:hover { color: #333; }
input, select, button { border: 1px solid #bbb; border-radius: 5px; padding: 0.25rem 0.5rem; font-size: 0.78rem; background: #fff; }
button { cursor: pointer; flex: none; }
button:hover { background: #f4f7fd; }
</style>
