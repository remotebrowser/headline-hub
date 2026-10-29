# Headline Hub

Headline Hub is a web app that collects the latest headline news from different websites and shows them all in one place.

**Live Demo:** https://headline-hub.fly.dev

## Technical Overview

- **Frontend:** Vanilla JavaScript (Vite), Tailwind CSS.
- **Backend:** Express.js, TypeScript.

## Configuration

Create a `.env` file in the project root with the following variables:

```env
REMOTEBROWSER_URL=http://localhost:23456

# Optional. Used as the Bearer token for every Remote Browser API call.
# REMOTEBROWSER_API_KEY=sk-rb-v1-...
```

When `REMOTEBROWSER_API_KEY` is set, it is used as the Bearer token when
launching a browser, connecting to it over CDP, and terminating it. Without it,
the calls go out unauthenticated, which a local Remote Browser server accepts.

## Development

```bash
npm install
npm run dev
```
