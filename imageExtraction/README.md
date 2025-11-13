# Voter ID Extraction System

An advanced PDF processing tool that extracts voter ID information and photos from structured PDF documents using OCR technology. Supports both local Tesseract OCR and Azure Vision API for high-accuracy text recognition.

## 🌟 Features

- **Grid-Based Extraction**: Process voter data from structured PDF grids
- **Dual OCR Support**: Local Tesseract OCR with Azure Vision API fallback
- **400 DPI Processing**: High-resolution image processing for accurate OCR
- **Photo Extraction**: Automatic photo extraction with enhancement
- **Excel Export**: Generate formatted Excel files with extracted data
- **Web Interface**: Modern, user-friendly web UI
- **Async Processing**: Background task processing for large documents
- **Multiple Languages**: Support for English and Hindi text

## 📋 Prerequisites

### Required Software

1. **Python 3.8+** (Recommended: Python 3.10+)
   - Download from: https://www.python.org/downloads/
   - Verify installation: `python --version`

2. **Tesseract OCR**
   - **Windows**: Download installer from [GitHub Releases](https://github.com/UB-Mannheim/tesseract/wiki)
   - Default install location: `C:\Program Files\Tesseract-OCR\`
   - Verify installation: `tesseract --version`

3. **Git** (Optional, for cloning the repository)

### Optional Software

- **Azure Account** (for Azure Vision API and OpenAI)
- **Node.js** (only if customizing frontend)

## 🚀 Quick Start

### Method 1: Using the Batch Script (Windows)

1. **Navigate to project directory**
   ```bash
   cd C:\Users\admin\Downloads\Aniket_photo_Extraction
   ```

2. **Run the startup script**
   ```bash
   START_SERVER.bat
   ```

   The script will:
   - Install Python dependencies automatically
   - Start the Flask server
   - Open the web interface

3. **Access the application**
   - Open browser: `http://localhost:5000`

### Method 2: Manual Setup

1. **Navigate to Python service directory**
   ```bash
   cd backend\python-service
   ```

2. **Create virtual environment (recommended)**
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the server**
   ```bash
   python app.py
   ```

5. **Access the application**
   - Open browser: `http://localhost:5000`

## ⚙️ Configuration

### Basic Setup

The system works out-of-the-box with local Tesseract OCR. No additional configuration needed for basic usage.

### Optional: Azure Services

For enhanced accuracy, configure Azure services:

1. **Copy environment template**
   ```bash
   cd backend\python-service
   copy env.example.txt .env
   ```

2. **Edit `.env` file**
   ```env
   # Azure OpenAI (for intelligent text formatting)
   AZURE_OPENAI_API_KEY=your_azure_openai_key_here
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
   AZURE_OPENAI_API_VERSION=2024-12-01-preview

   # Azure Vision (for OCR fallback)
   AZURE_VISION_KEY=your_azure_vision_key_here
   AZURE_VISION_ENDPOINT=https://your-vision-resource.cognitiveservices.azure.com/
   ```

3. **Restart server** to load new configuration

### OCR Settings

Configure OCR behavior in `.env`:

```env
# OCR DPI setting (300-600, higher = better quality but slower)
OCR_DPI=400

# Confidence threshold for using Azure fallback (0.0-1.0)
OCR_CONFIDENCE_THRESHOLD=0.7
```

## 📖 Usage Guide

### Step 1: Upload PDF

1. Open the web interface: `http://localhost:5000`
2. Click "Choose PDF File" or drag-and-drop your PDF
3. Wait for upload confirmation

### Step 2: Configure Grid

1. **Set Grid Layout**
   - Position: Adjust X, Y coordinates
   - Size: Set width and height
   - Grid: Specify rows and columns

2. **Set Page Settings**
   - Skip pages at start/end
   - Skip header/footer heights

3. **Define Cell Templates** (Optional)
   - Voter ID Box: Region containing voter ID
   - Photo Box: Region containing photo
   - Leave blank for full-cell scanning

### Step 3: Extract Data

1. Click "Extract Data" button
2. Monitor progress in console
3. Download Excel file when complete

### Step 4: Verify Results

Check console output for statistics:
```
============================================================
EXTRACTION COMPLETE
============================================================
Total records extracted: 48
400 DPI Local OCR: 42          <- Most cells use local OCR
400 DPI Azure OCR (fallback): 6  <- Only 6 needed API
Photos extracted (400 DPI): 48
Photos enhanced: 48
============================================================
```

## 📦 Dependencies

### Python Packages

```
flask==3.0.0
flask-cors==4.0.0
pymupdf>=1.24.0
pytesseract>=0.3.13
Pillow>=10.0.0
numpy>=2.0.0
azure-cognitiveservices-vision-computervision==0.9.0
azure-ai-vision-imageanalysis==1.0.0b1
python-dotenv>=1.0.0
requests>=2.31.0
openpyxl>=3.1.0
```

### System Requirements

- **CPU**: Multi-core processor recommended (12th Gen i5 or better)
- **RAM**: 8GB minimum (32GB recommended for large PDFs)
- **Storage**: 1GB free space
- **OS**: Windows 10/11, Linux, or macOS

## 🧪 Testing

### Run Integration Tests

```bash
cd backend\python-service
python test_400dpi_integration.py
```

Expected output:
```
5/5 tests passed
ALL TESTS PASSED - SYSTEM READY!
```

### Test Azure Integration

```bash
python test_azure_detection.py
```

### Test OCR

```bash
python test_ocr.py
```

## 📁 Project Structure

```
Aniket_photo_Extraction/
├── backend/
│   └── python-service/          # Python Flask backend
│       ├── app.py               # Main Flask application
│       ├── extractor.py         # Core extraction logic
│       ├── ocr_processor_400dpi.py  # 400 DPI OCR processor
│       ├── azure_vision_service.py  # Azure Vision integration
│       ├── config.py            # Configuration management
│       ├── requirements.txt     # Python dependencies
│       ├── uploads/             # Uploaded PDFs
│       └── outputs/             # Generated Excel files
├── frontend/                     # Web interface
│   ├── index.html              # Main HTML
│   ├── css/
│   │   └── styles.css          # Styling
│   └── js/
│       ├── app.js              # Main application logic
│       ├── pdfViewer.js        # PDF viewer
│       └── azureVisionIntegration.js  # Azure integration
├── START_SERVER.bat            # Windows startup script
├── README.md                   # This file
├── QUICK_START_IMPROVED.md     # Quick start guide
└── IMPROVED_400DPI_OCR.md      # Technical documentation
```

## 🔧 Troubleshooting

### Issue: Tesseract Not Found

**Error:** `Failed to initialize Tesseract`

**Solution:**
1. Verify Tesseract installation: `tesseract --version`
2. If not found, add to PATH:
   ```bash
   # Windows
   setx PATH "%PATH%;C:\Program Files\Tesseract-OCR\"
   ```

### Issue: ModuleNotFoundError

**Error:** `ModuleNotFoundError: No module named 'flask'`

**Solution:**
```bash
pip install -r requirements.txt
```

### Issue: Wrong Voter IDs

**Problem:** Incorrect text extraction

**Solutions:**
1. Check console output for OCR method used
2. Adjust confidence threshold in `.env`:
   ```env
   OCR_CONFIDENCE_THRESHOLD=0.6  # Lower = more Azure calls
   ```
3. Remove restrictive boxes from cell template
4. Verify Tesseract Hindi data installed (if processing Hindi)

### Issue: Photos Cropped

**Problem:** Incomplete photo extraction

**Solutions:**
1. Remove photo box configuration:
   ```javascript
   cellTemplate: {
       photoBox: null
   }
   ```
2. Adjust photo box coordinates to match document

### Issue: Slow Processing

**Problem:** Extraction takes too long

**Solutions:**
1. Reduce DPI setting:
   ```env
   OCR_DPI=300  # Faster, still good quality
   ```
2. Disable Azure (use local OCR only):
   ```env
   AZURE_VISION_KEY=
   ```

### Issue: Port Already in Use

**Error:** `Address already in use`

**Solution:**
1. Close existing server instance
2. Or change port in `.env`:
   ```env
   PORT=5001
   ```

## 📊 Performance Expectations

### Typical Performance

| Metric | Value |
|--------|-------|
| Extraction Speed | ~200ms per cell |
| Local OCR Success | 85-90% |
| Azure Fallback | 10-15% |
| Photo Quality | High (400 DPI) |
| Memory Usage | 500-800MB |
| CPU Usage | 40-60% per core |

### 100-Cell Document

- **Time:** ~20 seconds
- **API Calls:** ~15 (with Azure configured)
- **Cost:** ~$0.15 (Azure usage)
- **Accuracy:** High

## 🔐 Security

### Production Deployment

1. **Disable Debug Mode**
   ```env
   DEBUG=False
   ```

2. **Enable Authentication**
   ```env
   AUTH_ENABLED=True
   API_KEYS=your_secret_key_1,your_secret_key_2
   ```

3. **Restrict CORS**
   ```env
   ALLOWED_ORIGINS=https://yourdomain.com
   ```

4. **Configure File Retention**
   ```env
   FILE_RETENTION_HOURS=1  # Auto-cleanup after 1 hour
   ```

### Generate API Keys

```bash
cd backend\python-service
python auth.py
```

## 📝 API Endpoints

### Core Endpoints

- `POST /api/upload-pdf` - Upload PDF file
- `POST /api/configure-extraction` - Configure extraction settings
- `POST /api/extract-grid` - Extract data synchronously
- `POST /api/extract-grid-async` - Extract data asynchronously
- `GET /api/download-excel/:excelId` - Download Excel file
- `GET /api/task-status/:taskId` - Check async task status
- `GET /health` - Health check

### Utility Endpoints

- `POST /detect-regions` - Detect regions using Azure Vision
- `POST /test-ocr` - Test OCR functionality

## 🌍 Multi-Language Support

### Installing Hindi Support

1. **Download Hindi data**
   - URL: https://github.com/tesseract-ocr/tessdata
   - File: `hin.traineddata`

2. **Install**
   - Windows: `C:\Program Files\Tesseract-OCR\tessdata\`
   - Linux: `/usr/share/tesseract-ocr/4.00/tessdata/`
   - macOS: `/opt/homebrew/share/tesseract/5/tessdata/`

3. **Verify**
   ```bash
   tesseract --list-langs
   ```
   Should show: `eng`, `hin`

## 📚 Additional Documentation

- **QUICK_START_IMPROVED.md** - Quick start guide with examples
- **IMPROVED_400DPI_OCR.md** - Technical documentation
- **CHANGES_SUMMARY.md** - Recent changes and updates
- **HOW_TO_EXTRACT_VOTER_CARDS.md** - Detailed usage guide

## 🤝 Contributing

This is a specialized tool for voter ID extraction. For improvements or bug fixes:

1. Test thoroughly with real voter ID documents
2. Maintain backward compatibility
3. Follow existing code style
4. Update documentation

## 📄 License

This project is for voter data extraction purposes.

## 🆘 Support

### Check System Status

```bash
cd backend\python-service
python config.py  # View configuration summary
python test_400dpi_integration.py  # Run tests
```

### View Logs

- Application log: `backend\python-service\app.log`
- Console output: Real-time extraction statistics

### Common Issues

See [Troubleshooting](#-troubleshooting) section above or check console output during extraction.

## 🎯 System Requirements Summary

**Minimum Requirements:**
- Python 3.8+
- Tesseract OCR
- 8GB RAM
- 1GB disk space

**Recommended Requirements:**
- Python 3.10+
- Tesseract OCR with Hindi support
- 32GB RAM
- Multi-core CPU (12th Gen i5 or better)
- Azure account (optional)

**For Production:**
- All above requirements
- Reverse proxy (nginx/Apache)
- SSL certificate
- Firewall configuration
- Monitoring tools

---

**Ready to process voter ID documents? Run `START_SERVER.bat` and start extracting!** 🚀
