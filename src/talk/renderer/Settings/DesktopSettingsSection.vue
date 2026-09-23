<!--
  - SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcFormBox from '@nextcloud/vue/components/NcFormBox'
import NcFormBoxButton from '@nextcloud/vue/components/NcFormBoxButton'
import NcFormBoxSwitch from '@nextcloud/vue/components/NcFormBoxSwitch'
import NcFormGroup from '@nextcloud/vue/components/NcFormGroup'
import NcRadioGroup from '@nextcloud/vue/components/NcRadioGroup'
import NcRadioGroupButton from '@nextcloud/vue/components/NcRadioGroupButton'
import IconThemeLightDark from 'vue-material-design-icons/ThemeLightDark.vue'
import IconWeatherNight from 'vue-material-design-icons/WeatherNight.vue'
import IconWeatherSunny from 'vue-material-design-icons/WeatherSunny.vue'
import DesktopSettingsSectionRelaunchNote from './components/DesktopSettingsSectionRelaunchNote.vue'
import UiFormBoxAudioOutput from './components/UiFormBoxAudioOutput.vue'
import UiFormBoxSelectNative from './components/UiFormBoxSelectNative.vue'
import UiFormGroupZoom from './components/UiFormGroupZoom.vue'
import { useAppConfigStore } from './appConfig.store.ts'
import { useAppConfigValue } from './useAppConfigValue.ts'

const isLinux = window.systemInfo.isLinux
const hasBiometricUnlock = window.systemInfo.hasBiometricUnlock

const { isRelaunchRequired } = storeToRefs(useAppConfigStore())

const biometricUnlock = useAppConfigValue('biometricUnlock')
const autoLockMinutes = useAppConfigValue('autoLockMinutes')
const autoLockOptions = [
	{ label: t('talk_desktop', 'Never'), value: 0 },
	{ label: t('talk_desktop', 'After 1 minute'), value: 1 },
	{ label: t('talk_desktop', 'After 5 minutes'), value: 5 },
	{ label: t('talk_desktop', 'After 15 minutes'), value: 15 },
	{ label: t('talk_desktop', 'After 30 minutes'), value: 30 },
]
const launchAtStartup = useAppConfigValue('launchAtStartup')
const launchAtStartupInBackground = useAppConfigValue('launchAtStartupInBackground')
const theme = useAppConfigValue('theme')
const systemTitleBar = useAppConfigValue('systemTitleBar')
const monochromeTrayIcon = useAppConfigValue('monochromeTrayIcon')
const zoomFactor = useAppConfigValue('zoomFactor')

const playSoundChat = useAppConfigValue('playSoundChat')
const playSoundCall = useAppConfigValue('playSoundCall')
const enableCallbox = useAppConfigValue('enableCallbox')
const notificationLevelOptions = [
	{ label: t('talk_desktop', 'Always'), value: 'always' },
	{ label: t('talk_desktop', 'When not in "Do not disturb"'), value: 'respect-dnd' },
	{ label: t('talk_desktop', 'Never'), value: 'never' },
]

// Not awaited at the top level, that would turn the component into an async one
const hasUnlockCode = ref(false)
/**
 *
 */
async function refreshUnlockCodeState() {
	hasUnlockCode.value = await window.TALK_DESKTOP.lock.hasCode()
}
onMounted(refreshUnlockCodeState)

/**
 * Ask to create a new unlock code. The window closes on its own when saved.
 */
async function changeUnlockCode() {
	await window.TALK_DESKTOP.lock.changeCode()
	await refreshUnlockCodeState()
}

const isRemoveDialogOpen = ref(false)

/**
 * Remove the unlock code, leaving the app without a lock.
 * Confirmed first - it silently turns the screen lock off.
 */
async function removeUnlockCode() {
	isRemoveDialogOpen.value = false
	await window.TALK_DESKTOP.lock.removeCode()
	await refreshUnlockCodeState()
}

const secondarySpeaker = useAppConfigValue('secondarySpeaker')
const secondarySpeakerDevice = useAppConfigValue('secondarySpeakerDevice')
</script>

<template>
	<div class="desktop-settings-section">
		<DesktopSettingsSectionRelaunchNote v-if="isRelaunchRequired" />

		<NcFormBox>
			<UiFormBoxSelectNative
				v-model="autoLockMinutes"
				:label="t('talk_desktop', 'Lock the screen when inactive')"
				:options="autoLockOptions" />
			<NcFormBoxSwitch
				v-if="hasBiometricUnlock"
				v-model="biometricUnlock"
				:label="t('talk_desktop', 'Unlock with Touch ID')"
				:helperText="t('talk_desktop', 'Ask for Touch ID when the app starts with a saved session')" />
			<NcFormBoxButton
				:label="hasUnlockCode ? t('talk_desktop', 'Change the unlock code') : t('talk_desktop', 'Create an unlock code')"
				@click="changeUnlockCode" />
			<NcFormBoxButton
				v-if="hasUnlockCode"
				:label="t('talk_desktop', 'Remove the unlock code')"
				@click="isRemoveDialogOpen = true" />
		</NcFormBox>

		<NcFormBox v-if="!isLinux">
			<NcFormBoxSwitch v-model="launchAtStartup" :label="t('talk_desktop', 'Launch at startup')" />
			<NcFormBoxSwitch v-if="launchAtStartup" v-model="launchAtStartupInBackground" :label="t('talk_desktop', 'Launch in background')" />
		</NcFormBox>

		<NcRadioGroup v-model="theme" :label="t('talk_desktop', 'Theme')">
			<NcRadioGroupButton :label="t('talk_desktop', 'System default')" value="default">
				<template #icon>
					<IconThemeLightDark :size="20" />
				</template>
			</NcRadioGroupButton>
			<NcRadioGroupButton :label="t('talk_desktop', 'Light')" value="light">
				<template #icon>
					<IconWeatherSunny :size="20" />
				</template>
			</NcRadioGroupButton>
			<NcRadioGroupButton :label="t('talk_desktop', 'Dark')" value="dark">
				<template #icon>
					<IconWeatherNight :size="20" />
				</template>
			</NcRadioGroupButton>
		</NcRadioGroup>

		<NcFormGroup :label="t('talk_desktop', 'Appearance')">
			<NcFormBox>
				<NcFormBoxSwitch v-model="monochromeTrayIcon" :label="t('talk_desktop', 'Use monochrome tray icon')" />
				<NcFormBoxSwitch v-model="systemTitleBar" :label="t('talk_desktop', 'Use system title bar')" />
			</NcFormBox>
		</NcFormGroup>

		<UiFormGroupZoom v-model="zoomFactor" />

		<NcFormGroup :label="t('talk_desktop', 'Notifications & Sounds')">
			<NcFormBox>
				<UiFormBoxSelectNative v-model="playSoundChat" :label="t('talk_desktop', 'Play chat notification sound')" :options="notificationLevelOptions" />
				<UiFormBoxSelectNative v-model="playSoundCall" :label="t('talk_desktop', 'Play call notification sound')" :options="notificationLevelOptions" />
				<UiFormBoxSelectNative v-model="enableCallbox" :label="t('talk_desktop', 'Show call notification popup')" :options="notificationLevelOptions" />
			</NcFormBox>

			<NcFormBox>
				<NcFormBoxSwitch v-model="secondarySpeaker" :label="t('talk_desktop', 'Also repeat call notification on a secondary speaker')" />
				<UiFormBoxAudioOutput v-if="secondarySpeaker" v-model="secondarySpeakerDevice" :label="t('talk_desktop', 'Secondary speaker')" />
			</NcFormBox>
		</NcFormGroup>
		<NcDialog
			v-if="isRemoveDialogOpen"
			:name="t('talk_desktop', 'Remove the unlock code')"
			:message="t('talk_desktop', 'The screen lock will be turned off and the app will no longer ask for a code.')"
			@closing="isRemoveDialogOpen = false">
			<template #actions>
				<NcButton variant="tertiary" @click="isRemoveDialogOpen = false">
					{{ t('talk_desktop', 'Cancel') }}
				</NcButton>
				<NcButton variant="error" @click="removeUnlockCode">
					{{ t('talk_desktop', 'Remove') }}
				</NcButton>
			</template>
		</NcDialog>
	</div>
</template>

<style scoped>
.desktop-settings-section {
	display: flex;
	flex-direction: column;
	justify-content: stretch;
	gap: calc(6 * var(--default-grid-baseline));
}
</style>
