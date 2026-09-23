/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BrowserWindow } from 'electron'

import { powerMonitor } from 'electron'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getAppConfig, setAppConfig } from './AppConfig.ts'
import { requestBiometricUnlock } from './biometrics.service.ts'

const SCRYPT_KEY_LENGTH = 64
const AUTO_LOCK_CHECK_INTERVAL = 15 * 1000
const MAX_FREE_ATTEMPTS = 3
const ATTEMPT_DELAY = 1500
const MAX_ATTEMPT_DELAY = 30 * 1000

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
 * Derive a key from the unlock code. Never store the code itself.
 */
function hashCode(code: string, salt: string): string {
	return scryptSync(code.normalize('NFKC'), salt, SCRYPT_KEY_LENGTH).toString('hex')
}

/**
 * Whether an unlock code has been set
 */
export function hasUnlockCode(): boolean {
	return Boolean(getAppConfig('unlockCode'))
}

/**
 * Set a new unlock code
 */
export async function setUnlockCode(code: string): Promise<void> {
	const salt = randomBytes(16).toString('hex')
	await setAppConfig('unlockCode', { salt, hash: hashCode(code, salt) })
}

/**
 * Verify the unlock code against the stored one.
 *
 * Wrong attempts are slowed down and counted across restarts,
 * so that a short code cannot simply be guessed.
 */
export async function verifyUnlockCode(code: string): Promise<boolean> {
	const stored = getAppConfig('unlockCode')
	if (!stored) {
		return false
	}

	const failedAttempts = getAppConfig('unlockFailedAttempts') ?? 0
	if (failedAttempts >= MAX_FREE_ATTEMPTS) {
		const delay = Math.min((failedAttempts - MAX_FREE_ATTEMPTS + 1) * ATTEMPT_DELAY, MAX_ATTEMPT_DELAY)
		await new Promise((resolve) => setTimeout(resolve, delay))
	}

	// Compare in constant time, so that the comparison does not leak the code
	const expected = Buffer.from(stored.hash, 'hex')
	const actual = Buffer.from(hashCode(code, stored.salt), 'hex')
	const isValid = expected.length === actual.length && timingSafeEqual(expected, actual)

	await setAppConfig('unlockFailedAttempts', isValid ? 0 : failedAttempts + 1)

	return isValid
}

/**
 * Remove the unlock code. Only allowed while the app is unlocked.
 */
export async function removeUnlockCode(): Promise<void> {
	await setAppConfig('unlockCode', undefined)
	await setAppConfig('unlockFailedAttempts', 0)
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
