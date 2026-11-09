/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getAppRootUrl, getRootUrl } from '@nextcloud/router'

/**
 * URL of a sound shipped by the server's Notifications app (notification.ogg, talk.ogg).
 *
 * generateFilePath('notifications', 'img', file) relies on the server's list of app paths
 * (window._oc_appswebroots), which the desktop windows do not receive: it then returns
 * "/img/<file>", which does not exist, and every sound fails silently.
 *
 * @param file - Sound file name
 */
export function getNotificationSoundUrl(file: string): string {
	const appRoot = getAppRootUrl('notifications') || `${getRootUrl()}/apps/notifications`
	return `${appRoot}/img/${file}`
}
