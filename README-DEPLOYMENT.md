# CSV Import Assembly - Production Deployment Guide

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MySQL database
- PM2 process manager
- Nginx (already configured on your server)

### Server Configuration
Your nginx is already configured with:
- **Frontend**: `process.mastermindmedias.com` → `127.0.0.1:4001`
- **Backend**: `processbackend.mastermindmedias.com` → `127.0.0.1:4002`

## 📋 Deployment Steps

### 1. Install PM2 (if not already installed)
```bash
npm install -g pm2
```

### 2. Deploy to Production
```bash
# Run the deployment script
./deploy.sh
```

### 3. Manual Deployment (Alternative)
```bash
# Backend
cd backend
npm install
pm2 start ecosystem.config.js --env production

# Frontend
cd frontEnd
npm install
npm run build
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

## 🔧 Development Setup

### Start Development Environment
```bash
./start-dev.sh
```

### Stop All Services
```bash
./stop-all.sh
```

## 📊 Monitoring

### View Logs
```bash
pm2 logs csv-import-frontend    # Frontend logs
pm2 logs csv-import-backend     # Backend logs
pm2 logs                        # All logs
```

### Monitor Processes
```bash
pm2 monit                       # Real-time monitoring
pm2 status                      # Process status
```

### Restart Services
```bash
pm2 restart csv-import-frontend # Restart frontend
pm2 restart csv-import-backend  # Restart backend
pm2 restart all                 # Restart all
```

## 🌐 URLs

### Production
- **Frontend**: https://process.mastermindmedias.com
- **Backend API**: https://processbackend.mastermindmedias.com

### Development
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001

## 🔧 Configuration

### Environment Variables

#### Backend (.env.production)
```
NODE_ENV=production
PORT=4002
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=smasher
DB_NAME=election
CORS_ORIGIN=https://process.mastermindmedias.com
```

#### Frontend (.env.production)
```
NEXT_PUBLIC_API_URL=https://processbackend.mastermindmedias.com
NODE_ENV=production
NEXT_PUBLIC_AZURE_VISION_API_KEY=your_azure_vision_api_key_here
NEXT_PUBLIC_AZURE_VISION_ENDPOINT=https://your-azure-vision-endpoint.com/
```

## 🗄️ Database Setup

Ensure your MySQL database is running and accessible with:
- Host: localhost
- User: root
- Password: smasher
- Database: election

## 📁 File Structure

```
csvImportAccembly/
├── backend/
│   ├── server.js              # Main server file
│   ├── ecosystem.config.js    # PM2 configuration
│   ├── package.json           # Dependencies
│   └── uploads/               # File uploads directory
├── frontEnd/
│   ├── app/                   # Next.js app directory
│   ├── components/            # React components
│   ├── ecosystem.config.js    # PM2 configuration
│   ├── next.config.mjs        # Next.js configuration
│   └── package.json           # Dependencies
├── deploy.sh                  # Production deployment script
├── start-dev.sh              # Development startup script
└── stop-all.sh               # Stop all services script
```

## 🚨 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   pm2 stop all
   pm2 delete all
   ./deploy.sh
   ```

2. **Database connection issues**
   - Check MySQL is running
   - Verify database credentials
   - Ensure database exists

3. **Build failures**
   ```bash
   cd frontEnd
   rm -rf .next
   npm run build
   ```

4. **PM2 not found**
   ```bash
   npm install -g pm2
   ```

### Logs Location
- Backend logs: `backend/logs/`
- Frontend logs: `frontEnd/logs/`

## 🔄 Updates

To update the application:
1. Pull latest changes
2. Run `./deploy.sh`
3. PM2 will automatically restart the services

## 📞 Support

For issues or questions:
1. Check PM2 logs: `pm2 logs`
2. Check application logs in respective `logs/` directories
3. Verify nginx configuration
4. Check database connectivity
