import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../gams.json', import.meta.url)))
const makefile = readFileSync(new URL('../Makefile', import.meta.url), 'utf8')

// GAMS v3.1.1 selects its filesystem before loading Views. Its released
// selectFilesystemSource and projectUnits.resolve accept strings, not $file objects.
test('local Project uses the source contract of its pinned released Host', () => {
    assert.match(makefile, /^GAMS_VERSION := v3\.1\.1$/m)
    const sources = [
        ...config.plugins,
        config.ui.theme.url,
        ...Object.values(config.ui.services).map(service => service.url),
        ...Object.values(config.ui.views).map(view => view.url),
    ]
    for (const source of sources) {
        assert.equal(typeof source, 'string', 'GAMS v3.1.1 Unit source must be a non-empty string')
        assert.ok(source.length)
        if (!source.startsWith('https://')) continue
        const url = new URL(source)
        assert.match(url.pathname, /\/releases\/download\/v\d+\.\d+\.\d+\//)
        if (url.pathname.endsWith('.zip')) assert.ok(url.hash.length > 1, 'ZIP requires an entry selector')
    }
    assert.ok(config.plugins.some(source => source.endsWith('/plugin.fs.wasm')))
    assert.equal(config.ui.views['view-nine'].url, 'build.nosync/views/view-nine.js')
})
