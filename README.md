# OnePiece Idle MMORPG

Primeira fundação jogável do MMORPG 2D topdown: Ted explora a Floresta da Alvida, combate Alvidas, recebe loot e pode ativar Auto-Hunt. O servidor WebSocket é a fonte autoritativa para movimento, combate, loot, experiência, ouro, inventário e fruta ativa.

## Pré-requisitos

Node.js 20 ou superior e npm 10 ou superior.

## Instalação

```bash
npm install
```

## Desenvolvimento

Em terminais separados:

```bash
npm run dev -w @onepiece/server
npm run dev -w @onepiece/client
npm run dev -w @onepiece/admin
```

Ou, para servidor e cliente juntos:

```bash
npm run dev
```

Portas atuais:

- Cliente: `http://localhost:5173`
- Content Admin: `http://localhost:5174`
- Servidor WebSocket: `ws://localhost:8787`
- API local do Content Admin: `http://127.0.0.1:8788`

## Build e testes

```bash
npm run build
npm test
```

Para validar todos os workspaces individualmente:

```bash
npm run build -w @onepiece/shared
npm run build -w @onepiece/server
npm test -w @onepiece/server
npm run build -w @onepiece/client
npm run build -w @onepiece/admin
```

## Controles

- WASD ou setas: mover Ted
- Espaço ou habilidade 1: atacar
- Auto-Hunt: alternar o controlador automático

## Estrutura

- `apps/client`: React, Phaser, HUD e apresentação
- `apps/server`: estado autoritativo em Node/WebSocket
- `packages/shared`: contratos, IDs e tipos compartilhados
- `assets`: arte original fornecida, somente leitura pelo jogo
- `docs`: arquitetura, sistemas e auditoria

## Fluxo Git

`main` representa a versão estável e `dev` a integração contínua. Novas mudanças devem começar em uma branch de feature criada a partir de `dev`; consulte [o fluxo de desenvolvimento](docs/DEVELOPMENT_WORKFLOW.md).
