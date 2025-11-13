"""
Table Image Generator
Creates a structured table image from cropped field images for Azure Vision table recognition
"""

import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont
import io
from typing import Dict, List, Optional
import numpy as np


class TableImageGenerator:
    """
    Generates table images from cropped field regions
    Each row represents one voter card with all fields as image cells
    """
    
    def __init__(self, cell_padding: int = 5, border_width: int = 2):
        """
        Initialize table image generator
        
        Args:
            cell_padding: Padding inside each cell (pixels)
            border_width: Border width between cells (pixels)
        """
        self.cell_padding = cell_padding
        self.border_width = border_width
        self.header_height = 40  # Height for header row
    
    def generate_table_image(
        self,
        page_data: List[Dict],
        field_config: Dict,
        dpi: int = 400
    ) -> Image.Image:
        """
        Generate a table image from page cell data
        
        Args:
            page_data: List of cell data dictionaries, each containing:
                - serialNumber: Extracted serial number (used as row identifier)
                - field_images: Dict of field_name -> PIL Image
            field_config: Configuration dict with field names and their order
            dpi: DPI for image rendering
        
        Returns:
            PIL Image of the table
        """
        # Define field order (excluding serial number and photo which are extracted separately)
        field_order = field_config.get('field_order', [
            'name', 'relativeName', 'houseNumber', 'age', 'gender'
        ])
        
        # Filter out None/empty serial numbers
        valid_rows = [row for row in page_data if row.get('serialNumber', '').strip()]
        
        if not valid_rows:
            raise ValueError("No valid rows with serial numbers found")
        
        # Calculate cell dimensions
        # Find max dimensions for each field type
        field_dimensions = {}
        for field in field_order:
            max_width = 0
            max_height = 0
            for row in valid_rows:
                field_images = row.get('field_images', {})
                if field in field_images:
                    img = field_images[field]
                    max_width = max(max_width, img.width)
                    max_height = max(max_height, img.height)
            
            # Set default if no images found
            if max_width == 0:
                max_width = 200
            if max_height == 0:
                max_height = 50
            
            field_dimensions[field] = (max_width, max_height)
        
        # Calculate table dimensions
        num_rows = len(valid_rows)
        num_cols = len(field_order) + 1  # +1 for serial number column
        
        # Cell dimensions (use max for uniformity)
        cell_width = max([w for w, h in field_dimensions.values()]) + (self.cell_padding * 2)
        cell_height = max([h for w, h in field_dimensions.values()]) + (self.cell_padding * 2)
        
        # Serial number column width (text-based, wider for better OCR)
        serial_col_width = 250  # Increased from 150 to 250 for better readability
        
        # Table dimensions
        table_width = serial_col_width + (num_cols - 1) * cell_width + (num_cols * self.border_width)
        table_height = self.header_height + (num_rows * cell_height) + ((num_rows + 1) * self.border_width)
        
        # Create table image
        table_img = Image.new('RGB', (table_width, table_height), color='white')
        draw = ImageDraw.Draw(table_img)
        
        # Draw header row
        self._draw_header(draw, field_order, serial_col_width, cell_width, cell_height)
        
        # Draw data rows
        y_pos = self.header_height + self.border_width
        for row_idx, row_data in enumerate(valid_rows):
            serial_number = row_data.get('serialNumber', '').strip()
            field_images = row_data.get('field_images', {})
            
            # Draw serial number cell (leftmost column)
            # Use image if available, otherwise use text
            serial_img = field_images.get('serialNumber')
            if serial_img:
                # Use cropped image for serial number
                self._draw_serial_cell_image(
                    table_img,
                    serial_img,
                    0,
                    y_pos,
                    serial_col_width,
                    cell_height
                )
            else:
                # Fallback to text rendering
                self._draw_serial_cell(
                    draw,
                    serial_number,
                    0,
                    y_pos,
                    serial_col_width,
                    cell_height
                )
            
            # Draw field image cells
            x_pos = serial_col_width + self.border_width
            for field in field_order:
                field_img = field_images.get(field)
                if field_img:
                    # Resize to fit cell if needed
                    target_w = cell_width - (self.cell_padding * 2)
                    target_h = cell_height - (self.cell_padding * 2)
                    
                    # Maintain aspect ratio
                    img_w, img_h = field_img.size
                    scale = min(target_w / img_w, target_h / img_h, 1.0)
                    new_w = int(img_w * scale)
                    new_h = int(img_h * scale)
                    
                    resized_img = field_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                    
                    # Place the image (vertically centered in cell)
                    paste_x = x_pos + self.cell_padding
                    paste_y = y_pos + (cell_height - new_h) // 2  # Vertically center in entire cell
                    
                    table_img.paste(resized_img, (paste_x, paste_y))
                
                # Draw cell border
                draw.rectangle(
                    [x_pos, y_pos, x_pos + cell_width, y_pos + cell_height],
                    outline='black',
                    width=self.border_width
                )
                
                x_pos += cell_width + self.border_width
            
            y_pos += cell_height + self.border_width
        
        return table_img
    
    def _draw_header(self, draw: ImageDraw.Draw, field_order: List[str], 
                    serial_col_width: int, cell_width: int, cell_height: int):
        """Draw table header row"""
        # Draw header background
        draw.rectangle(
            [0, 0, serial_col_width + len(field_order) * (cell_width + self.border_width), 
             self.header_height],
            fill='#4472C4',
            outline='black',
            width=self.border_width
        )
        
        # Draw serial number header
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
        except:
            font = ImageFont.load_default()
        
        draw.text(
            (serial_col_width // 2, self.header_height // 2),
            "Serial Number",
            fill='white',
            font=font,
            anchor='mm'
        )
        
        # Draw field headers
        x_pos = serial_col_width + self.border_width
        field_labels = {
            'voterId': 'Voter ID',
            'name': 'Name',
            'relativeName': 'Relative Name',
            'houseNumber': 'House Number',
            'age': 'Age',
            'gender': 'Gender',
            'yadiBhag': 'Yadi Bhag'
        }
        
        for field in field_order:
            label = field_labels.get(field, field.title())
            draw.text(
                (x_pos + cell_width // 2, self.header_height // 2),
                label,
                fill='white',
                font=font,
                anchor='mm'
            )
            x_pos += cell_width + self.border_width
    
    def _draw_serial_cell(self, draw: ImageDraw.Draw, serial_number: str,
                         x: int, y: int, width: int, height: int):
        """Draw serial number cell with text (fallback when image not available)"""
        # Draw cell background
        draw.rectangle(
            [x, y, x + width, y + height],
            fill='white',
            outline='black',
            width=self.border_width
        )
        
        # Draw serial number text (much larger font for better OCR)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        except:
            font = ImageFont.load_default()
        
        draw.text(
            (x + width // 2, y + height // 2),
            serial_number,
            fill='black',
            font=font,
            anchor='mm'
        )
    
    def _draw_serial_cell_image(self, table_img: Image.Image, serial_img: Image.Image,
                               x: int, y: int, width: int, height: int):
        """Draw serial number cell with cropped image"""
        # Draw cell background and border
        draw = ImageDraw.Draw(table_img)
        draw.rectangle(
            [x, y, x + width, y + height],
            fill='white',
            outline='black',
            width=self.border_width
        )
        
        # Resize image to fit cell while maintaining aspect ratio
        target_w = width - (self.cell_padding * 2)
        target_h = height - (self.cell_padding * 2)
        
        img_w, img_h = serial_img.size
        scale = min(target_w / img_w, target_h / img_h, 1.0)
        new_w = int(img_w * scale)
        new_h = int(img_h * scale)
        
        resized_img = serial_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Place the image (vertically centered in entire cell)
        paste_x = x + self.cell_padding
        paste_y = y + (height - new_h) // 2  # Vertically center in entire cell
        
        table_img.paste(resized_img, (paste_x, paste_y))
    
    def crop_field_images_from_page(
        self,
        pdf_page,
        cell_info: Dict,
        field_boxes: Dict,
        dpi: int = 400
    ) -> Dict[str, Image.Image]:
        """
        Crop field images from a PDF page cell
        
        Args:
            pdf_page: PyMuPDF page object
            cell_info: Cell position and dimensions {x, y, width, height, scale_x, scale_y}
            field_boxes: Dict of field_name -> {x, y, width, height} (relative to cell)
            dpi: DPI for rendering
        
        Returns:
            Dict of field_name -> PIL Image
        """
        field_images = {}
        
        cell_x = cell_info['x']
        cell_y = cell_info['y']
        scale_x = cell_info.get('scale_x', 1.0)
        scale_y = cell_info.get('scale_y', 1.0)
        
        for field_name, box in field_boxes.items():
            if not box:
                continue
            
            # Calculate absolute coordinates
            abs_x = cell_x + (box['x'] * scale_x)
            abs_y = cell_y + (box['y'] * scale_y)
            abs_width = box['width'] * scale_x
            abs_height = box['height'] * scale_y
            
            # Create rectangle
            rect = fitz.Rect(abs_x, abs_y, abs_x + abs_width, abs_y + abs_height)
            
            # Render at high DPI
            pix = pdf_page.get_pixmap(clip=rect, dpi=dpi)
            img_bytes = pix.tobytes("png")
            
            # Convert to PIL Image
            field_img = Image.open(io.BytesIO(img_bytes))
            field_images[field_name] = field_img
        
        return field_images

