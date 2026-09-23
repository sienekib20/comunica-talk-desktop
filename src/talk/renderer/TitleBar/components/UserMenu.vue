<!--
  - SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import type { Ref } from 'vue'
import type { ReleaseInfo } from '../../../../app/githubRelease.service.ts'
import type { UserStatusStatusType } from '../../UserStatus/userStatus.types.ts'

import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { storeToRefs } from 'pinia'
import { inject, onBeforeMount, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcPopover from '@nextcloud/vue/components/NcPopover'
import NcUserStatusIcon from '@nextcloud/vue/components/NcUserStatusIcon'
import IconBugOutline from 'vue-material-design-icons/BugOutline.vue'
import IconCheck from 'vue-material-design-icons/Check.vue'
import IconChevronLeft from 'vue-material-design-icons/ChevronLeft.vue'
import IconChevronRight from 'vue-material-design-icons/ChevronRight.vue'
import IconCloudDownloadOutline from 'vue-material-design-icons/CloudDownloadOutline.vue'
import IconCogOutline from 'vue-material-design-icons/CogOutline.vue'
import IconEmoticonOutline from 'vue-material-design-icons/EmoticonOutline.vue'
import IconInformationOutline from 'vue-material-design-icons/InformationOutline.vue'
import IconLock from 'vue-material-design-icons/Lock.vue'
import IconLogout from 'vue-material-design-icons/Logout.vue'
import IconPencilOutline from 'vue-material-design-icons/PencilOutline.vue'
import IconPower from 'vue-material-design-icons/Power.vue'
import IconReload from 'vue-material-design-icons/Reload.vue'
import IconWeb from 'vue-material-design-icons/Web.vue'
import UserStatusDialog from '../../UserStatus/UserStatusDialog.vue'
import ThemeLogo from './ThemeLogo.vue'
import UiDotBadge from './UiDotBadge.vue'
import UiMenu from './UiMenu.vue'
import UiMenuItem from './UiMenuItem.vue'
import UiMenuSeparator from './UiMenuSeparator.vue'
import { appData } from '../../../../app/AppData.js'
import { TITLE_BAR_HEIGHT } from '../../../../constants.js'
import { BUILD_CONFIG } from '../../../../shared/build.config.ts'
import { getCurrentTalkRoutePath } from '../../TalkWrapper/talk.service.ts'
import { useUserStatusStore } from '../../UserStatus/userStatus.store.ts'
import { availableUserStatusStatusTypes, userStatusTranslations } from '../../UserStatus/userStatus.utils.ts'

// TODO: define a proper type for userMetadata
const user = appData.userMetadata! as { id: string, 'display-name': string }

const userStatusStore = useUserStatusStore()
const { userStatus } = storeToRefs(userStatusStore)
const serverUrl = appData.serverUrl! as string
const serverUrlShort = serverUrl.replace(/^https?:\/\//, '')
const theming = appData.capabilities.theming

const isOpen = ref(false)
const userMenuContainer = useTemplateRef('userMenuContainer')
const isUserStatusDialogOpen = ref(false)
const userStatusSubMenuOpen = ref(false)

// Close the submenu before opening the menu
watch(isOpen, () => {
	if (isOpen.value) {
		userStatusSubMenuOpen.value = false
	}
})

const userProfileLink = generateUrl('/u/{userid}', { userid: user.id })

const packageInfo = window.TALK_DESKTOP.packageInfo
const isTalkInitialized = inject<Ref<boolean>>('talk:isInitialized')

const showHelp = () => window.TALK_DESKTOP.showHelp()
const reload = () => window.location.reload()
const openSettings = () => window.OCA.Talk.Settings.open()
const openInWeb = () => window.open(generateUrl(getCurrentTalkRoutePath()), '_blank')

const newRelease = ref<ReleaseInfo | null>(null)
onBeforeMount(async () => {
	newRelease.value = await window.TALK_DESKTOP.checkForUpdate()
})

const unsubscribeNewVersion = window.TALK_DESKTOP.onUpdateAvailable((release: ReleaseInfo) => {
	newRelease.value = release
})
onBeforeUnmount(() => {
	unsubscribeNewVersion()
})

const lock = window.TALK_DESKTOP.lock.lockNow
const logout = window.TALK_DESKTOP.logout
const quit = window.TALK_DESKTOP.quit

const avatarSize = 32
// Align popover with the title bar edge
const popoverDistance = (TITLE_BAR_HEIGHT - avatarSize) / 2

/**
 * Handle user status type change
 *
 * @param status - new user status
 */
function handleUserStatusChange(status: UserStatusStatusType) {
	userStatusStore.saveUserStatus({ ...userStatus.value!, status })
	userStatusSubMenuOpen.value = false
}
</script>

<template>
	<div ref="userMenuContainer" class="user-menu">
		<NcPopover
			v-if="userMenuContainer"
			v-model:shown="isOpen"
			:container="userMenuContainer"
			:popperHideTriggers="(triggers: string[]) => [...triggers, 'click']"
			:triggers="[]"
			noAutoFocus
			:distance="popoverDistance">
			<template #trigger="{ attrs }">
				<div class="user-menu__trigger">
					<!-- Floating-Vue doesn't support open on span[role=button] - opening manually -->
					<NcAvatar
						class="user-menu__avatar"
						:user="user.id"
						:preloadedUserStatus="userStatus"
						:displayName="user['display-name']"
						:size="avatarSize"
						disableMenu
						disableTooltip
						v-bind="attrs"
						tabindex="0"
						role="button"
						@click="isOpen = !isOpen"
						@keydown.space="isOpen = !isOpen"
						@keydown.enter="isOpen = !isOpen" />
				</div>
			</template>

			<template #default>
				<UiMenu aria-label="Settings menu" class="user-menu__menu">
					<template v-if="userStatusSubMenuOpen">
						<UiMenuItem tag="button" @click.stop="userStatusSubMenuOpen = false">
							<template #icon>
								<IconChevronLeft :size="20" />
							</template>
							{{ t('talk_desktop', 'Back') }}
						</UiMenuItem>
						<UiMenuItem
							v-for="status in availableUserStatusStatusTypes"
							:key="status"
							tag="button"
							@click.stop="handleUserStatusChange(status)">
							<template #icon>
								<NcUserStatusIcon :status="status" />
							</template>
							{{ userStatusTranslations[status] }}
							<!-- @vue-expect-error This menu can only be open from a button with v-if="userStatus", but in Vue 2 we cannot add type assertion -->
							<template v-if="status === userStatus.status" #actionIcon>
								<IconCheck :size="20" />
							</template>
						</UiMenuItem>
					</template>

					<template v-else>
						<UiMenuItem
							tag="a"
							:href="userProfileLink"
							target="_blank">
							<span class="user-menu__item-multiline">
								<strong class="user-menu__display-name">
									{{ user['display-name'] }}
								</strong>
								<em class="user-menu__item-subtext">
									{{ t('talk_desktop', 'View profile') }}
								</em>
							</span>
						</UiMenuItem>

						<UiMenuSeparator />

						<UiMenuItem tag="a" :href="serverUrl" target="_blank">
							<template #icon>
								<ThemeLogo :size="24" />
							</template>
							<span class="user-menu__item-multiline">
								<span>
									{{ theming.name }}
								</span>
								<em class="user-menu__item-subtext">
									{{ serverUrlShort }}
								</em>
							</span>
						</UiMenuItem>

						<UiMenuSeparator />

						<template v-if="userStatus">
							<UiMenuItem tag="button" @click.stop="userStatusSubMenuOpen = true">
								<template #icon>
									<NcUserStatusIcon :status="userStatus.status" />
								</template>
								{{ userStatusTranslations[userStatus.status] }}
								<template #actionIcon>
									<IconChevronRight :size="20" />
								</template>
							</UiMenuItem>
							<UiMenuItem key="custom-status" tag="button" @click="isUserStatusDialogOpen = true">
								<template #icon>
									<span v-if="userStatus.icon" style="font-size: 20px">
										{{ userStatus.icon }}
									</span>
									<IconEmoticonOutline v-else :size="20" />
								</template>
								{{ userStatus.message || t('talk_desktop', 'Set custom status') }}
								<template v-if="userStatus.message" #actionIcon>
									<IconPencilOutline :size="20" />
								</template>
							</UiMenuItem>

							<UiMenuSeparator />
						</template>

						<UiMenuItem
							v-if="newRelease"
							tag="a"
							:href="newRelease.installer?.downloadUrl || newRelease.url"
							:download="newRelease.installer?.filename || undefined"
							target="_blank">
							<template #icon>
								<UiDotBadge
									insetBlockStart="32%"
									insetInlineEnd="22%"
									enabled
									noOutline>
									<IconCloudDownloadOutline :size="20" />
								</UiDotBadge>
							</template>
							{{ t('talk_desktop', 'Update') }}
						</UiMenuItem>

						<UiMenuItem v-if="isTalkInitialized" tag="button" @click="openInWeb">
							<template #icon>
								<IconWeb :size="20" />
							</template>
							{{ t('talk_desktop', 'Open in web browser') }}
						</UiMenuItem>

						<UiMenuItem tag="button" @click="openSettings">
							<template #icon>
								<IconCogOutline :size="20" />
							</template>
							{{ t('talk_desktop', 'App settings') }}
						</UiMenuItem>

						<UiMenuItem tag="button" @click="showHelp">
							<template #icon>
								<IconInformationOutline :size="20" />
							</template>
							{{ t('talk_desktop', 'About') }}
						</UiMenuItem>

						<UiMenuItem tag="button" @click="reload">
							<template #icon>
								<IconReload :size="20" />
							</template>
							{{ t('talk_desktop', 'Force reload') }}
						</UiMenuItem>

						<UiMenuItem
							v-if="!BUILD_CONFIG.isBranded"
							tag="a"
							:href="packageInfo.bugs.create"
							target="_blank">
							<template #icon>
								<IconBugOutline :size="20" />
							</template>
							{{ t('talk_desktop', 'Report a bug') }}
						</UiMenuItem>

						<UiMenuSeparator />

						<UiMenuItem tag="button" @click="lock">
							<template #icon>
								<IconLock :size="20" />
							</template>
							{{ t('talk_desktop', 'Lock screen') }}
						</UiMenuItem>

						<UiMenuSeparator />

						<UiMenuItem tag="button" @click="logout">
							<template #icon>
								<IconLogout :size="20" />
							</template>
							{{ t('talk_desktop', 'Log out') }}
						</UiMenuItem>

						<UiMenuSeparator />

						<UiMenuItem tag="button" @click="quit">
							<template #icon>
								<IconPower :size="20" />
							</template>
							{{ t('talk_desktop', 'Quit') }}
						</UiMenuItem>
					</template>
				</UiMenu>
			</template>
		</NcPopover>

		<UserStatusDialog v-if="isUserStatusDialogOpen" @close="isUserStatusDialogOpen = false" />
	</div>
</template>

<style scoped>
.user-menu :deep(.v-popper--theme-dropdown.v-popper__popper .v-popper__inner) {
	border-radius: var(--border-radius-large);
}

.user-menu__trigger {
	display: flex;
	align-items: center;
}

.user-menu__avatar {
	box-sizing: content-box;
}

.user-menu__trigger:hover,
.user-menu__trigger:active,
.user-menu__trigger:focus,
.user-menu__trigger:focus-visible {
	.user-menu__avatar {
		outline: 2px solid var(--color-main-text);
		box-shadow: 0 0 0 4px var(--color-main-background);
	}
}

.user-menu__menu {
	max-width: 300px;
}

.user-menu__item-multiline {
	display: flex;
	flex-direction: column;
}

.user-menu__item-subtext {
	font-weight: normal;
}

.user-menu__display-name {
	font-weight: var(--font-weight-element, 700);
}
</style>
