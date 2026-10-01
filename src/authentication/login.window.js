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
		// Only what the user could click themselves. These pages carry hidden forms,
		// and clicking one of those looks like success while nothing happens.
		const isVisible = (element) => element.getClientRects().length > 0

		const selectors = [
			'a[href*="login/flow/grant"]',
			'#submit-wrapper input[type="submit"]',
			'form[action*="login/flow"] [type="submit"]',
			'.button-vue--vue-primary',
			'form [type="submit"]',
		]

		// The page is rendered by Vue, the button does not exist yet when the page is loaded
		const deadline = Date.now() + 5000
		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const element = [...document.querySelectorAll(selector)].find(isVisible)
				if (element) {
					element.click()
					return selector
				}
			}
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		return null
	})()
`

/**
 * The server hides the password form behind a choice of login methods, and
 * renders it hidden again on every load - including after a wrong password, so
 * the error message would never be seen.
 *
 * Opening the form makes the error visible and saves a click on every login.
 * The choice of the identity provider is left in place, untouched.
 *
 * It runs on the server's own page, so it fails quietly: if nothing matches,
 * the page is shown exactly as the server sent it.
 */
const OPEN_PASSWORD_FORM = `
	(async () => {
		const isVisible = (element) => !!element && element.getClientRects().length > 0

		// The page is rendered by Vue, nothing exists yet when the page is loaded
		const deadline = Date.now() + 5000
		while (Date.now() < deadline) {
			if (isVisible(document.querySelector('input[type="password"]'))) {
				return true
			}

			// The link that swaps the provider buttons for the password form. It carries a
			// "#body-login" fragment, which is steadier than matching its wording.
			const option = [...document.querySelectorAll('a, button')]
				.filter(isVisible)
				.find((element) => element.getAttribute('href')?.includes('body-login'))
			option?.click()

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
			/**
			 * The pages of the login flow itself, which only ask to continue.
			 * Told apart by the path, because the address keeps the same host throughout.
			 *
			 * @param {'flow'|'login'} kind - Which page to test for
			 * @return {boolean}
			 */
			const isServerPage = (kind) => {
				try {
					const url = new URL(window.webContents.getURL())
					if (url.origin !== new URL(serverUrl).origin) {
						return false
					}
					const isFlow = url.pathname.includes('/login/flow')
					return kind === 'flow' ? isFlow : (url.pathname.includes('/login') && !isFlow)
				} catch {
					return false
				}
			}

			window.webContents.on('did-finish-load', async () => {
				// The login form, where the user types - open it so that the server's
				// error messages are visible without a detour through the method choice
				if (isServerPage('login')) {
					await window.webContents.executeJavaScript(OPEN_PASSWORD_FORM).catch(() => false)
					showLoginPage()
					return
				}

				if (!isServerPage('flow')) {
					showLoginPage()
					return
				}

				// Hide the window while confirming, so that the page is not seen at all
				const wasVisible = window.isVisible()
				if (wasVisible) {
					window.hide()
				}

				const clicked = await window.webContents.executeJavaScript(CLICK_LOGIN_BUTTON).catch(() => null)

				// Nothing to click means the page is not the expected one - show it as is
				if (!clicked) {
					showLoginPage()
					return
				}

				// The click should send the browser on to the app. If it did not, the page is
				// still here and the user is left staring at a window they cannot see - show it.
				const urlWhenClicked = window.webContents.getURL()
				setTimeout(() => {
					if (!window.isDestroyed() && window.webContents.getURL() === urlWhenClicked) {
						showLoginPage()
					}
				}, 6000)
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
