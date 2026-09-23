/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { BrowserWindow } from 'electron'
import { getAppConfig } from '../app/AppConfig.ts'
import { applyZoom, centerOnParent, getScaledWindowSize, getWindowUrl } from '../app/utils.ts'
import { getBrowserWindowIcon } from '../shared/icons.utils.js'

/**
 * Creates the lock screen window
 *
 * @param options - Options
 * @param options.setup - Ask to create an unlock code instead of asking to unlock.
 *                        Only ever used while the app is unlocked and the user is present.
 * @param options.parentWindow - Window to center on
 */
export function createLockWindow({ setup = false, parentWindow = undefined } = {}) {
	const zoomFactor = getAppConfig('zoomFactor')
	const window = new BrowserWindow({
		...getScaledWindowSize({
			width: 420,
			height: 520,
		}, false),
		// The lock screen draws its own rounded card, like the splash screen
		backgroundColor: '#00000000',
		transparent: true,
		frame: false,
		roundedCorners: false,
		hasShadow: true,
		resizable: false,
		fullscreenable: false,
		autoHideMenuBar: true,
		show: false,
		useContentSize: true,
		webPreferences: {
			preload: TALK_DESKTOP__WINDOW_LOCK_PRELOAD_WEBPACK_ENTRY,
			zoomFactor,
		},
		icon: getBrowserWindowIcon(),
	})

	window.removeMenu()
	// Opens over the window it belongs to, not in the middle of the screen
	centerOnParent(window, parentWindow)
	applyZoom(window)
	window.loadURL(getWindowUrl('lock') + (setup ? '?setup' : ''))

	return window
}
