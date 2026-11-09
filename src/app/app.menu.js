/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, shell, Menu } = require('electron')
const packageJson = require('../../package.json')
const { createHelpWindow } = require('../help/help.window.js')
const { BUILD_CONFIG } = require('../shared/build.config.ts')
const { isMac } = require('./system.utils.ts')
const { increaseZoom, decreaseZoom, setZoom } = require('./zoom.service.ts')

/**
 * Setup application menu
 *
 * @param {object} options - Options
 * @param {() => void} options.showMainWindow - Bring back the main window, re-creating it once closed
 */
function setupMenu({ showMainWindow }) {
	// app.name comes from the executable, where the ".ao" of "Talk Gov.ao" reads as a file
	// extension and is dropped. The menus show the full name instead (app.name itself stays,
	// the data folder and the stored credentials are keyed by it).
	const name = process.env.NODE_ENV === 'development' ? app.name : BUILD_CONFIG.applicationName
	if (isMac) {
		app.setAboutPanelOptions({ applicationName: name })
	}

	const macAppMenu = {
		label: name,
		submenu: [
			{ role: 'about', label: `About ${name}` },
			{ type: 'separator' },
			{ role: 'services' },
			{ type: 'separator' },
			{ role: 'hide', label: `Hide ${name}` },
			{ role: 'hideOthers' },
			{ role: 'unhide' },
			{ type: 'separator' },
			{ role: 'quit', label: `Quit ${name}` },
		],
	}

	const editMenuItemsMac = [
		{ role: 'undo' },
		{ role: 'redo' },
		{ type: 'separator' },
		{ role: 'cut' },
		{ role: 'copy' },
		{ role: 'paste' },
		{ role: 'pasteAndMatchStyle' },
		{ role: 'delete' },
		{ role: 'selectAll' },
		{ type: 'separator' },
		{
			label: 'Speech',
			submenu: [
				{ role: 'startSpeaking' },
				{ role: 'stopSpeaking' },
			],
		},
	]

	const editMenuItems = [
		{ role: 'undo' },
		{ role: 'redo' },
		{ type: 'separator' },
		{ role: 'cut' },
		{ role: 'copy' },
		{ role: 'paste' },
		{ role: 'delete' },
		{ type: 'separator' },
		{ role: 'selectAll' },
	]

	const editMenu = {
		label: 'Edit',
		submenu: isMac ? editMenuItemsMac : editMenuItems,
	}

	const viewMenu = {
		label: 'View',
		submenu: [
			{ role: 'reload' },
			// Developer tools are for development, not for people who install the app from the store
			...(process.mas
				? []
				: [
						{ role: 'forceReload' },
						{ role: 'toggleDevTools' },
					]),
			{ type: 'separator' },
			{ label: 'Reset Zoom', accelerator: 'CommandOrControl+0', click: (event, browserWindow) => setZoom(browserWindow, 1) },
			{ label: 'Zoom In', accelerator: 'CommandOrControl+=', click: (event, browserWindow) => increaseZoom(browserWindow) },
			{ label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: (event, browserWindow) => decreaseZoom(browserWindow) },
			{ type: 'separator' },
			{ role: 'togglefullscreen' },
		],
	}

	const windowMenuItemsMac = [
		{ role: 'minimize' },
		{ role: 'zoom' },
		{ type: 'separator' },
		// Once the main window is closed the app keeps running: this brings it back,
		// as the Dock icon does (macOS apps are expected to offer both)
		{ label: name, accelerator: 'Command+1', click: () => showMainWindow() },
		{ type: 'separator' },
		{ role: 'front' },
		{ type: 'separator' },
		{ role: 'window' },
	]

	const windowMenuItems = [
		{ role: 'minimize' },
		{ role: 'zoom' },
		{ role: 'close' },
	]

	const windowMenu = {
		label: 'Window',
		submenu: isMac ? windowMenuItemsMac : windowMenuItems,
	}

	const createLinkMenuItem = (label, link) => ({
		label,
		click: async () => {
			await shell.openExternal(link)
		},
	})

	const helpMenu = {
		role: 'help',
		submenu: [
			{
				label: 'About',
				accelerator: 'F1',
				click: (event, focusedWindow) => {
					createHelpWindow(focusedWindow)
				},
			},
			...(BUILD_CONFIG.isBranded
				? []
				: [
						createLinkMenuItem('Homepage', packageJson.repository.url),
						createLinkMenuItem('Report a bug', packageJson.bugs.create),
						createLinkMenuItem('Source Code', packageJson.repository.url),
					]
			),
			createLinkMenuItem(`License ${packageJson.license}`, 'https://www.gnu.org/licenses/agpl-3.0.txt'),
		],
	}

	const template = [
		// { role: 'appMenu' }
		...(isMac ? [macAppMenu] : []),
		// { role: 'fileMenu' }
		{
			label: 'File',
			submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
		},
		// { role: 'editMenu' }
		editMenu,
		// { role: 'viewMenu' }
		viewMenu,
		// { role: 'windowMenu' }
		windowMenu,
		// { role: 'help' }
		helpMenu,
	]

	const menu = Menu.buildFromTemplate(template)
	Menu.setApplicationMenu(menu)
}

module.exports = {
	setupMenu,
}
