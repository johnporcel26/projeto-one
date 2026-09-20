# Arquitetura

O projeto é um monorepo npm com contratos em `packages/shared`. O cliente é uma camada de apresentação: React mantém HUD/inventário e Phaser desenha mundo, câmera e entrada. Nenhum cálculo de combate, drop ou saldo é feito pelo cliente.

O servidor Node recebe somente `ClientIntent`: `move`, `attack`, `toggleAutoHunt`, `equipFruit` e `requestRespawn`. Ele mantém `PlayerDomain`, `EnemyDomain` e `Inventory`, aplica cooldowns, valida estado vivo e transmite `GameSnapshot`. PostgreSQL é o próximo adaptador de persistência; o domínio não depende dele.

## Dados e extensão

IDs estáveis (`enemy_alvida`, `fruit_sube_sube`, `item_soap`) são a interface entre dados e sistemas. Definições de frutas e loot estão atualmente em módulos tipados no servidor e devem migrar sem mudança de contrato para `data/` ou PostgreSQL. Uma fruta ativa é representada por `activeFruitId`, nunca por campos de habilidades no jogador.

## Eventos futuros

O WebSocket já é a fronteira de eventos. Na próxima iteração, introduzir um `EventBus` no servidor para publicar `ENEMY_KILLED`, `ITEM_COLLECTED`, `XP_GAINED`, `FRUIT_EQUIPPED`, `PLAYER_DIED`, `HUNT_STARTED` e `HUNT_STOPPED`; Analyzer e persistência deverão assinar esses eventos sem acoplar-se às entidades.
