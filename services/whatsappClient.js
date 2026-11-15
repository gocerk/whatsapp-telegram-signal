const path = require('path');
const fs = require('fs');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] WHATSAPP ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

const AUTH_DIR = path.resolve(process.env.WHATSAPP_AUTH_DIR || path.join(__dirname, '..', 'wa-auth'));

/**
 * Single shared Baileys connection for the whole process.
 * One WhatsApp session must only have ONE open socket, otherwise the
 * sessions kick each other out ("conflict" / stream replaced).
 */
class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // disconnected | connecting | open | logged_out
    this.connectPromise = null;
    this.openWaiters = [];
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.groupCache = new Map();
    this.baileys = null;
    this.pairingCodeRequested = false;
  }

  async loadBaileys() {
    if (!this.baileys) {
      // baileys is ESM-only, load it via dynamic import from CommonJS
      this.baileys = await import('baileys');
    }
    return this.baileys;
  }

  isConnected() {
    return this.status === 'open' && !!this.sock;
  }

  getStatus() {
    return {
      status: this.status,
      connected: this.isConnected(),
      user: this.sock?.user?.id || null,
      authDir: AUTH_DIR
    };
  }

  /**
   * Start the connection (idempotent). Resolves once the socket is created,
   * not when it is open; use getSocket() to wait for an open connection.
   */
  connect() {
    if (!this.connectPromise) {
      this.connectPromise = this.createSocket().catch((error) => {
        log('error', 'Failed to start WhatsApp connection', { error: error.message });
        this.connectPromise = null;
        this.scheduleReconnect();
      });
    }
    return this.connectPromise;
  }

  async createSocket() {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason,
      Browsers
    } = await this.loadBaileys();
    const pino = require('pino');

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (error) {
      log('warn', 'Could not fetch latest WhatsApp Web version, using Baileys default', { error: error.message });
    }

    this.status = 'connecting';
    log('info', 'Connecting to WhatsApp...', { authDir: AUTH_DIR });

    const sock = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      logger: pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'warn' }),
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false, // keep phone notifications working
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid)
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('groups.update', (updates) => {
      for (const update of updates) this.groupCache.delete(update.id);
    });
    sock.ev.on('group-participants.update', ({ id }) => this.groupCache.delete(id));

    // Pairing code login (no QR): set WHATSAPP_PAIR_NUMBER=905xxxxxxxxx
    const pairNumber = (process.env.WHATSAPP_PAIR_NUMBER || '').replace(/\D/g, '');
    if (!state.creds.registered && pairNumber && !this.pairingCodeRequested) {
      this.pairingCodeRequested = true;
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(pairNumber);
          log('info', '========================================');
          log('info', `WhatsApp PAIRING CODE: ${code}`);
          log('info', 'Phone: WhatsApp > Linked devices > Link a device > Link with phone number instead');
          log('info', '========================================');
        } catch (error) {
          this.pairingCodeRequested = false;
          log('error', 'Failed to request pairing code', { error: error.message });
        }
      }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !pairNumber) {
        log('info', 'Scan this QR code: WhatsApp > Linked devices > Link a device');
        require('qrcode-terminal').generate(qr, { small: true });
      }

      if (connection === 'open') {
        this.status = 'open';
        this.reconnectAttempts = 0;
        log('info', 'WhatsApp connected', { user: sock.user?.id });
        this.flushWaiters(null);
        this.refreshGroupCache().catch(() => {});
      }

      if (connection === 'close') {
        if (this.sock !== sock) return; // stale socket
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        this.sock = null;
        this.connectPromise = null;

        if (statusCode === DisconnectReason.loggedOut) {
          this.status = 'logged_out';
          log('error', `WhatsApp session logged out. Delete "${AUTH_DIR}" and link the device again (npm run wa:login).`);
          this.flushWaiters(new Error('WhatsApp session logged out'));
          return;
        }

        this.status = 'disconnected';
        log('warn', 'WhatsApp connection closed, reconnecting', {
          statusCode,
          error: lastDisconnect?.error?.message
        });

        // restartRequired (515) happens right after first login: reconnect immediately
        if (statusCode === DisconnectReason.restartRequired) {
          this.connect();
        } else {
          this.scheduleReconnect();
        }
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.status === 'logged_out') return;
    const delay = Math.min(60000, 2000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  flushWaiters(error) {
    const waiters = this.openWaiters;
    this.openWaiters = [];
    for (const { resolve, reject, timer } of waiters) {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(this.sock);
    }
  }

  /**
   * Get an open socket, waiting up to timeoutMs for the connection.
   */
  async getSocket(timeoutMs = 20000) {
    if (this.isConnected()) return this.sock;
    if (this.status === 'logged_out') {
      throw new Error('WhatsApp session logged out, link the device again (npm run wa:login)');
    }

    this.connect();

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.openWaiters = this.openWaiters.filter(w => w !== waiter);
        reject(new Error(`WhatsApp not connected (status: ${this.status}). Is the device linked?`));
      }, timeoutMs);
      this.openWaiters.push(waiter);
    });
  }

  async refreshGroupCache() {
    if (!this.isConnected()) return {};
    const groups = await this.sock.groupFetchAllParticipating();
    this.groupCache.clear();
    for (const [jid, metadata] of Object.entries(groups)) {
      this.groupCache.set(jid, metadata);
    }
    return groups;
  }

  async close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const sock = this.sock;
    this.sock = null;
    this.status = 'disconnected';
    if (sock) {
      try { sock.end(undefined); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = new WhatsAppClient();
module.exports.AUTH_DIR = AUTH_DIR;
