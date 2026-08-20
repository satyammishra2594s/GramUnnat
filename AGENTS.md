# GramUnnat Architecture

## Structure

- `public/index.html` is the preserved uploaded GramUnnat application and primary UI source.
- `public/assets/enhancements.css` adds camera, diagnosis, livestock-record, and Ayush side-panel styling.
- `public/assets/enhancements.js` enhances the original global application without replacing its navigation or local-storage model.
- `public/assets/ayush.png` is the user-supplied Ayush profile image.
- `netlify/functions/diagnose.mts` performs server-side plant-image analysis through Netlify AI Gateway.
- `netlify/functions/chat.mts` powers Ayush and adds live weather/news context plus navigation intents.
- `netlify/functions/state.mts` synchronizes local-first user state to Netlify Database.
- `db/` defines the Drizzle schema and database client.
- `netlify/database/migrations/` contains generated deploy-time migrations.

## Conventions

- Preserve `public/index.html` behavior and visual identity; prefer small enhancements over rewrites.
- Keep GramUnnat as the platform name and Ayush as an optional side assistant.
- Keep all secrets and AI calls server-side. Never add provider keys to `public/`.
- Escape model-generated or user-generated strings before inserting HTML.
- Preserve local storage as an offline fallback and queue database synchronization after mutations.
- Add English and Hindi text together. Dynamic enhancement UI is rebuilt after a language-change reload.
- Treat crop and animal guidance as advisory, not guaranteed professional diagnosis or treatment.

## Non-obvious decisions

The original single-file application uses top-level browser globals. `enhancements.js` intentionally loads after that script and extends those bindings so existing demo data, authentication, storage, navigation, weather, and translations remain intact. Database rows store a compact per-user application state while animal photos are resized in the browser to keep synchronization payloads bounded.
