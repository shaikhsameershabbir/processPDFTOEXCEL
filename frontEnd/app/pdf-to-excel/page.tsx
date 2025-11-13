'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, Download, CheckCircle, XCircle, Eye } from 'lucide-react';
import { LayoutWrapper } from '@/components/layout-wrapper';
import { convertPdfToImages, processImages, combineOCRResults, downloadRawText } from '@/lib/azure-vision';

interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'converting' | 'processing' | 'completed' | 'error';
  message: string;
  progress: number;
}

interface ExtractedData {
  headers: string[];
  rows: string[][];
  rawText: string;
}

export default function PdfToExcel() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    status: 'idle',
    message: 'Ready to process PDF',
    progress: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<string[][]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setExtractedData(null);
      setPreviewData([]);
      setProcessingStatus({
        status: 'idle',
        message: `Selected: ${selectedFile.name}`,
        progress: 0
      });
    } else {
      alert('Please select a valid PDF file');
    }
  };

  const processPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProcessingStatus({
      status: 'uploading',
      message: 'Uploading PDF file...',
      progress: 10
    });

    try {
      // Step 1: Convert PDF to images
      setProcessingStatus({
        status: 'converting',
        message: 'Converting PDF to images...',
        progress: 30
      });

      const images = await convertPdfToImages(file);

      // Step 2: Process images with Azure Vision OCR
      setProcessingStatus({
        status: 'processing',
        message: 'Extracting text using Azure Vision API...',
        progress: 50
      });

      const ocrResults = await processImages(images, (status) => {
        setProcessingStatus({
          status: 'processing',
          message: status.message,
          progress: 50 + (status.progress * 0.4) // 50-90% range
        });
      });

      // Step 3: Combine OCR results
      const combinedText = combineOCRResults(ocrResults);

      // Step 4: Parse table data
      setProcessingStatus({
        status: 'processing',
        message: 'Parsing table data...',
        progress: 90
      });

      const parsedData = parseTableData(combinedText);
      setExtractedData(parsedData);
      setPreviewData(parsedData.rows.slice(0, 10)); // Show first 10 rows

      setProcessingStatus({
        status: 'completed',
        message: `Successfully extracted ${parsedData.rows.length} rows of data`,
        progress: 100
      });

    } catch (error) {
      setProcessingStatus({
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const parseTableData = (text: string): ExtractedData => {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Find table structure by looking for patterns
    const tableLines = lines.filter(line => {
      // Look for lines that might be table rows (contain multiple data points)
      return line.includes('\t') || 
             line.match(/\d+.*\d{2}-\d{2}-\d{4}/) || // Date pattern
             line.match(/\d+.*[अ-ह]/) || // Marathi text pattern
             line.includes('टपाला द्वारे') || // Specific Marathi text
             line.includes('छत्रपती संभाजीनगर'); // Location pattern
    });

    if (tableLines.length === 0) {
      return {
        headers: ['Column 1', 'Column 2', 'Column 3', 'Column 4', 'Column 5', 'Column 6', 'Column 7'],
        rows: [],
        rawText: text
      };
    }

    // Extract headers (first few lines that look like headers)
    const headers = [
      'अ क्र',
      'सुचना प्राप्त ईमेलव्दारे / पत्राव्दारे',
      'सुचना प्राप्त दिनांक',
      'सुचना सादर करणा-याचे नांव',
      'पत्ता',
      'मोबईल नंबर',
      'सूचना'
    ];

    // Parse rows
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let rowIndex = 0;

    for (const line of tableLines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;

      // Check if this line starts a new row (contains serial number pattern)
      if (trimmedLine.match(/^\d+/) || trimmedLine.includes('टपाला द्वारे')) {
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
          currentRow = [];
        }
        currentRow.push(trimmedLine);
      } else {
        // Continue current row
        if (currentRow.length > 0) {
          currentRow.push(trimmedLine);
        }
      }
    }

    // Add the last row
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return {
      headers,
      rows,
      rawText: text
    };
  };

  const exportToExcel = () => {
    if (!extractedData) return;

    // Convert data to CSV format
    const csvContent = [
      extractedData.headers.join(','),
      ...extractedData.rows.map(row => 
        row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `extracted-data-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadRawText = () => {
    if (!extractedData) return;
    
    const blob = new Blob([extractedData.rawText], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `raw-extracted-text-${new Date().toISOString().split('T')[0]}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <LayoutWrapper currentPage="/pdf-to-excel">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">PDF to Excel Converter</h1>
          <p className="text-muted-foreground">
            Extract table data from PDF files using Azure Vision OCR and convert to Excel format
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              PDF Upload
            </CardTitle>
            <CardDescription>
              Upload your PDF file for data extraction
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pdf-upload">Select PDF File</Label>
              <Input
                id="pdf-upload"
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
            </div>

            {file && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <strong>{file.name}</strong> selected
                  <br />
                  Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                </AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={processPdf} 
              disabled={!file || isProcessing}
              className="w-full"
              size="lg"
            >
              {isProcessing ? 'Processing...' : 'Extract Data'}
            </Button>
          </CardContent>
        </Card>

        {/* Processing Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Processing Status
            </CardTitle>
            <CardDescription>
              Real-time processing information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{processingStatus.message}</span>
                <span>{processingStatus.progress}%</span>
              </div>
              <Progress value={processingStatus.progress} className="w-full" />
            </div>

            {processingStatus.status === 'completed' && extractedData && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-green-50 rounded border">
                    <div className="font-medium text-green-800">Rows Extracted</div>
                    <div className="text-lg font-bold text-green-600">{extractedData.rows.length}</div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded border">
                    <div className="font-medium text-blue-800">Columns</div>
                    <div className="text-lg font-bold text-blue-600">{extractedData.headers.length}</div>
                  </div>
                </div>
              </div>
            )}

            {processingStatus.status === 'error' && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {processingStatus.message}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      {extractedData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Extracted Data Preview
            </CardTitle>
            <CardDescription>
              Preview of extracted table data (showing first 10 rows)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Button onClick={exportToExcel} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export to Excel
              </Button>
              <Button onClick={downloadRawText} variant="outline" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Download Raw Text
              </Button>
            </div>

            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">Data Preview</TabsTrigger>
                <TabsTrigger value="raw">Raw Text</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="space-y-4">
                <div className="rounded-md border max-h-96 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        {extractedData.headers.map((header, index) => (
                          <TableHead key={index} className="min-w-[120px]">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <TableCell key={cellIndex} className="max-w-[150px] truncate text-xs">
                              <span title={cell}>
                                {cell || '-'}
                              </span>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-sm text-muted-foreground">
                  Showing first 10 of {extractedData.rows.length} rows
                </div>
              </TabsContent>

              <TabsContent value="raw" className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border max-h-96 overflow-auto">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {extractedData.rawText}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use</CardTitle>
          <CardDescription>
            Step-by-step guide for PDF to Excel conversion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border">
                <div className="font-medium text-blue-800 mb-2">1. Upload PDF</div>
                <div className="text-sm text-blue-600">
                  Select a PDF file containing table data. The system works best with clear, structured tables.
                </div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border">
                <div className="font-medium text-green-800 mb-2">2. Process</div>
                <div className="text-sm text-green-600">
                  The system will convert PDF to images and use Azure Vision OCR to extract text data.
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border">
                <div className="font-medium text-purple-800 mb-2">3. Export</div>
                <div className="text-sm text-purple-600">
                  Download the extracted data as Excel/CSV file or view the raw extracted text.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </LayoutWrapper>
  );
}
