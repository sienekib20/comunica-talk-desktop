/**
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type AppGetDesktopMediaSource from './AppGetDesktopMediaSource.vue'

import { createApp } from 'vue'

let appGetDesktopMediaSourceInstance: InstanceType<typeof AppGetDesktopMediaSource> | null = null

/** Stands in for a source id while the choice belongs to the system picker */
export const SYSTEM_PICKER_SOURCE_ID = 'system-picker:0:0'

/**
 * Prompt user to select a desktop media source to share and return the selected sourceId or an empty string if canceled
 *
 * @return sourceId of the selected mediaSource or an empty string if canceled
 */
export async function getDesktopMediaSource() {
	// macOS shows its own picker and hands over what the user chose there, so
	// there is nothing to list here. The marker tells getUserMedia to ask for it.
	if (window.systemInfo.hasSystemScreenPicker) {
		return { sourceId: SYSTEM_PICKER_SOURCE_ID }
	}

	if (!appGetDesktopMediaSourceInstance) {
		const { default: AppGetDesktopMediaSource } = await import('./AppGetDesktopMediaSource.vue')
		const container = document.body.appendChild(document.createElement('div'))
		appGetDesktopMediaSourceInstance = createApp(AppGetDesktopMediaSource).mount(container) as InstanceType<typeof AppGetDesktopMediaSource>
	}

	return appGetDesktopMediaSourceInstance.promptDesktopMediaSource()
}
