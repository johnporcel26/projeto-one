# Content Admin Panel

O painel é uma ferramenta local de desenvolvimento. Inicie o servidor (`npm run dev -w @onepiece/server`) e o Admin (`npm run dev -w @onepiece/admin`), depois abra `http://localhost:5174`.

A API administrativa escuta apenas em `127.0.0.1:8788`. O browser usa a API; ele nunca grava arquivos diretamente.

## Conteúdo

O arquivo de conteúdo fica em `data/content/content.json`. Ele contém itens, frutas, catálogo de monstros e loot tables. A gravação usa arquivo temporário e rename atômico após validação.

Itens exigem ID único (`a-z`, números e `_`), valores não negativos e efeitos válidos. Frutas exigem exatamente quatro slots de skill. Uma loot table usa rolls independentes: suas chances não precisam somar 100%.

No Admin, abra **Itens** para criar, editar ou duplicar definições; **Consumíveis** mostra o mesmo catálogo filtrado; **Akuma no Mi**, **Loot Tables** e **Monstros** exibem o conteúdo migrado.

## Limitações desta primeira base

Upload binário PNG e CRUD visual de frutas/loot serão acrescentados junto da próxima etapa de sincronização de runtime. O servidor já valida o documento de conteúdo no boot e falha cedo quando encontrar referências inválidas.
