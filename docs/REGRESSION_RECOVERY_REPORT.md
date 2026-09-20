# Regression Debugging and Recovery Report

Data: 19/09/2026

## Root cause

Durante a migração de estado global para `GameSession`, a transição de morte continuou marcando o jogador como `DEAD`, porém o antigo agendamento de `respawnToShip` não foi migrado. Em `GameSession.tick()`, `currentHp <= 0` fazia o método retornar em todos os ticks seguintes. Isso deixava Ted permanentemente morto na Hunt.

Não há repositório Git disponível neste diretório; portanto `git status`, `git diff` e histórico não puderam ser consultados. A causa foi confirmada por leitura do fluxo atual e reprodução determinística.

## Fluxo antes da correção

`enemy hit → HP 0 → state DEAD → autoHunt OFF → tick retorna por HP 0 → tick retorna por HP 0 ...`

Não havia transição posterior para o barco.

## Fluxo depois da correção

`enemy hit → handlePlayerDeath (uma vez) → DEAD → respawnAt único → pirate_ship → healFull → IDLE → Auto-Hunt OFF`

- `handlePlayerDeath` é idempotente por `deathHandled`.
- Enquanto morto, intents ofensivas, movimento, skills, Auto-Hunt e ticks de Rodopio são bloqueados.
- Ações pendentes do player são canceladas centralmente por `PlayerDomain.cancelPendingActions()`.
- `requestRespawn` é idempotente: somente funciona durante um ciclo `DEAD` válido.
- Enemy AI não ataca o jogador morto porque o tick de sessão retorna antes da IA e `EnemyDomain.tick` também rejeita HP zero.
- O Hunt Analyzer registra uma morte uma única vez e é finalizado uma única vez no respawn.

## Timers e estados

Não foi adicionado `setTimeout`. O respawn usa apenas `respawnAt`, processado uma vez pelo tick da própria sessão. Isso evita timer órfão em sessão destruída e rotinas duplicadas. Rodopio, buffs temporários e Auto-Hunt são cancelados na transição de morte.

## Testes de regressão adicionados

- Morte única e 100+ ticks posteriores sem incremento adicional.
- Auto-Hunt desligado e HP limitado a zero.
- `requestRespawn` chamado duas vezes.
- Respawn para Barco com HP/Mana máximos e estado `IDLE`.
- Segundo ciclo completo de morte/respawn.
- Morte de uma sessão não altera outra sessão.

## Resultados

| Validação | Resultado |
| --- | --- |
| `npm run build -w @onepiece/shared` | passou |
| `npm run build -w @onepiece/server` | passou |
| `npm test -w @onepiece/server` | 21 passaram, 0 falharam |
| `npm run build -w @onepiece/client` | passou |
| WebSocket | servidor reiniciado e escutando em `8787` |

## Arquivos modificados

- `apps/server/src/domain.ts`
- `apps/server/src/GameSession.ts`
- `apps/server/test/death-regression.test.ts`
- `docs/REGRESSION_RECOVERY_REPORT.md`

## Known issues

- Não há Git neste diretório para identificar um commit causador.
- O teste manual visual completo de morte na Floresta e Praia continua recomendado no navegador em `http://localhost:5173`; a correção foi coberta por teste determinístico de domínio/sessão e builds.
