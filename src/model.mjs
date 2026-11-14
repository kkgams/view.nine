// Pixel geometry and the versioned nine-slice document contract.
export function nineAssert(condition, message) {
    if (!condition) throw new Error(message)
}

export function validateNine(input, size = null) {
    nineAssert(input && input.format === 'gams.nine' && input.version === 1, 'Expected gams.nine version 1')
    nineAssert(typeof input.image === 'string' && input.image.trim().length > 0, 'Atlas path is required')
    nineAssert(!input.image.startsWith('/') && !input.image.includes('\\') && !input.image.split('/').some(p => p === '..' || p === '.' || p === '') && !input.image.includes(':'), 'Atlas must be a Project-relative path')
    nineAssert(Array.isArray(input.slices), 'Slices must be an array')
    const names = new Set()
    for (const slice of input.slices) {
        nineAssert(slice && typeof slice.name === 'string' && slice.name.trim().length > 0, 'Slice name is required')
        nineAssert(!names.has(slice.name), `Duplicate slice name: ${slice.name}`)
        names.add(slice.name)
        for (const key of ['bounds', 'center']) {
            const rect = slice[key]
            nineAssert(rect && ['x', 'y', 'width', 'height'].every(k => Number.isSafeInteger(rect[k])), `${slice.name}: ${key} must use integer pixels`)
            nineAssert(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0, `${slice.name}: ${key} must be positive and non-empty`)
        }
        const b = slice.bounds, c = slice.center
        nineAssert(c.x + c.width <= b.width && c.y + c.height <= b.height, `${slice.name}: center must fit inside bounds`)
        if (size) nineAssert(b.x + b.width <= size.width && b.y + b.height <= size.height, `${slice.name}: bounds exceed atlas`)
    }
    return structuredClone(input)
}

export function newNine(image) {
    return validateNine({ format: 'gams.nine', version: 1, image, slices: [] })
}

export function nineClamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

export function nineRect(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

export function newSlice(slices, bounds) {
    let i = 1
    while (slices.some(s => s.name === `Slice ${i}`)) i++
    const x = Math.floor(bounds.width / 3), y = Math.floor(bounds.height / 3)
    return { name: `Slice ${i}`, bounds: { ...bounds }, center: { x, y, width: Math.max(1, bounds.width - 2 * x), height: Math.max(1, bounds.height - 2 * y) } }
}

export function nineCenter(slice) {
    return { ...slice.center, x: slice.bounds.x + slice.center.x, y: slice.bounds.y + slice.center.y }
}

export function nineContains(rect, point) {
    return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height
}

export function nineHandles(rect) {
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(edge => ({
        edge,
        x: rect.x + (edge.includes('w') ? 0 : edge.includes('e') ? rect.width : rect.width / 2),
        y: rect.y + (edge.includes('n') ? 0 : edge.includes('s') ? rect.height : rect.height / 2),
    }))
}

export function hitNineHandle(rect, point, tolerance) {
    const handles = nineHandles(rect).map(handle => ({ ...handle, distance: Math.hypot(handle.x - point.x, handle.y - point.y) }))
    handles.sort((a, b) => a.distance - b.distance)
    return handles[0].distance <= tolerance ? handles[0] : null
}

// Stretch dividers span the complete outer box, not just the center rectangle.
export function hitNineDivider(slice, point, tolerance) {
    if (!nineContains(slice.bounds, point)) return null
    const center = nineCenter(slice)
    const nearest = candidates => candidates.sort((a, b) => a.distance - b.distance)[0]
    const vertical = nearest([{ edge: 'w', distance: Math.abs(point.x - center.x) }, { edge: 'e', distance: Math.abs(point.x - center.x - center.width) }])
    const horizontal = nearest([{ edge: 'n', distance: Math.abs(point.y - center.y) }, { edge: 's', distance: Math.abs(point.y - center.y - center.height) }])
    const edge = (horizontal.distance <= tolerance ? horizontal.edge : '') + (vertical.distance <= tolerance ? vertical.edge : '')
    return edge ? { edge, distance: Math.min(vertical.distance, horizontal.distance) } : null
}

export function resizeNineRect(rect, edge, point, limit) {
    let left = rect.x, top = rect.y, right = rect.x + rect.width, bottom = rect.y + rect.height
    if (edge.includes('w')) left = nineClamp(point.x, limit.x, right - 1)
    if (edge.includes('e')) right = nineClamp(point.x, left + 1, limit.x + limit.width)
    if (edge.includes('n')) top = nineClamp(point.y, limit.y, bottom - 1)
    if (edge.includes('s')) bottom = nineClamp(point.y, top + 1, limit.y + limit.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resizeNineSlice(slice, target, edge, point, size) {
    const result = structuredClone(slice)
    if (target === 'center') {
        const c = resizeNineRect(nineCenter(slice), edge, point, slice.bounds)
        result.center = { ...c, x: c.x - slice.bounds.x, y: c.y - slice.bounds.y }
    } else {
        nineAssert(target === 'bounds', 'Unknown resize target')
        result.bounds = resizeNineRect(slice.bounds, edge, point, { x: 0, y: 0, ...size })
        // Preserve fixed border widths where space permits, clamping to one stretch pixel.
        const b = result.bounds, c = slice.center
        const x = Math.min(c.x, b.width - 1), y = Math.min(c.y, b.height - 1)
        const right = slice.bounds.width - c.x - c.width, bottom = slice.bounds.height - c.y - c.height
        result.center = { x, y, width: Math.max(1, b.width - x - right), height: Math.max(1, b.height - y - bottom) }
    }
    return result
}

export function dragNineDivider(slice, edge, start, point, size) {
    const center = nineCenter(slice)
    return resizeNineSlice(slice, 'center', edge, {
        x: (edge.includes('w') ? center.x : center.x + center.width) + point.x - start.x,
        y: (edge.includes('n') ? center.y : center.y + center.height) + point.y - start.y,
    }, size)
}

export function deleteNineSlice(document, index, selected) {
    nineAssert(Number.isInteger(index) && index >= 0 && index < document.slices.length, 'Slice to delete must exist')
    const after = structuredClone(document)
    after.slices.splice(index, 1)
    return {
        document: after,
        selected: selected === index ? Math.min(index, after.slices.length - 1) : selected > index ? selected - 1 : selected,
    }
}

export function moveNineSlice(slice, delta, size) {
    const result = structuredClone(slice)
    result.bounds.x = nineClamp(slice.bounds.x + delta.x, 0, size.width - slice.bounds.width)
    result.bounds.y = nineClamp(slice.bounds.y + delta.y, 0, size.height - slice.bounds.height)
    return result
}
