'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Upload, Database, Download, CheckCircle, XCircle, FileText, Columns, Table as TableIcon } from 'lucide-react';
import { LayoutWrapper } from '@/components/layout-wrapper';

interface FileData {
  filename: string;
  filepath: string;
  headers: string[];
  preview: any[];
  totalRows: number;
}

interface TableColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

interface MatchedRecord {
  index: number;
  epic_no: string;
  file_data: any;
  db_data: any;
  matched: boolean;
}

interface MatchStats {
  total: number;
  matched: number;
  unmatched: number;
  matchRate: string;
}

export default function GetFinalExcel() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableColumns, setTableColumns] = useState<TableColumn[]>([]);
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [epicColumn, setEpicColumn] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [allAvailableColumns, setAllAvailableColumns] = useState<string[]>([]);
  const [matchedRecords, setMatchedRecords] = useState<MatchedRecord[]>([]);
  const [unmatchedRecords, setUnmatchedRecords] = useState<MatchedRecord[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');
  const [prabhagNumber, setPrabhagNumber] = useState('');

  // Fetch database tables on component mount
  useEffect(() => {
    fetchTables();
  }, []);

  // Fetch table columns when table is selected
  useEffect(() => {
    if (selectedTable) {
      fetchTableColumns(selectedTable);
    }
  }, [selectedTable]);

  const fetchTables = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tables`);
      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
      }

      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Unexpected response type ${contentType}: ${body.slice(0, 200)}`);
      }

      let data: any;
      try {
        data = body ? JSON.parse(body) : null;
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${(parseError as Error).message}. Body: ${body.slice(0, 200)}`);
      }

      setTables(Array.isArray(data) ? data : []);
    } catch (error) {
    }
  };

  const fetchTableColumns = async (tableName: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tables/${tableName}/columns`);
      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
      }

      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Unexpected response type ${contentType}: ${body.slice(0, 200)}`);
      }

      let data: TableColumn[];
      try {
        data = body ? JSON.parse(body) : [];
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${(parseError as Error).message}. Body: ${body.slice(0, 200)}`);
      }

      setTableColumns(data);
      
      // Update available columns when table is selected
      if (fileData) {
        updateAvailableColumns(data, fileData.headers);
      }
    } catch (error) {
    }
  };

  const updateAvailableColumns = (dbColumns: TableColumn[], excelHeaders: string[]) => {
    // Combine database columns and Excel headers, removing duplicates
    const dbColumnNames = dbColumns.map(col => col.COLUMN_NAME);
    const allColumns = [...new Set([...dbColumnNames, ...excelHeaders])];
    setAllAvailableColumns(allColumns);
    
    // Auto-select all columns initially
    setSelectedColumns(allColumns);
  };
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setFileData(data);
      
      // Auto-select EPIC column if it exists (handles various naming conventions)
      const epicCol = data.headers.find((h: string) => {
        const lowerHeader = h.toLowerCase().trim();
        return (
          lowerHeader.includes('epic') || 
          lowerHeader.includes('voter') ||
          lowerHeader === 'epic_no' ||
          lowerHeader === 'epic id' ||
          lowerHeader === 'epicid' ||
          lowerHeader === 'voter_id' ||
          lowerHeader === 'voterid'
        );
      });
      if (epicCol) {
        setEpicColumn(epicCol);
      }

      // Update available columns if table is already selected
      if (selectedTable && tableColumns.length > 0) {
        updateAvailableColumns(tableColumns, data.headers);
      }
    } catch (error) {
    } finally {
      setUploading(false);
    }
  };

  const handleMatchData = async () => {
    if (!fileData || !selectedTable || !epicColumn) {
      alert('Please upload a file, select a table, and choose EPIC column');
      return;
    }

    setLoading(true);
    try {

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/match-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: fileData.filepath,
          tableName: selectedTable,
          epicColumn: epicColumn,
          selectedColumns: selectedColumns,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      setMatchedRecords(data.matched);
      setUnmatchedRecords(data.unmatched);
      setMatchStats(data.stats);
      
      // Show success message with match details
      if (data.stats) {
        const matchRate = parseFloat(data.stats.matchRate);
        if (matchRate < 50) {
          alert(`⚠️ Low match rate: ${data.stats.matchRate}%. Please verify your EPIC column selection and data format.`);
        } else {
        }
      }
    } catch (error) {
      alert(`Error matching data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (matchedRecords.length === 0 && unmatchedRecords.length === 0) {
      alert('No data to export');
      return;
    }

    setExporting(true);
    try {
    const prabhagValue = prabhagNumber.trim();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: fileData?.filepath,
          tableName: selectedTable,
          epicColumn: epicColumn,
        prabhagNumber: prabhagValue || '',
        filename: `prabhag-${prabhagValue || 'auto'}-matched-data-${new Date().toISOString().split('T')[0]}.xlsx`,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prabhag-${prabhagValue || 'auto'}-matched-data-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
      } else {
        throw new Error(`Export failed: ${response.status}`);
      }
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const toggleColumnSelection = (column: string) => {
    setSelectedColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumns(allAvailableColumns);
  };

  const clearColumnSelection = () => {
    setSelectedColumns([]);
  };

  return (
    <LayoutWrapper currentPage="/getFinalExcel">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Data Matching & Export Tool</h1>
          <p className="text-muted-foreground">
            Upload Excel/CSV files and match with database records using EPIC numbers
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              File Upload
            </CardTitle>
            <CardDescription>
              Upload your Excel or CSV file for data matching
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file-upload">Select File</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </div>

            {fileData && (
              <div className="space-y-2">
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{fileData.filename}</strong> uploaded successfully
                    <br />
                    Rows: {fileData.totalRows} | Columns: {fileData.headers.length}
                  </AlertDescription>
                </Alert>

                <div>
                  <Label>EPIC Column</Label>
                  <Select value={epicColumn} onValueChange={setEpicColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select EPIC column" />
                    </SelectTrigger>
                    <SelectContent>
                      {fileData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Selection
            </CardTitle>
            <CardDescription>
              Select the database table for matching
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Select Table</Label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table} value={table}>
                      {table}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTable && (
              <div className="space-y-2">
                <Alert>
                  <Database className="h-4 w-4" />
                  <AlertDescription>
                    Selected: <strong>{selectedTable}</strong>
                    <br />
                    Columns: {tableColumns.length}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Export Configuration */}
      {fileData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Columns className="h-5 w-5" />
              Export Configuration
            </CardTitle>
            <CardDescription>
              Custom export format with predefined column mapping. Matched records will use database data, unmatched records will use Excel data with null values for missing fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border">
                <h4 className="font-medium text-sm mb-3 text-blue-800">Excel Export Format</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="font-medium text-blue-700">For Matched Records:</div>
                    <ul className="space-y-1 text-blue-600">
                      <li>• SERIAL_NO = Serial number from uploaded file</li>
                      <li>• PRABHAG_NO = Override value (if provided) or Prabhag detected in PDF</li>
                      <li>• PRABHAG_HEADER = Full Prabhag header text from PDF</li>
                      <li>• YADI_BHAG = Yadi section header from PDF</li>
                      <li>• MATDAR_KENDRA = Matdan Kendra line from PDF</li>
                      <li>• BOOTH_ADDRESS = Booth address line from PDF</li>
                      <li>• GAN = GAN number (निवाचन गण) (from Excel)</li>
                      <li>• EPIC_NO = EPIC ID (from Excel)</li>
                      <li>• ADDRESS = address (from Excel)</li>
                      <li>• ADDRESS_V1 = address_v1 (from Excel)</li>
                      <li>• PART_NUMBER = partNumber (from Excel)</li>
                      <li>• NAME_EN = LASTNAME_EN + FM_NAME_EN (from Database)</li>
                      <li>• NAME_V1 = FM_NAME_V1 + LASTNAME_V1 (from Database)</li>
                      <li>• RLN_TYPE = RLN_TYPE (from Database)</li>
                      <li>• RLN_NAME_EN = RLN_L_NM_EN + RLN_FM_NM_EN (from Database)</li>
                      <li>• RLN_NAME_V1 = RLN_L_NM_V1 + RLN_FM_NM_V1 (from Database)</li>
                      <li>• AGE = age (from Excel) or AGE (from Database if not in Excel)</li>
                      <li>• DOB = DOB (from Database)</li>
                      <li>• MOB = MOB (from Database)</li>
                      <li>• GENDER = GENDER (from Database)</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium text-green-700">For Unmatched Records:</div>
                    <ul className="space-y-1 text-green-600">
                      <li>• SERIAL_NO = Serial number from uploaded file</li>
                      <li>• PRABHAG_NO = Override value (if provided) or Prabhag detected in PDF</li>
                      <li>• PRABHAG_HEADER = Full Prabhag header text from PDF</li>
                      <li>• YADI_BHAG = Yadi section header from PDF</li>
                      <li>• MATDAR_KENDRA = Matdan Kendra line from PDF</li>
                      <li>• BOOTH_ADDRESS = Booth address line from PDF</li>
                      <li>• GAN = GAN number (निवाचन गण) (from Excel)</li>
                      <li>• EPIC_NO = EPIC ID (from Excel)</li>
                      <li>• ADDRESS = address (from Excel)</li>
                      <li>• ADDRESS_V1 = address_v1 (from Excel)</li>
                      <li>• PART_NUMBER = partNumber (from Excel)</li>
                      <li>• NAME_EN = NAME_EN (from Excel)</li>
                      <li>• NAME_V1 = NAME_V1 (from Excel)</li>
                      <li>• RLN_TYPE = RLN_TYPE (from Excel)</li>
                      <li>• RLN_NAME_EN = RLN_NAME_EN (from Excel)</li>
                      <li>• RLN_NAME_V1 = RLN_NAME_V1 (from Excel)</li>
                      <li>• AGE = age (from Excel)</li>
                      <li>• DOB = NULL</li>
                      <li>• MOB = NULL</li>
                      <li>• GENDER = GENDER (from Excel)</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h5 className="font-medium text-sm mb-2">Export Columns Preview:</h5>
                <div className="flex flex-wrap gap-2">
                  {['SERIAL_NO', 'PRABHAG_NO', 'PRABHAG_HEADER', 'YADI_BHAG', 'MATDAR_KENDRA', 'BOOTH_ADDRESS', 'GAN', 'EPIC_NO', 'ADDRESS', 'ADDRESS_V1', 'PART_NUMBER', 'NAME_EN', 'NAME_V1', 'RLN_TYPE', 'RLN_NAME_EN', 'RLN_NAME_V1', 'AGE', 'DOB', 'MOB', 'GENDER'].map((column) => (
                    <Badge key={column} variant="outline" className="text-xs">
                      {column}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Match Data Button */}
      {fileData && selectedTable && epicColumn && (
        <div className="text-center">
          <Button 
            onClick={handleMatchData} 
            disabled={loading}
            size="lg"
            className="px-8"
          >
            {loading ? 'Matching Data...' : 'Match Data'}
          </Button>
        </div>
      )}

      {/* Prabhag Number Input */}
      {matchStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Export Configuration
            </CardTitle>
            <CardDescription>
              Optionally override the Prabhag number before exporting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="prabhag-number">Prabhag Number (optional)</Label>
                <Input
                  id="prabhag-number"
                  type="number"
                  placeholder="Enter Prabhag number (e.g., 1, 2, 3...)"
                  value={prabhagNumber}
                  onChange={(e) => setPrabhagNumber(e.target.value)}
                  min="1"
                  className="max-w-xs"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Leave blank to use the Prabhag detected in the PDF data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {matchStats && (
        <Card>
          <CardHeader>
            <CardTitle>Matching Results</CardTitle>
            <CardDescription>
              Data matching completed successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg border">
                <div className="text-3xl font-bold text-blue-600 mb-1">{matchStats.total.toLocaleString()}</div>
                <div className="text-sm text-blue-800 font-medium">Total Records</div>
                <div className="text-xs text-blue-600 mt-1">From Excel/CSV file</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg border">
                <div className="text-3xl font-bold text-green-600 mb-1">{matchStats.matched.toLocaleString()}</div>
                <div className="text-sm text-green-800 font-medium">Matched Records</div>
                <div className="text-xs text-green-600 mt-1">
                  {((matchStats.matched / matchStats.total) * 100).toFixed(1)}% of total
                </div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border">
                <div className="text-3xl font-bold text-red-600 mb-1">{matchStats.unmatched.toLocaleString()}</div>
                <div className="text-sm text-red-800 font-medium">Unmatched Records</div>
                <div className="text-xs text-red-600 mt-1">
                  {((matchStats.unmatched / matchStats.total) * 100).toFixed(1)}% of total
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg border">
                <div className="text-3xl font-bold text-purple-600 mb-1">{matchStats.matchRate}%</div>
                <div className="text-sm text-purple-800 font-medium">Success Rate</div>
                <div className="text-xs text-purple-600 mt-1">
                  {parseFloat(matchStats.matchRate) >= 80 ? 'Excellent' : 
                   parseFloat(matchStats.matchRate) >= 60 ? 'Good' : 
                   parseFloat(matchStats.matchRate) >= 40 ? 'Fair' : 'Needs Review'}
                </div>
              </div>
            </div>

            {/* Additional Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-gray-700">Database Records</div>
                    <div className="text-sm text-gray-500">Available for matching</div>
                  </div>
                  <div className="text-2xl font-bold text-gray-600">
                    {matchedRecords.length > 0 ? matchedRecords[0]?.db_data ? '1M+' : 'N/A' : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-gray-700">Selected Columns</div>
                    <div className="text-sm text-gray-500">For export</div>
                  </div>
                  <div className="text-2xl font-bold text-gray-600">{selectedColumns.length}</div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-gray-700">Table</div>
                    <div className="text-sm text-gray-500">Database table used</div>
                  </div>
                  <div className="text-sm font-bold text-gray-600 truncate max-w-[120px]" title={selectedTable}>
                    {selectedTable}
                  </div>
                </div>
              </div>
            </div>

            <Progress 
              value={parseFloat(matchStats.matchRate)} 
              className="w-full"
            />

      <div className="flex justify-center">
              <Button onClick={handleExportExcel} size="lg" className="px-8" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export to Excel'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview */}
      {(matchedRecords.length > 0 || unmatchedRecords.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Data Preview & Analysis
            </CardTitle>
            <CardDescription>
              Detailed view of matched and unmatched records with data quality insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="matched" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="matched" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Matched ({matchedRecords.length.toLocaleString()})
                  <Badge variant="default" className="ml-1 bg-green-100 text-green-800">
                    {((matchedRecords.length / (matchedRecords.length + unmatchedRecords.length)) * 100).toFixed(1)}%
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="unmatched" className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  Unmatched ({unmatchedRecords.length.toLocaleString()})
                  <Badge variant="destructive" className="ml-1">
                    {((unmatchedRecords.length / (matchedRecords.length + unmatchedRecords.length)) * 100).toFixed(1)}%
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="matched" className="space-y-4">
                {/* Matched Records Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-green-50 rounded-lg border">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{matchedRecords.length}</div>
                    <div className="text-sm text-green-800">Total Matched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {matchedRecords.filter(r => r.db_data).length}
                    </div>
                    <div className="text-sm text-blue-800">With DB Data</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {((matchedRecords.filter(r => r.db_data).length / matchedRecords.length) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-purple-800">Data Coverage</div>
                  </div>
                </div>

                <div className="rounded-md border max-h-96 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background border-r">#</TableHead>
                        <TableHead className="sticky left-12 bg-background border-r">EPIC No</TableHead>
                        {selectedColumns.length > 0 ? selectedColumns.slice(0, 8).map((col) => (
                          <TableHead key={col} className="min-w-[120px]">{col}</TableHead>
                        )) : fileData?.headers.slice(0, 8).map((col) => (
                          <TableHead key={col} className="min-w-[120px]">{col}</TableHead>
                        ))}
                        <TableHead className="sticky right-0 bg-background border-l">Data Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matchedRecords.slice(0, 50).map((record) => (
                        <TableRow key={record.index}>
                          <TableCell className="sticky left-0 bg-background border-r font-medium text-xs">
                            {record.index}
                          </TableCell>
                          <TableCell className="sticky left-12 bg-background border-r font-mono text-sm">
                            {record.epic_no}
                          </TableCell>
                          {selectedColumns.length > 0 ? selectedColumns.slice(0, 8).map((col) => (
                            <TableCell key={col} className="max-w-[150px] truncate text-xs">
                              <span title={record.db_data?.[col] || record.file_data?.[col] || '-'}>
                                {record.db_data?.[col] || record.file_data?.[col] || '-'}
                              </span>
                            </TableCell>
                          )) : fileData?.headers.slice(0, 8).map((col) => (
                            <TableCell key={col} className="max-w-[150px] truncate text-xs">
                              <span title={record.db_data?.[col] || record.file_data?.[col] || '-'}>
                                {record.db_data?.[col] || record.file_data?.[col] || '-'}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell className="sticky right-0 bg-background border-l">
                            <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                              {record.db_data ? 'Database' : 'File'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Showing first 50 of {matchedRecords.length.toLocaleString()} matched records</span>
                  <span>
                    {matchedRecords.filter(r => r.db_data).length} with database data
                  </span>
                </div>
              </TabsContent>

              <TabsContent value="unmatched" className="space-y-4">
                {/* Unmatched Records Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-red-50 rounded-lg border">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{unmatchedRecords.length}</div>
                    <div className="text-sm text-red-800">Total Unmatched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {unmatchedRecords.filter(r => !r.epic_no || r.epic_no.trim() === '').length}
                    </div>
                    <div className="text-sm text-orange-800">Missing EPIC</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {unmatchedRecords.filter(r => r.epic_no && r.epic_no.trim() !== '').length}
                    </div>
                    <div className="text-sm text-yellow-800">Invalid EPIC</div>
                  </div>
                </div>

                <div className="rounded-md border max-h-96 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background border-r">#</TableHead>
                        <TableHead className="sticky left-12 bg-background border-r">EPIC No</TableHead>
                        {selectedColumns.length > 0 ? selectedColumns.slice(0, 8).map((col) => (
                          <TableHead key={col} className="min-w-[120px]">{col}</TableHead>
                        )) : fileData?.headers.slice(0, 8).map((col) => (
                          <TableHead key={col} className="min-w-[120px]">{col}</TableHead>
                        ))}
                        <TableHead className="sticky right-0 bg-background border-l">Issue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unmatchedRecords.slice(0, 50).map((record) => (
                        <TableRow key={record.index}>
                          <TableCell className="sticky left-0 bg-background border-r font-medium text-xs">
                            {record.index}
                          </TableCell>
                          <TableCell className="sticky left-12 bg-background border-r font-mono text-sm">
                            {record.epic_no || 'N/A'}
                          </TableCell>
                          {selectedColumns.length > 0 ? selectedColumns.slice(0, 8).map((col) => (
                            <TableCell key={col} className="max-w-[150px] truncate text-xs">
                              <span title={record.file_data?.[col] || '-'}>
                                {record.file_data?.[col] || '-'}
                              </span>
                            </TableCell>
                          )) : fileData?.headers.slice(0, 8).map((col) => (
                            <TableCell key={col} className="max-w-[150px] truncate text-xs">
                              <span title={record.file_data?.[col] || '-'}>
                                {record.file_data?.[col] || '-'}
                              </span>
                            </TableCell>
                          ))}
                          <TableCell className="sticky right-0 bg-background border-l">
                            <Badge 
                              variant={!record.epic_no || record.epic_no.trim() === '' ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {!record.epic_no || record.epic_no.trim() === '' ? 'No EPIC' : 'Not Found'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Showing first 50 of {unmatchedRecords.length.toLocaleString()} unmatched records</span>
                  <span>
                    {unmatchedRecords.filter(r => !r.epic_no || r.epic_no.trim() === '').length} missing EPIC numbers
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
      </div>
    </LayoutWrapper>
  );
}
