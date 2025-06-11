const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const FormData = require('form-data');
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads (audio files)
const upload = multer({ storage: multer.memoryStorage() });

// API Keys - Add these as environment variables in Railway
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_17254b66372cebc52de070e2d8584e0309333848556a0065';
const VOICE_ID = process.env.VOICE_ID || 'rzsnuMd2pwYz1rGtMIVI';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Add your OpenAI key here

// Simple in-memory database
let wines = [
    {
        id: 1,
        wine_name: "Pinot Noir",
        price: "$18",
        inventory: 120,
        customer_last_ordered: "Thompson Restaurant"
    },
    {
        id: 2,
        wine_name: "Cabernet Sauvignon",
        price: "$35",
        inventory: 12,
        customer_last_ordered: "Johnson Winery"
    },
    {
        id: 3,
        wine_name: "Syrah",
        price: "$25",
        inventory: 0,
        customer_last_ordered: "Westport Spirits"
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

// Wine query logic
function findWineInfo(query) {
    const queryLower = query.toLowerCase();
    
    // Check for customer queries
    for (const wine of wines) {
        const customer = wine.customer_last_ordered.toLowerCase();
        if (queryLower.includes(customer) || customer.split(' ').some(word => queryLower.includes(word))) {
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
                queryLower.includes('how many') || queryLower.includes('how much')) {
                return `We have ${wine.inventory} bottles of ${wine.wine_name} in stock.`;
            } else if (queryLower.includes('price') || queryLower.includes('cost')) {
                return `The price of ${wine.wine_name} is ${wine.price}.`;
            } else if (queryLower.includes('ordered') || queryLower.includes('customer') || queryLower.includes('who')) {
                return `The last customer to order ${wine.wine_name} was ${wine.customer_last_ordered}.`;
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

    return "Sorry, I couldn't find information about that wine or customer.";
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'Wine Inventory API is running!' });
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

// Speech-to-text using Whisper
app.post('/api/speech-to-text', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Create form data for OpenAI Whisper API
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: 'audio.wav',
            contentType: 'audio/wav'
        });
        formData.append('model', 'whisper-1');

        // Call OpenAI Whisper API
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Whisper API error: ${response.status}`);
        }

        const result = await response.json();
        
        // Process the query and get wine information
        const wineResponse = findWineInfo(result.text);
        
        // Log the interaction
        const logEntry = {
            id: Date.now(),
            query: result.text,
            response: wineResponse,
            timestamp: new Date().toISOString(),
            userId: req.user.id
        };
        
        queryLogs.unshift(logEntry);
        if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(0, 100);
        }

        res.json({
            transcription: result.text,
            response: wineResponse
        });

    } catch (error) {
        console.error('Speech-to-text error:', error);
        res.status(500).json({ error: 'Speech recognition failed' });
    }
});

// Text-to-speech using ElevenLabs
app.post('/api/text-to-speech', authenticateToken, async (req, res) => {
    try {
        if (!ELEVENLABS_API_KEY) {
            return res.status(500).json({ error: 'ElevenLabs API key not configured' });
        }

        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'No text provided' });
        }

        // Call ElevenLabs API
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        // Return the audio as a stream
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'attachment; filename="speech.mp3"'
        });
        
        response.body.pipe(res);

    } catch (error) {
        console.error('Text-to-speech error:', error);
        res.status(500).json({ error: 'Speech synthesis failed' });
    }
});

// Process voice query (combines speech-to-text, wine logic, and text-to-speech)
app.post('/api/voice-query', authenticateToken, upload.single('audio'), async (req, res) => {
    try {
        if (!OPENAI_API_KEY || !ELEVENLABS_API_KEY) {
            return res.status(500).json({ error: 'API keys not configured' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Step 1: Speech-to-text
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: 'audio.wav',
            contentType: 'audio/wav'
        });
        formData.append('model', 'whisper-1');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!whisperResponse.ok) {
            throw new Error(`Whisper API error: ${whisperResponse.status}`);
        }

        const transcription = await whisperResponse.json();
        
        // Step 2: Process wine query
        const wineResponse = findWineInfo(transcription.text);
        
        // Step 3: Log the interaction
        const logEntry = {
            id: Date.now(),
            query: transcription.text,
            response: wineResponse,
            timestamp: new Date().toISOString(),
            userId: req.user.id
        };
        
        queryLogs.unshift(logEntry);
        if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(0, 100);
        }

        // Step 4: Text-to-speech
        const elevenLabsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: wineResponse,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!elevenLabsResponse.ok) {
            throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status}`);
        }

        // Return structured response
        const audioBuffer = await elevenLabsResponse.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.json({
            query: transcription.text,
            response: wineResponse,
            audioBase64: audioBase64
        });

    } catch (error) {
        console.error('Voice query error:', error);
        res.status(500).json({ error: 'Voice query processing failed' });
    }
});

// Get all wines
app.get('/api/inventory', authenticateToken, (req, res) => {
    res.json(wines);
});

// Add new wine
app.post('/api/inventory', authenticateToken, (req, res) => {
    const { wine_name, price, inventory, customer_last_ordered } = req.body;
    
    if (!wine_name || !price || inventory === undefined || !customer_last_ordered) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const newWine = {
        id: nextWineId++,
        wine_name,
        price,
        inventory: parseInt(inventory),
        customer_last_ordered
    };
    
    wines.push(newWine);
    res.json(newWine);
});

// Update wine
app.put('/api/inventory/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id);
    const { wine_name, price, inventory, customer_last_ordered } = req.body;
    
    const wineIndex = wines.findIndex(w => w.id === id);
    if (wineIndex === -1) {
        return res.status(404).json({ error: 'Wine not found' });
    }
    
    wines[wineIndex] = {
        id,
        wine_name,
        price,
        inventory: parseInt(inventory),
        customer_last_ordered
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

// Log query
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
    const totalQueries = queryLogs.length;
    const totalWines = wines.length;
    const totalBottles = wines.reduce((sum, wine) => sum + wine.inventory, 0);
    const totalValue = wines.reduce((sum, wine) => {
        const price = parseFloat(wine.price.replace('$', ''));
        return sum + (price * wine.inventory);
    }, 0);
    
    res.json({
        totalQueries,
        totalWines,
        totalBottles,
        totalValue: Math.round(totalValue)
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🍷 Wine Inventory API running on port ${PORT}`);
    console.log(`📍 API URL: http://localhost:${PORT}`);
    console.log(`🔑 Login credentials: admin / wine123`);
    console.log(`🎤 Voice API endpoint: /api/voice-query`);
});
