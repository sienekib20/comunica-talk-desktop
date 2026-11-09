/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Every single-choice <select> in the app opens the app's own menu instead of the system one,
 * whose look (and highlight colour) cannot be styled. The <select> stays in place and keeps the
 * value: picking an option writes it back and fires the events the page listens to.
 */

let menu: HTMLElement | null = null
let current: HTMLSelectElement | null = null
let active = -1

/**
 * Close the open menu
 *
 * @param refocus - Give the focus back to the select
 */
function close(refocus = true) {
	if (!menu) {
		return
	}
	const closing = menu
	menu = null
	closing.classList.add('tg-select-menu--closing')
	setTimeout(() => closing.remove(), 120)
	if (refocus) {
		current?.focus({ preventScroll: true })
	}
	current = null
	document.removeEventListener('mousedown', onOutside, true)
	window.removeEventListener('resize', onViewportChange)
	document.removeEventListener('scroll', onViewportChange, true)
}

/**
 * Close when clicking anywhere else
 *
 * @param event - Mouse down
 */
function onOutside(event: MouseEvent) {
	if (menu && !menu.contains(event.target as Node)) {
		close(false)
	}
}

/**
 * The page moved under the menu: close it rather than leave it floating
 *
 * @param event - Scroll or resize
 */
function onViewportChange(event: Event) {
	if (event.type === 'scroll' && menu?.contains(event.target as Node)) {
		return
	}
	close(false)
}

/**
 * Write the chosen option into the select
 *
 * @param select - The select
 * @param index - Option index
 */
function choose(select: HTMLSelectElement, index: number) {
	const option = select.options[index]
	if (!option || option.disabled) {
		return
	}
	if (select.selectedIndex !== index) {
		select.selectedIndex = index
		select.dispatchEvent(new Event('input', { bubbles: true }))
		select.dispatchEvent(new Event('change', { bubbles: true }))
	}
	close()
}

/**
 * Highlight an option of the open menu
 *
 * @param index - Option index
 */
function highlight(index: number) {
	if (!menu) {
		return
	}
	const items = [...menu.querySelectorAll<HTMLElement>('.tg-select-menu__option')]
	active = Math.max(0, Math.min(index, items.length - 1))
	items.forEach((item, i) => item.classList.toggle('tg-select-menu__option--active', i === active))
	items[active]?.scrollIntoView({ block: 'nearest' })
}

/**
 * Open the app's menu for a select
 *
 * @param select - The select
 */
function open(select: HTMLSelectElement) {
	close(false)
	current = select
	// Line the menu up with what the user sees: the field around a hidden select, or the select
	const anchor = select.closest<HTMLElement>('[class*="_formBoxItem_"], .select-field, label') ?? select
	const box = (anchor.getBoundingClientRect().width > 0 ? anchor : select).getBoundingClientRect()

	menu = document.createElement('div')
	menu.className = 'tg-select-menu'
	menu.setAttribute('role', 'listbox')
	const list = document.createElement('ul')
	;[...select.options].forEach((option, index) => {
		const item = document.createElement('li')
		item.className = 'tg-select-menu__option'
		item.setAttribute('role', 'option')
		item.setAttribute('aria-selected', String(index === select.selectedIndex))
		item.classList.toggle('tg-select-menu__option--selected', index === select.selectedIndex)
		item.classList.toggle('tg-select-menu__option--disabled', option.disabled)
		item.textContent = option.textContent
		item.addEventListener('mousedown', (event) => event.preventDefault())
		item.addEventListener('click', () => choose(select, index))
		item.addEventListener('mousemove', () => highlight(index))
		list.append(item)
	})
	menu.append(list)
	document.body.append(menu)

	// Below the field, or above it when there is no room; as wide as the field
	const height = Math.min(menu.scrollHeight, 320)
	const below = window.innerHeight - box.bottom - 8
	const top = below >= height || below >= box.top ? box.bottom + 6 : box.top - height - 6
	menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8))}px`
	menu.style.top = `${Math.max(8, top)}px`
	menu.style.width = `${Math.max(box.width, 180)}px`
	menu.style.maxHeight = '320px'
	menu.style.transformOrigin = top > box.top ? 'top center' : 'bottom center'

	highlight(Math.max(select.selectedIndex, 0))
	document.addEventListener('mousedown', onOutside, true)
	window.addEventListener('resize', onViewportChange)
	document.addEventListener('scroll', onViewportChange, true)
}

/**
 * Whether a select is one this menu replaces
 *
 * @param target - Event target
 */
function asSelect(target: EventTarget | null): HTMLSelectElement | null {
	return target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 && !target.disabled ? target : null
}

/**
 * Use the app's menu for every single-choice select
 */
export function applySelectMenu(): void {
	document.addEventListener('mousedown', (event) => {
		const select = asSelect(event.target)
		if (!select || event.button !== 0) {
			return
		}
		// No system menu
		event.preventDefault()
		select.focus({ preventScroll: true })
		if (current === select) {
			close()
		} else {
			open(select)
		}
	}, true)

	document.addEventListener('keydown', (event) => {
		if (menu && current) {
			const count = current.options.length
			if (event.key === 'ArrowDown') {
				highlight(active + 1 < count ? active + 1 : active)
			} else if (event.key === 'ArrowUp') {
				highlight(active > 0 ? active - 1 : 0)
			} else if (event.key === 'Home') {
				highlight(0)
			} else if (event.key === 'End') {
				highlight(count - 1)
			} else if (event.key === 'Enter' || event.key === ' ') {
				choose(current, active)
			} else if (event.key === 'Escape' || event.key === 'Tab') {
				close(event.key === 'Escape')
				if (event.key === 'Tab') {
					return
				}
			} else {
				return
			}
			event.preventDefault()
			event.stopPropagation()
			return
		}
		const select = asSelect(event.target)
		if (select && [' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
			event.preventDefault()
			open(select)
		}
	}, true)
}
