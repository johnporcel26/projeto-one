# Guia de mapas no Tiled

Os fundos existentes continuam sendo renderizados pelo cliente. A geometria jogável é definida somente nos JSONs em `assets/maps/data/`, carregados e validados uma vez na inicialização do servidor.

## Arquivos atuais

- `pirate_ship.json`
- `forest_alvida.json`
- `beach_buffalo.json`

Cada arquivo é um JSON compatível com o Tiled, usando `objectgroup`. Não adicione Phaser, imagens ou lógica de combate a esses arquivos.

## Camadas aceitas

| Camada | Uso |
| --- | --- |
| `COLLISION` | Inclua um objeto com `type` ou `name` igual a `WALKABLE`; os demais objetos bloqueiam. |
| `WATER` | Área não caminhável. |
| `PLAYER_SPAWN` | Um único ponto obrigatório. |
| `ENEMY_SPAWN` | Pontos usados para criação e respawn do inimigo da hunt. |
| `NPC` | Pontos de NPC, sem criar NPC novo automaticamente. |
| `PORTAL` | Metadados de transição futura. |
| `SAFE_ZONE` | Metadados de área segura. |
| `DECORATION` | Metadados sem colisão. |

## Formas

O servidor entende retângulos, elipses/círculos e polígonos. As coordenadas são do mundo atual, em pixels. A colisão usa um pequeno collider nos pés, portanto mantenha uma margem entre spawns e obstáculos. `WALKABLE` limita onde se pode andar; água, colisões e o exterior dessa área bloqueiam o movimento.

## Fluxo seguro para editar

1. Abra o JSON no Tiled e edite apenas object layers.
2. Mantenha nomes de camada exatamente como acima.
3. Garanta que `PLAYER_SPAWN` e cada `ENEMY_SPAWN` estejam em área caminhável.
4. Execute `npm test -w @onepiece/server` e `npm run build -w @onepiece/server`.

## Depuração visual

No navegador em desenvolvimento, rode `localStorage.setItem('SHOW_COLLISIONS', 'true')` e recarregue. O cliente mostra os objetos de colisão/spawn; esse overlay não participa da autoridade de movimento. Para desligar, use `localStorage.removeItem('SHOW_COLLISIONS')`.
