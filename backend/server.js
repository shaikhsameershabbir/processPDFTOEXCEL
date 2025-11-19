require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mysql = require('mysql2/promise');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const XLSX = require('xlsx');
const { transliterateText } = require('./utils/translator');
const { PDFDocument } = require('pdf-lib');

const execAsync = promisify(exec);

const app = express();

// Environment configuration with sensible defaults
const {
  PORT,
  CORS_ORIGIN = '*',
  DB_HOST = 'localhost',
  DB_USER,

  DB_PASSWORD,
  DB_NAME, 
  DB_PORT,
  UPLOADS_DIR = 'uploads',
} = process.env;

// Middleware
// Support comma-separated origins or single origin or '*'
const allowedOrigins = CORS_ORIGIN && CORS_ORIGIN.includes(',')
  ? CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : CORS_ORIGIN || '*';

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(UPLOADS_DIR));

// Database connection
const dbConfig = {
  host: DB_HOST,
  user: DB_USER,
  // socketPath: '/var/lib/mysql/mysql.sock',
  password: DB_PASSWORD,
  database: DB_NAME,
  ...(DB_PORT ? { port: Number(DB_PORT) } : {}),
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = UPLOADS_DIR;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Helper function to create database connection
async function createConnection() {
  return await mysql.createConnection(dbConfig);
}

// Helper function to parse Excel/CSV file
async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const results = [];

  if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } else if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }
  
  throw new Error('Unsupported file format');
}

// API Routes

// Get all database tables
app.get('/api/tables', async (req, res) => {
  try {
    const conn = await createConnection();
    const [tables] = await conn.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = '${DB_NAME}' 
      AND TABLE_NAME LIKE 'assembly_%_%'
      ORDER BY TABLE_NAME
    `);
    
    await conn.end();
    res.json(tables.map(table => table.TABLE_NAME));
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Get table columns
app.get('/api/tables/:tableName/columns', async (req, res) => {
  try {
    const { tableName } = req.params;
    const conn = await createConnection();
    const [columns] = await conn.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${DB_NAME}' 
      AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [tableName]);
    
    await conn.end();
    res.json(columns);
  } catch (error) {
    console.error('Error fetching columns:', error);
    res.status(500).json({ error: 'Failed to fetch columns' });
  }
});


//smasher
// Upload file and get file preview
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileData = await parseFile(req.file.path);
    
    // Get first few rows for preview
    const preview = fileData.slice(0, 5);
    const headers = Object.keys(fileData[0] || {});
    
    res.json({
      filename: req.file.originalname,
      filepath: req.file.path,
      headers,
      preview,
      totalRows: fileData.length
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Helper function to normalize EPIC number variations
function getEpicVariations(epicNo) {
  if (!epicNo) return [];
  const str = String(epicNo).trim();
  const normalized = str.replace(/\s+/g, '');
  const withoutZeros = normalized.replace(/^0+/, '');
  const withPadding = normalized.padStart(10, '0');
  
  const variations = new Set([normalized]);
  if (withoutZeros && withoutZeros !== normalized) variations.add(withoutZeros);
  if (withPadding !== normalized) variations.add(withPadding);
  
  return Array.from(variations);
}

// Helper function to find record in lookup map
function findRecordInMap(dbMap, epicNo) {
  if (!epicNo) return null;
  const variations = getEpicVariations(epicNo);
  for (const variation of variations) {
    if (dbMap.has(variation)) {
      return dbMap.get(variation);
    }
  }
  return null;
}

// Match data between uploaded file and database table (OPTIMIZED)
app.post('/api/match-data', async (req, res) => {
  try {
    const { filePath, tableName, epicColumn, selectedColumns } = req.body;
    
    if (!filePath || !tableName || !epicColumn) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log(`🔍 Starting optimized data matching for ${filePath}`);
    const startTime = Date.now();
    
    // Parse uploaded file
    const fileData = await parseFile(filePath);
    console.log(`📄 Parsed ${fileData.length} file records`);
    
    // OPTIMIZATION: Only load EPIC_NO for initial matching lookup (much faster)
    const conn = await createConnection();
    
    // Get all database records but only EPIC_NO for lookup
    console.log(`📊 Loading EPIC_NO lookup map from ${tableName}...`);
    const [dbEpicData] = await conn.query(`SELECT EPIC_NO FROM \`${tableName}\``);
    
    // Create optimized lookup map with EPIC_NO -> index mapping
    const epicToIndexMap = new Map();
    dbEpicData.forEach((record, index) => {
      if (record.EPIC_NO) {
        const variations = getEpicVariations(record.EPIC_NO);
        variations.forEach(variation => {
          if (variation && !epicToIndexMap.has(variation)) {
            epicToIndexMap.set(variation, index);
          }
        });
      }
    });
    
    console.log(`✅ Created lookup map with ${epicToIndexMap.size} variations`);
    
    // OPTIMIZATION: First do fast matching with EPIC_NO only
    const batchSize = 1000;
    const matchedEpicIndices = new Set(); // Collect indices of matched EPICs in dbEpicData
    const matchedFileIndices = []; // Track which file records matched
    const unmatchedFileIndices = []; // Track which file records didn't match
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    console.log(`🔄 Fast matching ${fileData.length} records in batches of ${batchSize}...`);
    
    // Phase 1: Fast matching - only check if EPIC exists (no full record data)
    for (let i = 0; i < fileData.length; i += batchSize) {
      const batch = fileData.slice(i, i + batchSize);
      
      batch.forEach((fileRecord, batchIndex) => {
        const globalIndex = i + batchIndex;
        const epicNo = fileRecord[epicColumn];
        const normalizedEpicNo = epicNo ? String(epicNo).trim() : null;
        
        // Fast lookup - only check if EPIC exists
        const variations = normalizedEpicNo ? getEpicVariations(normalizedEpicNo) : [];
        let found = false;
        for (const variation of variations) {
          const dbIndex = epicToIndexMap.get(variation);
          if (dbIndex !== undefined) {
            matchedEpicIndices.add(dbIndex);
            found = true;
            break;
          }
        }
        
        if (found) {
          matchedFileIndices.push({ index: globalIndex, epicNo: normalizedEpicNo });
          matchedCount++;
        } else {
          unmatchedFileIndices.push({ index: globalIndex, epicNo: normalizedEpicNo });
          unmatchedCount++;
        }
      });
      
      // Log progress every batch
      if ((i + batchSize) % 1000 === 0 || (i + batchSize) >= fileData.length) {
        console.log(`📊 Fast matched ${Math.min(i + batchSize, fileData.length)}/${fileData.length} records`);
      }
    }
    
    console.log(`✅ Fast matching complete: ${matchedCount} matched, ${unmatchedCount} unmatched`);
    console.log(`📥 Loading full records for ${matchedEpicIndices.size} matched EPICs...`);
    
    // Phase 2: Load full records only for matched EPICs (MUCH faster than loading all DB records)
    // Determine which columns to select - always include EPIC_NO for matching
    let columnsToSelect = '*';
    
    if (selectedColumns && selectedColumns.length > 0) {
      const [dbColumns] = await conn.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = '${DB_NAME}' 
        AND TABLE_NAME = ?
      `, [tableName]);
      
      const validDbColumns = dbColumns.map(col => col.COLUMN_NAME);
      const validSelectedColumns = selectedColumns.filter(col => validDbColumns.includes(col));
      
      if (validSelectedColumns.length > 0) {
        // Ensure EPIC_NO is part of the selection for downstream lookups
        const includesEpic = validSelectedColumns.includes('EPIC_NO');
        const columnList = validSelectedColumns.map(col => `\`${col}\``).join(', ');
        columnsToSelect = includesEpic ? columnList : `\`EPIC_NO\`, ${columnList}`;
      }
    }
    
    // Build optimized query: only load records for matched EPICs
    // Extract actual EPIC_NO values from dbEpicData using matched indices
    const matchedEpicNos = Array.from(matchedEpicIndices).map(idx => dbEpicData[idx].EPIC_NO).filter(Boolean);
    let dbRecordMap = new Map();
    
    if (matchedEpicNos.length > 0) {
      // Create WHERE IN clause with placeholders (handle large arrays by chunking)
      const chunkSize = 1000;
      for (let i = 0; i < matchedEpicNos.length; i += chunkSize) {
        const chunk = matchedEpicNos.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');
        // columnsToSelect is now properly formatted (either * or explicit column list)
        const query = `SELECT ${columnsToSelect} FROM \`${tableName}\` WHERE EPIC_NO IN (${placeholders})`;
        const [dbChunkData] = await conn.query(query, chunk);
        
        dbChunkData.forEach(record => {
          if (record.EPIC_NO) {
            const variations = getEpicVariations(record.EPIC_NO);
            variations.forEach(variation => {
              if (variation && !dbRecordMap.has(variation)) {
                dbRecordMap.set(variation, record);
              }
            });
          }
        });
      }
    }
    
    await conn.end();
    console.log(`✅ Loaded ${dbRecordMap.size / 3} full records (estimated)`); // Divide by 3 for variations
    
    // Phase 3: Build final matched/unmatched records with full data
    const matchedRecords = [];
    const unmatchedRecords = [];
    
    matchedFileIndices.forEach(({ index, epicNo }) => {
      const fileRecord = fileData[index];
      const dbRecord = findRecordInMap(dbRecordMap, epicNo);
      
      matchedRecords.push({
        index: index + 1,
        epic_no: epicNo,
        file_data: fileRecord,
        db_data: dbRecord || null,
        matched: !!dbRecord
      });
    });
    
    unmatchedFileIndices.forEach(({ index, epicNo }) => {
      const fileRecord = fileData[index];
      
      unmatchedRecords.push({
        index: index + 1,
        epic_no: epicNo,
        file_data: fileRecord,
        db_data: null,
        matched: false
      });
    });
    
    const matchRate = ((matchedCount / fileData.length) * 100).toFixed(2);
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Matching completed in ${processingTime}s: ${matchedCount} matched, ${unmatchedCount} unmatched (${matchRate}%)`);
    
    // OPTIMIZATION: Cache matched results to disk for export
    const cacheFilePath = path.join(UPLOADS_DIR, `match-cache-${Date.now()}-${path.basename(filePath, path.extname(filePath))}.json`);
    const cacheData = {
      filePath,
      tableName,
      epicColumn,
      matched: matchedRecords,
      unmatched: unmatchedRecords,
      stats: {
        total: fileData.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        matchRate
      },
      timestamp: Date.now()
    };
    
    fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2));
    console.log(`💾 Cached match results to ${cacheFilePath}`);
    
    // OPTIMIZATION: Return limited records for display (first 100 matched/unmatched)
    // Full data is cached for export
    const responseData = {
      matched: matchedRecords.slice(0, 100), // Limit returned records
      unmatched: unmatchedRecords.slice(0, 100), // Limit returned records
      stats: {
        total: fileData.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        matchRate
      },
      cacheFilePath, // Include cache file path for export
      hasMoreRecords: fileData.length > 100
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error matching data:', error);
    res.status(500).json({ error: 'Failed to match data: ' + error.message });
  }
});

// Search parabhag data by assembly number and part number
app.post('/api/parabhag-search', async (req, res) => {
  try {
    const { tableName, assemblyNo, partNumbers } = req.body;
    
    if (!tableName || !assemblyNo || !partNumbers || !Array.isArray(partNumbers) || partNumbers.length === 0) {
      return res.status(400).json({ error: 'Missing required parameters: tableName, assemblyNo, and partNumbers array' });
    }

    console.log(`🔍 Searching parabhag data in ${tableName} for AC_NO: ${assemblyNo}, PART_NOs: ${partNumbers.join(', ')}`);

    const conn = await createConnection();
    
    // Create placeholders for the IN clause
    const placeholders = partNumbers.map(() => '?').join(',');
    
    // Search for records matching the criteria
    const query = `
      SELECT * FROM \`${tableName}\` 
      WHERE AC_NO = ? AND PART_NO IN (${placeholders})
      ORDER BY PART_NO, EPIC_NO
    `;
    
    const [rows] = await conn.query(query, [assemblyNo, ...partNumbers]);
    await conn.end();

    console.log(`✅ Found ${rows.length} records`);

    // Format records with index
    const records = rows.map((row, index) => ({
      index: index + 1,
      data: row
    }));

    res.json({
      success: true,
      records: records,
      total: records.length,
      tableName: tableName,
      assemblyNo: assemblyNo,
      partNumbers: partNumbers
    });

  } catch (error) {
    console.error('Error searching parabhag data:', error);
    res.status(500).json({ error: 'Failed to search parabhag data' });
  }
});

// Export parabhag data to Excel
app.post('/api/export-parabhag', async (req, res) => {
  try {
    const { tableName, assemblyNo, partNumbers, prabhagNumber, filename } = req.body;
    
    if (!tableName || !assemblyNo || !partNumbers || !Array.isArray(partNumbers) || partNumbers.length === 0 || !prabhagNumber) {
      return res.status(400).json({ error: 'Missing required parameters: tableName, assemblyNo, partNumbers array, and prabhagNumber' });
    }

    console.log(`📤 Exporting parabhag data to Excel for ${tableName}, AC_NO: ${assemblyNo}, PART_NOs: ${partNumbers.join(', ')}, Prabhag: ${prabhagNumber}`);

    const conn = await createConnection();
    
    // Create placeholders for the IN clause
    const placeholders = partNumbers.map(() => '?').join(',');
    
    // Fetch data directly from database instead of using request body
    const query = `
      SELECT * FROM \`${tableName}\` 
      WHERE AC_NO = ? AND PART_NO IN (${placeholders})
      ORDER BY PART_NO, EPIC_NO
    `;
    
    const [rows] = await conn.query(query, [assemblyNo, ...partNumbers]);
    await conn.end();

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No records found to export' });
    }

    console.log(`📊 Found ${rows.length} records for export`);

    // Custom headers for parabhag export (same as getFinalExcel)
    const headers = [
      'PRABHAG_NO', 'EPIC_NO', 'ADDRESS', 'ADDRESS_V1', 'PART_NUMBER', 'NAME_EN', 'NAME_V1', 
      'RLN_TYPE', 'RLN_NAME_EN', 'RLN_NAME_V1', 'DOB', 'MOB', 'GENDER'
    ];
    
    // Create Excel workbook
    const workbook = XLSX.utils.book_new();
    
    // Helper function to clean text by removing extra spaces
    const cleanText = (text) => {
      if (!text) return '';
      return text.toString().replace(/\s+/g, ' ').trim();
    };

    // Helper to derive gender from possible DB columns
    const getGenderFromRow = (row) => {
      const possibleKeys = ['GENDER', 'SEX', 'GENDER_EN', 'GENDER_V1', 'GEN', 'GEND'];
      for (const key of possibleKeys) {
        if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== '') {
          return cleanText(row[key]);
        }
      }
      return '';
    };

    // Prepare data for Excel with custom column mapping
    const excelData = [
      headers, // Header row
      ...rows.map(row => headers.map(header => {
        switch (header) {
          case 'PRABHAG_NO':
            return cleanText(prabhagNumber);
          case 'EPIC_NO':
            return cleanText(row.EPIC_NO || '');
          case 'ADDRESS':
            return cleanText(row.adr1 || '');
          case 'ADDRESS_V1':
            return cleanText(row.adr2 || '');
          case 'PART_NUMBER':
            return cleanText(row.PART_NO || '');
          case 'NAME_EN':
            return cleanText(`${row.LASTNAME_EN || ''} ${row.FM_NAME_EN || ''}`);
          case 'NAME_V1':
            return cleanText(`${row.LASTNAME_V1 || ''} ${row.FM_NAME_V1 || ''}`);
          case 'RLN_TYPE':
            return cleanText(row.RLN_TYPE || '');
          case 'RLN_NAME_EN':
            return cleanText(`${row.RLN_L_NM_EN || ''} ${row.RLN_FM_NM_EN || ''}`);
          case 'RLN_NAME_V1':
            return cleanText(`${row.RLN_L_NM_V1 || ''} ${row.RLN_FM_NM_V1 || ''}`);
          case 'DOB':
            return cleanText(row.DOB || '');
          case 'MOB':
            return cleanText(row.MOB || '');
          case 'GENDER':
            return getGenderFromRow(row);
          default:
            return '';
        }
      }))
    ];
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Parabhag Data');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'parabhag-data.xlsx'}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send Excel file
    res.send(excelBuffer);
    
    console.log(`✅ Excel file exported successfully: ${filename}`);

  } catch (error) {
    console.error('Error exporting parabhag Excel:', error);
    res.status(500).json({ error: 'Failed to export Excel file' });
  }
});

// Export matched data to Excel with custom column mapping (OPTIMIZED - uses cached data)
app.post('/api/export-excel', async (req, res) => {
  try {
    const {
      filePath,
      tableName,
      epicColumn,
      prabhagNumber = '',
      filename,
      cacheFilePath
    } = req.body;
    
    const prabhagNumberTrimmed = typeof prabhagNumber === 'string' ? prabhagNumber.trim() : '';
    
    console.log(`📤 Starting optimized Excel export for ${tableName} with EPIC column: ${epicColumn}${prabhagNumberTrimmed ? `, Prabhag: ${prabhagNumberTrimmed}` : ''}`);
    
    if (!filePath || !tableName || !epicColumn) {
      return res.status(400).json({ error: 'Missing required parameters for export (filePath, tableName, epicColumn)' });
    }

    const startTime = Date.now();
    let matchedRecords = [];
    let unmatchedRecords = [];
    
    // OPTIMIZATION: Try to use cached match results first
    if (cacheFilePath && fs.existsSync(cacheFilePath)) {
      console.log(`💾 Loading cached match results from ${cacheFilePath}`);
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      matchedRecords = cacheData.matched || [];
      unmatchedRecords = cacheData.unmatched || [];
      console.log(`✅ Loaded ${matchedRecords.length} matched and ${unmatchedRecords.length} unmatched records from cache`);
    } else {
      // Fallback: re-match if cache not available (legacy support)
      console.log(`⚠️ No cache file provided, falling back to re-matching (slower)`);
      const fileData = await parseFile(filePath);
      
      const conn = await createConnection();
      const [dbData] = await conn.query(`
        SELECT EPIC_NO, LASTNAME_EN, FM_NAME_EN, FM_NAME_V1, LASTNAME_V1, 
               RLN_TYPE, RLN_L_NM_EN, RLN_FM_NM_EN, RLN_L_NM_V1, RLN_FM_NM_V1,
               AGE, DOB, MOB, GENDER
        FROM \`${tableName}\`
      `);
      await conn.end();
      
      const dbMap = new Map();
      dbData.forEach(record => {
        if (record.EPIC_NO) {
          const variations = getEpicVariations(record.EPIC_NO);
          variations.forEach(variation => {
            if (variation && !dbMap.has(variation)) {
              dbMap.set(variation, record);
            }
          });
        }
      });
      
      // Quick match
      fileData.forEach((fileRecord, i) => {
        const epicNo = fileRecord[epicColumn];
        const dbRecord = findRecordInMap(dbMap, epicNo);
        const record = {
          index: i + 1,
          epic_no: epicNo ? String(epicNo).trim() : null,
          file_data: fileRecord,
          db_data: dbRecord,
          matched: !!dbRecord
        };
        if (dbRecord) {
          matchedRecords.push(record);
        } else {
          unmatchedRecords.push(record);
        }
      });
    }
    
    // Combine all records for processing
    const allRecords = [...matchedRecords, ...unmatchedRecords].sort((a, b) => a.index - b.index);
    
    // Define custom headers
    const headers = [
      'SERIAL_NO',
      'DUPLICATE',  // Indicator column for duplicates
      'PRABHAG_NO',
      'PRABHAG_NO_EN',
      'PRABHAG_HEADER',
      'PRABHAG_HEADER_EN',
      'YADI_BHAG',
      'YADI_BHAG_EN',
      'MATDAR_KENDRA',
      'MATDAR_KENDRA_EN',
      'BOOTH_ADDRESS',
      'BOOTH_ADDRESS_EN',
      'GAN',
      'GAN_EN',
      'EPIC_NO',
      'ADDRESS',
      'ADDRESS_EN',
      'ADDRESS_V1',
      'ADDRESS_V1_EN',
      'PART_NUMBER',
      'NAME_EN',
      'NAME_V1',
      'NAME_V1_EN',
      'RLN_TYPE',
      'RLN_NAME_EN',
      'RLN_NAME_V1',
      'RLN_NAME_V1_EN',
      'AGE',
      'DOB',
      'MOB',
      'GENDER'
    ];
    
    console.log(`📊 Preparing ${allRecords.length} records for Excel export...`);
    
    // Helper function to find column by partial name match
    const findColumn = (fileRecord, partialNames) => {
      if (!fileRecord) return '';
      const recordKeys = Object.keys(fileRecord);
      for (const partial of partialNames) {
        const found = recordKeys.find(key => 
          key.toLowerCase().includes(partial.toLowerCase())
        );
        if (found) return fileRecord[found];
      }
      return '';
    };

    // Helper function to clean text
    const cleanText = (text) => {
      if (!text) return '';
      return text.toString().replace(/\s+/g, ' ').trim();
    };

    // OPTIMIZATION: Process in batches to generate Excel data more efficiently
    const excelData = [];
    const batchSize = 1000;
    let matchedCount = 0;
    let unmatchedCount = 0;

    const translationFields = [
      ['PRABHAG_NO', 'PRABHAG_NO_EN'],
      ['PRABHAG_HEADER', 'PRABHAG_HEADER_EN'],
      ['YADI_BHAG', 'YADI_BHAG_EN'],
      ['MATDAR_KENDRA', 'MATDAR_KENDRA_EN'],
      ['BOOTH_ADDRESS', 'BOOTH_ADDRESS_EN'],
      ['GAN', 'GAN_EN'],
      ['ADDRESS', 'ADDRESS_EN'],
      ['ADDRESS_V1', 'ADDRESS_V1_EN'],
      ['NAME_V1', 'NAME_V1_EN'],
      ['RLN_NAME_V1', 'RLN_NAME_V1_EN']
    ];

    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      
      batch.forEach((record) => {
        const fileRecord = record.file_data || {};
        const dbRecord = record.db_data;
        const row = {};
        
        if (dbRecord && record.matched) {
          // Matched record
          row.SERIAL_NO = cleanText(findColumn(fileRecord, ['serial', 'serial_no', 'serialno', 'sr_no', 'srno', 'sno', 'sl_no', 'slno']) || record.index);
          const headerPrabhag = cleanText(findColumn(fileRecord, ['prabhag', 'प्रभाग']));
          const headerYadi = cleanText(findColumn(fileRecord, ['yadi_bhag', 'yadi', 'भाग']));
          const headerMatdan = cleanText(findColumn(fileRecord, ['matdar', 'मतदान', 'केंद्र']));
          const headerGan = cleanText(findColumn(fileRecord, ['gan', 'GAN', 'Gan']));
          row.PRABHAG_NO = cleanText(prabhagNumberTrimmed) || headerPrabhag;
          row.PRABHAG_HEADER = headerPrabhag;
          row.YADI_BHAG = headerYadi;
          row.MATDAR_KENDRA = headerMatdan;
          row.BOOTH_ADDRESS = cleanText(findColumn(fileRecord, ['booth', 'booth_address', 'boothaddress', 'मतदान', 'केंद्र']));
          row.GAN = headerGan;
          row.EPIC_NO = cleanText(record.epic_no || '');
          row.ADDRESS = cleanText(findColumn(fileRecord, ['address', 'addr', 'location', 'place']));
          row.ADDRESS_V1 = cleanText(findColumn(fileRecord, ['address_v1', 'addressv1', 'address_v', 'addr_v1']));
          row.PART_NUMBER = cleanText(findColumn(fileRecord, ['part_number', 'partnumber', 'part_no', 'partno', 'part']));
          row.NAME_EN = cleanText(`${dbRecord.LASTNAME_EN || ''} ${dbRecord.FM_NAME_EN || ''}`);
          row.NAME_V1 = cleanText(`${dbRecord.FM_NAME_V1 || ''} ${dbRecord.LASTNAME_V1 || ''}`);
          row.RLN_TYPE = cleanText(dbRecord.RLN_TYPE || '');
          row.RLN_NAME_EN = cleanText(`${dbRecord.RLN_L_NM_EN || ''} ${dbRecord.RLN_FM_NM_EN || ''}`);
          row.RLN_NAME_V1 = cleanText(`${dbRecord.RLN_L_NM_V1 || ''} ${dbRecord.RLN_FM_NM_V1 || ''}`);
          const excelAge = cleanText(findColumn(fileRecord, ['age', 'AGE', 'Age', 'aage', 'umr']));
          row.AGE = excelAge || cleanText(dbRecord.AGE || '');
          row.DOB = cleanText(dbRecord.DOB || '');
          row.MOB = cleanText(dbRecord.MOB || '');
          row.GENDER = cleanText(dbRecord.GENDER || '');
          matchedCount++;
        } else {
          // Unmatched record
          row.SERIAL_NO = cleanText(findColumn(fileRecord, ['serial', 'serial_no', 'serialno', 'sr_no', 'srno', 'sno', 'sl_no', 'slno']) || record.index);
          const headerPrabhag = cleanText(findColumn(fileRecord, ['prabhag', 'प्रभाग']));
          const headerYadi = cleanText(findColumn(fileRecord, ['yadi_bhag', 'yadi', 'भाग']));
          const headerMatdan = cleanText(findColumn(fileRecord, ['matdar', 'मतदान', 'केंद्र']));
          const headerGan = cleanText(findColumn(fileRecord, ['gan', 'GAN', 'Gan']));
          row.PRABHAG_NO = cleanText(prabhagNumberTrimmed) || headerPrabhag;
          row.PRABHAG_HEADER = headerPrabhag;
          row.YADI_BHAG = headerYadi;
          row.MATDAR_KENDRA = headerMatdan;
          row.BOOTH_ADDRESS = cleanText(findColumn(fileRecord, ['booth', 'booth_address', 'boothaddress', 'मतदान', 'केंद्र']));
          row.GAN = headerGan;
          row.EPIC_NO = cleanText(record.epic_no || '');
          row.ADDRESS = cleanText(findColumn(fileRecord, ['address', 'addr', 'location', 'place']));
          row.ADDRESS_V1 = cleanText(findColumn(fileRecord, ['address_v1', 'addressv1', 'address_v', 'addr_v1']));
          row.PART_NUMBER = cleanText(findColumn(fileRecord, ['part_number', 'partnumber', 'part_no', 'partno', 'part']));
          row.NAME_EN = cleanText(findColumn(fileRecord, ['name_en', 'nameen', 'name_english', 'english_name']));
          row.NAME_V1 = cleanText(findColumn(fileRecord, ['name_v1', 'namev1', 'name_marathi', 'marathi_name']));
          row.RLN_TYPE = cleanText(findColumn(fileRecord, ['rln_type', 'relation_type', 'relation']));
          row.RLN_NAME_EN = cleanText(findColumn(fileRecord, ['rln_name_en', 'relation_name_en', 'father_name_en', 'husband_name_en']));
          row.RLN_NAME_V1 = cleanText(findColumn(fileRecord, ['rln_name_v1', 'relation_name_v1', 'father_name_v1', 'husband_name_v1']));
          row.AGE = cleanText(findColumn(fileRecord, ['age', 'AGE', 'Age', 'aage', 'umr']));
          row.DOB = '';
          row.MOB = '';
          row.GENDER = cleanText(findColumn(fileRecord, ['gender', 'GENDER', 'sex']));
          unmatchedCount++;
        }
        
        translationFields.forEach(([sourceKey, targetKey]) => {
          const value = row[sourceKey];
          row[targetKey] = value ? transliterateText(value) : '';
        });

        if (!row.NAME_EN) {
          row.NAME_EN = row.NAME_V1_EN || '';
        }
        if (!row.RLN_NAME_EN) {
          row.RLN_NAME_EN = row.RLN_NAME_V1_EN || '';
        }

        excelData.push(row);
      });
      
      // Log progress
      if ((i + batchSize) % 1000 === 0 || (i + batchSize) >= allRecords.length) {
        console.log(`📊 Processed ${Math.min(i + batchSize, allRecords.length)}/${allRecords.length} records for Excel`);
      }
    }
    
    // Detect duplicates and add DUPLICATE column
    const serialCounts = new Map();
    excelData.forEach(row => {
      const serial = String(row.SERIAL_NO || '').trim();
      serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1);
    });
    
    const duplicateSerials = new Set();
    serialCounts.forEach((count, serial) => {
      if (count > 1) {
        duplicateSerials.add(serial);
      }
    });
    
    // Add DUPLICATE indicator to each row
    excelData.forEach(row => {
      const serial = String(row.SERIAL_NO || '').trim();
      row.DUPLICATE = duplicateSerials.has(serial) ? 'DUPLICATE' : '';
    });
    
    // Create Excel workbook
    console.log(`📝 Creating Excel workbook with ${excelData.length} rows...`);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData, { header: headers });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Matched Data');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'prabhag-matched-data.xlsx'}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send Excel file
    res.send(excelBuffer);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Excel export completed in ${processingTime}s: ${filename} (${matchedCount} matched, ${unmatchedCount} unmatched)`);

  } catch (error) {
    console.error('Error exporting Excel:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export Excel file: ' + error.message });
    }
  }
});

// Export matched data to CSV with custom column mapping
app.post('/api/export-csv', async (req, res) => {
  try {
    const { filePath, tableName, epicColumn, filename } = req.body;
    
    console.log(`📤 Starting custom CSV export for ${tableName} with EPIC column: ${epicColumn}`);
    
    if (!filePath || !tableName || !epicColumn) {
      return res.status(400).json({ error: 'Missing required parameters for export' });
    }

    // Re-parse the file and re-match data for export
    const fileData = await parseFile(filePath);
    
    // Get database data with specific columns needed for custom mapping
    const conn = await createConnection();
    
    const [dbData] = await conn.query(`
      SELECT EPIC_NO, LASTNAME_EN, FM_NAME_EN, FM_NAME_V1, LASTNAME_V1, 
             RLN_TYPE, RLN_L_NM_EN, RLN_FM_NM_EN, RLN_L_NM_V1, RLN_FM_NM_V1,
             AGE, DOB, MOB, GENDER
      FROM \`${tableName}\`
    `);
    await conn.end();
    
    // Create lookup map for database records
    const dbMap = new Map();
    dbData.forEach(record => {
      if (record.EPIC_NO) {
        const epicNo = String(record.EPIC_NO).trim();
        const variations = [
          epicNo,
          epicNo.replace(/^0+/, ''),
          epicNo.padStart(10, '0'),
          epicNo.replace(/\s+/g, ''),
        ];
        
        variations.forEach(variation => {
          if (variation && !dbMap.has(variation)) {
            dbMap.set(variation, record);
          }
        });
      }
    });
    
    // Define custom headers based on your requirements
    const headers = [
      'GAN', 'EPIC_NO', 'ADDRESS', 'ADDRESS_V1', 'PART_NUMBER', 'NAME_EN', 'NAME_V1', 
      'RLN_TYPE', 'RLN_NAME_EN', 'RLN_NAME_V1', 'AGE', 'DOB', 'MOB', 'GENDER'
    ];
    
    console.log(`📊 Exporting ${fileData.length} records with custom column mapping`);
    
    // Set response headers for streaming CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'custom-matched-data.csv'}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream CSV header
    res.write(headers.join(',') + '\n');
    
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    // Process and stream each record with custom mapping
    for (let i = 0; i < fileData.length; i++) {
      const fileRecord = fileData[i];
      const epicNo = fileRecord[epicColumn];
      const normalizedEpicNo = epicNo ? String(epicNo).trim() : null;
      
      // Find matching database record
      let dbRecord = normalizedEpicNo ? dbMap.get(normalizedEpicNo) : null;
      if (!dbRecord && normalizedEpicNo) {
        const variations = [
          normalizedEpicNo,
          normalizedEpicNo.replace(/^0+/, ''),
          normalizedEpicNo.padStart(10, '0'),
          normalizedEpicNo.replace(/\s+/g, ''),
        ];
        
        for (const variation of variations) {
          if (dbMap.has(variation)) {
            dbRecord = dbMap.get(variation);
            break;
          }
        }
      }
      
      // Helper function to find column by partial name match
      const findColumn = (fileRecord, partialNames) => {
        const recordKeys = Object.keys(fileRecord);
        for (const partial of partialNames) {
          const found = recordKeys.find(key => 
            key.toLowerCase().includes(partial.toLowerCase())
          );
          if (found) return fileRecord[found];
        }
        return '';
      };

      // Helper function to clean text by removing extra spaces
      const cleanText = (text) => {
        if (!text) return '';
        return text.toString().replace(/\s+/g, ' ').trim();
      };

      // Create custom mapped row
      const row = headers.map(header => {
        let value = '';
        
        if (dbRecord) {
          // Matched record - use custom mapping
          switch (header) {
            case 'GAN':
              value = cleanText(findColumn(fileRecord, ['gan', 'GAN', 'Gan']));
              break;
            case 'EPIC_NO':
              value = cleanText(fileRecord[epicColumn] || '');
              break;
            case 'ADDRESS':
              value = cleanText(findColumn(fileRecord, ['address', 'addr', 'location', 'place']));
              break;
            case 'ADDRESS_V1':
              value = cleanText(findColumn(fileRecord, ['address_v1', 'addressv1', 'address_v', 'addr_v1']));
              break;
            case 'PART_NUMBER':
              value = cleanText(findColumn(fileRecord, ['part_number', 'partnumber', 'part_no', 'partno', 'part']));
              break;
            case 'NAME_EN':
              value = cleanText(`${dbRecord.LASTNAME_EN || ''} ${dbRecord.FM_NAME_EN || ''}`);
              break;
            case 'NAME_V1':
              value = cleanText(`${dbRecord.FM_NAME_V1 || ''} ${dbRecord.LASTNAME_V1 || ''}`);
              break;
            case 'RLN_TYPE':
              value = cleanText(dbRecord.RLN_TYPE || '');
              break;
            case 'RLN_NAME_EN':
              value = cleanText(`${dbRecord.RLN_L_NM_EN || ''} ${dbRecord.RLN_FM_NM_EN || ''}`);
              break;
            case 'RLN_NAME_V1':
              value = cleanText(`${dbRecord.RLN_L_NM_V1 || ''} ${dbRecord.RLN_FM_NM_V1 || ''}`);
              break;
            case 'AGE':
              // For matched records: use age from Excel first, then fall back to database
              const excelAge = cleanText(findColumn(fileRecord, ['age', 'AGE', 'Age', 'aage', 'umr']));
              value = excelAge || cleanText(dbRecord.AGE || '');
              break;
            case 'DOB':
              value = cleanText(dbRecord.DOB || '');
              break;
            case 'MOB':
              value = cleanText(dbRecord.MOB || '');
              break;
            case 'GENDER':
              value = cleanText(dbRecord.GENDER || '');
              break;
            default:
              value = '';
          }
          matchedCount++;
        } else {
          // Unmatched record - use Excel data with nulls for missing fields
          switch (header) {
            case 'GAN':
              value = cleanText(findColumn(fileRecord, ['gan', 'GAN', 'Gan']));
              break;
            case 'EPIC_NO':
              value = cleanText(fileRecord[epicColumn] || '');
              break;
            case 'ADDRESS':
              value = cleanText(findColumn(fileRecord, ['address', 'addr', 'location', 'place']));
              break;
            case 'ADDRESS_V1':
              value = cleanText(findColumn(fileRecord, ['address_v1', 'addressv1', 'address_v', 'addr_v1']));
              break;
            case 'PART_NUMBER':
              value = cleanText(findColumn(fileRecord, ['part_number', 'partnumber', 'part_no', 'partno', 'part']));
              break;
            case 'NAME_EN':
              value = cleanText(findColumn(fileRecord, ['name_en', 'nameen', 'name_english', 'english_name']));
              break;
            case 'NAME_V1':
              value = cleanText(findColumn(fileRecord, ['name_v1', 'namev1', 'name_marathi', 'marathi_name']));
              break;
            case 'RLN_TYPE':
              value = cleanText(findColumn(fileRecord, ['rln_type', 'relation_type', 'relation']));
              break;
            case 'RLN_NAME_EN':
              value = cleanText(findColumn(fileRecord, ['rln_name_en', 'relation_name_en', 'father_name_en', 'husband_name_en']));
              break;
            case 'RLN_NAME_V1':
              value = cleanText(findColumn(fileRecord, ['rln_name_v1', 'relation_name_v1', 'father_name_v1', 'husband_name_v1']));
              break;
            case 'AGE':
              // For unmatched records: use age from Excel only
              value = cleanText(findColumn(fileRecord, ['age', 'AGE', 'Age', 'aage', 'umr']));
              break;
            case 'DOB':
              value = ''; // Null for unmatched
              break;
            case 'MOB':
              value = ''; // Null for unmatched
              break;
            case 'GENDER':
              value = cleanText(findColumn(fileRecord, ['gender', 'GENDER', 'sex']));
              break;
            default:
              value = '';
          }
          unmatchedCount++;
        }
        
        // Handle null/undefined values
        if (value === null || value === undefined) {
          value = '';
        }
        
        // Convert to string and escape CSV values
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          value = `"${stringValue.replace(/"/g, '""')}"`;
        } else {
          value = stringValue;
        }
        
        return value;
      });
      
      // Stream the row
      res.write(row.join(',') + '\n');
      
      // Send progress every 100 records
      if ((i + 1) % 100 === 0) {
        console.log(`📊 Processed ${i + 1}/${fileData.length} records`);
      }
    }
    
    res.end();
    console.log(`✅ Custom CSV export completed: ${matchedCount} matched, ${unmatchedCount} unmatched records`);
    
  } catch (error) {
    console.error('Error exporting CSV:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export CSV' });
    }
  }
});

// Clean up uploaded files
app.delete('/api/cleanup/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: 'File cleaned up successfully' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error cleaning up file:', error);
    res.status(500).json({ error: 'Failed to clean up file' });
  }
});

// PDF Splitting endpoint
app.post('/api/split-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfPath = req.file.path;
    const pagesPerSplit = parseInt(req.body.pagesPerSplit) || 500;
    const splitDir = path.join(UPLOADS_DIR, 'split-pdfs', Date.now().toString());
    
    // Create directory for split PDFs
    if (!fs.existsSync(splitDir)) {
      fs.mkdirSync(splitDir, { recursive: true });
    }

    // Read the PDF file
    let pdfBytes = fs.readFileSync(pdfPath);
    let workingPdfPath = pdfPath;
    let isEncrypted = false;
    let usedQpdf = false;
    
    // Try to load PDF - handle encryption gracefully
    let pdfDoc;
    try {
      // First try loading normally
      pdfDoc = await PDFDocument.load(pdfBytes);
      console.log('PDF loaded successfully without encryption issues');
    } catch (error) {
      // If it fails due to encryption, try to decrypt with qpdf first
      if (error.message && (error.message.includes('encrypted') || error.message.includes('password') || error.message.includes('Encrypt'))) {
        console.log('PDF appears to have encryption flags, attempting to decrypt with qpdf...');
        isEncrypted = true;
        
        // Try to use qpdf to decrypt the PDF
        try {
          const { stdout, stderr } = await execAsync(`which qpdf`);
          if (stdout && stdout.trim()) {
            const decryptedPath = pdfPath.replace('.pdf', '_decrypted.pdf');
            try {
              await execAsync(`qpdf --decrypt "${pdfPath}" "${decryptedPath}"`);
              console.log('PDF decrypted successfully using qpdf');
              workingPdfPath = decryptedPath;
              pdfBytes = fs.readFileSync(decryptedPath);
              pdfDoc = await PDFDocument.load(pdfBytes);
              usedQpdf = true;
            } catch (qpdfError) {
              console.log('qpdf decryption failed, trying ignoreEncryption option...');
              // Fall back to ignoreEncryption
              pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
              console.log('PDF loaded with ignoreEncryption option (content may be limited)');
            }
          } else {
            throw new Error('qpdf not available');
          }
        } catch (qpdfError) {
          // qpdf not available or failed, try ignoreEncryption
          console.log('qpdf not available, trying ignoreEncryption option...');
          try {
            pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            console.log('PDF loaded with ignoreEncryption option (content may be limited)');
          } catch (encError) {
            throw new Error('Cannot process PDF. Please ensure qpdf is installed for encrypted PDFs, or decrypt the PDF manually first.');
          }
        }
      } else {
        throw error;
      }
    }
    
    const totalPages = pdfDoc.getPageCount();
    
    if (totalPages === 0) {
      throw new Error('PDF appears to have no pages');
    }
    
    console.log(`PDF loaded: ${totalPages} pages detected`);
    
    // Try to verify we can access page content (test with first page)
    try {
      const testPage = pdfDoc.getPage(0);
      const pageSize = testPage.getSize();
      console.log(`Test page size: ${pageSize.width}x${pageSize.height} - Content accessible`);
    } catch (testError) {
      console.warn('Warning: Could not access page content details:', testError.message);
      if (isEncrypted) {
        console.warn('This may indicate that encrypted content cannot be fully accessed');
      }
    }

    console.log(`Splitting PDF: ${req.file.originalname} (${totalPages} pages) into chunks of ${pagesPerSplit}`);

    const splitFiles = [];
    const totalSplits = Math.ceil(totalPages / pagesPerSplit);

    // Split the PDF
    for (let i = 0; i < totalSplits; i++) {
      const startPage = i * pagesPerSplit;
      const endPage = Math.min(startPage + pagesPerSplit, totalPages);
      
      // Create a new PDF document for this split
      const splitDoc = await PDFDocument.create();
      
      // Copy pages from original PDF to split PDF
      const pagesToCopy = [];
      for (let j = startPage; j < endPage; j++) {
        pagesToCopy.push(j);
      }
      
      // Copy pages - this automatically copies all necessary resources (fonts, images, etc.)
      const copiedPages = await splitDoc.copyPages(pdfDoc, pagesToCopy);
      
      // Add copied pages to the split document
      // Note: copyPages returns pages that are already part of the new document
      copiedPages.forEach((page) => {
        splitDoc.addPage(page);
      });
      
      console.log(`Split ${i + 1}/${totalSplits}: Copied pages ${startPage + 1}-${endPage} (${copiedPages.length} pages)`);

      // Save the split PDF with all content preserved
      const splitPdfBytes = await splitDoc.save();
      const splitFileName = `part-${i + 1}-of-${totalSplits}-pages-${startPage + 1}-to-${endPage}.pdf`;
      const splitFilePath = path.join(splitDir, splitFileName);
      
      fs.writeFileSync(splitFilePath, splitPdfBytes);
      
      const relativePath = path.relative(UPLOADS_DIR, splitFilePath).replace(/\\/g, '/');
      splitFiles.push({
        filename: splitFileName,
        path: relativePath,
        pages: endPage - startPage,
        pageRange: `${startPage + 1}-${endPage}`,
        downloadUrl: `/api/download-split-pdf?file=${encodeURIComponent(relativePath)}`
      });
    }

    // Clean up the original uploaded file and decrypted file if created
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    if (usedQpdf && workingPdfPath !== pdfPath && fs.existsSync(workingPdfPath)) {
      fs.unlinkSync(workingPdfPath);
      console.log('Cleaned up decrypted temporary file');
    }

    res.json({
      success: true,
      totalPages,
      totalSplits,
      pagesPerSplit,
      splitFiles,
      splitDir: path.relative(UPLOADS_DIR, splitDir).replace(/\\/g, '/'),
      warning: isEncrypted && !usedQpdf ? 'PDF had encryption flags detected. If pages appear blank, please install qpdf (sudo apt-get install qpdf) for better encryption handling, or decrypt the PDF manually first.' : null
    });

  } catch (error) {
    console.error('Error splitting PDF:', error);
    res.status(500).json({ error: 'Failed to split PDF: ' + error.message });
  }
});

// Save OCR page text to file endpoint
app.post('/api/save-ocr-page-text', async (req, res) => {
  try {
    const { pageNumber, text, filename } = req.body;
    
    if (!pageNumber || text === undefined) {
      return res.status(400).json({ error: 'pageNumber and text are required' });
    }

    const ocrTextDir = path.join(UPLOADS_DIR, 'ocr-texts');
    if (!fs.existsSync(ocrTextDir)) {
      fs.mkdirSync(ocrTextDir, { recursive: true });
    }

    // Create filename: page-001.txt, page-002.txt, etc. or use provided filename
    const pageFilename = filename || `page-${String(pageNumber).padStart(3, '0')}.txt`;
    const filePath = path.join(ocrTextDir, pageFilename);

    // Write text to file
    fs.writeFileSync(filePath, text, 'utf8');

    res.json({
      success: true,
      pageNumber,
      filename: pageFilename,
      path: path.relative(UPLOADS_DIR, filePath).replace(/\\/g, '/'),
      message: `Page ${pageNumber} text saved successfully`
    });

  } catch (error) {
    console.error('Error saving OCR page text:', error);
    res.status(500).json({ error: 'Failed to save OCR text: ' + error.message });
  }
});

// Download split PDF endpoint
app.get('/api/download-split-pdf', (req, res) => {
  try {
    const filePath = req.query.file;
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const fullPath = path.join(UPLOADS_DIR, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileName = path.basename(fullPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Error downloading split PDF:', error);
    res.status(500).json({ error: 'Failed to download file: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});
