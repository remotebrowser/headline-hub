#!/bin/sh
set -e

echo "Starting Tailscale daemon..."
/app/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

echo "Authenticating with Tailscale..."
/app/tailscale up --authkey="${TAILSCALE_AUTHKEY}" --hostname=headline-hub --accept-routes &

echo "Starting Node app..."
node dist/server.js
