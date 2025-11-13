/**
 * PDF Viewer Module
 * Handles PDF rendering using PDF.js
 */

class PDFViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.context = this.canvas.getContext('2d');
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.5;
        this.rendering = false;
        
        // Initialize PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    /**
     * Load PDF from file
     */
    async loadPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;

            console.log(`PDF loaded: ${this.totalPages} pages`);

            await this.renderPage(1);

            return {
                totalPages: this.totalPages
            };
        } catch (error) {
            console.error('PDF load error:', error);
            throw new Error('Failed to load PDF: ' + error.message);
        }
    }

    /**
     * Render a specific page
     */
    async renderPage(pageNum) {
        if (this.rendering || !this.pdfDoc) {
            return;
        }

        if (pageNum < 1 || pageNum > this.totalPages) {
            return;
        }

        this.rendering = true;
        this.currentPage = pageNum;

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            // Set canvas dimensions
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;

            // Render page
            const renderContext = {
                canvasContext: this.context,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            console.log(`Rendered page ${pageNum}`);

            // Emit event for overlay canvas to match size AND SCALE
            window.dispatchEvent(new CustomEvent('pdfPageRendered', {
                detail: {
                    width: viewport.width,
                    height: viewport.height,
                    pageNum: pageNum,
                    scale: this.scale  // CRITICAL: Grid overlay needs this for coordinate conversion!
                }
            }));

        } catch (error) {
            console.error('Page render error:', error);
        } finally {
            this.rendering = false;
        }
    }

    /**
     * Go to next page
     */
    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.renderPage(this.currentPage + 1);
        }
    }

    /**
     * Go to previous page
     */
    async prevPage() {
        if (this.currentPage > 1) {
            await this.renderPage(this.currentPage - 1);
        }
    }

    /**
     * Zoom in
     */
    async zoomIn() {
        this.scale += 0.25;
        await this.renderPage(this.currentPage);
    }

    /**
     * Zoom out
     */
    async zoomOut() {
        if (this.scale > 0.5) {
            this.scale -= 0.25;
            await this.renderPage(this.currentPage);
        }
    }

    /**
     * Get current zoom level
     */
    getZoomLevel() {
        return Math.round(this.scale * 100);
    }

    /**
     * Get canvas dimensions
     */
    getCanvasDimensions() {
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }
}


