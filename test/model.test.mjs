import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNine, newNine, newSlice, nineRect, nineCenter, nineHandles, hitNineHandle, resizeNineSlice, moveNineSlice } from '../src/model.mjs'

const size = { width: 128, height: 96 }
const slice = () => ({ name: 'Panel', bounds: { x: 10, y: 20, width: 30, height: 24 }, center: { x: 4, y: 5, width: 20, height: 12 } })
const doc = () => ({ ...newNine('images/atlas.png'), slices: [slice()] })

test('versioned JSON roundtrip and deep copy preserve pixel rectangles', () => {
    const source = doc(), copy = validateNine(JSON.parse(JSON.stringify(source)), size)
    assert.deepEqual(copy, source)
    copy.slices[0].center.x = 9
    assert.equal(source.slices[0].center.x, 4)
})

test('empty atlas document is valid', () => assert.deepEqual(newNine('atlas.png').slices, []))

for (const path of ['', '/atlas.png', '../atlas.png', 'images/../atlas.png', 'a\\b.png', 'https://example.org/a.png', './atlas.png']) {
    test(`reject non-Project atlas path ${JSON.stringify(path)}`, () => assert.throws(() => newNine(path)))
}

test('reject wrong format, version, missing fields and malformed slices', () => {
    for (const value of [null, {}, { ...doc(), version: 2 }, { ...doc(), format: 'other' }, { ...doc(), slices: {} }, { ...doc(), slices: [null] }]) assert.throws(() => validateNine(value))
})

test('reject duplicate or blank names', () => {
    const value = doc()
    value.slices.push(slice())
    assert.throws(() => validateNine(value), /Duplicate/)
    value.slices = [{ ...slice(), name: ' ' }]
    assert.throws(() => validateNine(value), /name/)
})

for (const rect of ['bounds', 'center']) for (const [key, value] of [['x', -1], ['y', 0.5], ['width', 0], ['height', NaN], ['width', Infinity], ['x', Number.MAX_SAFE_INTEGER + 1]]) {
    test(`reject invalid ${rect}.${key} ${value}`, () => {
        const document = doc()
        document.slices[0][rect][key] = value
        assert.throws(() => validateNine(document, size))
    })
}

test('center must fit bounds; bounds must fit decoded image', () => {
    const document = doc()
    document.slices[0].center.width = 30
    assert.throws(() => validateNine(document, size), /center/)
    assert.throws(() => validateNine(doc(), { width: 39, height: 96 }), /atlas/)
    assert.throws(() => validateNine(doc(), { width: 128, height: 43 }), /atlas/)
})

test('new slices normalize reverse drag, initialize center, and use unique names', () => {
    const bounds = nineRect({ x: 30, y: 40 }, { x: 10, y: 20 })
    const first = newSlice([], bounds), next = newSlice([first], bounds)
    assert.deepEqual(bounds, { x: 10, y: 20, width: 20, height: 20 })
    assert.equal(next.name, 'Slice 2')
    validateNine({ ...newNine('a.png'), slices: [first, next] }, size)
})

test('one-pixel slice has a valid one-pixel center', () => {
    const value = newSlice([], { x: 0, y: 0, width: 1, height: 1 })
    assert.deepEqual(value.center, value.bounds)
    validateNine({ ...newNine('a.png'), slices: [value] }, size)
})

test('inner coordinates are relative; handles include corners and edge midpoints', () => {
    assert.deepEqual(nineCenter(slice()), { x: 14, y: 25, width: 20, height: 12 })
    const handles = nineHandles(slice().bounds)
    assert.equal(handles.length, 8)
    assert.deepEqual(handles.find(h => h.edge === 'e'), { edge: 'e', x: 40, y: 32 })
})

test('nearest handle stays selectable for one-pixel bounds despite overlapping hit radii', () => {
    assert.equal(hitNineHandle({ x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 1 }, 6).edge, 'se')
    assert.equal(hitNineHandle({ x: 0, y: 0, width: 1, height: 1 }, { x: 50, y: 50 }, 6), null)
})

test('moving clamps to image edges and preserves center; input is immutable', () => {
    const original = slice()
    const moved = moveNineSlice(original, { x: 900, y: -900 }, size)
    assert.deepEqual(moved.bounds, { x: 98, y: 0, width: 30, height: 24 })
    assert.deepEqual(moved.center, original.center)
    assert.equal(original.bounds.x, 10)
})

test('outer resize preserves fixed borders', () => {
    const resized = resizeNineSlice(slice(), 'bounds', 'se', { x: 60, y: 70 }, size)
    assert.deepEqual(resized.bounds, { x: 10, y: 20, width: 50, height: 50 })
    assert.deepEqual(resized.center, { x: 4, y: 5, width: 40, height: 38 })
})

test('center resizing clamps to outer bounds and prevents inverted rectangles', () => {
    const resized = resizeNineSlice(slice(), 'center', 'nw', { x: 1000, y: 1000 }, size)
    assert.deepEqual(resized.center, { x: 23, y: 16, width: 1, height: 1 })
    const expanded = resizeNineSlice(slice(), 'center', 'se', { x: 1000, y: 1000 }, size)
    assert.deepEqual(expanded.center, { x: 4, y: 5, width: 26, height: 19 })
})

for (const target of ['bounds', 'center']) for (const edge of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    test(`${target} ${edge} resize remains valid across atlas limits and crossing`, () => {
        const original = slice()
        for (const x of [-900, 0, 15, 30, 127, 1000]) for (const y of [-900, 0, 26, 40, 95, 1000]) {
            const resized = resizeNineSlice(original, target, edge, { x, y }, size)
            validateNine({ ...newNine('a.png'), slices: [resized] }, size)
        }
        assert.deepEqual(original, slice())
    })
}
