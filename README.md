# Review Assistant

An AI-powered tool for generating authentic Google Maps reviews.

## Features

- Generate natural-sounding 5-star reviews for Google Maps locations
- Multiple review styles (friendly, professional, enthusiastic, concise)
- Bilingual support (Vietnamese and English)
- Dark/Light theme
- Preview mode
- Copy to clipboard functionality
- Responsive design
- Rate limiting and security features

## Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher

## Installation

1. Clone the repository:
```bash
git clone https://github.com/dungpa45/5-star-rating.git
cd 5-star-rating
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
AI_API_URL=http://localhost:8080/v1/chat/completions
AI_API_KEY=your_api_key_here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
CORS_ORIGIN=*
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Production

Build and start the production server:
```bash
npm start
```

## API Documentation

### POST /api/generate-review

Generates a review for a Google Maps location.

**Request Body:**
```json
{
  "mapUrl": "https://maps.google.com/...",
  "prompt": "Review generation prompt"
}
```

**Response:**
```json
{
  "error": false,
  "review": "Generated review text",
  "placeInfo": {
    "name": "Place name",
    "coordinates": {
      "lat": 0.0,
      "lng": 0.0
    },
    "placeId": "place_id"
  }
}
```

## Security Features

- Helmet.js for security headers
- Rate limiting
- CORS configuration
- Input validation
- Environment variable validation
- Request logging
- Error handling

## Code Quality

- ESLint configuration
- Consistent code style
- Error handling
- Logging
- Documentation

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Express.js](https://expressjs.com/)
- [Font Awesome](https://fontawesome.com/)
- [Animate.css](https://animate.style/)
- [Google Maps Platform](https://developers.google.com/maps)