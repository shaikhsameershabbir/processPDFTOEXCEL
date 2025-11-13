"""
Azure AI Vision OCR Processor
Uses Azure Computer Vision API for high-accuracy OCR on voter ID regions
"""

import os
import time
import base64
import requests
from typing import Dict, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class AzureVisionOCRProcessor:
    """
    High-accuracy OCR processor using Azure Computer Vision API
    Superior to Tesseract for Marathi and Hindi text extraction
    """
    
    def __init__(self):
        """Initialize Azure Vision OCR with environment variables"""
        self.api_key = os.getenv('AZURE_VISION_KEY')
        self.endpoint = os.getenv('AZURE_VISION_ENDPOINT')
        
        if not self.api_key:
            print("WARNING: AZURE_VISION_KEY not set - will fallback to Tesseract OCR")
            self.enabled = False
            return
        
        if not self.endpoint:
            print("WARNING: AZURE_VISION_ENDPOINT not set - will fallback to Tesseract OCR")
            self.enabled = False
            return
        
        # Remove trailing slash from endpoint
        self.endpoint = self.endpoint.rstrip('/')
        
        # API endpoints
        self.ocr_url = f"{self.endpoint}/computervision/imageanalysis:analyze"
        self.api_version = "2023-10-01"
        
        self.enabled = True
        print(f"OK: Azure Vision OCR initialized")
        print(f"  Endpoint: {self.endpoint}")
    
    def is_available(self) -> bool:
        """Check if Azure Vision OCR is available and configured"""
        return self.enabled
    
    def extract_text_from_image(self, image_bytes: bytes, language: str = "en") -> Dict:
        """
        Extract text from image using Azure Computer Vision API
        
        Args:
            image_bytes: Image data as bytes (PNG/JPEG)
            language: Language code (en, hi, mr for Marathi)
        
        Returns:
            Dictionary with:
                - text: Extracted text string
                - confidence: Average confidence score (0-1)
                - lines: List of text lines with bounding boxes
                - success: Boolean indicating success
        """
        if not self.enabled:
            return {
                'success': False,
                'text': '',
                'confidence': 0.0,
                'error': 'Azure Vision OCR not configured'
            }
        
        try:
            # Prepare headers
            headers = {
                'Ocp-Apim-Subscription-Key': self.api_key,
                'Content-Type': 'application/octet-stream'
            }
            
            # Prepare parameters
            params = {
                'api-version': self.api_version,
                'features': 'read',
                'language': language
            }
            
            # Make API request
            response = requests.post(
                self.ocr_url,
                headers=headers,
                params=params,
                data=image_bytes,
                timeout=30
            )
            
            if response.status_code != 200:
                error_msg = f"Azure Vision API error: {response.status_code}"
                print(f"  WARNING: {error_msg}")
                print(f"  Response: {response.text[:200]}")
                return {
                    'success': False,
                    'text': '',
                    'confidence': 0.0,
                    'error': error_msg
                }
            
            # Parse response
            result = response.json()
            
            # Extract text from read results
            text_lines = []
            confidences = []
            all_lines = []
            
            if 'readResult' in result:
                read_result = result['readResult']
                
                # Get blocks
                if 'blocks' in read_result:
                    for block in read_result['blocks']:
                        if 'lines' in block:
                            for line in block['lines']:
                                line_text = line.get('text', '')
                                text_lines.append(line_text)
                                
                                # Store line info
                                all_lines.append({
                                    'text': line_text,
                                    'boundingBox': line.get('boundingPolygon', [])
                                })
                                
                                # Extract word confidences
                                if 'words' in line:
                                    for word in line['words']:
                                        if 'confidence' in word:
                                            confidences.append(word['confidence'])
            
            # Combine all text
            full_text = '\n'.join(text_lines)
            
            # Calculate average confidence
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            return {
                'success': True,
                'text': full_text,
                'confidence': avg_confidence,
                'lines': all_lines,
                'lineCount': len(text_lines)
            }
        
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'text': '',
                'confidence': 0.0,
                'error': 'Request timeout'
            }
        
        except Exception as e:
            print(f"  WARNING: Azure Vision OCR error: {str(e)}")
            return {
                'success': False,
                'text': '',
                'confidence': 0.0,
                'error': str(e)
            }
    
    def extract_text_from_pil_image(self, pil_image) -> Dict:
        """
        Extract text from PIL Image object
        
        Args:
            pil_image: PIL Image object
        
        Returns:
            Same as extract_text_from_image
        """
        import io
        
        # Convert PIL image to bytes
        buffer = io.BytesIO()
        pil_image.save(buffer, format='PNG')
        image_bytes = buffer.getvalue()
        
        return self.extract_text_from_image(image_bytes)
    
    def clean_voter_id(self, text: str) -> str:
        """
        Clean and extract voter ID from OCR text
        
        Args:
            text: Raw OCR text
        
        Returns:
            Cleaned voter ID string
        """
        import re
        
        if not text:
            return ""
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        # Try to extract voter ID pattern (e.g., NOW1234567, ABC1234567)
        # Common patterns: 3 letters followed by 7 digits
        pattern = r'\b[A-Z]{3}\d{7}\b'
        match = re.search(pattern, text.upper())
        if match:
            cleaned = match.group(0)
            # Remove trailing underscores
            cleaned = cleaned.rstrip('_').strip()
            return cleaned
        
        # Try alternative pattern: any letters followed by digits
        pattern2 = r'\b[A-Z]{2,4}\d{6,8}\b'
        match2 = re.search(pattern2, text.upper())
        if match2:
            cleaned = match2.group(0)
            # Remove trailing underscores
            cleaned = cleaned.rstrip('_').strip()
            return cleaned
        
        # If no pattern match, return cleaned text (also remove trailing underscores)
        cleaned = text.strip()
        cleaned = cleaned.rstrip('_').strip()
        return cleaned


# Test function
if __name__ == '__main__':
    print("Testing Azure Vision OCR Processor...")
    print("-" * 50)
    
    try:
        processor = AzureVisionOCRProcessor()
        
        if processor.is_available():
            print("OK: Azure Vision OCR is available and configured")
            print(f"OK: Endpoint: {processor.endpoint}")
            print("\nReady to process voter ID images with high accuracy!")
        else:
            print("FAIL: Azure Vision OCR not configured")
            print("\nTo enable Azure Vision OCR:")
            print("1. Add AZURE_VISION_KEY to .env file")
            print("2. Add AZURE_VISION_ENDPOINT to .env file")
            print("3. Restart the Python service")
            print("\nExample .env:")
            print("  AZURE_VISION_KEY=your_key_here")
            print("  AZURE_VISION_ENDPOINT=https://your-resource.cognitiveservices.azure.com/")
    
    except Exception as e:
        print(f"FAIL: Error: {str(e)}")


