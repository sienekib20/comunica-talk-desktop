/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { app, safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CREDENTIALS_FILE_NAME = 'credentials'

type Credentials = { server: string, user: string, password: string }

type StoredCredentials = {
	/** Whether the payload is encrypted by the OS keychain */
	encrypted: boolean
	/** Base64 of the encrypted payload, or the plain JSON where encryption is unavailable */
	data: string
}

/**
 * Path to the file holding the credentials, next to the application config
 */
function getCredentialsFilePath(): string {
	return join(app.getPath('userData'), CREDENTIALS_FILE_NAME)
}

/**
 * Store the credentials encrypted by the OS keychain.
 *
 * Passing null removes them, for example on logout.
 */
export async function saveCredentials(credentials: Credentials | null): Promise<void> {
	if (!credentials) {
		await rm(getCredentialsFilePath(), { force: true })
		return
	}

	const plain = JSON.stringify(credentials)
	const isEncryptionAvailable = safeStorage.isEncryptionAvailable()

	if (!isEncryptionAvailable) {
		// Happens on Linux without a keyring. Storing is still better than asking
		// the user to log in on every start, but it is not protected at rest.
		console.warn('OS encryption is not available, credentials are stored unprotected')
	}

	const stored: StoredCredentials = {
		encrypted: isEncryptionAvailable,
		data: isEncryptionAvailable ? safeStorage.encryptString(plain).toString('base64') : plain,
	}

	// Readable by the current user only
	await writeFile(getCredentialsFilePath(), JSON.stringify(stored), { mode: 0o600 })
}

/**
 * Read the stored credentials, or null when there are none
 */
export async function loadCredentials(): Promise<Credentials | null> {
	let stored: StoredCredentials

	try {
		stored = JSON.parse(await readFile(getCredentialsFilePath(), 'utf-8')) as StoredCredentials
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
			console.error('Failed to read the credentials file', error)
		}
		return null
	}

	try {
		const plain = stored.encrypted ? safeStorage.decryptString(Buffer.from(stored.data, 'base64')) : stored.data
		return JSON.parse(plain) as Credentials
	} catch (error) {
		// The keychain entry is gone or belongs to another installation - log in again
		console.error('Failed to decrypt the stored credentials', error)
		return null
	}
}
