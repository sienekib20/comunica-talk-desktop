/*!
 * SPDX-FileCopyrightText: 2026 Talk Gov.ao
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Portuguese (Portugal) for Talk strings its pt_PT bundle lacks, which would show in English.
 * They come before the pt_PT bundle (which wins) and after pt_BR (the general fallback).
 */
export const PT_PT_OVERRIDES: Record<string, string> = {
	'Hello, {displayName}': 'Olá, {displayName}',
	'Join conversations': 'Juntar-se a conversas',
	'Check devices': 'Testar dispositivos',
	'Schedule meetings': 'Reuniões agendadas',
	'Open calendar': 'Abrir calendário',
	'Set a reminder on a message to be notified': 'Defina um lembrete numa mensagem para ser avisado',
	'Forward message': 'Reencaminhar mensagem',
	'Search in app': 'Pesquisar na app',
	'Keyboard shortcuts': 'Atalhos de teclado',
}
