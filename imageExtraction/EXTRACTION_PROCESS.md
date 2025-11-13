# Data Extraction Process Documentation

## Overview
This document describes the complete data extraction process used in the Voter ID Extraction System.

## Extraction Methods

### Method 1: Enhanced Extraction (Basic)
**Used when:** Field boxes (name, relativeName, houseNumber, age, gender) are NOT defined

**Process:**
1. **Grid Definition**: User draws a grid on the PDF to define cell boundaries
2. **Template Definition**: User defines areas for:
   - Voter ID (EPIC No)
   - Photo
   - Serial Number (optional)
   - Yadi Bhag (optional)
3. **Cell Processing**: For each cell in the grid:
   - Extract Voter ID using OCR (Tesseract or Azure Vision)
   - Extract Photo from defined area
   - Extract Serial Number (if defined)
   - Skip cells without valid Voter ID
4. **Output**: Excel file with EPIC No, Serial Number, Photo (Base64), and Yadi Bhag

### Method 2: Table-Based Extraction (Advanced)
**Used when:** Field boxes (name, relativeName, houseNumber, age, gender) ARE defined

**Process:**

#### Step 1: Basic Extraction
- Extract Serial Numbers and Photos from all cells using OCR
- Group records by page
- Store cell positions (row, column, page)

#### Step 2: Field Image Cropping
For each page:
- For each record on the page:
  - Calculate actual cell coordinates from grid configuration
  - Crop images for each field (name, relativeName, houseNumber, age, gender) from the cell
  - Store cropped field images

#### Step 3: Table Image Generation
- Create a structured table image where:
  - Each row = one voter record
  - Each column = one field (Serial Number, Name, Relative Name, House Number, Age, Gender)
  - Serial Number column shows text
  - Other columns show cropped field images
- Save table image to `table_images/table_page_{pageNum}.png`

#### Step 4: Azure Vision Table Recognition
- Send table image to Azure Vision Read API
- Azure Vision performs OCR on the entire table image
- Returns:
  - Text content with bounding boxes
  - Line-by-line OCR results
  - Confidence scores

#### Step 5: Table Parsing
- Parse OCR results to extract structured data:
  - Group text lines by Y position (rows)
  - Group text within rows by X position (columns)
  - Map columns to fields:
    - Column 1: Serial Number
    - Column 2: Name
    - Column 3: Relative Name
    - Column 4: House Number
    - Column 5: Age
    - Column 6: Gender
    - Column 7: Yadi Bhag (if present)

#### Step 6: Data Matching
- Match parsed table rows with extracted records using Serial Number
- Merge table data into records:
  - If Serial Number matches: Update record with table data
  - If no match: Keep record with empty fields

#### Step 7: Excel Generation
- Include all fields in Excel:
  - EPIC No (Voter ID)
  - Serial Number
  - Name
  - Relative Name
  - House Number
  - Age
  - Gender
  - Yadi Bhag
  - Base64 Image String

## Data Flow

```
PDF Upload
    ↓
Grid Definition (User draws grid)
    ↓
Template Definition (User defines field areas)
    ↓
Extraction Configuration
    ↓
┌─────────────────────────────────────┐
│  Check: Field boxes defined?         │
└─────────────────────────────────────┘
    ↓                    ↓
   NO                   YES
    ↓                    ↓
Enhanced          Table-Based
Extraction        Extraction
    ↓                    ↓
    └────────┬───────────┘
             ↓
    Excel Generation
             ↓
    Preview & Download
```

## Key Components

### 1. Grid Overlay (`gridOverlay.js`)
- Handles grid drawing and cell definition
- Manages template box definitions
- Caches configuration in localStorage

### 2. Extractor (`extractor.py`)
- `extract_grid_vertical_enhanced()`: Basic extraction
- `extract_grid_vertical_table_based()`: Advanced table-based extraction
- `process_single_cell_worker()`: Parallel cell processing

### 3. Table Image Generator (`table_image_generator.py`)
- Crops field images from PDF cells
- Generates structured table images
- Handles image resizing and layout

### 4. Azure Table Recognizer (`azure_table_recognizer.py`)
- Sends table images to Azure Vision API
- Parses OCR results into structured table data
- Matches rows by Serial Number
- Tracks API call count

### 5. Excel Generator (`excel_generator.py`)
- Dynamically includes columns based on available data
- Formats cells with borders and colors
- Saves to `.xlsx` format

## Coordinate System

### Frontend (Canvas)
- Canvas coordinates at 1.5x scale (default)
- Grid and template boxes drawn on canvas
- Coordinates stored relative to first cell

### Backend (PDF)
- PDF coordinates (72 DPI points)
- Conversion: `pdf_coord = canvas_coord / scale`
- Cell positions calculated from grid configuration

### Field Boxes
- Defined relative to first cell
- Applied to all cells with scaling:
  - `abs_x = cell_x + (box_x * scale_x)`
  - `abs_y = cell_y + (box_y * scale_y)`

## API Calls

### Azure Vision Read API
- **Endpoint**: `{endpoint}/vision/v3.2/read/analyze`
- **Method**: POST (async)
- **Input**: PNG image bytes
- **Output**: OCR text with bounding boxes
- **Tracking**: Counted per extraction session

## Statistics Logged

- Total records extracted
- Execution time (seconds and minutes)
- Azure API call count
- Average time per record
- Cells processed vs skipped

## Troubleshooting

### Issue: Data not in Excel
**Check:**
1. Are field boxes defined in template?
2. Is table-based extraction enabled?
3. Check console logs for API errors
4. Verify table images are generated correctly

### Issue: Wrong data extracted
**Check:**
1. Verify field box coordinates are correct
2. Check table image to see if crops are correct
3. Review Azure OCR results in logs
4. Verify Serial Number matching is working

### Issue: Small text not extracted
**Possible causes:**
1. Field box too small (increase size)
2. Low image quality (check DPI settings)
3. Azure OCR confidence too low
4. Text in different language (check language setting)

