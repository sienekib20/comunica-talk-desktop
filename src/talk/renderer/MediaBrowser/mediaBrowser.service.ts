/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

/*
 * What every conversation shared, gathered in one place (media, documents, links).
 * Talk has no endpoint across conversations: media and documents come from each conversation's
 * shared items, links from the server's message search (messages containing "http").
 */

export type BrowserKind = 'media' | 'file' | 'link'

export interface SharedFile {
	id: string
	name: string
	size: number
	path: string
	link: string
	mimetype: string
	hasPreview: boolean
	permissions: number
	etag?: string
}

export interface BrowserItem {
	key: string
	token: string
	conversation: string
	messageId: number
	timestamp: number
	author: string
	file?: SharedFile
	url?: string
	text?: string
}

const OCS = { headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' } }

/** Items per conversation and type: the most recent ones */
const PER_CONVERSATION = 100

/** Requests in flight at once */
const CONCURRENCY = 6

/**
 * "Nome (nome@ima.gov.ao)" → "Nome"
 *
 * @param name - Display name as the server sends it
 */
export function cleanName(name: string): string {
	return name.replace(/\s*\([^()]*@[^()]*\)\s*$/, '').trim()
}

interface SharedMessage {
	id: number | string
	timestamp: number | string
	actorDisplayName?: string
	messageParameters?: { file?: Record<string, string | undefined> }
}

interface Room {
	token: string
	displayName: string
}

let roomsCache: Promise<Room[]> | undefined

/**
 * The user's conversations
 */
function getRooms(): Promise<Room[]> {
	roomsCache ??= axios.get(generateOcsUrl('apps/spreed/api/v4/room'), OCS)
		.then(({ data }) => (data.ocs.data as Room[]).map(({ token, displayName }) => ({ token, displayName })))
		.catch((error) => {
			roomsCache = undefined
			throw error
		})
	return roomsCache
}

/**
 * Run tasks with a limited number at once
 *
 * @param tasks - Functions returning promises
 */
async function pool<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
	const results: T[] = []
	let next = 0
	const worker = async () => {
		while (next < tasks.length) {
			const index = next++
			results[index] = await tasks[index]!()
		}
	}
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker))
	return results
}

/**
 * Shared media or documents of every conversation, most recent first
 *
 * @param kind - 'media' or 'file'
 */
export async function loadShared(kind: 'media' | 'file'): Promise<BrowserItem[]> {
	roomsCache = undefined
	const rooms = await getRooms()
	const perRoom = await pool(rooms.map((room) => async () => {
		try {
			const { data } = await axios.get(generateOcsUrl('apps/spreed/api/v1/chat/{token}/share', { token: room.token }), {
				...OCS,
				params: { objectType: kind, limit: PER_CONVERSATION },
			})
			const raw = data.ocs.data
			const messages = (Array.isArray(raw) ? raw : Object.values(raw ?? {})) as SharedMessage[]
			return messages.filter((m) => m.messageParameters?.file).map((m): BrowserItem => {
				const f = m.messageParameters!.file!
				return {
					key: `${room.token}:${m.id}`,
					token: room.token,
					conversation: room.displayName,
					messageId: Number(m.id),
					timestamp: Number(m.timestamp),
					author: cleanName(String(m.actorDisplayName ?? '')),
					file: {
						id: String(f.id),
						name: String(f.name),
						size: Number(f.size) || 0,
						path: String(f.path ?? ''),
						link: String(f.link ?? ''),
						mimetype: String(f.mimetype ?? ''),
						hasPreview: f['preview-available'] === 'yes',
						permissions: Number(f.permissions) || 1,
						etag: f.etag,
					},
				}
			})
		} catch {
			// One conversation failing (left, removed) does not hide the others
			return []
		}
	}))
	return perRoom.flat().sort((a, b) => b.timestamp - a.timestamp)
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g

/**
 * Links sent in every conversation, most recent first
 */
export async function loadLinks(): Promise<BrowserItem[]> {
	const rooms = await getRooms().catch(() => [] as Room[])
	const names = new Map(rooms.map((room) => [room.token, room.displayName]))
	const items: BrowserItem[] = []
	const seen = new Set<string>()
	let cursor: number | string | undefined
	for (let page = 0; page < 4; page++) {
		const { data } = await axios.get(generateOcsUrl('search/providers/talk-message/search'), {
			...OCS,
			params: { term: 'http', limit: 50, ...(cursor !== undefined ? { cursor } : {}) },
		})
		const result = data.ocs.data
		for (const entry of result.entries ?? []) {
			const attributes = entry.attributes ?? {}
			const token = String(attributes.conversation ?? '')
			const messageId = Number(attributes.messageId)
			const text = String(entry.subline ?? '')
			for (const match of text.matchAll(URL_PATTERN)) {
				// The search shows a snippet: a link cut by it ends with "…" and is not usable as such
				const url = match[0].replace(/[.,;:!?]+$/, '')
				const key = `${messageId}:${url}`
				if (seen.has(key)) {
					continue
				}
				seen.add(key)
				items.push({
					key,
					token,
					conversation: names.get(token) ?? '',
					messageId,
					timestamp: Number(attributes.timestamp) || 0,
					// The search titles each result "Name (email) em Conversation"
					author: cleanName(String(entry.title ?? '').replace(/\s*\([^()]*@[^()]*\)/, '').replace(/\s+(em|in)\s+.*$/, '')),
					url: url.endsWith('…') ? undefined : url,
					text: url.replace(/…$/, ''),
				})
			}
		}
		if (!result.isPaginated || !result.entries?.length) {
			break
		}
		cursor = result.cursor
	}
	return items.sort((a, b) => b.timestamp - a.timestamp)
}
