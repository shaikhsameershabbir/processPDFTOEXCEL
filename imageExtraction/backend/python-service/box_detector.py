"""
Box Detector - Computer Vision-based voter data box detection
Automatically detects voter card boxes in PDF pages using image processing
"""

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

import numpy as np
from PIL import Image
import io
from typing import List, Dict, Tuple

class BoxDetector:
    """
    Detects voter card boxes from document images using computer vision
    Similar to the Py dataExtraction project approach
    """
    
    def __init__(self):
        """Initialize box detector with default parameters"""
        self.min_box_area = 5000  # Minimum area for a valid box (pixels²)
        self.max_box_area = 500000  # Maximum area for a valid box
        self.aspect_ratio_min = 0.3  # Minimum width/height ratio
        self.aspect_ratio_max = 3.0  # Maximum width/height ratio
        
        print("OK: Box Detector initialized")
    
    def detect_boxes_from_pil_image(self, pil_image: Image.Image) -> List[Dict]:
        """
        Detect voter card boxes from a PIL Image
        
        Args:
            pil_image: PIL Image object
        
        Returns:
            List of detected boxes, each with:
                - x, y, width, height: Box coordinates
                - confidence: Detection confidence (0-1)
                - area: Box area in pixels
        """
        if not CV2_AVAILABLE:
            return []
        
        # Convert PIL image to OpenCV format
        img_array = np.array(pil_image.convert('RGB'))
        img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        return self.detect_boxes_from_cv_image(img_cv)
    
    def detect_boxes_from_cv_image(self, img_cv: np.ndarray) -> List[Dict]:
        """
        Detect boxes from OpenCV image
        
        Args:
            img_cv: OpenCV image (BGR format)
        
        Returns:
            List of detected boxes
        """
        # Convert to grayscale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            blurred, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            11, 2
        )
        
        # Morphological operations to clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(
            morph,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        # Filter and process contours
        detected_boxes = []
        
        for contour in contours:
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            
            # Filter by area
            if area < self.min_box_area or area > self.max_box_area:
                continue
            
            # Filter by aspect ratio
            aspect_ratio = w / h if h > 0 else 0
            if aspect_ratio < self.aspect_ratio_min or aspect_ratio > self.aspect_ratio_max:
                continue
            
            # Calculate confidence based on box properties
            # Higher confidence for rectangular boxes with good aspect ratios
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            rectangularity = len(approx) / 4.0  # How close to rectangle (4 corners)
            
            confidence = min(1.0, rectangularity)
            
            detected_boxes.append({
                'x': int(x),
                'y': int(y),
                'width': int(w),
                'height': int(h),
                'area': int(area),
                'confidence': float(confidence)
            })
        
        # Sort by position (top to bottom, left to right)
        detected_boxes.sort(key=lambda box: (box['y'], box['x']))
        
        print(f"  Detected {len(detected_boxes)} boxes using computer vision")
        
        return detected_boxes
    
    def detect_boxes_from_pdf_page(
        self,
        pdf_bytes: bytes,
        page_num: int,
        dpi: int = 200
    ) -> List[Dict]:
        """
        Detect boxes from a specific PDF page
        
        Args:
            pdf_bytes: PDF file as bytes
            page_num: Page number (0-indexed)
            dpi: DPI for rendering (higher = more accurate but slower)
        
        Returns:
            List of detected boxes
        """
        import fitz  # PyMuPDF
        
        # Open PDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if page_num >= len(doc):
            raise ValueError(f"Page {page_num} does not exist")
        
        # Get page
        page = doc[page_num]
        
        # Render page to image
        zoom = dpi / 72.0  # Convert DPI to zoom factor
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        # Convert to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        # Detect boxes
        boxes = self.detect_boxes_from_pil_image(img)
        
        # Scale coordinates back to PDF coordinates
        scale_factor = 1.0 / zoom
        for box in boxes:
            box['x'] = int(box['x'] * scale_factor)
            box['y'] = int(box['y'] * scale_factor)
            box['width'] = int(box['width'] * scale_factor)
            box['height'] = int(box['height'] * scale_factor)
            box['area'] = int(box['area'] * scale_factor * scale_factor)
        
        doc.close()
        
        return boxes
    
    def organize_into_grid(
        self,
        boxes: List[Dict],
        tolerance: int = 50
    ) -> Dict:
        """
        Organize detected boxes into a grid structure
        
        Args:
            boxes: List of detected boxes
            tolerance: Pixel tolerance for row/column alignment
        
        Returns:
            Dictionary with grid information:
                - rows: Number of rows
                - columns: Number of columns
                - grid: 2D array of boxes
                - gridBoundary: Overall grid boundary
        """
        if not boxes:
            return {
                'rows': 0,
                'columns': 0,
                'grid': [],
                'gridBoundary': None
            }
        
        # Sort boxes by position
        sorted_boxes = sorted(boxes, key=lambda b: (b['y'], b['x']))
        
        # Group into rows
        rows = []
        current_row = [sorted_boxes[0]]
        current_y = sorted_boxes[0]['y']
        
        for box in sorted_boxes[1:]:
            if abs(box['y'] - current_y) <= tolerance:
                current_row.append(box)
            else:
                rows.append(sorted(current_row, key=lambda b: b['x']))
                current_row = [box]
                current_y = box['y']
        
        if current_row:
            rows.append(sorted(current_row, key=lambda b: b['x']))
        
        # Determine number of columns (most common row length)
        from collections import Counter
        row_lengths = [len(row) for row in rows]
        most_common_length = Counter(row_lengths).most_common(1)[0][0]
        
        # Calculate grid boundary
        all_x = [b['x'] for b in boxes]
        all_y = [b['y'] for b in boxes]
        all_x2 = [b['x'] + b['width'] for b in boxes]
        all_y2 = [b['y'] + b['height'] for b in boxes]
        
        grid_boundary = {
            'x': min(all_x),
            'y': min(all_y),
            'width': max(all_x2) - min(all_x),
            'height': max(all_y2) - min(all_y)
        }
        
        return {
            'rows': len(rows),
            'columns': most_common_length,
            'grid': rows,
            'gridBoundary': grid_boundary
        }


# Test function
if __name__ == '__main__':
    print("Testing Box Detector...")
    print("-" * 50)
    
    detector = BoxDetector()
    print(f"OK: Detector ready")
    print(f"  Min box area: {detector.min_box_area} px²")
    print(f"  Max box area: {detector.max_box_area} px²")
    print(f"  Aspect ratio range: {detector.aspect_ratio_min} - {detector.aspect_ratio_max}")
    print("\nReady to detect voter card boxes from PDF pages!")


