"""
Photo Processor - Enhanced image extraction and processing for voter photos
"""

import io
import base64
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from typing import Dict, Optional, Tuple

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

class PhotoProcessor:
    """
    Enhanced photo extraction with quality improvements
    Applies image processing techniques for better photo quality
    """
    
    def __init__(self):
        """Initialize photo processor with default settings"""
        self.target_size = (200, 240)  # Target photo size (width, height)
        self.jpeg_quality = 85  # JPEG quality (0-100)
        self.enhance_brightness = True
        self.enhance_contrast = True
        self.enhance_sharpness = True
        
    
    def process_photo(
        self,
        image: Image.Image,
        enhance: bool = True,
        resize: bool = False
    ) -> Dict:
        """
        Process and enhance voter photo
        
        Args:
            image: PIL Image object
            enhance: Apply enhancement filters
            resize: Resize to target size
        
        Returns:
            Dictionary with:
                - image: Processed PIL Image
                - base64: Base64-encoded JPEG string
                - size: (width, height) tuple
                - quality_score: Image quality score (0-1)
        """
        try:
            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Apply enhancements
            if enhance:
                image = self._enhance_image(image)
            
            # Resize if requested
            if resize:
                image = self._resize_image(image)
            
            # Calculate quality score
            quality_score = self._calculate_quality_score(image)
            
            # Convert to base64 JPEG
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=self.jpeg_quality, optimize=True)
            jpeg_bytes = buffer.getvalue()
            base64_str = base64.b64encode(jpeg_bytes).decode('utf-8')
            
            return {
                'image': image,
                'base64': base64_str,
                'size': image.size,
                'quality_score': quality_score,
                'bytes_size': len(jpeg_bytes)
            }
        
        except Exception as e:
            print(f"  WARNING: Photo processing error: {str(e)}")
            # Return original image as fallback
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=self.jpeg_quality)
            jpeg_bytes = buffer.getvalue()
            base64_str = base64.b64encode(jpeg_bytes).decode('utf-8')
            
            return {
                'image': image,
                'base64': base64_str,
                'size': image.size,
                'quality_score': 0.5,
                'bytes_size': len(jpeg_bytes)
            }
    
    def _enhance_image(self, image: Image.Image) -> Image.Image:
        """
        Apply enhancement filters to improve photo quality
        
        Args:
            image: PIL Image
        
        Returns:
            Enhanced PIL Image
        """
        # Enhance brightness (slightly)
        if self.enhance_brightness:
            enhancer = ImageEnhance.Brightness(image)
            image = enhancer.enhance(1.1)  # 10% brighter
        
        # Enhance contrast
        if self.enhance_contrast:
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(1.2)  # 20% more contrast
        
        # Enhance sharpness
        if self.enhance_sharpness:
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(1.3)  # 30% sharper
        
        # Reduce noise (very mild)
        # image = image.filter(ImageFilter.SMOOTH_MORE)
        
        return image
    
    def _resize_image(self, image: Image.Image) -> Image.Image:
        """
        Resize image to target size while maintaining aspect ratio
        
        Args:
            image: PIL Image
        
        Returns:
            Resized PIL Image
        """
        # Use high-quality resampling
        image.thumbnail(self.target_size, Image.Resampling.LANCZOS)
        return image
    
    def _calculate_quality_score(self, image: Image.Image) -> float:
        """
        Calculate image quality score based on various metrics
        
        Args:
            image: PIL Image
        
        Returns:
            Quality score (0-1), higher is better
        """
        try:
            # Convert to numpy array
            img_array = np.array(image)
            
            if not CV2_AVAILABLE:
                # Fallback to simple score based on image size and variance
                contrast = np.std(img_array) / 128.0
                contrast_score = min(1.0, contrast)
                total_pixels = image.width * image.height
                size_score = min(1.0, total_pixels / 50000.0)
                return float((contrast_score * 0.5 + size_score * 0.5))
            
            # Calculate sharpness (Laplacian variance)
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            sharpness_score = min(1.0, laplacian_var / 500.0)  # Normalize
            
            # Calculate brightness (average pixel value)
            brightness = np.mean(gray) / 255.0
            brightness_score = 1.0 - abs(brightness - 0.5) * 2  # Penalize too dark/bright
            
            # Calculate contrast (standard deviation)
            contrast = np.std(gray) / 128.0
            contrast_score = min(1.0, contrast)
            
            # Weighted average
            quality_score = (
                sharpness_score * 0.4 +
                brightness_score * 0.3 +
                contrast_score * 0.3
            )
            
            return float(quality_score)
        
        except Exception as e:
            print(f"  WARNING: Quality calculation error: {str(e)}")
            return 0.5
    
    def detect_face(self, image: Image.Image) -> Optional[Tuple[int, int, int, int]]:
        """
        Detect face in photo (optional feature)
        
        Args:
            image: PIL Image
        
        Returns:
            Face bounding box (x, y, width, height) or None
        """
        try:
            if not CV2_AVAILABLE:
                return None
            
            # Convert to OpenCV format
            img_array = np.array(image)
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
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            if len(faces) > 0:
                # Return first (largest) face
                x, y, w, h = faces[0]
                return (int(x), int(y), int(w), int(h))
            
            return None
        
        except Exception as e:
            print(f"  WARNING: Face detection error: {str(e)}")
            return None
    
    def crop_to_face(self, image: Image.Image, padding: int = 20) -> Image.Image:
        """
        Crop image to face region with padding
        
        Args:
            image: PIL Image
            padding: Padding around face in pixels
        
        Returns:
            Cropped PIL Image
        """
        face_box = self.detect_face(image)
        
        if face_box is None:
            return image  # Return original if no face detected
        
        x, y, w, h = face_box
        
        # Add padding
        x = max(0, x - padding)
        y = max(0, y - padding)
        w = min(image.width - x, w + 2 * padding)
        h = min(image.height - y, h + 2 * padding)
        
        # Crop
        cropped = image.crop((x, y, x + w, y + h))
        
        return cropped
    
    def compare_photos(self, image1: Image.Image, image2: Image.Image) -> float:
        """
        Compare two photos for similarity (optional feature)
        
        Args:
            image1: First PIL Image
            image2: Second PIL Image
        
        Returns:
            Similarity score (0-1), higher is more similar
        """
        try:
            # Resize both to same size
            size = (100, 100)
            img1 = image1.resize(size, Image.Resampling.LANCZOS)
            img2 = image2.resize(size, Image.Resampling.LANCZOS)
            
            # Convert to numpy arrays
            arr1 = np.array(img1).flatten()
            arr2 = np.array(img2).flatten()
            
            # Calculate correlation
            correlation = np.corrcoef(arr1, arr2)[0, 1]
            
            # Normalize to 0-1
            similarity = (correlation + 1) / 2
            
            return float(similarity)
        
        except Exception as e:
            print(f"  WARNING: Photo comparison error: {str(e)}")
            return 0.0


# Test function
if __name__ == '__main__':
    print("Testing Photo Processor...")
    print("-" * 50)
    
    processor = PhotoProcessor()
    print(f"OK: Processor ready")
    print(f"  Target size: {processor.target_size}")
    print(f"  JPEG quality: {processor.jpeg_quality}")
    print(f"  Enhancement: brightness={processor.enhance_brightness}, "
          f"contrast={processor.enhance_contrast}, sharpness={processor.enhance_sharpness}")
    print("\nReady to process voter photos with quality enhancements!")


