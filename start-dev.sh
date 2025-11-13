#!/bin/bash

# CSV Import Assembly Development Startup Script
echo "🚀 Starting development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Backend Development
print_status "Starting Backend in development mode..."
cd backend

# Create logs directory
mkdir -p logs

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing backend dependencies..."
    npm install
fi

# Stop existing PM2 process
pm2 stop csv-import-backend 2>/dev/null || true
pm2 delete csv-import-backend 2>/dev/null || true

# Start backend with PM2 in development mode
print_status "Starting backend with PM2 (development)..."
pm2 start ecosystem.config.js

cd ..

# Frontend Development
print_status "Starting Frontend in development mode..."
cd frontEnd

# Create logs directory
mkdir -p logs

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..."
    npm install
fi

# Stop existing PM2 process
pm2 stop csv-import-frontend 2>/dev/null || true
pm2 delete csv-import-frontend 2>/dev/null || true

# Start frontend with PM2 in development mode
print_status "Starting frontend with PM2 (development)..."
pm2 start ecosystem.config.js

cd ..

print_status "✅ Development environment started successfully!"
print_status "🌐 Frontend: http://localhost:3000"
print_status "🔗 Backend API: http://localhost:3001"

echo ""
print_status "📊 PM2 Status:"
pm2 status

echo ""
print_status "📝 Useful commands:"
echo "  pm2 logs csv-import-frontend    # View frontend logs"
echo "  pm2 logs csv-import-backend     # View backend logs"
echo "  pm2 monit                       # Monitor all processes"
echo "  pm2 restart csv-import-frontend # Restart frontend"
echo "  pm2 restart csv-import-backend  # Restart backend"
