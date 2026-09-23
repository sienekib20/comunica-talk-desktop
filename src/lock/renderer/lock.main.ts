/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { t } from '@nextcloud/l10n'
import { setupWebPage } from '../../shared/setupWebPage.js'

import '@global-styles/dist/icons.css'

// Loads the translation bundles for the system language
await setupWebPage()

/**
 * The unlock code is created while the app is still unlocked and the user is present.
 * The lock screen itself can never create one, otherwise anyone finding a locked app
 * could set a new code and get in.
 */
const isSetup = new URLSearchParams(window.location.search).has('setup')

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const titleElement = $<HTMLParagraphElement>('title')
const userElement = $<HTMLParagraphElement>('user')
const formElement = $<HTMLFormElement>('form')
const codeElement = $<HTMLInputElement>('code')
const codeConfirmElement = $<HTMLInputElement>('code-confirm')
const submitElement = $<HTMLButtonElement>('submit')
const biometricsElement = $<HTMLButtonElement>('biometrics')
const errorElement = $<HTMLParagraphElement>('error')
const secondaryElement = $<HTMLButtonElement>('secondary')

const state = await window.TALK_DESKTOP.lock.getState()

titleElement.textContent = isSetup ? t('talk_desktop', 'Create an unlock code') : t('talk_desktop', 'Locked')
userElement.textContent = state.user ?? ''
codeElement.placeholder = isSetup ? t('talk_desktop', 'New code') : t('talk_desktop', 'Unlock code')
codeConfirmElement.placeholder = t('talk_desktop', 'Repeat the code')
codeConfirmElement.classList.toggle('hidden', !isSetup)
submitElement.textContent = isSetup ? t('talk_desktop', 'Save and lock') : t('talk_desktop', 'Unlock')
biometricsElement.textContent = t('talk_desktop', 'Unlock with Touch ID')
secondaryElement.textContent = isSetup ? t('talk_desktop', 'Cancel') : t('talk_desktop', 'Log out instead')

/**
 * Show a message under the form
 *
 * @param message - Message to show, an empty string clears it
 */
function setError(message: string) {
	errorElement.textContent = message
}

formElement.addEventListener('submit', async (event) => {
	event.preventDefault()
	setError('')

	const code = codeElement.value.trim()

	if (isSetup) {
		if (code.length < 4) {
			return setError(t('talk_desktop', 'Use at least 4 characters'))
		}
		if (code !== codeConfirmElement.value.trim()) {
			return setError(t('talk_desktop', 'The codes do not match'))
		}
		if (!await window.TALK_DESKTOP.lock.setCode(code)) {
			return setError(t('talk_desktop', 'The code could not be saved'))
		}
		return
	}

	if (!await window.TALK_DESKTOP.lock.verifyCode(code)) {
		codeElement.value = ''
		codeElement.focus()
		return setError(t('talk_desktop', 'Wrong code'))
	}
})

if (state.hasBiometrics && !isSetup) {
	biometricsElement.classList.remove('hidden')
	biometricsElement.addEventListener('click', async () => {
		setError('')
		if (!await window.TALK_DESKTOP.lock.unlockWithBiometrics()) {
			setError(t('talk_desktop', 'Touch ID was not recognised'))
		}
	})
	// Offer it right away, the code remains available if the prompt is dismissed
	window.TALK_DESKTOP.lock.unlockWithBiometrics()
}

secondaryElement.addEventListener('click', () => {
	if (isSetup) {
		window.TALK_DESKTOP.lock.cancelSetup()
	} else {
		window.TALK_DESKTOP.lock.logout()
	}
})

codeElement.focus()
