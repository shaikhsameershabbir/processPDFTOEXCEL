/**
 * API Communication Module
 * Handles all HTTP requests to the Python backend
 */

const API_BASE_URL = 'http://localhost:5000/api';

class API {
    /**
     * Upload PDF file
     */
    static async uploadPDF(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE_URL}/upload-pdf`, {
                method: 'POST',
                body: formData
            });

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response. Is the backend server running?');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || 'Upload failed');
            }

            return data;
        } catch (error) {
            console.error('Upload error:', error);
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to server. Please ensure the Python server is running.');
            }
            throw error;
        }
    }

    /**
     * Detect regions using Azure Vision API
     */
    static async detectRegions(fileId, pageNum = 0) {
        try {
            // Get the PDF file from server
            const pdfPath = `http://localhost:3000/uploads/${fileId}.pdf`;
            
            // Fetch the PDF file
            const pdfResponse = await fetch(pdfPath);
            const pdfBlob = await pdfResponse.blob();
            
            // Create form data
            const formData = new FormData();
            formData.append('file', pdfBlob, `${fileId}.pdf`);
            formData.append('pageNum', pageNum.toString());
            formData.append('scale', '2.0');
            
            const response = await fetch('http://localhost:5000/detect-regions', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Region detection failed');
            }

            return data;
        } catch (error) {
            console.error('Detection error:', error);
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to Python service. Ensure backend is running.');
            }
            throw error;
        }
    }

    /**
     * Configure extraction settings
     */
    static async configureExtraction(config) {
        try {
            const response = await fetch(`${API_BASE_URL}/configure-extraction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Configuration failed');
            }

            return data;
        } catch (error) {
            console.error('Configuration error:', error);
            throw error;
        }
    }

    /**
     * Extract grid data
     */
    static async extractGrid(configId) {
        try {
            const response = await fetch(`${API_BASE_URL}/extract-grid`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ configId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Extraction failed');
            }
            
            // Debug logging
            console.log('API Response received:', {
                success: data.success,
                excelId: data.excelId,
                recordsExtracted: data.recordsExtracted,
                hasExtractedData: !!data.extractedData,
                extractedDataLength: data.extractedData ? data.extractedData.length : 0
            });

            return data;
        } catch (error) {
            console.error('Extraction error:', error);
            throw error;
        }
    }

    /**
     * Download Excel file
     */
    static downloadExcel(excelId) {
        const url = `${API_BASE_URL}/download-excel/${excelId}`;
        window.open(url, '_blank');
    }

    /**
     * Check server health
     */
    static async checkHealth() {
        try {
            const response = await fetch('http://localhost:5000/health');
            const data = await response.json();
            return data.status === 'ok';
        } catch (error) {
            return false;
        }
    }
}


