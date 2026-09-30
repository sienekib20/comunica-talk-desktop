/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BrowserWindow } from 'electron'

import { powerMonitor } from 'electron'
import { getAppConfig } from './AppConfig.ts'
import { requestBiometricUnlock } from './biometrics.service.ts'

const AUTO_LOCK_CHECK_INTERVAL = 15 * 1000

/**
 * The lock screen window, when the app is locked.
 * Kept here, so that every way of showing a window can check it.
 */
let lockWindow: BrowserWindow | undefined

/**
 * Register or clear the lock screen window
 */
export function registerLockWindow(window?: BrowserWindow): void {
	lockWindow = window
}

/**
 * Whether the app is locked
 */
export function isLocked(): boolean {
	return Boolean(lockWindow && !lockWindow.isDestroyed())
}

/**
 * Bring the lock screen to the front.
 * Used instead of showing the main window while the app is locked.
 *
 * @return Whether the app is locked and the lock screen was focused
 */
export function focusLockWindow(): boolean {
	if (!isLocked()) {
		return false
	}

	if (lockWindow!.isMinimized()) {
		lockWindow!.restore()
	}
	lockWindow!.show()
	lockWindow!.focus()
	return true
}

/**
 * Unlock with the system biometric authentication
 */
export async function unlockWithBiometrics(): Promise<boolean> {
	return await requestBiometricUnlock({ force: true })
}

/**
 * Watch for inactivity and lock the app.
 *
 * The app itself keeps running while locked, so that messages,
 * notifications and calls still arrive.
 *
 * @param shouldLock - Whether the app is in a state where locking makes sense
 * @param lock - Lock the app
 * @return Stop watching
 */
export function setupAutoLock(shouldLock: () => boolean, lock: () => void): () => void {
	const lockIfIdle = () => {
		const timeout = getAppConfig('autoLockMinutes')
		if (!timeout || !shouldLock()) {
			return
		}
		// System-wide idle time, so that using another app also counts as inactivity
		if (powerMonitor.getSystemIdleTime() >= timeout * 60) {
			lock()
		}
	}

	const lockNow = () => {
		if (getAppConfig('autoLockMinutes') && shouldLock()) {
			lock()
		}
	}

	const interval = setInterval(lockIfIdle, AUTO_LOCK_CHECK_INTERVAL)
	// The screen was locked or the computer went to sleep - do not stay unlocked behind it
	powerMonitor.on('lock-screen', lockNow)
	powerMonitor.on('suspend', lockNow)

	return () => {
		clearInterval(interval)
		powerMonitor.off('lock-screen', lockNow)
		powerMonitor.off('suspend', lockNow)
	}
}
