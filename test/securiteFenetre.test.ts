import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { preferencesImpressionPdf, preferencesRenderer, securiserNavigation } from '../src/main/securiteFenetre'

describe('sécurité de la fenêtre Electron', () => {
  test('active le sandbox sans exposer Node au renderer', () => {
    expect(preferencesRenderer('/application/preload.js')).toEqual({
      preload: '/application/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    })
  })

  test('bloque les navigations et les nouvelles fenêtres', () => {
    let lorsNavigation: ((evenement: { preventDefault(): void }) => void) | undefined
    let ouvrir: (() => { action: string }) | undefined
    const contenu = {
      on: vi.fn((nom: string, ecouteur: typeof lorsNavigation) => {
        expect(nom).toBe('will-navigate')
        lorsNavigation = ecouteur
        return contenu
      }),
      setWindowOpenHandler: vi.fn((gestionnaire: typeof ouvrir) => {
        ouvrir = gestionnaire
      }),
    }

    securiserNavigation(
      contenu as unknown as Parameters<typeof securiserNavigation>[0],
    )
    const preventDefault = vi.fn()
    lorsNavigation?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(ouvrir?.()).toEqual({ action: 'deny' })
  })

  test('la CSP interdit les scripts injectés et les contenus embarqués', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1]

    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain('sonal-media:')
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(?:inline|eval)'/)
  })
})

describe('fenêtre d’impression PDF', () => {
  test('sandboxée, sans JavaScript, navigation isolée', () => {
    expect(preferencesImpressionPdf()).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: false,
    })
  })
})
