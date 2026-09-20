# Sprint de Estabilização e Consolidação

Data: 19/09/2026

## Resultado

Esta sprint preservou conteúdo, HUD e protocolo de intents e focou na base técnica. Nenhum mapa, inimigo, fruta, habilidade ou asset foi criado.

## Duplicações removidas

- `itemDefinitions`, `fruitDefinitions`, `skillDefinitions` e `shopDefinitions` vivem em `packages/shared/src/index.ts`.
- O cliente passa a consumir nomes, slots, descrições, cooldowns e preços públicos dessas definitions.
- A definição da Guro passou a apontar para `guro_blast`, `guro_spin`, `guro_crush` e `guro_placeholder`, eliminando os IDs antigos divergentes.

## Modo de teste e loot

- Removido o drop garantido de todos os itens/frutas.
- Chances usam basis points: `10_000 = 100%`, `100 = 1%`.
- Cada entrada declara `chanceBps`, `minQuantity` e `maxQuantity`.
- Sube Sube e Guro Guro estão configuradas em 1% (100 bps).
- RNG é exclusivamente server-side e aceita `RandomSource` injetável para testes.

## Guro e Auto-Hunt

- O texto de atordoamento inexistente foi removido: Impacto Gravitacional é dano de impacto, sem prometer stun.
- Rodopio continua com duração de quatro segundos, quatro ticks de 14 e cooldown server-side de 16 segundos.
- `AutoHuntSkillPlanner` não referencia IDs Sube. `autoUseSkills` é `false` por padrão; Auto-Hunt usa ataque básico com qualquer fruta ou sem fruta.

## Colisão e NPC

- `map-definitions.ts` separa bounds, zonas bloqueadas e colliders de props por área.
- Floresta mantém troncos como blockers; Praia bloqueia água/limites e pedras e mantém areia transitável.
- O NPC Velho Bêbado possui uma única definition TypeScript (`oldDrunkHealerConfig`), incluindo animações, falas e hooks futuros.

## Sessões

- `GameSession` passou a possuir jogador, área, inimigos, NPC, Analyzer, feedback e logs.
- `SessionManager` gera IDs no servidor, cria/destrói sessões por socket e impede controle compartilhado de Ted.
- A instância de Hunt continua privada por sessão no Alpha. Não há mundo compartilhado, login ou persistência ainda.

## Testes criados/atualizados

- RNG: 0%, 100%, determinismo e recompensa única.
- Sessões: movimento, gold, inventário, fruta e Analyzer isolados.
- Colisão: árvore, água, areia e pedra.
- Auto-Hunt: sem IDs específicos de fruta e somente ataque básico por padrão.
- Guro Spin: quatro ticks e encerramento após a duração.

## Resultados de validação

| Comando | Resultado |
| --- | --- |
| `npm run build -w @onepiece/shared` | passou |
| `npm run build -w @onepiece/server` | passou |
| `npm test -w @onepiece/server` | 18 passaram, 0 falharam |
| `npm run build -w @onepiece/client` | passou |
| Runtime WebSocket em `8787` | passou: duas conexões, A moveu `620 → 640`; B permaneceu em `620` |

## Arquivos criados

- `apps/server/src/GameSession.ts`
- `apps/server/src/SessionManager.ts`
- `apps/server/src/auto-hunt.ts`
- `apps/server/src/map-definitions.ts`
- `apps/server/test/stabilization.test.ts`
- `docs/STABILIZATION_REPORT.md`

## Arquivos modificados

- `packages/shared/src/index.ts`
- `apps/server/src/domain.ts`
- `apps/server/src/index.ts`
- `apps/server/test/domain.test.ts`
- `apps/client/src/components/hud/Hud.tsx`

## Arquivos removidos

- `data/npcs/old_drunk_healer.json` — metadado duplicado e não carregado em runtime; seus dados úteis foram preservados na definition TypeScript.

## Questões conhecidas

- Não há persistência, autenticação ou reconexão de sessão.
- Há apenas um cliente visual por sessão; jogadores ainda não se veem mutuamente.
- O painel de Bot ainda não expõe um controle visual para `autoUseSkills`; ele permanece explicitamente desligado nesta sprint.
