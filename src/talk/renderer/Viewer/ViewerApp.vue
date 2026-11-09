<!--
  - SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup>
import { getCurrentUser } from '@nextcloud/auth'
import axios from '@nextcloud/axios'
import { translate as t } from '@nextcloud/l10n'
import { generateRemoteUrl, generateUrl } from '@nextcloud/router'
import { EventBus } from '@talk/src/services/EventBus.ts'
import { useChatExtrasStore } from '@talk/src/stores/chatExtras.ts'
import { useForwardSelectionStore } from '@talk/src/stores/forwardSelection.ts'
import { computed, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionLink from '@nextcloud/vue/components/NcActionLink'
import NcModal from '@nextcloud/vue/components/NcModal'
import IconDownload from 'vue-material-design-icons/Download.vue'
import IconMessageArrowRight from 'vue-material-design-icons/MessageArrowRightOutline.vue'
import IconOpenInNew from 'vue-material-design-icons/OpenInNew.vue'
import IconReply from 'vue-material-design-icons/Reply.vue'
import IconShare from 'vue-material-design-icons/ShareOutline.vue'

/**
 * Noop
 */
function noop() {}

/**
 * Noop for loadMore
 */
async function noopLoadMore() {
	return []
}

const isOpen = ref(false)
const isLoadingMore = ref(false)

// List of variables to sync with upstream openViewer call
const onClose = ref(noop)
const file = ref(null)
const list = ref([])
const loadMore = ref(noopLoadMore)
const hasMore = ref(false)

const viewComponent = computed(() => file.value && window.OCA.Viewer.availableHandlers.find((handler) => handler.mimes.includes(file.value.mime))?.component)

const link = computed(() => file.value && generateUrl(`/f/${file.value.fileid}`))

const currentIndex = computed(() => list.value.findIndex((item) => item.fileid === file.value?.fileid))
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value !== -1 && (currentIndex.value < list.value.length - 1 || hasMore.value))

/**
 * Open the viewer modal
 *
 * @param {object} options - Options
 * @param {object} options.fileInfo - File info
 * @param {object[]} [options.list] - List of files to paginate through
 * @param {() => Promise<object[]>} [options.loadMore] - Callback to fetch more files for the list
 * @param {() => void} options.onClose - Callback called then the modal is closed
 */
function open(options = {}) {
	onClose.value = options.onClose ?? noop
	file.value = options.fileInfo ?? null
	list.value = options.list?.length ? options.list : (file.value ? [file.value] : [])
	loadMore.value = options.loadMore ?? noopLoadMore
	hasMore.value = !!options.loadMore
	isOpen.value = true
}

/**
 * Close the viewer modal
 */
function close() {
	file.value = null
	list.value = []
	loadMore.value = noopLoadMore
	hasMore.value = false
	onClose.value()
	onClose.value = noop
}

/**
 * Show the previous file in the list
 */
function showPrevious() {
	if (hasPrevious.value) {
		file.value = list.value[currentIndex.value - 1]
	}
}

/**
 * Show the next file in the list, fetching more files first if needed
 */
async function showNext() {
	if (currentIndex.value === list.value.length - 1 && hasMore.value && !isLoadingMore.value) {
		isLoadingMore.value = true
		try {
			const moreFiles = await loadMore.value()
			if (moreFiles?.length) {
				list.value = [...list.value, ...moreFiles]
			} else {
				// No more files to load, stop trying
				hasMore.value = false
			}
		} catch (e) {
			console.error('Failed to load more files for the Viewer', e)
			hasMore.value = false
		} finally {
			isLoadingMore.value = false
		}
	}

	if (hasNext.value) {
		file.value = list.value[currentIndex.value + 1]
	}
}

/* ---------------------------------------------------------------- Actions on the shown file */

/**
 * The conversation shown behind the viewer, and the message that shared the current file
 */
const source = computed(() => {
	const talk = window.OCA.Talk?.instance
	const token = talk?.$router?.currentRoute.value.params.token
	if (!file.value || !token) {
		return null
	}
	const fileid = String(file.value.fileid)
	const message = talk.$store.getters.messagesList(token).findLast((m) => Object.values(m.messageParameters ?? {})
		.some((parameter) => parameter?.type === 'file' && String(parameter.id) === fileid))
	return message ? { talk, token, message } : null
})

/**
 * Reply to the message that shared the file
 */
function reply() {
	const { talk, token, message } = source.value
	useChatExtrasStore(talk.$pinia).setParentIdToReply({ token, id: message.id })
	isOpen.value = false
	EventBus.emit('focus-chat-input')
}

/**
 * Forward the message that shared the file: straight to the conversation picker
 */
function forward() {
	const { talk, token, message } = source.value
	const selection = useForwardSelectionStore(talk.$pinia)
	selection.start(token, message.id)
	selection.pickerOpen = true
	isOpen.value = false
}

/**
 * Show the message in the conversation
 */
function goToMessage() {
	const { talk, message } = source.value
	isOpen.value = false
	talk.$router.push({ hash: `#message_${message.id}` })
}

/**
 * Save the file: fetched with the app's session, then handed to the save dialog
 */
async function download() {
	const current = file.value
	try {
		const url = generateRemoteUrl(`dav/files/${encodeURIComponent(getCurrentUser().uid)}`)
			+ current.filename.split('/').map(encodeURIComponent).join('/')
		const { data } = await axios.get(url, { responseType: 'blob' })
		const href = URL.createObjectURL(data)
		const anchor = Object.assign(document.createElement('a'), { href, download: current.basename })
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		setTimeout(() => URL.revokeObjectURL(href), 10_000)
	} catch (error) {
		// Still reachable: its page on the server offers the download
		console.error('Failed to download the file, opening its page instead', error)
		window.open(link.value, '_blank')
	}
}

defineExpose({
	open,
	close,
})
</script>

<template>
	<NcModal
		v-if="file"
		id="viewer"
		v-model:show="isOpen"
		class="viewer-modal"
		:class="{ 'viewer-modal--open': isOpen }"
		:name="file.basename"
		size="full"
		closeButtonOutside
		dark
		:hasPrevious
		:hasNext
		:inlineActions="source ? 4 : 1"
		@close="close"
		@previous="showPrevious"
		@next="showNext">
		<component
			:is="viewComponent"
			v-if="viewComponent"
			:file="file" />

		<template #actions>
			<NcActionButton v-if="source" @click="reply">
				<template #icon>
					<IconReply :size="20" />
				</template>
				Responder
			</NcActionButton>
			<NcActionButton v-if="source" @click="forward">
				<template #icon>
					<IconShare :size="20" />
				</template>
				Reencaminhar
			</NcActionButton>
			<NcActionButton @click="download">
				<template #icon>
					<IconDownload :size="20" />
				</template>
				Transferir
			</NcActionButton>
			<NcActionButton v-if="source" @click="goToMessage">
				<template #icon>
					<IconMessageArrowRight :size="20" />
				</template>
				Ver na conversa
			</NcActionButton>
			<NcActionLink :href="link">
				<template #icon>
					<IconOpenInNew :size="20" />
				</template>
				{{ t('talk_desktop', 'Open in a web browser') }}
			</NcActionLink>
		</template>
	</NcModal>
</template>

<style scoped>
/* The viewer takes the whole window. Its header keeps clear of the native window controls on
   Windows (titlebar-area-* reserve them; nothing on macOS, where the traffic lights are on the
   left and the header has nothing there) */
.viewer-modal {
	top: 0 !important;
	/* Dark, as photos are best seen; the app's light dialog backdrop is not for the viewer */
	background: rgba(8, 12, 16, 0.94) !important;
	backdrop-filter: blur(6px) !important;
}

/* Header actions: round, with a light hover on the dark backdrop */
.viewer-modal :deep(.modal-header .button-vue) {
	border-radius: 50% !important;
	background-color: transparent !important;
	transition: background-color 120ms ease, transform 120ms ease !important;
}

.viewer-modal :deep(.modal-header .button-vue:hover),
.viewer-modal :deep(.modal-header .button-vue:focus-visible) {
	background-color: rgba(255, 255, 255, 0.16) !important;
}

.viewer-modal :deep(.modal-header .button-vue:active) {
	transform: scale(0.94);
}

.viewer-modal :deep(.modal-header .button-vue:focus-visible) {
	outline: 2px solid rgba(255, 255, 255, 0.8) !important;
	outline-offset: 2px;
}

.viewer-modal :deep(.modal-header) {
	padding-inline-end: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)) !important;
}

.viewer-modal :deep(.modal-container) {
	background: none !important;
	height: calc(100% - var(--header-height)) !important;
}

.viewer-modal :deep(.modal-container__content) {
	overflow: hidden !important;
}
</style>
