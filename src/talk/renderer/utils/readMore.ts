/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Long messages show their beginning with "Ler mais", as in WhatsApp; "Ver menos" folds them back.
 *
 * The height limit is in CSS (chat.styles.css), on every message text from the first paint, so
 * nothing jumps when a long message appears. This only adds the button to the texts that do
 * overflow, and remembers which messages were opened, so they stay open when Talk re-renders.
 */

const TEXT = '.messages-list__scroller .message-main__text > .rich-text--wrapper'
const opened = new Set<string>()

/**
 * Add or refresh the button of one message text
 *
 * @param text - The message's text element
 */
function update(text: HTMLElement) {
	const message = text.closest<HTMLElement>('li.message')
	const id = message?.id ?? ''
	const container = text.parentElement!
	let button = container.querySelector<HTMLButtonElement>(':scope > .tg-read-more')

	const isOpen = opened.has(id)
	text.classList.toggle('tg-text--open', isOpen)

	// Measured folded: only a text taller than its limit gets the button
	const overflows = isOpen || text.scrollHeight > text.clientHeight + 4
	text.classList.toggle('tg-text--folded', overflows && !isOpen)

	if (!overflows) {
		button?.remove()
		return
	}
	if (!button) {
		button = document.createElement('button')
		button.type = 'button'
		button.className = 'tg-read-more'
		button.addEventListener('click', (event) => {
			event.stopPropagation()
			if (opened.has(id)) {
				opened.delete(id)
			} else {
				opened.add(id)
			}
			update(text)
			if (!opened.has(id)) {
				// Folding back: keep the message in view
				message?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
			}
		})
		text.insertAdjacentElement('afterend', button)
	}
	button.textContent = isOpen ? 'Ver menos' : 'Ler mais'
	button.setAttribute('aria-expanded', String(isOpen))
}

/**
 * Check the message texts that are on the page
 */
function scan() {
	document.querySelectorAll<HTMLElement>(TEXT).forEach(update)
}

/**
 * Watch the chat for long messages
 */
export function applyReadMore(): void {
	let pending = 0
	new MutationObserver(() => {
		if (!pending) {
			pending = window.setTimeout(() => {
				pending = 0
				scan()
			}, 120)
		}
	}).observe(document.body, { childList: true, subtree: true, characterData: true })
	scan()
}
