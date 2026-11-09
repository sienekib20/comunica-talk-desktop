<!--
  - SPDX-FileCopyrightText: 2026 Talk Gov.ao
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import type { BrowserItem, BrowserKind } from './mediaBrowser.service.ts'

import { generateUrl } from '@nextcloud/router'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import NcModal from '@nextcloud/vue/components/NcModal'
import IconFileDocumentOutline from 'vue-material-design-icons/FileDocumentOutline.vue'
import IconImageMultipleOutline from 'vue-material-design-icons/ImageMultipleOutline.vue'
import IconLinkVariant from 'vue-material-design-icons/LinkVariant.vue'
import IconMagnify from 'vue-material-design-icons/Magnify.vue'
import IconMessageArrowRightOutline from 'vue-material-design-icons/MessageArrowRightOutline.vue'
import IconPlay from 'vue-material-design-icons/Play.vue'
import { loadLinks, loadShared } from './mediaBrowser.service.ts'

/*
 * Everything shared in every conversation, in one window, as WhatsApp's "media, documents
 * and links": media in a grid, documents and links in lists, grouped by date.
 */

const emit = defineEmits<{ close: [] }>()

const TABS: { id: BrowserKind, label: string, icon: unknown }[] = [
	{ id: 'media', label: 'Multimédia', icon: IconImageMultipleOutline },
	{ id: 'file', label: 'Documentos', icon: IconFileDocumentOutline },
	{ id: 'link', label: 'Ligações', icon: IconLinkVariant },
]

const tab = ref<BrowserKind>('media')
const query = ref('')
const loading = ref(false)
const failed = ref(false)
const cache = ref<Partial<Record<BrowserKind, BrowserItem[]>>>({})

/**
 * Load a tab, once per opening of the window
 *
 * @param kind - Tab to load
 */
async function load(kind: BrowserKind) {
	if (cache.value[kind]) {
		return
	}
	loading.value = true
	failed.value = false
	try {
		cache.value[kind] = kind === 'link' ? await loadLinks() : await loadShared(kind)
	} catch {
		failed.value = true
	} finally {
		loading.value = false
	}
}

watch(tab, (kind) => {
	query.value = ''
	load(kind)
})
onMounted(() => load(tab.value))

const items = computed(() => {
	const all = cache.value[tab.value] ?? []
	const q = query.value.trim().toLowerCase()
	if (!q) {
		return all
	}
	return all.filter((item) => [item.file?.name, item.url, item.text, item.conversation, item.author]
		.some((value) => value?.toLowerCase().includes(q)))
})

/* ---------------------------------------------------------------- Grouping by date */

const DAY = 24 * 60 * 60 * 1000
const monthFormat = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
const shortFormat = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * The section a date belongs to
 *
 * @param timestamp - Seconds since epoch
 */
function sectionOf(timestamp: number): { key: string, label: string, sublabel?: string } {
	const date = new Date(timestamp * 1000)
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const days = Math.floor((today.getTime() - new Date(date).setHours(0, 0, 0, 0)) / DAY)
	if (days <= 0) {
		return { key: 'today', label: 'Hoje', sublabel: dayFormat.format(date) }
	}
	if (days === 1) {
		return { key: 'yesterday', label: 'Ontem', sublabel: dayFormat.format(date) }
	}
	if (days < 7) {
		return { key: 'week', label: 'Esta semana' }
	}
	if (days < 14) {
		return { key: 'lastweek', label: 'Semana passada' }
	}
	const label = monthFormat.format(date)
	return { key: `${date.getFullYear()}-${date.getMonth()}`, label: label[0]!.toUpperCase() + label.slice(1) }
}

const sections = computed(() => {
	const result: { key: string, label: string, sublabel?: string, items: BrowserItem[] }[] = []
	for (const item of items.value) {
		const section = sectionOf(item.timestamp)
		const last = result[result.length - 1]
		if (last?.key === section.key) {
			last.items.push(item)
		} else {
			result.push({ ...section, items: [item] })
		}
	}
	return result
})

/* ---------------------------------------------------------------- Items */

/**
 * Thumbnail of a file
 *
 * @param item - Shared file
 * @param size - Size in pixels
 */
function previewUrl(item: BrowserItem, size = 360): string {
	return generateUrl('/core/preview?fileId={id}&x={size}&y={size}&a=1', { id: item.file!.id, size })
}

/**
 * Icon of a file type
 *
 * @param mimetype - Mime type
 */
function mimeIconUrl(mimetype: string): string {
	return generateUrl('/core/mimeicon?mime={mime}', { mime: mimetype })
}

/**
 * Human size: 1,2 MB
 *
 * @param bytes - Size in bytes
 */
function formatSize(bytes: number): string {
	if (!bytes) {
		return ''
	}
	const units = ['B', 'KB', 'MB', 'GB']
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
	return `${(bytes / 1024 ** exponent).toLocaleString('pt-PT', { maximumFractionDigits: exponent ? 1 : 0 })} ${units[exponent]}`
}

/**
 * Host of a link, without "www."
 *
 * @param url - Link
 */
function hostOf(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./, '')
	} catch {
		return url
	}
}

const isVideo = (item: BrowserItem) => item.file?.mimetype.startsWith('video/')

/**
 * The file as the viewer expects it (same as Talk's own useViewer)
 *
 * @param item - Shared file
 */
function viewerFile(item: BrowserItem) {
	const file = item.file!
	const p = file.permissions
	const permissions = (p & 4 ? 'CK' : '') + (p & 1 ? 'G' : '') + (p & 2 ? 'W' : '') + (p & 8 ? 'D' : '') + (p & 16 ? 'R' : '')
	return {
		fileid: Number.parseInt(file.id, 10),
		filename: file.path.startsWith('/') ? file.path : `/${file.path}`,
		basename: file.name,
		mime: file.mimetype,
		hasPreview: file.hasPreview,
		etag: file.etag,
		permissions,
	}
}

/**
 * Open a shared file: in the app's viewer when it can show it, otherwise its page on the server
 *
 * @param item - Shared file
 */
function openFile(item: BrowserItem) {
	const viewer = window.OCA?.Viewer
	if (viewer && item.file!.path && viewer.mimetypes.includes(item.file!.mimetype)) {
		const list = items.value.filter((other) => other.file && viewer.mimetypes.includes(other.file.mimetype))
		viewer.open({
			path: viewerFile(item).filename,
			list: list.map(viewerFile),
			fileInfo: viewerFile(item),
			canLoop: false,
		})
		return
	}
	window.open(item.file!.link, '_blank')
}

/**
 * Open a link in the browser, or its message when the search only gave part of it
 *
 * @param item - Shared link
 */
function openLink(item: BrowserItem) {
	if (item.url) {
		window.open(item.url, '_blank')
	} else {
		goToMessage(item)
	}
}

/**
 * Show the message in its conversation
 *
 * @param item - Shared item
 */
function goToMessage(item: BrowserItem) {
	emit('close')
	nextTick(() => {
		window.location.hash = `#/call/${item.token}#message_${item.messageId}`
	})
}

const timeFormat = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })
/**
 * Short date and time of an item
 *
 * @param item - Shared item
 */
function when(item: BrowserItem): string {
	const date = new Date(item.timestamp * 1000)
	return `${shortFormat.format(date)} · ${timeFormat.format(date)}`
}

const subtitle = computed(() => ({
	media: 'Fotografias e vídeos de todas as conversas',
	file: 'Documentos de todas as conversas',
	link: 'Ligações de todas as conversas',
})[tab.value])
</script>

<template>
	<NcModal
		size="large"
		name="Multimédia, documentos e ligações"
		class="media-browser"
		@close="emit('close')">
		<div class="media-browser__window">
			<header class="media-browser__header">
				<div class="media-browser__titles">
					<h2 class="media-browser__title">
						{{ TABS.find((t) => t.id === tab)!.label }}
					</h2>
					<p class="media-browser__subtitle">
						{{ subtitle }}
					</p>
				</div>
				<div class="media-browser__tabs" role="tablist">
					<button
						v-for="t in TABS"
						:key="t.id"
						class="media-browser__tab"
						:class="{ 'media-browser__tab--active': tab === t.id }"
						role="tab"
						:aria-selected="tab === t.id"
						type="button"
						@click="tab = t.id">
						<component :is="t.icon" :size="18" />
						{{ t.label }}
					</button>
				</div>
				<label class="media-browser__search">
					<IconMagnify :size="18" />
					<input
						v-model="query"
						type="search"
						placeholder="Pesquisar"
						aria-label="Pesquisar">
				</label>
			</header>

			<div :key="tab" class="media-browser__body">
				<!-- Loading: placeholders in the shape of what is coming -->
				<div v-if="loading" class="media-browser__section">
					<div v-if="tab === 'media'" class="media-browser__grid">
						<div v-for="n in 12" :key="n" class="media-browser__tile media-browser__skeleton" />
					</div>
					<div v-else class="media-browser__list">
						<div v-for="n in 8" :key="n" class="media-browser__row media-browser__skeleton" />
					</div>
				</div>

				<div v-else-if="failed" class="media-browser__empty">
					<p>Não foi possível carregar. Verifique a ligação ao servidor.</p>
				</div>

				<div v-else-if="!sections.length" class="media-browser__empty">
					<component :is="TABS.find((t) => t.id === tab)!.icon" :size="40" />
					<p>{{ query ? 'Nada encontrado' : 'Ainda não há nada partilhado aqui' }}</p>
				</div>

				<template v-else>
					<section v-for="section in sections" :key="section.key" class="media-browser__section">
						<h3 class="media-browser__section-title">
							{{ section.label }}
							<span v-if="section.sublabel">{{ section.sublabel }}</span>
						</h3>

						<!-- Media: a grid of thumbnails -->
						<div v-if="tab === 'media'" class="media-browser__grid">
							<button
								v-for="item in section.items"
								:key="item.key"
								class="media-browser__tile"
								type="button"
								:title="`${item.file!.name} · ${item.conversation}`"
								@click="openFile(item)">
								<img
									v-if="item.file!.hasPreview"
									:src="previewUrl(item)"
									:alt="item.file!.name"
									loading="lazy"
									decoding="async">
								<img
									v-else
									class="media-browser__mime"
									:src="mimeIconUrl(item.file!.mimetype)"
									alt="">
								<span v-if="isVideo(item)" class="media-browser__play"><IconPlay :size="20" /></span>
								<span class="media-browser__caption">{{ item.author || item.conversation }}</span>
							</button>
						</div>

						<!-- Documents -->
						<ul v-else-if="tab === 'file'" class="media-browser__list">
							<li v-for="item in section.items" :key="item.key" class="media-browser__row">
								<button class="media-browser__row-main" type="button" @click="openFile(item)">
									<img class="media-browser__row-icon" :src="mimeIconUrl(item.file!.mimetype)" alt="">
									<span class="media-browser__row-text">
										<span class="media-browser__row-title">{{ item.file!.name }}</span>
										<span class="media-browser__row-meta">
											{{ [formatSize(item.file!.size), item.conversation, item.author, when(item)].filter(Boolean).join(' · ') }}
										</span>
									</span>
								</button>
								<button
									class="media-browser__goto"
									type="button"
									title="Ver na conversa"
									aria-label="Ver na conversa"
									@click="goToMessage(item)">
									<IconMessageArrowRightOutline :size="18" />
								</button>
							</li>
						</ul>

						<!-- Links -->
						<ul v-else class="media-browser__list">
							<li v-for="item in section.items" :key="item.key" class="media-browser__row">
								<button class="media-browser__row-main" type="button" @click="openLink(item)">
									<span class="media-browser__row-icon media-browser__row-icon--link"><IconLinkVariant :size="20" /></span>
									<span class="media-browser__row-text">
										<span class="media-browser__row-title">{{ hostOf(item.url ?? item.text ?? '') }}</span>
										<span class="media-browser__row-url">{{ item.text }}</span>
										<span class="media-browser__row-meta">
											{{ [item.conversation, item.author, when(item)].filter(Boolean).join(' · ') }}
										</span>
									</span>
								</button>
								<button
									class="media-browser__goto"
									type="button"
									title="Ver na conversa"
									aria-label="Ver na conversa"
									@click="goToMessage(item)">
									<IconMessageArrowRightOutline :size="18" />
								</button>
							</li>
						</ul>
					</section>
				</template>
			</div>
		</div>
	</NcModal>
</template>

<style scoped>
.media-browser :deep(.modal-wrapper .modal-container) {
	width: min(1100px, calc(100vw - 64px)) !important;
	height: min(780px, calc(100vh - 64px)) !important;
	max-height: none !important;
}

/* The window has its own header: NcModal's title (kept for screen readers) is not shown */
.media-browser :deep(.modal-header__name) {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}

.media-browser__window {
	display: flex;
	flex-direction: column;
	height: 100%;
	background: var(--tg-card);
	color: var(--tg-text);
}

.media-browser__header {
	display: grid;
	grid-template-columns: 1fr auto auto;
	align-items: center;
	gap: 16px;
	padding: 18px 64px 14px 24px;
	border-bottom: 1px solid var(--tg-line);
}

.media-browser__title {
	margin: 0;
	font-size: 20px;
	font-weight: 700;
	letter-spacing: -0.01em;
}

.media-browser__subtitle {
	margin: 2px 0 0;
	color: var(--tg-text-soft);
	font-size: 13px;
}

.media-browser__tabs {
	display: flex;
	gap: 4px;
	padding: 4px;
	border-radius: 12px;
	background: var(--tg-soft);
}

.media-browser__tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 34px;
	padding: 0 14px;
	border: none;
	border-radius: 9px;
	background: transparent;
	color: var(--tg-text-mid);
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.media-browser__tab:hover {
	color: var(--tg-text);
}

.media-browser__tab--active {
	background: var(--tg-card);
	color: var(--tg-text);
	font-weight: 600;
	box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
}

.media-browser__tab:focus {
	outline: none;
	box-shadow: none;
}

.media-browser__tab--active:focus {
	box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
}

.media-browser__tab:focus-visible {
	outline: 2px solid var(--tg-accent);
	outline-offset: 2px;
}

.media-browser__search {
	display: flex;
	align-items: center;
	gap: 6px;
	width: 200px;
	height: 38px;
	padding: 0 12px;
	border-radius: 19px;
	background: var(--tg-soft);
	color: var(--tg-text-soft);
}

.media-browser__search input {
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

.media-browser__body {
	flex: 1;
	overflow-y: auto;
	padding: 8px 24px 24px;
	animation: media-browser-in 260ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

@keyframes media-browser-in {
	from {
		opacity: 0;
		transform: translateY(6px);
	}
}

.media-browser__section-title {
	position: sticky;
	top: -8px;
	z-index: 1;
	display: flex;
	align-items: baseline;
	gap: 8px;
	margin: 0;
	padding: 14px 0 10px;
	background: var(--tg-card);
	font-size: 15px;
	font-weight: 700;
}

.media-browser__section-title span {
	color: var(--tg-text-soft);
	font-size: 13px;
	font-weight: 500;
}

.media-browser__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 6px;
}

.media-browser__tile {
	position: relative;
	aspect-ratio: 1;
	margin: 0;
	padding: 0;
	overflow: hidden;
	border: none;
	border-radius: 10px;
	background: var(--tg-soft);
	cursor: pointer;
}

.media-browser__tile img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1);
}

.media-browser__tile:hover img {
	transform: scale(1.04);
}

.media-browser__tile .media-browser__mime {
	width: 48px;
	height: 48px;
	margin: auto;
	object-fit: contain;
}

.media-browser__tile:focus-visible {
	outline: 2px solid var(--tg-accent);
	outline-offset: 2px;
}

.media-browser__caption {
	position: absolute;
	inset: auto 0 0;
	padding: 18px 8px 6px;
	overflow: hidden;
	background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
	color: #ffffff;
	font-size: 12px;
	font-weight: 600;
	text-align: start;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0;
	transition: opacity 160ms ease;
}

.media-browser__tile:hover .media-browser__caption,
.media-browser__tile:focus-visible .media-browser__caption {
	opacity: 1;
}

.media-browser__play {
	position: absolute;
	top: 50%;
	left: 50%;
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.5);
	color: #ffffff;
	transform: translate(-50%, -50%);
}

.media-browser__list {
	display: flex;
	flex-direction: column;
	gap: 2px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.media-browser__row {
	display: flex;
	align-items: center;
	gap: 4px;
	min-height: 58px;
	border-radius: 12px;
	transition: background-color 120ms ease;
}

.media-browser__row:hover {
	background: var(--tg-soft);
}

.media-browser__row-main {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 8px 10px;
	border: none;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.media-browser__row-icon {
	flex: none;
	width: 36px;
	height: 36px;
	object-fit: contain;
}

.media-browser__row-icon--link {
	display: grid;
	place-items: center;
	border-radius: 10px;
	background: color-mix(in srgb, var(--tg-accent) 12%, transparent);
	color: var(--tg-accent);
}

.media-browser__row-text {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.media-browser__row-title,
.media-browser__row-url,
.media-browser__row-meta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.media-browser__row-title {
	font-size: 14px;
	font-weight: 600;
}

.media-browser__row-url {
	color: var(--tg-accent);
	font-size: 13px;
}

.media-browser__row-meta {
	color: var(--tg-text-soft);
	font-size: 12.5px;
}

.media-browser__goto {
	flex: none;
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	margin-inline-end: 8px;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: var(--tg-text-mid);
	opacity: 0;
	cursor: pointer;
	transition: opacity 120ms ease, background-color 120ms ease;
}

.media-browser__row:hover .media-browser__goto,
.media-browser__goto:focus-visible {
	opacity: 1;
}

.media-browser__goto:hover {
	background: var(--tg-card);
}

.media-browser__skeleton {
	background: linear-gradient(90deg, var(--tg-soft) 0%, color-mix(in srgb, var(--tg-soft) 50%, var(--tg-card)) 50%, var(--tg-soft) 100%);
	background-size: 200% 100%;
	animation: media-browser-shimmer 1.2s linear infinite;
}

.media-browser__list .media-browser__skeleton {
	height: 58px;
	margin-bottom: 4px;
}

@keyframes media-browser-shimmer {
	to {
		background-position: -200% 0;
	}
}

.media-browser__empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	height: 100%;
	min-height: 300px;
	color: var(--tg-text-soft);
	font-size: 15px;
}

@media (prefers-reduced-motion: reduce) {
	.media-browser__body,
	.media-browser__skeleton {
		animation: none;
	}
}
</style>
