/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Live formatting in the message field, as WhatsApp does: while typing **bold**, *italic*,
 * ~strike~ or `code`, the text already shows the way it will be sent, with the markers
 * still visible but faded.
 *
 * The field (NcRichContenteditable) reads its value by stripping every tag from its HTML,
 * so wrapping the text in styling spans changes nothing in what is sent. Only text nodes
 * outside mentions are touched, and the caret is put back where it was.
 */

const FIELD = '.rich-contenteditable__input'
const SPAN = 'tg-md'

type Kind = 'bold' | 'italic' | 'strike' | 'code' | 'pre'

interface Token { start: number, end: number, kind: Kind, marker: number }

/** Inline patterns, in the order the message renderer gives them precedence */
const PATTERNS: { kind: Kind, re: RegExp }[] = [
	{ kind: 'pre', re: /```[^\n]*\n[\s\S]*?\n```|```[^`\n]+```/g },
	{ kind: 'code', re: /`[^`\n]+`/g },
	{ kind: 'bold', re: /(\*\*|__)(?=\S)[^\n]*?\S\1/g },
	{ kind: 'strike', re: /(~~?)(?=[^\s~])[^\n~]*?[^\s~]\1(?!~)/g },
	// An underscore inside a word (snake_case) is not formatting
	{ kind: 'italic', re: /\*(?=[^\s*])[^\n*]*?[^\s*]\*(?!\*)|(?<![\p{L}\p{N}_])_(?=[^\s_])[^\n_]*?[^\s_]_(?![\p{L}\p{N}_])/gu },
]

/**
 * Find the formatted parts of a text, without overlaps
 *
 * @param text - Text of one text node
 */
function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	const taken = (start: number, end: number) => tokens.some((t) => start < t.end && end > t.start)
	for (const { kind, re } of PATTERNS) {
		re.lastIndex = 0
		for (const match of text.matchAll(re)) {
			const start = match.index!
			const end = start + match[0].length
			if (taken(start, end)) {
				continue
			}
			const marker = kind === 'pre' ? 3 : kind === 'bold' ? 2 : kind === 'strike' ? (match[1]?.length ?? 1) : 1
			tokens.push({ start, end, kind, marker })
		}
	}
	return tokens.sort((a, b) => a.start - b.start)
}

/**
 * Whether a node belongs to a mention or another non-editable piece
 *
 * @param node - Node in the field
 * @param field - The field
 */
function isLocked(node: Node, field: HTMLElement): boolean {
	for (let n: Node | null = node.parentNode; n && n !== field; n = n.parentNode) {
		if (n instanceof HTMLElement && n.getAttribute('contenteditable') === 'false') {
			return true
		}
	}
	return false
}

/**
 * Caret position as a number of characters from the start of the field
 *
 * @param field - The field
 */
function caretOffset(field: HTMLElement): number | null {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0 || !selection.isCollapsed || !field.contains(selection.focusNode)) {
		return null
	}
	const range = document.createRange()
	range.setStart(field, 0)
	range.setEnd(selection.focusNode!, selection.focusOffset)
	return range.toString().length
}

/**
 * Put the caret back at a number of characters from the start of the field
 *
 * @param field - The field
 * @param offset - Characters from the start
 */
function restoreCaret(field: HTMLElement, offset: number) {
	const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
	let left = offset
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		if (left <= node.data.length) {
			const selection = window.getSelection()!
			const range = document.createRange()
			if (isLocked(node, field)) {
				// Inside a mention: after the whole mention
				let chip: Node = node
				while (chip.parentNode && chip.parentNode !== field && !(chip instanceof HTMLElement && chip.getAttribute('contenteditable') === 'false')) {
					chip = chip.parentNode
				}
				range.setStartAfter(chip)
			} else {
				range.setStart(node, left)
			}
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)
			return
		}
		left -= node.data.length
	}
}

/**
 * The styled element for one formatted part, markers included
 *
 * @param text - The formatted part, with its markers
 * @param token - What it is
 */
function buildSpan(text: string, token: Token): HTMLElement {
	const span = document.createElement('span')
	span.className = `${SPAN} ${SPAN}--${token.kind}`
	const mark = (value: string) => {
		const m = document.createElement('span')
		m.className = `${SPAN}__mark`
		m.textContent = value
		return m
	}
	// The style goes on the content only: a line-through on the whole span would strike the markers too
	const content = document.createElement('span')
	content.className = `${SPAN}__text`
	content.textContent = text.slice(token.marker, text.length - token.marker)
	span.append(mark(text.slice(0, token.marker)), content, mark(text.slice(text.length - token.marker)))
	return span
}

/**
 * Re-apply the formatting to the whole field
 *
 * @param field - The field
 */
function format(field: HTMLElement) {
	const hasSpans = !!field.querySelector(`.${SPAN}`)
	const text = field.textContent ?? ''
	// Plain text stays untouched, so that the native undo keeps working for it
	if (!hasSpans && !/[*_~`]/.test(text)) {
		return
	}

	const caret = caretOffset(field)

	// Back to plain text first
	field.querySelectorAll(`.${SPAN}`).forEach((span) => span.replaceWith(document.createTextNode(span.textContent ?? '')))
	field.normalize()

	const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
	const nodes: Text[] = []
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		if (!isLocked(node, field)) {
			nodes.push(node)
		}
	}

	for (const node of nodes) {
		const tokens = tokenize(node.data)
		if (tokens.length === 0) {
			continue
		}
		const fragment = document.createDocumentFragment()
		let at = 0
		for (const token of tokens) {
			if (token.start > at) {
				fragment.append(node.data.slice(at, token.start))
			}
			fragment.append(buildSpan(node.data.slice(token.start, token.end), token))
			at = token.end
		}
		if (at < node.data.length) {
			fragment.append(node.data.slice(at))
		}
		node.replaceWith(fragment)
	}

	if (caret !== null && document.activeElement === field) {
		restoreCaret(field, caret)
	}
}

/**
 * Whether the mention or emoji suggestions are open: they keep track of the text being typed
 */
function isSuggesting(): boolean {
	return [...document.querySelectorAll<HTMLElement>('[class*="_tribute-container_"]')].some((el) => el.offsetParent !== null)
}

/**
 * Format the message field as the user types
 */
export function applyComposerMarkdown(): void {
	const onChange = (event: Event) => {
		const field = (event.target as HTMLElement | null)?.closest?.<HTMLElement>(FIELD)
		if (!field || (event as InputEvent).isComposing || isSuggesting()) {
			return
		}
		format(field)
	}

	document.addEventListener('input', onChange)
	// A draft restored by Talk comes back as plain text
	document.addEventListener('focusin', onChange)
	document.addEventListener('compositionend', onChange)
}
