import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sliceAxes, validateNine, newNine, newSlice, convertNineSlice, nineCenter, nineHandles, nineStretchHandles, hitNineStretchHandle, hitNineDivider, resizeNineSlice, dragNineDivider, moveNineSlice } from '../src/model.mjs'

const types = ['region', 'horizontal', 'vertical', 'nine']
const edges = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const activeEdges = { region: [], horizontal: ['e', 'w'], vertical: ['n', 's'], nine: edges }
const bounds = { x: 10, y: 20, width: 30, height: 24 }
const size = { width: 128, height: 96 }
const check = value => validateNine({ ...newNine('atlas.png'), slices: [value] }, size)
const custom = type => convertNineSlice({ name: 'Panel', type: 'nine', bounds: { ...bounds }, center: { x: 4, y: 5, width: 20, height: 12 } }, type)

for (const type of types) {
    test(`${type}: creation and JSON roundtrip use canonical schema`, () => {
        const value = newSlice([], bounds, type)
        assert.equal(value.type, type)
        assert.deepEqual(sliceAxes(type), { x: type === 'horizontal' || type === 'nine', y: type === 'vertical' || type === 'nine' })
        assert.deepEqual(check(JSON.parse(JSON.stringify(value))).slices[0], value)
        assert.deepEqual(value.bounds, bounds)
        assert.notEqual(value.bounds, bounds)
        if (type === 'region') assert.equal('center' in value, false)
        else assert.deepEqual(value.center, {
            x: sliceAxes(type).x ? 10 : 0, y: sliceAxes(type).y ? 8 : 0,
            width: sliceAxes(type).x ? 10 : 30, height: sliceAxes(type).y ? 8 : 24,
        })
        assert.equal(newSlice([value], bounds, type).name, 'Slice 2')
    })

    test(`${type}: only active center handles are hittable`, () => {
        const value = custom(type), handles = nineStretchHandles(value)
        assert.deepEqual(handles.map(h => h.edge), activeEdges[type])
        for (const handle of handles) {
            assert.equal(hitNineStretchHandle(value, handle, 0).edge, handle.edge)
            assert.equal(hitNineStretchHandle(value, { x: handle.x + 0.5, y: handle.y }, 0.5).edge, handle.edge)
        }
        assert.equal(hitNineStretchHandle(value, { x: -100, y: -100 }, 6), null)
        assert.equal(nineHandles(value.bounds).length, 8)
        if (type === 'region') {
            assert.throws(() => nineCenter(value), /no stretch center/)
            assert.equal(hitNineStretchHandle(value, { x: 10, y: 20 }, 100), null)
        } else {
            for (const handle of nineHandles(nineCenter(value)).filter(h => !activeEdges[type].includes(h.edge))) {
                assert.equal(hitNineStretchHandle(value, handle, 0), null)
            }
        }
    })

    test(`${type}: bounds resize supports every edge and preserves inactive spans`, () => {
        const value = custom(type), original = structuredClone(value)
        for (const edge of edges) for (const point of [{ x: -900, y: -900 }, { x: 900, y: 900 }, { x: 23, y: 33 }]) {
            const resized = resizeNineSlice(value, 'bounds', edge, point, size)
            check(resized)
            if (type === 'region') assert.equal('center' in resized, false)
            else {
                const axes = sliceAxes(type)
                if (!axes.x) assert.deepEqual([resized.center.x, resized.center.width], [0, resized.bounds.width])
                if (!axes.y) assert.deepEqual([resized.center.y, resized.center.height], [0, resized.bounds.height])
            }
        }
        assert.deepEqual(value, original)
        check(moveNineSlice(value, { x: -900, y: 900 }, size))
    })

    test(`${type}: center resize rejects inactive edges and clamps active edges`, () => {
        const value = custom(type), original = structuredClone(value)
        for (const edge of [...edges, '', 'invalid']) {
            if (!activeEdges[type].includes(edge)) {
                assert.throws(() => resizeNineSlice(value, 'center', edge, { x: 0, y: 0 }, size), /Inactive|invalid/)
                assert.throws(() => dragNineDivider(value, edge, { x: 0, y: 0 }, { x: 5, y: 5 }, size))
            } else for (const point of [{ x: -900, y: -900 }, { x: 900, y: 900 }]) {
                const resized = resizeNineSlice(value, 'center', edge, point, size)
                check(resized)
                assert.deepEqual(resized.bounds, value.bounds)
                assert.deepEqual(dragNineDivider(value, edge, point, point, size), value)
            }
        }
        assert.deepEqual(value, original)
    })

    test(`${type}: one-pixel bounds stay valid through conversion, handles, and resize`, () => {
        const value = newSlice([], { x: 10, y: 20, width: 1, height: 1 }, type)
        check(value)
        for (const targetType of types) check(convertNineSlice(value, targetType))
        for (const handle of nineStretchHandles(value)) {
            assert.equal(hitNineStretchHandle(value, handle, 6).edge, handle.edge)
            check(resizeNineSlice(value, 'center', handle.edge, { x: 900, y: -900 }, size))
        }
        for (const handle of nineHandles(value.bounds)) check(resizeNineSlice(value, 'bounds', handle.edge, { x: -900, y: -900 }, size))
        if (type === 'region') assert.equal(hitNineDivider(value, { x: 10, y: 20 }, 6), null)
        else {
            const edge = hitNineDivider(value, { x: 11, y: 21 }, 6).edge
            assert.equal(edge, type === 'horizontal' ? 'e' : type === 'vertical' ? 's' : 'se')
        }
    })
}

for (const from of types) for (const to of types) {
    test(`conversion ${from} to ${to} preserves shared axes and initializes new axes in thirds`, () => {
        const value = custom(from), original = structuredClone(value)
        const result = convertNineSlice(value, to)
        assert.equal(result.type, to)
        assert.equal(result.name, value.name)
        assert.deepEqual(result.bounds, value.bounds)
        assert.notEqual(result.bounds, value.bounds)
        if (to === 'region') assert.equal('center' in result, false)
        else {
            const before = sliceAxes(from), after = sliceAxes(to)
            for (const [axis, span] of [['x', 'width'], ['y', 'height']]) {
                const offset = Math.floor(bounds[span] / 3)
                assert.equal(result.center[axis], !after[axis] ? 0 : before[axis] ? value.center[axis] : offset)
                assert.equal(result.center[span], !after[axis] ? bounds[span] : before[axis] ? value.center[span] : Math.max(1, bounds[span] - 2 * offset))
            }
        }
        check(result)
        assert.deepEqual(value, original)
    })
}

test('explicit types are mandatory without legacy inference or aliases', () => {
    assert.equal(newSlice([], bounds).type, 'nine')
    for (const type of [undefined, null, '', 'Nine', '3-slice', 1, {}, ['nine']]) {
        assert.throws(() => sliceAxes(type), /type/)
        assert.throws(() => check({ ...custom('nine'), type }), /type/)
        assert.throws(() => convertNineSlice(custom('nine'), type), /type/)
    }
    const legacy = custom('nine')
    delete legacy.type
    assert.throws(() => check(legacy), /type/)
    assert.throws(() => convertNineSlice(legacy, 'nine'), /type/)
    assert.throws(() => newSlice([], bounds, 'unknown'), /type/)
})

test('region forbids any center; stretch types require a complete center', () => {
    for (const center of [undefined, null, {}, custom('nine').center]) assert.throws(() => check({ ...custom('region'), center }), /omit center/)
    for (const type of ['horizontal', 'vertical', 'nine']) for (const center of [undefined, null, {}, { x: 0, y: 0, width: 1 }]) {
        assert.throws(() => check({ ...custom(type), center }), /center/)
    }
    assert.throws(() => check({ ...custom('region'), bounds: { ...bounds, width: 0 } }), /bounds/)
    assert.throws(() => validateNine({ ...newNine('a.png'), slices: [custom('region')] }, { width: 1, height: 1 }), /atlas/)
})

test('three-slice inactive axis must span the complete bounds', () => {
    for (const [type, axis, span] of [['horizontal', 'y', 'height'], ['vertical', 'x', 'width']]) {
        const value = custom(type)
        assert.throws(() => check({ ...value, center: { ...value.center, [axis]: 1, [span]: bounds[span] - 1 } }), /inactive/)
        assert.throws(() => check({ ...value, center: { ...value.center, [span]: bounds[span] - 1 } }), /inactive/)
    }
})

test('divider hit testing excludes inactive axes, including tolerance distance', () => {
    const h = custom('horizontal'), v = custom('vertical'), r = custom('region')
    assert.equal(hitNineDivider(r, { x: 14, y: 25 }, 100), null)
    assert.equal(hitNineDivider(h, { x: 24, y: 20 }, 1), null)
    assert.equal(hitNineDivider(v, { x: 10, y: 31 }, 1), null)
    assert.deepEqual(hitNineDivider(h, { x: 15, y: 20 }, 1), { edge: 'w', distance: 1 })
    assert.deepEqual(hitNineDivider(v, { x: 10, y: 26 }, 1), { edge: 'n', distance: 1 })
    assert.equal(hitNineDivider(h, { x: 15, y: 20 }, 0.5), null)
    assert.equal(hitNineDivider(v, { x: 10, y: 26 }, 0.5), null)
    assert.equal(hitNineDivider(h, { x: 14, y: 19 }, 6), null)
    assert.equal(hitNineDivider(v, { x: 9, y: 25 }, 6), null)
})

test('three-slice bounds growth preserves active borders and extends inactive span', () => {
    assert.deepEqual(resizeNineSlice(custom('horizontal'), 'bounds', 'se', { x: 60, y: 70 }, size).center, { x: 4, y: 0, width: 40, height: 50 })
    assert.deepEqual(resizeNineSlice(custom('vertical'), 'bounds', 'se', { x: 60, y: 70 }, size).center, { x: 0, y: 5, width: 50, height: 38 })
})
