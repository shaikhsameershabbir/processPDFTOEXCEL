// Azure Vision OCR API Service

const AZURE_API_KEY = process.env.NEXT_PUBLIC_AZURE_VISION_API_KEY || ""
const OCR_ENDPOINT = process.env.NEXT_PUBLIC_AZURE_VISION_ENDPOINT || ""

// Validate Azure Vision configuration
if (!AZURE_API_KEY || !OCR_ENDPOINT) {
}

export interface OCRResult {
  text: string
  confidence?: number
  pageNumber?: number
  rawApiResponse?: any // Raw API response for debugging
}

export interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'converting' | 'processing' | 'completed' | 'error'
  message: string
  progress: number
}

// Convert PDF to images using PDF.js (optimized with parallel rendering)
export async function convertPdfToImages(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        
        // Try multiple PDF.js import methods for better compatibility
        let pdfjsLib
        try {
          // Method 1: Try legacy build
          pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
        } catch (error) {
          // Method 2: Try standard build
          pdfjsLib = await import('pdfjs-dist')
        }
        
        // Configure PDF.js worker for Next.js
        if (typeof window !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
        }
        
        const loadingTask = pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          disableFontFace: true,
          verbosity: 0 // Reduce console output
        })
        
        const pdfDocument = await loadingTask.promise
        const images: string[] = new Array(pdfDocument.numPages)
        
        // Parallel rendering of PDF pages (3 at a time to avoid memory issues)
        const PAGES_PER_BATCH = 3
        for (let i = 0; i < pdfDocument.numPages; i += PAGES_PER_BATCH) {
          const pagePromises = []
          
          for (let j = i; j < Math.min(i + PAGES_PER_BATCH, pdfDocument.numPages); j++) {
            const pageNum = j + 1
            pagePromises.push(
              (async () => {
                const page = await pdfDocument.getPage(pageNum)
                const viewport = page.getViewport({ scale: 2.0 }) // Higher scale for better OCR
                
                const canvas = document.createElement('canvas')
                const context = canvas.getContext('2d')
                if (!context) {
                  throw new Error('Could not get canvas context')
                }
                
                canvas.height = viewport.height
                canvas.width = viewport.width
                
                const renderContext = {
                  canvasContext: context,
                  viewport: viewport
                }
                
                await page.render(renderContext).promise
                const imageDataUrl = canvas.toDataURL('image/png')
                images[j] = imageDataUrl
              })()
            )
          }
          
          await Promise.all(pagePromises)
        }
        
        resolve(images)
      } catch (error) {
        reject(new Error(`Failed to convert PDF: ${error instanceof Error ? error.message : 'Unknown error'}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// Extract text from image using Azure Vision API
export async function extractTextFromImage(imageDataUrl: string, pageNumber: number = 1): Promise<OCRResult> {
  try {
    // Check if Azure Vision credentials are configured
    if (!AZURE_API_KEY || !OCR_ENDPOINT) {
      throw new Error('Azure Vision API credentials not configured. Please set NEXT_PUBLIC_AZURE_VISION_API_KEY and NEXT_PUBLIC_AZURE_VISION_ENDPOINT environment variables.')
    }

    // Convert data URL to blob
    const imageResponse = await fetch(imageDataUrl)
    const blob = await imageResponse.blob()
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1]) // Remove data:image/png;base64, prefix
      }
      reader.readAsDataURL(blob)
    })
    
    // Call Azure Vision API
    const apiUrl = `${OCR_ENDPOINT}vision/v3.2/read/analyze`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        'Content-Type': 'application/octet-stream'
      },
      body: blob
    })
    
    const responseText = await response.text()

    if (!response.ok) {
      const details = responseText ? ` - ${responseText}` : ''
      throw new Error(`Azure Vision API error: ${response.status} ${response.statusText}${details}`)
    }
    
    // Get the operation location
    const operationLocation = response.headers.get('Operation-Location')
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure Vision API')
    }
    
    // Poll for results
    let result
    let attempts = 0
    const maxAttempts = 30 // 30 seconds timeout
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY
        }
      })
      
      if (resultResponse.ok) {
        result = await resultResponse.json()
        if (result.status === 'succeeded') {
          break
        } else if (result.status === 'failed') {
          throw new Error('OCR processing failed')
        }
      }
      
      attempts++
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('OCR processing timeout')
    }
    
    // Extract text from results - completely raw, no formatting
    let extractedText = ''
    if (result?.analyzeResult?.readResults) {
      for (const page of result.analyzeResult.readResults) {
        if (page.lines) {
          for (const line of page.lines) {
            extractedText += line.text + '\n'
          }
        }
      }
    }
    
    return {
      text: extractedText, // No .trim() - keep exactly as extracted
      confidence: result?.analyzeResult?.readResults?.[0]?.lines?.[0]?.confidence || 0,
      pageNumber,
      rawApiResponse: result // Store the complete raw API response
    }
    
  } catch (error) {
    throw error
  }
}

// Process multiple images in parallel with concurrency control
export async function processImages(
  images: string[], 
  onProgress?: (status: ProcessingStatus) => void,
  concurrentRequests: number = 5 // Configurable: Process N pages at a time
): Promise<OCRResult[]> {
  const CONCURRENT_REQUESTS = Math.max(1, Math.min(10, concurrentRequests)) // Limit between 1-10
  const results: OCRResult[] = new Array(images.length)
  let completed = 0
  
  // Process images in batches
  for (let i = 0; i < images.length; i += CONCURRENT_REQUESTS) {
    const batch = images.slice(i, i + CONCURRENT_REQUESTS)
    const batchIndices = Array.from({ length: batch.length }, (_, idx) => i + idx)
    
    try {
      // Process batch in parallel
      const batchPromises = batch.map((image, batchIdx) => {
        const pageNumber = batchIndices[batchIdx] + 1
        return extractTextFromImage(image, pageNumber)
          .then(result => {
            completed++
            onProgress?.({
              status: 'processing',
              message: `Processing pages in parallel... (${completed}/${images.length} completed)`,
              progress: Math.min(95, (completed / images.length) * 100)
            })
            return { index: batchIndices[batchIdx], result }
          })
      })
      
      const batchResults = await Promise.all(batchPromises)
      
      // Store results in correct order
      batchResults.forEach(({ index, result }) => {
        results[index] = result
      })
      
    } catch (error) {
      const failedPage = i + 1
      onProgress?.({
        status: 'error',
        message: `Error processing batch starting at page ${failedPage}: ${error}`,
        progress: (completed / images.length) * 100
      })
      throw error
    }
  }
  
  onProgress?.({
    status: 'completed',
    message: `Successfully processed ${images.length} pages in parallel`,
    progress: 100
  })
  
  return results
}

// Combine OCR results from multiple pages
export function combineOCRResults(results: OCRResult[]): string {
  return results
    .map((result, index) => {
      if (results.length > 1) {
        return `PAGE ${index + 1}:\n------------------------------\n${result.text}`
      }
      return result.text
    })
    .join('\n\n')
}

// Get completely raw OCR results without any formatting
export function getRawOCRResults(results: OCRResult[]): string {
  return results
    .map(result => result.text)
    .join('') // No additional newlines - keep exactly as extracted
}

// Get raw API responses for debugging
export function getRawApiResponses(results: OCRResult[]): string {
  return results
    .map((result, index) => {
      if (results.length > 1) {
        return `PAGE ${index + 1}:\n------------------------------\n${JSON.stringify(result.rawApiResponse, null, 2)}`
      }
      return JSON.stringify(result.rawApiResponse, null, 2)
    })
    .join('\n\n')
}

// Download raw text as a file
export function downloadRawText(text: string, filename: string = "azure-ocr-raw.txt"): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8;" })
  const link = document.createElement("a")
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}
