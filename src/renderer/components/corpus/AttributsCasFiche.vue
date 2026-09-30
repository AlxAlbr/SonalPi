<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { porteeObservationsCas, type DefinitionAttributCas } from '../../../shared/corpus/cas'
import type { AttributCasProjete, DiagnosticAttributCas } from '../../../shared/corpus/observationsAttributs'
import type { Variable } from '../../../shared/format'
import { operationGlobaleEnCours } from '../../operationGlobaleCorpus'

const {
  casOuvert,
  casOuvertId,
  famillesCas,
  variablesCas,
  attributsCas,
  attributsCasOuvert,
  lectureSeule,
  definirValeurAttribut,
  apercuDerivationPropre,
  ajouterDerivationPropre,
  retirerDerivationPropre,
} = utiliserSonal()

const valeurNouvelle = ref('')
const definitionChoisie = ref('')
const erreurSaisie = ref<string | null>(null)
const variableDerivation = ref('')
const apercuDerivation = ref<DiagnosticAttributCas | null>(null)
const chargementApercu = ref(false)
const erreurDerivation = ref<string | null>(null)
const cibleDerivation = ref<'existante' | 'nouvelle'>('nouvelle')
const attributExistant = ref('')
const libNouvelAttribut = ref('')
const privNouvelAttribut = ref(false)
const enregistrementEnCours = ref(false)

/** Statuts en français lisible : aucun statut n'invente de valeur. */
const STATUTS: Record<DiagnosticAttributCas['statut'], string> = {
  absent: 'Absent — aucune valeur renseignée',
  coherent: 'Cohérent',
  'coherent-incomplet': 'Cohérent — des valeurs manquent',
  incoherent: 'Incohérent — plusieurs valeurs distinctes',
  'non-verifiable': 'Non vérifiable — contrôle complet requis',
}
const ORIGINES: Record<AttributCasProjete['origine'], string> = {
  saisi: 'Saisi',
  'derivation-famille': 'Dérivé — recette de la famille',
  'derivation-propre': 'Dérivé — recette du cas',
}

const definitionsDisponiblesSaisie = computed(() => Object.values(attributsCas.value)
  .filter((definition) => attributsCasOuvert.value.every((attribut) =>
    attribut.attributId !== definition.id))
  .sort((a, b) => a.ordre - b.ordre || a.lib.localeCompare(b.lib, 'fr')))

const definitionChoisieObjet = computed(() =>
  definitionChoisie.value ? attributsCas.value[definitionChoisie.value] ?? null : null)

const peutDeriver = computed(() => Boolean(casOuvert.value?.regles.length
  && !casOuvert.value.familleId && casOuvertId.value))

/** Variables de la même portée que les observations du cas, seules dérivables ici. */
const variablesDerivables = computed<Variable[]>(() => {
  const courant = casOuvert.value
  if (!courant) return []
  const portee = porteeObservationsCas(courant)
  if (!portee) return []
  return variablesCas.value.filter((variable) => variable.portee === portee)
})

const variableChoisie = computed(() =>
  variablesCas.value.find((variable) => variable.id === variableDerivation.value) ?? null)

const attributsExistantsDerivables = computed(() => Object.values(attributsCas.value)
  .sort((a, b) => a.ordre - b.ordre || a.lib.localeCompare(b.lib, 'fr')))

const familleDuCas = computed(() =>
  casOuvert.value?.familleId ? famillesCas.value[casOuvert.value.familleId] ?? null : null)

watch(casOuvertId, () => {
  definitionChoisie.value = ''
  valeurNouvelle.value = ''
  erreurSaisie.value = null
  annulerApercuDerivation()
}, { flush: 'sync' })

watch(definitionChoisie, () => { valeurNouvelle.value = ''; erreurSaisie.value = null })

watch(variableDerivation, async (id) => {
  annulerApercuDerivation()
  privNouvelAttribut.value = variablesCas.value.find((variable) => variable.id === id)?.priv ?? false
  if (!id || !casOuvertId.value) return
  chargementApercu.value = true
  try {
    apercuDerivation.value = await apercuDerivationPropre(casOuvertId.value, id)
  } catch (erreur) {
    erreurDerivation.value = erreur instanceof Error ? erreur.message : String(erreur)
  } finally {
    chargementApercu.value = false
  }
})

function annulerApercuDerivation() {
  apercuDerivation.value = null
  erreurDerivation.value = null
  cibleDerivation.value = 'nouvelle'
  attributExistant.value = ''
  libNouvelAttribut.value = ''
  privNouvelAttribut.value = false
}

/** Une valeur dérivée se libelle depuis les modalités de la variable source. */
function libelleValeurVariable(variable: Variable | null, valeur: string | null): string {
  if (valeur === null) return 'absente'
  return variable?.modalites.find((modalite) => modalite.id === valeur)?.lib ?? valeur
}

function variableDe(attribut: AttributCasProjete): Variable | null {
  return attribut.derivation
    ? variablesCas.value.find((v) => v.id === attribut.derivation!.variableSourceId) ?? null
    : null
}

function statutDisponible(
  statut: DiagnosticAttributCas['statut'] | undefined,
  suspenduParFamille = false,
): boolean {
  return !suspenduParFamille && (statut === 'coherent' || statut === 'coherent-incomplet')
}

function libelleStatut(attribut: AttributCasProjete): string {
  if (attribut.origine === 'saisi') return 'Saisi sur le cas'
  const diagnostic = attribut.diagnostic
  if (diagnostic?.suspensionFamille) {
    return `Suspendu pour toute la famille — statut local : ${STATUTS[diagnostic.statut]}`
  }
  return STATUTS[diagnostic?.statut ?? 'absent']
}

async function enregistrerValeurNouvelle() {
  const definition = definitionChoisieObjet.value
  if (!definition || !casOuvertId.value) return
  erreurSaisie.value = null
  const valeur = definition.type === 'texte'
    ? valeurNouvelle.value.trim()
    : valeurNouvelle.value
  if (!valeur) {
    erreurSaisie.value = 'La valeur est vide.'
    return
  }
  enregistrementEnCours.value = true
  try {
    await definirValeurAttribut(definition.id, valeur)
    definitionChoisie.value = ''
    valeurNouvelle.value = ''
  } catch {
    // Le message détaillé vit dans messageCas, affiché en tête de fiche.
  } finally {
    enregistrementEnCours.value = false
  }
}

async function ajouterDerivation() {
  if (!casOuvertId.value || !variableDerivation.value || !libelleCibleValide()) return
  enregistrementEnCours.value = true
  erreurDerivation.value = null
  try {
    const ajoutee = await ajouterDerivationPropre(casOuvertId.value, {
      variableSourceId: variableDerivation.value,
      ...(cibleDerivation.value === 'existante' && attributExistant.value
        ? { attributExistantId: attributExistant.value }
        : { nouvelleDefinition: { lib: libNouvelAttribut.value || variableChoisie.value?.lib || '', priv: privNouvelAttribut.value } }),
    })
    if (!ajoutee) return
    variableDerivation.value = ''
    annulerApercuDerivation()
  } catch {
    // Le message détaillé vit dans messageCas.
  } finally {
    enregistrementEnCours.value = false
  }
}

function libelleCibleValide(): boolean {
  if (cibleDerivation.value === 'existante') return Boolean(attributExistant.value)
  return Boolean((libNouvelAttribut.value || variableChoisie.value?.lib || '').trim())
}

async function retirerRecette(attribut: AttributCasProjete) {
  if (!casOuvertId.value || !window.confirm(
    `Retirer la recette « ${attribut.definition?.lib ?? attribut.attributId} » de ce cas ? La définition et les valeurs des autres cas sont conservées.`,
  )) return
  await retirerDerivationPropre(casOuvertId.value, attribut.attributId).catch(() => {
    // Le message détaillé vit dans messageCas.
  })
}

function modalitesDe(definition: DefinitionAttributCas) {
  return definition.modalites
}
</script>

<template>
  <section v-if="casOuvert" class="attributs-cas">
    <header>
      <h3>Attributs du cas</h3>
      <p v-if="peutDeriver" class="aide">Les attributs dérivés sont recalculés depuis les membres de la règle ; les ajouts manuels ne changent ni leurs valeurs ni leurs diagnostics.</p>
      <p v-else-if="familleDuCas" class="aide">Membre d’une famille : toutes ses dérivations passent par les recettes partagées de « {{ familleDuCas.nom }} ».</p>
      <p v-else class="aide">Un cas manuel reçoit des attributs saisis ; la dérivation est réservée aux cas avec règle.</p>
    </header>

    <p v-if="!attributsCasOuvert.length" class="vide">Aucun attribut sur ce cas.</p>
    <table v-else class="table-attributs">
      <thead>
        <tr><th>Attribut</th><th>Origine</th><th>Valeur</th><th>Diagnostic</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="attribut in attributsCasOuvert" :key="attribut.attributId" :class="{ suspendu: attribut.origine !== 'saisi' && !statutDisponible(attribut.diagnostic?.statut, Boolean(attribut.diagnostic?.suspensionFamille)) }">
          <td>
            <b>{{ attribut.definition?.lib ?? 'Attribut absent' }}</b>
            <span v-if="attribut.definition?.priv" class="badge-prive">privé</span>
          </td>
          <td>{{ ORIGINES[attribut.origine] }}</td>
          <td>
            <template v-if="attribut.origine === 'saisi'">
              <select
                v-if="attribut.definition?.type === 'modalites'"
                :key="`${attribut.attributId}-${attribut.valeurSaisie ?? ''}`"
                :value="attribut.valeurSaisie ?? ''"
                :disabled="lectureSeule"
                aria-label="Valeur saisie"
                @change="definirValeurAttribut(attribut.attributId, ($event.target as HTMLSelectElement).value || null).catch(() => {})"
              >
                <option value="">— aucune valeur —</option>
                <option v-for="modalite in modalitesDe(attribut.definition!)" :key="modalite.id" :value="modalite.id">{{ modalite.lib }}</option>
              </select>
              <input
                v-else
                :key="`texte-${attribut.attributId}-${attribut.valeurSaisie ?? ''}`"
                class="valeur-texte"
                :value="attribut.valeurSaisie ?? ''"
                :disabled="lectureSeule"
                aria-label="Valeur saisie"
                @change="definirValeurAttribut(attribut.attributId, ($event.target as HTMLInputElement).value.trim() || null).catch(() => {})"
              />
            </template>
            <template v-else>
              <span v-if="attribut.diagnostic?.valeurLibelle" class="valeur-derivee">
                {{ attribut.diagnostic.valeurLibelle }}
                <small v-if="attribut.diagnostic.statut === 'coherent-incomplet'">avec avertissement</small>
              </span>
              <span v-else class="valeur-absente">—</span>
            </template>
          </td>
          <td>
            {{ libelleStatut(attribut) }}
            <details v-if="attribut.origine !== 'saisi' && (attribut.diagnostic?.problemes.length || attribut.diagnostic?.observations.length)" class="detail-diagnostic">
              <summary>Voir les observations</summary>
              <p v-for="probleme in attribut.diagnostic?.problemes ?? []" :key="probleme" class="probleme">⚠ {{ probleme }}</p>
              <ul>
                <li v-for="(observation, index) in attribut.diagnostic?.observations ?? []" :key="index">
                  {{ observation.entretienId }}<template v-if="observation.locuteurIndex !== null"> · locuteur {{ observation.locuteurIndex }}</template>
                  : <b>{{ libelleValeurVariable(variableDe(attribut), observation.valeur) }}</b><template v-if="observation.invalide"> (modalité disparue)</template><template v-if="observation.sourceIllisible"> — source illisible</template>
                </li>
              </ul>
            </details>
          </td>
          <td>
            <button
              v-if="attribut.origine === 'derivation-propre'"
              class="danger"
              :disabled="lectureSeule"
              @click="retirerRecette(attribut)"
            >Retirer la recette</button>
            <span v-else-if="attribut.origine === 'derivation-famille'" class="note">Gérée par la famille</span>
          </td>
        </tr>
      </tbody>
    </table>
    <details v-if="definitionsDisponiblesSaisie.length" class="ajout-attribut">
      <summary>Saisir un attribut</summary>
      <fieldset :disabled="lectureSeule || enregistrementEnCours">
        <label>
          Attribut
          <select v-model="definitionChoisie">
            <option value="" disabled>Choisir un attribut…</option>
            <option v-for="definition in definitionsDisponiblesSaisie" :key="definition.id" :value="definition.id">
              {{ definition.lib }}{{ definition.priv ? ' — privé' : '' }}
            </option>
          </select>
        </label>
        <template v-if="definitionChoisieObjet">
          <label v-if="definitionChoisieObjet.type === 'modalites'">
            Valeur
            <select v-model="valeurNouvelle">
              <option value="" disabled>Choisir une valeur…</option>
              <option v-for="modalite in modalitesDe(definitionChoisieObjet)" :key="modalite.id" :value="modalite.id">{{ modalite.lib }}</option>
            </select>
          </label>
          <label v-else>
            Valeur — texte libre
            <input v-model="valeurNouvelle" />
          </label>
          <button class="primaire" :disabled="!valeurNouvelle" @click="enregistrerValeurNouvelle">Enregistrer la valeur</button>
        </template>
        <p v-if="erreurSaisie" class="erreur">{{ erreurSaisie }}</p>
      </fieldset>
    </details>

    <details v-if="peutDeriver" class="ajout-attribut">
      <summary>Dériver un attribut des membres de la règle</summary>
      <fieldset :disabled="lectureSeule || enregistrementEnCours || operationGlobaleEnCours">
        <label>
          Variable source — même portée que les observations du cas
          <select v-model="variableDerivation">
            <option value="" disabled>Choisir une variable…</option>
            <option v-for="variable in variablesDerivables" :key="variable.id" :value="variable.id">
              {{ variable.lib }}{{ variable.priv ? ' — privée' : '' }}
            </option>
          </select>
        </label>
        <template v-if="variableChoisie">
          <p v-if="chargementApercu" role="status">Évaluation de la recette…</p>
          <template v-else-if="apercuDerivation">
            <p :class="statutDisponible(apercuDerivation.statut) ? 'avertissement' : 'erreur-bloc'">
              {{ STATUTS[apercuDerivation.statut] }}
              <template v-if="apercuDerivation.valeurLibelle"> — « {{ apercuDerivation.valeurLibelle }} »</template>
            </p>
            <ul class="observations-apercu">
              <li v-for="(observation, index) in apercuDerivation.observations" :key="index">
                {{ observation.entretienId }}<template v-if="observation.locuteurIndex !== null"> · locuteur {{ observation.locuteurIndex }}</template>
                : <b>{{ libelleValeurVariable(variableChoisie, observation.valeur) }}</b><template v-if="observation.invalide"> (modalité disparue)</template><template v-if="observation.sourceIllisible"> — source illisible</template>
              </li>
            </ul>
            <p v-if="!statutDisponible(apercuDerivation.statut) && apercuDerivation.statut !== 'absent'" class="erreur-bloc">
              Cette recette ne peut pas être enregistrée : corrigez les données ou choisissez une autre variable.
            </p>
          </template>
          <fieldset class="cible-derivation">
            <legend>Attribut cible</legend>
            <label class="case-cocher"><input v-model="cibleDerivation" type="radio" value="nouvelle" /> Créer l’attribut « {{ variableChoisie.lib }} »</label>
            <div v-if="cibleDerivation === 'nouvelle'" class="nouvelle-definition">
              <label>Libellé<input v-model="libNouvelAttribut" :placeholder="variableChoisie.lib" /></label>
              <label class="case-cocher"><input v-model="privNouvelAttribut" type="checkbox" /> Attribut privé</label>
              <p v-if="variableChoisie.priv && !privNouvelAttribut" class="avertissement">
                La variable source est privée : un attribut public révélerait ses valeurs. La confidentialité est proposée privée par défaut.
              </p>
            </div>
            <label class="case-cocher"><input v-model="cibleDerivation" type="radio" value="existante" /> Utiliser un attribut existant</label>
            <label v-if="cibleDerivation === 'existante'">
              Attribut
              <select v-model="attributExistant">
                <option value="" disabled>Choisir un attribut…</option>
                <option v-for="definition in attributsExistantsDerivables" :key="definition.id" :value="definition.id">
                  {{ definition.lib }}{{ definition.priv ? ' — privé' : '' }}
                </option>
              </select>
            </label>
            <p v-if="cibleDerivation === 'existante' && variableChoisie.priv
              && attributExistant && !attributsCas[attributExistant]?.priv" class="avertissement">
              La variable source est privée, mais l’attribut existant est public.
            </p>
          </fieldset>
          <button
            class="primaire"
            :disabled="!libelleCibleValide()
              || !apercuDerivation
              || apercuDerivation.statut === 'incoherent'
              || apercuDerivation.statut === 'non-verifiable'"
            @click="ajouterDerivation"
          >Ajouter la dérivation</button>
        </template>
        <p v-if="erreurDerivation" class="erreur">{{ erreurDerivation }}</p>
      </fieldset>
    </details>
  </section>
</template>

<style scoped>
.attributs-cas { margin-top: 1rem; border-top: 1px solid #ddd; padding-top: .8rem; }
.attributs-cas header h3 { margin: 0 0 .2rem; }
.aide { font-size: .82rem; color: #666; margin: 0 0 .6rem; }
.table-attributs { width: 100%; border-collapse: collapse; font-size: .9rem; }
.table-attributs th { text-align: left; font-size: .78rem; color: #777; border-bottom: 1px solid #ddd; padding: .3rem .4rem; }
.table-attributs td { border-bottom: 1px solid #eee; padding: .4rem; vertical-align: top; }
.table-attributs tr.suspendu td { background: #fff8f7; }
.badge-prive { margin-left: .4rem; padding: .05rem .35rem; border-radius: 999px; background: #fdecea; color: #b3261e; font-size: .7rem; }
.valeur-derivee small { color: #a06a00; }
.valeur-absente { color: #999; }
.valeur-texte { width: 100%; box-sizing: border-box; }
.detail-diagnostic summary { cursor: pointer; color: #555; font-size: .8rem; }
.detail-diagnostic ul { margin: .3rem 0 0; padding-left: 1.2rem; font-size: .8rem; }
.detail-diagnostic .probleme { margin: .2rem 0 0; font-size: .8rem; }
.note { font-size: .78rem; color: #888; }
.ajout-attribut { margin-top: .8rem; }
.ajout-attribut summary { cursor: pointer; color: #2e73d8; }
.ajout-attribut fieldset { display: grid; gap: .6rem; border: 1px solid #ddd; border-radius: 6px; margin-top: .5rem; }
.ajout-attribut label { display: grid; gap: .25rem; font-size: .85rem; color: #555; }
.ajout-attribut select, .ajout-attribut input { width: 100%; box-sizing: border-box; }
.case-cocher { display: flex; align-items: center; gap: .4rem; }
.case-cocher input { width: auto; flex: none; }
.cible-derivation { padding: .5rem; }
.nouvelle-definition { display: grid; gap: .4rem; padding-left: 1.2rem; }
.observations-apercu { margin: .3rem 0; padding-left: 1.2rem; font-size: .82rem; }
.avertissement { padding: .4rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .82rem; }
.erreur { color: #b3261e; }
.erreur-bloc { padding: .4rem; background: #fdecea; border-left: 4px solid #c62828; font-size: .82rem; color: #b3261e; }
.primaire { border-color: #1565c0; background: #2e73d8; color: #fff; }
.danger { color: #b3261e; }
.vide { color: #888; }
</style>
