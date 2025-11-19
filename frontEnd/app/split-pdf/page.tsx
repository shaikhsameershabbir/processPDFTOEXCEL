'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { LayoutWrapper } from '@/components/layout-wrapper';

interface SplitFile {
  filename: string;
  path: string;
  pages: number;
  pageRange: string;
  downloadUrl: string;
}

interface SplitResult {
  success: boolean;
  totalPages: number;
  totalSplits: number;
  pagesPerSplit: number;
  splitFiles: SplitFile[];
  splitDir: string;
  warning?: string | null;
}

export default function SplitPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesPerSplit, setPagesPerSplit] = useState<number>(500);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setSplitResult(null);
      setError(null);
      setProgress(0);
    } else if (selectedFile) {
      setError('Please select a PDF file');
      setFile(null);
    }
  };

  const handleSplit = async () => {
    if (!file) {
      setError('Please select a PDF file first');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('pagesPerSplit', pagesPerSplit.toString());

      setProgress(20);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/split-pdf`, {
        method: 'POST',
        body: formData,
      });

      setProgress(60);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to split PDF');
      }

      const result: SplitResult = await response.json();
      setProgress(100);
      setSplitResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while splitting the PDF');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (downloadUrl: string, filename: string) => {
    const fullUrl = `${process.env.NEXT_PUBLIC_API_URL}${downloadUrl}`;
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    if (!splitResult) return;
    
    splitResult.splitFiles.forEach((splitFile, index) => {
      setTimeout(() => {
        handleDownload(splitFile.downloadUrl, splitFile.filename);
      }, index * 500); // Stagger downloads by 500ms
    });
  };

  const handleReset = () => {
    setFile(null);
    setSplitResult(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <LayoutWrapper>
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">PDF Splitter</h1>
            <p className="text-muted-foreground">
              Upload a PDF file and split it into smaller files with a specified number of pages per file.
            </p>
          </div>

          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload PDF</CardTitle>
              <CardDescription>
                Select a PDF file to split into smaller chunks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pages-per-split">Pages per Split</Label>
                <Input
                  id="pages-per-split"
                  type="number"
                  min="1"
                  value={pagesPerSplit}
                  onChange={(e) => setPagesPerSplit(Math.max(1, parseInt(e.target.value) || 500))}
                  className="max-w-xs"
                />
                <p className="text-sm text-muted-foreground">
                  Number of pages per split file (default: 500)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pdf-file">PDF File</Label>
                <div className="flex items-center gap-4">
                  <input
                    ref={fileInputRef}
                    id="pdf-file"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {file ? 'Change File' : 'Select PDF'}
                  </Button>
                  {file && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                      <Badge variant="secondary">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Processing PDF...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSplit}
                  disabled={!file || isProcessing}
                  className="min-w-[120px]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Splitting...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Split PDF
                    </>
                  )}
                </Button>
                {splitResult && (
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={isProcessing}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          {splitResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Split Complete
                </CardTitle>
                <CardDescription>
                  Your PDF has been successfully split into {splitResult.totalSplits} file(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {splitResult.warning && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Warning:</strong> {splitResult.warning}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Total Pages</div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                      {splitResult.totalPages}
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Total Splits</div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {splitResult.totalSplits}
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Pages per Split</div>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                      {splitResult.pagesPerSplit}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Split Files</h3>
                    <Button
                      onClick={handleDownloadAll}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download All
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part</TableHead>
                          <TableHead>Filename</TableHead>
                          <TableHead>Pages</TableHead>
                          <TableHead>Page Range</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {splitResult.splitFiles.map((splitFile, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">
                              Part {index + 1} of {splitResult.totalSplits}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {splitFile.filename}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{splitFile.pages}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {splitFile.pageRange}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                onClick={() => handleDownload(splitFile.downloadUrl, splitFile.filename)}
                                variant="outline"
                                size="sm"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </LayoutWrapper>
  );
}

