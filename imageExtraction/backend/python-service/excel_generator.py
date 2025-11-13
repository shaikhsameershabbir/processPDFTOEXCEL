"""
Excel Generator - Create Excel files with extracted voter data
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.utils import get_column_letter
import os
from typing import List, Dict


def generate_excel(data: List[Dict], output_path: str, include_images: bool = True) -> bool:
    """
    Generate Excel file from extracted data
    
    Args:
        data: Array of extracted voter data
        output_path: Path to save Excel file
        include_images: Whether to include Base64 image strings in Excel (default: True)
    
    Returns:
        True if successful, raises exception on error
    """
    try:
        # Sort data by serial number (ascending order)
        # Convert serial number to int for proper numeric sorting, handle non-numeric values
        def get_serial_sort_key(record):
            serial = record.get('serialNumber', '').strip()
            if serial:
                # Extract digits from serial number
                import re
                digits = re.sub(r'[^0-9]', '', serial)
                if digits:
                    try:
                        return int(digits)
                    except:
                        return 999999  # Put non-numeric at end
            return 999999  # Put empty at end
        
        sorted_data = sorted(data, key=get_serial_sort_key)
        print(f"Excel Generator: Sorted {len(sorted_data)} records by serial number")
        
        # Debug: Log data sample
        if sorted_data:
            sample = sorted_data[0]
            print(f"Excel Generator: Processing {len(sorted_data)} records")
            print(f"  Sample record fields: {list(sample.keys())}")
            print(f"  Sample data - Name: '{sample.get('name', '')[:30]}', Relative: '{sample.get('relativeName', '')[:30]}', Age: '{sample.get('age', '')}'")
            print(f"  First serial number: '{sorted_data[0].get('serialNumber', '')}', Last serial number: '{sorted_data[-1].get('serialNumber', '')}'")
        # Create workbook and worksheet
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = 'Voter Data'
        
        # Define headers - check which fields exist in data
        # Check if ANY record has the field (even if empty string, we still include the column)
        has_serial_number = any('serialNumber' in record for record in sorted_data)
        has_name = any('name' in record for record in sorted_data)
        has_relative_name = any('relativeName' in record for record in sorted_data)
        has_house_number = any('houseNumber' in record for record in sorted_data)
        has_age = any('age' in record for record in sorted_data)
        has_gender = any('gender' in record for record in sorted_data)
        has_yadi_bhag = any('yadiBhag' in record for record in sorted_data)
        
        # Debug: Log which columns will be included
        print(f"  Columns to include: EPIC No, ", end='')
        if has_serial_number: print("Serial Number, ", end='')
        if has_name: print("Name, ", end='')
        if has_relative_name: print("Relative Name, ", end='')
        if has_house_number: print("House Number, ", end='')
        if has_age: print("Age, ", end='')
        if has_gender: print("Gender, ", end='')
        if has_yadi_bhag: print("Yadi Bhag, ", end='')
        if include_images: print("Base64 Image String", end='')
        print()
        
        headers = ['EPIC No']
        if has_serial_number:
            headers.append('Serial Number')
        if has_name:
            headers.append('Name')
        if has_relative_name:
            headers.append('Relative Name')
        if has_house_number:
            headers.append('House Number')
        if has_age:
            headers.append('Age')
        if has_gender:
            headers.append('Gender')
        if has_yadi_bhag:
            headers.append('Yadi Bhag')
        if include_images:
            headers.append('Base64 Image String')
        
        # Set column headers
        for col_num, header in enumerate(headers, 1):
            cell = worksheet.cell(row=1, column=col_num)
            cell.value = header
            cell.font = Font(bold=True, size=12, color='FFFFFFFF')
            cell.fill = PatternFill(start_color='FF4472C4', end_color='FF4472C4', fill_type='solid')
            cell.alignment = Alignment(horizontal='center', vertical='center')
        
        # Set column widths
        col_letter = 'A'
        worksheet.column_dimensions[col_letter].width = 20  # EPIC No
        col_idx = 1
        
        if has_serial_number:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 20
        if has_name:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 25
        if has_relative_name:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 25
        if has_house_number:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 15
        if has_age:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 10
        if has_gender:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 10
        if has_yadi_bhag:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 20
        
        # Image column (last, only if include_images is True)
        if include_images:
            col_idx += 1
            col_letter = get_column_letter(col_idx)
            worksheet.column_dimensions[col_letter].width = 80
        
        # Define border style
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        # Add data rows
        for index, record in enumerate(sorted_data):
            row_num = index + 2  # Start from row 2 (row 1 is headers)
            col_num = 1
            cells_to_fill = []
            
            # Add voter ID
            voter_id_cell = worksheet.cell(row=row_num, column=col_num)
            voter_id_value = record.get('voterID', '').strip()
            voter_id_cell.value = voter_id_value
            voter_id_cell.border = thin_border
            # Set as text to prevent Excel from interpreting as formula
            voter_id_cell.number_format = '@'
            cells_to_fill.append(voter_id_cell)
            col_num += 1
            
            # Add serial number if present
            if has_serial_number:
                serial_cell = worksheet.cell(row=row_num, column=col_num)
                serial_value = record.get('serialNumber', '').strip()
                # Serial numbers should ALWAYS be numbers - extract digits only
                if serial_value:
                    import re
                    # Extract only digits from serial number
                    digits_only = re.sub(r'[^0-9]', '', serial_value)
                    if digits_only:
                        try:
                            # Always store as integer
                            serial_num = int(digits_only)
                            serial_cell.value = serial_num
                            serial_cell.number_format = '0'  # Integer format
                        except ValueError:
                            # Fallback: store as text but with number format
                            serial_cell.value = digits_only
                            serial_cell.number_format = '0'  # Still use number format
                    else:
                        # No digits found - this shouldn't happen for serial numbers
                        serial_cell.value = ''
                else:
                    serial_cell.value = ''
                serial_cell.border = thin_border
                cells_to_fill.append(serial_cell)
                col_num += 1
            
            # Add name if present
            if has_name:
                name_cell = worksheet.cell(row=row_num, column=col_num)
                name_value = record.get('name', '')
                name_cell.value = name_value
                name_cell.border = thin_border
                cells_to_fill.append(name_cell)
                if index <= 3:
                    print(f"    Row {row_num} Name: '{name_value[:40] if name_value else '(empty)'}'")
                col_num += 1
            
            # Add relative name if present
            if has_relative_name:
                rel_name_cell = worksheet.cell(row=row_num, column=col_num)
                rel_name_cell.value = record.get('relativeName', '')
                rel_name_cell.border = thin_border
                cells_to_fill.append(rel_name_cell)
                col_num += 1
            
            # Add house number if present
            if has_house_number:
                house_cell = worksheet.cell(row=row_num, column=col_num)
                house_cell.value = record.get('houseNumber', '')
                house_cell.border = thin_border
                cells_to_fill.append(house_cell)
                col_num += 1
            
            # Add age if present
            if has_age:
                age_cell = worksheet.cell(row=row_num, column=col_num)
                age_value = record.get('age', '')
                age_cell.value = age_value
                age_cell.border = thin_border
                cells_to_fill.append(age_cell)
                if index <= 3:
                    print(f"    Row {row_num} Age: '{age_value if age_value else '(empty)'}'")
                col_num += 1
            
            # Add gender if present
            if has_gender:
                gender_cell = worksheet.cell(row=row_num, column=col_num)
                gender_cell.value = record.get('gender', '')
                gender_cell.border = thin_border
                cells_to_fill.append(gender_cell)
                col_num += 1
            
            # Add yadi bhag if present
            if has_yadi_bhag:
                yadi_bhag_cell = worksheet.cell(row=row_num, column=col_num)
                yadi_bhag_cell.value = record.get('yadiBhag', '')
                yadi_bhag_cell.border = thin_border
                cells_to_fill.append(yadi_bhag_cell)
                col_num += 1
            
            # Add base64 image (only if include_images is True)
            if include_images:
                image_cell = worksheet.cell(row=row_num, column=col_num)
                image_cell.value = record.get('image_base64', '')
                image_cell.border = thin_border
                cells_to_fill.append(image_cell)
                col_num += 1
            
            # Alternate row colors for better readability
            if index % 2 == 0:
                light_gray = PatternFill(start_color='FFF2F2F2', end_color='FFF2F2F2', fill_type='solid')
                for cell in cells_to_fill:
                    cell.fill = light_gray
        
        # Add borders to header row
        for col_num in range(1, len(headers) + 1):
            cell = worksheet.cell(row=1, column=col_num)
            cell.border = thin_border
        
        # Save workbook
        workbook.save(output_path)
        print(f"Excel file generated: {output_path}")
        print(f"  Total rows: {len(sorted_data) + 1} (including header)")
        print(f"  Total columns: {len(headers)}")
        
        # Debug: Count non-empty fields
        non_empty_counts = {
            'voterID': sum(1 for r in sorted_data if r.get('voterID', '').strip()),
            'name': sum(1 for r in sorted_data if r.get('name', '').strip()),
            'relativeName': sum(1 for r in sorted_data if r.get('relativeName', '').strip()),
            'houseNumber': sum(1 for r in sorted_data if r.get('houseNumber', '').strip()),
            'age': sum(1 for r in sorted_data if r.get('age', '').strip()),
            'gender': sum(1 for r in sorted_data if r.get('gender', '').strip()),
            'yadiBhag': sum(1 for r in sorted_data if r.get('yadiBhag', '').strip())
        }
        print(f"  Non-empty field counts: {non_empty_counts}")
        
        return True
    
    except Exception as e:
        print(f"Excel generation error: {str(e)}")
        raise

