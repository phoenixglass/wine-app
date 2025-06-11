const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Keys from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.VOICE_ID || 'rzsnuMd2pwYz1rGtMIVI';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Enhanced wine inventory with more detailed data
let wines = [
    {
        id: 1,
        wine_name: "Pinot Noir",
        price: "$18",
        inventory: 120,
        customer_last_ordered: "Thompson Restaurant",
        last_order_date: "May 15, 2025",
        wine_type: "Red Wine"
    },
    {
        id: 2,
        wine_name: "Cabernet Sauvignon",
        price: "$35",
        inventory: 12,
        customer_last_ordered: "Johnson Winery",
        last_order_date: "June 8, 2025",
        wine_type: "Red Wine"
    },
    {
        id: 3,
        wine_name: "Syrah",
        price: "$25",
        inventory: 0,
        customer_last_ordered: "Westport Spirits",
        last_order_date: "April 22, 2025",
        wine_type: "Red Wine"
    }
];

let queryLogs = [];
let nextWineId = 4;

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware to verify token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Email content generation
function generateEmailContent(query, recipient) {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('follow up') || queryLower.includes('followup')) {
        return `Hi ${recipient}, just wanted to follow up about your recent wine order. Please let us know if you need anything else or have any questions about your selection.`;
    }
    
    if (queryLower.includes('delivery') || queryLower.includes('shipment')) {
        return `Hi ${recipient}, there's been a slight delay with your wine delivery. We'll have it to you by end of week. Thank you for your patience.`;
    }
    
    if (queryLower.includes('reorder') || queryLower.includes('stock')) {
        return `Hi ${recipient}, we wanted to let you know that your favorite wine is back in stock and available for reorder. Would you like us to set aside your usual quantity?`;
    }
    
    if (queryLower.includes('tasting') || queryLower.includes('event')) {
        return `Hi ${recipient}, we have an upcoming wine tasting event next Friday at 6 PM. We'd love to have you join us for an evening of exceptional wines.`;
    }
    
    // Default email
    return `Hi ${recipient}, this is a follow-up regarding your wine order. Thank you for choosing us for your wine needs. Please don't hesitate to reach out if you have any questions.`;
}

// Extract recipient from query
function extractRecipient(query) {
    const queryLower = query.toLowerCase();
    
    // Check for specific customer names
    if (queryLower.includes('thompson')) return 'Thompson Restaurant';
    if (queryLower.includes('johnson')) return 'Johnson Winery';
    if (queryLower.includes('westport')) return 'Westport Spirits';
    
    // Check for wine-based recipient lookup
    for (const wine of wines) {
        const wineName = wine.wine_name.toLowerCase();
        if (queryLower.includes(wineName) || wineName.split(' ').some(word => queryLower.includes(word))) {
            return wine.customer_last_ordered;
        }
    }
    
    return 'Wine Room';
}

// Enhanced wine query logic
function findWineInfo(query) {
    const queryLower = query.toLowerCase();
    
    // Handle email requests
    if (queryLower.includes('email') || queryLower.includes('send') || queryLower.includes('message')) {
        const recipient = extractRecipient(query);
        const emailContent = generateEmailContent(query, recipient);
        
        return {
            type: 'email',
            recipient: recipient,
            content: emailContent,
            message: `Email draft ready to send to ${recipient}.`
        };
    }
    
    // Check for customer queries
    for (const wine of wines) {
        const customer = wine.customer_last_ordered.toLowerCase();
        if (queryLower.includes(customer) || customer.split(' ').some(word => queryLower.includes(word))) {
            if (queryLower.includes('when') || queryLower.includes('date')) {
                return `${wine.customer_last_ordered} last ordered ${wine.wine_name} on ${wine.last_order_date}.`;
            }
            return `${wine.customer_last_ordered} last ordered ${wine.wine_name}.`;
        }
    }

    // Check for wine-specific queries
    for (const wine of wines) {
        const wineName = wine.wine_name.toLowerCase();
        const wineWords = wineName.split(' ');
        
        if (queryLower.includes(wineName) || 
            wineWords.some(word => queryLower.includes(word))) {
            
            if (queryLower.includes('inventory') || queryLower.includes('stock') || 
                queryLower.includes('how many') || queryLower.includes('how much') ||
                queryLower.includes('bottles')) {
                return `We have ${wine.inventory} bottles of ${wine.wine_name} in stock.`;
            } else if (queryLower.includes('price') || queryLower.includes('cost')) {
                return `The price of ${wine.wine_name} is ${wine.price} per bottle.`;
            } else if (queryLower.includes('ordered') || queryLower.includes('customer') || 
                      queryLower.includes('who') || queryLower.includes('last')) {
                return `${wine.customer_last_ordered} last ordered ${wine.wine_name} on ${wine.last_order_date}.`;
            } else if (queryLower.includes('type') || queryLower.includes('style')) {
                return `${wine.wine_name} is a ${wine.wine_type}.`;
            } else {
                return `${wine.wine_name}: ${wine.inventory} bottles at ${wine.price} (last ordered by ${wine.customer_last_ordered})`;
            }
        }
    }

    // Show all wines
    if (queryLower.includes('show') || queryLower.includes('all') || queryLower.includes('list')) {
        return "Here's our complete wine inventory: " + 
               wines.map(w => `${w.wine_name} (${w.inventory} bottles at ${w.price})`).join(', ');
    }

    return "I can help you with wine inventory, prices, customer orders, or send emails. Try asking about specific wines or customers.";
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({ 
        message: 'Wine Inventory API is running!',
        version: '3.0 - Enhanced with Email & iOS Support',
        endpoints: ['/api/auth/login', '/api/voice-query', '/api/inventory', '/api/logs', '/api/analytics']
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'wine123') {
        const token = jwt.sign({ username, id: 1 }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ 
            token, 
            user: { username, id: 1 }
        });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// Enhanced voice query endpoint with email support
app.post('/api/voice-query', authenticateToken, async (req, res) => {
    try {
        const { query, isIOS } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Process the query
        const queryResult = findWineInfo(query);
        
        // Handle email responses differently
        if (typeof queryResult === 'object' && queryResult.type === 'email') {
            return res.json({
                type: 'email',
                query: query,
                response: queryResult.message,
                emailData: {
                    recipient: queryResult.recipient,
                    content: queryResult.content
                },
                audioUrl: null, // Will be generated if ElevenLabs is working
                isIOS: isIOS || false
            });
        }
        
        // Regular text response
        const response = queryResult;
        
        // Generate audio if ElevenLabs is available and not iOS (or user wants it)
        let audioUrl = null;
        if (ELEVENLABS_API_KEY && !isIOS) {
            try {
                const audioResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + VOICE_ID, {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': ELEVENLABS_API_KEY
                    },
                    body: JSON.stringify({
                        text: response,
                        model_id: 'eleven_monolingual_v1',
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.5
                        }
                    })
                });
                
                if (audioResponse.ok) {
                    const audioBuffer = await audioResponse.arrayBuffer();
                    const base64Audio = Buffer.from(audioBuffer).toString('base64');
                    audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
                }
            } catch (audioError) {
                console.log('Audio generation failed:', audioError.message);
            }
        }

        // Log the query
        const logEntry = {
            id: Date.now(),
            query,
            response,
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            isIOS: isIOS || false
        };
        
        queryLogs.unshift(logEntry);
        if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(0, 100);
        }

        res.json({
            type: 'text',
            query: query,
            response: response,
            audioUrl: audioUrl,
            isIOS: isIOS || false,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Voice query error:', error);
        res.status(500).json({ 
            error: 'Voice processing failed',
            message: error.message,
            query: req.body.query || 'Unknown query'
        });
    }
});

// Fake email send endpoint
app.post('/api/send-email', authenticateToken, (req, res) => {
    const { recipient, content } = req.body;
    
    // Simulate email sending delay
    setTimeout(() => {
        const emailLog = {
            id: Date.now(),
            type: 'email_sent',
            recipient: recipient,
            content: content,
            timestamp: new Date().toISOString(),
            userId: req.user.id,
            status: 'sent'
        };
        
        queryLogs.unshift(emailLog);
        if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(0, 100);
        }
        
        res.json({
            success: true,
            message: `Email successfully sent to ${recipient}!`,
            timestamp: new Date().toISOString()
        });
    }, 1500); // 1.5 second delay to simulate real email sending
});

// Get all wines
app.get('/api/inventory', authenticateToken, (req, res) => {
    res.json(wines);
});

// Add new wine
app.post('/api/inventory', authenticateToken, (req, res) => {
    const { wine_name, price, inventory, customer_last_ordered, last_order_date, wine_type } = req.body;
    
    if (!wine_name || !price || inventory === undefined || !customer_last_ordered) {
        return res.status(400).json({ error: 'wine_name, price, inventory, and customer_last_ordered are required' });
    }
    
    const newWine = {
        id: nextWineId++,
        wine_name,
        price,
        inventory: parseInt(inventory),
        customer_last_ordered,
        last_order_date: last_order_date || new Date().toISOString().split('T')[0],
        wine_type: wine_type || 'Red Wine'
    };
    
    wines.push(newWine);
    res.json(newWine);
});

// Update wine
app.put('/api/inventory/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const { wine_name, price, inventory, customer_last_ordered, last_order_date, wine_type } = req.body;
    
    const wineIndex = wines.findIndex(w => w.id === id);
    if (wineIndex === -1) {
        return res.status(404).json({ error: 'Wine not found' });
    }
    
    wines[wineIndex] = {
        id,
        wine_name,
        price,
        inventory: parseInt(inventory),
        customer_last_ordered,
        last_order_date: last_order_date || wines[wineIndex].last_order_date,
        wine_type: wine_type || wines[wineIndex].wine_type
    };
    
    res.json(wines[wineIndex]);
});

// Delete wine
app.delete('/api/inventory/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const wineIndex = wines.findIndex(w => w.id === id);
    
    if (wineIndex === -1) {
        return res.status(404).json({ error: 'Wine not found' });
    }
    
    wines.splice(wineIndex, 1);
    res.json({ message: 'Wine deleted successfully' });
});

// Log query (keeping for backwards compatibility)
app.post('/api/logs', authenticateToken, (req, res) => {
    const { query, response, timestamp } = req.body;
    
    const logEntry = {
        id: Date.now(),
        query,
        response,
        timestamp: timestamp || new Date().toISOString(),
        userId: req.user.id
    };
    
    queryLogs.unshift(logEntry);
    
    if (queryLogs.length > 100) {
        queryLogs = queryLogs.slice(0, 100);
    }
    
    res.json(logEntry);
});

// Get query history
app.get('/api/logs', authenticateToken, (req, res) => {
    res.json(queryLogs);
});

// Get analytics
app.get('/api/analytics', authenticateToken, (req, res) => {
    const totalQueries = queryLogs.filter(log => log.type !== 'email_sent').length;
    const totalEmails = queryLogs.filter(log => log.type === 'email_sent').length;
    const totalWines = wines.length;
    const totalBottles = wines.reduce((sum, wine) => sum + wine.inventory, 0);
    const totalValue = wines.reduce((sum, wine) => {
        const price = parseFloat(wine.price.replace('$', ''));
        return sum + (price * wine.inventory);
    }, 0);
    
    res.json({
        totalQueries,
        totalEmails,
        totalWines,
        totalBottles,
        totalValue: Math.round(totalValue),
        recentActivity: queryLogs.slice(0, 5)
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🍷 Wine Inventory API running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}`);
    console.log(`🔑 Login credentials: admin / wine123`);
    console.log(`🎤 Voice API endpoint: /api/voice-query`);
    console.log(`📧 Email API endpoint: /api/send-email`);
    console.log(`📱 iOS Support: Enabled`);
    console.log(`✅ Environment variables loaded: ${OPENAI_API_KEY ? 'OpenAI✓' : 'OpenAI✗'} ${ELEVENLABS_API_KEY ? 'ElevenLabs✓' : 'ElevenLabs✗'}`);
});