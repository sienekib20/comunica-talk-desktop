# Pontos por resolver

Decisões tomadas que deixaram algo em aberto. Rever antes de gerar um build de
Windows ou de alinhar o fork com o Nextcloud Talk oficial.

## 1. O bloqueio de ecrã só funciona em macOS

**Antes de publicar um build de Windows ou Linux.**

O código de desbloqueio foi removido na 2.6.0 e o Touch ID passou a ser a única
forma de entrar. O Electron não tem API para o Windows Hello, e esta aplicação
nunca teve biometria fora do macOS — por isso, nessas plataformas, não há forma
de desbloquear e a aplicação **nunca bloqueia**.

Quem já tivesse um código definido continua com ele guardado, mas ignorado.

Antes de um build de Windows há que decidir entre: repor o código de desbloqueio
só nessas plataformas, integrar o Windows Hello através de um módulo nativo, ou
assumir que em Windows não há bloqueio e dizê-lo às pessoas.

Removido em `feat(lock): unlock with Touch ID only, drop the unlock code`.

## 2. Credenciais de assinatura expostas

`release-mac.sh` tem a palavra-passe do certificado e uma palavra-passe de
aplicação da Apple em texto simples, e `Talk-Certificate.p12` está dentro da
pasta do projecto. Ambos estão no `.gitignore`, por isso nunca foram para os
repositórios, mas as credenciais continuam válidas.

Revogar as duas no Apple ID, gerar novas, e mover o `.p12` para fora do projecto.

## 3. O fork está preso a código do upstream de Setembro de 2026

Este fork partiu do ramo principal do `nextcloud/talk-desktop` a 23/09/2026,
depois da v2.3.2. Desde então o upstream avançou e nós não acompanhámos. São 45
ficheiros de divergência, dos quais o que mais pesa:

- **Autenticação reescrita** a 28/09 (`loginFlowV1.service.ts`,
  `loginFlowV1.window.ts`, ficheiros do processo principal passados a
  TypeScript). O nosso `login.window.js` é a versão anterior, e é onde estão as
  personalizações do login directo do gov.ao — alinhar vai colidir com elas.
- **Definições de contraste do sistema** (`useMatchMedia.ts`,
  `usePrefersContrastMore.ts`), que nos faltam.
- **O Talk deixou de ser clonado por script** e passou a ser uma dependência
  (`"talk": "github:nextcloud-releases/spreed#v25.0.2"`). Nós continuamos com o
  `scripts/setup.mjs`, e é por isso que aqui é preciso correr `npm run setup`.

Note-se também que os números de versão deste fork (2.4.0 em diante) não
correspondem a nenhuma versão oficial: a última do upstream é a v2.3.2.
