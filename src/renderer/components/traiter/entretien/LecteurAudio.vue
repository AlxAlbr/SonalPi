<script setup lang="ts">
import { utiliserSonal } from '../../../composables/sonal'
import AideLectureAudio from './AideLectureAudio.vue'
import type { SegmentThematique } from '../../../../shared/format'

/**
 *  Lecteur audio de l'écran entretien : play/pause, position, vitesse, ±5 s,
 *  puis la bande (forme d'onde, curseur de position, clic pour se déplacer).
 *  Tout l'état vit dans le scope audio partagé (useAudio).
 *  La bande porte aussi le résumé thématique de l'entretien, calé sur le temps.
 *  `empile` (mode vidéo) : la bande passe sous les commandes,
 *  pour laisser la place au panneau vidéo.
 */
const props = withDefaults(defineProps<{ empile?: boolean }>(), { empile: false })
const {
  audio,
  resumeOuvert,
  tempsAuTexte,
  peintureSegment,
  reassignerAudioEntretienOuvert,
  associerAudioEntretienOuvert,
  ouvrirDesignationAudio,
  etatAudioOuvert,
  gesteDisponible,
  entretienEditable,
  rapatrierAudioMaintenant,
  lireAudioDistant,
  lireAudioLocal,
  preparationLectureDistante,
  lectureDistanteActive,
  mediaDistantDesigne,
  audioLocalDisponible,
  idDistantCourant,
  fournisseurCourant,
  ouvertId,
  tirageEnCours,
  progressionDistant,
  pourcentageProgression,
} = utiliserSonal()
const { url, waveformUrl, enLecture, duree, position, vitesse, ratio, erreur, basculer, decaler, changerVitesse, seek } =
  audio

/** Style d'un segment sur la BANDE : la bande est un axe TEMPOREL (le curseur
 *  y vit) → les bornes texte du segment sont re-projetées en temps via les
 *  ancres (`tempsAuTexte`) ; sans ancre (texte sans timecodes), repli en % du
 *  texte. Peinture partagée avec les cartes Corpus. */
function styleSegmentBande(s: SegmentThematique): Record<string, string> {
  const p = peintureSegment(s.codes)
  let deb = s.deb
  let fin = s.fin
  if (duree.value > 0) {
    const t0 = tempsAuTexte(s.pos)
    const t1 = tempsAuTexte(s.posFin)
    if (t0 != null && t1 != null && t1 > t0) {
      deb = (t0 / duree.value) * 100
      fin = (t1 / duree.value) * 100
    }
  }
  const style: Record<string, string> = { left: deb + '%', width: fin - deb + '%' }
  if (p.background) style.background = p.background
  if (p.borderBottom) style.borderBottom = p.borderBottom
  if (p.masque) style.display = 'none'
  return style
}

function fmt(t: number): string {
  if (!Number.isFinite(t)) return '0:00'
  const s = Math.floor(t % 60)
  const m = Math.floor(t / 60) % 60
  const h = Math.floor(t / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0')
}

/** Clic sur la bande = seek proportionnel au TEMPS : la bande est une image
 *  temporelle, pas un référentiel texte. */
function clicBande(e: MouseEvent) {
  if (duree.value <= 0) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  seek(r * duree.value)
}
</script>

<template>
  <div v-if="url && !erreur" class="lecteur-audio" :class="{ empile: props.empile }">
    <div class="bloc-commandes">
      <div class="commandes">
        <button class="play" data-tour="lecture" :title="enLecture ? 'Pause' : 'Lecture'" @click="basculer">
          {{ enLecture ? '⏸' : '▶' }}
        </button>
        <span class="temps">{{ fmt(position) }} / {{ fmt(duree) }}</span>
        <span class="groupe-vitesse">
          <button class="mini-lect" title="Ralentir" @click="changerVitesse('-')">−</button>
          <button class="mini-lect lbl-vitesse" title="Vitesse normale" @click="changerVitesse('=')">
            x {{ vitesse.toFixed(2).replace(/\.?0+$/, '') || '1' }}
          </button>
          <button class="mini-lect" title="Accélérer" @click="changerVitesse('+')">+</button>
        </span>
        <button class="mini-lect" title="Reculer de 5 secondes" @click="decaler(-5)">−5s</button>
        <button class="mini-lect" title="Avancer de 5 secondes" @click="decaler(5)">+5s</button>
        <button
          v-if="mediaDistantDesigne && !lectureDistanteActive"
          class="mini-lect"
          :disabled="preparationLectureDistante"
          @click="lireAudioDistant"
        >
          Lire depuis le serveur
        </button>
        <button
          v-else-if="lectureDistanteActive && audioLocalDisponible"
          class="mini-lect"
          @click="lireAudioLocal"
        >
          Lire le fichier local
        </button>
      </div>
      <AideLectureAudio />
    </div>
    <div class="bande" title="Cliquer pour se déplacer dans la bande" @click="clicBande">
      <img v-if="waveformUrl" class="onde" :src="waveformUrl" alt="" draggable="false" />
      <div v-else class="onde onde-vide"></div>
      <!-- Calque du résumé thématique : décoratif (pointer-events none —
           le clic sur la bande reste un seek), sous le curseur. -->
      <span
        v-for="(s, i) in resumeOuvert"
        :key="i"
        class="xtr-bande"
        :style="styleSegmentBande(s)"
      ></span>
      <div class="curseur" :style="{ left: ratio * 100 + '%' }"></div>
    </div>
  </div>
  <div
    v-else-if="['distant', 'inaccessible', 'distant-gitlab', 'base-non-configuree', 'base-secret-indisponible', 'media-absent', 'media-droits', 'media-indisponible', 'plages-non-prises-en-charge', 'format-non-pris-en-charge'].includes(etatAudioOuvert.etat)"
    class="lecteur-audio lecteur-etat"
  >
    <!-- L'état du média DÉSIGNÉ, à côté de la
         barre de lecture — le bon moment UX (on vient ici pour écouter).
         distant = copie pas encore téléchargée ; inaccessible = le serveur
         refuse le GET (droits) — message explicatif + réessai. -->
    <template v-if="etatAudioOuvert.etat === 'media-absent'">
      <span class="msg-etat">
        🔊 Le média WebDAV désigné est absent ou a été renommé. Vous pouvez en désigner un autre.
      </span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'media-droits'">
      <span class="msg-etat">🔒 Le serveur refuse l’accès au média désigné pour ce compte.</span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'media-indisponible'">
      <span class="msg-etat">⚠️ Le média WebDAV est momentanément indisponible. La transcription reste utilisable.</span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'base-non-configuree'">
      <span class="msg-etat">
        🔊 Un média WebDAV est désigné, mais aucune base de médias n’est configurée sur ce poste.
        Configurez le dossier depuis l’accueil GitLab.
      </span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'base-secret-indisponible'">
      <span class="msg-etat">
        🔊 Un média WebDAV est désigné, mais son mot de passe n’est pas disponible sur ce poste.
        Enregistrez de nouveau la base depuis l’accueil GitLab.
      </span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'plages-non-prises-en-charge'">
      <span class="msg-etat">
        ⚠️ Ce serveur ne permet pas la lecture par plages. Aucun téléchargement complet n’a été lancé.
      </span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'format-non-pris-en-charge'">
      <span class="msg-etat">🔊 La lecture distante de ce format n’est pas encore prise en charge.</span>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'distant-gitlab'">
      <span class="msg-etat">
        🔊 Média désigné dans la base WebDAV de ce poste — aucun fichier n’est copié dans GitLab.
      </span>
      <button class="mini-lect" :disabled="preparationLectureDistante" @click="lireAudioDistant">
        {{ preparationLectureDistante ? 'Préparation…' : 'Lire depuis le serveur' }}
      </button>
    </template>
    <template v-else-if="etatAudioOuvert.etat === 'distant'">
      <!-- Pendant le rapatriement, le geste devient progression (octets si
           le serveur n'expose pas la taille). -->
      <span v-if="tirageEnCours && progressionDistant?.sens === 'rapatriement'" class="msg-etat">
        ⏳ Rapatriement de « {{ progressionDistant.chemin }} »…
        {{ pourcentageProgression !== null ? `${pourcentageProgression} %` : 'en cours' }}
      </span>
      <template v-else>
        <span class="msg-etat">🔊 Média désigné sur le Nextcloud — pas encore sur ce poste.</span>
        <button class="mini-lect" @click="rapatrierAudioMaintenant">🔄 Rapatrier maintenant</button>
      </template>
    </template>
    <template v-else>
      <span class="msg-etat">
        🔒 Média désigné mais inaccessible depuis ce poste (droits insuffisants) —
        demandez l'accès au propriétaire du fichier ; il sera récupéré
dès que les droits seront ouverts.
      </span>
      <button class="mini-lect" @click="rapatrierAudioMaintenant">Réessayer</button>
    </template>
    <button
      v-if="audioLocalDisponible"
      class="mini-lect"
      @click="lireAudioLocal"
    >
      Lire le fichier local
    </button>
    <button
      v-if="ouvertId && fournisseurCourant === 'gitlab' && gesteDisponible('designationMedia')"
      class="mini-lect"
      :disabled="!entretienEditable"
      @click="ouvrirDesignationAudio(ouvertId)"
    >
      Redésigner dans la base WebDAV…
    </button>
  </div>
  <div v-else-if="url && erreur" class="lecteur-audio lecteur-erreur">
    <!-- En corpus distant, l'audioRef partagée pointe chez le poste qui a
         assigné — chaque poste associe SON fichier local (référence, jamais de
         copie, jamais d'écriture au JSON partagé). En local, le geste reste la
         ré-assignation classique. -->
    <template v-if="idDistantCourant && fournisseurCourant === 'gitlab' && etatAudioOuvert.etat === 'distant-gitlab'">
      <span class="msg-erreur">
        ⚠️ La lecture distante a été interrompue ou ce codec n’est pas lisible. La transcription reste utilisable.
      </span>
      <button class="mini-lect" :disabled="preparationLectureDistante" @click="lireAudioDistant">
        Réessayer
      </button>
      <button v-if="audioLocalDisponible" class="mini-lect" @click="lireAudioLocal">
        Lire le fichier local
      </button>
    </template>
    <template v-else-if="idDistantCourant">
      <span class="msg-erreur">🔊 Audio absent de ce poste — il vit sur la machine qui l'a assigné.</span>
      <button class="mini-lect" @click="associerAudioEntretienOuvert">Associer l'audio local…</button>
      <!-- Le fichier partagé peut aussi être désigné : WebDAV le rapatrie,
           tandis que GitLab ne publie que sa référence. -->
      <button
        v-if="ouvertId && gesteDisponible('designationMedia')"
        class="mini-lect"
        :disabled="!entretienEditable"
        @click="ouvrirDesignationAudio(ouvertId)"
      >
        {{ fournisseurCourant === 'gitlab' ? 'Désigner dans la base WebDAV…' : 'Désigner dans le Nextcloud…' }}
      </button>
    </template>
    <template v-else>
      <span class="msg-erreur">🔊 Audio introuvable — le fichier a peut-être été déplacé.</span>
      <button class="mini-lect" @click="reassignerAudioEntretienOuvert">Assigner un audio…</button>
    </template>
  </div>
  <div
    v-else-if="etatAudioOuvert.etat === 'hors-designation' && ouvertId && gesteDisponible('designationMedia')"
    class="lecteur-audio lecteur-etat"
  >
    <span class="msg-etat">🔊 Aucun média partagé n’est désigné pour cet entretien.</span>
    <button
      class="mini-lect"
      :disabled="!entretienEditable"
      @click="ouvrirDesignationAudio(ouvertId)"
    >
      {{ fournisseurCourant === 'gitlab' ? 'Désigner dans la base WebDAV…' : 'Désigner dans le Nextcloud…' }}
    </button>
  </div>
</template>

<style scoped>
.lecteur-audio {
  /* En flux normal : c'est .entete-centre (Entretien.vue) qui colle l'ensemble
     barre + lecteur en haut de la fenêtre pendant le défilement. */
  display: flex;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid #dce4ef;
  border-radius: 8px;
  background: #fafdff;
  padding: 0.35rem 0.6rem;
  margin-bottom: 0.6rem;
}
/* Mode vidéo (empilé) : la bande passe sous les commandes, pleine largeur ;
   les commandes peuvent passer à la ligne plutôt que déborder sur la vidéo. */
.lecteur-audio.empile {
  flex-direction: column;
  align-items: stretch;
}
.lecteur-audio.empile .commandes {
  flex-wrap: wrap;
}
.lecteur-audio.empile .bande {
  width: 100%;
}
.bloc-commandes {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 0.2rem;
}
.commandes {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: none;
  white-space: nowrap;
}
.commandes > *,
.groupe-vitesse > * {
  flex-shrink: 0;
}
/* Sur une seule ligne, un filet sépare les commandes de la forme d'onde. */
.lecteur-audio:not(.empile):not(.lecteur-etat):not(.lecteur-erreur) .bloc-commandes {
  border-right: 1px solid #dce4ef;
  padding-right: 0.8rem;
}
.play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}
.temps {
  font-family: monospace;
  font-size: 0.78rem;
  color: #555;
  /* Place réservée pour « 0:00:00 / 0:00:00 » : les commandes gardent leur largeur après une heure. */
  min-width: 17ch;
  text-align: center;
}
.groupe-vitesse {
  display: inline-flex;
  gap: 0.15rem;
}
.mini-lect {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0.15rem 0.4rem;
}
.mini-lect:hover {
  border-color: #2e73d8;
}
.lbl-vitesse {
  min-width: 3rem;
  font-family: monospace;
}
.lecteur-erreur {
  gap: 0.6rem;
  border-color: #f3b4ad;
  background: #fdecea;
}
/* État de l'audio désigné (distant / inaccessible) : informatif, pas une
   erreur — teinte neutre. */
.lecteur-etat {
  gap: 0.6rem;
  border-color: #c9d8ef;
  background: #eef3fb;
}
.msg-etat {
  font-size: 0.82rem;
  color: #2b4a75;
}
.msg-erreur {
  font-size: 0.82rem;
  color: #b3261e;
}
/* La bande : forme d'onde + curseur de position (ratio temps/durée). MÊME
   représentation que les cartes Corpus : conteneur compact à dégradé vertical,
   onde plate 800×31 — la bande reste un axe TEMPOREL plein (l'onde n'est
   jamais rognée : `object-fit: fill`, le curseur se cale en %). */
.bande {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 31px;
  cursor: pointer;
  border: 1px solid #cbcbcb;
  border-radius: 3px;
  overflow: hidden;
  background: linear-gradient(#00000040 0%, #fbf5f560 50%, #00000040 100%);
}
.onde {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
  pointer-events: none;
}
.onde-vide {
  background: transparent; /* le dégradé du conteneur suffit (comme les cartes) */
}
.curseur {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #d84315;
  pointer-events: none;
}
/* Segment du résumé thématique sur la bande — opacité 0.55 : la teinte du
   thème reste reconnaissable, l'onde reste lisible dessous. Jamais
   interactif. */
.xtr-bande {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.55;
  pointer-events: none;
  box-sizing: border-box;
  border-radius: 2px;
}
</style>
