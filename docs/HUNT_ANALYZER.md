# Hunt Analyzer

O Analyzer é uma sessão autoritativa no servidor e não concede XP, ouro, loot ou kills. Ele apenas observa os resultados já confirmados pelo combate e pelas recompensas.

- Uma sessão inicia ao entrar em Floresta da Alvida ou Praia do Buffalo.
- Trocar de hunt encerra a sessão anterior; retornar ao Barco também a encerra.
- Totais de kills, XP, ouro, loot, frutas, dano efetivo, dano recebido, crítico, evasão e mortes vêm de eventos reais do servidor.
- Duração e taxas por hora são derivados de timestamps, não de contadores de UI.
- `currentSession` e a última sessão permanecem no servidor durante a execução; o snapshot é enviado no estado do jogo.
- Reset cria uma sessão nova para a mesma hunt sem alterar personagem, mapa, XP, loot ou inventário.

## Modo de teste de frutas

Os drops de `fruit_sube_sube` e `fruit_guro_guro` estão temporariamente em **100%**. Ambos têm comentário de retorno para a taxa de produção de 1% em `packages/shared/src/index.ts`.
