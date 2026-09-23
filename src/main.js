/**
 * SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, ipcMain, desktopCapturer, systemPreferences, shell, session, webContents } = require('electron')
const { default: mri } = require('mri')
const { spawn } = require('node:child_process')
const path = require('node:path')
const { setupMenu } = require('./app/app.menu.js')
const { loadAppConfig, getAppConfig, setAppConfig } = require('./app/AppConfig.ts')
const { appData } = require('./app/AppData.js')
const { registerAppProtocolHandler } = require('./app/appProtocol.ts')
const { requestBiometricUnlock } = require('./app/biometrics.service.ts')
const { verifyCertificate, promptCertificateTrust } = require('./app/certificate.service.ts')
const { cli } = require('./app/cli.ts')
const { loadCredentials, saveCredentials } = require('./app/credentials.service.ts')
const { openChromeWebRtcInternals } = require('./app/dev.utils.ts')
const { triggerDownloadUrl } = require('./app/downloads.ts')
const { setupReleaseNotificationScheduler, checkForUpdate } = require('./app/githubRelease.service.ts')
const { initLaunchAtStartupListener } = require('./app/launchAtStartup.config.ts')
const { focusLockWindow, hasUnlockCode, registerLockWindow, removeUnlockCode, setUnlockCode, setupAutoLock, unlockWithBiometrics, verifyUnlockCode } = require('./app/lock.service.ts')
const { runMigrations } = require('./app/migration.service.ts')
const { systemInfo, isMac, isWindows, isSameExecution, isSquirrel, relaunchApp } = require('./app/system.utils.ts')
const { applyTheme } = require('./app/theme.config.ts')
const { buildTitle, onReadyToShow } = require('./app/utils.ts')
const { enableWebRequestInterceptor, disableWebRequestInterceptor } = require('./app/webRequestInterceptor.js')
const { createAuthenticationWindow } = require('./authentication/authentication.window.js')
const { openLoginWebView } = require('./authentication/login.window.js')
const { createCallboxWindow } = require('./callbox/callbox.window.ts')
const { createHelpWindow } = require('./help/help.window.js')
const { installVueDevtools } = require('./install-vue-devtools.js')
const { createLockWindow } = require('./lock/lock.window.ts')
const { BUILD_CONFIG } = require('./shared/build.config.ts')
const { getDockIcon } = require('./shared/icons.utils.js')
const { createTalkWindow } = require('./talk/talk.window.js')
const { createUpgradeWindow } = require('./upgrade/upgrade.window.ts')
const { createWelcomeWindow } = require('./welcome/welcome.window.ts')

const argv = mri(process.argv.slice(app.isPackaged ? 1 : 2))

/**
 * On production use executable name as application name to allow several independent application instances.
 * On development use "Nextcloud Talk (dev)" instead of the default "electron".
 */
const APP_NAME = process.env.NODE_ENV !== 'development' ? path.parse(app.getPath('exe')).name : 'Nextcloud Talk (dev)'
app.setName(APP_NAME)
app.setPath('userData', path.join(app.getPath('appData'), app.getName()))
if (isWindows && process.env.NODE_ENV === 'production') {
	if (isSquirrel) {
		// Squirrel.Windows sets the AppUserModelId in the following way
		app.setAppUserModelId(`com.squirrel.${BUILD_CONFIG.applicationNameSanitized}.${BUILD_CONFIG.applicationNameSanitized}`)
	} else {
		// MSI installer - normal AppID
		app.setAppUserModelId(BUILD_CONFIG.winAppId)
	}
}

/**
 * Handle creating/removing shortcuts on Windows when installing/uninstalling
 */
if (require('electron-squirrel-startup')) {
	app.quit()
}

/**
 * Only one instance is allowed at the same time
 */
if (!app.requestSingleInstanceLock()) {
	console.log('Another instance of the app is already running')
	app.quit()
}

ipcMain.on('app:quit', () => app.quit())
ipcMain.handle('app:getSystemInfo', () => systemInfo)
ipcMain.handle('app:buildTitle', (event, title) => buildTitle(title))
ipcMain.handle('app:getSystemL10n', () => ({
	locale: app.getLocale().replace('-', '_') ?? 'en',
	// Note: Linux may have C (POSIX) locale, which results in an empty preferred languages list
	language: app.getPreferredSystemLanguages()[0]?.replace('-', '_') ?? 'en_US',
}))
ipcMain.handle('app:enableWebRequestInterceptor', (event, ...args) => enableWebRequestInterceptor(...args))
ipcMain.handle('app:disableWebRequestInterceptor', (event, ...args) => disableWebRequestInterceptor(...args))
ipcMain.handle('app:setBadgeCount', async (event, count) => app.setBadgeCount(count))
ipcMain.on('app:relaunch', () => relaunchApp())
ipcMain.handle('app:config:get', (event, key) => getAppConfig(key))
ipcMain.handle('app:config:set', (event, key, value) => setAppConfig(key, value))
ipcMain.on('app:grantUserGesturedPermission', (event, id) => {
	return event.sender.executeJavaScript(`document.getElementById('${id}')?.click()`, true)
})
ipcMain.on('app:toggleDevTools', (event) => event.sender.toggleDevTools())
ipcMain.handle('app:anything', () => { /* Put any code here to run it from UI */ })
ipcMain.on('app:openChromeWebRtcInternals', () => openChromeWebRtcInternals())
ipcMain.handle('app:update:check', async () => await checkForUpdate({ forceRequest: true }))
ipcMain.handle('app:getDesktopCapturerSources', async () => {
	// macOS 10.15 Catalina or higher requires consent for screen access
	if (isMac && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
		// Open System Preferences to allow screen recording
		await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
		// We cannot detect that the user has granted access, so return no sources
		// The user will have to try again after granting access
		return null
	}

	const thumbnailWidth = 800

	const sources = await desktopCapturer.getSources({
		types: ['screen', 'window'],
		fetchWindowIcons: true,
		thumbnailSize: {
			width: thumbnailWidth,
			height: thumbnailWidth * 9 / 16,
		},
	})

	return sources.map((source) => ({
		id: source.id,
		name: source.name,
		icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : null,
		thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null,
	}))
})

/**
 * Whether the window is being relaunched.
 * At this moment there are no active windows, but the application should not quit yet.
 */
let isInWindowRelaunch = false

app.whenReady().then(async () => {
	await loadAppConfig()
	await runMigrations()

	await cli(argv)

	applyTheme()

	// In development the Dock shows the icon of the Electron executable, set the app icon instead
	if (isMac && !app.isPackaged) {
		app.dock.setIcon(getDockIcon())
	}

	initLaunchAtStartupListener()
	registerAppProtocolHandler()

	/**
	 * Schedule check for a new version available to download from GitHub
	 */
	if (process.env.NODE_ENV === 'production' && !BUILD_CONFIG.isBranded) {
		setupReleaseNotificationScheduler(24 * 60)
	}

	// Open in the background if it is explicitly set, or the app was open at login on macOS
	const openInBackground = argv.background || app.getLoginItemSettings().wasOpenedAtLogin

	try {
		await installVueDevtools()
	} catch (error) {
		console.log('Unable to install Vue Devtools')
		console.error(error)
	}

	if (process.env.NODE_ENV === 'development') {
		console.log()
		console.log('Nextcloud Talk is running via development server')
		console.log('Hint: type "rs" to restart app without restarting the build')
		console.log()
	}

	// TODO: add windows manager
	/**
	 * @type {import('electron').BrowserWindow}
	 */
	let mainWindow
	let createMainWindow

	setupMenu()

	/**
	 * Focus the main window. Restore/re-create it if needed.
	 */
	function focusMainWindow() {
		// The app is locked - the lock screen is the only window the user may reach,
		// otherwise clicking a notification or the dock icon would bypass the lock
		if (focusLockWindow()) {
			return
		}

		// There is no main window at all, the app is not initialized yet - ignore
		if (!createMainWindow) {
			return
		}

		// There is no window (possible on macOS) - create
		if (!mainWindow || mainWindow.isDestroyed()) {
			mainWindow = createMainWindow()
			onReadyToShow(mainWindow, () => mainWindow.show())
			return
		}

		// The window is minimized - restore
		if (mainWindow.isMinimized()) {
			mainWindow.restore()
		}

		// Show the window in case it is hidden in the system tray and focus it
		mainWindow.show()
	}

	/**
	 * Instead of creating a new app instance - focus existence one
	 */
	app.on('second-instance', (event, argv, cwd) => {
		if (isSameExecution(argv[0], cwd)) {
			focusMainWindow()
			return
		}

		// The second instance is another installation
		// Open the new instance and close the current one
		app.releaseSingleInstanceLock()
		try {
			const newInstance = spawn(path.resolve(argv[0]), argv.slice(1), {
				cwd,
				detached: true,
				stdio: 'ignore',
			}).on('spawn', () => {
				newInstance.unref()
				app.quit()
			}).on('error', (error) => {
				console.error('Failed to switch to the second instance', error)
			})
		} catch (error) {
			console.error('Failed to switch to the second instance', error)
		}
	})

	// Allow requests to a server with accepted untrusted certificate
	// Note: the result of this verification is cached by domain in Electron
	// There is no way to clean the cache except by restarting the app
	session.defaultSession.setCertificateVerifyProc(async (request, callback) => {
		const isAccepted = request.errorCode === 0 || await promptCertificateTrust(mainWindow, request)
		callback(isAccepted ? 0 : -3)
	})

	// Allow web-view with accepted untrusted certificate (Login Flow)
	app.on('certificate-error', async (event, webContents, url, error, certificate, callback) => {
		event.preventDefault()
		const isAccepted = await promptCertificateTrust(mainWindow, { hostname: new URL(url).hostname, certificate, verificationResult: error })
		callback(isAccepted)
	})

	mainWindow = createWelcomeWindow()
	createMainWindow = createWelcomeWindow

	/**
	 * The splash screen animation lasts about a second. Cutting it off mid-way
	 * looks like a glitch, so the main window waits for it to finish.
	 */
	const SPLASH_MIN_DURATION = 1400
	let splashShownAt = 0

	/**
	 * Wait for the splash screen animation to finish, if it is still running
	 */
	const waitForSplash = async () => {
		const remaining = SPLASH_MIN_DURATION - (Date.now() - splashShownAt)
		if (splashShownAt && remaining > 0) {
			await new Promise((resolve) => setTimeout(resolve, remaining))
		}
	}

	onReadyToShow(mainWindow, () => {
		mainWindow.show()
		splashShownAt = Date.now()
	})

	/**
	 * The splash screen kept open while the login page is loading, see below.
	 *
	 * @type {import('electron').BrowserWindow|undefined}
	 */
	let splashWindow

	/**
	 * With an enforced domain there is nothing to ask the user before logging in,
	 * so the authentication window is skipped and the login page is opened right away.
	 */
	const isDirectLogin = Boolean(BUILD_CONFIG.domain && BUILD_CONFIG.enforceDomain)

	ipcMain.once('appData:receive', async (event, newAppData) => {
		appData.fromJSON(newAppData)

		const welcomeWindow = mainWindow

		if (appData.credentials) {
			// Let the splash screen paint before the system prompt covers it
			await waitForSplash()

			// The session is restored from the disk - confirm it is still the same user
			if (!await requestBiometricUnlock()) {
				app.quit()
				return
			}

			// User is authenticated - setup and start main window
			enableWebRequestInterceptor(appData.serverUrl, {
				credentials: appData.credentials,
			})
			mainWindow = createTalkWindow()
			createMainWindow = createTalkWindow
		} else {
			// User is unauthenticated - start login window
			await welcomeWindow.webContents.session.clearStorageData()
			mainWindow = createAuthenticationWindow()
			createMainWindow = createAuthenticationWindow
		}

		onReadyToShow(mainWindow, async () => {
			// With an enforced domain the authentication window logs in on its own,
			// so it is never shown. The splash screen stays up until the login page is ready.
			if (createMainWindow === createAuthenticationWindow && isDirectLogin) {
				splashWindow = welcomeWindow
				return
			}

			await waitForSplash()

			// Do not show the main window if it is the Talk Window opened in the background
			const isTalkWindow = createMainWindow === createTalkWindow
			if (!isTalkWindow || !openInBackground) {
				mainWindow.show()
			}
			welcomeWindow.close()
		})
	})

	/**
	 * The lock screen window, if the app is locked.
	 *
	 * While locked the Talk window is only hidden and keeps running,
	 * so that messages, notifications and calls still arrive.
	 *
	 * @type {import('electron').BrowserWindow|undefined}
	 */
	let lockWindow

	/**
	 * The window asking to create an unlock code, shown while the app is still unlocked.
	 *
	 * @type {import('electron').BrowserWindow|undefined}
	 */
	let setupWindow

	const isLocked = () => Boolean(lockWindow)

	/**
	 * Tell the windows about the lock state, so that they can hide sensitive content
	 *
	 * @param {boolean} locked - Whether the app is locked
	 */
	function broadcastLockState(locked) {
		for (const contents of webContents.getAllWebContents()) {
			contents.send('lock:change', locked)
		}
	}
	const isLockable = () => createMainWindow === createTalkWindow && !isLocked() && !setupWindow
	// There is no point in locking the app if there is no way to unlock it
	const canUnlock = () => hasUnlockCode() || (systemInfo.hasBiometricUnlock && getAppConfig('biometricUnlock'))

	/**
	 * Lock the app
	 */
	function lockApp() {
		if (!isLockable() || !canUnlock()) {
			return
		}

		lockWindow = createLockWindow({ parentWindow: mainWindow })
		registerLockWindow(lockWindow)
		broadcastLockState(true)
		onReadyToShow(lockWindow, () => {
			lockWindow?.show()
			mainWindow.hide()
		})
		lockWindow.on('closed', () => {
			lockWindow = undefined
			registerLockWindow(undefined)
		})
	}

	/**
	 * Ask to create an unlock code. The app stays unlocked and visible meanwhile,
	 * so that only the person already using it can set the code.
	 */
	function openLockSetup() {
		if (!isLockable()) {
			return
		}

		setupWindow = createLockWindow({ setup: true, parentWindow: mainWindow })
		onReadyToShow(setupWindow, () => setupWindow?.show())
		setupWindow.on('closed', () => {
			setupWindow = undefined
		})
	}

	/**
	 * Unlock the app and bring the Talk window back
	 */
	function unlockApp() {
		const windowToClose = lockWindow
		lockWindow = undefined
		registerLockWindow(undefined)
		broadcastLockState(false)
		mainWindow.show()
		windowToClose?.close()
	}

	ipcMain.handle('lock:isLocked', () => isLocked())
	ipcMain.handle('lock:hasCode', () => hasUnlockCode())
	ipcMain.handle('lock:changeCode', () => openLockSetup())
	ipcMain.handle('lock:removeCode', async () => {
		// The code may only be removed by someone already using the unlocked app
		if (isLocked()) {
			return false
		}
		await removeUnlockCode()
		return true
	})
	ipcMain.handle('lock:lockNow', () => {
		// Without a way to unlock, the code has to be created first
		if (!canUnlock()) {
			openLockSetup()
			return
		}
		lockApp()
	})
	ipcMain.handle('lock:getState', () => ({
		hasCode: hasUnlockCode(),
		hasBiometrics: systemInfo.hasBiometricUnlock,
		user: appData.userMetadata?.['display-name'] ?? appData.credentials?.user ?? null,
	}))
	ipcMain.handle('lock:setCode', async (event, code) => {
		// A code may only be set by someone already using the unlocked app
		if (isLocked()) {
			return false
		}

		await setUnlockCode(code)
		setupWindow?.close()
		setupWindow = undefined
		lockApp()
		return true
	})
	ipcMain.handle('lock:cancelSetup', () => {
		setupWindow?.close()
		setupWindow = undefined
	})
	ipcMain.handle('lock:verifyCode', async (event, code) => {
		const isValid = await verifyUnlockCode(code)
		if (isValid) {
			unlockApp()
		}
		return isValid
	})
	ipcMain.handle('lock:unlockWithBiometrics', async () => {
		const isUnlocked = await unlockWithBiometrics()
		if (isUnlocked) {
			unlockApp()
		}
		return isUnlocked
	})
	ipcMain.handle('lock:logout', async () => {
		const windowToClose = lockWindow
		lockWindow = undefined
		windowToClose?.close()
		mainWindow.show()
		await logoutApp()
	})

	setupAutoLock(isLockable, lockApp)

	ipcMain.handle('appData:get', () => appData.toJSON())

	// Credentials are kept out of the renderer storage, encrypted by the OS keychain
	ipcMain.handle('credentials:get', () => loadCredentials())
	ipcMain.handle('credentials:set', (event, credentials) => saveCredentials(credentials))

	let macDockBounceId
	ipcMain.on('talk:flashAppIcon', async (event, shouldFlash) => {
		// MacOS has no "flashing" but "bouncing" of the dock icon
		if (isMac) {
			// Stop previous bounce if any
			if (macDockBounceId) {
				app.dock.cancelBounce(macDockBounceId)
				macDockBounceId = undefined
			}
			// (Re)start bouncing if needed
			if (shouldFlash) {
				macDockBounceId = app.dock.bounce()
			}
		} else {
			// TODO: check if flashFrame also works on Mac since Electron 31
			mainWindow.flashFrame(shouldFlash)
		}
	})

	ipcMain.handle('talk:focus', async () => focusMainWindow())

	ipcMain.handle('authentication:openLoginWebView', async (event, serverUrl) => {
		const result = await openLoginWebView(mainWindow, serverUrl, {
			skipConfirmation: isDirectLogin,
			onReadyToShow: () => {
				splashWindow?.close()
				splashWindow = undefined
			},
		})

		// Login failed or was cancelled - fall back to the authentication window
		if (result instanceof Error && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
			splashWindow?.close()
			splashWindow = undefined
			mainWindow.show()
		}

		return result
	})

	ipcMain.handle('authentication:login', async (event, newAppData) => {
		appData.fromJSON(newAppData)
		mainWindow.close()
		mainWindow = createTalkWindow()
		createMainWindow = createTalkWindow
		onReadyToShow(mainWindow, () => mainWindow.show())
	})

	/**
	 * Log out, clear the session and go back to the login
	 */
	async function logoutApp() {
		if (createMainWindow === createTalkWindow) {
			appData.reset()
			await saveCredentials(null)
			await mainWindow.webContents.session.clearStorageData()
			app.setBadgeCount(0)
			const authenticationWindow = createAuthenticationWindow()
			createMainWindow = createAuthenticationWindow

			if (isDirectLogin) {
				// The authentication window logs in on its own and is never shown,
				// the splash screen covers the gap until the login page is ready
				splashWindow = createWelcomeWindow()
				onReadyToShow(splashWindow, () => splashWindow?.show())
			} else {
				onReadyToShow(authenticationWindow, () => authenticationWindow.show())
			}

			mainWindow.destroy()
			mainWindow = authenticationWindow
		}
	}

	ipcMain.handle('authentication:logout', logoutApp)

	ipcMain.on('callbox:show', (event, callboxParams) => {
		createCallboxWindow(callboxParams)
	})

	ipcMain.handle('help:show', () => {
		createHelpWindow(mainWindow)
	})

	ipcMain.handle('upgrade:show', () => {
		const upgradeWindow = createUpgradeWindow()
		createMainWindow = createUpgradeWindow

		mainWindow.destroy()
		mainWindow = upgradeWindow
	})

	ipcMain.on('app:relaunchWindow', () => {
		isInWindowRelaunch = true
		mainWindow.destroy()
		mainWindow = createMainWindow()
		onReadyToShow(mainWindow, () => mainWindow.show())
		isInWindowRelaunch = false
	})

	ipcMain.on('app:downloadURL', (event, url, filename) => triggerDownloadUrl(mainWindow, url, filename))

	ipcMain.handle('certificate:verify', (event, url) => verifyCertificate(mainWindow, url))

	// Click on the dock icon on macOS
	app.on('activate', () => {
		if (focusLockWindow()) {
			return
		}

		if (mainWindow && !mainWindow.isDestroyed()) {
			// Show the main window if it exists but hidden (not closed), e.g., minimized to the system tray
			mainWindow.show()
		} else {
			// On macOS, it is common to re-create a window in the app when the
			// dock icon is clicked and there are no other windows open.
			// See window-all-closed event handler.
			mainWindow = createMainWindow()
			onReadyToShow(mainWindow, () => mainWindow.show())
		}
	})
})

app.on('window-all-closed', () => {
	// Recreating a window - keep app running
	if (isInWindowRelaunch) {
		return
	}

	// On macOS, it is common for applications and their menu bar to stay active even without windows
	// until the user quits explicitly with Cmd + Q or Quit from the menu.
	if (isMac) {
		return
	}

	// All the windows are closed - quit the app
	app.quit()
})
