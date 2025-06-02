const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to extract place information from Google Maps URL
function extractPlaceInfoFromUrl(url) {
    try {
        const parsedUrl = new URL(url);
        let placeName = null;
        let coordinates = null;
        let placeId = null;

        // Handle different Google Maps URL formats
        if (url.includes('maps.app.goo.gl')) {
            // Short URL format - we'll need to follow the redirect to get the actual URL
            // For now, we'll just extract what we can from the short URL
            const pathParts = parsedUrl.pathname.split('/');
            placeId = pathParts[pathParts.length - 1];
        } else if (url.includes('google.com/maps')) {
            // Regular Google Maps URL
            const searchParams = parsedUrl.searchParams;
            
            // Try to get place name from the URL path
            const pathParts = parsedUrl.pathname.split('/');
            if (pathParts.includes('place')) {
                const placeIndex = pathParts.indexOf('place');
                if (placeIndex !== -1 && pathParts[placeIndex + 1]) {
                    // Decode the place name from the URL
                    placeName = decodeURIComponent(pathParts[placeIndex + 1].replace(/\+/g, ' '));
                }
            }
            
            // Try to get coordinates
            const query = searchParams.get('q');
            if (query) {
                // Check if query contains coordinates
                const coordMatch = query.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
                if (coordMatch) {
                    coordinates = {
                        lat: parseFloat(coordMatch[1]),
                        lng: parseFloat(coordMatch[2])
                    };
                } else {
                    // If not coordinates, it might be the place name
                    placeName = decodeURIComponent(query.replace(/\+/g, ' '));
                }
            }
            
            // Try to get place ID
            placeId = searchParams.get('cid') || searchParams.get('entry');
        }

        console.log('URL parsing results:', {
            originalUrl: url,
            placeName,
            coordinates,
            placeId
        });

        return {
            name: placeName,
            coordinates,
            placeId
        };
    } catch (error) {
        console.error('Error parsing URL:', error);
        return null;
    }
}

// Route chính
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy endpoint for AI API
app.post('/api/generate-review', async (req, res) => {
    try {
        const { prompt, mapUrl } = req.body;
        
        // If this is just a place info extraction request
        if (prompt === "extract_place_info" && mapUrl) {
            const placeInfo = extractPlaceInfoFromUrl(mapUrl);
            return res.json({ placeInfo });
        }

        // Regular review generation flow
        let placeInfo = null;
        if (mapUrl) {
            placeInfo = extractPlaceInfoFromUrl(mapUrl);
            console.log('Extracted place info:', placeInfo);
        }

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Enhance the prompt with place information
        const enhancedPrompt = placeInfo ? 
            `${prompt}\n\nPlace Information:\nName: ${placeInfo.name}\nLocation: ${placeInfo.coordinates ? `${placeInfo.coordinates.lat}, ${placeInfo.coordinates.lng}` : 'Not available'}\nURL: ${mapUrl}` :
            prompt;

        const response = await fetch('http://localhost:8080/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { 
                        role: "system",
                        content: "You are a helpful assistant that generates authentic, natural-sounding reviews for Google Maps. Use the provided place information to create detailed, specific reviews that sound like they were written by real customers who have visited the location."
                    },
                    { 
                        role: "user", 
                        content: enhancedPrompt 
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', data);

        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from API');
        }

        const review = data.choices[0].message.content;
        res.json({ 
            review,
            placeInfo: placeInfo || null
        });
    } catch (error) {
        console.error('Error calling AI API:', error);
        res.status(500).json({ 
            error: 'Failed to generate review',
            message: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Something broke!',
        message: err.message
    });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
});