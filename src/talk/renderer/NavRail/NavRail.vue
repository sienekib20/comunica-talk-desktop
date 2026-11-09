<!--
  - SPDX-FileCopyrightText: 2026 Talk Gov.ao
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconArchiveOutline from 'vue-material-design-icons/ArchiveOutline.vue'
import IconCogOutline from 'vue-material-design-icons/CogOutline.vue'
import IconForumOutline from 'vue-material-design-icons/ForumOutline.vue'
import IconHomeOutline from 'vue-material-design-icons/HomeOutline.vue'
import IconImageMultipleOutline from 'vue-material-design-icons/ImageMultipleOutline.vue'
import IconMessageTextOutline from 'vue-material-design-icons/MessageTextOutline.vue'
import IconThemeLightDark from 'vue-material-design-icons/ThemeLightDark.vue'
import IconWeatherNight from 'vue-material-design-icons/WeatherNight.vue'
import IconWeatherSunny from 'vue-material-design-icons/WeatherSunny.vue'
import MediaBrowser from '../MediaBrowser/MediaBrowser.vue'
import { useAppConfigStore } from '../Settings/appConfig.store.ts'
import { animate, reducedMotion, SPRING_MOVE } from '../utils/motion.ts'

/*
 * Vertical navigation rail, in the place of Talk's own "Home", "Threads", "Archived" and
 * "App settings" rows of the left sidebar. Those rows stay in the DOM (hidden by
 * chat.styles.css) and the rail presses them, so Talk keeps doing the actual navigation.
 */

type Section = 'chats' | 'threads' | 'archived' | 'home'

const appConfigStore = useAppConfigStore()

/** System, light and dark in turn, the same setting as in the app settings */
const THEMES = ['default', 'light', 'dark'] as const
const theme = computed(() => appConfigStore.getAppConfigValue('theme'))
const themeLabel = computed(() => ({
	// This app ships no translations of its own, and it is used in Portuguese only
	default: 'Tema: igual ao sistema',
	light: 'Tema: claro',
	dark: 'Tema: escuro',
})[theme.value])

/**
 * Switch to the next theme
 */
function cycleTheme() {
	const next = THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length]!
	appConfigStore.setAppConfigValue('theme', next)
}

const active = ref<Section>('chats')
/** Media, documents and links of every conversation */
const mediaOpen = ref(false)
const unread = ref(0)
const hasArchived = ref(false)

/**
 * Press one of Talk's sidebar buttons, found by its icon
 *
 * @param iconClass - Class of the material icon inside the button
 */
function pressSidebarButton(iconClass: string): boolean {
	const icon = document.querySelector(`#app-navigation-vue .navigation-buttons-container .${iconClass}`)
	const button = icon?.closest<HTMLElement>('a, button')
	button?.click()
	return !!button
}

/**
 * Make sure the conversations column is visible
 */
function openNavigation() {
	if (document.querySelector('.app-navigation--closed')) {
		document.querySelector<HTMLElement>('.app-navigation-toggle')?.click()
	}
}

/**
 * Leave the threads or archived list, if one of them is shown
 */
function backToConversations() {
	pressSidebarButton('arrow-left-icon')
}

const actions: Record<Section, () => void> = {
	chats: () => backToConversations(),
	threads: () => {
		backToConversations()
		// The threads button only renders once the plain list is back
		requestAnimationFrame(() => pressSidebarButton('forum-outline-icon'))
	},
	archived: () => {
		backToConversations()
		requestAnimationFrame(() => pressSidebarButton('archive-outline-icon'))
	},
	home: () => pressSidebarButton('home-outline-icon'),
}

/**
 * Switch the section shown in the conversations column
 *
 * @param section - Section to show
 */
function select(section: Section) {
	openNavigation()
	actions[section]()
	active.value = section
}

/**
 * Open Talk's settings dialog
 */
function openSettings() {
	pressSidebarButton('cog-outline-icon')
}

/**
 * Keep the rail in sync with what Talk shows: the active section, the unread total
 * and whether there are archived conversations
 */
function sync() {
	const navigation = document.querySelector('#app-navigation-vue')
	if (!navigation) {
		return
	}

	const caption = navigation.querySelector('.navigation-caption')?.textContent?.trim() ?? ''
	const inSubList = !!navigation.querySelector('.navigation-buttons-container .arrow-left-icon')
	if (inSubList) {
		active.value = caption === t('spreed', 'Archived conversations') ? 'archived' : 'threads'
	} else if (location.hash === '#/apps/spreed' || location.hash === '#/' || location.hash === '') {
		active.value = 'home'
	} else {
		active.value = 'chats'
	}

	hasArchived.value = !!navigation.querySelector('.navigation-buttons-container .archive-outline-icon') || active.value === 'archived'

	unread.value = [...navigation.querySelectorAll('.conversation .counter-bubble__counter')]
		.reduce((sum, counter) => sum + (Number.parseInt(counter.textContent ?? '', 10) || 0), 0)
}

/*
 * The active section is marked by one accent circle that glides from button to button
 * (like a shared-layout animation), instead of each button switching colour on its own.
 */
const rail = ref<HTMLElement>()
const indicator = ref<HTMLElement>()
let indicatorPlaced = false

/**
 * Move the accent circle under the active button
 *
 * @param instant - Jump there without animating (first placement, window resize)
 */
function placeIndicator(instant: boolean = false) {
	const button = rail.value?.querySelector<HTMLElement>(`[data-section="${active.value}"]`)
	if (!indicator.value || !rail.value) {
		return
	}
	if (!button) {
		indicator.value.style.opacity = '0'
		return
	}
	const top = button.getBoundingClientRect().top - rail.value.getBoundingClientRect().top
	const to = `translateY(${top}px)`
	indicator.value.style.opacity = '1'
	if (instant || !indicatorPlaced || reducedMotion.matches) {
		indicator.value.style.transform = to
	} else {
		animate(indicator.value, { transform: to }, SPRING_MOVE).then(() => {
			indicator.value!.style.transform = to
		})
	}
	indicatorPlaced = true
}

watch([active, hasArchived], () => nextTick(() => placeIndicator()))

let resizeObserver: ResizeObserver | undefined
let observer: MutationObserver | undefined
let throttle: number | undefined

onMounted(() => {
	observer = new MutationObserver(() => {
		if (throttle === undefined) {
			throttle = window.setTimeout(() => {
				throttle = undefined
				sync()
			}, 250)
		}
	})
	observer.observe(document.body, { childList: true, subtree: true, characterData: true })
	window.addEventListener('hashchange', sync)
	sync()

	resizeObserver = new ResizeObserver(() => placeIndicator(true))
	resizeObserver.observe(rail.value!)
	nextTick(() => placeIndicator(true))
})

onBeforeUnmount(() => {
	observer?.disconnect()
	resizeObserver?.disconnect()
	window.removeEventListener('hashchange', sync)
	window.clearTimeout(throttle)
})
</script>

<template>
	<nav ref="rail" class="nav-rail" :aria-label="t('talk_desktop', 'Main navigation')">
		<span ref="indicator" class="nav-rail__indicator" aria-hidden="true" />
		<div class="nav-rail__group">
			<button
				class="nav-rail__item"
				:class="{ 'nav-rail__item--active': active === 'chats' }"
				data-section="chats"
				:aria-pressed="active === 'chats'"
				:aria-label="t('spreed', 'Conversations')"
				:data-tooltip="t('spreed', 'Conversations')"
				@mousedown.prevent
				@click="select('chats')">
				<IconMessageTextOutline :size="20" />
				<span v-if="unread" class="nav-rail__badge">{{ unread > 99 ? '99+' : unread }}</span>
			</button>
			<button
				class="nav-rail__item"
				:class="{ 'nav-rail__item--active': active === 'threads' }"
				data-section="threads"
				:aria-pressed="active === 'threads'"
				:aria-label="t('spreed', 'Threads')"
				:data-tooltip="t('spreed', 'Threads')"
				@mousedown.prevent
				@click="select('threads')">
				<IconForumOutline :size="20" />
			</button>
			<button
				class="nav-rail__item"
				:class="{ 'nav-rail__item--active': active === 'home' }"
				data-section="home"
				:aria-pressed="active === 'home'"
				:aria-label="t('spreed', 'Home')"
				:data-tooltip="t('spreed', 'Home')"
				@mousedown.prevent
				@click="select('home')">
				<IconHomeOutline :size="20" />
			</button>
		</div>

		<div class="nav-rail__group">
			<button
				class="nav-rail__item"
				aria-label="Multimédia, documentos e ligações"
				data-tooltip="Multimédia, documentos e ligações"
				@mousedown.prevent
				@click="mediaOpen = true">
				<IconImageMultipleOutline :size="20" />
			</button>
			<button
				v-if="hasArchived"
				class="nav-rail__item"
				:class="{ 'nav-rail__item--active': active === 'archived' }"
				data-section="archived"
				:aria-pressed="active === 'archived'"
				:aria-label="t('spreed', 'Archived conversations')"
				:data-tooltip="t('spreed', 'Archived conversations')"
				@mousedown.prevent
				@click="select('archived')">
				<IconArchiveOutline :size="20" />
			</button>
			<button
				class="nav-rail__item"
				:aria-label="themeLabel"
				:data-tooltip="themeLabel"
				@mousedown.prevent
				@click="cycleTheme">
				<IconWeatherSunny v-if="theme === 'light'" :size="20" />
				<IconWeatherNight v-else-if="theme === 'dark'" :size="20" />
				<IconThemeLightDark v-else :size="20" />
			</button>
			<button
				class="nav-rail__item"
				:aria-label="t('spreed', 'App settings')"
				:data-tooltip="t('spreed', 'App settings')"
				@mousedown.prevent
				@click="openSettings">
				<IconCogOutline :size="20" />
			</button>
		</div>
		<MediaBrowser v-if="mediaOpen" @close="mediaOpen = false" />
	</nav>
</template>

<style scoped>
.nav-rail {
	position: fixed;
	z-index: 10;
	inset-block: var(--header-height) var(--tg-gap);
	inset-inline-start: var(--tg-gap);
	width: var(--tg-rail-width);
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	align-items: center;
	padding-block: 12px 4px;
	background: transparent;
	user-select: none;
}

.nav-rail__group {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.nav-rail__item {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 52px;
	height: 52px;
	margin: 0;
	padding: 0;
	border: none;
	border-radius: 50%;
	background: var(--tg-card);
	color: var(--tg-text);
	box-shadow: var(--tg-shadow);
	cursor: pointer;
	transition: background-color 140ms ease, color 140ms ease, transform 140ms ease;
}

.nav-rail__item:hover {
	transform: translateY(-1px);
}

.nav-rail__item:focus-visible {
	outline: 2px solid var(--tg-accent);
	outline-offset: 3px;
}

.nav-rail__item--active,
.nav-rail__item--active:hover {
	background: transparent;
	color: var(--tg-on-accent);
	box-shadow: none;
}

.nav-rail__item--active:hover {
	transform: none;
}

.nav-rail__item:active {
	transform: scale(0.94);
}

/* The accent circle behind the active button; it glides between buttons */
.nav-rail__indicator {
	position: absolute;
	top: 0;
	inset-inline-start: calc(50% - 26px);
	width: 52px;
	height: 52px;
	border-radius: 50%;
	background: var(--tg-accent);
	box-shadow: 0 6px 18px rgba(47, 116, 208, 0.35);
	opacity: 0;
	pointer-events: none;
	will-change: transform;
}

.nav-rail__item {
	z-index: 1;
}

.nav-rail__badge {
	position: absolute;
	inset-block-start: -3px;
	inset-inline-end: -5px;
	min-width: 20px;
	height: 20px;
	padding-inline: 5px;
	border-radius: 10px;
	background: var(--tg-danger);
	color: #fff;
	font-size: 11px;
	font-weight: 600;
	line-height: 20px;
	text-align: center;
	box-shadow: 0 0 0 2px var(--tg-card);
}

/* Tooltip: a dark pill to the right of the button */
.nav-rail__item[data-tooltip]::after {
	content: attr(data-tooltip);
	position: absolute;
	inset-inline-start: calc(100% + 12px);
	top: 50%;
	z-index: 30;
	padding: 6px 10px;
	border-radius: 8px;
	background: #1f2328;
	color: #ffffff;
	font-size: 12.5px;
	font-weight: 500;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transform: translate(-4px, -50%);
	transition: opacity 120ms ease, transform 120ms ease;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

.nav-rail__item[data-tooltip]:hover::after,
.nav-rail__item[data-tooltip]:focus-visible::after {
	opacity: 1;
	transform: translate(0, -50%);
	transition-delay: 250ms;
}

/* Nextcloud's global button focus styles: none on the rail, an accent ring for keyboard focus */
.nav-rail__item:focus {
	border: none !important;
	box-shadow: var(--tg-shadow) !important;
	outline: none !important;
}

.nav-rail__item--active:focus {
	box-shadow: none !important;
}

.nav-rail__item:focus-visible {
	outline: 2px solid var(--tg-accent) !important;
	outline-offset: 3px !important;
}
</style>
