<!--
  - SPDX-FileCopyrightText: 2026 Talk Gov.ao
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'
import { EventBus } from '@talk/src/services/EventBus.ts'
import { computed, onMounted, ref, watch } from 'vue'
import NcModal from '@nextcloud/vue/components/NcModal'
import IconAccountGroupOutline from 'vue-material-design-icons/AccountGroupOutline.vue'
import IconDoorOpen from 'vue-material-design-icons/DoorOpen.vue'
import IconMagnify from 'vue-material-design-icons/Magnify.vue'
import IconMessageTextOutline from 'vue-material-design-icons/MessageTextOutline.vue'
import IconPlus from 'vue-material-design-icons/Plus.vue'
import IconVideoOutline from 'vue-material-design-icons/VideoOutline.vue'

/*
 * Meeting rooms: the group and public conversations the user belongs to (rooms with a call going
 * on first), and the open rooms of the server they can join. A room opens as its conversation;
 * "Iniciar reunião" / "Entrar na chamada" opens it and presses its call button. New rooms are
 * created with Talk's own dialog.
 */

const emit = defineEmits<{ close: [] }>()

type Room = {
	token: string
	displayName: string
	description?: string
	type: number
	hasCall?: boolean
	lastActivity?: number
	isFavorite?: boolean
	avatarVersion?: string
	unreadMessages?: number
	objectType?: string
}

const OCS = { headers: { 'OCS-APIRequest': 'true', Accept: 'application/json' } }
const GROUP = 2
const PUBLIC = 3

const tab = ref<'mine' | 'open'>('mine')
const query = ref('')
const loading = ref(false)
const failed = ref(false)
const mine = ref<Room[]>([])
const open = ref<Room[]>([])

/**
 * The user's group and public rooms
 */
async function loadMine() {
	const { data } = await axios.get(generateOcsUrl('apps/spreed/api/v4/room'), OCS)
	mine.value = (data.ocs.data as Room[])
		.filter((room) => (room.type === GROUP || room.type === PUBLIC) && !room.objectType?.startsWith('share:'))
		.sort((a, b) => (Number(b.hasCall) - Number(a.hasCall)) || ((b.lastActivity ?? 0) - (a.lastActivity ?? 0)))
}

/**
 * Open rooms of the server the user is not in yet
 */
async function loadOpen() {
	const { data } = await axios.get(generateOcsUrl('apps/spreed/api/v4/listed-room'), {
		...OCS,
		params: { searchTerm: query.value.trim() },
	})
	open.value = data.ocs.data as Room[]
}

/**
 * Load the current tab
 */
async function load() {
	loading.value = true
	failed.value = false
	try {
		await (tab.value === 'mine' ? loadMine() : loadOpen())
	} catch (error) {
		console.error('Could not load the rooms', error)
		failed.value = true
	} finally {
		loading.value = false
	}
}

onMounted(load)
watch(tab, () => {
	query.value = ''
	load()
})

let searchTimer = 0
watch(query, () => {
	if (tab.value === 'open') {
		window.clearTimeout(searchTimer)
		searchTimer = window.setTimeout(load, 300)
	}
})

const rooms = computed(() => {
	const list = tab.value === 'mine' ? mine.value : open.value
	const q = query.value.trim().toLowerCase()
	return tab.value === 'mine' && q
		? list.filter((room) => `${room.displayName} ${room.description ?? ''}`.toLowerCase().includes(q))
		: list
})

const inCall = computed(() => mine.value.filter((room) => room.hasCall).length)

/**
 * Picture of a room
 *
 * @param room - Room
 */
function avatarUrl(room: Room): string {
	const dark = window.matchMedia('(prefers-color-scheme: dark)').matches ? '/dark' : ''
	return generateOcsUrl('apps/spreed/api/v1/room/{token}/avatar', { token: room.token }) + dark + (room.avatarVersion ? `?v=${room.avatarVersion}` : '')
}

const relative = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' })
/**
 * "há 2 dias", "ontem"…
 *
 * @param room - Room
 */
function activity(room: Room): string {
	if (!room.lastActivity) {
		return ''
	}
	const minutes = Math.round((room.lastActivity * 1000 - Date.now()) / 60000)
	if (minutes > -60) {
		return relative.format(minutes, 'minute')
	}
	const hours = Math.round(minutes / 60)
	if (hours > -24) {
		return relative.format(hours, 'hour')
	}
	return relative.format(Math.round(hours / 24), 'day')
}

/**
 * Show a room's conversation
 *
 * @param room - Room
 */
function openRoom(room: Room) {
	emit('close')
	window.location.hash = `#/call/${room.token}`
}

/**
 * Open a room and press its call button (start the meeting or join the one going on)
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
	emit('close')
	EventBus.emit('new-conversation-dialog:show')
}
</script>

<template>
	<NcModal
		size="large"
		name="Salas de reunião"
		class="rooms"
		@close="emit('close')">
		<div class="rooms__window">
			<header class="rooms__header">
				<div>
					<h2 class="rooms__title">
						Salas de reunião
					</h2>
					<p class="rooms__subtitle">
						{{ inCall ? (inCall === 1 ? '1 sala com chamada a decorrer' : `${inCall} salas com chamada a decorrer`) : 'As suas salas e as salas abertas do servidor' }}
					</p>
				</div>
				<div class="rooms__tabs" role="tablist">
					<button
						type="button"
						role="tab"
						class="rooms__tab"
						:class="{ 'rooms__tab--active': tab === 'mine' }"
						:aria-selected="tab === 'mine'"
						@click="tab = 'mine'">
						<IconAccountGroupOutline :size="18" />
						As minhas salas
					</button>
					<button
						type="button"
						role="tab"
						class="rooms__tab"
						:class="{ 'rooms__tab--active': tab === 'open' }"
						:aria-selected="tab === 'open'"
						@click="tab = 'open'">
						<IconDoorOpen :size="18" />
						Salas abertas
					</button>
				</div>
				<label class="rooms__search">
					<IconMagnify :size="18" />
					<input
						v-model="query"
						type="search"
						placeholder="Pesquisar salas"
						aria-label="Pesquisar salas">
				</label>
				<button type="button" class="rooms__create" @click="createRoom">
					<IconPlus :size="20" />
					Criar sala
				</button>
			</header>

			<div :key="tab" class="rooms__body">
				<div v-if="loading" class="rooms__grid">
					<div v-for="n in 6" :key="n" class="rooms__card rooms__skeleton" />
				</div>

				<div v-else-if="failed" class="rooms__empty">
					Não foi possível carregar as salas. Verifique a ligação ao servidor.
				</div>

				<div v-else-if="!rooms.length" class="rooms__empty">
					<IconDoorOpen :size="40" />
					<p>
						{{ query
							? 'Nenhuma sala encontrada'
							: tab === 'mine' ? 'Ainda não participa em nenhuma sala' : 'Não há salas abertas para entrar' }}
					</p>
					<button
						v-if="tab === 'mine' && !query"
						type="button"
						class="rooms__create"
						@click="createRoom">
						<IconPlus :size="20" />
						Criar sala
					</button>
				</div>

				<div v-else class="rooms__grid">
					<article
						v-for="room in rooms"
						:key="room.token"
						class="rooms__card"
						:class="{ 'rooms__card--live': room.hasCall }">
						<div class="rooms__card-head">
							<img
								class="rooms__avatar"
								:src="avatarUrl(room)"
								alt=""
								loading="lazy">
							<div class="rooms__card-text">
								<h3 class="rooms__name" :title="room.displayName">
									{{ room.displayName }}
								</h3>
								<p class="rooms__meta">
									<span v-if="room.hasCall" class="rooms__live"><span class="rooms__live-dot" /> Chamada a decorrer</span>
									<template v-else>
										{{ room.type === PUBLIC ? 'Pública' : 'Grupo' }}<template v-if="activity(room)">
											· {{ activity(room) }}
										</template>
									</template>
								</p>
							</div>
							<span v-if="room.unreadMessages" class="rooms__unread">{{ room.unreadMessages > 99 ? '99+' : room.unreadMessages }}</span>
						</div>
						<p v-if="room.description" class="rooms__description">
							{{ room.description }}
						</p>
						<div class="rooms__actions">
							<template v-if="tab === 'mine'">
								<button type="button" class="rooms__action rooms__action--primary" @click="joinCall(room)">
									<IconVideoOutline :size="18" />
									{{ room.hasCall ? 'Entrar na chamada' : 'Iniciar reunião' }}
								</button>
								<button type="button" class="rooms__action" @click="openRoom(room)">
									<IconMessageTextOutline :size="18" />
									Abrir
								</button>
							</template>
							<button
								v-else
								type="button"
								class="rooms__action rooms__action--primary"
								@click="openRoom(room)">
								<IconDoorOpen :size="18" />
								Entrar na sala
							</button>
						</div>
					</article>
				</div>
			</div>
		</div>
	</NcModal>
</template>

<style scoped>
.rooms :deep(.modal-wrapper .modal-container) {
	width: min(1040px, calc(100vw - 64px)) !important;
	height: min(760px, calc(100vh - 64px)) !important;
	max-height: none !important;
}

.rooms :deep(.modal-header__name) {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}

.rooms__window {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--tg-card);
	color: var(--tg-text);
}

.rooms__header {
	display: grid;
	grid-template-columns: 1fr auto auto auto;
	align-items: center;
	gap: 14px;
	padding: 18px 64px 14px 24px;
	border-bottom: 1px solid var(--tg-line);
}

.rooms__title {
	margin: 0;
	font-size: 20px;
	font-weight: 700;
	letter-spacing: -0.01em;
}

.rooms__subtitle {
	margin: 2px 0 0;
	color: var(--tg-text-soft);
	font-size: 13px;
}

.rooms__tabs {
	display: flex;
	gap: 4px;
	padding: 4px;
	border-radius: 12px;
	background: var(--tg-soft);
}

.rooms__tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	min-height: 0;
	margin: 0;
	padding: 0 12px;
	border: none !important;
	border-radius: 9px;
	background: transparent !important;
	color: var(--tg-text-mid);
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
}

.rooms__tab--active {
	background: var(--tg-card) !important;
	color: var(--tg-text);
	font-weight: 600;
	box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
}

.rooms__search {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 180px;
	height: 38px;
	padding: 0 12px;
	border-radius: 19px;
	background: var(--tg-soft);
	color: var(--tg-text-soft);
}

.rooms__search input {
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

.rooms__create {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 38px;
	min-height: 0;
	margin: 0;
	padding: 0 16px 0 12px;
	border: none !important;
	border-radius: 19px;
	background: var(--tg-accent) !important;
	color: #ffffff !important;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	box-shadow: 0 4px 12px color-mix(in srgb, var(--tg-accent) 30%, transparent);
}

.rooms__create:hover {
	background: var(--tg-accent-hover, var(--tg-accent)) !important;
}

.rooms__body {
	flex: 1;
	overflow-y: auto;
	padding: 20px 24px 24px;
	background: var(--tg-chat-surface);
	animation: rooms-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

@keyframes rooms-in {
	from {
		opacity: 0;
		transform: translateY(6px);
	}
}

.rooms__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
	gap: 12px;
}

.rooms__card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-height: 150px;
	box-sizing: border-box;
	padding: 16px;
	border: 1px solid var(--tg-line);
	border-radius: 16px;
	background: var(--tg-card);
	box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
	transition: box-shadow 160ms ease, transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

.rooms__card:hover {
	box-shadow: 0 8px 24px rgba(16, 24, 40, 0.1);
	transform: translateY(-2px);
}

.rooms__card--live {
	border-color: color-mix(in srgb, #1fa463 45%, var(--tg-line));
}

.rooms__card-head {
	display: flex;
	align-items: center;
	gap: 12px;
}

.rooms__avatar {
	flex: none;
	width: 44px;
	height: 44px;
	border-radius: 50%;
	background: var(--tg-soft);
	object-fit: cover;
}

.rooms__card-text {
	flex: 1;
	min-width: 0;
}

.rooms__name {
	margin: 0;
	overflow: hidden;
	font-size: 15px;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.rooms__meta {
	margin: 2px 0 0;
	color: var(--tg-text-soft);
	font-size: 12.5px;
}

.rooms__live {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: #1fa463;
	font-weight: 600;
}

.rooms__live-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #1fa463;
	animation: rooms-pulse 1.6s ease-out infinite;
}

@keyframes rooms-pulse {
	0% {
		box-shadow: 0 0 0 0 rgba(31, 164, 99, 0.5);
	}

	100% {
		box-shadow: 0 0 0 8px rgba(31, 164, 99, 0);
	}
}

.rooms__unread {
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

.rooms__description {
	display: -webkit-box;
	margin: 0;
	overflow: hidden;
	color: var(--tg-text-mid);
	font-size: 13.5px;
	line-height: 1.4;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.rooms__actions {
	display: flex;
	gap: 8px;
	margin-top: auto;
}

.rooms__action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: 34px;
	min-height: 0;
	margin: 0;
	padding: 0 12px;
	border: 1px solid var(--tg-line) !important;
	border-radius: 17px;
	background: var(--tg-card) !important;
	color: var(--tg-text) !important;
	font-size: 13.5px;
	font-weight: 600;
	cursor: pointer;
}

.rooms__action:hover {
	background: var(--tg-soft) !important;
}

.rooms__action--primary {
	flex: 1;
	border-color: transparent !important;
	background: color-mix(in srgb, var(--tg-accent) 12%, transparent) !important;
	color: var(--tg-accent) !important;
}

.rooms__action--primary:hover {
	background: color-mix(in srgb, var(--tg-accent) 18%, transparent) !important;
}

.rooms__card--live .rooms__action--primary {
	background: #1fa463 !important;
	color: #ffffff !important;
}

.rooms__skeleton {
	border: none;
	background: linear-gradient(90deg, var(--tg-soft) 0%, color-mix(in srgb, var(--tg-soft) 50%, var(--tg-card)) 50%, var(--tg-soft) 100%);
	background-size: 200% 100%;
	animation: rooms-shimmer 1.2s linear infinite;
}

@keyframes rooms-shimmer {
	to {
		background-position: -200% 0;
	}
}

.rooms__empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	min-height: 320px;
	color: var(--tg-text-soft);
	font-size: 15px;
	text-align: center;
}

@media (prefers-reduced-motion: reduce) {
	.rooms__body,
	.rooms__skeleton,
	.rooms__live-dot {
		animation: none;
	}

	.rooms__card:hover {
		transform: none;
	}
}
</style>
