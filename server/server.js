/**
 * server/server.js
 * API para enviar mensagens via whatsapp-web.js (LocalAuth)
 *
 * Execução:
 *  - criar .env com API_KEY, PORT etc (veja .env.example)
 *  - npm install
 *  - npm start
 *
 * Observação: sessão é persistida em ./whatsapp-session (LocalAuth).
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

// CORS - ajuste origin conforme sua aplicação
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

// Rate limiting básico para endpoint /send
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: parseInt(process.env.RATE_LIMIT_MAX || '30', 10), // max mensagens por minuto por IP
  message: { error: 'Rate limit excedido' }
});
app.use('/send', sendLimiter);

// Config
const API_KEY = process.env.API_KEY || '';
const PORT = parseInt(process.env.PORT || '3333', 10);
const MESSAGE_DELAY_MS = parseInt(process.env.MESSAGE_DELAY_MS || '800', 10); // atraso entre envios

// Cliente WhatsApp (salva sessão em disk via LocalAuth)
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'gestaoweb' }),
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false', // default true
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
    // gera dataURL e guarda para servir via endpoint GET /qr
    lastQrDataUrl = await qrcode.toDataURL(qr);
    console.log('QR code gerado (use /qr para visualizar)');
  } catch (err) {
    console.error('Erro gerando QR:', err);
  }
});

client.on('ready', () => {
  console.log('WhatsApp client pronto.');
  isReady = true;
  lastQrDataUrl = null;
});

client.on('auth_failure', (msg) => {
  console.error('Falha na autenticação:', msg);
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.log('Desconectado:', reason);
  isReady = false;
});

client.initialize();

// Helpers
function ensureApiKey(req, res) {
  const key = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (!key || key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function normalizeNumber(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  // se não tiver DDI e existir DEFAULT_COUNTRY_CODE, prefixa
  const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '55';
  if (DEFAULT_COUNTRY_CODE && !digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length <= 11) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  return digits;
}

// Endpoints
app.get('/', (req, res) => {
  res.json({ status: 'ok', ready: isReady });
});

app.get('/status', (req, res) => {
  res.json({ ready: isReady });
});

// retorna dataURL (base64 png) do QR para exibir no frontend / admin
app.get('/qr', (req, res) => {
  if (isReady) return res.status(400).json({ error: 'Already authenticated' });
  if (!lastQrDataUrl) return res.status(404).json({ error: 'QR not available. Wait for client to emit QR.' });
  res.json({ qr: lastQrDataUrl });
});

// POST /send
// body: { numbers: ["5511999999999", ...] , message: "texto com {nome} opcional", delayMs: 800 (opcional) }
// header: x-api-key: <API_KEY>
app.post('/send', async (req, res) => {
  if (!ensureApiKey(req, res)) return;

  if (!isReady) return res.status(500).json({ error: 'WhatsApp client not ready' });

  const { numbers, message, delayMs } = req.body;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ error: 'numbers array required' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message required' });
  }

  const delay = Number.isFinite(delayMs) ? parseInt(delayMs, 10) : MESSAGE_DELAY_MS;

  const results = [];
  for (const raw of numbers) {
    const normalized = normalizeNumber(raw);
    if (!normalized) {
      results.push({ to: raw, status: 'invalid_number' });
      continue;
    }
    const chatId = `${normalized}@c.us`;

    try {
      // Envia mensagem de texto simples
      const sent = await client.sendMessage(chatId, message);
      results.push({ to: normalized, status: 'sent', id: sent.id._serialized || null });
    } catch (err) {
      console.error('Erro ao enviar para', normalized, err);
      results.push({ to: normalized, status: 'error', error: err.message });
    }

    // delay entre envios para evitar ritmo muito rápido
    await new Promise(r => setTimeout(r, delay));
  }

  res.json({ results });
});

// Opcional: uma rota para enviar uma única mensagem (facilita testes)
app.post('/sendOne', async (req, res) => {
  if (!ensureApiKey(req, res)) return;
  if (!isReady) return res.status(500).json({ error: 'WhatsApp client not ready' });

  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'number and message required' });

  const normalized = normalizeNumber(number);
  if (!normalized) return res.status(400).json({ error: 'invalid number' });

  try {
    const sent = await client.sendMessage(`${normalized}@c.us`, message);
    res.json({ to: normalized, status: 'sent', id: sent.id._serialized || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server rodando na porta ${PORT}`);
});
