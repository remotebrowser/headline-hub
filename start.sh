#!/bin/sh
set -e

# if [ -n "${TAILSCALE_AUTHKEY}" ]; then
#     echo "Starting Tailscale daemon in background..."
#     /app/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &
    
#     # Start Tailscale authentication in background
#     (
#         # Give tailscaled a moment to initialize
#         sleep 2
#         echo "Authenticating with Tailscale in background..."
#         /app/tailscale up --authkey="${TAILSCALE_AUTHKEY}" --hostname=headline-hub --accept-routes

#         # Log status for monitoring
#         echo "=== Tailscale Status ===" 
#         /app/tailscale status
#     ) &
# else
#     echo "TAILSCALE_AUTHKEY not set, skipping Tailscale setup"
# fi

echo "Starting Node app..."
npm start
