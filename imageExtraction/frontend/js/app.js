/**
 * Main Application Module
 * Coordinates all components and handles user interactions
 */

// Application state
const AppState = {
    pdfFile: null,
    fileId: null,
    configId: null,
    excelId: null,
    totalPages: 0,
    extractedData: null,  // Store extracted data for preview
    tableImages: {}  // Store table images by page number
};

// Initialize components
const pdfViewer = new PDFViewer('pdfCanvas');
const gridOverlay = new GridOverlay('overlayCanvas');
const azureVisionIntegration = new AzureVisionIntegration(gridOverlay);

// DOM Elements
const elements = {
    // Upload
    pdfInput: document.getElementById('pdfInput'),
    uploadArea: document.getElementById('uploadArea'),
    fileInfo: document.getElementById('fileInfo'),
    
    // Page settings
    skipPagesStart: document.getElementById('skipPagesStart'),
    skipPagesEnd: document.getElementById('skipPagesEnd'),
    skipHeaderHeight: document.getElementById('skipHeaderHeight'),
    skipFooterHeight: document.getElementById('skipFooterHeight'),
    btnShowSkipZones: document.getElementById('btnShowSkipZones'),
    
    // Grid
    gridRows: document.getElementById('gridRows'),
    gridColumns: document.getElementById('gridColumns'),
    btnDrawGrid: document.getElementById('btnDrawGrid'),
    btnClearGrid: document.getElementById('btnClearGrid'),
    
    // Template
    btnTemplateMode: document.getElementById('btnTemplateMode'),
    btnApplyTemplate: document.getElementById('btnApplyTemplate'),
    templateStatus: document.getElementById('templateStatus'),
    fieldSelect: document.getElementById('fieldSelect'),
    fieldSelectionContainer: document.getElementById('fieldSelectionContainer'),
    selectedFieldIndicator: document.getElementById('selectedFieldIndicator'),
    selectedFieldName: document.getElementById('selectedFieldName'),
    
    // Extraction
    btnExtract: document.getElementById('btnExtract'),
    btnDownload: document.getElementById('btnDownload'),
    extractionStatus: document.getElementById('extractionStatus'),
    includeImages: document.getElementById('includeImages'),
    
    // Preview
    previewSection: document.getElementById('previewSection'),
    extractionSummary: document.getElementById('extractionSummary'),
    btnPreview: document.getElementById('btnPreview'),
    previewModal: document.getElementById('previewModal'),
    btnClosePreview: document.getElementById('btnClosePreview'),
    btnClosePreviewFooter: document.getElementById('btnClosePreviewFooter'),
    btnDownloadFromPreview: document.getElementById('btnDownloadFromPreview'),
    previewStats: document.getElementById('previewStats'),
    previewTableBody: document.getElementById('previewTableBody'),
    
    // Viewer controls
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    currentPage: document.getElementById('currentPage'),
    totalPages: document.getElementById('totalPages'),
    zoomLevel: document.getElementById('zoomLevel'),
    
    // Overlay
    loadingOverlay: document.getElementById('loadingOverlay'),
    viewerPlaceholder: document.getElementById('viewerPlaceholder'),
    canvasWrapper: document.getElementById('canvasWrapper'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// Event Listeners
function setupEventListeners() {
    // File upload
    if (elements.pdfInput) {
        elements.pdfInput.addEventListener('change', handleFileSelect);
    } else {
        console.error('PDF input element not found!');
    }
    
    if (elements.uploadArea) {
        elements.uploadArea.addEventListener('dragover', handleDragOver);
        elements.uploadArea.addEventListener('drop', handleFileDrop);
    } else {
        console.error('Upload area element not found!');
    }
    
    // Skip zones
    elements.btnShowSkipZones.addEventListener('click', handleShowSkipZones);
    
    // Grid
    elements.btnDrawGrid.addEventListener('click', handleDrawGrid);
    elements.btnClearGrid.addEventListener('click', handleClearGrid);
    
    // Template
    elements.btnTemplateMode.addEventListener('click', handleTemplateMode);
    elements.btnApplyTemplate.addEventListener('click', handleApplyTemplate);
    elements.fieldSelect.addEventListener('change', handleFieldSelect);
    
    // Extraction
    elements.btnExtract.addEventListener('click', handleExtract);
    elements.btnDownload.addEventListener('click', handleDownload);
    
    // Preview
    elements.btnPreview.addEventListener('click', handlePreview);
    elements.btnClosePreview.addEventListener('click', closePreviewModal);
    elements.btnClosePreviewFooter.addEventListener('click', closePreviewModal);
    elements.btnDownloadFromPreview.addEventListener('click', handleDownload);
    elements.previewModal.addEventListener('click', (e) => {
        if (e.target === elements.previewModal) closePreviewModal();
    });
    
    // Viewer controls
    elements.btnPrevPage.addEventListener('click', handlePrevPage);
    elements.btnNextPage.addEventListener('click', handleNextPage);
    elements.btnZoomIn.addEventListener('click', handleZoomIn);
    elements.btnZoomOut.addEventListener('click', handleZoomOut);
    
    // Custom events
    window.addEventListener('showToast', (e) => {
        showToast(e.detail.message, e.detail.type);
    });
}

// File Upload Handlers
async function handleFileSelect(event) {
    const file = event.target?.files?.[0];
    if (file) {
        console.log('File selected:', file.name, file.type, file.size);
        await loadPDFFile(file);
    } else {
        console.warn('No file selected or file input is empty');
        showToast('No file selected', 'error');
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    elements.uploadArea.classList.add('drag-over');
}

async function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (elements.uploadArea) {
        elements.uploadArea.classList.remove('drag-over');
    }
    
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        console.log('File dropped:', file.name, file.type, file.size);
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            await loadPDFFile(file);
        } else {
            showToast('Please drop a PDF file', 'error');
        }
    } else {
        console.warn('No file in drop event');
        showToast('No file dropped', 'error');
    }
}

async function loadPDFFile(file) {
    try {
        showLoading(true, 'Loading PDF...');
        
        // Load PDF in viewer first
        const result = await pdfViewer.loadPDF(file);
        AppState.pdfFile = file;
        AppState.totalPages = result.totalPages;
        
        // Update UI
        elements.viewerPlaceholder.classList.add('hidden');
        elements.canvasWrapper.classList.remove('hidden');
        elements.currentPage.textContent = '1';
        elements.totalPages.textContent = result.totalPages;
        elements.fileInfo.textContent = `📄 ${file.name} (${result.totalPages} pages)`;
        elements.fileInfo.classList.remove('hidden');
        
        // Update canvas wrapper for initial zoom state
        setTimeout(() => {
            updateCanvasWrapperForZoom();
        }, 100);
        
        // Enable controls
        elements.btnPrevPage.disabled = false;
        elements.btnNextPage.disabled = false;
        
        // Upload to server (non-blocking, can work offline for preview)
        showLoading(true, 'Uploading to server...');
        try {
            const uploadResult = await API.uploadPDF(file);
            AppState.fileId = uploadResult.fileId;
            console.log('File uploaded successfully:', uploadResult);
            showToast('PDF loaded and uploaded successfully!', 'success');
        } catch (uploadError) {
            console.warn('Server upload failed, but PDF loaded in viewer:', uploadError);
            showToast('PDF loaded in viewer. Upload failed: ' + uploadError.message + ' (You can still adjust grid, but extraction needs server)', 'error');
            // Set fileId to null so extraction knows to fail early
            AppState.fileId = null;
        }
        
        showLoading(false);
        
    } catch (error) {
        console.error('Load PDF error:', error);
        showToast('Failed to load PDF: ' + error.message, 'error');
        showLoading(false);
    }
}

// Skip Zones Handler
function handleShowSkipZones() {
    const headerHeight = parseInt(elements.skipHeaderHeight.value) || 0;
    const footerHeight = parseInt(elements.skipFooterHeight.value) || 0;
    gridOverlay.toggleSkipZones(headerHeight, footerHeight);
}

// Grid Handlers
function handleDrawGrid() {
    const rows = parseInt(elements.gridRows.value) || 9;
    const columns = parseInt(elements.gridColumns.value) || 3;
    
    if (!AppState.pdfFile) {
        showToast('Please upload a PDF first', 'error');
        return;
    }
    
    gridOverlay.drawGrid(rows, columns);
    
    // Check if cached config exists and offer to load it
    const cached = localStorage.getItem('gridTemplateConfig');
    if (cached) {
        const config = JSON.parse(cached);
        if (config.template && (config.template.voterIdBox || config.template.photoBox)) {
            if (confirm('Found cached template configuration. Load it?')) {
                gridOverlay.loadCachedConfig();
                gridOverlay.redraw();
                showToast('Cached template loaded!', 'success');
            }
        }
    }
    
    showToast('Grid drawn! Drag any line to adjust spacing, drag corners to resize, or drag center to move.', 'success');
    
    // Enable template mode button
    elements.btnTemplateMode.disabled = false;
}

function handleClearGrid() {
    gridOverlay.clearGrid();
    elements.btnTemplateMode.disabled = true;
    elements.btnApplyTemplate.disabled = true;
    elements.btnExtract.disabled = true;
    elements.templateStatus.classList.add('hidden');
    showToast('Grid cleared', 'info');
}

// Template Handlers
function handleTemplateMode() {
    const enabled = gridOverlay.enableTemplateMode();
    if (enabled) {
        elements.btnTemplateMode.textContent = '✓ Template Mode Active';
        elements.btnTemplateMode.classList.remove('btn-primary');
        elements.btnTemplateMode.classList.add('btn-success');
        elements.fieldSelectionContainer.classList.remove('hidden');
        elements.templateStatus.textContent = 'Select a field from dropdown, then draw a box on the first cell.';
        elements.templateStatus.classList.remove('hidden');
        elements.templateStatus.classList.add('info');
        showToast('Template mode enabled. Select a field from dropdown and draw boxes.', 'info');
    }
}

function handleFieldSelect(event) {
    const selectedField = event.target.value;
    if (!selectedField) {
        gridOverlay.templateType = null;
        // Hide indicator
        if (elements.selectedFieldIndicator) {
            elements.selectedFieldIndicator.style.display = 'none';
        }
        return;
    }
    
    // Map dropdown values to template types
    const fieldMap = {
        'voterID': 'voterID',
        'photo': 'photo',
        'serialNumber': 'serialNumber',
        'name': 'name',
        'relativeName': 'relativeName',
        'houseNumber': 'houseNumber',
        'age': 'age',
        'gender': 'gender',
        'yadiBhag': 'yadiBhag'
    };
    
    const templateType = fieldMap[selectedField];
    if (templateType) {
        gridOverlay.templateType = templateType;
        const fieldNames = {
            'voterID': 'Voter ID',
            'photo': 'Photo',
            'serialNumber': 'Serial Number',
            'name': 'Name',
            'relativeName': 'Relative Name',
            'houseNumber': 'House Number',
            'age': 'Age',
            'gender': 'Gender',
            'yadiBhag': 'Yadi Bhag'
        };
        console.log(`Field selected from dropdown: ${templateType} (${fieldNames[templateType]})`);
        showToast(`Selected: ${fieldNames[templateType]}. Now draw the box on the first cell (top-left).`, 'info');
        
        // Update status message and indicator
        elements.templateStatus.textContent = `Selected: ${fieldNames[templateType]}. Draw box on first cell.`;
        elements.templateStatus.classList.remove('hidden');
        elements.templateStatus.classList.add('info');
        
        // Show selected field indicator
        if (elements.selectedFieldIndicator && elements.selectedFieldName) {
            elements.selectedFieldName.textContent = fieldNames[templateType];
            elements.selectedFieldIndicator.style.display = 'block';
        }
    } else {
        console.error('Unknown field selected:', selectedField);
        showToast('Unknown field selected. Please try again.', 'error');
    }
}

function handleApplyTemplate() {
    if (!gridOverlay.isTemplateComplete()) {
        showToast('Please define both Voter ID and Photo boxes', 'error');
        return;
    }
    
    gridOverlay.disableTemplateMode();
    elements.btnTemplateMode.textContent = 'Template Defined ✓';
    elements.btnApplyTemplate.disabled = true;
    elements.fieldSelectionContainer.classList.add('hidden');
    elements.fieldSelect.value = ''; // Reset dropdown
    elements.templateStatus.textContent = '✓ Template applied to all cells';
    elements.templateStatus.classList.remove('info');
    elements.templateStatus.classList.add('success');
    elements.btnExtract.disabled = false;
    
    // Save to cache
    gridOverlay.saveConfigToCache();
    
    showToast('Template applied successfully! Configuration saved to cache.', 'success');
}

// Watch for template completion
setInterval(() => {
    if (gridOverlay.templateMode && gridOverlay.isTemplateComplete()) {
        elements.btnApplyTemplate.disabled = false;
    }
}, 500);

// Extraction Handlers
async function handleExtract() {
    try {
        // Check if PDF file exists
        if (!AppState.pdfFile) {
            showToast('Please upload a PDF file first', 'error');
            return;
        }

        // Check if file was uploaded to server
        if (!AppState.fileId) {
            showToast('PDF upload to server failed. Please ensure the backend server is running and try uploading the PDF again.', 'error');
            return;
        }
        
        const gridConfig = gridOverlay.getGridConfig();
        const cellTemplate = gridOverlay.getCellTemplate();
        
        if (!gridConfig || !cellTemplate) {
            showToast('Please complete grid and template configuration first', 'error');
            return;
        }
        
        showLoading(true, 'Configuring extraction...');
        
        // Get PDF scale for coordinate conversion
        const pdfScale = gridOverlay.pdfScale || 1.5;
        
        // Get include images option
        const includeImages = elements.includeImages ? elements.includeImages.checked : true;
        
        // Configure extraction
        // IMPORTANT: skipHeaderHeight and skipFooterHeight are in CANVAS coordinates,
        // so we need to convert them to PDF coordinates too!
        const config = {
            fileId: AppState.fileId,
            skipPagesStart: parseInt(elements.skipPagesStart.value) || 0,
            skipPagesEnd: parseInt(elements.skipPagesEnd.value) || 0,
            skipHeaderHeight: (parseInt(elements.skipHeaderHeight.value) || 0) / pdfScale,
            skipFooterHeight: (parseInt(elements.skipFooterHeight.value) || 0) / pdfScale,
            grid: gridConfig,
            cellTemplate: cellTemplate,
            includeImages: includeImages
        };
        
        console.log('Extraction Configuration (converted to PDF coordinates):', config);
        console.log(`PDF Scale used for conversion: ${pdfScale}`);
        
        const configResult = await API.configureExtraction(config);
        AppState.configId = configResult.configId;
        
        showLoading(true, 'Extracting data... This may take a few minutes.');
        
        // Show progress bar
        showExtractionProgress(0, 'Initializing extraction...');
        
        // Start extraction with progress simulation
        let progressInterval = null;
        try {
            progressInterval = simulateExtractionProgress();
            
            // Start extraction
            const extractResult = await API.extractGrid(AppState.configId);
            
            // Stop progress simulation
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            showExtractionProgress(100, 'Extraction completed!');
            
            AppState.excelId = extractResult.excelId;
            AppState.extractedData = extractResult.extractedData || [];  // Store extracted data
            AppState.tableImages = extractResult.tableImages || {};  // Store table images
            
            console.log('Extraction completed. Records:', extractResult.recordsExtracted);
            console.log('Extracted data available:', extractResult.extractedData ? extractResult.extractedData.length : 0, 'records');
            console.log('Excel ID:', AppState.excelId);
            
            showLoading(false);
            
            // Get stats from result
            const stats = extractResult.stats || {};
            
            // Log stats
            if (stats.extraction_time_seconds) {
                console.log(`⏱️ Execution Time: ${stats.extraction_time_seconds}s (${stats.extraction_time_minutes || 0} minutes)`);
            }
            if (stats.azure_api_calls) {
                console.log(`🔌 Azure API Calls: ${stats.azure_api_calls}`);
            }
            console.log('📊 Stats:', stats);
            const extractionTime = stats.extraction_time_seconds || 0;
            const extractionTimeMinutes = stats.extraction_time_minutes || 0;
            const apiCalls = stats.azure_api_calls || 0;
            const cellsSkipped = stats.cells_skipped || 0;
            
            // Format time
            const timeFormatted = extractionTime > 60 
                ? `${Math.floor(extractionTime / 60)}m ${Math.round(extractionTime % 60)}s`
                : `${Math.round(extractionTime)}s`;
            
            // Update UI - show success message
            showExtractionProgress(100, `✓ Extracted ${extractResult.recordsExtracted} records successfully!`);
            elements.extractionStatus.classList.remove('hidden');
            elements.extractionStatus.classList.add('success');
            
            // Show preview section with stats
            let summaryHtml = `
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 18px; color: #10b981;">${extractResult.recordsExtracted}</strong> records extracted successfully!
                </div>
            `;
            
            if (extractionTime > 0 || cellsSkipped > 0 || apiCalls > 0) {
                summaryHtml += `<div style="margin-top: 12px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 13px;">`;
                
                if (extractionTime > 0) {
                    summaryHtml += `
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span>⏱️</span>
                            <span><strong>Execution Time:</strong> ${timeFormatted} ${extractionTimeMinutes > 0 ? `(${extractionTimeMinutes.toFixed(2)} minutes)` : ''}</span>
                        </div>
                    `;
                }
                
                if (apiCalls > 0) {
                    summaryHtml += `
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span>🔌</span>
                            <span><strong>Azure API Calls:</strong> ${apiCalls}</span>
                        </div>
                    `;
                }
                
                if (cellsSkipped > 0) {
                    summaryHtml += `
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                            <span>⊘</span>
                            <span style="color: #f59e0b;"><strong>Skipped:</strong> ${cellsSkipped} cells (no voter ID found)</span>
                        </div>
                    `;
                }
                
                summaryHtml += `</div>`;
            }
            
            summaryHtml += `<div style="margin-top: 12px; font-size: 13px; color: #6b7280;">Click "Preview Data" to see results before downloading.</div>`;
            
            // Show preview section with data
            console.log('Showing preview section. Hidden class:', elements.previewSection.classList.contains('hidden'));
            elements.previewSection.classList.remove('hidden');
            console.log('After removal. Hidden class:', elements.previewSection.classList.contains('hidden'));
            elements.extractionSummary.innerHTML = summaryHtml;
            elements.btnDownload.disabled = false;
            elements.btnPreview.disabled = false;  // Ensure preview button is enabled
            
            console.log('Preview section shown. Data ready:', AppState.extractedData ? AppState.extractedData.length : 0, 'records');
            
            // Show toast with stats
            let toastMsg = `Extraction complete! ${extractResult.recordsExtracted} records extracted.`;
            if (extractionTime > 0) toastMsg += ` Time: ${timeFormatted}`;
            showToast(toastMsg, 'success');
            
        } catch (error) {
            console.error('Extraction error:', error);
            
            // Stop progress simulation if running
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            
            // Show error in progress bar
            showExtractionProgress(0, '✗ Extraction failed: ' + error.message);
            if (elements.extractionStatus) {
                elements.extractionStatus.classList.remove('hidden');
                elements.extractionStatus.classList.remove('success');
                elements.extractionStatus.classList.remove('info');
                elements.extractionStatus.style.background = '#fee2e2';
                elements.extractionStatus.style.color = '#991b1b';
            }
            
            showLoading(false);
            if (error.message.includes('Failed to fetch') || error.message.includes('Cannot connect')) {
                showToast('Cannot connect to server. Please ensure both Node.js and Python servers are running (START_SERVERS.bat)', 'error');
            } else {
                showToast('Extraction failed: ' + error.message, 'error');
            }
        }
    } catch (error) {
        console.error('Extraction setup error:', error);
        showLoading(false);
        showToast('Extraction setup failed: ' + error.message, 'error');
    }
}

function handleDownload() {
    if (!AppState.excelId) {
        showToast('No file to download', 'error');
        return;
    }
    
    API.downloadExcel(AppState.excelId);
    showToast('Downloading Excel file...', 'success');
}

// Viewer Control Handlers
async function handlePrevPage() {
    await pdfViewer.prevPage();
    updatePageDisplay();
    updateCanvasWrapperForZoom();
    gridOverlay.redraw();
}

async function handleNextPage() {
    await pdfViewer.nextPage();
    updatePageDisplay();
    updateCanvasWrapperForZoom();
    gridOverlay.redraw();
}

async function handleZoomIn() {
    await pdfViewer.zoomIn();
    updateZoomDisplay();
    updateCanvasWrapperForZoom();
    gridOverlay.redraw();
}

async function handleZoomOut() {
    await pdfViewer.zoomOut();
    updateZoomDisplay();
    updateCanvasWrapperForZoom();
    gridOverlay.redraw();
}

function updateCanvasWrapperForZoom() {
    const canvas = document.getElementById('pdfCanvas');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const wrapper = elements.canvasWrapper;
    
    if (!canvas || !wrapper) return;
    
    // Get container dimensions
    const containerWidth = wrapper.clientWidth;
    const containerHeight = wrapper.clientHeight;
    
    // Get canvas dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // If canvas is larger than container, remove centered class to enable scrolling
    // Otherwise, center it
    if (canvasWidth > containerWidth || canvasHeight > containerHeight) {
        wrapper.classList.remove('centered');
        
        // Reset canvas positioning to allow proper scrolling from top-left
        canvas.style.position = 'relative';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.right = 'auto';
        canvas.style.bottom = 'auto';
        canvas.style.transform = 'none';
        canvas.style.margin = '0';
        canvas.style.display = 'block';
        
        // Ensure overlay canvas matches PDF canvas position exactly
        if (overlayCanvas) {
            overlayCanvas.style.position = 'absolute';
            overlayCanvas.style.top = '0';
            overlayCanvas.style.left = '0';
            overlayCanvas.style.right = 'auto';
            overlayCanvas.style.bottom = 'auto';
            overlayCanvas.style.transform = 'none';
            overlayCanvas.style.margin = '0';
        }
        
        // Ensure wrapper can scroll properly
        wrapper.style.overflow = 'auto';
        wrapper.style.alignItems = 'flex-start';
        wrapper.style.justifyContent = 'flex-start';
        wrapper.style.minHeight = '0';
        
        // Force a reflow to ensure styles are applied
        void wrapper.offsetHeight;
        
        // Ensure we can scroll to top - reset if needed
        if (wrapper.scrollTop > 0 && wrapper.scrollTop < 10) {
            wrapper.scrollTop = 0;
        }
        if (wrapper.scrollLeft > 0 && wrapper.scrollLeft < 10) {
            wrapper.scrollLeft = 0;
        }
    } else {
        wrapper.classList.add('centered');
        
        // Center canvas
        canvas.style.position = 'absolute';
        canvas.style.top = '50%';
        canvas.style.left = '50%';
        canvas.style.transform = 'translate(-50%, -50%)';
        
        // Center overlay canvas with PDF canvas
        overlayCanvas.style.position = 'absolute';
        overlayCanvas.style.top = '50%';
        overlayCanvas.style.left = '50%';
        overlayCanvas.style.transform = 'translate(-50%, -50%)';
        
        wrapper.style.overflow = 'hidden';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
    }
    
    // Sync overlay canvas size with PDF canvas
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
}

function updatePageDisplay() {
    elements.currentPage.textContent = pdfViewer.currentPage;
}

function updateZoomDisplay() {
    elements.zoomLevel.textContent = pdfViewer.getZoomLevel() + '%';
}

// UI Helpers
function showLoading(show, message = 'Processing...') {
    if (show) {
        elements.loadingOverlay.classList.remove('hidden');
        const loadingText = elements.loadingOverlay.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function showExtractionProgress(percentage, message) {
    const progressFill = document.getElementById('extractionProgressFill');
    const progressText = document.getElementById('extractionProgressText');
    const statusDiv = elements.extractionStatus;
    
    if (progressFill) {
        progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    }
    
    if (progressText) {
        progressText.textContent = message || `Processing... ${Math.round(percentage)}%`;
    }
    
    // Show the status div
    if (statusDiv) {
        statusDiv.classList.remove('hidden');
        // Remove success class if not 100%
        if (percentage < 100) {
            statusDiv.classList.remove('success');
            statusDiv.classList.add('info');
        }
    }
}

function simulateExtractionProgress() {
    let progress = 0;
    const stages = [
        { progress: 5, message: 'Initializing extraction...' },
        { progress: 15, message: 'Loading PDF pages...' },
        { progress: 30, message: 'Extracting cell data...' },
        { progress: 50, message: 'Processing images...' },
        { progress: 70, message: 'Running OCR on table images...' },
        { progress: 85, message: 'Matching and merging data...' },
        { progress: 95, message: 'Generating Excel file...' }
    ];
    
    let currentStage = 0;
    
    const interval = setInterval(() => {
        // Move to next stage if current progress is close
        if (currentStage < stages.length - 1 && progress >= stages[currentStage].progress - 5) {
            currentStage++;
        }
        
        // Gradually increase progress
        if (progress < 95) {
            progress += Math.random() * 2 + 0.5; // Random increment between 0.5 and 2.5
            progress = Math.min(progress, stages[currentStage].progress);
            
            const stage = stages[currentStage];
            showExtractionProgress(progress, stage.message);
        }
    }, 500); // Update every 500ms
    
    return interval;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    };
    
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <div class="toast-message">${message}</div>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
}

// Preview Modal Handlers
function handlePreview() {
    console.log('Preview button clicked. Data available:', AppState.extractedData ? AppState.extractedData.length : 0);
    
    if (!AppState.extractedData || AppState.extractedData.length === 0) {
        console.error('No data to preview');
        showToast('No data to preview', 'error');
        return;
    }
    
    console.log('Opening preview modal...');
    // Show modal
    elements.previewModal.classList.remove('hidden');
    
    // Populate stats
    const totalRecords = AppState.extractedData.length;
    const withVoterIds = AppState.extractedData.filter(r => r.voterID && r.voterID.trim()).length;
    const withSerialNumbers = AppState.extractedData.filter(r => r.serialNumber && r.serialNumber.trim()).length;
    const withYadiBhag = AppState.extractedData.filter(r => r.yadiBhag && r.yadiBhag.trim()).length;
    const withPhotos = AppState.extractedData.filter(r => r.image_base64 && r.image_base64.trim()).length;
    
    // Check which fields exist in data
    const hasYadiBhag = withYadiBhag > 0;
    const hasName = AppState.extractedData.some(r => r.name && r.name.trim());
    const hasRelativeName = AppState.extractedData.some(r => r.relativeName && r.relativeName.trim());
    const hasHouseNumber = AppState.extractedData.some(r => r.houseNumber && r.houseNumber.trim());
    const hasAge = AppState.extractedData.some(r => r.age && r.age.trim());
    const hasGender = AppState.extractedData.some(r => r.gender && r.gender.trim());
    
    // Show table images if available
    const tableImagesSection = document.getElementById('tableImagesSection');
    const tableImagesContainer = document.getElementById('tableImagesContainer');
    if (AppState.tableImages && Object.keys(AppState.tableImages).length > 0) {
        tableImagesSection.style.display = 'block';
        tableImagesContainer.innerHTML = Object.entries(AppState.tableImages).map(([pageNum, filename]) => {
            const imageUrl = `/api/table-image/${filename}`;
            return `
                <div style="border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: white;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px;">Page ${pageNum}</h4>
                    <img src="${imageUrl}" 
                         alt="Table for page ${pageNum}" 
                         style="width: 100%; height: auto; border-radius: 4px; cursor: pointer;"
                         onclick="window.open('${imageUrl}', '_blank')"
                         title="Click to view full size">
                </div>
            `;
        }).join('');
    } else {
        tableImagesSection.style.display = 'none';
    }
    
    // Show/hide column headers
    const headers = {
        'name': document.querySelector('.name-header'),
        'relativeName': document.querySelector('.relative-name-header'),
        'houseNumber': document.querySelector('.house-number-header'),
        'age': document.querySelector('.age-header'),
        'gender': document.querySelector('.gender-header'),
        'yadiBhag': document.querySelector('.yadi-bhag-header')
    };
    
    if (headers.name) headers.name.classList.toggle('hidden', !hasName);
    if (headers.relativeName) headers.relativeName.classList.toggle('hidden', !hasRelativeName);
    if (headers.houseNumber) headers.houseNumber.classList.toggle('hidden', !hasHouseNumber);
    if (headers.age) headers.age.classList.toggle('hidden', !hasAge);
    if (headers.gender) headers.gender.classList.toggle('hidden', !hasGender);
    if (headers.yadiBhag) headers.yadiBhag.classList.toggle('hidden', !hasYadiBhag);
    
    elements.previewStats.innerHTML = `
        <div class="stat-item">
            <span class="stat-value">${totalRecords}</span>
            <span class="stat-label">Total Records</span>
        </div>
        <div class="stat-item">
            <span class="stat-value">${withVoterIds}</span>
            <span class="stat-label">Voter IDs Found</span>
        </div>
        <div class="stat-item">
            <span class="stat-value">${withSerialNumbers}</span>
            <span class="stat-label">Serial Numbers Found</span>
        </div>
        ${hasYadiBhag ? `
        <div class="stat-item">
            <span class="stat-value">${withYadiBhag}</span>
            <span class="stat-label">Yadi Bhag Found</span>
        </div>
        ` : ''}
        <div class="stat-item">
            <span class="stat-value">${withPhotos}</span>
            <span class="stat-label">Photos Extracted</span>
        </div>
    `;
    
    // Show/hide yadiBhag column header
    const yadiBhagHeader = document.querySelector('.yadi-bhag-header');
    if (yadiBhagHeader) {
        if (hasYadiBhag) {
            yadiBhagHeader.classList.remove('hidden');
        } else {
            yadiBhagHeader.classList.add('hidden');
        }
    }
    
    // Populate table
    elements.previewTableBody.innerHTML = AppState.extractedData.map((record, index) => {
        const confidence = record.metadata?.voter_id_confidence || 0;
        const confidenceClass = getConfidenceClass(confidence);
        const confidencePercent = (confidence * 100).toFixed(0);
        
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${record.page || '-'}</td>
                <td>${record.row || '-'}</td>
                <td>${record.column || '-'}</td>
                <td class="voter-id-cell">${record.voterID || '<span class="no-data">No ID</span>'}</td>
                <td class="serial-number-cell">${record.serialNumber || '<span class="no-data">-</span>'}</td>
                ${hasName ? `<td class="name-cell">${record.name || '<span class="no-data">-</span>'}</td>` : ''}
                ${hasRelativeName ? `<td class="relative-name-cell">${record.relativeName || '<span class="no-data">-</span>'}</td>` : ''}
                ${hasHouseNumber ? `<td class="house-number-cell">${record.houseNumber || '<span class="no-data">-</span>'}</td>` : ''}
                ${hasAge ? `<td class="age-cell">${record.age || '<span class="no-data">-</span>'}</td>` : ''}
                ${hasGender ? `<td class="gender-cell">${record.gender || '<span class="no-data">-</span>'}</td>` : ''}
                ${hasYadiBhag ? `<td class="yadi-bhag-cell">${record.yadiBhag || '<span class="no-data">-</span>'}</td>` : ''}
                <td class="photo-cell">
                    ${record.image_base64 
                        ? `<img src="data:image/jpeg;base64,${record.image_base64}" 
                             alt="Voter Photo" 
                             class="preview-photo" 
                             title="Click to zoom">`
                        : '<span class="no-data">No Photo</span>'}
                </td>
                <td>
                    <span class="confidence-badge ${confidenceClass}">
                        ${confidencePercent}%
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    showToast(`Previewing ${totalRecords} records`, 'info');
}

function closePreviewModal() {
    elements.previewModal.classList.add('hidden');
}

// Check server health on load
async function checkServerHealth() {
    const isHealthy = await API.checkHealth();
    if (!isHealthy) {
        showToast('Warning: Cannot connect to backend server. Please ensure it is running.', 'error');
    }
}

// Initialize application
function init() {
    console.log('Initializing Grid-Based PDF Voter Data Extraction Tool');
    setupEventListeners();
    checkServerHealth();
    
    // Initial state
    elements.canvasWrapper.classList.add('hidden');
    
    console.log('Application initialized successfully');
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


