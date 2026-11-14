import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../gams.json', import.meta.url)))

// This is the native $file contract, not a claim of compatibility with
// the older released Host retained by the Makefile.
test('local Project declares native $file resources and the canonical local View build', () => {
    const sources = [
        ...config.plugins,
        config.ui.theme.url,
        ...Object.values(config.ui.services).map(service => service.url),
        ...Object.values(config.ui.views).map(view => view.url),
    ]
    const remoteUrls = []
    for (const source of sources) {
        if (typeof source === 'string') {
            assert.ok(source.length)
            assert.doesNotMatch(source, /^[a-z][a-z\d+.-]*:/i, 'bare remote Unit sources are unsupported')
            continue
        }
        assert.deepEqual(Object.keys(source), ['$file'])
        const resource = source.$file
        const descriptor = typeof resource === 'object' && resource !== null
        if (descriptor) {
            assert.deepEqual(Object.keys(resource).sort(), ['entry', 'url'])
            assert.equal(typeof resource.entry, 'string')
            assert.ok(resource.entry.length, 'ZIP requires an entry selector')
        }
        const url = new URL(descriptor ? resource.url : resource)
        assert.equal(url.protocol, 'https:')
        assert.equal(url.hostname, 'github.com')
        assert.match(url.pathname, /^\/kkgams\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+\//)
        assert.equal(url.hash, '', 'archive entries belong in the $file descriptor')
        if (url.pathname.endsWith('.zip')) assert.ok(descriptor, 'ZIP requires an explicit entry')
        remoteUrls.push(url)
    }
    assert.ok(remoteUrls.some(url => url.pathname.endsWith('/plugin.fs.wasm')))
    assert.equal(config.ui.views['view-nine'].url, 'build.nosync/views/view-nine.js')
    assert.ok(existsSync(new URL('../src/model.mjs', import.meta.url)))
    assert.ok(existsSync(new URL('../src/views/view-nine.js', import.meta.url)))
})
