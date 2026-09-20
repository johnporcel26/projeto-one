# Auditoria e reconstrução de progressão

## Problemas encontrados

- O jogador guardava `level`, XP parcial e pontos de atributo como estados independentes; isso permitia inconsistência entre nível e XP.
- A curva anterior usava crescimento linear de 75, divergente da regra de balanceamento atual.
- HP atual estava misturado em `Stats`, e o level-up curava o personagem completamente.
- Ataque, HP e recompensas de Alvida/Buffalo eram hardcodes espalhados pelo loop do servidor.
- A HUD assumia `XP / 100` e exibiria valores incorretos depois do primeiro nível.

## Substituições realizadas

- `apps/server/src/progression.ts` é a única fonte de fórmulas: XP total, nível, XP da faixa atual, atributos, caps e configuração de balanceamento.
- O estado sincronizado agora contém `totalXp`, `xpIntoCurrentLevel`, `xpRequiredForNextLevel`, `stats` derivados e `resources` atuais.
- Pontos manuais e a fórmula anterior foram removidos.
- HP e Mana atuais são recursos separados; level-up acrescenta apenas a capacidade recém-conquistada, limitado ao novo máximo.
- `resolveCombat` concentra evasão, crítico, defesa e dano mínimo.
- `enemyDefinitions` é dono de HP, defesa, ataque, ouro e XP de cada inimigo. A morte exige `claimReward`, prevenindo XP duplicada.
- HUD compacto mostra HP, Mana e XP da faixa; Perfil mostra os atributos calculados e percentuais de crítico/evasão.

## Configuração atual — TODO: BALANCE

- Nível máximo: 100.
- XP para o próximo nível: `100 + 50 * (level - 1) + 25 * (level - 1)^2`.
- Base: Força 10, Defesa 5, Vida 100, Mana 50, Crítico 5%, Evasão 3%.
- Ganho por nível: +2 Força, +1,5 Defesa (arredondada para baixo), +12 Vida, +6 Mana, +0,20% Crítico, +0,15% Evasão.
- Caps: Crítico 40%, Evasão 35%.

## Verificação

`npm test` passou com 9 testes. Eles incluem curva, multi-level, cap, ganho de recursos, combate determinístico, recompensa única e recompensas de Alvida/Buffalo. `npm run build` passou para shared, server e client.
