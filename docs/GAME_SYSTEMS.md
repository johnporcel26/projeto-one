# Sistemas do vertical slice

## Combate e spawn

`resolveDamage` concentra a fórmula inicial `max(1, attack - defense)`. Alvida só recebe dano se viva, e só produz loot uma vez. A zona de spawn está configurada no servidor com três Alvidas e seis pontos possíveis; após três segundos da morte, o servidor remove a entidade morta e cria uma nova em um ponto aleatório que não esteja ocupado. Essa configuração deve migrar para `data/maps/forest_alvida` ao introduzir Tiled JSON.

## Frutas e skills

Há três `FruitDefinition` data-driven: Sube, Mogu e Hito. Cada uma contém exatamente quatro slots de habilidade. Equipar outra fruta substitui a ativa e, consequentemente, o conjunto que a skill bar apresenta. Sube mapeia seus efeitos existentes: Bolhas (10 s, conforme README), Defesa (45 s/5 s) e Evasão (120 s/25 s, filtro pendente).

## Auto-Hunt e Analyzer

O controlador percorre `OFF`, `SEARCHING`, `MOVING_TO_TARGET` e `ATTACKING`. Ele procura inimigo vivo, move até o alcance e pede ataque ao mesmo servidor autoritativo. O HUD exibe dados de sessão iniciais; um Analyzer persistente deve registrar eventos quando o EventBus for introduzido.

## Morte e barco

Alvida aplica dano autoritativo quando Ted entra em alcance. Com HP zero, Ted entra em `DEAD`, controles e Auto-Hunt são bloqueados e o servidor envia o retorno ao `pirate_ship` após 1,8 s com HP recuperado. A Scene troca para os frames do Lobby; o frame de água é selecionado durante a atualização visual. A colisão de água ainda precisa ser refinada com a máscara/mapa navegável do deck.
