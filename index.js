require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

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
• /sticker - Crée un sticker (répondre à une image)`;
        }
    },
    
    'info': {
        description: 'Informations sur le bot',
        execute: (args, msg, sock) => {
            return `🤖 Mon Bot WhatsApp
Créé avec Baileys et Node.js
Utilise le système de pairing code
Projet présenté en classe`;
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
            
            let result;
            switch(op) {
                case '+': result = a + b; break;
                case '-': result = a - b; break;
                case '*': result = a * b; break;
                case '/': result = a / b; break;
                default: return 'Opérateur non supporté: +, -, *, /';
            }
            
            return `🧮 Résultat: ${a} ${op} ${b} = ${result}`;
        }
    }
};

let pair = false;

async function startBot() {
    // Configuration WhatsApp
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false  // Désactivé car on utilise pairing code
    });

    // Gérer le pairing code
    async function handlePairing() {
        if (!sock.authState.creds.registered && !pair) {
            try {
                await delay(3000);
                const numeroPair = process.env.WA_NUMBER || '225xxxxxxxx';
                const code = await sock.requestPairingCode(numeroPair);
                console.log("🔗 CODE DE PAIRAGE : ", code);
                pair = true;
            } catch (err) {
                console.error("❌ Erreur lors du pairage :", err.message);
            }
        }
    }

    // Sauvegarder les identifiants
    sock.ev.on('creds.update', saveCreds);

    // Gérer la connexion
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('🔌 Connexion fermée, reconnexion:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Connexion WhatsApp établie!');
        }
    });

    // Gérer les messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        // Ignorer ses propres messages
        if (msg.key.fromMe) return;
        
        const text = getMessageText(msg);
        const sender = msg.key.remoteJid;
        
        console.log(`📩 Message de ${sender}: ${text}`);
        
        // Vérifier si c'est une commande
        if (text && text.startsWith('/')) {
            const command = text.slice(1).toLowerCase().split(' ')[0];
            const args = text.split(' ').slice(1);
            
            if (commands[command]) {
                const reply = await commands[command].execute(args, msg, sock);
                await sock.sendMessage(sender, { text: reply });
            } else {
                await sock.sendMessage(sender, { 
                    text: `❌ Commande inconnue: /${command}\nTape /help pour voir les commandes disponibles.` 
                });
            }
        }
        
        // Réponse automatique aux messages simples
        else if (text) {
            const lowerText = text.toLowerCase();
            if (lowerText.includes('bonjour') || lowerText.includes('salut')) {
                await sock.sendMessage(sender, { text: '👋 Salut ! Tape /help pour voir mes commandes.' });
            } else if (lowerText.includes('ça va') || lowerText.includes('comment')) {
                await sock.sendMessage(sender, { text: '😊 Je vais bien merci ! Et toi ?' });
            }
        }
    });

    // Démarrer le pairing
    await handlePairing();
    console.log('🤖 Bot démarré avec système de pairing code!');
}

// Extraire le texte d'un message
function getMessageText(msg) {
    if (msg.message.conversation) return msg.message.conversation;
    if (msg.message.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
    if (msg.message.imageMessage?.caption) return msg.message.imageMessage.caption;
    return '';
}

// Démarrer le bot
startBot().catch(console.error);
