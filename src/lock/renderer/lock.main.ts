/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@nextcloud/l10n'
import { setupWebPage } from '../../shared/setupWebPage.js'

import '@global-styles/dist/icons.css'

// Loads the translation bundles for the system language
await setupWebPage()

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const titleElement = $<HTMLParagraphElement>('title')
const userElement = $<HTMLParagraphElement>('user')
const biometricsElement = $<HTMLButtonElement>('biometrics')
const errorElement = $<HTMLParagraphElement>('error')
const secondaryElement = $<HTMLButtonElement>('secondary')

const state = await window.TALK_DESKTOP.lock.getState()

titleElement.textContent = t('talk_desktop', 'Locked')
userElement.textContent = state.user ?? ''
biometricsElement.textContent = t('talk_desktop', 'Unlock with Touch ID')
secondaryElement.textContent = t('talk_desktop', 'Log out instead')

/**
 * Show a message under the button
 *
 * @param message - Message to show, an empty string clears it
 */
function setError(message: string) {
	errorElement.textContent = message
}

/**
 * Ask the system to confirm who is there
 */
async function unlock() {
	setError('')
	if (!await window.TALK_DESKTOP.lock.unlockWithBiometrics()) {
		setError(t('talk_desktop', 'Touch ID was not recognised'))
	}
}

biometricsElement.addEventListener('click', unlock)
secondaryElement.addEventListener('click', () => window.TALK_DESKTOP.lock.logout())

// Ask right away - the button stays for when the prompt is dismissed
unlock()
