import { describe, expect, it } from 'vitest'
import { creerDetectionDoubleAlt, estToucheAlt } from '../src/renderer/editor/raccourcisLecture'

const alt = {
  key: 'Alt', code: 'AltLeft', location: 1, repeat: false,
  isComposing: false, shiftKey: false, metaKey: false, ctrlKey: false,
}
const altGr = { ...alt, key: 'AltGraph', code: 'AltRight', location: 2, ctrlKey: true }

describe('doubles appuis de déplacement audio', () => {
  it.each([
    ['Alt gauche', alt, -5],
    ['Alt Gr', altGr, 5],
    ['Alt droite signalé comme Alt', { ...altGr, key: 'Alt', ctrlKey: false }, 5],
  ])('%s déclenche une seule fois après deux appuis rapprochés', (_nom, touche, secondes) => {
    const detection = creerDetectionDoubleAlt()
    expect(detection.appui(touche, 1000)).toBeNull()
    expect(detection.appui(touche, 1200)).toBe(secondes)
    expect(detection.appui(touche, 1250)).toBeNull()
    expect(detection.appui(touche, 1350)).toBe(secondes)
  })

  it('ne déclenche pas après 300 ms ou en alternant gauche et droite', () => {
    const detection = creerDetectionDoubleAlt()
    expect(detection.appui(alt, 1000)).toBeNull()
    expect(detection.appui(alt, 1300)).toBeNull()
    expect(detection.appui(altGr, 1400)).toBeNull()
    expect(detection.appui(alt, 1500)).toBeNull()
  })

  it('ignore la répétition d’une touche maintenue', () => {
    const detection = creerDetectionDoubleAlt()
    detection.appui(alt, 1000)
    expect(detection.appui({ ...alt, repeat: true }, 1100)).toBeNull()
    expect(detection.appui({ ...alt, repeat: true }, 1200)).toBeNull()
    expect(detection.appui(alt, 1300)).toBeNull()
  })

  it.each(['a', ' ', 'Shift', 'Control'])('une autre touche (%s) coupe la séquence Alt gauche', (key) => {
    const detection = creerDetectionDoubleAlt()
    detection.appui(alt, 1000)
    detection.appui({ ...alt, key, code: '' }, 1100)
    expect(detection.appui(alt, 1200)).toBeNull()
  })

  it('accepte le Ctrl synthétique envoyé avant chaque Alt Gr sous Windows', () => {
    const detection = creerDetectionDoubleAlt()
    const ctrl = { ...alt, key: 'Control', code: 'ControlLeft', ctrlKey: true }
    detection.appui(ctrl, 1000)
    expect(detection.appui(altGr, 1010)).toBeNull()
    detection.appui(ctrl, 1100)
    expect(detection.appui(altGr, 1110)).toBe(5)
  })

  it('la saisie avec Alt Gr ne compte pas comme un double appui', () => {
    const detection = creerDetectionDoubleAlt()
    detection.appui(altGr, 1000)
    detection.appui({ ...altGr, key: '@', code: 'Digit0' }, 1100)
    expect(detection.appui(altGr, 1200)).toBeNull()
  })

  it.each([
    { ...alt, shiftKey: true },
    { ...alt, metaKey: true },
    { ...alt, ctrlKey: true },
    { ...alt, isComposing: true },
  ])('ne déclenche pas pendant une combinaison ou une composition : %j', (touche) => {
    const detection = creerDetectionDoubleAlt()
    expect(detection.appui(touche, 1000)).toBeNull()
    expect(detection.appui(touche, 1100)).toBeNull()
  })

  it('réinitialise la séquence à la perte du focus', () => {
    const detection = creerDetectionDoubleAlt()
    detection.appui(alt, 1000)
    detection.reinitialiser()
    expect(detection.appui(alt, 1100)).toBeNull()
  })

  it('ne confond pas Alt Gr avec une touche de texte', () => {
    expect(estToucheAlt(altGr)).toBe(true)
    expect(estToucheAlt({ ...altGr, key: '@' })).toBe(false)
  })
})
