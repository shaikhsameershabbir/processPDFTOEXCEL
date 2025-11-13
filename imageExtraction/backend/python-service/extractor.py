"""
Enhanced Extractor - Grid-based extraction with local OCR
Uses local Tesseract OCR for high-accuracy extraction
"""

import fitz  # PyMuPDF
import pytesseract
import base64
import io
import os
from PIL import Image
import re
from typing import Dict, List, Optional
import multiprocessing as mp
from functools import partial
import time

# Import advanced modules
try:
    from photo_processor import PhotoProcessor
    PHOTO_PROCESSOR_AVAILABLE = True
except ImportError:
    PHOTO_PROCESSOR_AVAILABLE = False

try:
    from box_detector import BoxDetector
    BOX_DETECTOR_AVAILABLE = True
except ImportError:
    BOX_DETECTOR_AVAILABLE = False

try:
    from smart_detector import SmartDetector
    SMART_DETECTOR_AVAILABLE = True
except ImportError:
    SMART_DETECTOR_AVAILABLE = False

# Import 400 DPI OCR Processor
try:
    from ocr_processor_400dpi import OCRProcessor400DPI
    OCR_400DPI_AVAILABLE = True
except ImportError:
    OCR_400DPI_AVAILABLE = False

# Import table-based extraction modules
try:
    from table_image_generator import TableImageGenerator
    TABLE_GENERATOR_AVAILABLE = True
except ImportError:
    TABLE_GENERATOR_AVAILABLE = False

try:
    from azure_table_recognizer import AzureTableRecognizer
    TABLE_RECOGNIZER_AVAILABLE = True
except ImportError:
    TABLE_RECOGNIZER_AVAILABLE = False

# Try to automatically locate Tesseract on Windows (fallback)
if os.name == 'nt':  # Windows
    possible_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        r'C:\Tesseract-OCR\tesseract.exe',
    ]
    for path in possible_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break

# Initialize processors
photo_processor = PhotoProcessor() if PHOTO_PROCESSOR_AVAILABLE else None
box_detector = BoxDetector() if BOX_DETECTOR_AVAILABLE else None
smart_detector = SmartDetector() if SMART_DETECTOR_AVAILABLE else None
ocr_processor_400dpi = OCRProcessor400DPI() if OCR_400DPI_AVAILABLE else None
table_generator = TableImageGenerator() if TABLE_GENERATOR_AVAILABLE else None
table_recognizer = AzureTableRecognizer() if TABLE_RECOGNIZER_AVAILABLE else None

# Get CPU count for multiprocessing
def get_cpu_count():
    """Get optimal CPU count for multiprocessing"""
    try:
        cpu_count = mp.cpu_count()
        # Use 80% of available CPUs to leave some for system
        optimal_workers = max(1, int(cpu_count * 0.8))
        return optimal_workers
    except:
        return 2  # Fallback to 2 workers

CPU_WORKERS = get_cpu_count()

def process_single_cell_worker(cell_task):
    """
    Worker function to process a single cell in parallel
    This function is called by multiprocessing workers
    
    Args:
        cell_task: Dictionary containing:
            - pdf_bytes: PDF file as bytes
            - page_num: Page number (0-indexed)
            - cell_info: Cell configuration (x, y, width, height, row, col, scale_x, scale_y)
            - config: Full extraction configuration
            - extraction_y_start: Start Y coordinate for extraction area
            - extraction_y_end: End Y coordinate for extraction area
    
    Returns:
        Dictionary with extraction result or None if skipped
    """
    try:
        # Extract task data
        pdf_bytes = cell_task['pdf_bytes']
        page_num = cell_task['page_num']
        cell_info = cell_task['cell_info']
        config = cell_task['config']
        extraction_y_start = cell_task['extraction_y_start']
        extraction_y_end = cell_task['extraction_y_end']
        
        # Reopen PDF in worker (necessary for multiprocessing)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[page_num]
        
        # Extract cell info
        cell_x = cell_info['x']
        cell_y = cell_info['y']
        cell_width_actual = cell_info['width']
        cell_height_actual = cell_info['height']
        row = cell_info['row']
        col = cell_info['col']
        scale_x = cell_info['scale_x']
        scale_y = cell_info['scale_y']
        first_cell_width = cell_info['first_cell_width']
        first_cell_height = cell_info['first_cell_height']
        
        # Skip if cell is in header/footer zone
        if cell_y < extraction_y_start or (cell_y + cell_height_actual) > extraction_y_end:
            doc.close()
            return None
        
        # Get configuration
        cell_template = config.get('cellTemplate', {})
        voter_id_box = cell_template.get('voterIdBox', {})
        photo_box = cell_template.get('photoBox', {})
        serial_number_box = cell_template.get('serialNumberBox', {})
        
        # Initialize processors in worker (they need to be recreated)
        local_ocr_processor = None
        local_photo_processor = None
        local_smart_detector = None
        
        try:
            if OCR_400DPI_AVAILABLE:
                from ocr_processor_400dpi import OCRProcessor400DPI
                local_ocr_processor = OCRProcessor400DPI()
        except:
            pass
        
        try:
            if PHOTO_PROCESSOR_AVAILABLE:
                from photo_processor import PhotoProcessor
                local_photo_processor = PhotoProcessor()
        except:
            pass
        
        try:
            if SMART_DETECTOR_AVAILABLE:
                from smart_detector import SmartDetector
                local_smart_detector = SmartDetector()
        except:
            pass
        
        # === EXTRACT VOTER ID ===
        voter_id_text = ""
        voter_id_confidence = 0.0
        voter_id_method = "none"
        cell_stats = {}
        
        # Strategy 1: Use 400 DPI OCR Processor
        if local_ocr_processor and voter_id_box:
            try:
                scaled_voter_id_x = voter_id_box.get('x', 0) * scale_x
                scaled_voter_id_y = voter_id_box.get('y', 0) * scale_y
                scaled_voter_id_width = voter_id_box.get('width', 200) * scale_x
                scaled_voter_id_height = voter_id_box.get('height', 30) * scale_y
                
                voter_id_rect = fitz.Rect(
                    cell_x + scaled_voter_id_x,
                    cell_y + scaled_voter_id_y,
                    cell_x + scaled_voter_id_x + scaled_voter_id_width,
                    cell_y + scaled_voter_id_y + scaled_voter_id_height
                )
                
                result = local_ocr_processor.extract_voter_id(
                    image=None,
                    pdf_page=page,
                    rect=voter_id_rect
                )
                
                voter_id_text = result.get('voter_id', '')
                voter_id_confidence = result.get('confidence', 0.0)
                voter_id_method = result.get('method', 'unknown')
                
                if voter_id_method == 'tesseract':
                    cell_stats['ocr_400dpi_local'] = 1
            except Exception as e:
                voter_id_text = ""
                voter_id_confidence = 0.0
        
        # Strategy 2: Fallback to legacy method
        elif voter_id_box:
            try:
                scaled_voter_id_x = voter_id_box.get('x', 0) * scale_x
                scaled_voter_id_y = voter_id_box.get('y', 0) * scale_y
                scaled_voter_id_width = voter_id_box.get('width', 200) * scale_x
                scaled_voter_id_height = voter_id_box.get('height', 30) * scale_y
                
                voter_id_rect = fitz.Rect(
                    cell_x + scaled_voter_id_x,
                    cell_y + scaled_voter_id_y,
                    cell_x + scaled_voter_id_x + scaled_voter_id_width,
                    cell_y + scaled_voter_id_y + scaled_voter_id_height
                )
                
                voter_id_pix = page.get_pixmap(clip=voter_id_rect, dpi=300)
                voter_id_img_bytes = voter_id_pix.tobytes("png")
                voter_id_img = Image.open(io.BytesIO(voter_id_img_bytes))
                
                raw_text = pytesseract.image_to_string(
                    voter_id_img,
                    lang='eng+hin',
                    config='--psm 6'
                ).strip()
                
                voter_id_text = clean_voter_id(raw_text)
                voter_id_confidence = 0.5
                cell_stats['tesseract_ocr'] = 1
            except Exception as e:
                voter_id_text = ""
                voter_id_confidence = 0.0
        
        # Strategy 3: Smart Detection
        elif local_smart_detector:
            try:
                cell_rect = fitz.Rect(cell_x, cell_y, cell_x + cell_width_actual, cell_y + cell_height_actual)
                cell_pix = page.get_pixmap(clip=cell_rect, dpi=200)
                cell_img_bytes = cell_pix.tobytes("png")
                cell_img = Image.open(io.BytesIO(cell_img_bytes))
                
                smart_result = local_smart_detector.find_voter_id_in_cell(cell_img)
                if smart_result['found']:
                    voter_id_text = smart_result['voter_id']
                    voter_id_confidence = smart_result['confidence']
                    cell_stats['smart_voter_id_found'] = 1
            except:
                pass
        
        # === EXTRACT PHOTO ===
        photo_base64 = ""
        photo_quality = 0.0
        photo_method = "none"
        
        # Strategy 1: Use 400 DPI OCR Processor
        if local_ocr_processor and photo_box:
            try:
                scaled_photo_x = photo_box.get('x', 0) * scale_x
                scaled_photo_y = photo_box.get('y', 0) * scale_y
                scaled_photo_width = photo_box.get('width', 150) * scale_x
                scaled_photo_height = photo_box.get('height', 180) * scale_y
                
                photo_rect = fitz.Rect(
                    cell_x + scaled_photo_x,
                    cell_y + scaled_photo_y,
                    cell_x + scaled_photo_x + scaled_photo_width,
                    cell_y + scaled_photo_y + scaled_photo_height
                )
                
                result = local_ocr_processor.extract_photo(
                    image=None,
                    pdf_page=page,
                    rect=photo_rect
                )
                
                photo_base64 = result.get('photo_base64', '')
                photo_quality = result.get('confidence', 0.0)
                photo_method = result.get('method', 'unknown')
                
                # Enhance photo if processor available
                if photo_base64 and local_photo_processor:
                    try:
                        img_bytes = base64.b64decode(photo_base64)
                        img = Image.open(io.BytesIO(img_bytes))
                        photo_result = local_photo_processor.process_photo(img, enhance=True, resize=False)
                        photo_base64 = photo_result['base64']
                        photo_quality = photo_result.get('quality_score', photo_quality)
                        cell_stats['photo_enhanced'] = 1
                    except:
                        pass
                
                if photo_base64:
                    cell_stats['photo_400dpi'] = 1
            except:
                photo_base64 = ""
                photo_quality = 0.0
        
        # Strategy 2: Fallback to legacy method
        elif photo_box:
            try:
                scaled_photo_x = photo_box.get('x', 0) * scale_x
                scaled_photo_y = photo_box.get('y', 0) * scale_y
                scaled_photo_width = photo_box.get('width', 150) * scale_x
                scaled_photo_height = photo_box.get('height', 180) * scale_y
                
                photo_rect = fitz.Rect(
                    cell_x + scaled_photo_x,
                    cell_y + scaled_photo_y,
                    cell_x + scaled_photo_x + scaled_photo_width,
                    cell_y + scaled_photo_y + scaled_photo_height
                )
                
                photo_pix = page.get_pixmap(clip=photo_rect, dpi=300)
                photo_bytes_png = photo_pix.tobytes("png")
                photo_img = Image.open(io.BytesIO(photo_bytes_png))
                
                if local_photo_processor:
                    photo_result = local_photo_processor.process_photo(photo_img, enhance=True, resize=False)
                    photo_base64 = photo_result['base64']
                    photo_quality = photo_result.get('quality_score', 0.5)
                    cell_stats['photo_enhanced'] = 1
                else:
                    jpeg_buffer = io.BytesIO()
                    photo_img.convert('RGB').save(jpeg_buffer, format='JPEG', quality=85)
                    jpeg_bytes = jpeg_buffer.getvalue()
                    photo_base64 = base64.b64encode(jpeg_bytes).decode('utf-8')
                    photo_quality = 0.5
            except:
                photo_base64 = ""
                photo_quality = 0.0
        
        # Strategy 3: Smart Detection
        elif local_smart_detector:
            try:
                cell_rect = fitz.Rect(cell_x, cell_y, cell_x + cell_width_actual, cell_y + cell_height_actual)
                cell_pix = page.get_pixmap(clip=cell_rect, dpi=200)
                cell_img_bytes = cell_pix.tobytes("png")
                cell_img = Image.open(io.BytesIO(cell_img_bytes))
                
                smart_result = local_smart_detector.find_photo_in_cell(cell_img)
                if smart_result['found']:
                    photo_base64 = smart_result['photo_base64']
                    photo_quality = smart_result['confidence']
                    cell_stats['smart_photo_found'] = 1
            except:
                pass
        
        # === EXTRACT SERIAL NUMBER ===
        serial_number_text = ""
        serial_number_confidence = 0.0
        
        # Strategy 1: Use 400 DPI OCR Processor
        if local_ocr_processor and serial_number_box:
            try:
                scaled_serial_x = serial_number_box.get('x', 0) * scale_x
                scaled_serial_y = serial_number_box.get('y', 0) * scale_y
                scaled_serial_width = serial_number_box.get('width', 200) * scale_x
                scaled_serial_height = serial_number_box.get('height', 30) * scale_y
                
                serial_rect = fitz.Rect(
                    cell_x + scaled_serial_x,
                    cell_y + scaled_serial_y,
                    cell_x + scaled_serial_x + scaled_serial_width,
                    cell_y + scaled_serial_y + scaled_serial_height
                )
                
                # Extract text using OCR
                serial_pix = page.get_pixmap(clip=serial_rect, dpi=400)
                serial_img_bytes = serial_pix.tobytes("png")
                serial_img = Image.open(io.BytesIO(serial_img_bytes))
                
                # Use PSM 7 (single text line) for better single character/number recognition
                # Whitelist only numbers and letters to reduce misreadings
                raw_serial_text = pytesseract.image_to_string(
                    serial_img,
                    lang='eng',
                    config='--psm 7 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                ).strip()
                
                # Clean serial number (remove extra whitespace, newlines, special characters)
                serial_number_text = ' '.join(raw_serial_text.split()).strip()
                # Fix common OCR errors: A can be misread 4, B can be 8, etc.
                import re
                # Map common misreadings: A->4, B->8, D->0, G->6, O->0, I->1, l->1, S->5, Z->2
                char_replacements = {
                    'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 
                    'I': '1', 'l': '1', 'S': '5', 'Z': '2', '|': ''
                }
                for old_char, new_char in char_replacements.items():
                    serial_number_text = serial_number_text.replace(old_char, new_char)
                
                # Extract only digits (serial numbers should be numeric)
                digits_only = re.sub(r'[^0-9]', '', serial_number_text)
                # If we have digits, use them; otherwise try to fix common single-character misreadings
                if digits_only:
                    serial_number_text = digits_only
                elif len(serial_number_text) == 1:
                    # Single character - try to fix common misreadings
                    char_fixes = {'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 'I': '1', 'l': '1', 'S': '5', 'Z': '2'}
                    if serial_number_text.upper() in char_fixes:
                        serial_number_text = char_fixes[serial_number_text.upper()]
                    else:
                        serial_number_text = serial_number_text.strip()
                else:
                    serial_number_text = serial_number_text.strip()
                serial_number_confidence = 0.7  # Default confidence for serial numbers
                cell_stats['serial_number_extracted'] = 1
            except Exception as e:
                serial_number_text = ""
                serial_number_confidence = 0.0
        
        # Strategy 2: Fallback to standard OCR
        elif serial_number_box:
            try:
                scaled_serial_x = serial_number_box.get('x', 0) * scale_x
                scaled_serial_y = serial_number_box.get('y', 0) * scale_y
                scaled_serial_width = serial_number_box.get('width', 200) * scale_x
                scaled_serial_height = serial_number_box.get('height', 30) * scale_y
                
                serial_rect = fitz.Rect(
                    cell_x + scaled_serial_x,
                    cell_y + scaled_serial_y,
                    cell_x + scaled_serial_x + scaled_serial_width,
                    cell_y + scaled_serial_y + scaled_serial_height
                )
                
                serial_pix = page.get_pixmap(clip=serial_rect, dpi=300)
                serial_img_bytes = serial_pix.tobytes("png")
                serial_img = Image.open(io.BytesIO(serial_img_bytes))
                
                # Use PSM 7 (single text line) for better single character/number recognition
                # Whitelist only numbers and letters to reduce misreadings
                raw_serial_text = pytesseract.image_to_string(
                    serial_img,
                    lang='eng',
                    config='--psm 7 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                ).strip()
                
                # Clean serial number (remove extra whitespace, newlines, special characters)
                serial_number_text = ' '.join(raw_serial_text.split()).strip()
                # Fix common OCR errors: A can be misread 4, B can be 8, etc.
                import re
                # Map common misreadings: A->4, B->8, D->0, G->6, O->0, I->1, l->1, S->5, Z->2
                char_replacements = {
                    'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 
                    'I': '1', 'l': '1', 'S': '5', 'Z': '2', '|': ''
                }
                for old_char, new_char in char_replacements.items():
                    serial_number_text = serial_number_text.replace(old_char, new_char)
                
                # Extract only digits (serial numbers should be numeric)
                digits_only = re.sub(r'[^0-9]', '', serial_number_text)
                # If we have digits, use them; otherwise try to fix common single-character misreadings
                if digits_only:
                    serial_number_text = digits_only
                elif len(serial_number_text) == 1:
                    # Single character - try to fix common misreadings
                    char_fixes = {'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 'I': '1', 'l': '1', 'S': '5', 'Z': '2'}
                    if serial_number_text.upper() in char_fixes:
                        serial_number_text = char_fixes[serial_number_text.upper()]
                    else:
                        serial_number_text = serial_number_text.strip()
                else:
                    serial_number_text = serial_number_text.strip()
                serial_number_confidence = 0.5
                cell_stats['serial_number_extracted'] = 1
            except Exception as e:
                serial_number_text = ""
                serial_number_confidence = 0.0
        
        # Clean voter ID
        if voter_id_text:
            voter_id_text = voter_id_text.rstrip('_').strip()
        
        # Final cleaning of serial number (ensure it's clean before storing)
        if serial_number_text:
            import re
            # Fix common OCR errors: A can be misread 4, B can be 8, etc.
            char_replacements = {
                'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 
                'I': '1', 'l': '1', 'S': '5', 'Z': '2', '|': ''
            }
            for old_char, new_char in char_replacements.items():
                serial_number_text = serial_number_text.replace(old_char, new_char)
            
            # Extract only digits (serial numbers should be numeric)
            digits_only = re.sub(r'[^0-9]', '', serial_number_text)
            # If we have digits, use them; otherwise try to fix common single-character misreadings
            if digits_only:
                serial_number_text = digits_only
            elif len(serial_number_text) == 1:
                # Single character - try to fix common misreadings
                char_fixes = {'A': '4', 'B': '8', 'D': '0', 'G': '6', 'O': '0', 'I': '1', 'l': '1', 'S': '5', 'Z': '2'}
                if serial_number_text.upper() in char_fixes:
                    serial_number_text = char_fixes[serial_number_text.upper()]
                else:
                    serial_number_text = serial_number_text.strip()
            else:
                serial_number_text = serial_number_text.strip()
        
        # Skip logic
        should_skip = False
        if not voter_id_text or voter_id_text.strip() == "":
            should_skip = True
        elif voter_id_text.upper() in ["NO ID", "NOID", "N/A", "NA", "NOT FOUND", "NONE"]:
            should_skip = True
        elif voter_id_confidence <= 0.0 and not photo_base64:
            should_skip = True
        
        if should_skip:
            doc.close()
            return {'skipped': True, 'stats': cell_stats}
        
        # Return result
        result = {
            'page': page_num + 1,
            'column': col + 1,
            'row': row + 1,
            'voterID': voter_id_text,
            'serialNumber': serial_number_text,
            'image_base64': photo_base64,
            'metadata': {
                'voter_id_confidence': voter_id_confidence,
                'serial_number_confidence': serial_number_confidence,
                'photo_quality': photo_quality,
                'enhanced': local_photo_processor is not None
            },
            'stats': cell_stats,
            'skipped': False
        }
        
        doc.close()
        return result
        
    except Exception as e:
        return {'skipped': True, 'error': str(e)}

def extract_grid_vertical_enhanced(pdf_bytes, config):
    """
    Enhanced extraction with local OCR
    
    Uses:
    1. Local Tesseract OCR for text extraction
    2. 400 DPI OCR Processor for high-quality extraction
    3. Photo Processor for enhanced image quality
    4. Box Detector for automatic region detection
    
    Args:
        pdf_bytes: PDF file as bytes
        config: Configuration dictionary
    
    Returns:
        List of dictionaries with extracted data, plus stats
    """
    import time
    
    # Start timing
    start_time = time.time()
    
    # Strategy: Use 400 DPI OCR
    use_400dpi_first = ocr_processor_400dpi is not None
    
    try:
        # Open PDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        
        # Calculate valid page range
        skip_start = config.get('skipPagesStart', 0)
        skip_end = config.get('skipPagesEnd', 0)
        
        start_page = skip_start
        end_page = total_pages - skip_end
        
        # Get configuration
        skip_header = config.get('skipHeaderHeight', 0)
        skip_footer = config.get('skipFooterHeight', 0)
        grid = config.get('grid', {})
        cell_template = config.get('cellTemplate', {})
        
        # Grid parameters
        grid_rows = grid.get('rows', 4)
        grid_cols = grid.get('columns', 3)
        grid_x = grid.get('x', 0)
        grid_y = grid.get('y', 0)
        grid_width = grid.get('width', 1500)
        grid_height = grid.get('height', 2000)
        
        # Get custom positions if available (for non-uniform grids)
        col_positions = grid.get('colPositions')
        row_positions = grid.get('rowPositions')
        
        # Calculate cell dimensions (for uniform grid, will be overridden if custom positions exist)
        cell_width = grid_width / grid_cols
        cell_height = grid_height / grid_rows
        
        # Cell template
        voter_id_box = cell_template.get('voterIdBox', {})
        photo_box = cell_template.get('photoBox', {})
        
        # Get first cell dimensions for scaling
        first_cell_width = cell_width
        first_cell_height = cell_height
        if col_positions and len(col_positions) > 1:
            first_cell_width = col_positions[1] - col_positions[0]
        if row_positions and len(row_positions) > 1:
            first_cell_height = row_positions[1] - row_positions[0]
        
        extracted_data = []
        stats = {
            'photo_enhanced': 0,
            'total_cells': 0,
            'page_renders_cached': 0
        }
        
        # PERFORMANCE OPTIMIZATION: Collect all cell tasks for parallel processing
        cell_tasks = []
        
        # Collect all cell tasks
        for page_num in range(start_page, end_page):
            page = doc[page_num]
            page_height = page.rect.height
            
            # Calculate extraction area (exclude header/footer)
            extraction_y_start = skip_header
            extraction_y_end = page_height - skip_footer
            
            for col in range(grid_cols):
                for row in range(grid_rows):
                    stats['total_cells'] += 1
                    
                    # Calculate cell position using custom positions if available
                    if col_positions and row_positions:
                        cell_x = col_positions[col] if col < len(col_positions) else grid_x + (col * cell_width)
                        cell_y = row_positions[row] if row < len(row_positions) else grid_y + (row * cell_height)
                        
                        # Get actual cell dimensions from custom positions
                        if col + 1 < len(col_positions):
                            cell_width_actual = col_positions[col + 1] - col_positions[col]
                        else:
                            cell_width_actual = grid_x + grid_width - col_positions[col]
                        
                        if row + 1 < len(row_positions):
                            cell_height_actual = row_positions[row + 1] - row_positions[row]
                        else:
                            cell_height_actual = grid_y + grid_height - row_positions[row]
                    else:
                        # Uniform grid
                        cell_x = grid_x + (col * cell_width)
                        cell_y = grid_y + (row * cell_height)
                        cell_width_actual = cell_width
                        cell_height_actual = cell_height
                    
                    # Calculate scaling factors for this cell
                    scale_x = cell_width_actual / first_cell_width
                    scale_y = cell_height_actual / first_cell_height
                    
                    # Create cell task
                    cell_task = {
                        'pdf_bytes': pdf_bytes,
                        'page_num': page_num,
                        'cell_info': {
                            'x': cell_x,
                            'y': cell_y,
                            'width': cell_width_actual,
                            'height': cell_height_actual,
                            'row': row,
                            'col': col,
                            'scale_x': scale_x,
                            'scale_y': scale_y,
                            'first_cell_width': first_cell_width,
                            'first_cell_height': first_cell_height
                        },
                        'config': config,
                        'extraction_y_start': extraction_y_start,
                        'extraction_y_end': extraction_y_end
                    }
                    
                    cell_tasks.append(cell_task)
        
        # Process cells in parallel
        parallel_start_time = time.time()
        parallel_time = 0.0
        
        if CPU_WORKERS > 1 and len(cell_tasks) > 1:
            # Use multiprocessing for parallel processing
            # Windows uses 'spawn' method by default, which works fine
            try:
                with mp.Pool(processes=CPU_WORKERS) as pool:
                    results = pool.map(process_single_cell_worker, cell_tasks)
                parallel_time = time.time() - parallel_start_time
            except Exception as e:
                results = [process_single_cell_worker(task) for task in cell_tasks]
                parallel_time = time.time() - parallel_start_time
        else:
            # Fallback to sequential processing (for debugging or single CPU)
            results = [process_single_cell_worker(task) for task in cell_tasks]
            parallel_time = time.time() - parallel_start_time
        
        # Aggregate results from parallel processing
        for result in results:
            if result is None:
                continue
            
            if result.get('skipped', False):
                stats['cells_skipped'] = stats.get('cells_skipped', 0) + 1
                # Aggregate stats from skipped cells
                cell_stats = result.get('stats', {})
                if 'ocr_400dpi_local' in cell_stats:
                    stats['ocr_400dpi_local'] = stats.get('ocr_400dpi_local', 0) + cell_stats['ocr_400dpi_local']
                if 'tesseract_ocr' in cell_stats:
                    stats['tesseract_ocr'] = stats.get('tesseract_ocr', 0) + cell_stats['tesseract_ocr']
                continue
            
            # Add valid result
            extracted_data.append({
                'page': result['page'],
                'column': result['column'],
                'row': result['row'],
                'voterID': result['voterID'],
                'serialNumber': result.get('serialNumber', ''),
                'image_base64': result['image_base64'],
                'metadata': result['metadata']
            })
            
            # Aggregate stats
            cell_stats = result.get('stats', {})
            if 'ocr_400dpi_local' in cell_stats:
                stats['ocr_400dpi_local'] = stats.get('ocr_400dpi_local', 0) + cell_stats['ocr_400dpi_local']
            if 'tesseract_ocr' in cell_stats:
                stats['tesseract_ocr'] = stats.get('tesseract_ocr', 0) + cell_stats['tesseract_ocr']
            if 'photo_enhanced' in cell_stats:
                stats['photo_enhanced'] = stats.get('photo_enhanced', 0) + cell_stats['photo_enhanced']
            if 'photo_400dpi' in cell_stats:
                stats['photo_400dpi'] = stats.get('photo_400dpi', 0) + cell_stats['photo_400dpi']
            if 'smart_voter_id_found' in cell_stats:
                stats['smart_voter_id_found'] = stats.get('smart_voter_id_found', 0) + cell_stats['smart_voter_id_found']
            if 'smart_photo_found' in cell_stats:
                stats['smart_photo_found'] = stats.get('smart_photo_found', 0) + cell_stats['smart_photo_found']
        
        # Sort by page, then column, then row (vertical extraction)
        extracted_data.sort(key=lambda x: (x['page'], x['column'], x['row']))
        
        # Calculate total time
        end_time = time.time()
        extraction_time = end_time - start_time
        
        # Close document
        doc.close()
        
        # Return data with stats
        return {
            'extracted_data': extracted_data,
            'stats': {
                'records_extracted': len(extracted_data),
                'cells_processed': stats['total_cells'],
                'cells_skipped': stats.get('cells_skipped', 0),
                'extraction_time_seconds': round(extraction_time, 2),
                'extraction_time_minutes': round(extraction_time / 60, 2),
                'average_time_per_record': round(extraction_time / len(extracted_data) if len(extracted_data) > 0 else 0, 2),
                'method': 'enhanced'
            }
        }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise


def extract_grid_vertical_table_based(pdf_bytes, config):
    """
    Table-based extraction using Azure Vision table recognition
    - Extracts serial numbers and photos via OCR
    - Crops field images (name, relativeName, houseNumber, age, gender)
    - Generates table images per page
    - Uses Azure Vision to recognize structured tables
    - Matches rows using serial numbers
    
    Args:
        pdf_bytes: PDF file as bytes
        config: Configuration dictionary
    
    Returns:
        Dictionary with extracted_data and stats
    """
    if not TABLE_GENERATOR_AVAILABLE or not TABLE_RECOGNIZER_AVAILABLE:
        return extract_grid_vertical_enhanced(pdf_bytes, config)
    
    if not table_recognizer.is_available():
        return extract_grid_vertical_enhanced(pdf_bytes, config)
    
    start_time = time.time()
    
    try:
        # Reset API call counter at start
        if table_recognizer:
            table_recognizer.reset_api_call_count()
        
        # First, extract serial numbers and photos using existing method
        # This gives us the cell structure and serial numbers
        basic_result = extract_grid_vertical_enhanced(pdf_bytes, config)
        
        if isinstance(basic_result, dict):
            basic_data = basic_result.get('extracted_data', [])
        else:
            basic_data = basic_result
        
        if not basic_data:
            return {
                'extracted_data': [],
                'stats': {'records_extracted': 0, 'error': 'No data extracted'}
            }
        
        # Group data by page
        pages_data = {}
        for record in basic_data:
            page_num = record.get('page', 1)
            if page_num not in pages_data:
                pages_data[page_num] = []
            pages_data[page_num].append(record)
        
        # Check if pages are being skipped
        doc_check = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc_check)
        doc_check.close()
        skip_start = config.get('skipPagesStart', 0)
        skip_end = config.get('skipPagesEnd', 0)
        
        # Get field boxes from config
        cell_template = config.get('cellTemplate', {})
        field_boxes = {
            'name': cell_template.get('nameBox'),
            'relativeName': cell_template.get('relativeNameBox'),
            'houseNumber': cell_template.get('houseNumberBox'),
            'age': cell_template.get('ageBox'),
            'gender': cell_template.get('genderBox'),
            'yadiBhag': cell_template.get('yadiBhagBox')
        }
        
        # Get serial number box for cropping as image
        serial_number_box = cell_template.get('serialNumberBox')
        
        # Filter out None fields
        field_boxes = {k: v for k, v in field_boxes.items() if v}
        
        if not field_boxes:
            return basic_result
        
        # Get grid configuration for calculating cell positions
        grid = config.get('grid', {})
        grid_rows = grid.get('rows', 4)
        grid_cols = grid.get('columns', 3)
        grid_x = grid.get('x', 0)
        grid_y = grid.get('y', 0)
        grid_width = grid.get('width', 1500)
        grid_height = grid.get('height', 2000)
        
        # Get custom positions if available
        col_positions = grid.get('colPositions')
        row_positions = grid.get('rowPositions')
        
        # Calculate cell dimensions
        cell_width = grid_width / grid_cols if grid_cols > 0 else grid_width
        cell_height = grid_height / grid_rows if grid_rows > 0 else grid_height
        
        # Get first cell dimensions for scaling
        first_cell_width = cell_width
        first_cell_height = cell_height
        if col_positions and len(col_positions) > 1:
            first_cell_width = col_positions[1] - col_positions[0]
        if row_positions and len(row_positions) > 1:
            first_cell_height = row_positions[1] - row_positions[0]
        
        # Process each page
        final_data = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        for page_num, page_records in pages_data.items():
            try:
                page = doc[page_num - 1]  # Convert to 0-indexed
                
                # Prepare page data for table generation
                page_table_data = []
                serial_numbers = []
                
                # First, collect all serial numbers from page records
                for record in page_records:
                    serial_number = record.get('serialNumber', '').strip()
                    if serial_number:
                        serial_numbers.append(serial_number)
                
                # Process each record to crop field images
                for record in page_records:
                    serial_number = record.get('serialNumber', '').strip()
                    if not serial_number:
                        continue
                    
                    # Get cell position from record (row and column are 1-indexed in record)
                    record_row = record.get('row', 1) - 1  # Convert to 0-indexed
                    record_col = record.get('column', 1) - 1  # Convert to 0-indexed
                    
                    # Calculate cell position using same logic as extract_grid_vertical_enhanced
                    if col_positions and row_positions:
                        cell_x = col_positions[record_col] if record_col < len(col_positions) else grid_x + (record_col * cell_width)
                        cell_y = row_positions[record_row] if record_row < len(row_positions) else grid_y + (record_row * cell_height)
                        
                        # Get actual cell dimensions from custom positions
                        if record_col + 1 < len(col_positions):
                            cell_width_actual = col_positions[record_col + 1] - col_positions[record_col]
                        else:
                            cell_width_actual = grid_x + grid_width - col_positions[record_col]
                        
                        if record_row + 1 < len(row_positions):
                            cell_height_actual = row_positions[record_row + 1] - row_positions[record_row]
                        else:
                            cell_height_actual = grid_y + grid_height - row_positions[record_row]
                    else:
                        # Uniform grid
                        cell_x = grid_x + (record_col * cell_width)
                        cell_y = grid_y + (record_row * cell_height)
                        cell_width_actual = cell_width
                        cell_height_actual = cell_height
                    
                    # Calculate scaling factors for this cell
                    scale_x = cell_width_actual / first_cell_width if first_cell_width > 0 else 1.0
                    scale_y = cell_height_actual / first_cell_height if first_cell_height > 0 else 1.0
                    
                    # Create cell info for cropping
                    cell_info = {
                        'x': cell_x,
                        'y': cell_y,
                        'width': cell_width_actual,
                        'height': cell_height_actual,
                        'scale_x': scale_x,
                        'scale_y': scale_y
                    }
                    
                    # Crop field images
                    field_images = table_generator.crop_field_images_from_page(
                        page, cell_info, field_boxes, dpi=400
                    )
                    
                    # Also crop serial number as image if box is defined
                    if serial_number_box:
                        serial_field_boxes = {'serialNumber': serial_number_box}
                        serial_images = table_generator.crop_field_images_from_page(
                            page, cell_info, serial_field_boxes, dpi=400
                        )
                        # Add serial number image to field_images
                        if 'serialNumber' in serial_images:
                            field_images['serialNumber'] = serial_images['serialNumber']
                    
                    # Also crop voter ID as image if box is defined (for Azure OCR extraction)
                    voter_id_box = cell_template.get('voterIdBox', {})
                    if voter_id_box:
                        voter_id_field_boxes = {'voterId': voter_id_box}
                        voter_id_images = table_generator.crop_field_images_from_page(
                            page, cell_info, voter_id_field_boxes, dpi=400
                        )
                        # Add voter ID image to field_images
                        if 'voterId' in voter_id_images:
                            field_images['voterId'] = voter_id_images['voterId']
                    
                    page_table_data.append({
                        'serialNumber': serial_number,  # Keep text for matching/fallback
                        'field_images': field_images    # Now includes serialNumber and voterId images if available
                    })
                
                if not page_table_data:
                    continue
                
                # Generate table image
                # Include voterId in field order if voterIdBox is defined
                field_order = list(field_boxes.keys())
                if voter_id_box and 'voterId' not in field_order:
                    # Insert voterId at the beginning (after serial number)
                    field_order.insert(0, 'voterId')
                field_config = {'field_order': field_order}
                table_image = table_generator.generate_table_image(
                    page_table_data, field_config, dpi=400
                )
                
                # Save table image to file
                import os
                table_images_dir = os.path.join(os.path.dirname(__file__), 'table_images')
                os.makedirs(table_images_dir, exist_ok=True)
                table_image_path = os.path.join(table_images_dir, f'table_page_{page_num}.png')
                table_image.save(table_image_path, 'PNG')
                
                # Recognize table using Azure Vision
                # Omit language parameter for auto-detect (Azure auto-detects Marathi and English)
                # Azure Read API v3.2 doesn't support 'mar' code, so we use auto-detect
                table_result = table_recognizer.recognize_table(table_image, language=None)
                
                # Save raw OCR text to file for debugging
                import os
                ocr_text_dir = os.path.join(os.path.dirname(__file__), 'ocr_text_output')
                os.makedirs(ocr_text_dir, exist_ok=True)
                ocr_text_file = os.path.join(ocr_text_dir, f'ocr_page_{page_num}.txt')
                with open(ocr_text_file, 'w', encoding='utf-8') as f:
                    f.write(f"{'='*80}\n")
                    f.write(f"OCR TEXT FOR PAGE {page_num}\n")
                    f.write(f"{'='*80}\n\n")
                    
                    # Write raw Azure API response
                    if table_result.get('raw_api_response'):
                        f.write("RAW AZURE API RESPONSE (JSON):\n")
                        f.write("-" * 80 + "\n")
                        f.write(table_result.get('raw_api_response', ''))
                        f.write("\n" + "-" * 80 + "\n\n")
                    else:
                        f.write("NO RAW API RESPONSE AVAILABLE\n\n")
                    
                    # Write raw OCR text (extracted from API response)
                    if table_result.get('raw_text'):
                        f.write("RAW OCR TEXT (extracted from Azure response):\n")
                        f.write("-" * 80 + "\n")
                        f.write(table_result.get('raw_text', ''))
                        f.write("\n" + "-" * 80 + "\n\n")
                    else:
                        f.write("NO RAW TEXT AVAILABLE\n\n")
                    
                    # Write line-by-line OCR data with bounding boxes
                    if table_result.get('lines'):
                        f.write(f"OCR LINES WITH BOUNDING BOXES: {len(table_result.get('lines', []))} lines\n")
                        f.write("-" * 80 + "\n")
                        for idx, line in enumerate(table_result.get('lines', [])[:50], 1):  # First 50 lines
                            bbox = line.get('boundingBox', [])
                            text = line.get('text', '')
                            conf = line.get('confidence', 0.0)
                            f.write(f"Line {idx}: '{text[:60]}' | Confidence: {conf:.2f} | BBox: {bbox[:4] if len(bbox) >= 4 else 'N/A'}\n")
                        if len(table_result.get('lines', [])) > 50:
                            f.write(f"... (showing first 50 of {len(table_result.get('lines', []))} lines)\n")
                        f.write("-" * 80 + "\n\n")
                    
                    # Write parsed rows
                    if table_result.get('success'):
                        f.write(f"PARSED ROWS: {len(table_result.get('rows', []))}\n")
                        f.write("-" * 80 + "\n")
                        for idx, row in enumerate(table_result.get('rows', []), 1):
                            f.write(f"Row {idx}:\n")
                            f.write(f"  Serial Number: '{row.get('serialNumber', '')}'\n")
                            f.write(f"  Name: '{row.get('name', '')}'\n")
                            f.write(f"  Relative Name: '{row.get('relativeName', '')}'\n")
                            f.write(f"  House Number: '{row.get('houseNumber', '')}'\n")
                            f.write(f"  Age: '{row.get('age', '')}'\n")
                            f.write(f"  Gender: '{row.get('gender', '')}'\n")
                            f.write(f"  Yadi Bhag: '{row.get('yadiBhag', '')}'\n")
                            f.write("\n")
                    else:
                        f.write(f"ERROR: {table_result.get('error', 'Unknown error')}\n")
                    
                    # Write extracted serial numbers for comparison
                    f.write(f"\n{'='*80}\n")
                    f.write(f"EXTRACTED SERIAL NUMBERS (for matching):\n")
                    f.write("-" * 80 + "\n")
                    for idx, serial in enumerate(serial_numbers[:30], 1):  # First 30
                        f.write(f"{idx}. '{serial}'\n")
                    if len(serial_numbers) > 30:
                        f.write(f"... (showing first 30 of {len(serial_numbers)} serials)\n")
                    f.write(f"{'='*80}\n")
                
                print(f"[DEBUG] OCR text saved to: {ocr_text_file}")
                
                if table_result.get('success'):
                    parsed_rows = table_result.get('rows', [])
                    
                    # DEBUG: Check what Azure OCR extracted
                    if parsed_rows:
                        print(f"[DEBUG Page {page_num}] Azure OCR extracted {len(parsed_rows)} rows")
                        print(f"[DEBUG] First row sample: Serial='{parsed_rows[0].get('serialNumber', '')}', Name='{parsed_rows[0].get('name', '')[:30]}'")
                    else:
                        print(f"[DEBUG Page {page_num}] WARNING: Azure OCR returned 0 rows!")
                        print(f"[DEBUG] Raw text length: {len(table_result.get('raw_text', ''))}")
                        print(f"[DEBUG] OCR text saved to: {ocr_text_file}")
                    
                    # Match rows by serial number
                    matched_rows = table_recognizer.match_rows_by_serial(
                        parsed_rows,
                        serial_numbers
                    )
                    
                    # DEBUG: Check matching results
                    print(f"[DEBUG Page {page_num}] Matched {len(matched_rows)} rows out of {len(parsed_rows)} parsed and {len(serial_numbers)} extracted")
                    if len(matched_rows) == 0 and len(parsed_rows) > 0:
                        print(f"[DEBUG] Extracted serials: {serial_numbers[:5]}")
                        print(f"[DEBUG] Parsed serials: {[r.get('serialNumber', '') for r in parsed_rows[:5]]}")
                    
                    # If matching failed or too few matches, try position-based matching as fallback
                    # This is critical - if serial numbers don't match, use position
                    # More aggressive position-based matching for better accuracy
                    if len(matched_rows) == 0 and len(parsed_rows) > 0:
                        # Try position-based matching even if counts don't match exactly
                        matched_rows = {}
                        # Match by row position (assuming same order)
                        # Match ALL records by position, regardless of serial number
                        min_count = min(len(parsed_rows), len(page_records))
                        for i in range(min_count):
                            if i < len(parsed_rows):
                                record = page_records[i]
                                parsed_row = parsed_rows[i]
                                # Use table serial number as key (more accurate)
                                table_serial = parsed_row.get('serialNumber', '').strip()
                                if table_serial:
                                    matched_rows[table_serial] = parsed_row
                                    # Also update record's serial number if it's wrong
                                    record_serial = record.get('serialNumber', '').strip()
                                    if record_serial != table_serial:
                                        # Check if record serial is clearly wrong (single letter, no digits, etc.)
                                        import re
                                        record_digits = re.sub(r'[^0-9]', '', record_serial)
                                        if not record_digits or len(record_serial) == 1:
                                            record['serialNumber'] = table_serial
                                            print(f"[DEBUG Page {page_num}] Position match: Updated serial '{record_serial}' -> '{table_serial}' for record at position {i}")
                        print(f"[DEBUG Page {page_num}] Position-based matching: Matched {len(matched_rows)} rows by position")
                    elif len(matched_rows) < len(parsed_rows) * 0.5:  # If less than 50% matched
                        # Use position-based matching to fill gaps
                        position_matched = {}
                        min_count = min(len(parsed_rows), len(page_records))
                        for i in range(min_count):
                            if i < len(parsed_rows):
                                record = page_records[i]
                                parsed_row = parsed_rows[i]
                                record_serial = record.get('serialNumber', '').strip()
                                table_serial = parsed_row.get('serialNumber', '').strip()
                                
                                # If record serial is not matched, try position
                                if record_serial not in matched_rows and table_serial:
                                    # Use table serial as key
                                    position_matched[table_serial] = parsed_row
                                    # Update record serial if it's wrong
                                    import re
                                    record_digits = re.sub(r'[^0-9]', '', record_serial)
                                    if not record_digits or len(record_serial) == 1 or record_serial != table_serial:
                                        record['serialNumber'] = table_serial
                                        print(f"[DEBUG Page {page_num}] Position match: Updated serial '{record_serial}' -> '{table_serial}' for record at position {i}")
                        # Merge position matches
                        matched_rows.update(position_matched)
                        print(f"[DEBUG Page {page_num}] Position-based matching: Added {len(position_matched)} more matches")
                    
                    # Additional fallback: Try to match by extracting last digits from serial numbers
                    # This handles cases where extracted serial is "125" but table has "25"
                    if len(matched_rows) < len(parsed_rows) * 0.7:  # If still less than 70% matched
                        import re
                        # Create a map of table serials to their rows
                        table_serial_map = {}
                        for parsed_row in parsed_rows:
                            table_serial = parsed_row.get('serialNumber', '').strip()
                            if table_serial:
                                # Extract last 1-3 digits as potential match
                                digits = re.sub(r'[^0-9]', '', table_serial)
                                if digits:
                                    # Try matching with last 1, 2, or 3 digits
                                    for length in [min(3, len(digits)), min(2, len(digits)), 1]:
                                        if length > 0:
                                            suffix = digits[-length:]
                                            if suffix not in table_serial_map:
                                                table_serial_map[suffix] = []
                                            table_serial_map[suffix].append(parsed_row)
                        
                        # Try to match extracted serials with table serials by suffix
                        suffix_matched = {}
                        for record in page_records:
                            serial = record.get('serialNumber', '').strip()
                            if serial and serial not in matched_rows:
                                # Extract digits from extracted serial
                                extracted_digits = re.sub(r'[^0-9]', '', serial)
                                if extracted_digits:
                                    # Try matching with last 1, 2, or 3 digits
                                    for length in [min(3, len(extracted_digits)), min(2, len(extracted_digits)), 1]:
                                        if length > 0:
                                            suffix = extracted_digits[-length:]
                                            if suffix in table_serial_map:
                                                # Use the first matching row (or could use position)
                                                parsed_row = table_serial_map[suffix][0]
                                                suffix_matched[serial] = parsed_row
                                                break
                        
                        # Merge suffix matches (but only if they don't conflict with existing matches)
                        for serial, parsed_row in suffix_matched.items():
                            if serial not in matched_rows:
                                matched_rows[serial] = parsed_row
                        
                        if suffix_matched:
                            print(f"[DEBUG Page {page_num}] Suffix-based matching: Added {len(suffix_matched)} more matches")
                    
                    # Combine with basic extraction data
                    merged_count = 0
                    
                    # DEBUG: Log parsed rows for serial 173
                    print(f"[DEBUG Page {page_num}] Parsed rows count: {len(parsed_rows)}, Page records count: {len(page_records)}")
                    for idx, pr in enumerate(parsed_rows):
                        if pr.get('serialNumber', '').strip() == '173':
                            print(f"[DEBUG Page {page_num}] Found serial 173 in parsed_rows at index {idx}: {pr}")
                    
                    # DEBUG: Log page records for serial 173
                    for idx, rec in enumerate(page_records):
                        if rec.get('serialNumber', '').strip() == '173' or '173' in str(rec.get('serialNumber', '')):
                            print(f"[DEBUG Page {page_num}] Found serial 173 in page_records at index {idx}: Serial='{rec.get('serialNumber', '')}', VoterID='{rec.get('voterID', '')}'")
                    
                    for record_idx, record in enumerate(page_records):
                        serial = record.get('serialNumber', '').strip()
                        original_voter_id = record.get('voterID', '').strip()  # Preserve original
                        original_serial = serial  # Preserve original serial
                        
                        # Special debug for serial 173
                        is_173 = serial == '173' or '173' in str(serial) or '173' in str(record.get('serialNumber', ''))
                        if is_173:
                            print(f"[DEBUG Page {page_num}] === Processing serial 173 at record index {record_idx} ===")
                            print(f"[DEBUG Page {page_num}] Record serial: '{serial}', Original serial: '{original_serial}'")
                            print(f"[DEBUG Page {page_num}] Parsed rows available: {len(parsed_rows)}, Matched rows: {len(matched_rows)}")
                        
                        # Try to match by serial number first
                        matched_row = None
                        if serial in matched_rows:
                            matched_row = matched_rows[serial]
                            # Check if matched row has actual data - if not, it's a bad match
                            has_data = (matched_row.get('name', '').strip() or 
                                       matched_row.get('age', '').strip() or 
                                       matched_row.get('yadiBhag', '').strip())
                            
                            if is_173:
                                print(f"[DEBUG Page {page_num}] Serial 173: Matched by serial '{serial}' in matched_rows")
                                print(f"[DEBUG Page {page_num}] Serial 173: Matched row has data: {has_data}, Name='{matched_row.get('name', '')[:30]}', Age='{matched_row.get('age', '')}'")
                            
                            # If matched row has no data, it's a bad match - use position-based instead
                            if not has_data:
                                if is_173:
                                    print(f"[DEBUG Page {page_num}] Serial 173: WARNING - Matched row has no data! Using position-based matching instead...")
                                matched_row = None  # Clear bad match, will use position-based below
                        
                        # If not matched by serial OR matched row has no data, use position-based matching
                        # This ensures ALL records get matched with actual data, even if serial numbers are wrong
                        if not matched_row or (matched_row and not (matched_row.get('name', '').strip() or matched_row.get('age', '').strip())):
                            if record_idx < len(parsed_rows):
                                position_row = parsed_rows[record_idx]
                                table_serial = position_row.get('serialNumber', '').strip()
                                position_has_data = (position_row.get('name', '').strip() or 
                                                    position_row.get('age', '').strip() or 
                                                    position_row.get('yadiBhag', '').strip())
                                
                                if is_173:
                                    print(f"[DEBUG Page {page_num}] Serial 173: Using position-based matching, parsed row at index {record_idx} has serial '{table_serial}'")
                                    print(f"[DEBUG Page {page_num}] Serial 173: Position row data: {position_row}")
                                    print(f"[DEBUG Page {page_num}] Serial 173: Position row has data: {position_has_data}")
                                
                                # Use position-based row if it has data OR if serial matches
                                if position_has_data or table_serial == serial or table_serial == '173':
                                    matched_row = position_row
                                    if is_173:
                                        print(f"[DEBUG Page {page_num}] Serial 173: Using position-based row (has data or serial matches)")
                                        # Update matched_rows with the correct row
                                        matched_rows['173'] = position_row
                                        print(f"[DEBUG Page {page_num}] Serial 173: Updated matched_rows with position-based row")
                                
                                if matched_row and table_serial:
                                    # Check if record serial is clearly wrong
                                    import re
                                    record_digits = re.sub(r'[^0-9]', '', serial)
                                    table_digits = re.sub(r'[^0-9]', '', table_serial)
                                    
                                    # Always use table serial if it's different (table is more accurate)
                                    if serial != table_serial:
                                        # Use serial number from table (more accurate)
                                        record['serialNumber'] = table_serial
                                        if is_173:
                                            print(f"[DEBUG Page {page_num}] Serial 173: Fixed serial number: '{original_serial}' -> '{table_serial}' (by position)")
                                        else:
                                            print(f"[DEBUG Page {page_num}] Record {record_idx}: Fixed serial number: '{original_serial}' -> '{table_serial}' (by position)")
                                        serial = table_serial  # Update for matching
                                        matched_rows[serial] = matched_row  # Add to matched rows
                                    else:
                                        # Serial matches, but wasn't in matched_rows - add it
                                        matched_rows[serial] = matched_row
                                    if is_173:
                                        print(f"[DEBUG Page {page_num}] Serial 173: Matched by position (serial: '{serial}')")
                                    else:
                                        print(f"[DEBUG Page {page_num}] Record {record_idx}: Matched by position (serial: '{serial}')")
                                else:
                                    if is_173:
                                        print(f"[DEBUG Page {page_num}] Serial 173: WARNING - No serial in parsed row at position {record_idx}")
                                    else:
                                        print(f"[DEBUG Page {page_num}] Record {record_idx}: WARNING - No serial in parsed row at position {record_idx}")
                            else:
                                if is_173:
                                    print(f"[DEBUG Page {page_num}] Serial 173: WARNING - No parsed row at position {record_idx} (have {len(parsed_rows)} parsed rows, {len(page_records)} records)")
                                else:
                                    print(f"[DEBUG Page {page_num}] Record {record_idx}: WARNING - No parsed row at position {record_idx} (have {len(parsed_rows)} parsed rows, {len(page_records)} records)")
                        
                        if matched_row:
                            table_row = matched_row
                            
                            if is_173:
                                print(f"[DEBUG Page {page_num}] Serial 173: About to merge data from table_row")
                                print(f"[DEBUG Page {page_num}] Serial 173: Table row data: Name='{table_row.get('name', '')[:30]}', Age='{table_row.get('age', '')}', YadiBhag='{table_row.get('yadiBhag', '')}'")
                            
                            # Merge table data into record
                            # Use voter ID from table if available (more accurate from Azure OCR)
                            table_voter_id = table_row.get('voterId', '').strip()
                            if table_voter_id:
                                record['voterID'] = table_voter_id
                                if original_voter_id and original_voter_id != table_voter_id:
                                    if is_173:
                                        print(f"[DEBUG Page {page_num}] Serial 173: Using voter ID from table: '{table_voter_id}' (was: '{original_voter_id}')")
                                    else:
                                        print(f"[DEBUG Page {page_num}] Serial {serial}: Using voter ID from table: '{table_voter_id}' (was: '{original_voter_id}')")
                                else:
                                    if is_173:
                                        print(f"[DEBUG Page {page_num}] Serial 173: Using voter ID from table: '{table_voter_id}'")
                                    else:
                                        print(f"[DEBUG Page {page_num}] Serial {serial}: Using voter ID from table: '{table_voter_id}'")
                            elif original_voter_id:
                                # Keep original voter ID if table doesn't have it
                                record['voterID'] = original_voter_id
                                if is_173:
                                    print(f"[DEBUG Page {page_num}] Serial 173: Keeping original voter ID (table had none): '{original_voter_id}'")
                                else:
                                    print(f"[DEBUG Page {page_num}] Serial {serial}: Keeping original voter ID (table had none): '{original_voter_id}'")
                            else:
                                # No voter ID from either source
                                record['voterID'] = ''
                                if is_173:
                                    print(f"[DEBUG Page {page_num}] Serial 173: WARNING - No voter ID found in table or original extraction")
                                else:
                                    print(f"[DEBUG Page {page_num}] Serial {serial}: WARNING - No voter ID found in table or original extraction")
                            
                            # Use serial number from table if available (more accurate from Azure OCR)
                            table_serial = table_row.get('serialNumber', '').strip()
                            if table_serial:
                                # Check if table serial is different and more likely correct
                                import re
                                table_digits = re.sub(r'[^0-9]', '', table_serial)
                                original_digits = re.sub(r'[^0-9]', '', original_serial)
                                # If table has digits and original doesn't, or if original is a single letter, use table
                                if (table_digits and not original_digits) or (len(original_serial) == 1 and original_serial.isalpha()):
                                    record['serialNumber'] = table_serial
                                    if original_serial != table_serial:
                                        if is_173:
                                            print(f"[DEBUG Page {page_num}] Serial 173: Fixed serial number: '{original_serial}' -> '{table_serial}' (from table)")
                                        else:
                                            print(f"[DEBUG Page {page_num}] Fixed serial number: '{original_serial}' -> '{table_serial}' (from table)")
                            
                            # Merge all table data
                            merge_data = {
                                'name': table_row.get('name', ''),
                                'relativeName': table_row.get('relativeName', ''),
                                'houseNumber': table_row.get('houseNumber', ''),
                                'age': table_row.get('age', ''),
                                'gender': table_row.get('gender', ''),
                                'yadiBhag': table_row.get('yadiBhag', '')
                            }
                            
                            if is_173:
                                print(f"[DEBUG Page {page_num}] Serial 173: Merging data: {merge_data}")
                            
                            record.update(merge_data)
                            merged_count += 1
                            
                            if is_173:
                                print(f"[DEBUG Page {page_num}] Serial 173: After merge - Name='{record.get('name', '')[:30]}', Age='{record.get('age', '')}', YadiBhag='{record.get('yadiBhag', '')}'")
                                print(f"[DEBUG Page {page_num}] Serial 173: Record keys after merge: {list(record.keys())}")
                            
                            # DEBUG: Show first merge and serial 173 specifically
                            if merged_count == 1 or serial == '173' or original_serial == 'A' or '173' in str(record.get('serialNumber', '')):
                                print(f"[DEBUG Page {page_num}] Merge: Serial={record.get('serialNumber', '')} (was: {original_serial}), VoterID='{record.get('voterID', '')}', Name='{record.get('name', '')[:30]}', Age='{record.get('age', '')}', YadiBhag='{record.get('yadiBhag', '')}'")
                        else:
                            # Record not matched - this should rarely happen now since we do position-based matching above
                            # But if it does, ensure all fields exist
                            print(f"[DEBUG Page {page_num}] Record {record_idx}: WARNING - No matched row found, ensuring fields exist")
                            
                            # Preserve original voter ID
                            if not record.get('voterID', '').strip():
                                record['voterID'] = original_voter_id if original_voter_id else ''
                            
                            # This ensures Excel columns are created for all fields
                            if 'name' not in record:
                                record['name'] = ''
                            if 'relativeName' not in record:
                                record['relativeName'] = ''
                            if 'houseNumber' not in record:
                                record['houseNumber'] = ''
                            if 'age' not in record:
                                record['age'] = ''
                            if 'gender' not in record:
                                record['gender'] = ''
                            if 'yadiBhag' not in record:
                                record['yadiBhag'] = ''
                    
                    print(f"[DEBUG Page {page_num}] Merged {merged_count} records with table data")
                else:
                    # DEBUG: Table recognition failed
                    error_msg = table_result.get('error', 'Unknown error')
                    print(f"[DEBUG Page {page_num}] Table recognition FAILED: {error_msg}")
                    # Ensure all fields exist in records even if table recognition failed
                    for record in page_records:
                        if 'name' not in record:
                            record['name'] = ''
                        if 'relativeName' not in record:
                            record['relativeName'] = ''
                        if 'houseNumber' not in record:
                            record['houseNumber'] = ''
                        if 'age' not in record:
                            record['age'] = ''
                        if 'gender' not in record:
                            record['gender'] = ''
                        if 'yadiBhag' not in record:
                            record['yadiBhag'] = ''
                
                final_data.extend(page_records)
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                # Ensure all fields exist in records even on error
                for record in page_records:
                    if 'name' not in record:
                        record['name'] = ''
                    if 'relativeName' not in record:
                        record['relativeName'] = ''
                    if 'houseNumber' not in record:
                        record['houseNumber'] = ''
                    if 'age' not in record:
                        record['age'] = ''
                    if 'gender' not in record:
                        record['gender'] = ''
                    if 'yadiBhag' not in record:
                        record['yadiBhag'] = ''
                # Add records without table data
                final_data.extend(page_records)
        
        doc.close()
        
        end_time = time.time()
        extraction_time = end_time - start_time
        
        # Collect table image paths
        table_image_paths = {}
        table_images_dir = os.path.join(os.path.dirname(__file__), 'table_images')
        if os.path.exists(table_images_dir):
            for filename in os.listdir(table_images_dir):
                if filename.startswith('table_page_') and filename.endswith('.png'):
                    page_num = int(filename.replace('table_page_', '').replace('.png', ''))
                    table_image_paths[page_num] = filename
        
        # Get API call count from table recognizer
        api_call_count = 0
        if table_recognizer:
            api_call_count = table_recognizer.get_api_call_count()
        
        return {
            'extracted_data': final_data,
            'table_images': table_image_paths,
            'stats': {
                'records_extracted': len(final_data),
                'extraction_time_seconds': round(extraction_time, 2),
                'extraction_time_minutes': round(extraction_time / 60, 2),
                'azure_api_calls': api_call_count,
                'method': 'table_based',
                'average_time_per_record': round(extraction_time / len(final_data) if len(final_data) > 0 else 0, 2)
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Fallback to standard extraction
        return extract_grid_vertical_enhanced(pdf_bytes, config)


def extract_grid_vertical(pdf_bytes, config):
    """
    Main extraction function - uses table-based if available, otherwise enhanced version
    
    Returns:
        Dictionary with extracted_data and stats
    """
    # Check if table-based extraction should be used
    use_table_based = config.get('useTableBasedExtraction', False)
    
    if use_table_based and TABLE_GENERATOR_AVAILABLE and TABLE_RECOGNIZER_AVAILABLE:
        return extract_grid_vertical_table_based(pdf_bytes, config)
    else:
        result = extract_grid_vertical_enhanced(pdf_bytes, config)
        
        # If result is a dict with stats, return it as-is (new format)
        if isinstance(result, dict) and 'extracted_data' in result:
            return result
        
        # Otherwise return result directly (backward compatibility)
        return result


def clean_voter_id(text):
    """
    Clean and normalize voter ID text (fallback method)
    
    Args:
        text: Raw OCR text
    
    Returns:
        Cleaned voter ID text
    """
    if not text:
        return ""
    
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Remove common OCR errors
    text = text.replace('\n', ' ').replace('\r', ' ')
    
    # Try to extract voter ID pattern (e.g., NOW1234567)
    # Common patterns: 3 letters followed by 7 digits
    pattern = r'[A-Z]{3}\d{7}'
    match = re.search(pattern, text.upper())
    if match:
        cleaned = match.group(0)
    else:
        # If no pattern match, return cleaned text
        cleaned = text.strip()
    
    # Remove trailing underscores (common OCR error)
    cleaned = cleaned.rstrip('_').strip()
    
    return cleaned


def test_tesseract():
    """
    Test if Tesseract is properly installed
    """
    try:
        version = pytesseract.get_tesseract_version()
        print(f"Tesseract version: {version}")
        
        # Check available languages
        langs = pytesseract.get_languages()
        print(f"Available languages: {langs}")
        
        if 'eng' not in langs:
            print("WARNING: English language data not found")
        if 'hin' not in langs:
            print("WARNING: Hindi language data not found")
        
        return True
    except Exception as e:
        print(f"Tesseract test failed: {str(e)}")
        return False


if __name__ == "__main__":
    # Test enhanced extraction modules
    print("Testing Enhanced Extraction Modules...")
    print("=" * 60)
    
    # Test Tesseract installation
    print("\n1. Testing Tesseract OCR (fallback)...")
    test_tesseract()
    
    # Test advanced modules
    print("\n2. Testing Advanced Modules...")
    
    if ocr_processor_400dpi:
        print("  OK: 400 DPI OCR Processor: Available ✓")
    else:
        print("  FAIL: 400 DPI OCR Processor: Not available")
    
    if photo_processor:
        print("  OK: Photo Processor: Available")
    else:
        print("  FAIL: Photo Processor: Not available")
    
    if box_detector:
        print("  OK: Box Detector: Available")
    else:
        print("  FAIL: Box Detector: Not available")
    
    if smart_detector:
        print("  OK: Smart Detector: Available")
    else:
        print("  FAIL: Smart Detector: Not available")
    
    print("\n" + "=" * 60)
    print("Ready for enhanced extraction!")
    if ocr_processor_400dpi:
        print("Strategy: 400 DPI Local OCR ✓")
    else:
        print("Strategy: Standard Tesseract OCR")
    print("=" * 60)

