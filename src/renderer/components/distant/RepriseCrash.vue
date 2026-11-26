<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { afficherErreurGlobale } from '../../erreurs'
import { avecAttente } from '../../attente'

/**
 *  Dialogue affiché à l'ouverture d'un corpus distant quand SonalPi s'est fermé
 *  alors que des entretiens étaient ouverts sur ce poste.
 *  Ces entretiens restent réservés à l'utilisateur tant qu'il n'a pas choisi :
 *  envoyer la version enregistrée sur ce poste, ou garder celle du serveur.
 *  Dans les deux cas, l'entretien redevient ensuite disponible pour tous.
 */
const { orphelinsDistants, membership, reprendreOrphelin, abandonnerOrphelin } = utiliserSonal()

/** Un entretien renommé ou supprimé entre-temps s'affiche sous son identifiant. */
const liste = computed(() =>
  orphelinsDistants.value.map((o) => ({
    ...o,
    titre: membership.value[o.id]?.titre ?? o.id,
  })),
)

const raisons: Record<string, string> = {
  divergence:
    'l’entretien a été modifié sur le serveur entre-temps. Rien n’a été envoyé ; vos modifications restent sur ce poste.',
  'pas de copie locale': 'aucune version n’a été trouvée sur ce poste.',
  'deja libere': 'l’entretien n’était plus réservé à votre nom. Rien n’a été envoyé : rouvrez-le pour vérifier son contenu.',
}

const enCours = ref<string | null>(null)
async function reprendre(chemin: string, titre: string) {
  enCours.value = chemin
  try {
    const resultat = await avecAttente(`Envoi de « ${titre} » au serveur…`, () => reprendreOrphelin(chemin))
    if (!resultat.ok) {
      afficherErreurGlobale(raisons[resultat.raison ?? ''] ?? resultat.raison ?? 'raison inconnue.',
        `« ${titre} » n’a pas été envoyé`)
    }
  } catch (e) {
    afficherErreurGlobale(e, `« ${titre} » n’a pas été envoyé`)
  } finally {
    enCours.value = null
  }
}
async function abandonner(chemin: string, titre: string) {
  enCours.value = chemin
  try {
    await avecAttente(`Libération de « ${titre} »…`, () => abandonnerOrphelin(chemin))
  } catch (e) {
    afficherErreurGlobale(e, `« ${titre} » n’a pas pu être libéré`)
  } finally {
    enCours.value = null
  }
}

const heureDe = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <Teleport to="body">
    <div v-if="liste.length > 0" class="voile-reprise">
      <div class="modale-reprise" role="dialog" aria-label="Entretiens restés ouverts">
        <h3>🔄 Entretiens restés ouverts</h3>
        <p class="intro">
          SonalPi s’est fermé avant d’avoir pu envoyer vos dernières modifications au serveur.
          Les entretiens ci-dessous restent <b>réservés à votre nom</b> :
          personne d’autre ne peut les modifier tant que vous n’avez pas choisi.
        </p>
        <ul class="liste-orphelins">
          <li v-for="o in liste" :key="o.cheminVerrou" class="orphelin">
            <div class="orph-infos">
              <span class="orph-titre">« {{ o.titre }} »</span>
              <span class="orph-detail">ouvert le {{ heureDe(o.acquiredAt) }}</span>
            </div>
            <div class="orph-actions">
              <button class="primaire" :disabled="enCours === o.cheminVerrou" @click="reprendre(o.cheminVerrou, o.titre)">
                Envoyer mes modifications
              </button>
              <button :disabled="enCours === o.cheminVerrou" @click="abandonner(o.cheminVerrou, o.titre)">
                Ne pas les envoyer
              </button>
            </div>
          </li>
        </ul>
        <dl class="note">
          <dt>Envoyer mes modifications <span class="conseil">(choix habituel)</span></dt>
          <dd>
            La version enregistrée sur ce poste juste avant la fermeture remplace celle du serveur.
            Vous retrouvez votre travail tel que vous l’aviez laissé.
          </dd>
          <dt>Ne pas les envoyer</dt>
          <dd>
            Le serveur garde la version précédente ; vos dernières modifications ne sont pas envoyées.
            Une copie reste conservée sur ce poste.
            À choisir seulement si vous pensez qu’elles étaient erronées.
          </dd>
        </dl>
        <p class="note">Après une libération réussie, l’entretien redevient disponible pour tout le monde.</p>
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
