import { runtime, unwrap } from '/core/runtime.js'
import { ViewCanvasBase } from '/util/view-canvas-base.js'
import { UndoHistory } from '/util/undo.js'

const NINE_TEXT = 'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'

export class ViewNine extends ViewCanvasBase {
    constructor() {
        super()
        this.document = null
        this.image = null
        this.path = ''
        this.saved = ''
        this.selected = -1
        this.tool = 'select'
        this.gesture = null
        this.history = new UndoHistory()
        this.busy = false
        this.loadGeneration = 0
    }

    connectedCallback() {
        this.innerHTML = `
            <canvas data-element="canvas" aria-label="Atlas and nine-slice editor"></canvas>
            <aside>
                <fieldset><legend>Slices</legend>
                    <table class="compact-actions" aria-label="Slices"><tbody data-element="slices"></tbody></table>
                </fieldset>
                <form data-element="properties"><fieldset disabled><legend>Slice properties</legend>
                    <label>Name <input type="text" data-field="name" required ${NINE_TEXT}></label>
                    <fieldset><legend>Atlas bounds (pixels)</legend>
                        ${this.rectFields('bounds')}
                    </fieldset>
                    <fieldset><legend>Stretch center (relative to bounds)</legend>
                        ${this.rectFields('center')}
                    </fieldset>
                </fieldset></form>
            </aside>
            <footer><output data-element="status">Choose an atlas to begin.</output>
                <button type="button" data-action="discard" hidden>Discard changes</button>
            </footer>`
        super.connectedCallback()
        this.addEventListener('click', this.handleClick = event => {
            const button = event.target.closest('button[data-action]')
            if (button) void this.perform(() => this.action(button.dataset.action))
        })
        const rows = this.querySelector('[data-element="slices"]')
        rows.addEventListener('click', event => {
            const row = event.target.closest('tr[data-index]')
            if (!row) return
            const button = event.target.closest('button[data-action="delete-slice"]')
            if (button) {
                event.stopPropagation()
                if (!this.busy) {
                    const index = Number(row.dataset.index), restoreFocus = row.contains(document.activeElement)
                    void this.perform(() => this.deleteSlice(index)).then(() => {
                        if (!restoreFocus) return
                        const next = this.querySelector(`tr[data-index="${Math.min(index, this.document.slices.length - 1)}"] button`)
                        if (next) next.focus()
                        else this.focus()
                    })
                }
                return
            }
            if (!this.busy) this.selectSlice(Number(row.dataset.index), true)
        })
        rows.addEventListener('keydown', event => {
            const row = event.target.closest('tr[data-index]')
            if (!row || this.busy || event.target.closest('button')) return
            const index = Number(row.dataset.index)
            const destinations = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: this.document.slices.length - 1, Enter: index, ' ': index }
            if (!Object.hasOwn(destinations, event.key)) return
            event.preventDefault()
            event.stopPropagation()
            this.selectSlice(nineClamp(destinations[event.key], 0, this.document.slices.length - 1), true)
        })
        this.querySelector('form').addEventListener('submit', event => event.preventDefault())
        this.querySelector('form').addEventListener('change', event => {
            if (!event.target.matches('input[data-field]')) return
            const input = { dataset: { field: event.target.dataset.field }, value: event.target.value, valueAsNumber: event.target.valueAsNumber }
            void this.perform(() => this.editProperty(input))
        })
        this.render()
        if (!this.document && this.dataset.source) void this.perform(() => this.openPath(this.dataset.source))
    }

    disconnectedCallback() {
        this.finishGesture()
        this.removeEventListener('click', this.handleClick)
        // Layout moves may reconnect this same View. Retain its bitmap and unsaved document;
        // replacement closes the bitmap and unreachable Views release it through GC.
        super.disconnectedCallback()
    }

    rectFields(prefix) {
        return ['x', 'y', 'width', 'height'].map(field => `<label>${field} <input type="number" data-field="${prefix}.${field}" step="1" min="${field === 'width' || field === 'height' ? 1 : 0}" required ${NINE_TEXT}></label>`).join('')
    }

    createHeaderControlsElement() {
        const root = document.createElement('div')
        const groups = [
            ['file-actions', [['new', 'New from atlas', 'note_add'], ['open', 'Open JSON', 'folder_open'], ['save', 'Save', 'save'], ['save-as', 'Save as', 'save_as']]],
            ['tool-actions', [['select', 'Select / move', 'select_all'], ['center', 'Stretch center', 'grid_on'], ['draw', 'Draw slice', 'crop_square']]],
            ['edit-actions', [['undo', 'Undo', 'undo'], ['redo', 'Redo', 'redo']]],
            ['view-actions', [['zoom-in', 'Zoom in', 'zoom_in'], ['zoom-out', 'Zoom out', 'zoom_out'], ['zoom-fit', 'Fit atlas', 'fit_screen']]],
        ]
        for (const [name, actions] of groups) {
            const group = document.createElement('div')
            group.setAttribute('role', 'buttongroup')
            group.dataset.element = name
            for (const [action, label, symbol] of actions) {
                const button = document.createElement('button')
                button.type = 'button'
                button.dataset.action = action
                button.setAttribute('aria-label', label)
                const icon = document.createElement('i')
                icon.setAttribute('aria-hidden', 'true')
                icon.textContent = symbol
                button.append(icon)
                if (action === 'save') button.classList.add('accent')
                button.addEventListener('pointerenter', () => {
                    const rect = button.getBoundingClientRect()
                    void runtime.call('ui.tooltip.tip', { content: label,
                        anchor: { kind: 'aabb', x: rect.x, y: rect.y, width: rect.width, height: rect.height } }).then(unwrap)
                })
                button.addEventListener('click', () => void this.perform(() => this.action(action)))
                group.append(button)
            }
            root.append(group)
        }
        return root
    }

    async perform(operation) {
        if (this.busy) return
        this.finishGesture()
        this.busy = true
        this.render()
        try {
            await operation()
        } catch (error) {
            // UI boundary: surface filesystem, decoding and validation failures; keep current document.
            this.querySelector('[data-element="status"]').textContent = error.message
            await runtime.call('ui.toast.error', { message: error.message })
        } finally {
            this.busy = false
            this.render()
        }
    }

    action(action) {
        const actions = {
            new: () => this.new(), open: () => this.open(), save: () => this.save(), 'save-as': () => this.saveAs(),
            select: () => { this.tool = 'select' }, center: () => { this.tool = 'center' },
            draw: () => { this.tool = 'draw' },
            undo: () => this.undo(), redo: () => this.redo(),
            'zoom-in': () => this.zoomIn(), 'zoom-out': () => this.zoomOut(), 'zoom-fit': () => this.zoomFit(),
            discard: () => this.discard(),
        }
        nineAssert(Object.hasOwn(actions, action), `Unknown action: ${action}`)
        return actions[action]()
    }

    get size() {
        nineAssert(this.image, 'Load an atlas first')
        return { width: this.image.width, height: this.image.height }
    }

    get dirty() {
        return this.document !== null && JSON.stringify(this.document) !== this.saved
    }

    requireClean() {
        nineAssert(!this.dirty, 'Save or discard changes before opening another document.')
    }

    async choose(mode, title, filter, defaultName = 'atlas.nine.json') {
        const payload = unwrap(await runtime.call('ui.popup.open', {
            tag: 'view-files', title, size: 'medium', props: { mode, filter, defaultName },
        }))
        if (payload === null || payload === undefined || payload.cancelled) return null
        if (mode === 'saver') {
            nineAssert(typeof payload.path === 'string' && payload.path.length > 0, 'File saver returned no path')
            return payload.path
        }
        const selection = Array.isArray(payload.selection) ? payload.selection[0] : payload.selection
        nineAssert(selection && typeof selection.path === 'string' && selection.path.length > 0, 'File chooser returned no path')
        return selection.path
    }

    async new() {
        this.requireClean()
        const image = await this.choose('chooser', 'Choose image atlas', '*.png,*.jpg,*.jpeg,*.webp')
        if (image === null) return
        await this.loadDocument(newNine(image), '')
    }

    async open(input) {
        this.requireClean()
        if (input && typeof input.path === 'string') return this.openPath(input.path)
        const path = await this.choose('chooser', 'Open nine-slice JSON', '*.nine.json,*.json')
        if (path !== null) await this.openPath(path)
    }

    async openPath(path) {
        this.requireClean()
        const text = unwrap(await runtime.invoke('fs/fs::read-text', path))
        await this.loadDocument(validateNine(JSON.parse(text)), path)
    }

    async loadDocument(document, path) {
        const generation = ++this.loadGeneration
        const bytes = new Uint8Array(unwrap(await runtime.invoke('fs/fs::read-file', document.image)))
        const image = await createImageBitmap(new Blob([bytes]))
        try {
            validateNine(document, { width: image.width, height: image.height })
        } catch (error) {
            image.close()
            throw error
        }
        if (generation !== this.loadGeneration || !this.isConnected) {
            image.close()
            return
        }
        if (this.image) this.image.close()
        this.image = image
        this.document = document
        this.path = path
        this.saved = JSON.stringify(document)
        this.history = new UndoHistory()
        this.selected = document.slices.length ? 0 : -1
        this.tool = 'select'
        if (path) this.dataset.source = path
        else delete this.dataset.source
        this.setData(document)
        this.render()
    }

    async save() {
        nineAssert(this.document, 'Load an atlas first')
        if (!this.path) return this.saveAs()
        await this.saveToPath(this.path)
    }

    async saveAs() {
        nineAssert(this.document, 'Load an atlas first')
        const path = await this.choose('saver', 'Save nine-slice JSON', '*.nine.json,*.json', this.path ? this.path.split('/').pop() : 'atlas.nine.json')
        if (path !== null) await this.saveToPath(path)
    }

    async saveToPath(path) {
        this.finishGesture()
        const document = validateNine(this.document, this.size)
        const snapshot = JSON.stringify(document)
        const temporary = `${path}.${crypto.randomUUID()}.tmp`
        try {
            unwrap(await runtime.invoke('fs/fs::write-text', temporary, JSON.stringify(document, null, 2) + '\n'))
            unwrap(await runtime.invoke('fs/fs::rename', temporary, path))
        } catch (error) {
            throw new Error(`Save failed; previous destination was not replaced. Temporary data may remain at ${temporary}: ${error.message}`, { cause: error })
        }
        this.saved = snapshot
        this.path = path
        this.dataset.source = path
        this.render()
    }

    commit(before, after, selected = this.selected) {
        validateNine(after, this.size)
        if (JSON.stringify(before) === JSON.stringify(after)) return
        const previousSelection = this.selected
        const apply = (document, index) => {
            this.document = structuredClone(document)
            this.selected = index
            this.render()
        }
        this.history.execute({ undo: () => apply(before, previousSelection), redo: () => apply(after, selected) })
    }

    editProperty(input) {
        nineAssert(this.selected >= 0, 'Select a slice first')
        const after = structuredClone(this.document), slice = after.slices[this.selected]
        const field = input.dataset.field
        if (field === 'name') slice.name = input.value
        else {
            const [rect, key] = field.split('.')
            slice[rect][key] = input.valueAsNumber
        }
        this.commit(this.document, after)
    }

    selectSlice(index, focus = false) {
        this.finishGesture()
        this.selected = index
        this.render()
        if (focus) this.querySelector(`tr[data-index="${index}"]`).focus()
    }

    deleteSelected() {
        if (this.selected >= 0) this.deleteSlice(this.selected)
    }

    deleteSlice(index) {
        const after = deleteNineSlice(this.document, index, this.selected)
        this.commit(this.document, after.document, after.selected)
    }

    undo() { this.finishGesture(); this.history.undo(); this.render() }
    redo() { this.finishGesture(); this.history.redo(); this.render() }
    discard() {
        nineAssert(this.saved, 'No document to restore')
        this.document = JSON.parse(this.saved)
        this.history = new UndoHistory()
        this.selected = this.document.slices.length ? 0 : -1
        this.render()
    }

    render() {
        if (!this.canvas) return
        const rows = this.querySelector('[data-element="slices"]')
        const focused = rows.contains(document.activeElement) ? document.activeElement.closest('tr[data-index]').dataset.index : null
        rows.replaceChildren()
        if (this.document) this.document.slices.forEach((slice, index) => {
            const row = document.createElement('tr'), cell = document.createElement('td')
            row.dataset.index = index
            row.setAttribute('aria-selected', String(index === this.selected))
            row.setAttribute('aria-disabled', String(this.busy))
            row.tabIndex = !this.busy && (index === this.selected || (this.selected < 0 && index === 0)) ? 0 : -1
            cell.textContent = slice.name
            const actions = document.createElement('td'), remove = document.createElement('button'), icon = document.createElement('i')
            remove.type = 'button'
            remove.dataset.action = 'delete-slice'
            remove.setAttribute('aria-label', `Delete ${slice.name}`)
            icon.setAttribute('aria-hidden', 'true')
            icon.textContent = 'delete'
            remove.append(icon)
            actions.append(remove)
            row.append(cell, actions); rows.append(row)
        })
        if (focused !== null) {
            const row = rows.querySelector(`tr[data-index="${focused}"]`)
            if (row && !this.busy) row.focus()
        }
        const active = this.document && this.selected >= 0 ? this.document.slices[this.selected] : null
        this.querySelector('form > fieldset').disabled = !active || this.busy
        for (const input of this.querySelectorAll('input[data-field]')) {
            const [key, component] = input.dataset.field.split('.')
            input.value = active ? (component ? active[key][component] : active[key]) : ''
        }
        for (const root of [this, this._headerControlsElement]) {
            if (!root) continue
            for (const button of root.querySelectorAll('button[data-action]')) {
                const action = button.dataset.action
                button.disabled = this.busy || (!this.document && !['new', 'open'].includes(action)) || (action === 'undo' && !this.history.canUndo()) || (action === 'redo' && !this.history.canRedo())
                if (['select', 'center', 'draw'].includes(action)) button.setAttribute('aria-pressed', String(this.tool === action))
            }
        }
        this.querySelector('[data-action="discard"]').hidden = !this.dirty
        this.querySelector('[data-element="status"]').textContent = this.document
            ? `${this.path || 'Unsaved JSON'}${this.dirty ? ' *' : ''} · ${this.document.image} · ${this.image.width} × ${this.image.height} · ${this.tool === 'draw' ? 'Drag to create slice' : this.tool === 'center' ? 'Drag blue lines or cyan handles to set stretch center' : 'Drag boxes to move, yellow handles to resize, or blue lines to adjust stretch center'}`
            : 'Choose an atlas to begin.'
        this.draw()
    }

    calculateContentBounds() {
        return { minX: 0, minY: 0, maxX: this.image ? this.image.width : 0, maxY: this.image ? this.image.height : 0 }
    }

    drawContent(ctx) {
        if (!this.image) return
        ctx.imageSmoothingEnabled = false
        ctx.fillStyle = '#404040'
        ctx.fillRect(0, 0, this.image.width, this.image.height)
        ctx.drawImage(this.image, 0, 0)
        this.document.slices.forEach((slice, index) => {
            const active = index === this.selected, b = slice.bounds, c = nineCenter(slice)
            ctx.lineWidth = 1 / this.scale
            ctx.strokeStyle = active ? '#ffcc66' : '#ffffff'
            ctx.strokeRect(b.x, b.y, b.width, b.height)
            ctx.fillStyle = active ? '#ffcc661a' : '#ffffff08'
            ctx.fillRect(b.x, b.y, b.width, b.height)
            ctx.strokeStyle = '#33ddff'
            ctx.beginPath()
            for (const x of [c.x, c.x + c.width]) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.height) }
            for (const y of [c.y, c.y + c.height]) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.width, y) }
            ctx.stroke()
            if (active) for (const [rect, color] of [this.tool === 'center' ? [c, '#33ddff'] : [b, '#ffcc66']]) {
                for (const handle of nineHandles(rect)) {
                    const r = 3 / this.scale
                    ctx.fillStyle = color
                    ctx.fillRect(handle.x - r, handle.y - r, r * 2, r * 2)
                    ctx.strokeStyle = '#000000'
                    ctx.strokeRect(handle.x - r, handle.y - r, r * 2, r * 2)
                }
            }
        })
        if (this.gesture && this.gesture.kind === 'draw') {
            const b = nineRect(this.gesture.start, this.gesture.point)
            ctx.strokeStyle = '#ffcc66'; ctx.lineWidth = 1 / this.scale
            ctx.strokeRect(b.x, b.y, b.width, b.height)
        }
    }

    pixelPoint(event) {
        const p = this.getWorldPoint(event.clientX, event.clientY), size = this.size
        return { x: nineClamp(Math.round(p.x), 0, size.width), y: nineClamp(Math.round(p.y), 0, size.height) }
    }

    onCanvasMouseDown(event) {
        if (event.button !== 0 || !this.image || this.busy) return
        this.focus()
        const point = this.pixelPoint(event), before = structuredClone(this.document)
        const raw = this.getWorldPoint(event.clientX, event.clientY)
        if (!nineContains({ x: 0, y: 0, ...this.size }, raw)) return
        if (this.tool === 'draw') {
            this.gesture = { kind: 'draw', start: point, point, before }
        } else {
            const slice = this.document.slices[this.selected]
            if (slice) {
                const target = this.tool === 'center' ? 'center' : 'bounds'
                const rect = target === 'center' ? nineCenter(slice) : slice.bounds
                const handle = hitNineHandle(rect, raw, 6 / this.scale)
                const divider = hitNineDivider(slice, raw, 6 / this.scale)
                if (handle && (!divider || handle.distance <= divider.distance)) {
                    this.gesture = { kind: 'resize', target, edge: handle.edge, slice: structuredClone(slice), before, start: point }
                    return
                }
                if (divider) {
                    this.gesture = { kind: 'divider', edge: divider.edge, slice: structuredClone(slice), before, start: point }
                    return
                }
            }
            this.selected = this.document.slices.findLastIndex(s => nineContains(s.bounds, raw))
            if (this.selected >= 0) this.gesture = { kind: 'move', start: point, before, slice: structuredClone(this.document.slices[this.selected]) }
        }
        this.render()
    }

    onCanvasMouseMove(event) {
        if (!this.gesture) return
        if (!(event.buttons & 1)) { this.finishGesture(); return }
        const point = this.pixelPoint(event), gesture = this.gesture
        if (gesture.kind === 'draw') gesture.point = point
        else if (gesture.kind === 'move') this.document.slices[this.selected] = moveNineSlice(gesture.slice, { x: point.x - gesture.start.x, y: point.y - gesture.start.y }, this.size)
        else if (gesture.kind === 'divider') this.document.slices[this.selected] = dragNineDivider(gesture.slice, gesture.edge, gesture.start, point, this.size)
        else this.document.slices[this.selected] = resizeNineSlice(gesture.slice, gesture.target, gesture.edge, point, this.size)
        this.draw()
    }

    onCanvasMouseUp(event) {
        if (event.button !== 0) return
        if (this.gesture) this.onCanvasMouseMove({ clientX: event.clientX, clientY: event.clientY, buttons: 1 })
        this.finishGesture()
    }
    onCanvasMouseLeave() { this.finishGesture() }

    finishGesture() {
        if (!this.gesture) return
        const gesture = this.gesture
        this.gesture = null
        const after = structuredClone(this.document)
        let selected = this.selected
        if (gesture.kind === 'draw') {
            const bounds = nineRect(gesture.start, gesture.point)
            if (bounds.width && bounds.height) {
                after.slices.push(newSlice(after.slices, bounds))
                selected = after.slices.length - 1
                this.tool = 'select'
            }
        }
        this.document = gesture.before
        this.commit(gesture.before, after, selected)
        this.render()
    }

    _onKeyDown(event) {
        if (event.target.closest('input, textarea, select, button')) return
        if (event.key === 'Escape' && this.gesture) {
            this.document = this.gesture.before; this.gesture = null; this.render(); return
        }
        if (event.key === ' ') this.finishGesture()
        super._onKeyDown(event)
    }
    _onKeyUp(event) {
        if (event.target.closest('input, textarea, select, button')) return
        super._onKeyUp(event)
    }
}

customElements.define('view-nine', ViewNine)
