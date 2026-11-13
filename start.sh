#!/bin/sh
set -e

if [ -n "${TAILSCALE_AUTHKEY}" ]; then
    echo "Starting Tailscale daemon in background..."
    /app/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

    for _ in $(seq 1 20); do
        [ -S /var/run/tailscale/tailscaled.sock ] && break
        sleep 0.5
    done

    # Block until connected so the first request does not race the tunnel.
    echo "Authenticating with Tailscale..."
    /app/tailscale up --authkey="${TAILSCALE_AUTHKEY}" --hostname=headline-hub --advertise-tags=tag:fly --timeout=30s \
        || echo "Tailscale did not connect, starting the app anyway"

    echo "=== Tailscale Status ==="
    /app/tailscale status || true
else
    echo "TAILSCALE_AUTHKEY not set, skipping Tailscale setup"
fi

echo "Starting Node app..."
npm start
