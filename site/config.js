/**
 * Configuração dos downloads.
 *
 * Ao publicar uma nova versão:
 * 1. Criar a release no GitHub com o formato de etiqueta `v<versão>`
 * 2. Actualizar `version` e `releasedAt` aqui
 * 3. Confirmar que os nomes dos ficheiros em `files` batem com os da release
 *
 * Enquanto `repository` estiver vazio, a página mostra os downloads como
 * indisponíveis em vez de apontar para ligações que não existem.
 */
window.DOWNLOADS_CONFIG = {
	/** Repositório no formato "organização/repositório", onde ficam as releases */
	repository: 'sienekib20/comunica-talk-desktop',

	/** Versão publicada, sem o "v" */
	version: '2.3.4',

	/** Data da publicação, no formato AAAA-MM-DD */
	releasedAt: '2026-09-24',

	/**
	 * Ficheiros de cada release. O nome é o do ficheiro anexado à release.
	 * `size` é apenas informativo e `available` diz se já existe na release —
	 * um ficheiro por publicar aparece como "brevemente" em vez de dar erro.
	 */
	files: {
		macos: [
			{ label: 'Apple Silicon (M1 e posteriores)', name: 'Comunica.gov.ao-macos-arm64.dmg', size: '149 MB', available: true },
			{ label: 'Intel', name: 'Comunica.gov.ao-macos-x64.dmg', size: '~150 MB', available: false },
		],
		windows: [
			{ label: 'Instalador', name: 'Comunica.gov.ao-windows-x64.exe', size: '174 MB', available: true },
			{ label: 'MSI (instalação gerida)', name: 'Comunica.gov.ao-windows-x64.msi', size: '~155 MB', available: false },
		],
		linux: [
			{ label: 'Arquivo ZIP', name: 'Comunica.gov.ao-linux-x64.zip', size: '145 MB', available: true },
			{ label: 'Flatpak', name: 'Comunica.gov.ao-linux-x64.flatpak', size: '~120 MB', available: false },
		],
	},
}
