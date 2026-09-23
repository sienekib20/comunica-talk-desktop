<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: CC0-1.0
-->

# Comunica.gov.ao

Cliente de desktop do [Nextcloud Talk](https://github.com/nextcloud/talk-desktop) para o
[gov.ao](https://gov.ao). É um *fork*: o código base é o do projeto oficial, com a identidade
e o comportamento adaptados ao nosso servidor.

## Requisitos

| | |
|---|---|
| Node.js | 24.x (o projeto declara `^24.0.0`; versões mais recentes costumam funcionar) |
| npm | 11.3 ou superior |
| git | para obter o código do Talk |
| Espaço em disco | cerca de 4 GB (dependências e binário do Electron) |

## Como rodar

```sh
npm ci        # dependências desta aplicação
npm run setup # código do Nextcloud Talk + binário do Electron
npm run dev   # abre a aplicação
```

O `npm run setup` trata das três coisas que costumam falhar numa máquina nova:

1. **Clona o Nextcloud Talk** (`spreed/`) na versão exata contra a qual esta aplicação é
   compilada — ver o campo `talk` no `package.json`. Não é submódulo: é um repositório
   à parte, ignorado pelo git.
2. **Descarrega o binário do Electron**, que o npm às vezes salta por causa da aprovação
   de *install scripts*.
3. **Dá nome ao pacote de desenvolvimento no macOS**, que de outra forma aparece como
   "Electron" na barra de menus.

Para reutilizar um `spreed` que já exista noutro sítio, defina `TALK_PATH`:

```sh
cp .env.example .env
# editar .env: TALK_PATH=/caminho/para/spreed
```

## Compatibilidade de versões

**A versão do Talk tem de corresponder à do servidor.** O `gov.ao` corre o Nextcloud 34,
por isso esta aplicação usa o Talk **v24.0.4** (feito para o Nextcloud 34). Compilar com
uma versão mais recente do Talk faz a aplicação chamar APIs que o servidor ainda não tem.

Quando o servidor for atualizado, atualize o campo `talk` no `package.json` e corra
`npm run setup` de novo.

## O que este fork muda

| Área | Alteração |
|---|---|
| Identidade | Nome "Comunica.gov.ao", ícones, ecrã de arranque e cores do gov.ao |
| Autenticação | Liga-se sempre a `https://gov.ao`; sem ecrã de endereço de servidor |
| Credenciais | Guardadas cifradas pelo sistema (Keychain no macOS, DPAPI no Windows) |
| Bloqueio de ecrã | Código de desbloqueio, Touch ID no macOS e bloqueio por inatividade |
| Interface | Menu único no avatar, correções de dimensionamento e posicionamento de janelas |

A configuração da marca está em [`.overrides/build.config.json`](.overrides/build.config.json),
versionada de propósito — sem ela a aplicação não sabe a que servidor se liga.

## Compilar para distribuição

```sh
npm run build:mac:arm64   # Apple Silicon
npm run build:windows:x64 # Windows
npm run package           # gera os instaladores
```

## Notas

- **Licença:** AGPL-3.0-or-later, herdada do projeto original. Se a aplicação for
  distribuída, o código-fonte modificado tem de ser disponibilizado a quem a recebe.
- **Traduções:** as correções em `l10n/` são locais. O caminho correto para as tornar
  permanentes é o [Transifex do Nextcloud](https://explore.transifex.com/nextcloud/) —
  uma sincronização de traduções sobrepõe-se ao que está aqui.
- **Contribuir para o projeto original:** correções que não sejam específicas do gov.ao
  devem ser propostas ao [nextcloud/talk-desktop](https://github.com/nextcloud/talk-desktop),
  separadas das alterações de marca.
- O README do projeto original está em [README.upstream.md](README.upstream.md).
