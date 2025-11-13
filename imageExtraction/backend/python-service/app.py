from flask import Flask, request, jsonify, send_file
from flask.helpers import send_from_directory
from flask_cors import CORS
import os
import json
import traceback
import logging
import shutil
import threading
import time
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from werkzeug.security import safe_join
from uuid import uuid4
from extractor import extract_grid_vertical
from excel_generator import generate_excel
from task_manager import task_manager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# FIXED: Restrict CORS to localhost only (change for production)
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'http://localhost:5000,http://127.0.0.1:5000').split(',')
CORS(app, origins=ALLOWED_ORIGINS)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
TABLE_IMAGES_FOLDER = 'table_images'
ALLOWED_EXTENSIONS = {'pdf'}

# Create necessary directories
for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, TABLE_IMAGES_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TABLE_IMAGES_FOLDER'] = TABLE_IMAGES_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
# Updated to handle large PDFs up to 500MB
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB

# Store uploaded files and configurations
uploaded_files = {}  # {fileId: {'filepath': path, 'created_at': datetime}}
configurations = {}  # {configId: config}
extraction_results = {}  # {excelId: {'excelPath': path, 'recordsExtracted': count, 'created_at': datetime}}

# File retention period (in hours)
FILE_RETENTION_HOURS = int(os.getenv('FILE_RETENTION_HOURS', '24'))

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_disk_space_mb(path):
    """Get available disk space in MB for the given path"""
    try:
        stat = shutil.disk_usage(path)
        available_mb = stat.free / (1024 * 1024)
        return available_mb
    except Exception as e:
        logger.warning(f"Could not get disk space: {e}")
        return None

def cleanup_old_files(aggressive=False):
    """
    Remove files older than FILE_RETENTION_HOURS
    If aggressive=True, delete ALL files (use when disk is full)
    
    Returns: (files_deleted, space_freed_mb)
    """
    files_deleted = 0
    space_freed = 0
    cutoff_time = datetime.now() - timedelta(hours=FILE_RETENTION_HOURS)
    
    # Clean uploaded files
    for file_id in list(uploaded_files.keys()):
        file_info = uploaded_files[file_id]
        should_delete = aggressive or (file_info.get('created_at', datetime.now()) < cutoff_time)
        
        if should_delete:
            filepath = file_info['filepath']
            try:
                if os.path.exists(filepath):
                    size = os.path.getsize(filepath)
                    os.remove(filepath)
                    space_freed += size
                    files_deleted += 1
                    logger.info(f"Deleted {'all' if aggressive else 'old'} upload: {filepath}")
                del uploaded_files[file_id]
            except Exception as e:
                logger.error(f"Error deleting file {filepath}: {e}")
    
    # Clean extraction results
    for excel_id in list(extraction_results.keys()):
        result_info = extraction_results[excel_id]
        should_delete = aggressive or (result_info.get('created_at', datetime.now()) < cutoff_time)
        
        if should_delete:
            excel_path = result_info['excelPath']
            try:
                if os.path.exists(excel_path):
                    size = os.path.getsize(excel_path)
                    os.remove(excel_path)
                    space_freed += size
                    files_deleted += 1
                    logger.info(f"Deleted {'all' if aggressive else 'old'} output: {excel_path}")
                del extraction_results[excel_id]
            except Exception as e:
                logger.error(f"Error deleting file {excel_path}: {e}")
    
    # Also clean files directly from folders (in case they're orphaned)
    for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER]:
        if os.path.exists(folder):
            try:
                for filename in os.listdir(folder):
                    filepath = os.path.join(folder, filename)
                    if os.path.isfile(filepath):
                        try:
                            file_mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                            should_delete = aggressive or (file_mtime < cutoff_time)
                            
                            if should_delete:
                                size = os.path.getsize(filepath)
                                os.remove(filepath)
                                space_freed += size
                                files_deleted += 1
                                logger.info(f"Deleted {'all' if aggressive else 'old'} file: {filepath}")
                        except Exception as e:
                            logger.warning(f"Could not delete {filepath}: {e}")
            except Exception as e:
                logger.warning(f"Error cleaning folder {folder}: {e}")
    
    space_freed_mb = space_freed / (1024 * 1024)
    logger.info(f"Cleanup complete: {files_deleted} files deleted, {space_freed_mb:.2f} MB freed")
    return files_deleted, space_freed_mb

def validate_grid_config(config):
    """
    Validate grid configuration to prevent crashes
    Returns: (valid, error_message)
    """
    try:
        grid = config.get('grid', {})
        
        # Check required fields
        if not grid:
            return False, "Grid configuration is required"
        
        # Validate grid position and size
        x = grid.get('x', 0)
        y = grid.get('y', 0)
        width = grid.get('width', 0)
        height = grid.get('height', 0)
        rows = grid.get('rows', 1)
        cols = grid.get('columns', 1)
        
        # Bounds checking
        if not (0 <= x <= 10000):
            return False, f"Invalid grid x position: {x} (must be 0-10000)"
        if not (0 <= y <= 10000):
            return False, f"Invalid grid y position: {y} (must be 0-10000)"
        if not (10 <= width <= 10000):
            return False, f"Invalid grid width: {width} (must be 10-10000)"
        if not (10 <= height <= 10000):
            return False, f"Invalid grid height: {height} (must be 10-10000)"
        if not (1 <= rows <= 50):
            return False, f"Invalid rows: {rows} (must be 1-50)"
        if not (1 <= cols <= 20):
            return False, f"Invalid columns: {cols} (must be 1-20)"
        
        # Validate skip settings
        skip_start = config.get('skipPagesStart', 0)
        skip_end = config.get('skipPagesEnd', 0)
        skip_header = config.get('skipHeaderHeight', 0)
        skip_footer = config.get('skipFooterHeight', 0)
        
        if not (0 <= skip_start <= 100):
            return False, f"Invalid skipPagesStart: {skip_start}"
        if not (0 <= skip_end <= 100):
            return False, f"Invalid skipPagesEnd: {skip_end}"
        if not (0 <= skip_header <= 5000):
            return False, f"Invalid skipHeaderHeight: {skip_header}"
        if not (0 <= skip_footer <= 5000):
            return False, f"Invalid skipFooterHeight: {skip_footer}"
        
        return True, ""
    except Exception as e:
        return False, f"Invalid configuration format: {str(e)}"

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    disk_space = get_disk_space_mb(UPLOAD_FOLDER)
    status = {
        'status': 'ok',
        'message': 'Python extraction service running',
        'disk_space_mb': round(disk_space, 2) if disk_space else None
    }
    if disk_space is not None and disk_space < 100:
        status['warning'] = f'Low disk space: {disk_space:.1f} MB available'
    return jsonify(status)

@app.route('/api/cleanup-files', methods=['POST'])
def cleanup_files_endpoint():
    """
    Manually trigger file cleanup
    
    Request (optional):
        - aggressive: true/false (default: false)
            If true, deletes ALL files regardless of age
    
    Response:
        - files_deleted: Number of files deleted
        - space_freed_mb: Space freed in MB
    """
    try:
        data = request.get_json() or {}
        aggressive = data.get('aggressive', False)
        
        files_deleted, space_freed_mb = cleanup_old_files(aggressive=aggressive)
        
        # Get current disk space
        disk_space = get_disk_space_mb(UPLOAD_FOLDER)
        
        return jsonify({
            'success': True,
            'files_deleted': files_deleted,
            'space_freed_mb': round(space_freed_mb, 2),
            'disk_space_mb': round(disk_space, 2) if disk_space else None,
            'message': f'Cleanup completed. {files_deleted} files deleted, {space_freed_mb:.2f} MB freed.'
        })
    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/disk-space', methods=['GET'])
def get_disk_space_endpoint():
    """Get current disk space information"""
    try:
        disk_space = get_disk_space_mb(UPLOAD_FOLDER)
        
        # Count files in uploads and outputs
        upload_count = 0
        upload_size = 0
        output_count = 0
        output_size = 0
        
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                if os.path.isfile(filepath):
                    upload_count += 1
                    upload_size += os.path.getsize(filepath)
        
        if os.path.exists(OUTPUT_FOLDER):
            for filename in os.listdir(OUTPUT_FOLDER):
                filepath = os.path.join(OUTPUT_FOLDER, filename)
                if os.path.isfile(filepath):
                    output_count += 1
                    output_size += os.path.getsize(filepath)
        
        return jsonify({
            'success': True,
            'disk_space_mb': round(disk_space, 2) if disk_space else None,
            'uploads': {
                'count': upload_count,
                'size_mb': round(upload_size / (1024 * 1024), 2)
            },
            'outputs': {
                'count': output_count,
                'size_mb': round(output_size / (1024 * 1024), 2)
            },
            'warning': disk_space is not None and disk_space < 100
        })
    except Exception as e:
        logger.error(f"Disk space check error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    """
    Upload PDF file
    
    Request:
        - file: PDF file
    
    Response:
        - fileId: Unique file identifier
    """
    try:
        # Check disk space first
        disk_space = get_disk_space_mb(UPLOAD_FOLDER)
        if disk_space is not None and disk_space < 100:  # Less than 100MB free
            logger.warning(f"Low disk space: {disk_space:.2f} MB available")
            # Aggressive cleanup - delete ALL files
            files_deleted, space_freed = cleanup_old_files(aggressive=True)
            logger.info(f"Emergency cleanup: {files_deleted} files deleted, {space_freed:.2f} MB freed")
            
            # Check again
            disk_space = get_disk_space_mb(UPLOAD_FOLDER)
            if disk_space is not None and disk_space < 50:  # Still less than 50MB
                return jsonify({
                    'success': False,
                    'error': f'Disk space critically low. Only {disk_space:.1f} MB available. Please free up disk space and try again.',
                    'error_code': 'DISK_FULL'
                }), 507  # 507 Insufficient Storage
        
        # Run normal cleanup on each upload to manage disk space
        cleanup_old_files()
        
        if 'file' not in request.files:
            logger.warning("Upload attempt with no file")
            return jsonify({
                'success': False,
                'error': 'No file provided'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            logger.warning("Upload attempt with empty filename")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        if not allowed_file(file.filename):
            logger.warning(f"Upload attempt with invalid file type: {file.filename}")
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Only PDF files are allowed.'
            }), 400
        
        # Get file size before saving (estimate)
        file.seek(0, os.SEEK_END)
        file_size_estimate = file.tell()
        file.seek(0)  # Reset to beginning
        
        # Check if we have enough space for this file
        if disk_space is not None and disk_space < (file_size_estimate / (1024 * 1024) + 50):
            # Not enough space, try aggressive cleanup
            files_deleted, space_freed = cleanup_old_files(aggressive=True)
            disk_space = get_disk_space_mb(UPLOAD_FOLDER)
            
            if disk_space is not None and disk_space < (file_size_estimate / (1024 * 1024) + 50):
                return jsonify({
                    'success': False,
                    'error': f'Not enough disk space. File size: {file_size_estimate / (1024 * 1024):.1f} MB, Available: {disk_space:.1f} MB. Please free up space and try again.',
                    'error_code': 'INSUFFICIENT_SPACE'
                }), 507
        
        # Generate unique file ID
        file_id = str(uuid4())
        filename = secure_filename(f"{file_id}.pdf")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save file with error handling for disk space
        try:
            file.save(filepath)
            file_size = os.path.getsize(filepath)
        except OSError as e:
            if e.errno == 28:  # No space left on device
                # Try aggressive cleanup one more time
                logger.error("Disk full error during save, attempting emergency cleanup")
                cleanup_old_files(aggressive=True)
                
                # Try saving again
                try:
                    file.seek(0)  # Reset file pointer
                    file.save(filepath)
                    file_size = os.path.getsize(filepath)
                except OSError as e2:
                    if e2.errno == 28:
                        return jsonify({
                            'success': False,
                            'error': 'Disk is full. Please free up disk space and try again. All temporary files have been cleaned.',
                            'error_code': 'DISK_FULL'
                        }), 507
                    else:
                        raise
            else:
                raise
        
        # FIXED: Store file info with timestamp
        uploaded_files[file_id] = {
            'filepath': filepath,
            'created_at': datetime.now(),
            'original_filename': file.filename,
            'size': file_size
        }
        
        logger.info(f"File uploaded: {filename} ({file_size / 1024 / 1024:.2f} MB) by {request.remote_addr}")
        
        return jsonify({
            'success': True,
            'fileId': file_id,
            'message': 'File uploaded successfully'
        })
    
    except OSError as e:
        if e.errno == 28:  # No space left on device
            logger.error("Disk full error during upload", exc_info=True)
            # Try emergency cleanup
            try:
                cleanup_old_files(aggressive=True)
            except:
                pass
            
            return jsonify({
                'success': False,
                'error': 'Disk is full. Please free up disk space and try again. Temporary files have been cleaned.',
                'error_code': 'DISK_FULL'
            }), 507
        else:
            logger.error(f"Upload error: {str(e)}", exc_info=True)
            return jsonify({
                'success': False,
                'error': f'File system error: {str(e)}'
            }), 500
    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        error_msg = str(e)
        if 'No space left' in error_msg or 'disk' in error_msg.lower():
            error_msg = 'Disk is full. Please free up disk space and try again.'
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500

@app.route('/api/configure-extraction', methods=['POST'])
def configure_extraction():
    """
    Configure extraction settings
    
    Request:
        - config: JSON with extraction configuration
    
    Response:
        - configId: Unique configuration identifier
    """
    try:
        config = request.get_json()
        
        if not config:
            logger.warning("Configuration attempt with no data")
            return jsonify({
                'success': False,
                'error': 'No configuration provided'
            }), 400
        
        # FIXED: Validate configuration
        valid, error_msg = validate_grid_config(config)
        if not valid:
            logger.warning(f"Invalid configuration: {error_msg}")
            return jsonify({
                'success': False,
                'error': error_msg
            }), 400
        
        # Generate unique config ID
        config_id = str(uuid4())
        
        # Store configuration
        configurations[config_id] = config
        
        logger.info(f"Configuration stored: {config_id}")
        
        return jsonify({
            'success': True,
            'configId': config_id,
            'message': 'Configuration saved successfully'
        })
    
    except Exception as e:
        logger.error(f"Configuration error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/extract-grid', methods=['POST'])
def extract_grid():
    """
    Extract voter data from PDF using grid configuration (SYNCHRONOUS)
    For small PDFs (<10 pages). Use /api/extract-grid-async for larger files.
    
    Request:
        - configId: Configuration ID
    
    Response:
        - excelId: Unique Excel file identifier
        - recordsExtracted: Number of records extracted
    """
    try:
        data = request.get_json()
        config_id = data.get('configId')
        
        if not config_id:
            return jsonify({
                'success': False,
                'error': 'configId is required'
            }), 400
        
        # Get configuration
        config = configurations.get(config_id)
        if not config:
            return jsonify({
                'success': False,
                'error': 'Configuration not found'
            }), 404
        
        # Get PDF file
        file_id = config.get('fileId')
        if not file_id:
            return jsonify({
                'success': False,
                'error': 'fileId not found in configuration'
            }), 400
        
        # FIXED: Get file info from dictionary
        file_info = uploaded_files.get(file_id)
        if not file_info:
            return jsonify({
                'success': False,
                'error': 'PDF file not found'
            }), 404
        
        pdf_path = file_info['filepath']
        if not os.path.exists(pdf_path):
            return jsonify({
                'success': False,
                'error': 'PDF file not found on disk'
            }), 404
        
        # Read PDF bytes
        with open(pdf_path, 'rb') as f:
            pdf_bytes = f.read()
        
        logger.info(f"Starting extraction with config: {config_id} for file: {file_id}")
        
        # Extract data using grid configuration
        # Enable table-based extraction if field boxes are defined
        cell_template = config.get('cellTemplate', {})
        has_field_boxes = any([
            cell_template.get('nameBox'),
            cell_template.get('relativeNameBox'),
            cell_template.get('houseNumberBox'),
            cell_template.get('ageBox'),
            cell_template.get('genderBox'),
            cell_template.get('yadiBhagBox')
        ])
        
        if has_field_boxes:
            config['useTableBasedExtraction'] = True
            print("Table-based extraction enabled (field boxes detected)")
        
        result = extract_grid_vertical(pdf_bytes, config)
        
        # Handle new format with stats or old format
        if isinstance(result, dict) and 'extracted_data' in result:
            # New format with stats
            extracted_data = result['extracted_data']
            extraction_stats = result.get('stats', {})
            table_images = result.get('table_images', {})
        else:
            # Old format - just a list
            extracted_data = result
            extraction_stats = {
                'records_extracted': len(extracted_data),
                'cells_processed': 0,
                'cells_skipped': 0,
                'extraction_time_seconds': 0
            }
            table_images = {}
        
        logger.info(f"Extraction completed: {len(extracted_data)} records")
        if extraction_stats.get('extraction_time_seconds'):
            logger.info(f"Extraction time: {extraction_stats['extraction_time_seconds']:.2f}s ({extraction_stats.get('extraction_time_minutes', 0):.2f} minutes)")
        if extraction_stats.get('azure_api_calls'):
            logger.info(f"Azure Vision API calls: {extraction_stats['azure_api_calls']}")
        
        # Debug: Verify data before Excel generation
        if extracted_data:
            records_with_table_data = sum(1 for r in extracted_data if any([
                r.get('name', '').strip(),
                r.get('relativeName', '').strip(),
                r.get('age', '').strip()
            ]))
            logger.info(f"Records with table data: {records_with_table_data} out of {len(extracted_data)}")
            
            # Show sample
            sample = extracted_data[0]
            logger.info(f"Sample record before Excel: Name='{sample.get('name', '')[:30]}', Age='{sample.get('age', '')}', Relative='{sample.get('relativeName', '')[:30]}'")
            print(f"\n[APP] Before Excel generation:")
            print(f"  Total records: {len(extracted_data)}")
            print(f"  Records with table data: {records_with_table_data}")
            print(f"  Sample - Name: '{sample.get('name', '')[:40]}', Age: '{sample.get('age', '')}'")
        
        # Generate Excel file
        excel_id = str(uuid4())
        excel_path = os.path.join(app.config['OUTPUT_FOLDER'], f"{excel_id}.xlsx")
        
        # Get include_images option from config (default: True)
        include_images = config.get('includeImages', True)
        
        generate_excel(extracted_data, excel_path, include_images=include_images)
        
        # Store extraction result WITH stats and table images
        extraction_results[excel_id] = {
            'configId': config_id,
            'excelPath': excel_path,
            'recordsExtracted': len(extracted_data),
            'created_at': datetime.now(),
            'stats': extraction_stats,
            'tableImages': table_images
        }
        
        # Delete PDF file after successful extraction
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
                logger.info(f"Deleted PDF file after successful extraction: {pdf_path}")
                # Remove from uploaded_files dictionary
                if file_id in uploaded_files:
                    del uploaded_files[file_id]
        except Exception as e:
            logger.warning(f"Could not delete PDF file {pdf_path}: {e}")
        
        # Delete Excel file after successful extraction (user can download it first via the download endpoint)
        # Note: Excel will be available for download until manually deleted or cleaned up by retention policy
        
        return jsonify({
            'success': True,
            'excelId': excel_id,
            'recordsExtracted': len(extracted_data),
            'extractedData': extracted_data,  # Return for preview
            'stats': extraction_stats,  # Include stats (time, etc.)
            'tableImages': table_images,  # Table image filenames by page number
            'status': 'completed',
            'message': 'Extraction completed successfully'
        })
    
    except Exception as e:
        logger.error(f"Extraction error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Extraction failed'
        }), 500


@app.route('/api/extract-grid-async', methods=['POST'])
def extract_grid_async():
    """
    Extract voter data from PDF using grid configuration (ASYNCHRONOUS)
    Recommended for large PDFs. Returns task ID for status tracking.
    
    Request:
        - configId: Configuration ID
    
    Response:
        - taskId: Task identifier for status polling
    """
    try:
        data = request.get_json()
        config_id = data.get('configId')
        
        if not config_id:
            return jsonify({
                'success': False,
                'error': 'configId is required'
            }), 400
        
        # Get configuration
        config = configurations.get(config_id)
        if not config:
            return jsonify({
                'success': False,
                'error': 'Configuration not found'
            }), 404
        
        # Get PDF file
        file_id = config.get('fileId')
        if not file_id:
            return jsonify({
                'success': False,
                'error': 'fileId not found in configuration'
            }), 400
        
        file_info = uploaded_files.get(file_id)
        if not file_info:
            return jsonify({
                'success': False,
                'error': 'PDF file not found'
            }), 404
        
        pdf_path = file_info['filepath']
        if not os.path.exists(pdf_path):
            return jsonify({
                'success': False,
                'error': 'PDF file not found on disk'
            }), 404
        
        # Generate task ID
        task_id = str(uuid4())
        
        # Submit background task
        def extraction_task():
            try:
                # Read PDF bytes
                with open(pdf_path, 'rb') as f:
                    pdf_bytes = f.read()
                
                logger.info(f"Background extraction started: {task_id}")
                
                # Extract data
                # Enable table-based extraction if field boxes are defined
                cell_template = config.get('cellTemplate', {})
                has_field_boxes = any([
                    cell_template.get('nameBox'),
                    cell_template.get('relativeNameBox'),
                    cell_template.get('houseNumberBox'),
                    cell_template.get('ageBox'),
                    cell_template.get('genderBox')
                ])
                
                if has_field_boxes:
                    config['useTableBasedExtraction'] = True
                    print("Table-based extraction enabled (field boxes detected)")
                
                result = extract_grid_vertical(pdf_bytes, config)
                
                # Handle new format with stats or old format
                if isinstance(result, dict) and 'extracted_data' in result:
                    extracted_data = result['extracted_data']
                else:
                    extracted_data = result
                
                # Generate Excel file
                excel_id = str(uuid4())
                excel_path = os.path.join(app.config['OUTPUT_FOLDER'], f"{excel_id}.xlsx")
                
                # Get include_images option from config (default: True)
                include_images = config.get('includeImages', True)
                
                generate_excel(extracted_data, excel_path, include_images=include_images)
                
                # Store result
                extraction_results[excel_id] = {
                    'configId': config_id,
                    'excelPath': excel_path,
                    'recordsExtracted': len(extracted_data),
                    'created_at': datetime.now()
                }
                
                # Delete PDF file after successful extraction
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)
                        logger.info(f"Deleted PDF file after successful async extraction: {pdf_path}")
                        # Remove from uploaded_files dictionary
                        if file_id in uploaded_files:
                            del uploaded_files[file_id]
                except Exception as e:
                    logger.warning(f"Could not delete PDF file {pdf_path}: {e}")
                
                # Note: Excel file will be cleaned up by retention policy or after download
                
                logger.info(f"Background extraction completed: {task_id}, Excel: {excel_id}")
                
                return {
                    'excelId': excel_id,
                    'recordsExtracted': len(extracted_data)
                }
            
            except Exception as e:
                logger.error(f"Background extraction failed: {task_id} - {str(e)}", exc_info=True)
                raise
        
        # Submit task
        task_manager.submit_task(task_id, 'extraction', extraction_task)
        
        logger.info(f"Async extraction submitted: {task_id} for config: {config_id}")
        
        return jsonify({
            'success': True,
            'taskId': task_id,
            'message': 'Extraction task submitted. Use /api/task-status/<taskId> to check progress.'
        })
    
    except Exception as e:
        logger.error(f"Async extraction submission error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/task-status/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """
    Get status of background task
    
    Response:
        - status: pending/processing/completed/failed
        - progress: 0-100
        - result: Task result (if completed)
    """
    try:
        status = task_manager.get_task_status(task_id)
        
        if not status:
            return jsonify({
                'success': False,
                'error': 'Task not found'
            }), 404
        
        return jsonify({
            'success': True,
            **status
        })
    
    except Exception as e:
        logger.error(f"Task status error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/table-image/<filename>', methods=['GET'])
def get_table_image(filename):
    """
    Serve table image files
    """
    try:
        # Security: only allow PNG files with table_page_ prefix
        if not filename.startswith('table_page_') or not filename.endswith('.png'):
            return jsonify({'success': False, 'error': 'Invalid filename'}), 400
        
        return send_from_directory(
            app.config['TABLE_IMAGES_FOLDER'],
            filename,
            mimetype='image/png'
        )
    except Exception as e:
        logger.error(f"Error serving table image: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/download-excel/<excel_id>', methods=['GET'])
def download_excel(excel_id):
    """
    Download Excel file
    
    Request:
        - excelId: Excel file ID (URL parameter)
    
    Response:
        - Excel file
    """
    try:
        result = extraction_results.get(excel_id)
        if not result:
            return jsonify({
                'success': False,
                'error': 'Excel file not found'
            }), 404
        
        excel_path = result['excelPath']
        if not os.path.exists(excel_path):
            return jsonify({
                'success': False,
                'error': 'Excel file not found on disk'
            }), 404
        
        # Get file size for delay calculation
        file_size = os.path.getsize(excel_path) if os.path.exists(excel_path) else 0
        # Calculate delay based on file size (minimum 5 seconds, add 1 second per 10MB)
        delay_seconds = max(5, 5 + (file_size / (10 * 1024 * 1024)))
        
        # Send file for download
        response = send_file(
            excel_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'voter_data_{excel_id}.xlsx'
        )
        
        # Delete Excel file after download completes successfully
        # Using a delayed thread to ensure the file is fully downloaded by the client
        def delete_excel_after_download():
            # Wait for download to complete (delay based on file size)
            time.sleep(delay_seconds)
            try:
                if os.path.exists(excel_path):
                    os.remove(excel_path)
                    logger.info(f"Deleted Excel file after successful download: {excel_path} (size: {file_size / (1024*1024):.2f} MB)")
                    # Remove from extraction_results dictionary
                    if excel_id in extraction_results:
                        del extraction_results[excel_id]
            except Exception as e:
                logger.warning(f"Could not delete Excel file {excel_path}: {e}")
        
        # Start deletion in background thread
        deletion_thread = threading.Thread(target=delete_excel_after_download)
        deletion_thread.daemon = True
        deletion_thread.start()
        
        return response
    
    except Exception as e:
        logger.error(f"Download error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/detection-results', methods=['GET'])
def get_detection_results():
    """Get detection results for debugging"""
    return jsonify({
        'uploaded_files': list(uploaded_files.keys()),
        'configurations': list(configurations.keys()),
        'extraction_results': list(extraction_results.keys())
    })

@app.route('/test-ocr', methods=['POST'])
def test_ocr():
    """
    Test OCR functionality
    
    Request:
        - image: Image file
    
    Response:
        - success: boolean
        - text: extracted text
    """
    try:
        import pytesseract
        from PIL import Image
        import io
        
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No image provided'
            }), 400
        
        image_file = request.files['image']
        image_bytes = image_file.read()
        image = Image.open(io.BytesIO(image_bytes))
        
        # Test OCR
        text = pytesseract.image_to_string(image, lang='eng+hin')
        
        return jsonify({
            'success': True,
            'text': text,
            'message': 'OCR test successful'
        })
    
    except Exception as e:
        logger.error(f"OCR test error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Serve static files (frontend)
# Calculate path: backend/python-service -> .. -> backend -> .. -> project root -> frontend
FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend'))

@app.route('/')
def index():
    """Serve frontend index.html"""
    return send_from_directory(FRONTEND_PATH, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from frontend directory (with path traversal protection)"""
    try:
        # FIXED: Prevent path traversal attacks
        safe_path = safe_join(FRONTEND_PATH, path)
        if safe_path and os.path.exists(safe_path) and os.path.isfile(safe_path):
            return send_from_directory(FRONTEND_PATH, path)
        # If file not found, serve index.html (for SPA routing)
        return send_from_directory(FRONTEND_PATH, 'index.html')
    except Exception as e:
        logger.warning(f"Attempted access to invalid path: {path}")
        return send_from_directory(FRONTEND_PATH, 'index.html')

if __name__ == '__main__':
    # FIXED: Use environment variable for debug mode (default False for production)
    DEBUG_MODE = os.getenv('DEBUG', 'False').lower() == 'true'
    
    print("""
╔════════════════════════════════════════════════╗
║   Voter Extraction - Python Service (Flask)   ║
╚════════════════════════════════════════════════╝

  Server running on: http://localhost:5000
  Health check: http://localhost:5000/health
  
  Frontend: http://localhost:5000/
  
  API Endpoints:
  - POST /api/upload-pdf
  - POST /api/configure-extraction
  - POST /api/extract-grid
  - GET  /api/download-excel/:excelId
  - POST /test-ocr
  
  Security Settings:
  - Debug Mode: {debug}
  - Max Upload: 500 MB
  - File Retention: {retention}h
  - CORS Origins: {origins}
  
  Ready to process requests!
    """.format(
        debug='ENABLED (development)' if DEBUG_MODE else 'DISABLED (production)',
        retention=FILE_RETENTION_HOURS,
        origins=', '.join(ALLOWED_ORIGINS)
    ))
    
    logger.info(f"Starting server in {'DEBUG' if DEBUG_MODE else 'PRODUCTION'} mode")
    app.run(host='0.0.0.0', port=5000, debug=DEBUG_MODE)
