/**
 * SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { BrowserWindow, app } = require('electron')
const os = require('node:os')
const { getAppConfig } = require('../app/AppConfig.ts')
const { applyContextMenu } = require('../app/applyContextMenu.js')
const { isMac, osTitle } = require('../app/system.utils.ts')
const { getScaledWindowMinSize, getScaledWindowSize, applyZoom } = require('../app/utils.ts')
const { BUILD_CONFIG } = require('../shared/build.config.ts')
const { getBrowserWindowIcon } = require('../shared/icons.utils.js')
const { parseLoginRedirectUrl } = require('./login.service.js')

const genId = () => Math.random().toString(36).slice(2, 9)

/**
 * The login flow page asks to confirm before showing the actual login form.
 * With an enforced domain the app already knows the server, so the confirmation is skipped.
 * If the page ever changes and no button is found, nothing happens and the page is shown as is.
 */
const CLICK_LOGIN_BUTTON = `
	(async () => {
		const selectors = [
			'#submit-wrapper input[type="submit"]',
			'form[action*="login/flow"] [type="submit"]',
			'.button-vue--vue-primary',
			'form [type="submit"]',
		]
		// The page is rendered by Vue, the button does not exist yet when the page is loaded
		const deadline = Date.now() + 5000
		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const element = document.querySelector(selector)
				if (element) {
					element.click()
					return true
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		return false
	})()
`

/**
 * Only one login window may exist at a time.
 *
 * @type {{ window: import('electron').BrowserWindow, promise: Promise<import('./login.service.js').Credentials|Error> }|undefined}
 */
let activeLogin

/**
 * Open a web-view modal window with Nextcloud Server login page
 *
 * @param {import('electron').BrowserWindow} parentWindow - Parent window
 * @param {string} serverUrl - Server URL
 * @param {object} [options] - Options
 * @param {boolean} [options.skipConfirmation] - Skip the "Connect to your account" confirmation page
 * @param {() => void} [options.onReadyToShow] - Called when the login page is about to be shown
 * @return {Promise<import('./login.service.js').Credentials|Error>}
 */
function openLoginWebView(parentWindow, serverUrl, options = {}) {
	// A second call would open a duplicated login window, focus the existing one instead
	if (activeLogin && !activeLogin.window.isDestroyed()) {
		activeLogin.window.focus()
		return activeLogin.promise
	}

	/** @type {import('electron').BrowserWindow} */
	let loginWindow

	const promise = new Promise((resolve) => {
		const WIDTH = 1100
		const HEIGHT = 760
		// Large enough for the login page to breathe. On smaller screens the minimum
		// is clamped down to the available work area, see getScaledWindowMinSize()
		const MIN_WIDTH = 1020
		const MIN_HEIGHT = 720

		const zoomFactor = getAppConfig('zoomFactor')

		const window = new BrowserWindow({
			...getScaledWindowSize({
				width: WIDTH,
				height: HEIGHT,
			}),
			...getScaledWindowMinSize({
				minWidth: MIN_WIDTH,
				minHeight: MIN_HEIGHT,
			}),
			backgroundColor: BUILD_CONFIG.backgroundColor,
			useContentSize: true,
			resizable: true,
			center: true,
			maximizable: true,
			fullscreenable: true,
			parent: parentWindow,
			// On macOS a modal window is attached to the parent as a sheet and ignores centering,
			// which puts the large login window off the screen under the small parent window
			modal: !isMac,
			autoHideMenuBar: true,
			webPreferences: {
				partition: `non-persist:login-web-view-${genId()}`,
				nodeIntegration: false,
				zoomFactor,
			},
			icon: getBrowserWindowIcon(),
			// Stay hidden while the confirmation page is skipped, so that it is never seen
			show: !options.skipConfirmation,
		})
		window.removeMenu()
		window.center()

		/**
		 * Show the login window, at most once, and let the caller close the splash screen.
		 */
		const showLoginPage = () => {
			if (window.isDestroyed() || window.isVisible()) {
				return
			}
			window.show()
			options.onReadyToShow?.()
		}

		if (options.skipConfirmation) {
			// Only the server's own login flow pages are auto-confirmed. The login form itself
			// and the identity provider are never touched - the user always logs in by hand.
			const isLoginFlowPage = () => window.webContents.getURL().startsWith(`${serverUrl}/index.php/login/flow`)

			window.webContents.on('did-finish-load', async () => {
				if (!isLoginFlowPage()) {
					showLoginPage()
					return
				}

				// Hide the window while confirming, so that the page is not seen at all
				const wasVisible = window.isVisible()
				if (wasVisible) {
					window.hide()
				}

				const clicked = await window.webContents.executeJavaScript(CLICK_LOGIN_BUTTON).catch(() => false)
				// Nothing to click means the page is not the expected one - show it as is
				if (!clicked) {
					showLoginPage()
				}
			})

			// Never leave the user on the splash screen if the login page does not load
			setTimeout(showLoginPage, 15000)
		}

		window.loadURL(`${serverUrl}/index.php/login/flow`, {
			// User-Agent header is used as the app name, device and session
			// On the login flow page and then on the Personal settings / Security / Devices & Sessions
			// Format used by all the clients: {HostUsername} ({ApplicationName} - {OS})
			userAgent: `${os.hostname()} (${BUILD_CONFIG.applicationName} - ${osTitle})`,
			extraHeaders: [
				'OCS-APIRequest: true',
				`Accept-Language: ${app.getPreferredSystemLanguages().join(',')}`,
			].join('\n'),
		})

		window.webContents.on('did-start-loading', () => {
			window.setTitle('[Loading...]')
			window.setProgressBar(2, { mode: 'indeterminate' })
		})

		window.webContents.on('did-stop-loading', () => {
			window.setProgressBar(-1)
		})

		window.webContents.on('will-redirect', (event, url) => {
			if (url.startsWith('nc://')) {
				// Stop redirect to nc:// app protocol
				event.preventDefault()
				try {
					const credentials = parseLoginRedirectUrl(url)
					resolve(credentials)
				} catch {
					resolve(new Error('Unexpected server error'))
				} finally {
					// Anyway close the window
					window.close()
				}
			}
		})

		applyContextMenu(window)
		applyZoom(window)

		window.on('close', () => {
			resolve(new Error('Login window was closed'))
		})

		loginWindow = window
	})

	activeLogin = { window: loginWindow, promise }
	promise.finally(() => {
		activeLogin = undefined
	})

	return promise
}

module.exports = {
	openLoginWebView,
}
