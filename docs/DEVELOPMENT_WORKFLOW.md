# Fluxo de desenvolvimento

- `main`: versão estável e validada.
- `dev`: branch de integração do trabalho diário.
- `nome/feature`: branches curtas para funcionalidades específicas, por exemplo `john/content-admin` ou `socio/new-map`.

## Nova funcionalidade

```bash
git switch dev
git pull origin dev
git switch -c nome/feature
# desenvolver e validar
git add .
git commit -m "Descrição da mudança"
git push -u origin nome/feature
```

Abra um Pull Request de `nome/feature` para `dev`. Após revisão e validação, promova `dev` para `main` por Pull Request. Não use force push nas branches compartilhadas.
