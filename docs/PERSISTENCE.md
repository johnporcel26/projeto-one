# Persistência do Closed Alpha

## Banco e inicialização

O servidor usa SQLite em `data/alpha.sqlite`. O arquivo de runtime, seus arquivos WAL/SHM e `data/backups/` são ignorados pelo Git. Na inicialização, `AuthRepository` habilita `foreign_keys`, modo `WAL` e `busy_timeout=5000`, depois executa migrations versionadas em `schema_migrations`.

As migrations atuais preservam as tabelas já existentes de contas, players, sessões e compras, e adicionam tabelas normalizadas para `market_listings`, `market_offers` e `economy_ledger`.

## Fonte de verdade e carregamento

`data/content/content.json` continua sendo conteúdo do jogo; não é banco de jogadores. A autenticação fornece o `accountId`, que é a chave do save. Ao conectar, o servidor carrega o snapshot persistente, valida quantidades/referências e hidrata `PlayerDomain`. Dados inválidos não derrubam o servidor.

Persistem: XP total (portanto nível derivado), Berries, Rubis e fundos reservados por ofertas, inventário, depósito, locks, frutas possuídas/equipada, slots de utilidade, configuração do Bot, VIP, descoberta e anúncios/ofertas do Mercado. O ledger de economia também é gravado.

Não persistem: hunt e posição atual, alvo, Auto-Hunt ligado, HP/Mana atuais, cooldowns, buffs, tanque, projéteis, FX e Analyzer temporário. Depois de reiniciar/logar, o personagem nasce curado no Barco Pirata, com Auto-Hunt desligado.

## Save, autosave e desligamento

O servidor usa dirty tracking por sessão, sem gravar no loop de renderização ou a cada snapshot. Autosave ocorre a cada 30 segundos apenas para estado alterado. Operações críticas (fruta, depósito, locks, slots, Bot, VIP e Mercado) acionam persistência imediata. Em caso de queda abrupta, a perda esperada de progresso de farm fica limitada aproximadamente à janela de 30 segundos.

`SIGINT` e `SIGTERM` interrompem ticks, gravam o estado dirty, fecham conexões e fecham SQLite. Falhas de save são registradas e mantêm o estado dirty para nova tentativa.

Operações persistidas de Mercado gravam players afetados, escrow/listings/offers e entradas novas do ledger numa única transação SQLite. Assim um listing não volta à bolsa depois de restart e uma escrita parcial é revertida.

## Backup e restore

Com o servidor parado, execute:

```powershell
npm run backup
```

O backup é criado em `data/backups/`. Para restaurar, pare o servidor, guarde uma cópia do `data/alpha.sqlite` atual e substitua-o pelo arquivo de backup desejado. Depois inicie o servidor normalmente; migrations não apagam jogadores.
