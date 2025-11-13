"""
Smart Detector - Automatically finds Voter ID and Photo in each cell
Uses pattern recognition to identify alphanumeric text and human faces
"""

import re
import io
import base64
import pytesseract
import numpy as np
from PIL import Image
from typing import Dict, Optional, Tuple, List

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False


class SmartDetector:
    """
    Automatically detects Voter ID and Photo within voter card cells
    """
    
    def __init__(self):
        """Initialize smart detector"""
        self.voter_id_pattern = re.compile(r'[A-Z]{3}[0-9]{7}|[A-Z0-9]{10,}')
    
    def find_voter_id_in_cell(self, cell_image: Image.Image) -> Dict:
        """
        Scan entire cell to find alphanumeric voter ID
        
        Args:
            cell_image: PIL Image of the cell
        
        Returns:
            Dict with voter_id, confidence, and location
        """
        try:
            # Convert to grayscale for better OCR
            if cell_image.mode != 'L':
                gray_image = cell_image.convert('L')
            else:
                gray_image = cell_image
            
            # Try to extract all text from the cell
            text = pytesseract.image_to_string(
                gray_image,
                lang='eng+hin',
                config='--psm 6'
            ).strip()
            
            # Find voter ID patterns (alphanumeric)
            voter_ids = self._extract_voter_id_patterns(text)
            
            if voter_ids:
                best_id = voter_ids[0]  # Take the first/best match
                return {
                    'voter_id': best_id,
                    'confidence': 0.8,
                    'found': True
                }
            
            return {
                'voter_id': '',
                'confidence': 0.0,
                'found': False
            }
        
        except Exception as e:
            print(f"    WARNING: Smart voter ID detection error: {str(e)}")
            return {
                'voter_id': '',
                'confidence': 0.0,
                'found': False
            }
    
    def find_photo_in_cell(self, cell_image: Image.Image) -> Dict:
        """
        Scan entire cell to find human photo
        
        Args:
            cell_image: PIL Image of the cell
        
        Returns:
            Dict with photo_base64, confidence, and location
        """
        try:
            # If OpenCV is available, use face detection
            if CV2_AVAILABLE:
                return self._find_photo_with_face_detection(cell_image)
            else:
                # Fallback: find largest rectangular region that looks like a photo
                return self._find_photo_by_region(cell_image)
        
        except Exception as e:
            print(f"    WARNING: Smart photo detection error: {str(e)}")
            return {
                'photo_base64': '',
                'confidence': 0.0,
                'found': False
            }
    
    def _extract_voter_id_patterns(self, text: str) -> List[str]:
        """
        Extract voter ID patterns from text
        
        Common formats:
        - ABC1234567 (3 letters + 7 digits)
        - 10+ alphanumeric characters
        """
        # Clean text
        text = text.upper().replace(' ', '').replace('\n', '')
        
        # Find all potential voter IDs
        candidates = []
        
        # Pattern 1: ABC1234567 format
        matches = re.findall(r'[A-Z]{3}[0-9]{7}', text)
        candidates.extend(matches)
        
        # Pattern 2: Long alphanumeric (10+ chars)
        if not candidates:
            matches = re.findall(r'[A-Z0-9]{10,}', text)
            candidates.extend(matches)
        
        # Pattern 3: Any sequence with both letters and numbers
        if not candidates:
            matches = re.findall(r'(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{8,}', text)
            candidates.extend(matches)
        
        return candidates
    
    def _find_photo_with_face_detection(self, cell_image: Image.Image) -> Dict:
        """
        Find photo using OpenCV face detection
        """
        try:
            # Convert PIL to OpenCV
            img_array = np.array(cell_image.convert('RGB'))
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
            
            # Load face cascade
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            
            # Detect faces
            faces = face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=3,
                minSize=(30, 30)
            )
            
            if len(faces) > 0:
                # Get the largest face
                face = max(faces, key=lambda f: f[2] * f[3])
                x, y, w, h = face
                
                # Add padding
                padding = 20
                x1 = max(0, x - padding)
                y1 = max(0, y - padding)
                x2 = min(cell_image.width, x + w + padding)
                y2 = min(cell_image.height, y + h + padding)
                
                # Crop to face region
                photo = cell_image.crop((x1, y1, x2, y2))
                
                # Convert to base64
                buffer = io.BytesIO()
                photo.save(buffer, format='JPEG', quality=85)
                photo_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                return {
                    'photo_base64': photo_base64,
                    'confidence': 0.9,
                    'found': True,
                    'bbox': (x1, y1, x2, y2)
                }
        
        except Exception as e:
            print(f"      Face detection error: {str(e)}")
        
        # Fallback to region detection
        return self._find_photo_by_region(cell_image)
    
    def _find_photo_by_region(self, cell_image: Image.Image) -> Dict:
        """
        Find photo by analyzing image regions (fallback method)
        Looks for rectangular regions with photo-like characteristics
        """
        try:
            # Simple heuristic: divide cell into regions and find the one with most variance
            # (photos have more color/texture variation than text)
            
            width, height = cell_image.size
            
            # Try common photo positions (left, center, right, top)
            regions = [
                (0, 0, width // 3, height // 2),  # Top-left
                (width // 3, 0, 2 * width // 3, height // 2),  # Top-center
                (2 * width // 3, 0, width, height // 2),  # Top-right
                (0, height // 4, width // 2, 3 * height // 4),  # Left-center
                (width // 2, height // 4, width, 3 * height // 4),  # Right-center
            ]
            
            best_region = None
            best_score = 0
            
            for region in regions:
                x1, y1, x2, y2 = region
                crop = cell_image.crop((x1, y1, x2, y2))
                
                # Calculate variance (photos have higher variance)
                img_array = np.array(crop)
                variance = np.var(img_array)
                
                # Calculate aspect ratio score (photos are usually portrait-like)
                aspect_ratio = (y2 - y1) / (x2 - x1)
                aspect_score = 1.0 if 1.0 <= aspect_ratio <= 2.0 else 0.5
                
                score = variance * aspect_score
                
                if score > best_score:
                    best_score = score
                    best_region = region
            
            if best_region and best_score > 1000:  # Threshold
                x1, y1, x2, y2 = best_region
                photo = cell_image.crop((x1, y1, x2, y2))
                
                # Resize to reasonable size
                photo.thumbnail((200, 240), Image.Resampling.LANCZOS)
                
                # Convert to base64
                buffer = io.BytesIO()
                photo.save(buffer, format='JPEG', quality=85)
                photo_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                return {
                    'photo_base64': photo_base64,
                    'confidence': 0.6,
                    'found': True,
                    'bbox': best_region
                }
            
            # No good region found, return empty
            return {
                'photo_base64': '',
                'confidence': 0.0,
                'found': False
            }
        
        except Exception as e:
            print(f"      Region detection error: {str(e)}")
            return {
                'photo_base64': '',
                'confidence': 0.0,
                'found': False
            }


# Testing function
if __name__ == '__main__':
    detector = SmartDetector()
    print("OK: Smart Detector ready for testing")
    print("  - Automatically finds alphanumeric Voter IDs")
    print("  - Automatically detects human photos/faces")

