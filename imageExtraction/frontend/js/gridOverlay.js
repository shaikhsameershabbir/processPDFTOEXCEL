/**
 * Grid Overlay Module
 * Handles grid drawing, cell selection, and template definition
 */

class GridOverlay {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.context = this.canvas.getContext('2d');
        
        // Grid state
        this.grid = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.isDraggingLine = false;
        this.resizeHandle = null; // 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'
        this.draggedLine = null; // {type: 'row'|'col', index: number}
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.gridStartX = 0;
        this.gridStartY = 0;
        this.gridStartWidth = 0;
        this.gridStartHeight = 0;
        
        // Custom line positions (for non-uniform grids)
        this.customRowPositions = []; // Array of y positions
        this.customColPositions = []; // Array of x positions
        
        // Template state
        this.templateMode = false;
        this.templateType = null; // 'voterID', 'photo', 'serialNumber', 'name', 'relativeName', 'houseNumber', 'age', 'gender', 'yadiBhag'
        this.voterIdBox = null;
        this.photoBox = null;
        this.serialNumberBox = null;
        this.nameBox = null;
        this.relativeNameBox = null;
        this.houseNumberBox = null;
        this.ageBox = null;
        this.genderBox = null;
        this.yadiBhagBox = null;
        
        // Drawing state
        this.drawStart = null;
        this.currentRect = null;
        
        // Skip zones
        this.showSkipZones = false;
        this.headerHeight = 0;
        this.footerHeight = 0;
        
        // PDF scale (CRITICAL: must match pdfViewer scale for coordinate conversion)
        this.pdfScale = 1.5;  // Default scale from PDFViewer
        
        // Bind event listeners
        this.setupEventListeners();
        
        // Load cached configuration
        this.loadCachedConfig();
    }
    
    /**
     * Save grid and template configuration to localStorage
     */
    saveConfigToCache() {
        try {
            const config = {
                grid: this.grid ? {
                    rows: this.grid.rows,
                    columns: this.grid.columns,
                    x: this.grid.x,
                    y: this.grid.y,
                    width: this.grid.width,
                    height: this.grid.height
                } : null,
                customRowPositions: this.customRowPositions,
                customColPositions: this.customColPositions,
                template: {
                    voterIdBox: this.voterIdBox,
                    photoBox: this.photoBox,
                    serialNumberBox: this.serialNumberBox,
                    nameBox: this.nameBox,
                    relativeNameBox: this.relativeNameBox,
                    houseNumberBox: this.houseNumberBox,
                    ageBox: this.ageBox,
                    genderBox: this.genderBox,
                    yadiBhagBox: this.yadiBhagBox
                },
                pdfScale: this.pdfScale
            };
            localStorage.setItem('gridTemplateConfig', JSON.stringify(config));
            console.log('Configuration saved to cache');
        } catch (error) {
            console.warn('Failed to save config to cache:', error);
        }
    }
    
    /**
     * Load grid and template configuration from localStorage
     */
    loadCachedConfig() {
        try {
            const cached = localStorage.getItem('gridTemplateConfig');
            if (!cached) return;
            
            const config = JSON.parse(cached);
            
            // Restore grid
            if (config.grid) {
                this.grid = config.grid;
                this.customRowPositions = config.customRowPositions || [];
                this.customColPositions = config.customColPositions || [];
            }
            
            // Restore template boxes
            if (config.template) {
                this.voterIdBox = config.template.voterIdBox;
                this.photoBox = config.template.photoBox;
                this.serialNumberBox = config.template.serialNumberBox;
                this.nameBox = config.template.nameBox;
                this.relativeNameBox = config.template.relativeNameBox;
                this.houseNumberBox = config.template.houseNumberBox;
                this.ageBox = config.template.ageBox;
                this.genderBox = config.template.genderBox;
                this.yadiBhagBox = config.template.yadiBhagBox;
            }
            
            if (config.pdfScale) {
                this.pdfScale = config.pdfScale;
            }
            
            console.log('Configuration loaded from cache');
            
            // Redraw if grid exists
            if (this.grid) {
                this.redraw();
            }
        } catch (error) {
            console.warn('Failed to load config from cache:', error);
        }
    }
    
    /**
     * Clear cached configuration
     */
    clearCachedConfig() {
        try {
            localStorage.removeItem('gridTemplateConfig');
            console.log('Cached configuration cleared');
        } catch (error) {
            console.warn('Failed to clear cache:', error);
        }
    }
    
    /**
     * Set PDF scale for coordinate conversion
     * Must be called when PDF scale changes
     */
    setPDFScale(scale) {
        this.pdfScale = scale;
        console.log(`Grid overlay scale updated to: ${scale}`);
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Listen for PDF page rendered events
        window.addEventListener('pdfPageRendered', this.handlePDFPageRendered.bind(this));
        
        // Listen for keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handlePDFPageRendered(event) {
        const { width, height, scale } = event.detail;
        this.canvas.width = width;
        this.canvas.height = height;
        
        // CRITICAL: Update PDF scale for coordinate conversion
        if (scale !== undefined) {
            this.setPDFScale(scale);
        }
        
        // Sync overlay canvas position with PDF canvas
        const pdfCanvas = document.getElementById('pdfCanvas');
        const wrapper = document.getElementById('canvasWrapper');
        
        if (pdfCanvas && wrapper) {
            const isCentered = wrapper.classList.contains('centered');
            if (isCentered) {
                this.canvas.style.top = '50%';
                this.canvas.style.left = '50%';
                this.canvas.style.transform = 'translate(-50%, -50%)';
            } else {
                this.canvas.style.top = '0';
                this.canvas.style.left = '0';
                this.canvas.style.transform = 'none';
            }
        }
        
        this.redraw();
    }

    handleMouseDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.templateMode && this.grid) {
            // Template mode - draw sub-regions in first cell
            // Only allow drawing if a field type is selected
            if (!this.templateType) {
                this.showToast('Please select a field from dropdown first', 'warning');
                return;
            }
            this.isDrawing = true;
            this.drawStart = { x, y };
        } else if (this.grid && !this.templateMode) {
            // Check if clicking on resize handle
            const handle = this.getResizeHandle(x, y);
            if (handle) {
                this.isResizing = true;
                this.resizeHandle = handle;
                this.dragStartX = x;
                this.dragStartY = y;
                this.gridStartX = this.grid.x;
                this.gridStartY = this.grid.y;
                this.gridStartWidth = this.grid.width;
                this.gridStartHeight = this.grid.height;
                return;
            }
            
            // Check if clicking on a grid line
            const line = this.getGridLineAtPoint(x, y);
            if (line) {
                this.isDraggingLine = true;
                this.draggedLine = line;
                this.dragStartX = x;
                this.dragStartY = y;
                return;
            }
            
            // Check if clicking on grid for dragging
            if (this.isPointInGrid(x, y)) {
                this.isDragging = true;
                this.dragStartX = x - this.grid.x;
                this.dragStartY = y - this.grid.y;
            }
        }
    }

    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.isDrawing && this.drawStart) {
            // Drawing template boxes
            this.currentRect = {
                x: Math.min(this.drawStart.x, x),
                y: Math.min(this.drawStart.y, y),
                width: Math.abs(x - this.drawStart.x),
                height: Math.abs(y - this.drawStart.y)
            };
            this.redraw();
        } else if (this.isDraggingLine && this.draggedLine) {
            // Dragging individual grid line
            if (this.draggedLine.type === 'row') {
                const newY = y;
                // Constrain within grid bounds
                if (newY > this.grid.y && newY < this.grid.y + this.grid.height) {
                    this.customRowPositions[this.draggedLine.index] = newY;
                }
            } else if (this.draggedLine.type === 'col') {
                const newX = x;
                // Constrain within grid bounds
                if (newX > this.grid.x && newX < this.grid.x + this.grid.width) {
                    this.customColPositions[this.draggedLine.index] = newX;
                }
            }
            this.redraw();
        } else if (this.isResizing && this.grid) {
            // Resizing grid from corner
            const deltaX = x - this.dragStartX;
            const deltaY = y - this.dragStartY;

            switch (this.resizeHandle) {
                case 'topLeft':
                    this.grid.x = this.gridStartX + deltaX;
                    this.grid.y = this.gridStartY + deltaY;
                    this.grid.width = this.gridStartWidth - deltaX;
                    this.grid.height = this.gridStartHeight - deltaY;
                    break;
                case 'topRight':
                    this.grid.y = this.gridStartY + deltaY;
                    this.grid.width = this.gridStartWidth + deltaX;
                    this.grid.height = this.gridStartHeight - deltaY;
                    break;
                case 'bottomLeft':
                    this.grid.x = this.gridStartX + deltaX;
                    this.grid.width = this.gridStartWidth - deltaX;
                    this.grid.height = this.gridStartHeight + deltaY;
                    break;
                case 'bottomRight':
                    this.grid.width = this.gridStartWidth + deltaX;
                    this.grid.height = this.gridStartHeight + deltaY;
                    break;
            }

            // Ensure minimum size
            if (this.grid.width < 100) this.grid.width = 100;
            if (this.grid.height < 100) this.grid.height = 100;

            // Reset custom positions when resizing
            this.initializeCustomPositions();
            this.redraw();
        } else if (this.isDragging && this.grid) {
            // Dragging grid
            this.grid.x = x - this.dragStartX;
            this.grid.y = y - this.dragStartY;
            this.redraw();
        } else if (this.grid && !this.templateMode) {
            // Update cursor based on hover position
            const handle = this.getResizeHandle(x, y);
            if (handle) {
                this.updateCursor(handle);
            } else {
                const line = this.getGridLineAtPoint(x, y);
                if (line) {
                    this.canvas.style.cursor = line.type === 'row' ? 'ns-resize' : 'ew-resize';
                } else if (this.isPointInGrid(x, y)) {
                    this.canvas.style.cursor = 'move';
                } else {
                    this.canvas.style.cursor = 'default';
                }
            }
        }
    }

    handleMouseUp(event) {
        if (this.isDrawing && this.currentRect) {
            // Get first cell for coordinate conversion
            const firstCell = this.getFirstCell();
            if (!firstCell) {
                console.error('Cannot get first cell - grid may not be properly set up');
                this.showToast('Error: Cannot get first cell. Please redraw the grid.', 'error');
                this.isDrawing = false;
                this.currentRect = null;
                return;
            }
            
            // Check if the drawn rectangle is at least partially within the first cell
            const rectCenterX = this.currentRect.x + this.currentRect.width / 2;
            const rectCenterY = this.currentRect.y + this.currentRect.height / 2;
            const isInFirstCell = rectCenterX >= firstCell.x && 
                                  rectCenterX <= firstCell.x + firstCell.width &&
                                  rectCenterY >= firstCell.y && 
                                  rectCenterY <= firstCell.y + firstCell.height;
            
            if (!isInFirstCell) {
                console.warn('Drawn rectangle is not in the first cell');
                this.showToast('Please draw the box inside the first cell (top-left cell).', 'warning');
                this.isDrawing = false;
                this.currentRect = null;
                return;
            }
            
            // Validate that templateType is set
            if (!this.templateType) {
                console.error('templateType is not set - field may not be selected from dropdown');
                this.showToast('Please select a field from dropdown first.', 'error');
                this.isDrawing = false;
                this.currentRect = null;
                return;
            }
            
            // Save the drawn rectangle
            if (this.templateType === 'voterID') {
                this.voterIdBox = { ...this.currentRect };
                // Convert to relative coordinates (relative to first cell)
                this.voterIdBox.x -= firstCell.x;
                this.voterIdBox.y -= firstCell.y;
                console.log('Voter ID box defined:', this.voterIdBox);
                this.showToast('Voter ID box saved successfully!', 'success');
            } else if (this.templateType === 'photo') {
                this.photoBox = { ...this.currentRect };
                // Convert to relative coordinates
                this.photoBox.x -= firstCell.x;
                this.photoBox.y -= firstCell.y;
                console.log('Photo box defined:', this.photoBox);
                this.showToast('Photo box saved successfully!', 'success');
            } else if (this.templateType === 'serialNumber') {
                this.serialNumberBox = { ...this.currentRect };
                // Convert to relative coordinates
                this.serialNumberBox.x -= firstCell.x;
                this.serialNumberBox.y -= firstCell.y;
                console.log('Serial Number box defined:', this.serialNumberBox);
                this.showToast('Serial Number box saved successfully!', 'success');
            } else if (this.templateType === 'name') {
                this.nameBox = { ...this.currentRect };
                this.nameBox.x -= firstCell.x;
                this.nameBox.y -= firstCell.y;
                console.log('Name box defined:', this.nameBox);
                this.showToast('Name box saved successfully!', 'success');
            } else if (this.templateType === 'relativeName') {
                this.relativeNameBox = { ...this.currentRect };
                this.relativeNameBox.x -= firstCell.x;
                this.relativeNameBox.y -= firstCell.y;
                console.log('Relative Name box defined:', this.relativeNameBox);
                this.showToast('Relative Name box saved successfully!', 'success');
            } else if (this.templateType === 'houseNumber') {
                this.houseNumberBox = { ...this.currentRect };
                this.houseNumberBox.x -= firstCell.x;
                this.houseNumberBox.y -= firstCell.y;
                console.log('House Number box defined:', this.houseNumberBox);
                this.showToast('House Number box saved successfully!', 'success');
            } else if (this.templateType === 'age') {
                this.ageBox = { ...this.currentRect };
                this.ageBox.x -= firstCell.x;
                this.ageBox.y -= firstCell.y;
                console.log('Age box defined:', this.ageBox);
                this.showToast('Age box saved successfully!', 'success');
            } else if (this.templateType === 'gender') {
                this.genderBox = { ...this.currentRect };
                this.genderBox.x -= firstCell.x;
                this.genderBox.y -= firstCell.y;
                console.log('Gender box defined:', this.genderBox);
                this.showToast('Gender box saved successfully!', 'success');
            } else if (this.templateType === 'yadiBhag') {
                this.yadiBhagBox = { ...this.currentRect };
                this.yadiBhagBox.x -= firstCell.x;
                this.yadiBhagBox.y -= firstCell.y;
                console.log('Yadi Bhag box defined:', this.yadiBhagBox);
                this.showToast('Yadi Bhag box saved successfully!', 'success');
            } else {
                console.warn('Unknown template type:', this.templateType);
                this.showToast('Unknown field type. Please select a field from dropdown.', 'warning');
            }
            this.currentRect = null;
            
            // Reset dropdown after drawing
            const fieldSelect = document.getElementById('fieldSelect');
            if (fieldSelect) {
                fieldSelect.value = '';
            }
            
            // Hide selected field indicator
            const indicator = document.getElementById('selectedFieldIndicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
            
            // Reset templateType for next selection
            this.templateType = null;
            
            // Redraw to show the new box
            this.redraw();
            
            // Save to cache
            this.saveConfigToCache();
        }

        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.isDraggingLine = false;
        this.resizeHandle = null;
        this.draggedLine = null;
        this.canvas.style.cursor = 'default';
        this.redraw();
    }

    handleKeyDown(event) {
        if (this.templateMode) {
            if (event.key === 'v' || event.key === 'V') {
                this.templateType = 'voterID';
                this.showToast('Draw Voter ID box', 'info');
            } else if (event.key === 'i' || event.key === 'I') {
                this.templateType = 'photo';
                this.showToast('Draw Photo box', 'info');
            } else if (event.key === 's' || event.key === 'S') {
                this.templateType = 'serialNumber';
                this.showToast('Draw Serial Number box', 'info');
            } else if (event.key === 'n' || event.key === 'N') {
                this.templateType = 'name';
                this.showToast('Draw Name box', 'info');
            } else if (event.key === 'r' || event.key === 'R') {
                this.templateType = 'relativeName';
                this.showToast('Draw Relative Name box', 'info');
            } else if (event.key === 'h' || event.key === 'H') {
                this.templateType = 'houseNumber';
                this.showToast('Draw House Number box', 'info');
            } else if (event.key === 'a' || event.key === 'A') {
                this.templateType = 'age';
                this.showToast('Draw Age box', 'info');
            } else if (event.key === 'g' || event.key === 'G') {
                this.templateType = 'gender';
                this.showToast('Draw Gender box', 'info');
            } else if (event.key === 'y' || event.key === 'Y') {
                this.templateType = 'yadiBhag';
                this.showToast('Draw Yadi Bhag box', 'info');
            }
        } else if (this.grid && !this.templateMode) {
            // Grid adjustment with arrow keys
            const step = event.shiftKey ? 10 : 1; // Hold Shift for larger steps
            let changed = false;
            
            switch(event.key) {
                case 'ArrowUp':
                    this.grid.y -= step;
                    changed = true;
                    break;
                case 'ArrowDown':
                    this.grid.y += step;
                    changed = true;
                    break;
                case 'ArrowLeft':
                    this.grid.x -= step;
                    changed = true;
                    break;
                case 'ArrowRight':
                    this.grid.x += step;
                    changed = true;
                    break;
                case '+':
                case '=':
                    // Increase grid size
                    this.grid.width += step * 2;
                    this.grid.height += step * 2;
                    changed = true;
                    break;
                case '-':
                case '_':
                    // Decrease grid size
                    this.grid.width -= step * 2;
                    this.grid.height -= step * 2;
                    changed = true;
                    break;
            }
            
            if (changed) {
                event.preventDefault();
                this.redraw();
            }
        }
    }

    /**
     * Draw grid on canvas
     */
    drawGrid(rows, columns, x = null, y = null, width = null, height = null) {
        if (!this.canvas.width || !this.canvas.height) {
            console.error('Canvas not initialized');
            return;
        }

        // Auto-calculate dimensions if not provided
        // Better defaults for voter card documents
        if (x === null) {
            x = Math.round(this.canvas.width * 0.05); // 5% margin from left
        }
        if (y === null) {
            y = Math.round(this.canvas.height * 0.10); // 10% margin from top
        }
        if (!width) {
            width = Math.round(this.canvas.width * 0.90); // 90% of canvas width
        }
        if (!height) {
            height = Math.round(this.canvas.height * 0.82); // 82% of canvas height (leaving space for header/footer)
        }

        this.grid = {
            rows,
            columns,
            x,
            y,
            width,
            height
        };

        // Initialize custom line positions
        this.initializeCustomPositions();

        this.redraw();
    }

    /**
     * Initialize custom line positions with equal spacing
     */
    initializeCustomPositions() {
        if (!this.grid) return;

        const cellWidth = this.grid.width / this.grid.columns;
        const cellHeight = this.grid.height / this.grid.rows;

        // Initialize column positions (vertical lines)
        this.customColPositions = [];
        for (let i = 1; i < this.grid.columns; i++) {
            this.customColPositions.push(this.grid.x + i * cellWidth);
        }

        // Initialize row positions (horizontal lines)
        this.customRowPositions = [];
        for (let i = 1; i < this.grid.rows; i++) {
            this.customRowPositions.push(this.grid.y + i * cellHeight);
        }
        
        // Save to cache
        this.saveConfigToCache();
    }

    /**
     * Get grid line at point (for dragging)
     */
    getGridLineAtPoint(x, y) {
        if (!this.grid) return null;

        const threshold = 8; // Pixels from line to detect

        // Check vertical lines (columns)
        for (let i = 0; i < this.customColPositions.length; i++) {
            const lineX = this.customColPositions[i];
            if (Math.abs(x - lineX) <= threshold && 
                y >= this.grid.y && 
                y <= this.grid.y + this.grid.height) {
                return { type: 'col', index: i };
            }
        }

        // Check horizontal lines (rows)
        for (let i = 0; i < this.customRowPositions.length; i++) {
            const lineY = this.customRowPositions[i];
            if (Math.abs(y - lineY) <= threshold && 
                x >= this.grid.x && 
                x <= this.grid.x + this.grid.width) {
                return { type: 'row', index: i };
            }
        }

        return null;
    }

    /**
     * Clear grid
     */
    clearGrid() {
        this.grid = null;
        this.voterIdBox = null;
        this.photoBox = null;
        this.serialNumberBox = null;
        this.nameBox = null;
        this.relativeNameBox = null;
        this.houseNumberBox = null;
        this.ageBox = null;
        this.genderBox = null;
        this.yadiBhagBox = null;
        this.templateMode = false;
        this.customRowPositions = [];
        this.customColPositions = [];
        this.redraw();
        
        // Clear cache
        this.clearCachedConfig();
    }

    /**
     * Toggle skip zones display
     */
    toggleSkipZones(headerHeight, footerHeight) {
        this.showSkipZones = !this.showSkipZones;
        this.headerHeight = headerHeight;
        this.footerHeight = footerHeight;
        this.redraw();
    }

    /**
     * Enable template mode
     */
    enableTemplateMode() {
        if (!this.grid) {
            alert('Please draw a grid first');
            return false;
        }
        this.templateMode = true;
        this.templateType = 'voterID';
        this.redraw();
        return true;
    }

    /**
     * Disable template mode
     */
    disableTemplateMode() {
        this.templateMode = false;
        this.templateType = null;
        // Reset dropdown
        const fieldSelect = document.getElementById('fieldSelect');
        if (fieldSelect) {
            fieldSelect.value = '';
        }
        this.redraw();
    }

    /**
     * Check if template is complete
     */
    isTemplateComplete() {
        return this.voterIdBox !== null && this.photoBox !== null;
    }

    /**
     * Apply quick template for voter cards with photo on RIGHT
     * Creates standard boxes: voter ID on left, photo on right
     */
    applyQuickTemplate() {
        if (!this.grid) {
            console.error('Grid must be created first');
            return false;
        }

        const firstCell = this.getFirstCell();
        if (!firstCell) {
            console.error('Cannot get first cell');
            return false;
        }

        // Standard voter card layout:
        // - Voter ID text on LEFT (60% of width)
        // - Photo on RIGHT (35% of width with 5% margin)
        
        const cellWidth = firstCell.width;
        const cellHeight = firstCell.height;
        
        // Voter ID box: Left side, 60% width
        this.voterIdBox = {
            x: cellWidth * 0.05,      // 5% margin from left
            y: cellHeight * 0.15,     // 15% from top
            width: cellWidth * 0.55,  // 55% width
            height: cellHeight * 0.35 // 35% height (enough for ID text)
        };
        
        // Photo box: Right side, 35% width
        this.photoBox = {
            x: cellWidth * 0.62,      // 62% from left (right side)
            y: cellHeight * 0.10,     // 10% from top
            width: cellWidth * 0.33,  // 33% width
            height: cellHeight * 0.70 // 70% height (vertical photo)
        };
        
        console.log('✓ Quick template applied (photo on RIGHT)');
        console.log('  Voter ID box:', this.voterIdBox);
        console.log('  Photo box:', this.photoBox);
        
        this.redraw();
        return true;
    }

    /**
     * Get grid configuration (CONVERTED to PDF coordinates)
     * 
     * CRITICAL: Coordinates are drawn on canvas at pdfScale (default 1.5x),
     * but backend needs actual PDF coordinates (scale 1.0).
     * We must divide by pdfScale to convert canvas → PDF coordinates!
     */
    getGridConfig() {
        if (!this.grid) {
            return null;
        }

        // COORDINATE CONVERSION: Canvas → PDF
        // Canvas shows PDF at 1.5x scale, so divide by scale to get actual PDF coordinates
        const scale = this.pdfScale;

        // Calculate cell boundaries based on custom positions
        const colPositions = [this.grid.x, ...this.customColPositions, this.grid.x + this.grid.width];
        const rowPositions = [this.grid.y, ...this.customRowPositions, this.grid.y + this.grid.height];

        // Convert ALL coordinates from canvas to PDF scale
        const convertedColPositions = colPositions.map(pos => pos / scale);
        const convertedRowPositions = rowPositions.map(pos => pos / scale);
        const convertedCustomColPositions = this.customColPositions.map(pos => pos / scale);
        const convertedCustomRowPositions = this.customRowPositions.map(pos => pos / scale);

        const config = {
            rows: this.grid.rows,
            columns: this.grid.columns,
            x: this.grid.x / scale,
            y: this.grid.y / scale,
            width: this.grid.width / scale,
            height: this.grid.height / scale,
            customColPositions: convertedCustomColPositions,
            customRowPositions: convertedCustomRowPositions,
            colPositions: convertedColPositions,
            rowPositions: convertedRowPositions
        };

        console.log('Grid config (canvas):', {
            x: this.grid.x,
            y: this.grid.y,
            width: this.grid.width,
            height: this.grid.height,
            scale: scale
        });
        console.log('Grid config (PDF):', {
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height
        });

        return config;
    }

    /**
     * Get cell template (CONVERTED to PDF coordinates)
     * 
     * CRITICAL: Template boxes are relative to first cell, but still need
     * to be scaled because they're drawn on the canvas at pdfScale.
     */
    getCellTemplate() {
        if (!this.voterIdBox || !this.photoBox) {
            return null;
        }

        // COORDINATE CONVERSION: Template boxes are relative coordinates,
        // but still need scaling because they were drawn on scaled canvas
        const scale = this.pdfScale;

        const template = {
            voterIdBox: {
                x: this.voterIdBox.x / scale,
                y: this.voterIdBox.y / scale,
                width: this.voterIdBox.width / scale,
                height: this.voterIdBox.height / scale
            },
            photoBox: {
                x: this.photoBox.x / scale,
                y: this.photoBox.y / scale,
                width: this.photoBox.width / scale,
                height: this.photoBox.height / scale
            }
        };

        // Add serial number box if defined
        if (this.serialNumberBox) {
            template.serialNumberBox = {
                x: this.serialNumberBox.x / scale,
                y: this.serialNumberBox.y / scale,
                width: this.serialNumberBox.width / scale,
                height: this.serialNumberBox.height / scale
            };
        }

        // Add all other field boxes if defined
        const fieldBoxes = {
            'nameBox': 'nameBox',
            'relativeNameBox': 'relativeNameBox',
            'houseNumberBox': 'houseNumberBox',
            'ageBox': 'ageBox',
            'genderBox': 'genderBox',
            'yadiBhagBox': 'yadiBhagBox'
        };

        for (const [key, templateKey] of Object.entries(fieldBoxes)) {
            if (this[key]) {
                template[templateKey] = {
                    x: this[key].x / scale,
                    y: this[key].y / scale,
                    width: this[key].width / scale,
                    height: this[key].height / scale
                };
            }
        }

        return template;
    }

    /**
     * Redraw canvas
     */
    redraw() {
        // Clear canvas
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw skip zones
        if (this.showSkipZones) {
            this.drawSkipZones();
        }

        // Draw grid
        if (this.grid) {
            this.drawGridLines();
        }

        // Draw template boxes
        if (this.grid && (this.templateMode || this.voterIdBox || this.photoBox)) {
            this.drawTemplateBoxes();
        }

        // Draw current rectangle being drawn
        if (this.currentRect) {
            const colorMap = {
                'voterID': '#3b82f6',      // blue
                'photo': '#10b981',        // green
                'serialNumber': '#f59e0b',  // orange
                'name': '#8b5cf6',          // purple
                'relativeName': '#ec4899',  // pink
                'houseNumber': '#06b6d4',    // cyan
                'age': '#f97316',           // orange-red
                'gender': '#14b8a6',         // teal
                'yadiBhag': '#dc2626'        // red
            };
            const strokeColor = colorMap[this.templateType] || '#10b981';
            this.context.strokeStyle = strokeColor;
            this.context.lineWidth = 3;
            this.context.strokeRect(
                this.currentRect.x,
                this.currentRect.y,
                this.currentRect.width,
                this.currentRect.height
            );
        }
    }

    /**
     * Draw skip zones (header and footer)
     */
    drawSkipZones() {
        // Header zone
        if (this.headerHeight > 0) {
            this.context.fillStyle = 'rgba(239, 68, 68, 0.3)';
            this.context.fillRect(0, 0, this.canvas.width, this.headerHeight);
            this.context.strokeStyle = '#ef4444';
            this.context.lineWidth = 2;
            this.context.strokeRect(0, 0, this.canvas.width, this.headerHeight);
            
            // Label
            this.context.fillStyle = '#ef4444';
            this.context.font = 'bold 16px Inter';
            this.context.fillText('SKIP HEADER', 10, this.headerHeight - 10);
        }

        // Footer zone
        if (this.footerHeight > 0) {
            const footerY = this.canvas.height - this.footerHeight;
            this.context.fillStyle = 'rgba(239, 68, 68, 0.3)';
            this.context.fillRect(0, footerY, this.canvas.width, this.footerHeight);
            this.context.strokeStyle = '#ef4444';
            this.context.lineWidth = 2;
            this.context.strokeRect(0, footerY, this.canvas.width, this.footerHeight);
            
            // Label
            this.context.fillStyle = '#ef4444';
            this.context.font = 'bold 16px Inter';
            this.context.fillText('SKIP FOOTER', 10, footerY + 25);
        }
    }

    /**
     * Draw grid lines
     */
    drawGridLines() {
        // Draw outer border
        this.context.strokeStyle = '#4f46e5';
        this.context.lineWidth = 3;
        this.context.strokeRect(this.grid.x, this.grid.y, this.grid.width, this.grid.height);

        // Draw grid lines
        this.context.strokeStyle = '#818cf8';
        this.context.lineWidth = 2;

        // Vertical lines (using custom positions)
        for (let i = 0; i < this.customColPositions.length; i++) {
            const x = this.customColPositions[i];
            this.context.beginPath();
            this.context.moveTo(x, this.grid.y);
            this.context.lineTo(x, this.grid.y + this.grid.height);
            this.context.stroke();
        }

        // Horizontal lines (using custom positions)
        for (let i = 0; i < this.customRowPositions.length; i++) {
            const y = this.customRowPositions[i];
            this.context.beginPath();
            this.context.moveTo(this.grid.x, y);
            this.context.lineTo(this.grid.x + this.grid.width, y);
            this.context.stroke();
        }

        // Draw cell numbers
        this.drawCellNumbers();

        // Draw resize handles at corners (only when not in template mode)
        if (!this.templateMode) {
            this.drawResizeHandles();
            this.drawLineHandles();
        }
    }

    /**
     * Draw cell numbers based on current grid divisions
     */
    drawCellNumbers() {
        this.context.fillStyle = '#4f46e5';
        this.context.font = 'bold 14px Inter';

        // Calculate all column X positions
        const colPositions = [this.grid.x, ...this.customColPositions, this.grid.x + this.grid.width];
        
        // Calculate all row Y positions
        const rowPositions = [this.grid.y, ...this.customRowPositions, this.grid.y + this.grid.height];

        let cellNum = 1;
        for (let row = 0; row < this.grid.rows; row++) {
            for (let col = 0; col < this.grid.columns; col++) {
                const cellX = colPositions[col] + 5;
                const cellY = rowPositions[row] + 20;
                this.context.fillText(`${cellNum}`, cellX, cellY);
                cellNum++;
            }
        }
    }

    /**
     * Draw visual indicators on draggable lines
     */
    drawLineHandles() {
        const handleSize = 6;

        // Draw handles on vertical lines
        this.customColPositions.forEach(x => {
            const y = this.grid.y + this.grid.height / 2;
            
            // Outer circle
            this.context.fillStyle = '#ffffff';
            this.context.beginPath();
            this.context.arc(x, y, handleSize + 1, 0, 2 * Math.PI);
            this.context.fill();
            
            // Inner circle
            this.context.fillStyle = '#818cf8';
            this.context.beginPath();
            this.context.arc(x, y, handleSize, 0, 2 * Math.PI);
            this.context.fill();
        });

        // Draw handles on horizontal lines
        this.customRowPositions.forEach(y => {
            const x = this.grid.x + this.grid.width / 2;
            
            // Outer circle
            this.context.fillStyle = '#ffffff';
            this.context.beginPath();
            this.context.arc(x, y, handleSize + 1, 0, 2 * Math.PI);
            this.context.fill();
            
            // Inner circle
            this.context.fillStyle = '#818cf8';
            this.context.beginPath();
            this.context.arc(x, y, handleSize, 0, 2 * Math.PI);
            this.context.fill();
        });
    }

    /**
     * Draw resize handles at grid corners
     */
    drawResizeHandles() {
        const handleSize = 12;
        const corners = [
            { x: this.grid.x, y: this.grid.y }, // topLeft
            { x: this.grid.x + this.grid.width, y: this.grid.y }, // topRight
            { x: this.grid.x, y: this.grid.y + this.grid.height }, // bottomLeft
            { x: this.grid.x + this.grid.width, y: this.grid.y + this.grid.height } // bottomRight
        ];

        corners.forEach(corner => {
            // Outer circle (white)
            this.context.fillStyle = '#ffffff';
            this.context.beginPath();
            this.context.arc(corner.x, corner.y, handleSize / 2 + 2, 0, 2 * Math.PI);
            this.context.fill();

            // Inner circle (primary color)
            this.context.fillStyle = '#4f46e5';
            this.context.beginPath();
            this.context.arc(corner.x, corner.y, handleSize / 2, 0, 2 * Math.PI);
            this.context.fill();

            // Border
            this.context.strokeStyle = '#ffffff';
            this.context.lineWidth = 2;
            this.context.stroke();
        });
    }

    /**
     * Draw template boxes
     */
    drawTemplateBoxes() {
        const firstCell = this.getFirstCell();

        // Show boxes in template mode OR if boxes exist (from auto-detection)
        const showOnFirstCell = this.templateMode || (!this.templateMode && (
            this.voterIdBox || this.photoBox || this.serialNumberBox || 
            this.nameBox || this.relativeNameBox || this.houseNumberBox || 
            this.ageBox || this.genderBox || this.yadiBhagBox
        ));

        if (showOnFirstCell) {
            // Template mode or auto-detection - show on first cell
            // Draw voter ID box
            if (this.voterIdBox) {
                this.context.strokeStyle = '#3b82f6';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.voterIdBox.x,
                    firstCell.y + this.voterIdBox.y,
                    this.voterIdBox.width,
                    this.voterIdBox.height
                );
                this.context.fillStyle = 'rgba(59, 130, 246, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.voterIdBox.x,
                    firstCell.y + this.voterIdBox.y,
                    this.voterIdBox.width,
                    this.voterIdBox.height
                );
                
                // Label
                this.context.fillStyle = '#3b82f6';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Voter ID', firstCell.x + this.voterIdBox.x + 5, firstCell.y + this.voterIdBox.y - 5);
            }

            // Draw photo box
            if (this.photoBox) {
                this.context.strokeStyle = '#10b981';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.photoBox.x,
                    firstCell.y + this.photoBox.y,
                    this.photoBox.width,
                    this.photoBox.height
                );
                this.context.fillStyle = 'rgba(16, 185, 129, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.photoBox.x,
                    firstCell.y + this.photoBox.y,
                    this.photoBox.width,
                    this.photoBox.height
                );
                
                // Label
                this.context.fillStyle = '#10b981';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Photo', firstCell.x + this.photoBox.x + 5, firstCell.y + this.photoBox.y - 5);
            }

            // Draw serial number box
            if (this.serialNumberBox) {
                this.context.strokeStyle = '#f59e0b';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.serialNumberBox.x,
                    firstCell.y + this.serialNumberBox.y,
                    this.serialNumberBox.width,
                    this.serialNumberBox.height
                );
                this.context.fillStyle = 'rgba(245, 158, 11, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.serialNumberBox.x,
                    firstCell.y + this.serialNumberBox.y,
                    this.serialNumberBox.width,
                    this.serialNumberBox.height
                );
                
                // Label
                this.context.fillStyle = '#f59e0b';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Serial Number', firstCell.x + this.serialNumberBox.x + 5, firstCell.y + this.serialNumberBox.y - 5);
            }

            // Draw yadi bhag box
            if (this.yadiBhagBox) {
                this.context.strokeStyle = '#dc2626';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.yadiBhagBox.x,
                    firstCell.y + this.yadiBhagBox.y,
                    this.yadiBhagBox.width,
                    this.yadiBhagBox.height
                );
                this.context.fillStyle = 'rgba(220, 38, 38, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.yadiBhagBox.x,
                    firstCell.y + this.yadiBhagBox.y,
                    this.yadiBhagBox.width,
                    this.yadiBhagBox.height
                );
                
                // Label
                this.context.fillStyle = '#dc2626';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Yadi Bhag', firstCell.x + this.yadiBhagBox.x + 5, firstCell.y + this.yadiBhagBox.y - 5);
            }

            // Draw name box
            if (this.nameBox) {
                this.context.strokeStyle = '#8b5cf6';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.nameBox.x,
                    firstCell.y + this.nameBox.y,
                    this.nameBox.width,
                    this.nameBox.height
                );
                this.context.fillStyle = 'rgba(139, 92, 246, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.nameBox.x,
                    firstCell.y + this.nameBox.y,
                    this.nameBox.width,
                    this.nameBox.height
                );
                
                // Label
                this.context.fillStyle = '#8b5cf6';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Name', firstCell.x + this.nameBox.x + 5, firstCell.y + this.nameBox.y - 5);
            }

            // Draw relative name box
            if (this.relativeNameBox) {
                this.context.strokeStyle = '#ec4899';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.relativeNameBox.x,
                    firstCell.y + this.relativeNameBox.y,
                    this.relativeNameBox.width,
                    this.relativeNameBox.height
                );
                this.context.fillStyle = 'rgba(236, 72, 153, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.relativeNameBox.x,
                    firstCell.y + this.relativeNameBox.y,
                    this.relativeNameBox.width,
                    this.relativeNameBox.height
                );
                
                // Label
                this.context.fillStyle = '#ec4899';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Relative Name', firstCell.x + this.relativeNameBox.x + 5, firstCell.y + this.relativeNameBox.y - 5);
            }

            // Draw house number box
            if (this.houseNumberBox) {
                this.context.strokeStyle = '#06b6d4';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.houseNumberBox.x,
                    firstCell.y + this.houseNumberBox.y,
                    this.houseNumberBox.width,
                    this.houseNumberBox.height
                );
                this.context.fillStyle = 'rgba(6, 182, 212, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.houseNumberBox.x,
                    firstCell.y + this.houseNumberBox.y,
                    this.houseNumberBox.width,
                    this.houseNumberBox.height
                );
                
                // Label
                this.context.fillStyle = '#06b6d4';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('House Number', firstCell.x + this.houseNumberBox.x + 5, firstCell.y + this.houseNumberBox.y - 5);
            }

            // Draw age box
            if (this.ageBox) {
                this.context.strokeStyle = '#f97316';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.ageBox.x,
                    firstCell.y + this.ageBox.y,
                    this.ageBox.width,
                    this.ageBox.height
                );
                this.context.fillStyle = 'rgba(249, 115, 22, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.ageBox.x,
                    firstCell.y + this.ageBox.y,
                    this.ageBox.width,
                    this.ageBox.height
                );
                
                // Label
                this.context.fillStyle = '#f97316';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Age', firstCell.x + this.ageBox.x + 5, firstCell.y + this.ageBox.y - 5);
            }

            // Draw gender box
            if (this.genderBox) {
                this.context.strokeStyle = '#14b8a6';
                this.context.lineWidth = 3;
                this.context.strokeRect(
                    firstCell.x + this.genderBox.x,
                    firstCell.y + this.genderBox.y,
                    this.genderBox.width,
                    this.genderBox.height
                );
                this.context.fillStyle = 'rgba(20, 184, 166, 0.2)';
                this.context.fillRect(
                    firstCell.x + this.genderBox.x,
                    firstCell.y + this.genderBox.y,
                    this.genderBox.width,
                    this.genderBox.height
                );
                
                // Label
                this.context.fillStyle = '#14b8a6';
                this.context.font = 'bold 12px Inter';
                this.context.fillText('Gender', firstCell.x + this.genderBox.x + 5, firstCell.y + this.genderBox.y - 5);
            }

            // Highlight first cell (only in template mode)
            if (this.templateMode) {
            this.context.strokeStyle = '#f59e0b';
            this.context.lineWidth = 3;
            this.context.setLineDash([10, 5]);
            this.context.strokeRect(firstCell.x, firstCell.y, firstCell.width, firstCell.height);
            this.context.setLineDash([]);
            }
        }
        
        // If template is applied (not in template mode but boxes exist), show on ALL cells
        if (!this.templateMode && this.voterIdBox && this.photoBox) {
            this.drawTemplateOnAllCells();
        }
    }

    /**
     * Draw template boxes on all grid cells (after template is applied)
     */
    drawTemplateOnAllCells() {
        const colPositions = [this.grid.x, ...this.customColPositions, this.grid.x + this.grid.width];
        const rowPositions = [this.grid.y, ...this.customRowPositions, this.grid.y + this.grid.height];

        // Draw template on each cell
        for (let row = 0; row < this.grid.rows; row++) {
            for (let col = 0; col < this.grid.columns; col++) {
                const cellX = colPositions[col];
                const cellY = rowPositions[row];
                const cellWidth = colPositions[col + 1] - colPositions[col];
                const cellHeight = rowPositions[row + 1] - rowPositions[row];

                // Scale the template boxes to fit the cell
                const scaleX = cellWidth / this.getFirstCell().width;
                const scaleY = cellHeight / this.getFirstCell().height;

                // Draw voter ID box
                if (this.voterIdBox) {
                    this.context.strokeStyle = '#3b82f6';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.voterIdBox.x * scaleX,
                        cellY + this.voterIdBox.y * scaleY,
                        this.voterIdBox.width * scaleX,
                        this.voterIdBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(59, 130, 246, 0.1)';
                    this.context.fillRect(
                        cellX + this.voterIdBox.x * scaleX,
                        cellY + this.voterIdBox.y * scaleY,
                        this.voterIdBox.width * scaleX,
                        this.voterIdBox.height * scaleY
                    );
                }

                // Draw photo box
                if (this.photoBox) {
                    this.context.strokeStyle = '#10b981';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.photoBox.x * scaleX,
                        cellY + this.photoBox.y * scaleY,
                        this.photoBox.width * scaleX,
                        this.photoBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(16, 185, 129, 0.1)';
                    this.context.fillRect(
                        cellX + this.photoBox.x * scaleX,
                        cellY + this.photoBox.y * scaleY,
                        this.photoBox.width * scaleX,
                        this.photoBox.height * scaleY
                    );
                }

                // Draw serial number box
                if (this.serialNumberBox) {
                    this.context.strokeStyle = '#f59e0b';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.serialNumberBox.x * scaleX,
                        cellY + this.serialNumberBox.y * scaleY,
                        this.serialNumberBox.width * scaleX,
                        this.serialNumberBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(245, 158, 11, 0.1)';
                    this.context.fillRect(
                        cellX + this.serialNumberBox.x * scaleX,
                        cellY + this.serialNumberBox.y * scaleY,
                        this.serialNumberBox.width * scaleX,
                        this.serialNumberBox.height * scaleY
                    );
                }

                // Draw yadi bhag box
                if (this.yadiBhagBox) {
                    this.context.strokeStyle = '#dc2626';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.yadiBhagBox.x * scaleX,
                        cellY + this.yadiBhagBox.y * scaleY,
                        this.yadiBhagBox.width * scaleX,
                        this.yadiBhagBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(220, 38, 38, 0.1)';
                    this.context.fillRect(
                        cellX + this.yadiBhagBox.x * scaleX,
                        cellY + this.yadiBhagBox.y * scaleY,
                        this.yadiBhagBox.width * scaleX,
                        this.yadiBhagBox.height * scaleY
                    );
                }

                // Draw name box
                if (this.nameBox) {
                    this.context.strokeStyle = '#8b5cf6';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.nameBox.x * scaleX,
                        cellY + this.nameBox.y * scaleY,
                        this.nameBox.width * scaleX,
                        this.nameBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(139, 92, 246, 0.1)';
                    this.context.fillRect(
                        cellX + this.nameBox.x * scaleX,
                        cellY + this.nameBox.y * scaleY,
                        this.nameBox.width * scaleX,
                        this.nameBox.height * scaleY
                    );
                }

                // Draw relative name box
                if (this.relativeNameBox) {
                    this.context.strokeStyle = '#ec4899';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.relativeNameBox.x * scaleX,
                        cellY + this.relativeNameBox.y * scaleY,
                        this.relativeNameBox.width * scaleX,
                        this.relativeNameBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(236, 72, 153, 0.1)';
                    this.context.fillRect(
                        cellX + this.relativeNameBox.x * scaleX,
                        cellY + this.relativeNameBox.y * scaleY,
                        this.relativeNameBox.width * scaleX,
                        this.relativeNameBox.height * scaleY
                    );
                }

                // Draw house number box
                if (this.houseNumberBox) {
                    this.context.strokeStyle = '#06b6d4';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.houseNumberBox.x * scaleX,
                        cellY + this.houseNumberBox.y * scaleY,
                        this.houseNumberBox.width * scaleX,
                        this.houseNumberBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(6, 182, 212, 0.1)';
                    this.context.fillRect(
                        cellX + this.houseNumberBox.x * scaleX,
                        cellY + this.houseNumberBox.y * scaleY,
                        this.houseNumberBox.width * scaleX,
                        this.houseNumberBox.height * scaleY
                    );
                }

                // Draw age box
                if (this.ageBox) {
                    this.context.strokeStyle = '#f97316';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.ageBox.x * scaleX,
                        cellY + this.ageBox.y * scaleY,
                        this.ageBox.width * scaleX,
                        this.ageBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(249, 115, 22, 0.1)';
                    this.context.fillRect(
                        cellX + this.ageBox.x * scaleX,
                        cellY + this.ageBox.y * scaleY,
                        this.ageBox.width * scaleX,
                        this.ageBox.height * scaleY
                    );
                }

                // Draw gender box
                if (this.genderBox) {
                    this.context.strokeStyle = '#14b8a6';
                    this.context.lineWidth = 2;
                    this.context.strokeRect(
                        cellX + this.genderBox.x * scaleX,
                        cellY + this.genderBox.y * scaleY,
                        this.genderBox.width * scaleX,
                        this.genderBox.height * scaleY
                    );
                    this.context.fillStyle = 'rgba(20, 184, 166, 0.1)';
                    this.context.fillRect(
                        cellX + this.genderBox.x * scaleX,
                        cellY + this.genderBox.y * scaleY,
                        this.genderBox.width * scaleX,
                        this.genderBox.height * scaleY
                    );
                }
            }
        }
    }

    /**
     * Get first cell coordinates
     */
    getFirstCell() {
        if (!this.grid) {
            return null;
        }

        const colPositions = [this.grid.x, ...this.customColPositions, this.grid.x + this.grid.width];
        const rowPositions = [this.grid.y, ...this.customRowPositions, this.grid.y + this.grid.height];

        return {
            x: colPositions[0],
            y: rowPositions[0],
            width: colPositions[1] - colPositions[0],
            height: rowPositions[1] - rowPositions[0]
        };
    }

    /**
     * Check if point is in grid
     */
    isPointInGrid(x, y) {
        if (!this.grid) {
            return false;
        }

        return x >= this.grid.x &&
               x <= this.grid.x + this.grid.width &&
               y >= this.grid.y &&
               y <= this.grid.y + this.grid.height;
    }

    /**
     * Get resize handle at point
     */
    getResizeHandle(x, y) {
        if (!this.grid) {
            return null;
        }

        const handleSize = 20; // Size of the clickable corner area
        const corners = {
            topLeft: {
                x: this.grid.x,
                y: this.grid.y
            },
            topRight: {
                x: this.grid.x + this.grid.width,
                y: this.grid.y
            },
            bottomLeft: {
                x: this.grid.x,
                y: this.grid.y + this.grid.height
            },
            bottomRight: {
                x: this.grid.x + this.grid.width,
                y: this.grid.y + this.grid.height
            }
        };

        for (const [handle, corner] of Object.entries(corners)) {
            if (Math.abs(x - corner.x) <= handleSize && Math.abs(y - corner.y) <= handleSize) {
                return handle;
            }
        }

        return null;
    }

    /**
     * Update cursor based on resize handle
     */
    updateCursor(handle) {
        const cursors = {
            topLeft: 'nwse-resize',
            topRight: 'nesw-resize',
            bottomLeft: 'nesw-resize',
            bottomRight: 'nwse-resize'
        };
        this.canvas.style.cursor = cursors[handle] || 'default';
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Dispatch event to app.js to show toast
        window.dispatchEvent(new CustomEvent('showToast', {
            detail: { message, type }
        }));
    }
}


