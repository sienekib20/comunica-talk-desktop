/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'

/**
 * Accounts that come from the gov.ao single sign-on are named "user (user@domain)" on the
 * server, which repeats the same name twice everywhere in the interface. This keeps only
 * the part before the e-mail. It only changes what the client shows: the server keeps the
 * full name, and ids (actorId, userId) are never touched.
 */

/** "alione.francisco (alione.francisco@ima.gov.ao)" -> "alione.francisco" */
const NAME_WITH_EMAIL = /^(.+?)\s+\(([^\s()]+@[^\s()]+)\)$/

/** Fields that hold a person's display name in the Talk and Nextcloud APIs */
const NAME_KEYS = new Set([
	'displayName',
	'displayname',
	'actorDisplayName',
	'lastEditActorDisplayName',
	'name',
	'label',
])

/**
 * Strip the trailing "(e-mail)" from a display name
 *
 * @param value - Display name as sent by the server
 */
export function cleanDisplayName(value: string): string {
	const match = NAME_WITH_EMAIL.exec(value)
	return match ? match[1]! : value
}

/**
 * Clean every display name in a parsed API response, in place
 *
 * @param data - Response payload
 * @param depth - Current depth, to stop on unexpected deeply nested payloads
 */
function cleanPayload(data: unknown, depth = 0): void {
	if (depth > 12 || data === null || typeof data !== 'object') {
		return
	}

	if (Array.isArray(data)) {
		for (const item of data) {
			cleanPayload(item, depth + 1)
		}
		return
	}

	const record = data as Record<string, unknown>
	for (const key of Object.keys(record)) {
		const value = record[key]
		if (typeof value === 'string') {
			if (NAME_KEYS.has(key)) {
				record[key] = cleanDisplayName(value)
			}
		} else {
			cleanPayload(value, depth + 1)
		}
	}
}

/**
 * Clean the names in a JSON text frame, or return it unchanged when it is not JSON
 *
 * @param data - WebSocket frame payload
 */
function cleanFrame(data: unknown): unknown {
	if (typeof data !== 'string' || (data[0] !== '{' && data[0] !== '[')) {
		return data
	}
	try {
		const parsed = JSON.parse(data)
		cleanPayload(parsed)
		return JSON.stringify(parsed)
	} catch {
		return data
	}
}

/**
 * Wrap a message listener so it receives the cleaned frame
 *
 * @param listener - Original listener
 */
function wrapListener(listener: (event: MessageEvent) => unknown) {
	return function(this: WebSocket, event: MessageEvent) {
		const data = cleanFrame(event.data)
		const cleaned = data === event.data
			? event
			: new MessageEvent('message', { data, origin: event.origin, lastEventId: event.lastEventId })
		return listener.call(this, cleaned)
	}
}

/**
 * The signaling server pushes participant and chat updates over a WebSocket, which bypasses
 * axios. Clean those frames too, before Talk reads them.
 */
function applyToWebSockets(): void {
	const listeners = new WeakMap<object, (event: MessageEvent) => unknown>()
	const proto = WebSocket.prototype

	const originalAdd = proto.addEventListener
	const originalRemove = proto.removeEventListener
	proto.addEventListener = function(this: WebSocket, type: string, listener: unknown, options?: unknown) {
		if (type === 'message' && typeof listener === 'function') {
			const wrapped = listeners.get(listener) ?? wrapListener(listener as (event: MessageEvent) => unknown)
			listeners.set(listener, wrapped)
			return originalAdd.call(this, type, wrapped as EventListener, options as AddEventListenerOptions)
		}
		return originalAdd.call(this, type, listener as EventListener, options as AddEventListenerOptions)
	} as typeof proto.addEventListener
	proto.removeEventListener = function(this: WebSocket, type: string, listener: unknown, options?: unknown) {
		const wrapped = (type === 'message' && listener && listeners.get(listener as object)) || listener
		return originalRemove.call(this, type, wrapped as EventListener, options as EventListenerOptions)
	} as typeof proto.removeEventListener

	const onmessage = Object.getOwnPropertyDescriptor(proto, 'onmessage')!
	Object.defineProperty(proto, 'onmessage', {
		configurable: true,
		enumerable: onmessage.enumerable,
		get() {
			return onmessage.get!.call(this)
		},
		set(listener: ((event: MessageEvent) => unknown) | null) {
			onmessage.set!.call(this, typeof listener === 'function' ? wrapListener(listener) : listener)
		},
	})
}

/**
 * Register the cleaning on every response of the shared Nextcloud axios instance
 * and on every WebSocket frame
 */
export function applyCleanDisplayNames(): void {
	axios.interceptors.response.use((response) => {
		cleanPayload(response.data)
		return response
	})
	applyToWebSockets()
}
