# Onepiece MMORPG — relatório de estado

## Plataforma

- Browser MMORPG com React/TypeScript sobre Phaser 3 e servidor WebSocket autoritativo.
- Workspace: `apps/client`, `apps/server`, `packages/shared`; assets públicos em `assets/`.
- Cliente e servidor compilam; testes de domínio do servidor: 10 aprovados.

## Implementado

- Ted: idle, caminhada direcional, ataque, morte e suporte a sprites frente/costas/lateral.
- Áreas: Barco Pirata (hub/curandeiro), Floresta da Alvida e Praia do Buffalo.
- NPC Velho Bêbado: sentado ao lado do balcão, interativo, cura autoritativa e animações idle/drink/sway/interact/heal.
- Alvida: spawn, perseguição, ataque, morte, loot e respawn aleatório. Ataque visual configurado em 7 FPS.
- Buffalo: assets em `assets/enemies/buffalo`, mapa Praia, idle/chase/ataque, HP/dano/respawn próprios.
- Hunts: Floresta da Alvida e Praia do Buffalo; entrar em hunt liga Auto-Hunt em `SEARCHING`.
- Drops: Alvida entrega itens e Sube Sube no Mi (1%); Buffalo entrega Cascalho, Poção Menor e Guro Guro no Mi (1%).
- Frutas: Ted inicia sem fruta; frutas adquiridas podem ser equipadas. Guro Guro tem slots bloqueados enquanto skills não existem.
- HUD: perfil, navegação superior, minimapa, resumo de batalha, log e quatro slots de habilidade fixos; tema naval em CSS.
- Bolsa: seleção, bloqueio visual vermelho/verde e venda de tudo/selecionado respeitando bloqueios.
- Loja: compra autoritativa de Poção Menor (50) e Poção Maior (110).

## Arquivos centrais

- `packages/shared/src/index.ts`: contratos, hunts, loot, áreas e intents.
- `apps/server/src/domain.ts`: entidades e regras de inventário/inimigos.
- `apps/server/src/index.ts`: loop do jogo, auto-hunt, compra/venda e troca de áreas.
- `apps/client/src/game/WorldScene.ts`: renderização Phaser de áreas, NPCs e inimigos.
- `apps/client/src/components/hud/Hud.tsx`: HUD, hunts, inventário e loja.
- `apps/client/src/theme/pirate-hud.css`: identidade visual e layout responsivo.

## Próximos passos sugeridos

1. Criar habilidades reais para Guro Guro e integrar cooldowns/FX.
2. Registrar métricas reais no Hunt Analyzer: kills, tempo, XP/h e gold/h.
3. Persistir bloqueios de inventário no servidor/banco por jogador (hoje permanecem enquanto o painel está aberto).
4. Melhorar cards de Hunt com detalhes/preview do Buffalo e requisitos de nível.
5. Revisar visualmente e balancear Buffalo, drops, preços e progressão.
6. Adicionar testes de integração para compra, venda, entrada nas hunts e Buffalo.

## Validação recente

- `npm run build -w @onepiece/shared`: aprovado.
- `npm run build -w @onepiece/server`: aprovado.
- `npm test -w @onepiece/server`: 10/10 aprovados.
- `npm run build -w @onepiece/client`: aprovado (aviso não bloqueante de bundle acima de 500 kB).
