"""
Enhanced OCR Processor with 400 DPI
Local OCR processing for high-quality extraction
"""

import os
import io
import re
import base64
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
from typing import Dict, List, Optional, Tuple

class OCRProcessor400DPI:
    """
    High-quality OCR processor using 400 DPI
    Uses local Tesseract OCR for all processing
    """
    
    def __init__(self):
        """Initialize OCR processor"""
        self.dpi = 400  # High DPI for better OCR
        
        # Voter ID patterns (Indian EPIC format)
        self.voter_id_patterns = [
            r'\b[A-Z]{3}[0-9]{7}\b',           # Standard: ABC1234567
            r'\b[A-Z]{3}\s*[0-9]{7}\b',        # With space: ABC 1234567
            r'\b[A-Z]{2,4}[0-9]{6,8}\b',       # Flexible: 2-4 letters + 6-8 digits
        ]
        
    
    def preprocess_image(self, image: Image.Image, for_ocr: bool = True) -> Image.Image:
        """
        Preprocess image for better OCR results
        
        Args:
            image: PIL Image
            for_ocr: If True, optimize for text recognition
        
        Returns:
            Preprocessed PIL Image
        """
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        if for_ocr:
            # Convert to grayscale
            image = image.convert('L')
            
            # Increase contrast
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(2.0)
            
            # Increase sharpness
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.5)
            
            # Remove noise
            image = image.filter(ImageFilter.MedianFilter(size=3))
        
        return image
    
    def extract_voter_id(self, image: Image.Image, pdf_page=None, rect=None) -> Dict:
        """
        Extract voter ID from image using local OCR
        
        Args:
            image: PIL Image or None
            pdf_page: PyMuPDF page object (optional)
            rect: PyMuPDF Rect object (optional)
        
        Returns:
            Dict with voter_id, confidence, method
        """
        try:
            # Extract high-quality image if pdf_page and rect provided
            if pdf_page and rect:
                pix = pdf_page.get_pixmap(clip=rect, dpi=self.dpi)
                image_bytes = pix.tobytes("png")
                image = Image.open(io.BytesIO(image_bytes))
            
            if not image:
                return {
                    'voter_id': '',
                    'confidence': 0.0,
                    'method': 'error',
                    'raw_text': ''
                }
            
            # Preprocess image
            processed_img = self.preprocess_image(image, for_ocr=True)
            
            # Use local Tesseract OCR with high quality settings
            print(f"      OCR: Tesseract (400 DPI)...")
            raw_text = pytesseract.image_to_string(
                processed_img,
                lang='eng+hin',
                config='--psm 6 --oem 3'  # PSM 6: uniform block of text, OEM 3: default
            ).strip()
            
            print(f"      Raw OCR: '{raw_text[:50]}...'")
            
            # Extract voter ID using patterns
            voter_id, confidence = self._extract_voter_id_from_text(raw_text)
            
            print(f"      Extracted: '{voter_id}' (confidence: {confidence:.2f})")
            
            # Return result
            print(f"      ✓ Local OCR SUCCESS (conf: {confidence:.2f})")
            return {
                'voter_id': voter_id,
                'confidence': confidence,
                'method': 'tesseract',
                'raw_text': raw_text
            }
        
        except Exception as e:
            print(f"      ERROR: Voter ID extraction failed: {str(e)}")
            return {
                'voter_id': '',
                'confidence': 0.0,
                'method': 'error',
                'raw_text': '',
                'error': str(e)
            }
    
    def _extract_voter_id_from_text(self, text: str) -> Tuple[str, float]:
        """
        Extract voter ID from OCR text using pattern matching
        
        Args:
            text: Raw OCR text
        
        Returns:
            Tuple of (voter_id, confidence)
        """
        if not text:
            return ('', 0.0)
        
        # Clean text
        text = text.upper().strip()
        text = re.sub(r'[^\w\s]', '', text)  # Remove punctuation
        
        # Try each pattern
        for pattern in self.voter_id_patterns:
            matches = re.findall(pattern, text)
            if matches:
                # Get first match
                voter_id = matches[0].replace(' ', '')  # Remove spaces
                voter_id = voter_id.rstrip('_').strip()  # Remove trailing underscores
                
                # Calculate confidence based on format
                confidence = self._calculate_voter_id_confidence(voter_id)
                
                return (voter_id, confidence)
        
        # No pattern matched - try to extract any alphanumeric sequence
        words = text.split()
        for word in words:
            # Look for words with both letters and numbers
            if re.search(r'[A-Z]', word) and re.search(r'[0-9]', word) and len(word) >= 8:
                word = word.rstrip('_').strip()  # Remove trailing underscores
                confidence = 0.4  # Low confidence
                return (word, confidence)
        
        return ('', 0.0)
    
    def _calculate_voter_id_confidence(self, voter_id: str) -> float:
        """
        Calculate confidence score for extracted voter ID
        
        Args:
            voter_id: Extracted voter ID
        
        Returns:
            Confidence score (0.0 to 1.0)
        """
        if not voter_id:
            return 0.0
        
        confidence = 0.5  # Base confidence
        
        # Check standard format: 3 letters + 7 digits
        if re.match(r'^[A-Z]{3}[0-9]{7}$', voter_id):
            confidence = 0.95
        
        # Check flexible format: 2-4 letters + 6-8 digits
        elif re.match(r'^[A-Z]{2,4}[0-9]{6,8}$', voter_id):
            confidence = 0.85
        
        # Check if it has both letters and numbers
        elif re.search(r'[A-Z]', voter_id) and re.search(r'[0-9]', voter_id):
            confidence = 0.6
        
        # Penalize if too short or too long
        if len(voter_id) < 8:
            confidence *= 0.7
        elif len(voter_id) > 15:
            confidence *= 0.8
        
        # Penalize if contains common OCR errors
        if any(char in voter_id for char in ['O0', 'I1', 'S5']):
            confidence *= 0.9
        
        return min(confidence, 1.0)
    
    def extract_photo(self, image: Image.Image = None, pdf_page=None, rect=None) -> Dict:
        """
        Extract photo from image at high quality
        
        Args:
            image: PIL Image or None
            pdf_page: PyMuPDF page object (optional)
            rect: PyMuPDF Rect object (optional)
        
        Returns:
            Dict with photo_base64, confidence, method
        """
        try:
            # Extract high-quality image if pdf_page and rect provided
            if pdf_page and rect:
                pix = pdf_page.get_pixmap(clip=rect, dpi=self.dpi)
                image_bytes = pix.tobytes("png")
                image = Image.open(io.BytesIO(image_bytes))
            
            if not image:
                return {
                    'photo_base64': '',
                    'confidence': 0.0,
                    'method': 'error'
                }
            
            # Check if image is valid (not empty/blank)
            confidence = self._calculate_photo_confidence(image)
            
            if confidence < 0.3:
                print(f"      WARNING: Photo appears blank or invalid (conf: {confidence:.2f})")
                return {
                    'photo_base64': '',
                    'confidence': confidence,
                    'method': 'invalid'
                }
            
            # Convert to JPEG and encode
            jpeg_buffer = io.BytesIO()
            image.convert('RGB').save(jpeg_buffer, format='JPEG', quality=90)
            jpeg_bytes = jpeg_buffer.getvalue()
            photo_base64 = base64.b64encode(jpeg_bytes).decode('utf-8')
            
            print(f"      ✓ Photo extracted: {len(photo_base64)} chars (conf: {confidence:.2f})")
            
            return {
                'photo_base64': photo_base64,
                'confidence': confidence,
                'method': 'local',
                'size': image.size,
                'format': image.format or 'JPEG'
            }
        
        except Exception as e:
            print(f"      ERROR: Photo extraction failed: {str(e)}")
            return {
                'photo_base64': '',
                'confidence': 0.0,
                'method': 'error',
                'error': str(e)
            }
    
    def _calculate_photo_confidence(self, image: Image.Image) -> float:
        """
        Calculate confidence that image is a valid photo
        
        Args:
            image: PIL Image
        
        Returns:
            Confidence score (0.0 to 1.0)
        """
        try:
            import numpy as np
            
            # Convert to array
            img_array = np.array(image)
            
            # Check if image is not blank (has variance)
            variance = np.var(img_array)
            
            if variance < 100:  # Very low variance = likely blank
                return 0.1
            elif variance < 500:
                return 0.5
            elif variance < 1000:
                return 0.7
            else:
                return 0.9
        
        except:
            # Fallback: basic check
            if image.size[0] > 50 and image.size[1] > 50:
                return 0.6
            else:
                return 0.3


# Test function
if __name__ == '__main__':
    print("Testing OCR Processor with 400 DPI...")
    print("=" * 60)
    
    processor = OCRProcessor400DPI()
    
    print("\nProcessor initialized successfully!")
    print(f"DPI: {processor.dpi}")
    
    print("\n" + "=" * 60)
    print("Ready to process voter IDs and photos at 400 DPI!")
    print("=" * 60)

