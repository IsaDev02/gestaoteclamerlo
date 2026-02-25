/**
 * server/server.js
 * Servidor local WhatsApp para envio de mensagens em massa via whatsapp-web.js
 * Compatível com o formato da Evolution API usado pelo enviar_mensagens.html
 *
 * Execução:
 *  - criar .env com API_KEY, INSTANCE_NAME, PORT etc (veja .env.example)
 *  - npm install
 *  - npm start
 *
 * Sessão persistida em disco via LocalAuth — escaneie o QR apenas uma vez.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '200kb' }));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

// Rate limiting no endpoint de envio de mensagem
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '30', 10),
  message: { error: 'Rate limit excedido' }
});
app.use('/message', sendLimiter);

// Config
const API_KEY = process.env.API_KEY || '';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'CentroSocial';
const PORT = parseInt(process.env.PORT || '3333', 10);
const MESSAGE_DELAY_MS = parseInt(process.env.MESSAGE_DELAY_MS || '2000', 10);
const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '55';

// Cliente WhatsApp (salva sessão em disco via LocalAuth)
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'gestaoweb' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
});

let lastQrDataUrl = null;
let isReady = false;

client.on('qr', async (qr) => {
  try {
    lastQrDataUrl = await qrcode.toDataURL(qr, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 300
    });
    console.log('QR code gerado. Acesse GET /qr ou use o botão "Conectar WhatsApp" no sistema.');
  } catch (err) {
    console.error('Erro gerando QR:', err);
  }
});

client.on('ready', () => {
  console.log('WhatsApp conectado e pronto para envio.');
  isReady = true;
  lastQrDataUrl = null;
});

client.on('auth_failure', (msg) => {
  console.error('Falha na autenticação:', msg);
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.log('WhatsApp desconectado:', reason);
  isReady = false;
  lastQrDataUrl = null;
});

client.initialize();

// Helpers
function ensureApiKey(req, res) {
  if (!API_KEY) {
    res.status(500).json({ error: 'API_KEY não configurada no servidor. Defina no arquivo .env.' });
    return false;
  }
  const key = req.headers['apikey'] || req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function normalizeNumber(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (DEFAULT_COUNTRY_CODE && !digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length <= 11) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  return digits;
}

// ── Endpoints ──────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ status: 'ok', ready: isReady });
});

app.get('/status', (req, res) => {
  res.json({ ready: isReady });
});

// Retorna dataURL do QR para exibir no modal do frontend
app.get('/qr', (req, res) => {
  if (isReady) return res.status(400).json({ error: 'Already authenticated' });
  if (!lastQrDataUrl) return res.status(404).json({ error: 'QR não disponível. Aguarde alguns segundos.' });
  res.json({ qr: lastQrDataUrl });
});

// POST /instance/create — inicializa/retorna instância
// body: { instanceName, token, qrcode }
app.post('/instance/create', (req, res) => {
  if (!ensureApiKey(req, res)) return;
  const instanceName = req.body?.instanceName || INSTANCE_NAME;
  if (isReady) {
    return res.json({ instance: { instanceName }, hash: { apikey: API_KEY } });
  }
  res.json({
    instance: { instanceName },
    qrcode: { base64: lastQrDataUrl || null }
  });
});

// GET /instance/connect/:instance — retorna QR ou estado conectado
app.get('/instance/connect/:instance', (req, res) => {
  if (!ensureApiKey(req, res)) return;
  if (isReady) {
    return res.json({ instance: { state: 'open' } });
  }
  if (!lastQrDataUrl) {
    return res.status(202).json({ message: 'Aguardando QR. Tente novamente em alguns segundos.' });
  }
  res.json({ base64: lastQrDataUrl, code: 'qr' });
});

// POST /message/sendText/:instance — envia mensagem (formato Evolution API)
// header: apikey
// body: { number, textMessage: { text } }
app.post('/message/sendText/:instance', async (req, res) => {
  if (!ensureApiKey(req, res)) return;

  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp não está conectado. Escaneie o QR primeiro.' });
  }

  const { number, textMessage } = req.body || {};
  const text = textMessage?.text;

  if (!number || !text) {
    return res.status(400).json({ error: 'Campos obrigatórios: number e textMessage.text' });
  }

  const normalized = normalizeNumber(number);
  if (!normalized) {
    return res.status(400).json({ error: 'Número inválido' });
  }

  const chatId = `${normalized}@c.us`;

  try {
    const sent = await client.sendMessage(chatId, text);
    await new Promise(r => setTimeout(r, MESSAGE_DELAY_MS));
    res.json({ key: { id: sent.id._serialized || null }, status: 'PENDING' });
  } catch (err) {
    console.error('Erro ao enviar mensagem para', normalized, err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse http://localhost:${PORT}/status para verificar o estado`);
});
