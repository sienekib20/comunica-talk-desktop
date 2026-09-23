/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Prepares a fresh clone for development:
 * - clones Nextcloud Talk (spreed) at the version this app is built against
 * - installs its dependencies
 * - downloads the Electron binary when the package manager skipped it
 * - names the development bundle on macOS, which otherwise shows up as "Electron"
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

const CHANNEL = process.env.CHANNEL ?? 'dev'
const TALK_VERSION = packageJson.talk[CHANNEL === 'dev' ? 'stable' : CHANNEL]
const TALK_REPOSITORY = 'https://github.com/nextcloud/spreed'
const TALK_PATH = process.env.TALK_PATH ? resolve(process.env.TALK_PATH) : join(ROOT, 'spreed')

/**
 * Run a command and show its output
 *
 * @param {string} command - Command to run
 * @param {string[]} args - Arguments
 * @param {string} cwd - Working directory
 */
function run(command, args, cwd = ROOT) {
	console.log(`> ${command} ${args.join(' ')}`)
	execFileSync(command, args, { cwd, stdio: 'inherit' })
}

/**
 * Clone Nextcloud Talk, or switch an existing clone to the expected version
 */
function setupTalk() {
	if (process.env.TALK_PATH) {
		console.log(`Using Nextcloud Talk from TALK_PATH: ${TALK_PATH}`)
		return
	}

	if (!existsSync(TALK_PATH)) {
		console.log(`Cloning Nextcloud Talk ${TALK_VERSION}...`)
		run('git', ['clone', '--depth', '1', '--branch', TALK_VERSION, TALK_REPOSITORY, TALK_PATH])
		return
	}

	const currentVersion = execFileSync('git', ['describe', '--tags', '--always'], { cwd: TALK_PATH }).toString().trim()
	if (currentVersion === TALK_VERSION) {
		console.log(`Nextcloud Talk ${TALK_VERSION} is already there`)
		return
	}

	console.log(`Switching Nextcloud Talk from ${currentVersion} to ${TALK_VERSION}...`)
	run('git', ['fetch', '--depth', '1', 'origin', 'tag', TALK_VERSION], TALK_PATH)
	run('git', ['checkout', TALK_VERSION], TALK_PATH)
}

/**
 * The Electron binary is downloaded by an install script, which npm may skip
 */
function setupElectron() {
	if (existsSync(join(ROOT, 'node_modules/electron/dist'))) {
		return
	}
	console.log('Downloading the Electron binary...')
	run('node', ['node_modules/electron/install.js'])
}

/**
 * In development the app runs from the stock Electron bundle, which macOS names
 * after that bundle. Renaming it makes the menu bar and the Dock show the app name.
 * Only cosmetic, and undone by every "npm ci".
 */
function nameDevelopmentBundle() {
	if (process.platform !== 'darwin') {
		return
	}

	const plist = join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/Info.plist')
	if (!existsSync(plist)) {
		return
	}

	const overridesPath = join(ROOT, '.overrides/build.config.json')
	const applicationName = existsSync(overridesPath)
		? JSON.parse(readFileSync(overridesPath, 'utf-8')).applicationName
		: null
	if (!applicationName) {
		return
	}

	for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
		run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${applicationName} (dev)`, plist])
	}
}

setupTalk()
run('npm', ['ci', '--prefix', TALK_PATH])
setupElectron()
nameDevelopmentBundle()

console.log('\nReady. Start the app with: npm run dev')
