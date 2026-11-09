/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import flatpickr from 'flatpickr'
import { Portuguese } from 'flatpickr/dist/l10n/pt.js'

import 'flatpickr/dist/flatpickr.min.css'

/**
 * Talk's date fields (e.g. "Desde" / "Até" in the message search) are native <input type="date">,
 * whose calendar cannot be styled. Each one gets a flatpickr calendar instead.
 *
 * The native input stays in place, hidden: Talk reads the date from it (valueAsNumber), so the
 * calendar writes the chosen date back into it and fires the events Talk listens to.
 */

const ENHANCED = 'tgDatePicker'

/**
 * Format a date as the value of a native date input (yyyy-mm-dd, local time)
 *
 * @param date - Date to format
 */
function toInputValue(date: Date): string {
	const pad = (n: number) => n.toString().padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Write a value into the native input and let Talk know
 *
 * @param input - Native date input
 * @param value - yyyy-mm-dd or empty
 */
function writeNative(input: HTMLInputElement, value: string) {
	input.value = value
	input.dispatchEvent(new Event('input', { bubbles: true }))
	input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Put a flatpickr calendar in front of a native date input
 *
 * @param input - Native date input
 */
function enhance(input: HTMLInputElement) {
	if (input.dataset[ENHANCED]) {
		return
	}
	input.dataset[ENHANCED] = '1'

	// The field's label becomes the placeholder of the visible field
	const label = input.closest('.input-field')?.querySelector('label')?.textContent?.trim()
		|| input.getAttribute('aria-label')
		|| ''

	const field = document.createElement('input')
	field.type = 'text'
	field.readOnly = true
	field.className = 'tg-date-field'
	field.placeholder = label
	field.setAttribute('aria-label', label)
	input.insertAdjacentElement('afterend', field)
	input.classList.add('tg-date-native')
	input.tabIndex = -1

	const picker = flatpickr(field, {
		locale: Portuguese,
		dateFormat: 'd/m/Y',
		disableMobile: true,
		monthSelectorType: 'static',
		defaultDate: input.value || undefined,
		minDate: input.min || undefined,
		maxDate: input.max || undefined,
		onChange: ([date]) => writeNative(input, date ? toInputValue(date) : ''),
		// Talk may reset the native value (e.g. "clear filters"): show what it holds now
		onOpen: (_dates, _str, instance) => instance.setDate(input.value || '', false),
		onReady: (_dates, _str, instance) => {
			const clear = document.createElement('button')
			clear.type = 'button'
			clear.className = 'tg-date-clear'
			clear.textContent = 'Limpar'
			clear.addEventListener('click', () => {
				instance.clear()
				instance.close()
			})
			instance.calendarContainer.appendChild(clear)
		},
	})

	// Keep the visible field in step when Talk changes the native value without the calendar
	const sync = () => {
		if ((input.value || '') !== (picker.selectedDates[0] ? toInputValue(picker.selectedDates[0]) : '')) {
			picker.setDate(input.value || '', false)
		}
	}
	input.addEventListener('change', sync)
}

/**
 * Enhance every native date input, now and as Talk renders new ones
 */
export function applyDatePickers(): void {
	const scan = (root: ParentNode) => {
		root.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(enhance)
	}

	scan(document)
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLElement) {
					if (node.matches('input[type="date"]')) {
						enhance(node as HTMLInputElement)
					} else {
						scan(node)
					}
				}
			}
		}
	}).observe(document.body, { childList: true, subtree: true })
}
