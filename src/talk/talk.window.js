/**
 * SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { BrowserWindow, nativeTheme } = require('electron')
const { setupTray } = require('../app/app.tray.js')
const { getAppConfig } = require('../app/AppConfig.ts')
const { applyContextMenu } = require('../app/applyContextMenu.js')
const { applyDownloadHandler } = require('../app/downloads.ts')
const { applyExternalLinkHandler } = require('../app/externalLinkHandlers.ts')
const { getScaledWindowMinSize, getScaledWindowSize, applyZoom, buildTitle, getWindowUrl, getTitleBarSymbolColor } = require('../app/utils.ts')
const { applyWheelZoom } = require('../app/zoom.service.ts')
const { TITLE_BAR_HEIGHT } = require('../constants.js')
const { getBrowserWindowIcon } = require('../shared/icons.utils.js')

/**
 * @return {import('electron').BrowserWindow}
 */
function createTalkWindow() {
	const zoomFactor = getAppConfig('zoomFactor')

	const talkWindowOptions = {
		title: buildTitle(),
		...getScaledWindowMinSize({
			// Enough to keep the conversations list and the chat side by side
			minWidth: 860,
			minHeight: 600,
		}),
		// The colour of the window behind the page while it loads: the same as the page's backdrop
		// (see chat.styles.css), so the window does not flash a different colour on start
		backgroundColor: nativeTheme.shouldUseDarkColors ? '#15191E' : '#E9EEF3',
		autoHideMenuBar: true,
		webPreferences: {
			preload: TALK_DESKTOP__WINDOW_TALK_PRELOAD_WEBPACK_ENTRY,
			zoomFactor,
		},
		icon: getBrowserWindowIcon(),
		titleBarStyle: getAppConfig('systemTitleBar') ? 'default' : 'hidden',
		titleBarOverlay: {
			color: '#FFFFFF00',
			symbolColor: getTitleBarSymbolColor(),
			height: Math.round(TITLE_BAR_HEIGHT * zoomFactor),
		},
		// Position of the top left corner of the traffic light on Mac
		trafficLightPosition: {
			x: 12, // In line with SearchBox
			y: Math.round((TITLE_BAR_HEIGHT * zoomFactor - 16) / 2), // 16 is the default traffic light button diameter
		},
	}

	const window = new BrowserWindow({
		...talkWindowOptions,
		...getScaledWindowSize({
			// Fits a 13" laptop screen with room to spare; the size is remembered afterwards
			width: 1360,
			height: 860,
		}),
		name: 'talk-primary',
		windowStatePersistence: true,
		show: false,
	})

	// TODO: return it on release
	/*
	if (process.env.NODE_ENV === 'production') {
		window.removeMenu()
	}
	 */

	applyExternalLinkHandler(window, {
		...talkWindowOptions,
		...getScaledWindowSize({
			width: 800,
			height: 600,
		}),
		name: 'talk-secondary',
		windowStatePersistence: false,
	})

	applyContextMenu(window)
	applyDownloadHandler(window)
	applyWheelZoom(window)
	applyZoom(window)

	setupTray(window)

	window.loadURL(getWindowUrl('talk') + '#/apps/spreed')

	return window
}

module.exports = {
	createTalkWindow,
}
