/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getCurrentUser } from '@nextcloud/auth'
import { generateUrl } from '@nextcloud/router'

/**
 * The settings dialog, in the manner of WhatsApp's settings: on the left a search, the user's
 * card and the sections as rows with an icon, a title and a line saying what is inside; on the
 * right only the chosen section. The dialog stays Talk's own (NcAppSettingsDialog): this only
 * adds to its navigation and shows one section at a time.
 */

/** Material Design icon paths, 24×24 */
const ICONS = {
	app: 'M19.14 12.94a7 7 0 0 0 .05-.94 7 7 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.68 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7 7 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
	devices: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z',
	appearance: 'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
	privacy: 'M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0z',
	files: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z',
	keyboard: 'M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-9 3h2v2h-2zm0 3h2v2h-2zM8 8h2v2H8zm0 3h2v2H8zm-1 2H5v-2h2zm0-3H5V8h2zm9 7H8v-2h8zm0-4h-2v-2h2zm0-3h-2V8h2zm3 3h-2v-2h2zm0-3h-2V8h2z',
	other: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z',
} as const

/** What each section is called and holds, by the end of its id */
const SECTIONS: { match: RegExp, icon: keyof typeof ICONS, title?: string, description: string }[] = [
	{ match: /application$/, icon: 'app', title: 'Aplicação', description: 'Bloqueio, arranque, tema, zoom e notificações' },
	{ match: /devices$/, icon: 'devices', title: 'Dispositivos', description: 'Câmara, microfone e altifalantes' },
	{ match: /appearance$/, icon: 'appearance', title: 'Aspeto e sons', description: 'Leitura das conversas e sons' },
	{ match: /privacy$/, icon: 'privacy', title: 'Privacidade', description: 'Confirmações de leitura e estado de escrita' },
	{ match: /attachments$/, icon: 'files', title: 'Ficheiros', description: 'Pasta dos ficheiros partilhados' },
	{ match: /keyboard-shortcuts$/, icon: 'keyboard', title: 'Atalhos de teclado', description: 'Ações rápidas' },
]

/**
 * An SVG icon element
 *
 * @param name - Icon name
 */
function icon(name: keyof typeof ICONS): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
	svg.setAttribute('viewBox', '0 0 24 24')
	svg.setAttribute('aria-hidden', 'true')
	svg.classList.add('tg-settings__icon')
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
	path.setAttribute('d', ICONS[name])
	path.setAttribute('fill', 'currentColor')
	svg.append(path)
	return svg
}

/**
 * Show only one section on the right
 *
 * @param dialog - The settings dialog
 * @param id - Section id
 */
function showSection(dialog: HTMLElement, id: string) {
	// Attributes, not classes: Vue rewrites the class list whenever it re-renders these elements
	dialog.dataset.tgSection = id
	dialog.querySelectorAll<HTMLElement>('.app-settings-section').forEach((section) => {
		section.toggleAttribute('data-tg-shown', section.id === id)
	})
	dialog.querySelectorAll<HTMLAnchorElement>('.navigation-list__link').forEach((link) => {
		link.toggleAttribute('data-tg-chosen', link.hash === `#${id}`)
	})
	dialog.querySelector('.app-settings__content')?.scrollTo({ top: 0 })
}

/**
 * Add the search, the user's card and the descriptions to a newly opened settings dialog
 *
 * @param dialog - The settings dialog
 */
function enhance(dialog: HTMLElement) {
	const navigation = dialog.querySelector<HTMLElement>('.app-settings__navigation')
	const list = navigation?.querySelector('.navigation-list')
	if (!navigation || !list || navigation.dataset.tgEnhanced) {
		return
	}
	navigation.dataset.tgEnhanced = '1'
	dialog.classList.add('tg-settings')

	const title = navigation.querySelector('.app-settings__title')
	if (title) {
		title.textContent = 'Definições'
	}

	// Search through the sections' titles, descriptions and their own settings
	const search = document.createElement('label')
	search.className = 'tg-settings__search'
	search.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.25 10.33l5.46 5.46-1.42 1.42-5.46-5.46A6.5 6.5 0 1 1 9.5 3zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/></svg>'
	const input = document.createElement('input')
	input.type = 'search'
	input.placeholder = 'Pesquisar definições'
	input.setAttribute('aria-label', 'Pesquisar definições')
	search.append(input)

	// The user's card
	const user = getCurrentUser()
	const card = document.createElement('div')
	card.className = 'tg-settings__profile'
	if (user) {
		const avatar = document.createElement('img')
		avatar.src = generateUrl('/avatar/{user}/128', { user: user.uid })
		avatar.alt = ''
		const text = document.createElement('div')
		const name = document.createElement('strong')
		name.textContent = (user.displayName || user.uid).replace(/\s*\([^()]*@[^()]*\)\s*$/, '')
		const account = document.createElement('span')
		account.textContent = user.uid
		text.append(name, account)
		card.append(avatar, text)
	}

	title?.after(search, card)

	// Rows: an icon, the title and a line saying what is inside
	const links = [...list.querySelectorAll<HTMLAnchorElement>('.navigation-list__link')]
	for (const link of links) {
		const id = link.hash.slice(1)
		const known = SECTIONS.find((section) => section.match.test(id))
		const label = link.querySelector('.navigation-list__link-text')
		if (known?.title && label) {
			label.textContent = known.title
			const heading = dialog.querySelector(`#${CSS.escape(id)} .app-settings-section__name`)
			if (heading) {
				heading.textContent = known.title
			}
		}
		link.prepend(icon(known?.icon ?? 'other'))
		if (known) {
			const description = document.createElement('span')
			description.className = 'tg-settings__description'
			description.textContent = known.description
			label?.after(description)
		}
		link.addEventListener('click', () => showSection(dialog, id))
	}

	input.addEventListener('input', () => {
		const query = input.value.trim().toLowerCase()
		for (const link of links) {
			const section = dialog.querySelector(link.hash)
			const haystack = `${link.textContent} ${section?.textContent ?? ''}`.toLowerCase()
			link.closest('li')!.hidden = !!query && !haystack.includes(query)
		}
		const first = links.find((link) => !link.closest('li')!.hidden)
		if (first) {
			showSection(dialog, first.hash.slice(1))
		}
	})

	showSection(dialog, links[0]?.hash.slice(1) ?? '')
}

/**
 * Watch for the settings dialog
 */
export function applySettingsDialog(): void {
	let pending = 0
	new MutationObserver(() => {
		if (!pending) {
			pending = window.setTimeout(() => {
				pending = 0
				document.querySelectorAll<HTMLElement>('.app-settings').forEach(enhance)
			}, 60)
		}
	}).observe(document.body, { childList: true, subtree: true })
}
