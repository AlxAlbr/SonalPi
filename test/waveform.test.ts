/**
 * Waveform — dérivé local optionnel : les SAUTS assumés ne doivent jamais
 * coûter un fetch ni une erreur (analyse complète : plans/reflexion-ffmpeg.md).
 *
 * Les chemins nominaux (décodage AudioContext + canvas) exigent un navigateur ;
 * ce banc ne teste que les décisions de court-circuit, observables en Node.
 */

import { describe, expect, it, vi, afterEach } from 'vitest'
import { genererEtEcrireWaveform } from '../src/renderer/audio/waveform'
import { TAILLE_MAX_MEDIA } from '../src/shared/media'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('genererEtEcrireWaveform — sauts sans coût', () => {
  it('VIDÉO : aucun fetch, null silencieux', async () => {
    const fetchDouble = vi.fn()
    vi.stubGlobal('fetch', fetchDouble)

    for (const ref of ['videos/entretien.mp4', 'C:\\chez-max\\prise.webm', '/miroir/mov/1.mov']) {
      await expect(genererEtEcrireWaveform('e1', ref)).resolves.toBeNull()
    }
    expect(fetchDouble).not.toHaveBeenCalled()
  })

  it('AUDIO au-delà du seuil mémoire : content-length lu, corps JAMAIS absorbé', async () => {
    // Le stub répond ok avec un en-tête de taille au-delà du seuil ; si le
    // code consommait le corps, il échouerait (body null) ou saturerait.
    const rep = new Response(null, {
      status: 200,
      headers: { 'content-length': String(TAILLE_MAX_MEDIA + 1) },
    })
    const fetchDouble = vi.fn(async () => rep)
    vi.stubGlobal('fetch', fetchDouble)

    await expect(genererEtEcrireWaveform('e1', 'audio/gros.flac')).resolves.toBeNull()
    expect(fetchDouble).toHaveBeenCalledTimes(1)
  })

  it('AUDIO de taille raisonnable : la génération est tentée (fetch émis)', async () => {
    // Corps minuscule non décodable : la génération échouera APRÈS le fetch
    // (pas d'AudioContext en Node) → null, mais le fetch DOIT avoir eu lieu :
    // c'est lui qu'on observe ici, pas le décodage.
    const fetchDouble = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchDouble)

    await expect(genererEtEcrireWaveform('e1', 'audio/entretien.mp3')).resolves.toBeNull()
    expect(fetchDouble).toHaveBeenCalledTimes(1)
  })
})
