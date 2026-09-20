# EXECUTIVE SUMMARY

> Auditoria inicial e atualização pós-sprint em 19/09/2026. Este documento descreve o código e os arquivos presentes nesta revisão; não é uma especificação de intenção futura.

## Atualização — sprint de estabilização

A base passou a ter definitions públicas compartilhadas para itens, frutas, skills e loja; loot com RNG server-side em basis points; colisões por mapa; e sessões isoladas por conexão (`GameSession`/`SessionManager`). O modo de drop garantido foi removido e as duas frutas de drop estão em 1%. Auto-Hunt não conhece mais Skills Sube e, por padrão, usa somente ataque básico. A cobertura passou de 13 para 18 testes, todos aprovados. O JSON duplicado do Velho Bêbado foi removido após migração de seus metadados à definition TypeScript. Consulte `docs/STABILIZATION_REPORT.md` para o detalhamento e limitações restantes.

O projeto é um protótipo browser-first de MMORPG 2D top-down com tema pirata. O cliente React/Phaser conversa por WebSocket com um processo Node que mantém **um único estado global em memória**. O loop jogável existente é: Ted nasce no barco, entra em uma hunt, luta contra Alvida ou Buffalo, recebe XP/ouro/loot e pode voltar ao barco. Há HUD, inventário, venda, loja, frutas e Auto-Hunt, porém ainda não há banco de dados, conta, múltiplos jogadores reais, persistência ou autenticação.

Pontos sólidos: contratos compartilhados, progressão centralizada, testes unitários de domínio/analisador, servidor como árbitro de recompensas e snapshots. Pontos parciais: HUD concentra muita lógica, skill data está também no cliente, o Auto-Hunt é específico à Sube, itens não possuem definição rica e várias telas são placeholders. Riscos maiores: estado global não persistente, servidor monolítico, paths/arte servidos diretamente de `assets`, e algumas mecânicas recentes ainda sem testes específicos.

## Matriz de sistemas

| Sistema | Status | Server auth | Persistência | Testes | Arquivo principal |
|---|---|---:|---:|---:|---|
| Conexão/WebSocket | Working | Sim | Não | indireto | `apps/client/src/network/GameSocket.ts` |
| Movimento cardinal | Working | Sim | Memória | parcial | `apps/server/src/domain.ts` |
| Combate básico | Working | Sim | Memória | sim | `apps/server/src/index.ts` |
| Progressão | Working | Sim | Memória | sim | `apps/server/src/progression.ts` |
| Loot/inventário | Working | Sim | Memória | parcial | `domain.ts`, shared |
| Sube Sube | Working | Sim | Memória | parcial | `domain.ts`, `index.ts` |
| Guro Guro | Partial | Sim | Memória | não específico | `domain.ts`, `index.ts`, HUD |
| Auto-Hunt | Partial | Sim | Memória | não específico | `apps/server/src/index.ts` |
| Hunt Analyzer | Working/partial | Sim (observador) | Memória | sim | `hunt-analyzer.ts` |
| NPC curador | Working | Sim | Memória | parcial | `domain.ts` |
| Loja/venda | Partial | Sim | Memória | não | HUD, `index.ts` |
| Chat/contas/banco | Not implemented | — | — | — | — |

## Estrutura e stack

```
apps/
  client/                 React 18 + Phaser 3 + Vite 6
  server/                 Node + TypeScript + ws
packages/shared/          contratos, IDs, dados de hunts/loot
assets/                   diretório público Vite de arte do jogo
data/npcs/                metadado JSON do Velho Bêbado
docs/                     documentação histórica e auditorias
scripts/                  validação de assets Buffalo/Velho Bêbado
katsuo/                   15 PNGs fonte; 11–13 usados como explosão Guro
```

Dependências diretas relevantes: React `18.3.1`, React DOM `18.3.1`, Phaser `3.87.0`, Vite `6.0.1`, `ws`, `tsx`, TypeScript `5.7.2`, Lucide React e concurrently. O workspace declara `apps/*` e `packages/*`. `vite.config.ts` usa `../../assets` como `publicDir`; portanto URLs `/...` são arquivos de `assets/`. Não há PostgreSQL, ORM, migrations, schema de banco ou camada de persistência.

Foram encontrados 273 arquivos de projeto fora de `node_modules` e `dist`; o último deve ser entendido como artefato de build, não fonte. Há 211 arquivos sob `assets/` nesta auditoria.

## Arquitetura cliente/servidor e protocolo

`main.tsx` monta `GameCanvas`, `GameUiProvider`, HUD e `GameSocket`. `GameSocket` abre `ws://localhost:8787`, reconecta a cada segundo e encaminha snapshots ao `GameBridge`/store. O servidor (`apps/server/src/index.ts`) cria `WebSocketServer({port:8787})`, mantém `player`, `enemies`, `area`, NPC e analisador em variáveis de módulo e transmite snapshots a todos os sockets.

**Client → server (`ClientIntent`, `packages/shared/src/index.ts`):** `move {x,y}`, `attack`, `useSkill {skillId}`, `toggleAutoHunt`, `enterHunt {huntId}`, `interactWithNpc {npcId}`, `requestRespawn`, `buyItem {itemId}`, `sellItems {itemIds}`, `equipFruit {fruitId}`, `unequipFruit`, `resetHuntAnalyzer`.

**Server → client (`ServerEvent`):** `snapshot {payload: GameSnapshot}` e `log {message}`. Snapshot contém área, `PlayerSnapshot`, inimigos, NPCs, Hunt Analyzer e feedback visual de combate. Não existe EventBus central: há callbacks `bridge.onSnapshot`, `window` CustomEvents `game-intent`/`sube-fx` e React Context local. O cliente controla apresentação, teclado, HUD e renderização; o servidor calcula movimento, alvo, dano, rewards, XP, gold, cooldowns e cura.

## Player Ted, movimento e animação

`PlayerDomain` possui ID `player_ted`, nome Ted, posição inicial `(620,600)`, `direction`, estados `IDLE/WALK/ATTACK/DEAD`, nível, XP total, gold, inventário, fruta ativa e Auto-Hunt. Stats iniciais: força 10, defesa 5, HP 100, mana 50, crítico 500 bps e evasão 300 bps. O servidor configura movimento 190, range 95 e cooldown básico 850 ms. WASD/setas são lidos em Phaser; o cliente envia apenas direção cardinal a cada 80 ms. Diagonal é descartada no servidor. Bounds são x=100–1500/y=100–1000; árvores circulares de raio 75 bloqueiam a floresta. A câmera segue Ted com zoom 1.15.

`DirectionalAnimation.ts` seleciona frames por estado/direção. Ted: `assets/personagem/Player/idle/1..6.png` (frente), idle `Costa/1..5`, idle `Lado/1..5`, `walk/1..6`, `attack/1..6`, `death/1..6`. A seleção lateral usa flipX; ataque/morte vêm das sprites sem variantes direcionais completas. O sprite é desenhado em 112×112, origem inferior central. Não há hitbox física Phaser; a distância numérica de domínio define alcance.

## Progressão, atributos, recursos e combate

Fonte de verdade: `apps/server/src/progression.ts`. Máximo nível 100. XP para sair do nível `L`: `100 + 50*(L-1) + 25*(L-1)^2`; `totalXp` é acumulado e suporta múltiplos níveis. Crescimento por nível: força +2, defesa +1.5 (floor), HP +12, mana +6, crítico +20 bps, evasão +15 bps; caps normalizados: crítico 4000 bps e evasão 3500 bps. Ao subir, somente a capacidade adicional de HP/mana é acrescentada ao valor atual.

`resolveCombat` primeiro testa evasão, depois crítico; dano = `max(1, floor(attack * (crit?1.5:1)) - floor(defense))`. Mana existe em snapshot/HUD mas **nenhuma habilidade consome mana**. Ataques e morte são controlados no servidor. Feedback exibe barras de HP inimigas, dano, crítico, esquiva e status.

## Frutas e skills

Regra efetiva: conjunto `ownedFruits`, uma `activeFruitId`; equipar exige posse no servidor. Desequipar só limpa a fruta ativa; cooldown map não é limpo explicitamente. Frutas: Sube (`rare`, Alvida), Guro (`epic`, Buffalo), Mogu (`rare`) e Hito (`epic`). Assets: `assets/Akumanomi/{Sube, Guro, Mogu, Hito}`. Mogu/Hito são placeholders bloqueados.

| Fruta/skill | Estado real | Cooldown | Efeito atual |
|---|---|---:|---|
| Sube `sube_bubbles` | Working | 10 s | 3 hits fixos: `10 + ceil(3% do attackPower do alvo)`; FX Bolhas 1–5 |
| Sube `sube_defense` | Working | 45 s | defesa adicional `ceil(maxHp*0.10)` por 5 s; FX shield |
| Sube `sube_evasion` | Working | 120 s | +2500 bps / 25% por 4 s; tint visual |
| Guro `guro_blast` | Working recente | 8 s | `24 + força`, dano fixo, explosão PNG |
| Guro `guro_spin` | Partial | 16 s | gira Ted 4 s; 4 ticks de 14; sem teste dedicado |
| Guro `guro_crush` | Partial | 25 s | `40 + força*2`; texto “ATORDOADO”, mas nenhum estado de stun é aplicado ao inimigo |
| quarto slot de cada | Placeholder | — | bloqueado |

Guro usa `assets/effects/guro/explosion_01..03.png`, organizados a partir de `katsuo/11..13.png`; `WorldScene` faz o preload e mostra a explosão quando recebe feedback. O Auto-Hunt atual chama especificamente skills Sube (`sube_defense`, `sube_evasion`, `sube_bubbles`); Guro não está integrado ao planejador automático.

## Hunts, áreas, NPCs e inimigos

Áreas: `pirate_ship`, `forest_alvida`, `beach_buffalo`. Entrar em hunt teleporta Ted a `(620,600)`, recria três inimigos e liga Auto-Hunt em `SEARCHING`. O barco é safe zone/respawn: posição `(720,520)`, cura completa e Auto-Hunt OFF. `WorldScene` alterna 4 frames `Mapas/Lobby`; o balcão é apresentado como prop. Não há colisão de água/rochas específica: somente bounds e árvores são usados por `blocked()` mesmo na praia.

| Hunt/inimigo | Dados reais |
|---|---|
| Floresta da Alvida / `enemy_alvida` | recomendada 1–10, HP 65, defesa 5, ataque 11, XP 25, gold 8; aggro 220, range 68, velocidade 96, ataque 1800 ms |
| Praia do Buffalo / `enemy_buffalo` | recomendada 5–15, HP 150, defesa 8, ataque 18, XP 42, gold 16; aggro 250, range 78, velocidade 72, ataque 2300 ms |

IA: `IDLE`, `CHASE`, `ATTACK`, `DEAD`; retorna ao spawn se o jogador morre, sai do aggro ou excede leash (480/500). Respawn remove a entidade e cria outra após 3 s em pontos fixos. Alvida: idle/frente/costa/lado 4 frames; walking 4 por direção; ataque 3. Buffalo: idle 4×3 direções, walk 5×3, ataque down 6, `special_spin` 8 existe como asset/preview mas não é usado pelo inimigo.

Velho Bêbado: ID `npc_old_drunk_healer`, `(575,505)`, range 170, cooldown 1000 ms. Estados IDLE/DRINK/SWAY/INTERACT/HEAL; o domínio escolhe drink 20%, sway 10%, idle restante após 6–15 s. Cura HP e mana ao máximo; valida alcance/vida/cooldown. `data/npcs/old_drunk_healer.json` contém fps, falas e hooks de áudio, mas o domínio usa constantes próprias: JSON/falas/hooks não são carregados em runtime. Assets seated estão integrados; há versões não seated e FX disponíveis sem integração explícita.

## Loot, inventário, loja e economia

Loot source: `alvidaLootTable`/`buffaloLootTable` no shared, mas `EnemyDomain.loot()` está em **modo teste**: todo item configurado e a fruta com chance >=100 é concedido uma vez por morte. Alvida: cascalho 50, sabonete 24, poção menor 15, lenço 7, anel 3, poção maior 1, Sube 100%. Buffalo: cascalho 65, poção menor 35, Guro 100%. Esses pesos são exibidos mas não são RNG no estado atual.

`Inventory` é `Map<ItemId, quantidade>`; stacks positivos, sem limite/categorias server-side. Fruta também entra na bolsa e no conjunto de posse. `claimReward()` e flag `dropped` evitam reward/loot repetido por inimigo morto. Lock visual, seleção e menu de contexto são estados React locais: não persistem, não são enviados ao servidor e não protegem `sellItems` no servidor. Frutas são ignoradas pelo endpoint de venda.

Loja vende poção menor por 50 e maior por 110, descontando gold server-side. Venda calcula metade de `prices` (ou 8 como fallback), enquanto Hunt Analyzer usa valores diferentes: gravel 4, pequena 25, grande 55, soap 4, scarf 18, ring 30. Poções não têm intent de uso/cura implementado; são apenas loot/loja/venda/HUD.

## HUD e conteúdo client-side

`Hud.tsx` concentra PlayerStatus, navegação, minimapa, resumo, log/chat, SkillBar, modal, HuntPanel, InventoryPanel, ShopPanel e painéis placeholder. Posições: perfil topo-esquerda, nav topo-centro, minimapa/resumo direita, log inferior-esquerda, skills inferior-centro. Há exatamente quatro slots; hotkeys 1–4, tooltip e contador derivado de timestamps server-side. HUD Guro usa um `Object.assign` após a definição estática de skill data: funcional, mas é uma duplicação/fragilidade.

Nav: Catálogo, Bolsa, Hunts, Bot, Análise, Mundo, Busca, Ajustes, Perfil são painéis; Depósito, Diário, Passe, Wiki, Loja e Mercado aparecem como “em desenvolvimento” (a loja possui componente, mas nav está marcada `soon`). Minimap é uma projeção proporcional simples das coordenadas e inimigos, não mapa navegável. Chat é placeholder; GameLog armazena 30 linhas localmente. Tema principal: `pirate-hud.css`, `pirate-theme.css`, `styles.css`; não há sistema de design/tokens formal além de classes e cores hardcoded.

## Assets e documentação existente

Categorias identificadas: Ted (29 PNGs), Alvida (27), Buffalo (43 incluindo base/manifest/spin), Velho Bêbado (aprox. 53 mais variantes), mapas Lobby/Floresta/Praia, 4 frutas, 6 itens, FX Sube 7, heal 5 e Guro 3. `assets/personagem/Subeskill/Evasao/readme.txt` existe, mas não há PNG de evasão; evasão reutiliza shield/tint. Suspeitos/unused: `katsuo/1..10,14,15` fora do pipeline, Buffalo special spin, versões não-seated do NPC, data JSON não carregado e `BuffaloPreviewScene` só é acessível por query `?buffalo-preview`.

Documentos relevantes: `README.md` (majoritariamente atual, mas não menciona Guro/praia); `docs/ARCHITECTURE.md`, `GAME_SYSTEMS.md`, `PROJECT_STATUS_REPORT.md`, `PROGRESSION_AUDIT.md`, `HUNT_ANALYZER.md`, `ASSET_AUDIT.md`, `BUFFALO_ASSET_REPORT.md`, `NPC_OLD_DRUNK_ASSET_REPORT.md`, `NEXT_STEPS.md`. São históricos e podem estar desatualizados após mudanças recentes; este relatório prevalece como fotografia. Readmes de assets descrevem arquivos, não lógica runtime.

## Authority, persistência e segurança

Movimento, dano, inimigos, XP, nível, gold, loot, inventário, equipar fruta, cooldown, compra, venda e cura são server-authoritative no processo atual. HUD, escala, logs, filtro de itens, seleção/lock e renderização são client-side. A validação é básica: o servidor não autentica, não identifica jogador por socket, não limita mensagens, não valida schema, e compartilha o mesmo `PlayerDomain` para todos os clientes. Toda persistência é memória do processo; reiniciar servidor perde posição, nível, XP, gold, inventário, frutas, hunt e analyzer. Não há banco.

## Testes e builds

Suites: `apps/server/test/domain.test.ts` (10: progressão, combate, domínio, NPC, Sube) e `hunt-analyzer.test.ts` (3). Resultado auditado: **13 passed, 0 failed**. Builds executados: shared `tsc`, server `tsc`, client `tsc -b && vite build`, todos concluídos. Aviso do cliente: bundle JS ~1.683 MB/403 KB gzip excede aviso padrão de 500 KB; não foi tratado como erro.

## Código morto, duplicações e dívida

* `Hud.tsx` tem responsabilidades excessivas e dados de skills/frutas/itens duplicados em relação a shared/domain.
* `fruits` em `domain.ts`, `FruitDefinition` shared e `skillData` HUD são fontes paralelas.
* Pesos de loot shared não correspondem ao modo de concessão 100% em `EnemyDomain.loot()`.
* Preços de loja e `itemSellValues` são tabelas diferentes.
* `data/npcs/old_drunk_healer.json` e `oldDrunkHealerConfig` duplicam configuração.
* `triggerAutomaticBubbles()` permanece no domínio, porém o loop usa `castSubeBubbles()` diretamente.
* `BuffaloPreviewScene`, spins Buffalo e alguns assets NPC não fazem parte do loop principal.

## Top current technical problems

| Severidade | Evidência |
|---|---|
| CRITICAL | Estado global único e sem persistência: qualquer reinício apaga tudo; todos sockets compartilham Ted (`apps/server/src/index.ts`). |
| CRITICAL | Servidor aceita JSON sem schema/autenticação e não associa player a conexão. |
| HIGH | Auto-Hunt codificado para Sube; Guro não é usada automaticamente. |
| HIGH | `guro_crush` anuncia atordoamento sem aplicar estado/efeito de IA. |
| HIGH | Modo teste concede todos drops/100%, incompatível com RNG exibido. |
| MEDIUM | HUD e server index são monolíticos/compactados; difícil auditar e evoluir. |
| MEDIUM | Locks/seleção do inventário client-only; poções sem uso. |
| MEDIUM | Colisão da praia não representa água/pedras. |
| LOW | Bundle Vite acima do warning; documentação histórica divergente. |

## Natural next implementation areas

Persistência e identidade de jogador; modelo data-driven unificado de items/frutas/skills; Auto-Hunt genérico; hitbox/status reais; consumo de poções/mana; mapas e colisões próprios; validação de protocolo; decomposição de HUD/servidor; analyzer por skill; e atualização de documentação histórica.

## TOP 20 FILES TO UNDERSTAND THE PROJECT

1. `packages/shared/src/index.ts` — contratos, IDs, hunts e loot.
2. `apps/server/src/index.ts` — WebSocket, loop, combate, áreas, Auto-Hunt.
3. `apps/server/src/domain.ts` — Player, Enemy, NPC, Inventory e skills.
4. `apps/server/src/progression.ts` — XP/nível/stats/fórmulas.
5. `apps/server/src/hunt-analyzer.ts` — métricas de hunt.
6. `apps/client/src/game/WorldScene.ts` — Phaser, entidades, FX, câmera.
7. `apps/client/src/components/hud/Hud.tsx` — UI inteira e skill presentation.
8. `apps/client/src/network/GameSocket.ts` — protocolo cliente.
9. `apps/client/src/game/DirectionalAnimation.ts` — chaves/frame selection.
10. `apps/client/src/assets/AssetManifest.ts` — paths de assets.
11. `apps/client/src/ui/GameUiStore.tsx` — estado React local.
12. `apps/client/src/theme/pirate-hud.css` — HUD/escala/layout.
13. `apps/client/src/game/GameCanvas.tsx` — bootstrap Phaser/preview.
14. `apps/client/src/game/GameBridge.ts` — ponte Phaser/snapshot.
15. `apps/client/src/game/BuffaloPreviewScene.ts` — visualização Buffalo isolada.
16. `apps/server/test/domain.test.ts` — invariantes testadas.
17. `apps/server/test/hunt-analyzer.test.ts` — analyzer testado.
18. `apps/client/vite.config.ts` — assets públicos.
19. `data/npcs/old_drunk_healer.json` — metadado NPC não carregado.
20. `README.md` — execução local básica.

## Limites/UNKNOWN

Não há Git nesta pasta de trabalho disponível para status/branch. Não foi realizado pentest, teste de carga, análise pixel-a-pixel de alpha de todos PNGs ou sessão manual exaustiva de cada skill; por isso transparência de todos assets e estabilidade end-to-end prolongada permanecem **UNKNOWN**. Não foram feitas mudanças no jogo nesta auditoria além deste arquivo de relatório.
