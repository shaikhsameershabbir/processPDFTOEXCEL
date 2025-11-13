#!/bin/bash

# CSV Import Assembly Deployment Script
echo "🚀 Starting deployment process..."

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

# Backend Deployment
print_status "Deploying Backend..."
cd backend

# Create logs directory
mkdir -p logs

# Install dependencies
print_status "Installing backend dependencies..."
npm install

# Stop existing PM2 process
print_status "Stopping existing backend process..."
pm2 stop csv-import-backend 2>/dev/null || true
pm2 delete csv-import-backend 2>/dev/null || true

# Start backend with PM2
print_status "Starting backend with PM2..."
pm2 start ecosystem.config.js

cd ..

# Frontend Deployment
print_status "Deploying Frontend..."
cd frontEnd

# Create logs directory
mkdir -p logs

# Install dependencies
print_status "Installing frontend dependencies..."
npm install

# Build the application
print_status "Building frontend application..."
npm run build

# Stop existing PM2 process
print_status "Stopping existing frontend process..."
pm2 stop csv-import-frontend 2>/dev/null || true
pm2 delete csv-import-frontend 2>/dev/null || true

# Start frontend with PM2
print_status "Starting frontend with PM2..."
pm2 start ecosystem.config.js

cd ..

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script
print_status "Setting up PM2 startup script..."
pm2 startup

print_status "✅ Deployment completed successfully!"
print_status "🌐 Frontend: https://process.mastermindmedias.com"
print_status "🔗 Backend API: https://processbackend.mastermindmedias.com"

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
