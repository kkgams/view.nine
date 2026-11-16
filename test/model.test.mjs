import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNine, newNine, newSlice, nineRect, nineCenter, nineHandles, hitNineHandle, hitNineDivider, dragNineDivider, deleteNineSlice, resizeNineSlice, moveNineSlice } from '../src/model.mjs'

const size = { width: 128, height: 96 }
const slice = () => ({ name: 'Panel', type: 'nine', bounds: { x: 10, y: 20, width: 30, height: 24 }, center: { x: 4, y: 5, width: 20, height: 12 } })
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

for (const [edge, point] of [
    ['w', { x: 14, y: 22 }], ['e', { x: 34, y: 42 }],
    ['n', { x: 38, y: 25 }], ['s', { x: 12, y: 37 }],
]) {
    test(`blue ${edge} divider can be grabbed outside the center rectangle`, () => {
        assert.equal(hitNineDivider(slice(), point, 1).edge, edge)
    })
}

for (const [edge, point] of [
    ['nw', { x: 14, y: 25 }], ['ne', { x: 34, y: 25 }],
    ['sw', { x: 14, y: 37 }], ['se', { x: 34, y: 37 }],
]) {
    test(`blue divider intersection ${edge} selects both axes`, () => {
        assert.equal(hitNineDivider(slice(), point, 1).edge, edge)
    })
}

test('blue divider hit regions stay inside the slice and obey zoom-scaled tolerance', () => {
    assert.equal(hitNineDivider(slice(), { x: 14, y: 19 }, 6), null)
    assert.equal(hitNineDivider(slice(), { x: 41, y: 25 }, 6), null)
    assert.equal(hitNineDivider(slice(), { x: 24, y: 31 }, 1), null)
    assert.equal(hitNineDivider(slice(), { x: 15, y: 22 }, 1).edge, 'w')
    assert.equal(hitNineDivider(slice(), { x: 15, y: 22 }, 0.5), null)
})

for (const [edge, point, expected] of [
    ['w', { x: 17, y: 22 }, { x: 7, y: 5, width: 17, height: 12 }],
    ['e', { x: 38, y: 42 }, { x: 4, y: 5, width: 24, height: 12 }],
    ['n', { x: 38, y: 28 }, { x: 4, y: 8, width: 20, height: 9 }],
    ['s', { x: 12, y: 40 }, { x: 4, y: 5, width: 20, height: 15 }],
]) {
    test(`dragging blue ${edge} divider changes only that border`, () => {
        const original = slice()
        const result = resizeNineSlice(original, 'center', edge, point, size)
        assert.deepEqual(result.center, expected)
        assert.deepEqual(result.bounds, original.bounds)
        assert.deepEqual(original, slice())
    })
}

test('nearby divider grab preserves its initial offset and ignores motion on the other axis', () => {
    const original = slice(), start = { x: 15, y: 22 }
    assert.deepEqual(dragNineDivider(original, 'w', start, start, size), original)
    const result = dragNineDivider(original, 'w', start, { x: 18, y: 30 }, size)
    assert.deepEqual(result.center, { x: 7, y: 5, width: 17, height: 12 })
    assert.deepEqual(original, slice())
})

test('intersection drag moves both dividers and clamps them before crossing', () => {
    const original = slice(), start = { x: 15, y: 24 }
    const result = dragNineDivider(original, 'nw', start, { x: 1000, y: 1000 }, size)
    assert.deepEqual(result.center, { x: 23, y: 16, width: 1, height: 1 })
    assert.deepEqual(result.bounds, original.bounds)
    validateNine({ ...newNine('a.png'), slices: [result] }, size)
})

for (const [deleted, selected, expected] of [[0, 1, 0], [2, 0, 0], [1, 1, 1], [2, 2, 1], [0, -1, -1]]) {
    test(`delete slice ${deleted} with selection ${selected} preserves the expected selection`, () => {
        const original = { ...doc(), slices: ['A', 'B', 'C'].map(name => ({ ...slice(), name })) }
        const result = deleteNineSlice(original, deleted, selected)
        assert.equal(result.selected, expected)
        assert.deepEqual(result.document.slices.map(s => s.name), ['A', 'B', 'C'].filter((_, i) => i !== deleted))
        if (selected >= 0 && selected !== deleted) assert.equal(result.document.slices[expected].name, original.slices[selected].name)
        assert.deepEqual(original.slices.map(s => s.name), ['A', 'B', 'C'])
        validateNine(result.document, size)
    })
}

test('deleting the only slice clears selection and rejects nonexistent rows', () => {
    const result = deleteNineSlice(doc(), 0, 0)
    assert.deepEqual(result.document.slices, [])
    assert.equal(result.selected, -1)
    for (const index of [-1, 1, 0.5]) assert.throws(() => deleteNineSlice(doc(), index, 0), /must exist/)
})
