<!--
  - SPDX-FileCopyrightText: 2026 Talk Gov.ao
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'
import { EventBus } from '@talk/src/services/EventBus.ts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import IconChevronDown from 'vue-material-design-icons/ChevronDown.vue'
import IconMagnify from 'vue-material-design-icons/Magnify.vue'
import IconPlus from 'vue-material-design-icons/Plus.vue'
import IconVideoOutline from 'vue-material-design-icons/VideoOutline.vue'

/*
 * Meeting rooms in the conversations column, in the manner of Discord's channels: rooms with a
 * call going on (and who is in it), the user's rooms, the server's open rooms. A room opens on
 * the right as its conversation and the list stays. The panel lies over Talk's conversation list,
 * below its search row, for as long as the "Salas de reunião" section is chosen in the rail.
 */

type Room = {
	token: string
	displayName: string
	description?: string
	type: number
	hasCall?: boolean
	lastActivity?: number
	avatarVersion?: string
	unreadMessages?: number
	objectType?: string
}

type Person = { key: string, name: string, avatar: string }

type Participant = { actorType: string, actorId: string, displayName?: string, inCall?: number }

const OCS = { headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' } }
const GROUP = 2
const PUBLIC = 3

const mine = ref<Room[]>([])
const open = ref<Room[]>([])
const inCall = ref<Record<string, Person[]>>({})
const loading = ref(true)
const collapsed = ref<Record<string, boolean>>({})
const currentToken = ref(tokenFromHash())

/**
 * Token of the conversation shown on the right
 */
function tokenFromHash(): string {
	return location.hash.match(/#\/call\/([^/#?]+)/)?.[1] ?? ''
}

/**
 * Who is in the call of a room
 *
 * @param token - Room
 */
async function loadCallParticipants(token: string) {
	try {
		const { data } = await axios.get(generateOcsUrl('apps/spreed/api/v4/room/{token}/participants', { token }), OCS)
		inCall.value[token] = (data.ocs.data as Participant[])
			.filter((p) => Number(p.inCall) > 0)
			.map((p) => ({
				key: `${p.actorType}/${p.actorId}`,
				name: String(p.displayName || p.actorId).replace(/\s*\([^()]*@[^()]*\)\s*$/, ''),
				avatar: p.actorType === 'users' ? generateUrl('/avatar/{user}/64', { user: p.actorId }) : '',
			}))
	} catch {
		inCall.value[token] = []
	}
}

/**
 * Refresh the rooms (and who is in the calls going on)
 */
async function load() {
	try {
		const [rooms, listed] = await Promise.all([
			axios.get(generateOcsUrl('apps/spreed/api/v4/room'), OCS),
			axios.get(generateOcsUrl('apps/spreed/api/v4/listed-room'), { ...OCS, params: { searchTerm: '' } }).catch(() => null),
		])
		mine.value = (rooms.data.ocs.data as Room[])
			.filter((room) => (room.type === GROUP || room.type === PUBLIC) && !room.objectType?.startsWith('share:'))
			.sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
		open.value = (listed?.data.ocs.data as Room[] | undefined) ?? []
		await Promise.all(mine.value.filter((room) => room.hasCall).map((room) => loadCallParticipants(room.token)))
	} catch (error) {
		console.error('Could not load the meeting rooms', error)
	} finally {
		loading.value = false
	}
}

const live = computed(() => mine.value.filter((room) => room.hasCall))
const quiet = computed(() => mine.value.filter((room) => !room.hasCall))

const query = ref('')

/**
 * Rooms whose name or description match the search
 *
 * @param rooms - Rooms
 */
function matching(rooms: Room[]): Room[] {
	const q = query.value.trim().toLowerCase()
	return q ? rooms.filter((room) => `${room.displayName} ${room.description ?? ''}`.toLowerCase().includes(q)) : rooms
}

const groups = computed(() => [
	{ id: 'live', title: 'A decorrer', rooms: matching(live.value) },
	{ id: 'mine', title: 'As minhas salas', rooms: matching(quiet.value) },
	{ id: 'open', title: 'Salas abertas', rooms: matching(open.value) },
].filter((group) => group.rooms.length))

/**
 * Picture of a room
 *
 * @param room - Room
 */
function avatarUrl(room: Room): string {
	const dark = window.matchMedia('(prefers-color-scheme: dark)').matches ? '/dark' : ''
	return generateOcsUrl('apps/spreed/api/v1/room/{token}/avatar', { token: room.token }) + dark + (room.avatarVersion ? `?v=${room.avatarVersion}` : '')
}

/**
 * Show a room on the right
 *
 * @param room - Room
 */
function openRoom(room: Room) {
	window.location.hash = `#/call/${room.token}`
}

/**
 * Open a room and press its call button
 *
 * @param room - Room
 */
function joinCall(room: Room) {
	openRoom(room)
	const started = Date.now()
	const press = () => {
		const button = document.querySelector<HTMLButtonElement>('.top-bar .call-button button, .top-bar button.call-button')
		if (button && !button.disabled) {
			button.click()
		} else if (Date.now() - started < 6000) {
			setTimeout(press, 200)
		}
	}
	setTimeout(press, 300)
}

/**
 * Create a room with Talk's own dialog
 */
function createRoom() {
	EventBus.emit('new-conversation-dialog:show')
}

/* ---------------------------------------------------------------- Placement */

const style = ref<Record<string, string>>({ display: 'none' })

/**
 * Lie over Talk's conversation list, below its search row
 */
function place() {
	const navigation = document.querySelector<HTMLElement>('#app-navigation-vue')
	if (!navigation || document.querySelector('.app-navigation--closed')) {
		style.value = { display: 'none' }
		return
	}
	const box = navigation.getBoundingClientRect()
	// The whole column, from the top of the window: the panel brings its own top row
	const top = box.top
	style.value = {
		left: `${box.left}px`,
		top: `${top}px`,
		width: `${box.width}px`,
		height: `${Math.max(0, box.bottom - top)}px`,
	}
}

let timer = 0
let resizeObserver: ResizeObserver | undefined
let mutationObserver: MutationObserver | undefined

/**
 * Follow the conversation shown on the right
 */
function onHashChange() {
	currentToken.value = tokenFromHash()
}

onMounted(() => {
	load()
	timer = window.setInterval(load, 30_000)
	place()
	resizeObserver = new ResizeObserver(place)
	resizeObserver.observe(document.body)
	const navigation = document.querySelector('#app-navigation-vue')
	if (navigation) {
		resizeObserver.observe(navigation)
	}
	// The column opens and closes with a class change
	mutationObserver = new MutationObserver(place)
	mutationObserver.observe(document.querySelector('#content-vue') ?? document.body, { attributes: true, subtree: true, attributeFilter: ['class'] })
	window.addEventListener('hashchange', onHashChange)
	EventBus.on('should-refresh-conversations', load)
})

onBeforeUnmount(() => {
	window.clearInterval(timer)
	resizeObserver?.disconnect()
	mutationObserver?.disconnect()
	window.removeEventListener('hashchange', onHashChange)
	EventBus.off('should-refresh-conversations', load)
})
</script>

<template>
	<aside class="rooms-panel" :style="style" aria-label="Salas de reunião">
		<header class="rooms-panel__header">
			<label class="rooms-panel__search">
				<IconMagnify :size="18" />
				<input
					v-model="query"
					type="search"
					placeholder="Pesquisar salas"
					aria-label="Pesquisar salas">
			</label>
			<button
				type="button"
				class="rooms-panel__create"
				title="Criar sala"
				aria-label="Criar sala"
				@click="createRoom">
				<IconPlus :size="20" />
			</button>
		</header>

		<h2 class="rooms-panel__title">
			Salas de reunião
		</h2>

		<div class="rooms-panel__scroll">
			<template v-if="loading">
				<div v-for="n in 7" :key="n" class="rooms-panel__skeleton" />
			</template>

			<p v-else-if="!groups.length" class="rooms-panel__empty">
				Ainda não participa em nenhuma sala.
				<button type="button" class="rooms-panel__empty-create" @click="createRoom">
					Criar sala
				</button>
			</p>

			<section v-for="group in groups" :key="group.id" class="rooms-panel__group">
				<button
					type="button"
					class="rooms-panel__group-title"
					:aria-expanded="!collapsed[group.id]"
					@click="collapsed[group.id] = !collapsed[group.id]">
					<IconChevronDown :size="16" class="rooms-panel__chevron" :class="{ 'rooms-panel__chevron--closed': collapsed[group.id] }" />
					{{ group.title }}
					<span class="rooms-panel__count">{{ group.rooms.length }}</span>
				</button>

				<ul v-show="!collapsed[group.id]" class="rooms-panel__list">
					<li v-for="room in group.rooms" :key="room.token">
						<div
							class="rooms-panel__room"
							:class="{
								'rooms-panel__room--current': room.token === currentToken,
								'rooms-panel__room--live': room.hasCall,
								'rooms-panel__room--unread': room.unreadMessages,
							}"
							role="button"
							tabindex="0"
							:title="room.description || room.displayName"
							@click="openRoom(room)"
							@keydown.enter="openRoom(room)">
							<img
								class="rooms-panel__avatar"
								:src="avatarUrl(room)"
								alt=""
								loading="lazy">
							<span class="rooms-panel__name">{{ room.displayName }}</span>
							<span v-if="room.unreadMessages" class="rooms-panel__unread">{{ room.unreadMessages > 99 ? '99+' : room.unreadMessages }}</span>
							<button
								v-if="group.id !== 'open'"
								type="button"
								class="rooms-panel__call"
								:title="room.hasCall ? 'Entrar na chamada' : 'Iniciar reunião'"
								:aria-label="room.hasCall ? 'Entrar na chamada' : 'Iniciar reunião'"
								@click.stop="joinCall(room)">
								<IconVideoOutline :size="18" />
							</button>
						</div>

						<!-- Who is in the call, as in Discord's voice channels -->
						<ul v-if="room.hasCall && inCall[room.token]?.length" class="rooms-panel__people">
							<li v-for="person in inCall[room.token]" :key="person.key" class="rooms-panel__person">
								<img
									v-if="person.avatar"
									:src="person.avatar"
									alt=""
									loading="lazy">
								<span v-else class="rooms-panel__person-initial">{{ person.name[0] }}</span>
								{{ person.name }}
							</li>
						</ul>
					</li>
				</ul>
			</section>
		</div>
	</aside>
</template>

<style scoped>
.rooms-panel {
	position: fixed;
	z-index: 1900;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	padding: 0 8px 8px;
	/* The column's own backdrop, lined up with it */
	background: var(--tg-backdrop);
	background-attachment: fixed;
	color: var(--tg-text);
	animation: rooms-panel-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

@keyframes rooms-panel-in {
	from {
		opacity: 0;
		transform: translateX(-8px);
	}
}

/* Top row, the height of the window's other top rows: search and "new room" */
.rooms-panel__header {
	display: flex;
	align-items: center;
	gap: 6px;
	height: 64px;
	padding: 0 4px;
	box-sizing: border-box;
}

.rooms-panel__search {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 8px;
	height: 40px;
	padding: 0 14px;
	border-radius: 20px;
	background: var(--tg-card);
	box-shadow: var(--tg-shadow);
	color: var(--tg-text-soft);
}

.rooms-panel__search input {
	flex: 1;
	min-width: 0;
	height: 100%;
	margin: 0;
	padding: 0;
	border: none !important;
	outline: none;
	box-shadow: none !important;
	background: transparent !important;
	color: var(--tg-text);
	font-size: 14px;
}

.rooms-panel__title {
	margin: 4px 0 6px;
	padding: 0 10px;
	font-size: 18px;
	font-weight: 750;
	letter-spacing: -0.015em;
}

.rooms-panel__create {
	display: grid;
	flex: none;
	place-items: center;
	width: 40px;
	height: 40px;
	min-height: 0;
	margin: 0;
	padding: 0;
	border: none !important;
	border-radius: 50%;
	background: var(--tg-card) !important;
	color: var(--tg-text);
	box-shadow: var(--tg-shadow);
	cursor: pointer;
}

.rooms-panel__create:hover {
	color: var(--tg-accent);
}

.rooms-panel__scroll {
	flex: 1;
	overflow-y: auto;
	padding-bottom: 12px;
}

.rooms-panel__group + .rooms-panel__group {
	margin-top: 10px;
}

.rooms-panel__group-title {
	display: flex;
	align-items: center;
	gap: 4px;
	width: 100%;
	min-height: 0;
	margin: 0;
	padding: 6px 8px;
	border: none !important;
	background: transparent !important;
	color: var(--tg-text-soft);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	cursor: pointer;
}

.rooms-panel__group-title:hover {
	color: var(--tg-text);
}

.rooms-panel__chevron {
	transition: transform 160ms ease;
}

.rooms-panel__chevron--closed {
	transform: rotate(-90deg);
}

.rooms-panel__count {
	margin-inline-start: auto;
	font-weight: 600;
}

.rooms-panel__list,
.rooms-panel__people {
	margin: 0;
	padding: 0;
	list-style: none;
}

.rooms-panel__room {
	display: flex;
	align-items: center;
	gap: 12px;
	height: 44px;
	padding: 0 6px 0 10px;
	border-radius: 12px;
	color: var(--tg-text-mid);
	cursor: pointer;
	transition: background-color 120ms ease, color 120ms ease;
}

.rooms-panel__room:hover {
	background: color-mix(in srgb, var(--tg-card) 60%, transparent);
	color: var(--tg-text);
}

.rooms-panel__room--current,
.rooms-panel__room--current:hover {
	background: var(--tg-card);
	color: var(--tg-text);
	box-shadow: 0 1px 3px rgba(16, 24, 40, 0.08);
}

.rooms-panel__room--unread .rooms-panel__name {
	color: var(--tg-text);
	font-weight: 700;
}

.rooms-panel__avatar {
	flex: none;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	background: var(--tg-soft);
	object-fit: cover;
}

.rooms-panel__room--live .rooms-panel__avatar {
	box-shadow: 0 0 0 2px #1fa463;
}

.rooms-panel__name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	font-size: 15px;
	font-weight: 500;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.rooms-panel__unread {
	flex: none;
	min-width: 22px;
	height: 22px;
	padding: 0 6px;
	box-sizing: border-box;
	border-radius: 11px;
	background: var(--tg-accent);
	color: #ffffff;
	font-size: 12px;
	font-weight: 700;
	line-height: 22px;
	text-align: center;
}

.rooms-panel__call {
	flex: none;
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	min-height: 0;
	margin: 0;
	padding: 0;
	border: none !important;
	border-radius: 50%;
	background: transparent !important;
	color: var(--tg-text-mid);
	opacity: 0;
	cursor: pointer;
	transition: opacity 120ms ease, background-color 120ms ease, color 120ms ease;
}

.rooms-panel__room:hover .rooms-panel__call,
.rooms-panel__room--live .rooms-panel__call,
.rooms-panel__call:focus-visible {
	opacity: 1;
}

.rooms-panel__call:hover {
	background: color-mix(in srgb, var(--tg-accent) 14%, transparent) !important;
	color: var(--tg-accent);
}

.rooms-panel__room--live .rooms-panel__call {
	background: #1fa463 !important;
	color: #ffffff;
}

.rooms-panel__people {
	margin: 2px 0 6px 48px;
}

.rooms-panel__person {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 30px;
	color: var(--tg-text-mid);
	font-size: 13.5px;
}

.rooms-panel__person img,
.rooms-panel__person-initial {
	width: 22px;
	height: 22px;
	border-radius: 50%;
}

.rooms-panel__person-initial {
	display: grid;
	place-items: center;
	background: var(--tg-soft);
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
}

.rooms-panel__skeleton {
	height: 40px;
	margin: 4px 0;
	border-radius: 12px;
	background: linear-gradient(90deg, color-mix(in srgb, var(--tg-card) 40%, transparent) 0%, color-mix(in srgb, var(--tg-card) 75%, transparent) 50%, color-mix(in srgb, var(--tg-card) 40%, transparent) 100%);
	background-size: 200% 100%;
	animation: rooms-panel-shimmer 1.2s linear infinite;
}

@keyframes rooms-panel-shimmer {
	to {
		background-position: -200% 0;
	}
}

.rooms-panel__empty {
	padding: 24px 12px;
	color: var(--tg-text-soft);
	text-align: center;
}

.rooms-panel__empty-create {
	display: block;
	margin: 12px auto 0;
	padding: 8px 16px;
	border: none !important;
	border-radius: 18px;
	background: var(--tg-accent) !important;
	color: #ffffff !important;
	font-weight: 600;
	cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
	.rooms-panel,
	.rooms-panel__skeleton {
		animation: none;
	}
}
</style>
