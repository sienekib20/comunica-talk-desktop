/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { systemPreferences } from 'electron'
import { getAppConfig } from './AppConfig.ts'
import { isMac } from './system.utils.ts'

/**
 * Whether the system can ask for a biometric authentication.
 * Only macOS Touch ID is supported - Electron has no API for Windows Hello.
 */
export function isBiometricUnlockAvailable(): boolean {
	return isMac && systemPreferences.canPromptTouchID()
}

/**
 * Ask for the biometric authentication before opening an authenticated session.
 *
 * @param options - Options
 * @param options.force - Ask even when the setting is disabled, for an explicit unlock action
 *
 * @return Whether the app may continue. True where biometric authentication
 *         is disabled or unavailable, so that no user is ever locked out.
 */
export async function requestBiometricUnlock({ force = false } = {}): Promise<boolean> {
	if (!isBiometricUnlockAvailable() || (!force && !getAppConfig('biometricUnlock'))) {
		return true
	}

	try {
		await systemPreferences.promptTouchID('unlock Nextcloud Talk')
		return true
	} catch (error) {
		// The user cancelled or failed to authenticate
		console.log('Biometric unlock was not confirmed', error)
		return false
	}
}
