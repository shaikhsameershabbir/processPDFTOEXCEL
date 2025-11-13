#!/bin/bash

# CSV Import Assembly Stop All Script
echo "🛑 Stopping all services..."

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

# Stop all PM2 processes
print_status "Stopping all PM2 processes..."
pm2 stop all

print_status "Deleting all PM2 processes..."
pm2 delete all

print_status "✅ All services stopped successfully!"
