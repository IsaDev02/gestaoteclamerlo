# WhatsApp Evolution API (whatsapp-web.js)

Aviso: solução não-oficial que automatiza WhatsApp Web. Use com responsabilidade.

## Requisitos
- Node 16+ (recomendado 18+)
- npm
- Chrome/Chromium (ou deixe o puppeteer baixar)

## Instalação
1. Vá para a pasta `server/`
2. Copie `.env.example` para `.env` e edite (API_KEY, DEFAULT_COUNTRY_CODE, etc).
3. npm install
4. npm start

Na primeira execução o servidor gerará um QR. Acesse `GET /qr` para obter o dataURL do QR e escaneie com o WhatsApp do número que você quer usar.

## Endpoints principais
- GET /status -> { ready: boolean }
- GET /qr -> { qr: "data:image/png;base64,..." } (somente se ainda não autenticado)
- POST /send -> enviar várias mensagens
  - headers: `x-api-key: <API_KEY>`
  - body JSON: { numbers: ["5511999999999", ...], message: "Olá {nome}", delayMs: 1000 }
- POST /sendOne -> enviar um número apenas

## Segurança
- Proteja API com `API_KEY` (cabeçalho `x-api-key` ou Authorization: Bearer).
- Bind do servidor em rede segura (firewall) se for expor na internet.
- Rate limiting básico incluído.

## Persistência de sessão
- LocalAuth persiste sessão em disco na pasta padrão criada pelo whatsapp-web.js (./local_auth ou similar). Não compartilhe esses arquivos publicamente.

## Observações
- Evite alto volume de envios; monitorar comportamento do número.
- Para envio oficial/produção, use WhatsApp Cloud API (Meta) ou fornecedores oficiais (Twilio).
