"""
Azure Vision Table Recognizer
Uses Azure Computer Vision API to recognize structured tables from images
"""

import os
import time
import base64
import requests
import io
from typing import Dict, List, Optional
from PIL import Image
from dotenv import load_dotenv

load_dotenv()


class AzureTableRecognizer:
    """
    Recognizes structured tables from images using Azure Computer Vision API
    Returns table data with row/column structure
    """
    
    def __init__(self):
        """Initialize Azure Table Recognizer"""
        self.api_key = os.getenv('AZURE_VISION_KEY')
        self.endpoint = os.getenv('AZURE_VISION_ENDPOINT')
        self.api_call_count = 0  # Track API calls
        
        if not self.api_key:
            self.enabled = False
            return
        
        if not self.endpoint:
            self.enabled = False
            return
        
        # Remove trailing slash
        self.endpoint = self.endpoint.rstrip('/')
        
        # Use Document Intelligence API for better table recognition
        # Fallback to Read API if Document Intelligence not available
        self.read_url = f"{self.endpoint}/vision/v3.2/read/analyze"
        self.api_version = "2023-10-01"
        
        self.enabled = True
    
    def get_api_call_count(self) -> int:
        """Get total number of API calls made"""
        return self.api_call_count
    
    def reset_api_call_count(self):
        """Reset API call counter"""
        self.api_call_count = 0
    
    def is_available(self) -> bool:
        """Check if service is available"""
        return self.enabled
    
    def recognize_table(self, image: Image.Image, language: str = None) -> Dict:
        """
        Recognize table structure from image
        
        Args:
            image: PIL Image of the table
            language: Language code (en, hi, etc.)
        
        Returns:
            Dictionary with table data:
            {
                'success': bool,
                'rows': [
                    {
                        'serialNumber': str,
                        'name': str,
                        'relativeName': str,
                        'houseNumber': str,
                        'age': str,
                        'gender': str
                    }
                ],
                'confidence': float
            }
        """
        if not self.enabled:
            return {
                'success': False,
                'error': 'Azure Vision not configured',
                'rows': []
            }
        
        try:
            # Convert PIL Image to bytes
            img_bytes = io.BytesIO()
            image.save(img_bytes, format='PNG')
            img_bytes = img_bytes.getvalue()
            
            # Call Azure Read API
            self.api_call_count += 1  # Increment API call counter
            result = self._call_read_api(img_bytes, language)
            
            if not result['success']:
                return result
            
            # Parse table structure from OCR results
            # Use multiline version for parsing (pattern-based parsing works better with newlines)
            parse_text = result.get('raw_text_multiline', result['text'])
            table_data = self._parse_table_from_ocr(parse_text, result['lines'])
            
            return {
                'success': True,
                'rows': table_data['rows'],
                'confidence': result.get('confidence', 0.0),
                'raw_text': result.get('raw_text_single_line', result['text']),  # Single line for display
                'raw_text_multiline': result['text'],  # Multiline for parsing
                'lines': result['lines'],  # Include lines for debugging
                'raw_api_response': result.get('raw_api_response', '')  # Include raw API response
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'rows': []
            }
    
    def _call_read_api(self, image_bytes: bytes, language: str = "en") -> Dict:
        """Call Azure Read API for OCR"""
        try:
            # Start analysis
            headers = {
                'Ocp-Apim-Subscription-Key': self.api_key,
                'Content-Type': 'application/octet-stream'
            }
            
            # Azure Read API v3.2 supports: en, es, fr, de, it, pt, zh-Hans, ja, ko, ar, ru, hi, mar, etc.
            # But NOT combinations like 'en+hi' or 'en+mar'.
            # For Marathi (mar), Azure can also read English text, so 'mar' works for both Marathi and English
            params = {}
            if language:
                # Handle valid single language codes
                if language == 'mar':
                    params['language'] = 'mar'  # Marathi (also reads English)
                elif language == 'hi':
                    params['language'] = 'hi'  # Hindi
                elif language == 'en':
                    params['language'] = 'en'  # English
                elif 'mar' in language.lower():
                    params['language'] = 'mar'  # Marathi
                elif 'hi' in language.lower() and 'en' not in language.lower() and 'mar' not in language.lower():
                    params['language'] = 'hi'  # Hindi
                elif 'en' in language.lower() and 'hi' not in language.lower() and 'mar' not in language.lower():
                    params['language'] = 'en'  # English
                # For combinations or None, omit parameter for auto-detect
            # If language is None or invalid combination, omit parameter (auto-detect)
            
            response = requests.post(
                self.read_url,
                headers=headers,
                params=params,
                data=image_bytes,
                timeout=30
            )
            
            if response.status_code not in [200, 202]:
                error_msg = f"Azure API error: {response.status_code} - {response.text[:200]}"
                return {
                    'success': False,
                    'error': error_msg,
                    'text': '',
                    'lines': []
                }
            
            # Get operation location
            operation_location = response.headers.get('Operation-Location')
            if not operation_location:
                return {
                    'success': False,
                    'error': 'No operation location returned',
                    'text': '',
                    'lines': []
                }
            
            # Poll for results (optimized: start with shorter delays, increase if needed)
            max_attempts = 30
            initial_delay = 0.5  # Start with 0.5s delay
            max_delay = 2.0  # Max 2s delay
            current_delay = initial_delay
            
            for attempt in range(max_attempts):
                if attempt > 0:  # Don't sleep on first attempt
                    time.sleep(current_delay)
                    # Gradually increase delay, but cap at max_delay
                    current_delay = min(current_delay * 1.1, max_delay)
                
                result_response = requests.get(
                    operation_location,
                    headers={'Ocp-Apim-Subscription-Key': self.api_key},
                    timeout=30
                )
                
                if result_response.status_code == 200:
                    result = result_response.json()
                    
                    if result.get('status') == 'succeeded':
                        # Extract text and lines
                        text_lines = []
                        all_lines = []
                        confidences = []
                        
                        if 'analyzeResult' in result and 'readResults' in result['analyzeResult']:
                            for page in result['analyzeResult']['readResults']:
                                if 'lines' in page:
                                    for line in page['lines']:
                                        line_text = line.get('text', '')
                                        # Keep all text as-is, no filtering or validation
                                        text_lines.append(line_text)
                                        all_lines.append({
                                            'text': line_text,
                                            'boundingBox': line.get('boundingBox', []),
                                            'confidence': line.get('confidence', 0.0)
                                        })
                                        confidences.append(line.get('confidence', 0.0))
                        
                        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
                        
                        # Store raw API response for debugging
                        import json
                        raw_response = json.dumps(result, indent=2, ensure_ascii=False)
                        
                        # Return raw text exactly as Azure returned it - no processing, no filtering
                        # Join all text in one line (space-separated) for RAW OCR TEXT output
                        raw_text_single_line = ' '.join(text_lines)
                        # Also keep newline-separated version for parsing
                        raw_text_multiline = '\n'.join(text_lines)
                        
                        return {
                            'success': True,
                            'text': raw_text_multiline,  # Newline-separated for parsing
                            'raw_text_single_line': raw_text_single_line,  # Single line for display
                            'lines': all_lines,
                            'confidence': avg_confidence,
                            'raw_api_response': raw_response
                        }
                    
                    elif result.get('status') == 'failed':
                        return {
                            'success': False,
                            'error': 'OCR processing failed',
                            'text': '',
                            'lines': []
                        }
            
            return {
                'success': False,
                'error': 'Timeout waiting for OCR results',
                'text': '',
                'lines': []
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'text': '',
                'lines': []
            }
    
    def _parse_table_from_ocr(self, text: str, lines: List[Dict]) -> Dict:
        """
        Parse table structure from OCR text using pure bounding box approach
        Groups text by Y position (rows) and X position (columns) to identify fields
        No dependency on markers - uses spatial positions from Azure OCR
        """
        rows = []
        
        if not text and not lines:
            return {'rows': rows}
        
        import re
        
        # If we have bounding box information, use it to order fields correctly
        if lines and len(lines) > 0:
            # Filter out header lines (they're usually at the top and contain header keywords)
            header_keywords = ['serial', 'number', 'name', 'age', 'gender', 'house', 'relative', 'yadi', 'bhag', 'voter', 'id', 'epic']
            data_lines = []
            min_y_for_data = None
            
            for line in lines:
                line_text = line.get('text', '').strip()
                bbox = line.get('boundingBox', [])
                
                # Skip empty lines
                if not line_text:
                    continue
                
                # Check if this is a header line (contains header keywords and is likely at top)
                is_header = False
                line_lower = line_text.lower()
                if any(keyword in line_lower for keyword in header_keywords):
                    # If it's a short line with only header words (no data), it's likely a header
                    if len(line_text.split()) <= 3 and not re.search(r'\d', line_text):
                        is_header = True
                        # Track the Y position of headers to filter out data above this
                        if bbox and len(bbox) >= 2:
                            y_pos = bbox[1]  # Top Y coordinate
                            if min_y_for_data is None or y_pos < min_y_for_data:
                                min_y_for_data = y_pos + 50  # Add some margin
                
                if not is_header:
                    data_lines.append({
                        'text': line_text,
                        'bbox': bbox
                    })
            
            # Group lines by row (similar Y coordinates)
            # Sort by Y position (top to bottom)
            data_lines.sort(key=lambda x: x['bbox'][1] if x['bbox'] and len(x['bbox']) >= 2 else 9999)
            
            # Group into rows (lines with similar Y coordinates are in the same row)
            current_row = []
            current_y = None
            row_tolerance = 40  # Increased tolerance to catch more lines in same row
            
            for line_data in data_lines:
                bbox = line_data['bbox']
                if not bbox or len(bbox) < 2:
                    continue
                
                y_pos = bbox[1]
                
                # If this line is far enough from the current row, start a new row
                if current_y is None or abs(y_pos - current_y) > row_tolerance:
                    # Process previous row if it exists
                    if current_row:
                        parsed_row = self._parse_row_from_lines(current_row)
                        if parsed_row:
                            rows.append(parsed_row)
                        else:
                            # Even if parsing failed, try to extract at least serial number
                            # This ensures we don't lose rows completely
                            all_text = ' '.join(item.get('text', '') for item in current_row).strip()
                            # Try to find serial number (1-4 digits, not voter ID)
                            serial_number = None
                            for item in current_row:
                                text = item.get('text', '').strip()
                                # Skip age patterns
                                if text.startswith(':') and re.match(r':\d+', text):
                                    continue
                                digits = re.sub(r'[^0-9]', '', text)
                                is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', text)
                                # Serial numbers are 1-4 digits, not voter IDs
                                if digits and len(digits) >= 1 and len(digits) <= 4 and not is_voter_id:
                                    # If it's a standalone number or very short, likely serial number
                                    if len(text) <= 5 or re.match(r'^\d+$', text):
                                        serial_number = digits
                                        break
                            
                            if serial_number:
                                rows.append({
                                    'serialNumber': serial_number,
                                    'voterId': '',
                                    'name': '',
                                    'relativeName': '',
                                    'houseNumber': '',
                                    'age': '',
                                    'gender': '',
                                    'yadiBhag': ''
                                })
                    
                    # Start new row
                    current_row = [line_data]
                    current_y = y_pos
                else:
                    # Add to current row
                    current_row.append(line_data)
            
            # Process last row
            if current_row:
                parsed_row = self._parse_row_from_lines(current_row)
                if parsed_row:
                    rows.append(parsed_row)
                else:
                    # Even if parsing failed, try to extract at least serial number
                    all_text = ' '.join(item.get('text', '') for item in current_row).strip()
                    # Try to find serial number (1-4 digits, not voter ID)
                    serial_number = None
                    for item in current_row:
                        text = item.get('text', '').strip()
                        # Skip age patterns
                        if text.startswith(':') and re.match(r':\d+', text):
                            continue
                        digits = re.sub(r'[^0-9]', '', text)
                        is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', text)
                        # Serial numbers are 1-4 digits, not voter IDs
                        if digits and len(digits) >= 1 and len(digits) <= 4 and not is_voter_id:
                            # If it's a standalone number or very short, likely serial number
                            if len(text) <= 5 or re.match(r'^\d+$', text):
                                serial_number = digits
                                break
                    
                    if serial_number:
                        rows.append({
                            'serialNumber': serial_number,
                            'voterId': '',
                            'name': '',
                            'relativeName': '',
                            'houseNumber': '',
                            'age': '',
                            'gender': '',
                            'yadiBhag': ''
                        })
        
        # If bounding box parsing didn't work or we don't have lines, try simple text-based fallback
        # This is a last resort - should rarely be needed if bounding boxes are available
        if not rows and text:
            # Try to extract rows by looking for numeric patterns (serial numbers)
            # This is a very basic fallback that doesn't rely on markers
            import re
            # Look for patterns that might indicate rows (sequences of text with numbers)
            # This is not ideal but better than nothing
            lines_text = text.split('\n')
            potential_rows = []
            current_row_text = []
            
            for line in lines_text:
                line = line.strip()
                if not line:
                    continue
                # If line starts with digits, might be a new row
                if re.match(r'^\d+', line):
                    if current_row_text:
                        potential_rows.append(' '.join(current_row_text))
                    current_row_text = [line]
                else:
                    current_row_text.append(line)
            
            if current_row_text:
                potential_rows.append(' '.join(current_row_text))
            
            # Try to parse these as rows (very basic - just extract what we can)
            for row_text in potential_rows:
                row_text = row_text.strip()
                if not row_text:
                    continue
                
                # Skip if it looks like header text
                if any(word in row_text.lower() for word in ['serial', 'number', 'name', 'age', 'gender', 'house', 'relative', 'yadi', 'bhag', 'voter', 'id', 'epic']):
                    if not re.search(r'\d', row_text):
                        continue
                
                # Try to extract serial number (first numeric sequence)
                serial_match = re.search(r'\b(\d+)\b', row_text)
                if serial_match:
                    serial_number = serial_match.group(1)
                    # For fallback, we can't reliably extract other fields without structure
                    # So we'll just create a minimal row with serial number
                    rows.append({
                        'serialNumber': serial_number,
                        'name': '',
                        'relativeName': '',
                        'houseNumber': '',
                        'age': '',
                        'gender': '',
                        'yadiBhag': ''
                    })
        
        return {'rows': rows}
    
    def _parse_row_from_lines(self, row_lines: List[Dict]) -> Dict:
        """
        Parse a single row from OCR lines using pure bounding box approach
        Groups text by X position to identify columns, no dependency on # markers
        """
        import re
        
        if not row_lines:
            return None
        
        # Sort lines by X position (left to right)
        row_lines.sort(key=lambda x: x['bbox'][0] if x['bbox'] and len(x['bbox']) >= 1 else 0)
        
        # Extract text and X positions
        text_items = []
        for line in row_lines:
            bbox = line.get('bbox', [])
            text = line.get('text', '').strip()
            if text and bbox and len(bbox) >= 1:
                x_pos = bbox[0]  # Left edge
                # Remove markers from text (##, #, etc.)
                cleaned_text = re.sub(r'^#+\s*', '', text).strip()
                cleaned_text = re.sub(r'\s*#+\s*', ' ', cleaned_text).strip()
                if cleaned_text:
                    text_items.append({
                        'text': cleaned_text,
                        'x': x_pos,
                        'bbox': bbox
                    })
        
        if not text_items:
            return None
        
        # Group text items into columns based on X position
        # Expected columns: Serial, Name, Relative Name, House Number, Age, Gender, Yadi Bhag
        # We'll use clustering to group items that are close together horizontally
        # Use adaptive tolerance - start with smaller tolerance and increase if needed
        columns = []
        if not text_items:
            return None
        
        current_column = [text_items[0]]
        # Start with smaller tolerance for better column separation
        column_tolerance = 80  # Pixels - items within this distance are in same column
        
        for i in range(1, len(text_items)):
            prev_x = text_items[i-1]['x']
            curr_x = text_items[i]['x']
            
            # Calculate distance between items
            x_distance = curr_x - prev_x
            
            # If items are close together, they're in the same column
            if x_distance < column_tolerance:
                current_column.append(text_items[i])
            else:
                # New column detected
                if current_column:
                    columns.append(current_column)
                current_column = [text_items[i]]
        
        # Add last column
        if current_column:
            columns.append(current_column)
        
        # If we have too few columns, try with larger tolerance (columns might be merged)
        if len(columns) < 4 and len(text_items) > 4:
            # Retry with larger tolerance
            columns = []
            current_column = [text_items[0]]
            column_tolerance = 150  # Larger tolerance
            
            for i in range(1, len(text_items)):
                prev_x = text_items[i-1]['x']
                curr_x = text_items[i]['x']
                
                if curr_x - prev_x < column_tolerance:
                    current_column.append(text_items[i])
                else:
                    if current_column:
                        columns.append(current_column)
                    current_column = [text_items[i]]
            
            if current_column:
                columns.append(current_column)
        
        # Map columns to fields based on position (left to right)
        # Expected: Serial (0), Voter ID (1, if present), Name (2 or 1), Relative Name (3 or 2), House Number (4 or 3), Age (5 or 4), Gender (6 or 5), Yadi Bhag (7 or 6)
        serial_number = ''
        voter_id = ''
        name = ''
        relative_name = ''
        house_number = ''
        age_field = ''
        gender_field = ''
        yadi_bhag_field = ''
        
        # Detect if voter ID column is present (usually alphanumeric pattern like IBM3510377)
        has_voter_id = False
        if len(columns) >= 2:
            # Check if second column looks like a voter ID (alphanumeric, typically 8-12 chars)
            second_col_text = ' '.join(item['text'] for item in columns[1]).strip()
            # Voter ID pattern: alphanumeric, usually starts with letter, contains numbers
            # More flexible pattern: at least 1 letter followed by at least 3 digits
            voter_id_pattern = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', second_col_text)
            if voter_id_pattern:
                has_voter_id = True
                print(f"[DEBUG] Detected voter ID column: '{second_col_text}'")
            else:
                # Also check if it's a known voter ID format (IBM, ABC, etc.)
                if re.match(r'^[A-Z]{2,4}[0-9]', second_col_text.upper()):
                    has_voter_id = True
                    print(f"[DEBUG] Detected voter ID column (alternative pattern): '{second_col_text}'")
        
        # First pass: Pattern-based detection for fields with clear patterns
        # This helps when columns are missing or misaligned
        pattern_matched_columns = {}  # Track which columns were matched by pattern
        
        for i, column_items in enumerate(columns):
            column_text = ' '.join(item['text'] for item in column_items).strip()
            
            # Clean column text
            column_text = column_text.lstrip("'\"`").rstrip("'\"`").strip()
            column_text = column_text.lstrip(':').strip()
            
            if not column_text:
                continue
            
            # Pattern-based detection (priority over position)
            # Yadi bhag: numbers with slashes (e.g., 192/351/418)
            if re.search(r'\d+/\d+/\d+', column_text):
                if not yadi_bhag_field:
                    yadi_bhag_field = column_text
                    pattern_matched_columns[i] = 'yadiBhag'
                    print(f"[DEBUG] Pattern match: Column {i} = Yadi Bhag: '{column_text}'")
            
            # Voter ID: alphanumeric starting with letters (e.g., IBM7321110, IBM0521046)
            # Check multiple patterns to catch all variations
            if not voter_id:
                # Pattern 1: 2-4 letters followed by 3+ digits (e.g., IBM0521046)
                if re.match(r'^[A-Za-z]{2,4}[0-9]{3,}', column_text):
                    voter_id = column_text
                    pattern_matched_columns[i] = 'voterId'
                    has_voter_id = True  # Update flag
                    print(f"[DEBUG] Pattern match: Column {i} = Voter ID: '{column_text}'")
                # Pattern 2: Check if it contains alphanumeric pattern anywhere in the text
                # This handles cases where voter ID might be split or have extra text
                elif re.search(r'[A-Za-z]{2,4}[0-9]{3,}', column_text):
                    # Extract the voter ID pattern from the text
                    match = re.search(r'[A-Za-z]{2,4}[0-9]{3,}', column_text)
                    if match:
                        voter_id = match.group(0)
                        pattern_matched_columns[i] = 'voterId'
                        has_voter_id = True
                        print(f"[DEBUG] Pattern match (extracted): Column {i} = Voter ID: '{voter_id}' (from: '{column_text}')")
                # Pattern 3: Check for known prefixes (IBM, HBG, etc.) followed by digits
                elif re.match(r'^(IBM|HBG|ABC|XYZ|NOW)[0-9]{3,}', column_text.upper()):
                    voter_id = column_text
                    pattern_matched_columns[i] = 'voterId'
                    has_voter_id = True
                    print(f"[DEBUG] Pattern match (known prefix): Column {i} = Voter ID: '{column_text}'")
        
        # Second pass: Position-based mapping (for fields not matched by pattern)
        for i, column_items in enumerate(columns):
            column_text = ' '.join(item['text'] for item in column_items).strip()
            
            # Clean column text
            column_text = column_text.lstrip("'\"`").rstrip("'\"`").strip()
            column_text = column_text.lstrip(':').strip()
            
            if not column_text:
                continue
            
            # Skip if already matched by pattern
            if i in pattern_matched_columns:
                continue
            
            # Map to field based on position
            if i == 0:
                # First column: Serial number
                # But make sure it's not a voter ID (alphanumeric)
                # Serial numbers are typically 1-4 digits, not 7+ digits
                digits_only = re.sub(r'[^0-9]', '', column_text)
                # Check if it's a voter ID pattern (alphanumeric with letters)
                is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', column_text)
                # If it's a voter ID or has too many digits (7+), skip it
                if is_voter_id or (digits_only and len(digits_only) > 6):
                    # This is likely a voter ID, not a serial number
                    # Check if it's actually a voter ID and assign it
                    if is_voter_id and not voter_id:
                        voter_id = column_text
                        has_voter_id = True
                        pattern_matched_columns[i] = 'voterId'
                        print(f"[DEBUG] Column 0 is voter ID, not serial: '{column_text}'")
                    # Don't assign as serial number - will be found later
                    # Continue to next iteration to find actual serial number
                    continue
                else:
                    # It's a valid serial number (short numeric, 1-4 digits)
                    # Make sure it's not too long
                    if digits_only and len(digits_only) <= 4:
                        serial_number = column_text
                    else:
                        # Too many digits - might be voter ID number, skip it
                        print(f"[DEBUG] Column 0 has too many digits ({len(digits_only)}), skipping as serial: '{column_text}'")
                        continue
            elif i == 1:
                if has_voter_id:
                    # Second column: Voter ID (if not already set by pattern)
                    if not voter_id:
                        # Try to extract voter ID pattern even if detection failed
                        voter_id_match = re.search(r'[A-Za-z]{2,4}[0-9]{3,}', column_text)
                        if voter_id_match:
                            voter_id = voter_id_match.group(0)
                            print(f"[DEBUG] Position match: Column {i} = Voter ID (extracted): '{voter_id}' (from: '{column_text}')")
                        else:
                            voter_id = column_text
                            print(f"[DEBUG] Position match: Column {i} = Voter ID: '{voter_id}'")
                else:
                    # Second column: Name (no voter ID column)
                    name = column_text
            elif i == 2:
                if has_voter_id:
                    # Third column: Name (voter ID present)
                    name = column_text
                else:
                    # Third column: Relative Name (no voter ID)
                    relative_name = column_text
            elif i == 3:
                if has_voter_id:
                    # Fourth column: Relative Name
                    relative_name = column_text
                else:
                    # Fourth column: House Number
                    house_number = column_text
            elif i == 4:
                if has_voter_id:
                    # Fifth column: House Number
                    house_number = column_text
                else:
                    # Fifth column: Age
                    age_field = column_text
            elif i == 5:
                if has_voter_id:
                    # Sixth column: Age
                    age_field = column_text
                else:
                    # Sixth column: Gender
                    gender_field = column_text
            elif i == 6:
                if has_voter_id:
                    # Seventh column: Gender
                    gender_field = column_text
                else:
                    # Seventh column: Yadi Bhag
                    if not yadi_bhag_field:
                        yadi_bhag_field = column_text
            elif i == 7:
                if has_voter_id:
                    # Eighth column: Yadi Bhag
                    if not yadi_bhag_field:
                        yadi_bhag_field = column_text
        
        # Pattern-based field detection for missing or misaligned columns
        # This helps when some columns are missing (e.g., House Number)
        # Check all columns for patterns to fill missing fields
        for col_idx, column_items in enumerate(columns):
            col_text = ' '.join(item['text'] for item in column_items).strip()
            if not col_text:
                continue
            
            # Voter ID pattern: Check all columns if not already found
            # This is critical - voter ID might be in any column if column detection failed
            if not voter_id:
                # Pattern 1: 2-4 letters followed by 3+ digits (e.g., IBM0521046)
                if re.match(r'^[A-Za-z]{2,4}[0-9]{3,}', col_text):
                    voter_id = col_text
                    has_voter_id = True
                    print(f"[DEBUG] Found Voter ID by pattern (fallback): '{voter_id}' in column {col_idx}")
                # Pattern 2: Check if it contains alphanumeric pattern anywhere
                elif re.search(r'[A-Za-z]{2,4}[0-9]{3,}', col_text):
                    match = re.search(r'[A-Za-z]{2,4}[0-9]{3,}', col_text)
                    if match:
                        voter_id = match.group(0)
                        has_voter_id = True
                        print(f"[DEBUG] Found Voter ID by pattern (extracted, fallback): '{voter_id}' in column {col_idx} (from: '{col_text}')")
                # Pattern 3: Known prefixes (IBM, HBG, etc.)
                elif re.match(r'^(IBM|HBG|ABC|XYZ|NOW)[0-9]{3,}', col_text.upper()):
                    voter_id = col_text
                    has_voter_id = True
                    print(f"[DEBUG] Found Voter ID by pattern (known prefix, fallback): '{voter_id}' in column {col_idx}")
            
            # Yadi bhag pattern: numbers with slashes (e.g., 192/351/418)
            if not yadi_bhag_field and re.search(r'\d+/\d+/\d+', col_text):
                yadi_bhag_field = col_text
                print(f"[DEBUG] Found Yadi Bhag by pattern: '{yadi_bhag_field}' in column {col_idx}")
            
            # Age pattern: usually 1-3 digits, might be in Marathi numerals
            # If we don't have age yet and this column is mostly digits
            if not age_field:
                # Check if it's a simple number (1-3 digits, possibly with Marathi numerals)
                digits_only = re.sub(r'[^0-9०-९]', '', col_text)
                if digits_only and len(digits_only) <= 3:
                    # Check if it's not already assigned to another field
                    # and it's in a position that could be age (after name/relative name)
                    if col_idx >= 3:  # Age usually comes after name fields
                        age_field = col_text
                        print(f"[DEBUG] Found Age by pattern: '{age_field}' in column {col_idx}")
            
            # House number pattern: might have slashes, hyphens, or be simple numbers
            # Usually comes before age
            if not house_number and col_idx >= 2 and col_idx < 6:
                # Check if it contains numbers and separators (/, -, etc.)
                if re.search(r'\d', col_text) and (re.search(r'[/-]', col_text) or len(col_text) <= 10):
                    # Make sure it's not already assigned
                    if col_text != age_field and col_text != gender_field:
                        house_number = col_text
                        print(f"[DEBUG] Found House Number by pattern: '{house_number}' in column {col_idx}")
        
        # If we have fewer columns, try to identify fields by content patterns
        # This handles cases where some columns might be missing or merged
        if not serial_number and columns:
            # Try to find serial number (should be numeric, usually first)
            # IMPORTANT: Serial numbers are typically 1-4 digits, NOT 7+ digits
            # Voter IDs have 7+ digits, so exclude those
            for col_idx, column_items in enumerate(columns):
                col_text = ' '.join(item['text'] for item in column_items).strip()
                # Check if it looks like a serial number (mostly digits, but SHORT)
                digits = re.sub(r'[^0-9]', '', col_text)
                # Serial numbers are typically 1-4 digits, voter IDs are 7+ digits
                # Also check if it's alphanumeric (voter ID pattern)
                is_voter_id_pattern = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', col_text)
                # CRITICAL: Never extract 7+ digit numbers as serial numbers (these are voter ID numbers)
                if (digits and len(digits) >= 1 and len(digits) <= 4 and 
                    col_idx < 2 and not is_voter_id_pattern and len(digits) <= 4):  # First column, short number, not voter ID, max 4 digits
                    serial_number = digits
                    # Remove this column from further processing
                    columns = [c for i, c in enumerate(columns) if i != col_idx]
                    break
                elif is_voter_id_pattern and not voter_id:
                    # This is a voter ID, not a serial number
                    voter_id = col_text
                    has_voter_id = True
                    print(f"[DEBUG] Found voter ID in column {col_idx} (not serial): '{col_text}'")
                elif digits and len(digits) > 6:
                    # This is definitely a voter ID number (7+ digits), not a serial number
                    # Extract voter ID if it's alphanumeric
                    if re.search(r'[A-Za-z]', col_text):
                        if not voter_id:
                            voter_id = col_text
                            has_voter_id = True
                            print(f"[DEBUG] Found voter ID (long number) in column {col_idx}: '{col_text}'")
                    # Don't use as serial number - skip it
        
        # Clean serial number
        if serial_number:
            serial_clean = serial_number.replace('|', '').replace('l', '1').replace('O', '0').replace('I', '1')
            digits_only = re.sub(r'[^0-9]', '', serial_clean)
            if digits_only:
                serial_number = digits_only
            else:
                serial_number = serial_clean.strip()
        
        # Don't return None if serial_number is missing - try to extract it from text
        if not serial_number:
            # Try to find serial number in all text items
            # IMPORTANT: Serial numbers are 1-4 digits, NOT voter IDs (7+ digits)
            # Also exclude age values (which might be 2-3 digits)
            
            # First pass: Try leftmost items (more likely to be serial number)
            if text_items:
                min_x = min(item.get('x', 0) for item in text_items)
                max_x = max(item.get('x', 0) for item in text_items)
                x_range = max_x - min_x if max_x > min_x else 1
                leftmost_threshold = x_range * 0.4  # Increased to 40% for better coverage
            else:
                min_x = 0
                max_x = 1
                x_range = 1
                leftmost_threshold = 1
            
            # Try leftmost items first
            for item in sorted(text_items, key=lambda x: x.get('x', 9999)):
                text = item['text'].strip()
                # Skip if it's an age pattern (starts with colon like ":49")
                if text.startswith(':') and re.match(r':\d+', text):
                    continue
                # Check if it's a number (serial number)
                digits = re.sub(r'[^0-9]', '', text)
                # Check if it's a voter ID pattern (alphanumeric)
                is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', text)
                # Serial numbers are 1-4 digits, voter IDs are 7+ digits
                item_x = item.get('x', 9999)
                is_leftmost = (item_x - min_x) < leftmost_threshold
                
                if (digits and len(digits) >= 1 and len(digits) <= 4 and 
                    not is_voter_id and is_leftmost):
                    serial_number = digits
                    break
            
            # Second pass: If still not found, try all items (more lenient)
            if not serial_number:
                for item in text_items:
                    text = item['text'].strip()
                    # Skip if it's an age pattern (starts with colon like ":49")
                    if text.startswith(':') and re.match(r':\d+', text):
                        continue
                    # Check if it's a number (serial number)
                    digits = re.sub(r'[^0-9]', '', text)
                    # Check if it's a voter ID pattern (alphanumeric)
                    is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', text)
                    # Serial numbers are 1-4 digits, voter IDs are 7+ digits
                    # More lenient: accept if it's a 2-4 digit number that's not a voter ID
                    if (digits and len(digits) >= 2 and len(digits) <= 4 and 
                        not is_voter_id):
                        # Make sure it's not part of a larger number (like part of voter ID)
                        # If the original text is just digits, it's likely a serial number
                        if re.match(r'^\d+$', text) or (len(text) <= 4 and digits == text.replace(' ', '')):
                            serial_number = digits
                            break
        
        # If still no serial number, try one more time with even more lenient criteria
        # This is important for rows where serial number might be in an unexpected position
        if not serial_number:
            for item in text_items:
                text = item['text'].strip()
                digits = re.sub(r'[^0-9]', '', text)
                # Very lenient: any 1-4 digit number that's not clearly a voter ID
                is_voter_id = re.match(r'^[A-Za-z]{1,4}[0-9]{3,}', text)
                # Skip age patterns
                is_age_pattern = text.startswith(':') and re.match(r':\d+', text)
                
                if (digits and len(digits) >= 1 and len(digits) <= 4 and 
                    not is_voter_id and not is_age_pattern):
                    # If it's a standalone number or very short text, likely a serial number
                    if len(text) <= 5:  # Very short text is likely a serial number
                        serial_number = digits
                        break
        
        # If still no serial number, return None (can't match without serial)
        # But log a warning so we know rows are being skipped
        if not serial_number:
            all_text = ' '.join(item.get('text', '') for item in text_items).strip()
            print(f"[WARNING] No serial number found in row, skipping. Text: '{all_text[:100]}'")
            return None
        
        # Handle case where age and gender are combined (e.g., "७० : पु")
        # Check if age_field contains gender pattern
        gender_patterns = [r':\s*पु', r':\s*स्त्री', r':\s*पू', r':\s*प', r'पु\s*$', r'स्त्री\s*$', r'पू\s*$']
        age_value = age_field
        gender_value = gender_field
        
        # If age field contains gender pattern, split it
        for pattern in gender_patterns:
            match = re.search(pattern, age_field, re.IGNORECASE)
            if match:
                # Split age and gender
                split_pos = match.start()
                age_value = age_field[:split_pos].strip()
                gender_from_age = age_field[split_pos:].strip().lstrip(':').strip()
                # If gender_field is empty or contains yadi_bhag pattern, use gender_from_age
                if not gender_value or re.search(r'\d+/\d+/\d+', gender_value):
                    gender_value = gender_from_age
                break
        
        # Handle case where gender field contains yadi_bhag pattern (e.g., "192/352/443")
        # This means gender is missing and yadi_bhag is in the wrong position
        if gender_value and re.search(r'\d+/\d+/\d+', gender_value):
            # This is actually yadi_bhag, not gender
            if not yadi_bhag_field:
                yadi_bhag_field = gender_value
            gender_value = ''
            # Check if age field might contain gender
            for pattern in gender_patterns:
                match = re.search(pattern, age_field, re.IGNORECASE)
                if match:
                    split_pos = match.start()
                    gender_value = age_field[split_pos:].strip().lstrip(':').strip()
                    age_value = age_field[:split_pos].strip()
                    break
        
        # Clean fields
        if house_number:
            house_number = house_number.lstrip(':').strip()
        
        # Clean age: extract only digits
        age = ''
        if age_value:
            age_clean = age_value.replace('|', '').replace('l', '1').replace('O', '0').replace('I', '1')
            age_clean = age_clean.lstrip(':').strip()
            # Remove any remaining gender text
            for pattern in gender_patterns:
                age_clean = re.sub(pattern, '', age_clean, flags=re.IGNORECASE).strip()
            digits_only = re.sub(r'[^0-9]', '', age_clean)
            if digits_only:
                age = digits_only
            else:
                age = age_clean.strip()
        
        # Clean gender: remove colons and extra spaces
        gender = ''
        if gender_value:
            gender = gender_value.lstrip(':').strip()
            # Remove any yadi_bhag patterns that might have leaked in
            gender = re.sub(r'\d+/\d+/\d+', '', gender).strip()
        
        # Clean yadi_bhag: remove colons and extra spaces
        yadi_bhag = ''
        if yadi_bhag_field:
            yadi_bhag = yadi_bhag_field.lstrip(':').strip()
            # Ensure it matches yadi_bhag pattern (numbers with slashes)
            # Pattern: at least one digit, slash, at least one digit, slash, at least one digit
            if re.search(r'\d+/\d+/\d+', yadi_bhag):
                # Extract the pattern (in case there's extra text)
                match = re.search(r'(\d+/\d+/\d+)', yadi_bhag)
                if match:
                    yadi_bhag = match.group(1)
            else:
                yadi_bhag = ''
        
        # FINAL PASS: If any fields are still missing, scan ALL text items aggressively
        # This ensures we don't miss any data even if column detection failed
        if not name or not relative_name or not age_field or not gender_field or not yadi_bhag:
            # Get all text from all items in the row
            all_text = ' '.join(item['text'] for item in text_items).strip()
            
            # Try to extract missing fields from the full text
            if not name:
                # Name is usually the longest text field after serial/voter ID
                # Look for text that's not a number, not a voter ID, and not too short
                # Sort by length (longest first) to get the most likely name
                candidate_names = []
                for item in text_items:
                    text = item['text'].strip()
                    # Remove "L" prefix/suffix for candidate selection
                    text_clean = re.sub(r'^[Ll]{1,2}\s+', '', text).strip()
                    text_clean = re.sub(r'\s+[Ll]{1,2}$', '', text_clean).strip()
                    # Skip if it's a number, voter ID, or too short
                    # Also skip if it's just "L" or "LL"
                    if (text_clean and 
                        not re.match(r'^\d+$', text_clean) and 
                        not re.match(r'^[A-Za-z]{2,4}[0-9]{3,}', text_clean) and 
                        len(text_clean) > 3 and
                        text_clean != serial_number and 
                        text_clean != voter_id and 
                        text_clean != relative_name and
                        not re.search(r'\d+/\d+/\d+', text_clean) and  # Not yadi_bhag
                        not text_clean.startswith(':') and  # Not age (like ":49")
                        text_clean not in ['स्त्री', 'पु', 'पू']):  # Not gender
                        candidate_names.append((len(text_clean), text_clean))
                
                if candidate_names:
                    # Sort by length (longest first) and take the first one
                    candidate_names.sort(reverse=True)
                    name = candidate_names[0][1]
            
            if not relative_name:
                # Relative name is usually after name
                name_found = False
                for item in text_items:
                    text = item['text'].strip()
                    # Remove "L" prefix/suffix
                    text_clean = re.sub(r'^[Ll]{1,2}\s+', '', text).strip()
                    text_clean = re.sub(r'\s+[Ll]{1,2}$', '', text_clean).strip()
                    name_clean = re.sub(r'^[Ll]{1,2}\s+', '', name).strip() if name else ''
                    name_clean = re.sub(r'\s+[Ll]{1,2}$', '', name_clean).strip() if name_clean else ''
                    
                    if name_found and text_clean != name_clean:
                        # Check if it's a valid relative name (not number, not voter ID, not yadi_bhag)
                        if (text_clean and
                            not re.match(r'^\d+$', text_clean) and 
                            not re.match(r'^[A-Za-z]{2,4}[0-9]{3,}', text_clean) and
                            not re.search(r'\d+/\d+/\d+', text_clean) and
                            text_clean != serial_number and 
                            text_clean != voter_id and
                            not text_clean.startswith(':') and  # Not age
                            text_clean not in ['स्त्री', 'पु', 'पू']):  # Not gender
                            relative_name = text_clean
                            break
                    if text_clean == name_clean and name_clean:
                        name_found = True
                
                # If still not found, try finding the second longest text that's not name
                if not relative_name:
                    candidate_rel_names = []
                    for item in text_items:
                        text = item['text'].strip()
                        # Remove "L" prefix/suffix
                        text_clean = re.sub(r'^[Ll]{1,2}\s+', '', text).strip()
                        text_clean = re.sub(r'\s+[Ll]{1,2}$', '', text_clean).strip()
                        name_clean = re.sub(r'^[Ll]{1,2}\s+', '', name).strip() if name else ''
                        name_clean = re.sub(r'\s+[Ll]{1,2}$', '', name_clean).strip() if name_clean else ''
                        
                        if (text_clean and
                            text_clean != name_clean and
                            not re.match(r'^\d+$', text_clean) and 
                            not re.match(r'^[A-Za-z]{2,4}[0-9]{3,}', text_clean) and
                            not re.search(r'\d+/\d+/\d+', text_clean) and
                            text_clean != serial_number and 
                            text_clean != voter_id and
                            not text_clean.startswith(':') and  # Not age
                            text_clean not in ['स्त्री', 'पु', 'पू'] and  # Not gender
                            len(text_clean) > 2):
                            candidate_rel_names.append((len(text_clean), text_clean))
                    
                    if candidate_rel_names:
                        candidate_rel_names.sort(reverse=True)
                        relative_name = candidate_rel_names[0][1]
            
            if not yadi_bhag:
                # Scan all text for yadi_bhag pattern
                yadi_match = re.search(r'\d+/\d+/\d+', all_text)
                if yadi_match:
                    yadi_bhag = yadi_match.group(0)
            
            if not age_field:
                # Look for 1-3 digit numbers that aren't serial numbers
                for item in text_items:
                    text = item['text'].strip()
                    digits = re.sub(r'[^0-9]', '', text)
                    if digits and len(digits) <= 3 and digits != serial_number:
                        # Make sure it's not part of yadi_bhag
                        if not re.search(r'\d+/\d+/\d+', text):
                            age_field = text
                            break
            
            if not gender_field:
                # Look for gender keywords
                gender_keywords = ['पु', 'स्त्री', 'पू', 'पुरुष', 'महिला']
                for item in text_items:
                    text = item['text'].strip()
                    if any(keyword in text for keyword in gender_keywords):
                        gender_field = text
                        break
            
            if not house_number:
                # Look for house number patterns (numbers with / or -)
                for item in text_items:
                    text = item['text'].strip()
                    # Check if it contains numbers and separators
                    if re.search(r'\d', text) and (re.search(r'[/-]', text) or len(text) <= 10):
                        # Make sure it's not yadi_bhag, age, or serial
                        if (not re.search(r'\d+/\d+/\d+', text) and 
                            text != age_field and 
                            text != serial_number):
                            house_number = text
                            break
        
        # Clean name and relative name: remove "L" and "LL" prefixes/suffixes
        # These are often OCR artifacts or relationship indicators that shouldn't be in the name
        if name:
            # Remove "L" or "LL" at the start or end (with optional spaces)
            name = re.sub(r'^[Ll]{1,2}\s+', '', name).strip()  # Remove at start
            name = re.sub(r'\s+[Ll]{1,2}$', '', name).strip()  # Remove at end
            name = re.sub(r'^[Ll]{1,2}$', '', name).strip()  # Remove if entire field is just "L" or "LL"
        
        if relative_name:
            # Remove "L" or "LL" at the start or end (with optional spaces)
            relative_name = re.sub(r'^[Ll]{1,2}\s+', '', relative_name).strip()  # Remove at start
            relative_name = re.sub(r'\s+[Ll]{1,2}$', '', relative_name).strip()  # Remove at end
            relative_name = re.sub(r'^[Ll]{1,2}$', '', relative_name).strip()  # Remove if entire field is just "L" or "LL"
        
        # Clean voter ID: fix common OCR errors (1 vs I, 0 vs O)
        cleaned_voter_id = ''
        if voter_id:
            # Fix common OCR errors: '1' at start of alphanumeric should be 'I'
            # Pattern: if starts with '1' followed by letters, likely should be 'I'
            cleaned_voter_id = voter_id.strip()
            # Fix: 1BM -> IBM, 1BM3510377 -> IBM3510377
            if re.match(r'^1[A-Z]', cleaned_voter_id):
                cleaned_voter_id = 'I' + cleaned_voter_id[1:]
            # Fix: 0 vs O in middle (less common, but can happen)
            # Keep as-is for now, as O in middle of voter ID is rare
        
        return {
            'serialNumber': serial_number,
            'voterId': cleaned_voter_id,
            'name': name,
            'relativeName': relative_name,
            'houseNumber': house_number,
            'age': age,
            'gender': gender,
            'yadiBhag': yadi_bhag
        }
    
    def match_rows_by_serial(
        self,
        table_rows: List[Dict],
        extracted_serials: List[str]
    ) -> Dict[str, Dict]:
        """
        Match table rows with extracted serial numbers
        
        Args:
            table_rows: Rows from table recognition
            extracted_serials: List of serial numbers extracted via OCR
        
        Returns:
            Dict mapping serial_number -> row_data
        """
        matched = {}
        
        # Normalize serial numbers (remove spaces, brackets, special chars, extract digits)
        def normalize_serial(s):
            if not s:
                return ''
            # Convert to string and strip
            s = str(s).strip()
            # Remove common OCR errors: |, l, O, I
            s = s.replace('|', '').replace('l', '1').replace('O', '0').replace('I', '1')
            # Remove brackets, spaces, special characters
            s = s.replace('[', '').replace(']', '').replace('(', '').replace(')', '')
            # Extract only digits (serial numbers should be numeric)
            import re
            digits_only = re.sub(r'[^0-9]', '', s)
            return digits_only if digits_only else s.strip()
        
        # Also create a fuzzy matching function for cases like "6d" vs "6"
        def fuzzy_match_serial(table_serial, extracted_serial):
            table_norm = normalize_serial(table_serial)
            extracted_norm = normalize_serial(extracted_serial)
            
            # Exact match
            if table_norm == extracted_norm:
                return True
            
            # Try removing trailing letters (e.g., "6D" -> "6")
            table_digits = ''.join(c for c in table_norm if c.isdigit())
            extracted_digits = ''.join(c for c in extracted_norm if c.isdigit())
            if table_digits and extracted_digits and table_digits == extracted_digits:
                return True
            
            # Try removing leading letters (e.g., "A6" -> "6")
            if table_norm.endswith(extracted_digits) or extracted_norm.endswith(table_digits):
                return True
            
            return False
        
        normalized_extracted = {normalize_serial(s): s for s in extracted_serials}
        
        unmatched_table_serials = []
        for row in table_rows:
            table_serial = normalize_serial(row.get('serialNumber', ''))
            if table_serial:
                # Try exact match first
                if table_serial in normalized_extracted:
                    original_serial = normalized_extracted[table_serial]
                    matched[original_serial] = row
                else:
                    # Try fuzzy matching
                    found_match = False
                    for extracted_norm, original_serial in normalized_extracted.items():
                        if fuzzy_match_serial(table_serial, extracted_norm):
                            matched[original_serial] = row
                            found_match = True
                            break
                    
                    if not found_match:
                        unmatched_table_serials.append(table_serial)
        
        return matched

