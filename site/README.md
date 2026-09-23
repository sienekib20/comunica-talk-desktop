# Comunica.gov.ao — página de transferências

Página estática que distribui a aplicação de desktop do
[Comunica.gov.ao](https://gitlab.ima.gov.ao/dtdda/comunica-gov.ao/talk-desktop)
para macOS, Windows e Linux.

Sem dependências e sem passo de compilação: são três ficheiros servidos como estão.

## Ver localmente

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar uma nova versão

1. Criar a *release* no GitHub com a etiqueta `v<versão>` e anexar os instaladores.
2. Editar [`config.js`](config.js):
   - `repository` — `organização/repositório` onde estão as releases
   - `version` — a versão publicada, sem o `v`
   - `releasedAt` — data no formato `AAAA-MM-DD`
   - `files` — confirmar que os nomes correspondem aos ficheiros anexados
3. Enviar para o `main`. A Vercel publica automaticamente.

Enquanto `repository` estiver vazio, os botões aparecem como **brevemente** em vez de
apontarem para ligações inexistentes.

## Como a página se comporta

- Deteta o sistema operativo do visitante e destaca o cartão correspondente
- Mostra os passos de instalação desse sistema
- Acompanha o tema claro ou escuro do sistema
- Funciona em ecrãs pequenos

## Publicar na Vercel

O projeto é estático, sem configuração especial. Na Vercel:

- *Framework preset*: **Other**
- *Build command*: vazio
- *Output directory*: `.`

## Licença

A aplicação distribuída é derivada do [Nextcloud Talk](https://github.com/nextcloud/talk-desktop),
sob a licença AGPL-3.0-or-later. Quem recebe a aplicação tem direito ao código-fonte modificado.
