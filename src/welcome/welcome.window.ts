/*!
 * SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { BrowserWindow } from 'electron'
import { getAppConfig } from '../app/AppConfig.ts'
import { applyZoom, getScaledWindowSize, getWindowUrl } from '../app/utils.ts'
import { getBrowserWindowIcon } from '../shared/icons.utils.js'

/**
 * Creates the welcome window
 */
export function createWelcomeWindow() {
	const zoomFactor = getAppConfig('zoomFactor')
	const window = new BrowserWindow({
		...getScaledWindowSize({
			width: 520,
			height: 340,
		}, false),
		// The splash draws its own rounded card, the window itself has no frame and no background
		backgroundColor: '#00000000',
		transparent: true,
		frame: false,
		roundedCorners: false,
		hasShadow: true,
		resizable: false,
		movable: true,
		autoHideMenuBar: true,
		center: true,
		fullscreenable: false,
		show: false,
		useContentSize: true,
		webPreferences: {
			preload: TALK_DESKTOP__WINDOW_WELCOME_PRELOAD_WEBPACK_ENTRY,
			zoomFactor,
		},
		icon: getBrowserWindowIcon(),
	})

	applyZoom(window)

	window.loadURL(getWindowUrl('welcome'))

	return window
}
