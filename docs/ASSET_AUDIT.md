# Auditoria de assets — 2026-09-18

Nenhum asset original foi alterado, movido, renomeado ou recomprimido. O cliente os referencia diretamente pelo diretório `assets` e quaisquer artefatos futuros devem ir para `generated/`.

## README.TXT encontrados e aplicados

| Arquivo | Informação registrada |
|---|---|
| `assets/Mapas/Floresta/arvores/readme.txt` | Árvores têm colisão e são compatíveis com o mapa. |
| `assets/Mapas/Lobby/readme.txt` | Lobby é retorno após morte; não usar água como chão; quatro frames do mar. |
| `assets/personagem/Subeskill/Bolhas/readme.txt` | Skill automática da Sube a cada 10 s. |
| `assets/personagem/Subeskill/Defense/readme.txt` | 45 s de cooldown, 5 s de duração; aplicar transparência uniforme. |
| `assets/personagem/Subeskill/Evasao/readme.txt` | 2 min de cooldown, 25 s de duração; filtro azul e rosa no personagem. |

## Inventário e integração

| Grupo / pasta | Tipo | Frames / direção | Dimensão | Alpha | Integração | Observação |
|---|---|---:|---:|---|---|---|
| `personagem/Player/{idle,walk,attack,death}` | Ted | 6 por estado | 1254×1254 | real, com semitransparência | Sim | Ordem 1→6 pelo nome. Frente continua a usar o conjunto raiz. |
| `personagem/Player/idle/Costa` | Ted idle costas | 5 | 1254×1254 | real, com semitransparência | Pré-carregado | Ordem 1→5; mantido pronto para uma futura regra de idle direcional. A regra atual pede Idle frontal quando parado. |
| `personagem/Player/idle/Lado` | Ted idle lateral | 5 | 1254×1254 | real, com semitransparência | Pré-carregado | Ordem 1→5; mantido pronto para uma futura regra de idle direcional. A regra atual pede Idle frontal quando parado. |
| `Monsters/Alvida/Idle/{Frente,Costa,Lado}` | Alvida | 4 por direção | 1254×1254 | real, com semitransparência | Sim (idle) | `Lado` pode ser espelhado para esquerda. |
| `Monsters/Alvida/Walking/{Frente,Costa,Lado}` | Alvida | 4 por direção | 1254×1254 | real, com semitransparência | Pré-carregado | Preparado para IA de chase. |
| `Monsters/Alvida/Attack` | Alvida | 3 | 1254×1254 | real, com semitransparência | Sim | Sem README/direção; aplica flip somente na lateral esquerda. |
| `personagem/Subeskill/Bolhas` | FX Sube | 5 | 1254×1254 | real, com semitransparência | Manifesto pronto | Ordem 1→5, frequência conforme README. |
| `personagem/Subeskill/Defense` | FX Sube | 2 | 1254×1254 | real, com semitransparência | Manifesto pronto | README menciona transparência a ser aplicada em runtime. |
| `personagem/Subeskill/Evasao` | FX Sube | 0 PNG | — | — | Pendente | **WARNING:** README existe, mas não há arte correspondente. |
| `Mapas/Floresta/Solo` | fundo | 1 | 1254×1254 | não, RGB opaco | Sim | Usado como solo tileado; não contém colisores. |
| `Mapas/Floresta/arvores` | prop | 4 | 1254×1254 | real | Sim (visual) | Colisor de tronco e tuning de escala pendentes. |
| `Mapas/Lobby/1..4` | barco/água | 4 | 1448×1086 | não, RGB opaco | Manifesto pronto | Sequência 1→4; Scene pendente. |
| `Akumanomi/{Sube,Mogu,Hito}` | ícone | 1 cada | 1254×1254 | real | Dados/UI | Sube usa UUID de arquivo; Mogu/Hito usam `1.png`. |
| `Itens/{Sabonete,Cascalho,Lençovermelho,Anel de Ouro,Poção Menor,Poção Maior,balcao}` | item/prop | 1 cada | 1254×1254 | real | Balcão integrado no barco; demais IDs/loot configurados | Balcão médico é um prop da safe zone, não loot. |

## Transparência

A inspeção programática confirmou `Format32bppArgb` para todos os sprites, props, itens, frutas e FX, e `Format24bppRgb` para solo e Lobby. Amostragem de Ted e Alvida confirmou pixels transparentes e semitransparentes; solo e Lobby não possuem alpha. Não foi realizada remoção automática de fundo. Não há fundo sólido suspeito nos PNGs ARGB amostrados; pequenas áreas pretas opacas pertencem ao traço/sombra da arte, não foram alteradas.

## Avisos

- A inspeção não encontrou `Miss Merry Christmas` como asset separado; não criar arte substituta.
- Nenhum README define FPS. O cliente usa cadência visual temporária (Ted 135 ms, Alvida 180 ms): **TODO: DESIGN DECISION**.
- Os PNGs de 1254×1254 têm grande espaço de composição. A escala de runtime é configurável e precisa de ajuste visual final antes de gerar spritesheets.
- FPS não foi definido pelos README. O manifest visual usa 6 FPS idle, 9 FPS walk, 10 FPS attack de Ted e 8,3 FPS attack de Alvida: **TODO: ANIMATION BALANCE**. **WARNING:** walk/attack de costas e lateral de Ted ainda não foram encontrados; esses estados continuam usando o único conjunto raiz disponível.
