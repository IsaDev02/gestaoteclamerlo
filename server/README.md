# Servidor Local WhatsApp — whatsapp-web.js

Servidor Express local que expõe uma API compatível com o formato da Evolution API, permitindo que o sistema de gestão (`enviar_mensagens.html`) envie mensagens via WhatsApp Web de forma automatizada.

> **Aviso:** solução não-oficial que automatiza o WhatsApp Web. Use com responsabilidade e dentro dos termos de uso do WhatsApp.

---

## 1. Pré-requisitos

- **Node.js 18+** e **npm**
- **Google Chrome** ou **Chromium** instalado no computador (ou deixe o Puppeteer baixar automaticamente na primeira execução)
- **Cloudflared** instalado (necessário apenas para expor o servidor publicamente via Cloudflare Tunnel)

---

## 2. Instalação

```bash
cd server
cp .env.example .env
# Edite o .env com sua API_KEY e INSTANCE_NAME
npm install
npm start
```

O servidor iniciará na porta `3333` (ou conforme definido em `PORT` no `.env`).

---

## 3. Como conectar o WhatsApp

1. Após iniciar o servidor, acesse o sistema no navegador (`enviar_mensagens.html`)
2. Clique no botão **"Conectar WhatsApp"** na página de Transmissão
3. Um QR code aparecerá no modal — escaneie com o WhatsApp do celular
4. Após escanear, o status mudará para **"Conectado!"**
5. A sessão fica salva em disco — **não precisa escanear de novo** a menos que o WhatsApp desconecte

---

## 4. Expor com Cloudflare Tunnel (URL pública gratuita)

O frontend hospedado no GitHub Pages precisa de uma URL pública para acessar seu servidor local. O Cloudflare Tunnel é gratuito e não exige abrir portas no roteador.

### Instalação do cloudflared

**Windows:**
```bash
winget install --id Cloudflare.cloudflared
```

**Linux:**
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**Mac:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

### Uso rápido (URL temporária)

```bash
cloudflared tunnel --url http://localhost:3333
```

Copie a URL gerada (ex: `https://xyz-abc.trycloudflare.com`) e cole no `enviar_mensagens.html` na variável `API_URL`.

### URL permanente (gratuita com conta Cloudflare)

1. Criar conta em [cloudflare.com](https://cloudflare.com)
2. `cloudflared login`
3. `cloudflared tunnel create centro-social`
4. Configure o túnel seguindo as instruções da Cloudflare para usar uma URL fixa

---

## 5. Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `API_KEY` | _(obrigatório)_ | Chave de autenticação — use no header `apikey` do frontend |
| `INSTANCE_NAME` | `CentroSocial` | Nome da instância — deve bater com `INSTANCE` no frontend |
| `PORT` | `3333` | Porta do servidor |
| `MESSAGE_DELAY_MS` | `2000` | Delay em ms entre cada mensagem (evita bloqueio do WhatsApp) |
| `DEFAULT_COUNTRY_CODE` | `55` | DDI padrão para números sem código de país |
| `CORS_ORIGIN` | `*` | Origem permitida no CORS (`*` libera tudo) |
| `RATE_LIMIT_MAX` | `30` | Máximo de requisições por minuto por IP no endpoint de envio |

---

## 6. Endpoints da API

### `GET /`
Verifica se o servidor está rodando.

**Resposta:**
```json
{ "status": "ok", "ready": true }
```

---

### `GET /status`
Retorna o estado de conexão do WhatsApp.

**Resposta:**
```json
{ "ready": true }
```

---

### `GET /qr`
Retorna o QR code para escanear (apenas quando não autenticado).

**Resposta:**
```json
{ "qr": "data:image/png;base64,..." }
```

---

### `POST /instance/create`
Inicializa a instância e retorna QR ou estado conectado.

**Headers:** `apikey: <API_KEY>`

**Body:**
```json
{ "instanceName": "CentroSocial", "token": "minha_chave_secreta", "qrcode": true }
```

**Resposta (aguardando QR):**
```json
{ "instance": { "instanceName": "CentroSocial" }, "qrcode": { "base64": "data:image/png;base64,..." } }
```

**Resposta (já conectado):**
```json
{ "instance": { "instanceName": "CentroSocial" }, "hash": { "apikey": "minha_chave_secreta" } }
```

---

### `GET /instance/connect/:instance`
Retorna QR code para exibir no modal ou estado conectado.

**Headers:** `apikey: <API_KEY>`

**Resposta (aguardando QR):**
```json
{ "base64": "data:image/png;base64,...", "code": "qr" }
```

**Resposta (conectado):**
```json
{ "instance": { "state": "open" } }
```

---

### `POST /message/sendText/:instance`
Envia uma mensagem de texto para um número.

**Headers:** `apikey: <API_KEY>`, `Content-Type: application/json`

**Body:**
```json
{
  "number": "5511999999999",
  "textMessage": { "text": "Olá, tudo bem?" }
}
```

**Resposta:**
```json
{ "key": { "id": "ABCDEF123456" }, "status": "PENDING" }
```

---

## 7. Solução de problemas comuns

**Erro de Chromium / Puppeteer não inicia:**
- Instale o Google Chrome no seu computador
- No Linux: `sudo apt-get install -y google-chrome-stable`

**QR não aparece no modal:**
- Aguarde 5–10 segundos após iniciar o servidor e tente novamente
- Verifique os logs do servidor no terminal

**Mensagem não enviada:**
- Verifique se o WhatsApp está conectado: `GET /status`
- Certifique-se de que o servidor está rodando

**CORS error no navegador:**
- Verifique a variável `CORS_ORIGIN` no `.env` — use `*` para liberar tudo

**Sessão perdida (pede QR toda vez):**
- A pasta `.wwebjs_auth/` deve existir na pasta `server/` — não apague ela
- Verifique se o processo não foi encerrado de forma forçada

---

## Persistência de sessão

A sessão do WhatsApp é salva na pasta `.wwebjs_auth/` dentro de `server/`. Não compartilhe essa pasta publicamente e não a inclua no controle de versão (já está no `.gitignore`).

