<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { Variable } from '../../../../shared/format'
import type { AttributCasProjete, DiagnosticAttributCas } from '../../../../shared/corpus/observationsAttributs'
import type { FamilleCas } from '../../../../shared/corpus/cas'
import { operationGlobaleEnCours } from '../../../operationGlobaleCorpus'

const props = defineProps<{ familleId: string }>()
const emit = defineEmits<{ fermer: [] }>()

const {
  famillesCas,
  listeCas,
  variablesCas,
  attributsCas,
  attributsProjeteCas,
  lectureSeule,
  apercuVariablesFamille,
  apercuDerivationFamille,
  ajouterDerivationFamille,
  retirerDerivationFamille,
} = utiliserSonal()

const STATUTS: Record<DiagnosticAttributCas['statut'], string> = {
  absent: 'Absent',
  coherent: 'Cohérent',
  'coherent-incomplet': 'Cohérent — des valeurs manquent',
  incoherent: 'Incohérent — plusieurs valeurs distinctes',
  'non-verifiable': 'Non vérifiable',
}

const variablesCandidates = ref<Awaited<ReturnType<typeof apercuVariablesFamille>>>([])
const chargementVariables = ref(false)
const erreur = ref<string | null>(null)
const variableChoisieId = ref('')
const variableChoisie = computed<Variable | null>(() =>
  variablesCas.value.find((v) => v.id === variableChoisieId.value) ?? null)
const apercuChoisi = ref<Awaited<ReturnType<typeof apercuDerivationFamille>> | null>(null)
const chargementApercu = ref(false)
const cible = ref<'nouvelle' | 'existante'>('nouvelle')
const attributExistant = ref('')
const libNouvelAttribut = ref('')
const privNouvelAttribut = ref(false)
const enregistrementEnCours = ref(false)

const famille = computed<FamilleCas | null>(() => famillesCas.value[props.familleId] ?? null)
const membres = computed(() => listeCas.value.filter((cas) => cas.familleId === props.familleId))
const variableOrigine = computed(() =>
  variablesCas.value.find((v) => v.id === famille.value?.origine.variableId) ?? null)
const recettes = computed(() => famille.value?.derivationsAttributs ?? [])

/** Attributs dérivés visibles pour un membre, pour le détail par cas. */
function attributsDerives(casId: string): AttributCasProjete[] {
  return (attributsProjeteCas.value[casId] ?? [])
    .filter((attribut) => attribut.origine === 'derivation-famille')
}

function statutDe(casId: string, attributId: string): string {
  const attribut = attributsDerives(casId).find((candidat) => candidat.attributId === attributId)
  if (!attribut?.diagnostic) return 'Non vérifiable'
  if (attribut.diagnostic.suspensionFamille) {
    return `Suspendu pour la famille ; localement ${STATUTS[attribut.diagnostic.statut].toLocaleLowerCase('fr')}`
  }
  return STATUTS[attribut.diagnostic.statut]
}

function valeurDe(casId: string, attributId: string): string {
  const attribut = attributsDerives(casId).find((candidat) => candidat.attributId === attributId)
  if (!attribut?.diagnostic) return '—'
  return attribut.diagnostic.valeurLibelle ?? '—'
}

async function chargerVariables() {
  if (!famille.value) return
  chargementVariables.value = true
  erreur.value = null
  try {
    variablesCandidates.value = await apercuVariablesFamille(props.familleId)
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    chargementVariables.value = false
  }
}

watch(() => props.familleId, () => {
  variablesCandidates.value = []
  apercuChoisi.value = null
  variableChoisieId.value = ''
  attributExistant.value = ''
  libNouvelAttribut.value = ''
  privNouvelAttribut.value = false
  void chargerVariables()
}, { immediate: true })

watch(variableChoisieId, async (id) => {
  apercuChoisi.value = null
  attributExistant.value = ''
  libNouvelAttribut.value = ''
  privNouvelAttribut.value = variableChoisie.value?.priv ?? false
  cible.value = 'nouvelle'
  if (!id) return
  chargementApercu.value = true
  erreur.value = null
  try {
    apercuChoisi.value = await apercuDerivationFamille(props.familleId, id)
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    chargementApercu.value = false
  }
})

async function ajouter() {
  if (!famille.value || !variableChoisieId.value) return
  if (cible.value === 'existante' && !attributExistant.value) return
  if (cible.value === 'nouvelle' && !(libNouvelAttribut.value || variableChoisie.value?.lib || '').trim()) return
  enregistrementEnCours.value = true
  erreur.value = null
  try {
    const ajoutee = await ajouterDerivationFamille(props.familleId, {
      variableSourceId: variableChoisieId.value,
      ...(cible.value === 'existante'
        ? { attributExistantId: attributExistant.value }
        : { nouvelleDefinition: { lib: libNouvelAttribut.value || variableChoisie.value?.lib || '', priv: privNouvelAttribut.value } }),
    })
    if (!ajoutee) return
    variableChoisieId.value = ''
    apercuChoisi.value = null
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    enregistrementEnCours.value = false
  }
}

async function retirer(attributId: string) {
  const libelle = attributsCas.value[attributId]?.lib ?? attributId
  if (!window.confirm(`Retirer la recette « ${libelle} » de toute la famille ? Les valeurs dérivées des ${membres.value.length} cas disparaissent ; la définition est conservée.`)) return
  erreur.value = null
  await retirerDerivationFamille(props.familleId, attributId).catch((e) => {
    erreur.value = e instanceof Error ? e.message : String(e)
  })
}
</script>

<template>
  <section v-if="famille" class="fiche-famille-derivation">
    <header>
      <div>
        <h2>Famille « {{ famille.nom }} »</h2>
        <p>
          Regroupement : {{ variableOrigine?.lib ?? 'Variable absente' }} ({{ famille.origine.portee }}<template v-if="famille.origine.portee === 'locuteur'"> ; enquêteurs {{ famille.origine.inclureEnqueteurs ? 'inclus' : 'exclus' }}</template>)
          · {{ membres.length }} cas
        </p>
      </div>
      <button @click="emit('fermer')">Retour aux cas</button>
    </header>
    <p class="aide">Une recette partagée s’applique à tous les cas de la famille : un conflit ou une source illisible sur un seul cas suspend l’attribut pour toute la famille.</p>

    <h3>Recettes d’attributs dérivés</h3>
    <p v-if="!recettes.length" class="vide">Aucune recette partagée. Ajoutez-en une ci-dessous : chaque cas de la famille en recevra la valeur dérivée.</p>
    <table v-else class="table-recettes">
      <thead><tr><th>Attribut</th><th>Variable source</th><th></th></tr></thead>
      <tbody>
        <tr v-for="recette in recettes" :key="recette.attributId">
          <td>
            <b>{{ attributsCas[recette.attributId]?.lib ?? 'Attribut absent' }}</b>
            <span v-if="attributsCas[recette.attributId]?.priv" class="badge-prive">privé</span>
          </td>
          <td>{{ variablesCas.find((v) => v.id === recette.variableSourceId)?.lib ?? 'Variable absente' }}</td>
          <td><button class="danger" :disabled="lectureSeule" @click="retirer(recette.attributId)">Retirer la recette</button></td>
        </tr>
      </tbody>
    </table>

    <h4 v-if="membres.length" class="titre-valeurs">Valeurs dérivées par cas</h4>
    <table v-if="recettes.length && membres.length" class="table-valeurs">
      <thead>
        <tr>
          <th>Cas</th>
          <th v-for="recette in recettes" :key="recette.attributId">
            {{ attributsCas[recette.attributId]?.lib ?? recette.attributId }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="cas in membres" :key="cas.id">
          <td>{{ cas.nom }}</td>
          <td v-for="recette in recettes" :key="recette.attributId">
            {{ valeurDe(cas.id, recette.attributId) }}
            <small class="statut">— {{ statutDe(cas.id, recette.attributId) }}</small>
          </td>
        </tr>
      </tbody>
    </table>

    <details class="ajout-recette" :open="!recettes.length">
      <summary>Ajouter un attribut à la famille</summary>
      <fieldset :disabled="lectureSeule || chargementVariables || enregistrementEnCours || operationGlobaleEnCours">
        <p v-if="chargementVariables" role="status">Évaluation des variables disponibles…</p>
        <template v-else>
          <p v-if="!variablesCandidates.length" class="vide">Aucune variable de la portée de la famille. Créez d’abord une variable de portée « {{ famille.origine.portee }} ».</p>
          <table v-else class="table-candidates">
            <thead><tr><th>Variable source</th><th>Disponible pour la famille</th></tr></thead>
            <tbody>
              <tr v-for="candidate in variablesCandidates" :key="candidate.variable.id" :class="{ indisponible: !candidate.disponible }">
                <td>
                  <label class="case-cocher">
                    <input v-model="variableChoisieId" type="radio" name="variable-famille" :value="candidate.variable.id" :disabled="!candidate.disponible" />
                    {{ candidate.variable.lib }}{{ candidate.variable.priv ? ' — privée' : '' }}
                  </label>
                </td>
                <td>
                  <template v-if="candidate.disponible">Oui</template>
                  <template v-else>
                    Non — <span v-for="probleme in candidate.problemes" :key="probleme">{{ probleme }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-if="apercuChoisi">
          <h4>Aperçu cas par cas</h4>
          <ul class="apercu-cas">
            <li v-for="entree in apercuChoisi.evaluation.parCas" :key="entree.casId">
              <b>{{ entree.nomCas }}</b> : {{ STATUTS[entree.diagnostic.statut] }}<template v-if="entree.diagnostic.valeurLibelle"> — « {{ entree.diagnostic.valeurLibelle }} »</template>
              <ul v-if="entree.diagnostic.problemes.length" class="problemes-cas">
                <li v-for="probleme in entree.diagnostic.problemes" :key="probleme">⚠ {{ probleme }}</li>
              </ul>
            </li>
          </ul>
          <p v-if="!apercuChoisi.evaluation.disponible" class="erreur-bloc">
            La politique familiale interdit cette recette : au moins un cas est conflictuel ou non vérifiable.
          </p>
          <fieldset v-else class="cible-derivation">
            <legend>Attribut cible</legend>
            <label class="case-cocher"><input v-model="cible" type="radio" value="nouvelle" /> Créer l’attribut « {{ variableChoisie?.lib }} »</label>
            <div v-if="cible === 'nouvelle'" class="nouvelle-definition">
              <label>Libellé<input v-model="libNouvelAttribut" :placeholder="variableChoisie?.lib" /></label>
              <label class="case-cocher"><input v-model="privNouvelAttribut" type="checkbox" /> Attribut privé</label>
              <p v-if="variableChoisie?.priv && !privNouvelAttribut" class="avertissement">
                La variable source est privée : la confidentialité est proposée privée par défaut.
              </p>
            </div>
            <label class="case-cocher"><input v-model="cible" type="radio" value="existante" /> Utiliser un attribut existant</label>
            <label v-if="cible === 'existante'">
              Attribut
              <select v-model="attributExistant">
                <option value="" disabled>Choisir un attribut…</option>
                <option v-for="definition in Object.values(attributsCas)" :key="definition.id" :value="definition.id">
                  {{ definition.lib }}{{ definition.priv ? ' — privé' : '' }}
                </option>
              </select>
            </label>
            <p v-if="cible === 'existante' && variableChoisie?.priv
              && attributExistant && !attributsCas[attributExistant]?.priv" class="avertissement">
              La variable source est privée, mais l’attribut existant est public.
            </p>
          </fieldset>
          <button
            class="primaire"
            :disabled="!apercuChoisi.evaluation.disponible
              || (cible === 'existante' && !attributExistant)
              || (cible === 'nouvelle' && !(libNouvelAttribut || variableChoisie?.lib || '').trim())"
            @click="ajouter"
          >Ajouter la recette à la famille</button>
        </template>
      </fieldset>
    </details>

    <p v-if="erreur" class="erreur">{{ erreur }}</p>
  </section>
  <section v-else class="fiche-famille-derivation">
    <p class="vide">Cette famille n’existe plus.</p>
    <button @click="emit('fermer')">Retour aux cas</button>
  </section>
</template>

<style scoped>
.fiche-famille-derivation { max-width: 52rem; margin: 0 auto; display: grid; gap: .8rem; }
.fiche-famille-derivation header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; border-bottom: 1px solid #eee; padding-bottom: .7rem; }
h2, h3, h4 { margin: 0; }
.aide { font-size: .84rem; color: #666; }
.table-recettes, .table-valeurs, .table-candidates { width: 100%; border-collapse: collapse; font-size: .88rem; }
.table-recettes th, .table-valeurs th, .table-candidates th { text-align: left; font-size: .78rem; color: #777; border-bottom: 1px solid #ddd; padding: .3rem .4rem; }
.table-recettes td, .table-valeurs td, .table-candidates td { border-bottom: 1px solid #eee; padding: .35rem .4rem; vertical-align: top; }
.statut { color: #777; }
.table-candidates tr.indisponible td { background: #fff8f7; }
.badge-prive { margin-left: .4rem; padding: .05rem .35rem; border-radius: 999px; background: #fdecea; color: #b3261e; font-size: .7rem; }
.ajout-recette summary { cursor: pointer; color: #2e73d8; }
.ajout-recette fieldset { display: grid; gap: .6rem; border: 1px solid #ddd; border-radius: 6px; margin-top: .5rem; }
.apercu-cas { margin: 0; padding-left: 1.2rem; font-size: .85rem; }
.problemes-cas { font-size: .8rem; color: #b3261e; }
.cible-derivation { padding: .5rem; }
.nouvelle-definition { display: grid; gap: .4rem; padding-left: 1.2rem; }
label { display: grid; gap: .25rem; font-size: .85rem; color: #555; }
select, input { width: 100%; box-sizing: border-box; }
.case-cocher { display: flex; align-items: center; gap: .4rem; }
.case-cocher input { width: auto; flex: none; }
.avertissement { padding: .4rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .82rem; }
.erreur { color: #b3261e; }
.erreur-bloc { padding: .4rem; background: #fdecea; border-left: 4px solid #c62828; font-size: .82rem; color: #b3261e; }
.primaire { border-color: #1565c0; background: #2e73d8; color: #fff; }
.danger { color: #b3261e; }
.vide { color: #888; }
.titre-valeurs { margin-top: .6rem; }
</style>
