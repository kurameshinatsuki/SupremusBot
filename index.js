require('dotenv').config();
const path = require('path');
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');

// Bot state management
const botState = {
    status: 'initializing',
    connection: 'connecting',
    pairingCode: null,
    waNumber: process.env.WA_NUMBER || '2250103731509',
    botOwner: process.env.BOT_OWNER || 'John Supremus (2250103731509)',
    recentLogs: []
};

function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    console.log(entry);
    botState.recentLogs.push(entry);
    if (botState.recentLogs.length > 50) {
        botState.recentLogs.shift();
    }
}

// Système de commandes
const commands = {
    'help': {
        description: 'Affiche les commandes disponibles',
        execute: (args, msg, sock) => {
            return `📚 Commandes disponibles :
• /help - Affiche cette aide
• /info - Informations du bot
• /ping - Test de réponse
• /time - Heure actuelle
• /bonjour - Dire bonjour
• /calcul [a] [op] [b] - Calcul simple (ex: /calcul 5 * 3)
• /sticker - Crée un sticker (répondre à une image)`;
        }
    },
    
    'info': {
        description: 'Informations sur le bot',
        execute: (args, msg, sock) => {
            return `🤖 Mon Bot WhatsApp (SupremusBot)
Créé avec Baileys et Node.js
Studio : SUPREMUS PROD
Utilise le système de pairing code
Projet présenté pour SRPN (Supremus Role Play Nation)`;
        }
    },
    
    'ping': {
        description: 'Test de réponse',
        execute: (args, msg, sock) => {
            return '🏓 Pong! Le bot fonctionne correctement';
        }
    },
    
    'time': {
        description: 'Affiche l\'heure actuelle',
        execute: (args, msg, sock) => {
            return `🕒 Heure: ${new Date().toLocaleString()}`;
        }
    },
    
    'bonjour': {
        description: 'Dire bonjour',
        execute: (args, msg, sock) => {
            return '👋 Bonjour! Comment vas-tu?';
        }
    },
    
    'calcul': {
        description: 'Faire un calcul simple',
        execute: (args, msg, sock) => {
            if (args.length < 3) return 'Usage: /calcul 5 + 3';
            
            const a = parseFloat(args[0]);
            const b = parseFloat(args[2]);
            const op = args[1];
            
            if (isNaN(a) || isNaN(b)) {
                return '❌ Nombres invalides. Exemple: /calcul 10 * 5';
            }

            let result;
            switch(op) {
                case '+': result = a + b; break;
                case '-': result = a - b; break;
                case '*': result = a * b; break;
                case '/': result = b !== 0 ? a / b : 'Division par zéro impossible'; break;
                default: return 'Opérateur non supporté: +, -, *, /';
            }
            
            return `🧮 Résultat: ${a} ${op} ${b} = ${result}`;
        }
    }
};

// Process incoming message or simulation
async function processIncomingText(text, sender = 'User', msg = {}, sock = null) {
    if (!text) return null;
    const trimmed = text.trim();

    // Vérifier si c'est une commande
    if (trimmed.startsWith('/')) {
        const command = trimmed.slice(1).toLowerCase().split(' ')[0];
        const args = trimmed.split(' ').slice(1);
        
        if (commands[command]) {
            return await commands[command].execute(args, msg, sock);
        } else {
            return `❌ Commande inconnue: /${command}\nTape /help pour voir les commandes disponibles.`;
        }
    }
    
    // Réponse automatique aux messages simples
    const lowerText = trimmed.toLowerCase();
    if (lowerText.includes('bonjour') || lowerText.includes('salut')) {
        return '👋 Salut ! Tape /help pour voir mes commandes.';
    } else if (lowerText.includes('ça va') || lowerText.includes('comment vas') || lowerText.includes('comment tu vas')) {
        return '😊 Je vais bien merci ! Et toi ?';
    }
    
    return `🤖 Message reçu : "${trimmed}". Tapez /help pour afficher les commandes.`;
}

let activeSock = null;
let isPairingRequested = false;
let isReconnecting = false;

async function startBot() {
    try {
        addLog('Initialisation de la session Baileys auth...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false
        });
        activeSock = sock;

        // Gérer le pairing code
        async function handlePairing() {
            if (!sock.authState.creds.registered && !isPairingRequested) {
                try {
                    await delay(3000);
                    const numeroPair = botState.waNumber;
                    if (numeroPair && numeroPair !== '225xxxxxxxx') {
                        addLog(`Demande de code de pairage pour ${numeroPair}...`);
                        const code = await sock.requestPairingCode(numeroPair);
                        botState.pairingCode = code;
                        isPairingRequested = true;
                        addLog(`🔗 CODE DE PAIRAGE REÇU : ${code}`);
                    } else {
                        addLog('Numéro de pairage par défaut utilisé.');
                    }
                } catch (err) {
                    addLog(`❌ Erreur lors du pairage : ${err.message}`);
                }
            }
        }

        // Sauvegarder les identifiants
        sock.ev.on('creds.update', saveCreds);

        // Gérer la connexion
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            botState.connection = connection || botState.connection;
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
                addLog(`🔌 Connexion fermée (Code: ${statusCode || 'inconnu'}), reconnexion: ${shouldReconnect}`);
                botState.status = 'disconnected';
                
                if (shouldReconnect && !isReconnecting) {
                    isReconnecting = true;
                    setTimeout(() => {
                        isReconnecting = false;
                        startBot();
                    }, 10000); // 10 secondes pour éviter les boucles rapides
                }
            } else if (connection === 'open') {
                botState.status = 'connected';
                botState.pairingCode = null;
                addLog('✅ Connexion WhatsApp établie avec succès !');
            } else if (connection === 'connecting') {
                botState.status = 'connecting';
            }
        });

        // Gérer les messages WhatsApp reçus
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg || msg.key.fromMe) return;
            
            const text = getMessageText(msg);
            const sender = msg.key.remoteJid;
            
            addLog(`📩 Message reçu de ${sender}: ${text}`);
            
            const reply = await processIncomingText(text, sender, msg, sock);
            if (reply) {
                try {
                    await sock.sendMessage(sender, { text: reply });
                } catch (sendErr) {
                    addLog(`❌ Erreur envoi réponse à ${sender}: ${sendErr.message}`);
                }
            }
        });

        // Démarrer le pairing
        await handlePairing();
        addLog('🤖 Bot démarré avec système de pairing code!');
    } catch (err) {
        addLog(`❌ Erreur globale startBot : ${err.message}`);
        if (!isReconnecting) {
            isReconnecting = true;
            setTimeout(() => {
                isReconnecting = false;
                startBot();
            }, 10000);
        }
    }
}

// Extraire le texte d'un message
function getMessageText(msg) {
    if (!msg.message) return '';
    if (msg.message.conversation) return msg.message.conversation;
    if (msg.message.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
    if (msg.message.imageMessage?.caption) return msg.message.imageMessage.caption;
    return '';
}

// Configuration du serveur Express pour AI Studio
const app = express();
const PORT = 3000;

process.on('uncaughtException', (err) => {
    console.error('Caught Exception:', err);
    addLog(`Exception: ${err.message}`);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    addLog(`Rejection: ${reason}`);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Statut du bot
app.get('/api/status', (req, res) => {
    res.json({
        name: 'SupremusBot',
        status: botState.status,
        connection: botState.connection,
        pairingCode: botState.pairingCode,
        waNumber: botState.waNumber,
        botOwner: botState.botOwner,
        uptime: process.uptime(),
        recentLogs: botState.recentLogs.slice(-15)
    });
});

// API: Exécuter ou tester une commande / message
app.post('/api/command', async (req, res) => {
    try {
        const text = req.body.message || '';
        const reply = await processIncomingText(text, 'web-user', {}, activeSock);
        res.json({
            ok: true,
            reply: reply || 'Aucune réponse générée.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Demande d'un nouveau code de pairage
app.post('/api/request-pairing', async (req, res) => {
    try {
        const number = req.body.number;
        if (!number) {
            return res.status(400).json({ error: 'Numéro requis' });
        }
        botState.waNumber = number;
        if (activeSock && !activeSock.authState.creds.registered) {
            addLog(`Génération d'un code de pairage manuel pour ${number}...`);
            const code = await activeSock.requestPairingCode(number);
            botState.pairingCode = code;
            return res.json({ ok: true, code });
        } else {
            return res.json({
                ok: false,
                message: 'Bot déjà enregistré ou socket non disponible pour le moment.'
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serveur principal sur port 3000
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SupremusBot Web Dashboard accessible sur http://0.0.0.0:${PORT}`);
    // Lancement du bot Baileys
    startBot().catch(err => {
        addLog(`Erreur démarrage initial du bot: ${err.message}`);
    });
});
