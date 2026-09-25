# Teste multiplayer em rede local (LAN)

Este procedimento expõe somente o Cliente (`5173`) e o servidor autoritativo (`8787`) na rede privada. Ele não publica o jogo na internet, não abre portas do roteador e não altera o Firewall automaticamente.

## No computador host

1. Conecte os dois computadores à mesma rede local/Wi-Fi.
2. Na raiz do projeto, dê duplo clique em `START_PROJECT_ONE_LAN.bat` (ou execute `npm run dev:lan`).
3. Copie um dos endereços `http://<IP>:5173` mostrados no terminal.
4. Se o Windows pedir autorização para o Node.js, permita **somente Redes privadas**. Não habilite Redes públicas.

O host continua podendo jogar em `http://localhost:5173`.

## No segundo computador

1. Abra no navegador o endereço mostrado pelo host: `http://<IP_DO_HOST>:5173`.
2. Crie uma nova conta de teste; não reutilize a conta principal do host.
3. Faça login. O navegador resolve automaticamente API e WebSocket para o mesmo IP, na porta `8787`.

## Limites de exposição

- Cliente LAN: `http://<IP_DO_HOST>:5173`
- Servidor LAN: `ws://<IP_DO_HOST>:8787`
- Content Admin: `http://127.0.0.1:5174` (**somente host**)
- API do Content Admin: `http://127.0.0.1:8788` (**somente host**)

O SQLite permanece no servidor e não é servido por HTTP.

O launcher registra stdout, stderr e o código de saída de `SERVER`, `CLIENT` e `ADMIN` em `logs/project-one-lan.log`. Se um processo falhar, os outros continuam observáveis para que a causa não fique escondida por um encerramento em cascata.

## Solução de problemas

### O site não abre

- Confirme que ambos os computadores estão na mesma rede.
- Use exatamente um IP mostrado pelo launcher; se houver mais de um, teste o próximo candidato.
- Confirme que o host mantém `npm run dev:lan` em execução.
- Verifique se o Firewall permitiu Node.js em redes privadas. Não crie regra pública.
- Opcionalmente, teste `ping <IP_DO_HOST>` para confirmar conectividade básica.

### Login aparece, mas não conecta

- Confirme que a porta `8787` aparece no terminal do servidor.
- Abra o site pelo IP do host, não por `localhost`, no segundo computador.
- Revise a permissão privada do Node.js/portas `5173` e `8787` no Firewall.
- Não use port forwarding, DMZ ou UPnP: este teste é exclusivamente LAN.

## Overrides de desenvolvimento

Quando necessário para proxy ou ambiente especial, `VITE_SERVER_URL` e `VITE_WS_URL` têm prioridade. Sem override, o client usa `window.location.hostname`, portanto `http://192.168.x.x:5173` conecta automaticamente em `ws://192.168.x.x:8787`.
