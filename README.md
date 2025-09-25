# Headline Hub

HeadlineHub is a web app that collects the latest headline news from different websites and shows them all in one place.

**Live Demo:** https://headline-hub.fly.dev

## Technical Overview

- **Frontend:** React (Vite), TypeScript, Tailwind CSS.
- **Backend:** Express.js, geolocation via MaxMind.

## Configuration

Create a `.env` file in the project root with the following variables:

```env
GETGATHER_URL=http://localhost:23456
```

## Development

```bash
npm install
npm run dev
```

## Deployment (Fly.io)

### Prerequisites

1. Install the Fly CLI: https://fly.io/docs/getting-started/installing-flyctl/
2. Sign up for a Fly.io account: https://fly.io/app/sign-up

### Deploy Steps

1. **Login to Fly.io**:

   ```bash
   fly auth login
   ```

2. **Create and deploy the app**:

   ```bash
   fly launch
   ```

   This will:
   - Create a new app on Fly.io
   - Use the existing `fly.toml` configuration
   - Build and deploy using the existing Dockerfile
   - Sometimes it will update app name

3. **Set up secrets**:

   ```bash
   cp .env.template .env
   # IMPORTANT, edit .env with your actual values
   fly secrets import < .env
   ```

4. **Deploy updates**:
   ```bash
   fly deploy
   ```

### Configuration

The `fly.toml` file contains the deployment configuration:

- **Memory**: 1GB RAM
- **Auto-scaling**: Starts/stops machines based on traffic
- **HTTPS**: Automatically enforced

### Monitoring

- **View logs**: `fly logs`
- **Check status**: `fly status`
- **Open in browser**: `fly open`
