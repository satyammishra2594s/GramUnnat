# GramUnnat

GramUnnat is a mobile-first agricultural companion built from the supplied `GramUnnat.html`. It preserves the original dashboard, bilingual interface, demo login, crop tools, livestock monitoring, farm records, advisory, weather, location, local storage, and voice features while adding secure Netlify services.

## Key capabilities

- English and Hindi interface with a demo farmer account
- Live weather, geolocation, place search, forecasts, and farming alerts
- Plant image upload or camera capture with server-side AI-assisted diagnosis
- Persistent livestock profiles, animal health records, and farm history
- Ayush side assistant with English/Hindi text, speech input, speech output, mute state, live context, farm-data context, and GramUnnat navigation
- Local-first browser storage synchronized to Netlify Database when available

## Technology

- Static HTML, CSS, and browser JavaScript in `public/`
- Netlify Functions in `netlify/functions/`
- Netlify AI Gateway through the OpenAI SDK
- Netlify Database with Drizzle ORM and deploy-time migrations
- Open-Meteo for weather and geocoding
- Browser MediaDevices, Web Speech API, and Geolocation API

## Local development

Install dependencies and run the Netlify development environment:

```bash
npm install
netlify dev --port 8889
```

Open `http://localhost:8889`. Camera, microphone, and geolocation availability depends on the browser and permission settings. AI features require Netlify AI Gateway to be enabled for the project; no private API key belongs in frontend code.

## Deployment

The repository is configured by `netlify.toml`. Netlify publishes `public/`, bundles functions from `netlify/functions/`, provisions the managed database on first connection, and applies the generated migration in `netlify/database/migrations/`.
