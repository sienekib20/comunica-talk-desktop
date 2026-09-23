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
	version: '2.3.2',

	/** Data da publicação, no formato AAAA-MM-DD */
	releasedAt: '',

	/**
	 * Ficheiros de cada release. O nome é o do ficheiro anexado à release.
	 * `size` é apenas informativo, para o utilizador saber o que esperar.
	 */
	files: {
		macos: [
			{ label: 'Apple Silicon (M1 e posteriores)', name: 'Comunica.gov.ao-macos-arm64.dmg', size: '~180 MB' },
			{ label: 'Intel', name: 'Comunica.gov.ao-macos-x64.dmg', size: '~180 MB' },
		],
		windows: [
			{ label: 'Instalador (recomendado)', name: 'Comunica.gov.ao-windows-x64.exe', size: '~240 MB' },
			{ label: 'MSI (instalação gerida)', name: 'Comunica.gov.ao-windows-x64.msi', size: '~245 MB' },
		],
		linux: [
			{ label: 'Flatpak (recomendado)', name: 'Comunica.gov.ao-linux-x64.flatpak', size: '~120 MB' },
			{ label: 'Arquivo ZIP', name: 'Comunica.gov.ao-linux-x64.zip', size: '~210 MB' },
		],
	},
}
