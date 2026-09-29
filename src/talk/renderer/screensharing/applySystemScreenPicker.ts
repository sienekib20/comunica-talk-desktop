/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { SYSTEM_PICKER_SOURCE_ID } from './getDesktopMediaSource.ts'

/**
 * Route screen sharing through the picker macOS provides.
 *
 * Talk asks the desktop app for a source id and then captures it with
 * getUserMedia. That path needs the screen recording permission, which a
 * sandboxed app never gets. With the system picker the user chooses inside
 * macOS itself, and the page receives the capture from getDisplayMedia.
 *
 * So whenever a capture is asked for with the marker left by
 * getDesktopMediaSource(), it is served by getDisplayMedia instead.
 */
export function applySystemScreenPicker() {
	if (!window.systemInfo.hasSystemScreenPicker) {
		return
	}

	const { mediaDevices } = navigator
	const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices)

	mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
		// @ts-expect-error - the mandatory constraints are a Chromium extension
		const sourceId = constraints?.video?.mandatory?.chromeMediaSourceId

		if (sourceId !== SYSTEM_PICKER_SOURCE_ID) {
			return getUserMedia(constraints)
		}

		return mediaDevices.getDisplayMedia({ video: true, audio: false })
	}
}
