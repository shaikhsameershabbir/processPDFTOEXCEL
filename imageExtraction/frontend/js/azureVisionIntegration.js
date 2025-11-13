/**
 * Azure Vision Integration Module
 * Auto-detects voter ID and photo regions using Azure OpenAI GPT-4o Vision
 * Single API call per page for complete detection
 */

class AzureVisionIntegration {
    constructor(gridOverlay) {
        this.gridOverlay = gridOverlay;
        this.isDetecting = false;
        this.lastDetectionResult = null; // Store last detection for table view
    }

    /**
     * Auto-detect regions from current PDF page
     * SINGLE API CALL - Detects everything at once
     * 
     * @param {string} fileId - The uploaded file ID
     * @param {number} pageNum - Page number to analyze (0-indexed)
     * @returns {Promise<Object>} Detected regions
     */
    async autoDetectRegions(fileId, pageNum) {
        if (this.isDetecting) {
            throw new Error('Detection already in progress');
        }

        this.isDetecting = true;

        try {
            console.log(`Auto-detecting regions on page ${pageNum + 1}...`);

            // Call Python service to detect regions
            const result = await API.detectRegions(fileId, pageNum);

            if (!result.success) {
                throw new Error(result.error || 'Detection failed');
            }

            const detected = result.detected;
            console.log('Detection result:', detected);

            // Store detection result for table view
            this.lastDetectionResult = detected;

            // Apply detected regions to grid overlay
            this.applyDetectedRegions(detected);

            return detected;

        } catch (error) {
            console.error('Auto-detection error:', error);
            throw error;
        } finally {
            this.isDetecting = false;
        }
    }

    /**
     * Apply detected regions to the grid overlay
     * 
     * @param {Object} detected - Detected regions from Azure Vision
     */
    applyDetectedRegions(detected) {
        // Auto-detect and draw grid if detected
        if (detected.gridDetected && detected.gridBoundary) {
            const gb = detected.gridBoundary;
            const rows = detected.gridRows || 4;
            const cols = detected.gridColumns || 3;

            console.log(`Auto-detected grid: ${rows}x${cols}`);
            console.log(`Grid boundary: x=${gb.x}, y=${gb.y}, width=${gb.width}, height=${gb.height}`);

            // Draw grid with detected dimensions
            this.gridOverlay.drawGrid(rows, cols, gb.x, gb.y, gb.width, gb.height);

            // Wait a bit for grid to be established
            setTimeout(() => {
                this.applyTemplateBoxes(detected);
            }, 100);
        } else {
            console.log('No grid detected, applying template boxes only');
            this.applyTemplateBoxes(detected);
        }
    }

    /**
     * Apply voter ID and photo box templates
     * 
     * @param {Object} detected - Detected regions from Azure Vision
     */
    applyTemplateBoxes(detected) {
        if (!this.gridOverlay.grid) {
            console.warn('Grid not established, cannot apply template boxes');
            return;
        }

        const firstCell = this.gridOverlay.getFirstCell();
        if (!firstCell) {
            console.warn('Cannot get first cell coordinates');
            return;
        }

        // Apply voter ID box (use first detection with highest confidence)
        if (detected.voterIdBoxes && detected.voterIdBoxes.length > 0) {
            // Sort by confidence
            const sortedVoterIds = detected.voterIdBoxes.sort((a, b) => 
                (b.confidence || 0) - (a.confidence || 0)
            );

            const voterIdBox = sortedVoterIds[0];
            
            // Convert to relative coordinates (relative to first cell)
            this.gridOverlay.voterIdBox = {
                x: voterIdBox.x - firstCell.x,
                y: voterIdBox.y - firstCell.y,
                width: voterIdBox.width,
                height: voterIdBox.height
            };

            console.log('✓ Voter ID box applied:', this.gridOverlay.voterIdBox);
            
            if (voterIdBox.text) {
                console.log(`  Detected voter ID: ${voterIdBox.text}`);
            }
        } else {
            console.warn('No voter ID boxes detected');
        }

        // Apply photo box (use first detection with highest confidence)
        if (detected.photoBoxes && detected.photoBoxes.length > 0) {
            // Sort by confidence
            const sortedPhotos = detected.photoBoxes.sort((a, b) => 
                (b.confidence || 0) - (a.confidence || 0)
            );

            const photoBox = sortedPhotos[0];
            
            // Convert to relative coordinates (relative to first cell)
            this.gridOverlay.photoBox = {
                x: photoBox.x - firstCell.x,
                y: photoBox.y - firstCell.y,
                width: photoBox.width,
                height: photoBox.height
            };

            console.log('✓ Photo box applied:', this.gridOverlay.photoBox);
        } else {
            console.warn('No photo boxes detected');
        }

        // Redraw to show the detected boxes
        this.gridOverlay.redraw();
        
        // Log final state for debugging
        console.log('Grid overlay state after detection:');
        console.log('  - voterIdBox:', this.gridOverlay.voterIdBox);
        console.log('  - photoBox:', this.gridOverlay.photoBox);
        console.log('  - grid:', this.gridOverlay.grid ? 'present' : 'null');
    }

    /**
     * Show detection summary
     * 
     * @param {Object} detected - Detected regions
     * @returns {string} Summary message
     */
    getDetectionSummary(detected) {
        const parts = [];

        if (detected.gridDetected) {
            parts.push(`Grid: ${detected.gridRows}x${detected.gridColumns}`);
        }

        const voterIdCount = detected.voterIdBoxes?.length || 0;
        const photoCount = detected.photoBoxes?.length || 0;

        parts.push(`${voterIdCount} voter ID${voterIdCount !== 1 ? 's' : ''}`);
        parts.push(`${photoCount} photo${photoCount !== 1 ? 's' : ''}`);

        return `Detected: ${parts.join(', ')}`;
    }

    /**
     * Validate detection results
     * 
     * @param {Object} detected - Detected regions
     * @returns {Object} Validation result with warnings
     */
    validateDetection(detected) {
        const warnings = [];
        const isValid = true;

        // Check if anything was detected
        if (!detected.voterIdBoxes?.length && !detected.photoBoxes?.length) {
            warnings.push('No regions detected. You may need to draw grid manually.');
        }

        // Check if grid was detected
        if (!detected.gridDetected) {
            warnings.push('No grid structure detected. Draw grid manually for best results.');
        }

        // Check voter ID boxes
        if (detected.voterIdBoxes?.length === 0) {
            warnings.push('No voter ID regions found. Define manually in template mode.');
        }

        // Check photo boxes
        if (detected.photoBoxes?.length === 0) {
            warnings.push('No photo regions found. Define manually in template mode.');
        }

        // Check confidence levels
        if (detected.voterIdBoxes?.length > 0) {
            const avgConfidence = detected.voterIdBoxes.reduce((sum, box) => 
                sum + (box.confidence || 0), 0) / detected.voterIdBoxes.length;
            
            if (avgConfidence < 0.6) {
                warnings.push('Low confidence detection. Manual adjustment recommended.');
            }
        }

        return {
            isValid,
            warnings,
            hasGrid: detected.gridDetected,
            hasVoterIds: (detected.voterIdBoxes?.length || 0) > 0,
            hasPhotos: (detected.photoBoxes?.length || 0) > 0
        };
    }

    /**
     * Check if Azure Vision is configured
     * 
     * @returns {Promise<boolean>} True if configured
     */
    async isConfigured() {
        try {
            // Try to call the API to check if it's available
            const response = await fetch('http://localhost:5000/health');
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get last detection result
     * 
     * @returns {Object|null} Last detection result
     */
    getLastDetectionResult() {
        return this.lastDetectionResult;
    }

    /**
     * Export detection results to CSV
     * 
     * @returns {string} CSV content
     */
    exportToCSV() {
        if (!this.lastDetectionResult) {
            return '';
        }

        const detected = this.lastDetectionResult;
        let csv = '';

        // Voter ID Boxes CSV
        csv += '=== VOTER ID BOXES ===\n';
        csv += '#,Voter ID,X,Y,Width,Height,Confidence\n';
        
        if (detected.voterIdBoxes && detected.voterIdBoxes.length > 0) {
            detected.voterIdBoxes.forEach((box, index) => {
                csv += `${index + 1},${box.text || 'N/A'},${box.x},${box.y},${box.width},${box.height},${(box.confidence || 0).toFixed(2)}\n`;
            });
        } else {
            csv += 'No voter ID boxes detected\n';
        }

        csv += '\n';

        // Photo Boxes CSV
        csv += '=== PHOTO BOXES ===\n';
        csv += '#,X,Y,Width,Height,Confidence\n';
        
        if (detected.photoBoxes && detected.photoBoxes.length > 0) {
            detected.photoBoxes.forEach((box, index) => {
                csv += `${index + 1},${box.x},${box.y},${box.width},${box.height},${(box.confidence || 0).toFixed(2)}\n`;
            });
        } else {
            csv += 'No photo boxes detected\n';
        }

        csv += '\n';

        // Grid Information CSV
        csv += '=== GRID INFORMATION ===\n';
        csv += 'Property,Value\n';
        csv += `Grid Detected,${detected.gridDetected ? 'Yes' : 'No'}\n`;
        
        if (detected.gridDetected) {
            csv += `Rows,${detected.gridRows || 'N/A'}\n`;
            csv += `Columns,${detected.gridColumns || 'N/A'}\n`;
            
            if (detected.gridBoundary) {
                const gb = detected.gridBoundary;
                csv += `Grid Boundary,"x=${gb.x} y=${gb.y} width=${gb.width} height=${gb.height}"\n`;
            }
        }

        return csv;
    }

    /**
     * Download CSV file
     */
    downloadCSV() {
        const csv = this.exportToCSV();
        if (!csv) {
            console.warn('No detection results to export');
            return;
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `azure_vision_detection_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

