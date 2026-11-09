/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, Tray, Menu } = require('electron')
const path = require('node:path')
const { BUILD_CONFIG } = require('../shared/build.config.ts')
const { getTrayIcon } = require('../shared/icons.utils.js')
const { focusLockWindow } = require('./lock.service.ts')

let isAppQuitting = false

/**
 * Allow quitting the app if requested. It minimizes to a tray otherwise.
 */
app.on('before-quit', () => {
	isAppQuitting = true
})

/**
 * Setup tray with an icon that provides a context menu.
 *
 * @param {import('electron').BrowserWindow} browserWindow Browser window, associated with the tray
 * @return {import('electron').Tray} Tray instance
 */
function setupTray(browserWindow) {
	/**
	 * Show the window, or the lock screen while the app is locked
	 */
	const showWindow = () => {
		if (!focusLockWindow()) {
			browserWindow.show()
		}
	}

	const icon = path.resolve(__dirname, getTrayIcon())
	const tray = new Tray(icon)
	// app.name drops the ".ao" of the executable name, see app.menu.js
	tray.setToolTip(process.env.NODE_ENV === 'development' ? app.name : BUILD_CONFIG.applicationName)
	tray.setContextMenu(Menu.buildFromTemplate([
		{
			label: 'Open',
			click: () => showWindow(),
		},
		{
			role: 'quit',
		},
	]))
	tray.on('click', () => showWindow())

	browserWindow.on('close', (event) => {
		if (!isAppQuitting) {
			event.preventDefault()
			browserWindow.hide()
		}
	})

	browserWindow.on('closed', () => {
		tray.destroy()
	})

	return tray
}

module.exports = {
	setupTray,
}
