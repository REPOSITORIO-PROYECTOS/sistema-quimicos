#!/bin/bash
set -e

echo "=== Quimex Docker Build Optimizer ==="
echo ""

# Check if argument provided
if [ "$1" = "--no-cache" ]; then
    echo "🔄 Building WITHOUT cache (clean build)..."
    NO_CACHE_FLAG="--no-cache"
else
    echo "⚡ Building WITH cache (fast build)..."
    NO_CACHE_FLAG=""
fi

echo ""
echo "📦 Building images..."
echo ""

# Build images
sudo docker compose -f docker-compose-mysql.yml build $NO_CACHE_FLAG

echo ""
echo "✅ Build complete!"
echo ""
echo "Start containers with:"
echo "  docker compose -f docker-compose-mysql.yml up -d"
echo ""
echo "Or rebuild and start:"  
echo "  docker compose -f docker-compose-mysql.yml up -d --build"
echo ""
