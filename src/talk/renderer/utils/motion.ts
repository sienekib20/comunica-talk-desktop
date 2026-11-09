/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Lenis from 'lenis'
import { spring } from 'motion'
import { animate } from 'motion/mini'

/**
 * Motion for the markup Talk renders, kept light:
 * - smooth wheel scrolling (Lenis) in the long lists, with one shared animation loop that
 *   stops as soon as nothing scrolls;
 * - spring entrances (Motion's mini animate, run by the browser's Web Animations API) for
 *   new messages and dialogs.
 * Menus and popovers are animated in CSS (chat.styles.css). Nothing runs when the system
 * asks for reduced motion.
 */

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/** Quick spring with a touch of bounce, for things that appear */
export const SPRING_ENTER = { type: spring, visualDuration: 0.32, bounce: 0.18 }

/** Firmer spring, for things that move from one place to another */
export const SPRING_MOVE = { type: spring, visualDuration: 0.38, bounce: 0.2 }

export { animate }

/* ---------------------------------------------------------------- Smooth scroll */

/** Scroll areas that get smooth wheel scrolling */
const SCROLL_AREAS = [
	'.messages-list__scroller',
	'.app-navigation-list > .scroller',
	'.app-sidebar-tabs__content',
	'.app-settings__content',
]

const lenses = new Map<HTMLElement, Lenis>()
let frame = 0
let idleFrames = 0

/**
 * Advance every Lenis instance; stop the loop after half a second of no scrolling
 *
 * @param time - Frame timestamp
 */
function tick(time: number) {
	let busy = false
	for (const lenis of lenses.values()) {
		lenis.raf(time)
		busy ||= !!lenis.isScrolling
	}
	idleFrames = busy ? 0 : idleFrames + 1
	frame = idleFrames > 30 ? 0 : requestAnimationFrame(tick)
}

/**
 * Start the loop if it is not running
 */
function wake() {
	idleFrames = 0
	if (!frame) {
		// Lenis measures each step from its last frame: after a pause that gap would be seconds,
		// and the first step would jump straight to the end
		for (const lenis of lenses.values()) {
			lenis.time = 0
		}
		frame = requestAnimationFrame(tick)
	}
}

/** Until when the current wheel stream counts as a trackpad gesture */
let trackpadUntil = 0
let lastEvent: Event | undefined
let lastVerdict = false

/**
 * Whether a wheel event comes from a mouse wheel that moves in notches.
 * Notched wheels report multiples of 120 in the legacy wheelDelta; trackpads report
 * small, uneven amounts. One uneven event marks the whole stream (with its momentum)
 * as a trackpad until the wheel has been still for 400ms, so a gesture never switches
 * between native and smoothed scrolling half-way.
 *
 * @param event - Wheel or touch event
 */
function isNotchedWheel(event: Event): boolean {
	if (event === lastEvent) {
		return lastVerdict
	}
	lastEvent = event
	lastVerdict = false

	if (!(event instanceof WheelEvent) || event.ctrlKey) {
		return false
	}
	const now = event.timeStamp
	const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0
	const notched = event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL
		|| (event.deltaX === 0 && legacy !== 0 && legacy % 120 === 0)

	if (!notched || now < trackpadUntil) {
		trackpadUntil = now + 400
		return false
	}
	lastVerdict = true
	return true
}

/**
 * Give a scroll area smooth wheel scrolling
 *
 * @param wrapper - The scrolling element
 */
function smoothen(wrapper: HTMLElement) {
	if (lenses.has(wrapper)) {
		return
	}

	const lenis = new Lenis({
		wrapper,
		content: wrapper,
		autoRaf: false,
		smoothWheel: true,
		syncTouch: false,
		lerp: 0.2,
		wheelMultiplier: 1,
		// Only mouse wheels are smoothed. Trackpads (and Magic Mouse) already scroll smoothly with
		// the system's own momentum; smoothing them again only adds lag.
		virtualScroll: ({ event }) => isNotchedWheel(event),
		// Code blocks scroll sideways on their own
		prevent: (node) => node.tagName === 'PRE',
	})

	// For an element (not the window) Lenis only re-measures the scroll height when its content
	// element resizes; Talk's lists grow in several children. Measure once at the start of each
	// wheel gesture (capture phase, before Lenis handles the event), not on every event.
	wrapper.addEventListener('wheel', (event) => {
		if (!isNotchedWheel(event)) {
			return
		}
		if (!lenis.isScrolling) {
			lenis.resize()
		}
		wake()
	}, { passive: true, capture: true })

	// Talk moves the scroll position itself (older messages loaded above, jump to a message).
	// If that happens while Lenis is gliding, follow Talk instead of pulling back to the old spot.
	wrapper.addEventListener('scroll', () => {
		if (lenis.isScrolling === 'smooth' && Math.abs(wrapper.scrollTop - lenis.animatedScroll) > 4) {
			lenis.scrollTo(wrapper.scrollTop, { immediate: true, force: true })
		}
	}, { passive: true })

	lenses.set(wrapper, lenis)
}

/**
 * Drop the instances of scroll areas Talk has removed
 */
function sweep() {
	for (const [wrapper, lenis] of lenses) {
		if (!wrapper.isConnected) {
			lenis.destroy()
			lenses.delete(wrapper)
		}
	}
}

/* ---------------------------------------------------------------- Entrances */

let conversationOpenedAt = performance.now()

/**
 * New messages in the open conversation rise into place.
 * Messages rendered with the conversation, or a page of older ones, do not move.
 *
 * @param added - Message elements added in one batch
 * @param replacedTemporary - Whether the batch swapped a just-sent message for the stored one
 */
function enterMessages(added: HTMLElement[], replacedTemporary: boolean) {
	if (replacedTemporary || added.length === 0 || added.length > 3) {
		return
	}
	if (performance.now() - conversationOpenedAt < 1200) {
		return
	}
	for (const message of added) {
		const box = message.getBoundingClientRect()
		if (box.top > window.innerHeight || box.bottom < 0) {
			continue
		}
		message.style.transformOrigin = message.classList.contains('outgoing') ? '100% 100%' : '0% 100%'
		animate(message, {
			opacity: [0, 1],
			transform: ['translateY(14px) scale(0.97)', 'translateY(0) scale(1)'],
		}, SPRING_ENTER)
	}
}

/**
 * A dialog grows into place with its backdrop fading in
 *
 * @param mask - The dialog's backdrop element
 */
function enterDialog(mask: HTMLElement) {
	const dialog = mask.querySelector<HTMLElement>('.modal-container')
	if (!dialog) {
		return
	}
	animate(mask, { opacity: [0, 1] }, { duration: 0.18, ease: 'easeOut' })
	animate(dialog, {
		opacity: [0, 1],
		transform: ['translateY(10px) scale(0.96)', 'translateY(0) scale(1)'],
	}, SPRING_ENTER)
}

/* ---------------------------------------------------------------- Conversation groups */

/**
 * The conversations that follow a group header ("Favoritos", "Outro") in the list, up to the next header.
 * The list is flat (virtual scroller): a group's rows are siblings of its header, not children.
 *
 * @param header - The group header row
 */
function groupRows(header: Element): HTMLElement[] {
	const rows: HTMLElement[] = []
	for (let el = header.nextElementSibling; el && !el.classList.contains('tag-header'); el = el.nextElementSibling) {
		rows.push(el as HTMLElement)
	}
	return rows
}

/** Entrance animations of the rows of the group being opened */
let groupAnimations: Animation[] = []

/**
 * Opening a group lets its rows drop in one after the other. Closing is left to Talk, instant:
 * holding the rows back while they fold made them vanish whenever the virtual list re-rendered.
 *
 * @param event - Click anywhere in the conversations list
 */
function onGroupToggle(event: MouseEvent) {
	const target = event.target as HTMLElement
	const header = target.closest('.tag-header')
	// The group's own actions menu ("…") is not a toggle
	if (!header || target.closest('.action-item')) {
		return
	}
	// A new toggle ends whatever was still moving
	groupAnimations.forEach((animation) => animation.cancel())
	groupAnimations = []

	if (header.querySelector('[aria-expanded]')?.getAttribute('aria-expanded') === 'true') {
		return
	}
	const before = new Set(groupRows(header))
	setTimeout(() => {
		const current = header.isConnected ? header : null
		if (!current) {
			return
		}
		groupAnimations = groupRows(current).filter((row) => !before.has(row)).slice(0, 12).map((row, i) => row.animate([
			{ opacity: 0, transform: 'translateY(-6px)' },
			{ opacity: 1, transform: 'none' },
		], { duration: 200, delay: i * 14, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'backwards' }))
	}, 30)
}

/* ---------------------------------------------------------------- Wiring */

/**
 * Smooth scrolling and entrances, now and as Talk renders new parts
 */
export function applyMotion(): void {
	if (reducedMotion.matches) {
		return
	}

	const scanScrollAreas = () => {
		document.querySelectorAll<HTMLElement>(SCROLL_AREAS.join(',')).forEach(smoothen)
	}

	scanScrollAreas()

	document.addEventListener('click', onGroupToggle, true)

	window.addEventListener('hashchange', () => {
		conversationOpenedAt = performance.now()
	})

	let pending = 0
	new MutationObserver((mutations) => {
		const messages: HTMLElement[] = []
		let replacedTemporary = false

		for (const mutation of mutations) {
			for (const node of mutation.removedNodes) {
				if (node instanceof HTMLElement && node.matches('.message') && node.id.startsWith('message_temp')) {
					replacedTemporary = true
				}
			}
			for (const node of mutation.addedNodes) {
				if (!(node instanceof HTMLElement)) {
					continue
				}
				if (node.matches('.modal-mask')) {
					enterDialog(node)
				} else if (node.matches('.message') && node.closest('.messages-list__scroller')) {
					messages.push(node)
				}
			}
		}

		enterMessages(messages, replacedTemporary)

		// Scroll areas come and go with conversations and dialogs: check a moment later, once.
		// (A timer, not an animation frame: frames do not run while the window is hidden.)
		if (!pending) {
			pending = window.setTimeout(() => {
				pending = 0
				sweep()
				scanScrollAreas()
			}, 100)
		}
	}).observe(document.body, { childList: true, subtree: true })
}
