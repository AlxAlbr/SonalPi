<template>
  <details class="pseudo-legende" open>
    <summary>
      <span><span aria-hidden="true">ℹ️</span> Légende et aide</span>
      <span class="legende-toggle" aria-hidden="true"><span class="reduire">−</span><span class="agrandir">+</span></span>
    </summary>
    <div class="legende-contenu">
      <div class="legende-groupe">
        <span><span class="legende-badge anonymise" aria-hidden="true">N</span> Pseudonymisés</span>
        <span><span class="legende-badge exception" aria-hidden="true">N</span> Laissés en clair</span>
        <span><span class="legende-badge a-traiter" aria-hidden="true">N</span> À traiter</span>
      </div>
      <div class="legende-groupe">
        <span><span class="legende-ligne ligne-verte" aria-hidden="true"></span> Règle entièrement traitée</span>
        <span><span class="legende-ligne ligne-orange" aria-hidden="true"></span> Passages restant à traiter</span>
      </div>
      <div class="legende-groupe legende-indications">
        <span><b aria-hidden="true">*</b> Passages masqués par un autre choix, hors compteurs traités</span>
        <span><b aria-hidden="true">—</b> Aucun usage</span>
        <span><b aria-hidden="true">⟳</b> Bilan à actualiser</span>
      </div>
      <div class="legende-groupe">
        <span><span aria-hidden="true">📄</span> Dissocier en gardant les pseudonymes dans les entretiens</span>
        <span><span class="croix" aria-hidden="true">✖</span> Supprimer la règle et les choix qui en dépendent</span>
      </div>
      <p>Les variantes de pseudonyme se choisissent dans l’entretien. Les pseudonymes des locuteurs se gèrent dans le panneau Locuteurs.</p>
    </div>
  </details>
</template>
<style scoped>
.pseudo-legende { margin-bottom: .65rem; border: 1px solid #dce3ec; border-radius: 7px; overflow: hidden; color: #465366; font-size: .8rem; background: #fafbfd; }
summary { display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .45rem .65rem; background: #eef3f8; font-weight: 600; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid #1565c0; outline-offset: -2px; }
.legende-toggle { width: 1.3rem; height: 1.3rem; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9c5d4; border-radius: 4px; background: white; }
.agrandir, details:not([open]) .reduire { display: none; }
details:not([open]) .agrandir { display: inline; }
.legende-contenu { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr)); gap: .65rem 1rem; padding: .65rem; }
.legende-groupe { display: flex; align-items: center; flex-wrap: wrap; gap: .55rem .9rem; }
.legende-groupe > span { display: inline-flex; align-items: center; gap: .35rem; }
.legende-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 1.3rem; height: 1.3rem; padding: 0 .2rem; box-sizing: border-box; border-radius: 999px; color: white; font-weight: 700; font-size: .75rem; }
.anonymise { background: #087f65; } .exception { background: #555; } .a-traiter { background: #a95100; }
.legende-ligne { display: inline-block; width: .85rem; height: .85rem; border: 1px solid; border-radius: 3px; flex-shrink: 0; }
.ligne-verte { background: #e8f5e9; border-color: #a5d6a7; } .ligne-orange { background: #fff3e0; border-color: #ffb74d; }
.croix { color: #b00020; }
p { grid-column: 1 / -1; margin: 0; padding-top: .5rem; border-top: 1px solid #e1e7ef; color: #596575; line-height: 1.45; }
</style>
