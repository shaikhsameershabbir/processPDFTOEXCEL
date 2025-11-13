"""
Azure Vision Service - GPT-4o Vision Integration
Detects voter ID and photo boxes from document pages using Azure OpenAI Vision
"""

import os
import json
import base64
import requests
from typing import Dict, List, Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class AzureVisionService:
    """Service for detecting voter regions using Azure OpenAI GPT-4o Vision"""
    
    def __init__(self):
        """Initialize Azure Vision Service with environment variables"""
        self.api_key = os.getenv('AZURE_OPENAI_API_KEY')
        self.endpoint = os.getenv('AZURE_VISION_ENDPOINT')
        
        if not self.api_key:
            raise ValueError("AZURE_OPENAI_API_KEY not found in environment variables")
        if not self.endpoint:
            raise ValueError("AZURE_VISION_ENDPOINT not found in environment variables")
        
        print(f"Azure Vision Service initialized")
        print(f"Endpoint: {self.endpoint}")
    
    def detect_voter_regions(self, image_bytes: bytes, image_width: int, image_height: int) -> Dict:
        """
        Detect voter ID and photo regions from a page image using GPT-4o Vision
        
        Args:
            image_bytes: Image data as bytes (PNG/JPEG)
            image_width: Original image width in pixels
            image_height: Original image height in pixels
        
        Returns:
            Dictionary with detected regions:
            {
                'voterIdBoxes': [{'x': int, 'y': int, 'width': int, 'height': int, 'confidence': float}],
                'photoBoxes': [{'x': int, 'y': int, 'width': int, 'height': int, 'confidence': float}],
                'gridDetected': bool,
                'gridRows': int,
                'gridColumns': int,
                'gridBoundary': {'x': int, 'y': int, 'width': int, 'height': int}
            }
        """
        try:
            # Convert image to base64
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            
            # Construct the prompt for GPT-4o Vision
            prompt = self._construct_detection_prompt(image_width, image_height)
            
            # Prepare API request
            headers = {
                'Content-Type': 'application/json',
                'api-key': self.api_key
            }
            
            payload = {
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are an expert at analyzing voter card documents and detecting structured regions with precise bounding boxes.'
                    },
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/png;base64,{image_base64}'
                                }
                            }
                        ]
                    }
                ],
                'max_tokens': 2000,
                'temperature': 0.1,  # Low temperature for consistent results
                'response_format': {'type': 'json_object'}
            }
            
            print(f"Sending request to Azure Vision API...")
            print(f"Image size: {len(image_bytes)} bytes, Dimensions: {image_width}x{image_height}")
            
            # Make API request
            response = requests.post(
                self.endpoint,
                headers=headers,
                json=payload,
                timeout=60
            )
            
            if response.status_code != 200:
                error_msg = f"Azure Vision API error: {response.status_code} - {response.text}"
                print(error_msg)
                raise Exception(error_msg)
            
            # Parse response
            result = response.json()
            content = result['choices'][0]['message']['content']
            detected_regions = json.loads(content)
            
            print(f"Detection successful!")
            print(f"Detected: {len(detected_regions.get('voterIdBoxes', []))} voter IDs, {len(detected_regions.get('photoBoxes', []))} photos")
            
            return detected_regions
            
        except Exception as e:
            print(f"Error in Azure Vision detection: {str(e)}")
            raise
    
    def _construct_detection_prompt(self, image_width: int, image_height: int) -> str:
        """Construct the detection prompt for GPT-4o Vision"""
        
        prompt = f"""Analyze this voter card document page and detect ALL regions containing voter IDs and photos.

The image dimensions are {image_width}x{image_height} pixels.

**Your Task:**
1. Identify EVERY voter ID text region (usually format like: ABC1234567 or similar alphanumeric patterns)
2. Identify EVERY photo/image region (usually passport-style photos)
3. Detect if there's a grid/table structure organizing the voter cards
4. Provide the grid's boundary and number of rows/columns if detected

**Return ONLY valid JSON in this exact format:**

{{
    "voterIdBoxes": [
        {{
            "x": <left-edge-pixel>,
            "y": <top-edge-pixel>,
            "width": <width-in-pixels>,
            "height": <height-in-pixels>,
            "confidence": <0.0-1.0>,
            "text": "<detected-voter-id-if-readable>"
        }}
    ],
    "photoBoxes": [
        {{
            "x": <left-edge-pixel>,
            "y": <top-edge-pixel>,
            "width": <width-in-pixels>,
            "height": <height-in-pixels>,
            "confidence": <0.0-1.0>
        }}
    ],
    "gridDetected": <true-or-false>,
    "gridRows": <number-of-rows>,
    "gridColumns": <number-of-columns>,
    "gridBoundary": {{
        "x": <left-edge-pixel>,
        "y": <top-edge-pixel>,
        "width": <width-in-pixels>,
        "height": <height-in-pixels>
    }}
}}

**Important:**
- Coordinates must be in pixels relative to the image dimensions ({image_width}x{image_height})
- x,y is the top-left corner of each box
- Return ALL detected regions, not just the first one
- If no grid is detected, set gridDetected to false and omit gridRows/gridColumns
- Be precise with bounding boxes
- Only return the JSON object, no additional text
"""
        return prompt
    
    def detect_from_pdf_page(self, pdf_bytes: bytes, page_num: int, scale: float = 2.0) -> Dict:
        """
        Detect regions from a specific PDF page
        
        Args:
            pdf_bytes: PDF file as bytes
            page_num: Page number (0-indexed)
            scale: Rendering scale for better detection (default 2.0)
        
        Returns:
            Dictionary with detected regions
        """
        try:
            import fitz  # PyMuPDF
            from PIL import Image
            import io
            
            # Open PDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            if page_num >= len(doc):
                raise ValueError(f"Page {page_num} does not exist in PDF (total pages: {len(doc)})")
            
            # Get page
            page = doc[page_num]
            
            # Render page to image at higher resolution
            mat = fitz.Matrix(scale, scale)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image then to bytes
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            img_bytes = img_byte_arr.getvalue()
            
            print(f"Rendered page {page_num + 1} at {pix.width}x{pix.height} pixels")
            
            # Detect regions
            detected = self.detect_voter_regions(img_bytes, pix.width, pix.height)
            
            # Scale coordinates back to original PDF coordinates
            detected_scaled = self._scale_coordinates(detected, 1.0 / scale)
            
            doc.close()
            
            return detected_scaled
            
        except Exception as e:
            print(f"Error detecting from PDF page: {str(e)}")
            raise
    
    def _scale_coordinates(self, detected: Dict, scale: float) -> Dict:
        """Scale detected coordinates by a factor"""
        
        result = detected.copy()
        
        # Scale voter ID boxes
        if 'voterIdBoxes' in result:
            for box in result['voterIdBoxes']:
                box['x'] = int(box['x'] * scale)
                box['y'] = int(box['y'] * scale)
                box['width'] = int(box['width'] * scale)
                box['height'] = int(box['height'] * scale)
        
        # Scale photo boxes
        if 'photoBoxes' in result:
            for box in result['photoBoxes']:
                box['x'] = int(box['x'] * scale)
                box['y'] = int(box['y'] * scale)
                box['width'] = int(box['width'] * scale)
                box['height'] = int(box['height'] * scale)
        
        # Scale grid boundary
        if 'gridBoundary' in result:
            gb = result['gridBoundary']
            gb['x'] = int(gb['x'] * scale)
            gb['y'] = int(gb['y'] * scale)
            gb['width'] = int(gb['width'] * scale)
            gb['height'] = int(gb['height'] * scale)
        
        return result


# Test function
if __name__ == '__main__':
    print("Testing Azure Vision Service...")
    
    try:
        service = AzureVisionService()
        print("OK: Service initialized successfully")
        print(f"OK: Endpoint configured: {service.endpoint}")
        print("OK: Ready to detect voter regions")
        
    except Exception as e:
        print(f"FAIL: Error: {str(e)}")
        print("\nPlease ensure:")
        print("1. .env file exists in the project root")
        print("2. AZURE_OPENAI_API_KEY is set")
        print("3. AZURE_VISION_ENDPOINT is set")

