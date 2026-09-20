# Enemy Lifecycle Recovery Report

Data: 19/09/2026

## Root cause

O problema era server-side. Na migração para `GameSession`, a antiga rotina de respawn de inimigos não foi migrada. Um `EnemyDomain` chegava corretamente a `DEAD`, entregava a recompensa uma vez, mas permanecia indefinidamente em `session.enemies`. Por isso os snapshots continuavam contendo cadáveres e nenhum novo inimigo era criado.

## Lifecycle antes

`SPAWN → combate → DEAD → recompensa → permanece em session.enemies`

Não havia remoção ou agendamento de respawn.

## Lifecycle depois

`SPAWN → combate → DEAD → reward única → visual DEAD 500 ms → removido do snapshot → nova instância após 3 s → IDLE`

- `enemyLifecycle` pertence à própria `GameSession`/Hunt instance.
- Uma entrada por ID de instância impede agenda de respawn duplicada.
- A nova entidade tem ID novo, HP máximo e estado inicial `IDLE`.
- Alterar Hunt limpa agendas anteriores para não trazer inimigos de outra área.
- Inimigos `DEAD` já são ignorados por seleção manual, Auto-Hunt, skills e IA.

## Client reconciliation

`WorldScene.applySnapshot()` já aplicava reconciliação completa: quando um ID não chega no snapshot, destrói sprite e barra de HP e remove a entrada do `Map`. Portanto não foi preciso alterar Phaser. A remoção server-side agora aciona essa regra e elimina cadáveres/sprites órfãos.

## Reward / Auto-Hunt

`claimReward()` continua sendo a guarda única de XP, gold, loot, fruta e Analyzer. O target automático filtra `DEAD`; depois da remoção ele simplesmente busca entidades ativas.

## Testes automatizados

- Alvida: morto, visual breve, removido aos 500 ms, respawn aos 3 s, sem recompensa adicional.
- Buffalo: mesmo lifecycle genérico e recompensa única.
- Todos os testes de morte/respawn de player permanecem ativos.
- Suite atual: 23 passaram, 0 falharam.

## Builds

| Comando | Resultado |
| --- | --- |
| `npm run build -w @onepiece/shared` | passou |
| `npm run build -w @onepiece/server` | passou |
| `npm test -w @onepiece/server` | 23 passaram, 0 falharam |
| `npm run build -w @onepiece/client` | passou |

## Arquivos modificados

- `apps/server/src/GameSession.ts`
- `apps/server/test/enemy-lifecycle.test.ts`
- `docs/ENEMY_LIFECYCLE_RECOVERY_REPORT.md`

## Known issues

- O teste visual manual longo (10 mortes em cada área) ainda deve ser feito no navegador, mas a reconciliação do cliente e todo o ciclo lógico foram validados por snapshots e testes determinísticos.
