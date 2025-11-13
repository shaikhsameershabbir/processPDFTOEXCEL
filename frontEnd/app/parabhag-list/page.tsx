'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Download, Search, FileText, Table as TableIcon, Filter } from 'lucide-react';
import { LayoutWrapper } from '@/components/layout-wrapper';

interface TableColumn {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
}

interface ParabhagRecord {
  index: number;
  data: any;
}

export default function ParabhagList() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableColumns, setTableColumns] = useState<TableColumn[]>([]);
  const [assemblyNo, setAssemblyNo] = useState<string>('');
  const [partNumbers, setPartNumbers] = useState<string[]>(['']);
  const [parabhagRecords, setParabhagRecords] = useState<ParabhagRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<ParabhagRecord[]>([]);
  const [availablePartNumbers, setAvailablePartNumbers] = useState<string[]>([]);
  const [selectedPartNumbers, setSelectedPartNumbers] = useState<string[]>([]);
  const [prabhagNumber, setPrabhagNumber] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<{ total: number } | null>(null);

  // Helper: derive gender from available keys in DB row
  const getGenderFromRecord = (row: any): string => {
    if (!row) return '';
    const possibleKeys = ['GENDER', 'SEX', 'GENDER_EN', 'GENDER_V1', 'GEN', 'GEND'];
    for (const key of possibleKeys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && String(row[key]).trim() !== '') {
        return String(row[key]).trim();
      }
    }
    return '';
  };

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

  // Extract part numbers from search results
  useEffect(() => {
    if (parabhagRecords.length > 0) {
      const partNumbers = new Set<string>();
      parabhagRecords.forEach((record) => {
        const partNo = record.data.PART_NO;
        if (partNo && partNo.toString().trim()) {
          partNumbers.add(partNo.toString().trim());
        }
      });
      setAvailablePartNumbers(Array.from(partNumbers).sort());
      // Auto-select all part numbers initially
      setSelectedPartNumbers(Array.from(partNumbers));
    }
  }, [parabhagRecords]);

  // Filter records based on selected part numbers
  useEffect(() => {
    if (parabhagRecords.length > 0) {
      if (selectedPartNumbers.length === 0) {
        setFilteredRecords([]);
      } else {
        const filtered = parabhagRecords.filter(record => {
          const partNo = record.data.PART_NO;
          return partNo && selectedPartNumbers.includes(partNo.toString().trim());
        });
        setFilteredRecords(filtered);
      }
    }
  }, [parabhagRecords, selectedPartNumbers]);

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

      let data: string[];
      try {
        data = body ? JSON.parse(body) : [];
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${(parseError as Error).message}. Body: ${body.slice(0, 200)}`);
      }

      setTables(data);
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
    } catch (error) {
    }
  };

  const handleSearchData = async () => {
    const validPartNumbers = getValidPartNumbers();
    if (!selectedTable || !assemblyNo || validPartNumbers.length === 0) {
      alert('Please select a table, enter assembly number, and at least one part number');
      return;
    }

    setLoading(true);
    try {

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/parabhag-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableName: selectedTable,
          assemblyNo: assemblyNo,
          partNumbers: validPartNumbers,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      setParabhagRecords(data.records || []);
      setStats({ total: data.records?.length || 0 });
      
      if (data.records?.length === 0) {
        alert('No records found for the given assembly number and part number');
      }
    } catch (error :any) {
      alert(`Error searching data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addPartNumberInput = () => {
    setPartNumbers(prev => [...prev, '']);
  };

  const removePartNumberInput = (index: number) => {
    if (partNumbers.length > 1) {
      setPartNumbers(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updatePartNumber = (index: number, value: string) => {
    setPartNumbers(prev => prev.map((pn, i) => i === index ? value : pn));
  };

  const getValidPartNumbers = () => {
    return partNumbers.filter(pn => pn.trim() !== '');
  };

  const togglePartNumberSelection = (partNumber: string) => {
    setSelectedPartNumbers(prev => 
      prev.includes(partNumber) 
        ? prev.filter(p => p !== partNumber)
        : [...prev, partNumber]
    );
  };

  const selectAllPartNumbers = () => {
    setSelectedPartNumbers(availablePartNumbers);
  };

  const clearPartNumberSelection = () => {
    setSelectedPartNumbers([]);
  };

  const handleExportExcel = async () => {
    const recordsToExport = filteredRecords.length > 0 ? filteredRecords : parabhagRecords;
    if (recordsToExport.length === 0) {
      alert('No data to export');
      return;
    }

    if (!prabhagNumber.trim()) {
      alert('Please enter a Prabhag number before exporting');
      return;
    }

    setExporting(true);
    try {

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/export-parabhag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tableName: selectedTable,
          assemblyNo: assemblyNo,
          partNumbers: getValidPartNumbers(),
          prabhagNumber: prabhagNumber,
          filename: `prabhag-${prabhagNumber}-parabhag-list-${selectedTable}-${assemblyNo}-${getValidPartNumbers().join('-')}-${new Date().toISOString().split('T')[0]}.xlsx`,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prabhag-${prabhagNumber}-parabhag-list-${selectedTable}-${assemblyNo}-${getValidPartNumbers().join('-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
      } else {
        throw new Error(`Export failed: ${response.status}`);
      }
    } catch (error:any) {
      alert(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <LayoutWrapper currentPage="/parabhag-list">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Parabhag List</h1>
          <p className="text-muted-foreground">
            Search and export parabhag data by assembly number and part number
          </p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Database Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Selection
            </CardTitle>
            <CardDescription>
              Select the database table to search
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

        {/* Search Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Search Parameters
            </CardTitle>
            <CardDescription>
              Enter assembly number and multiple part numbers to search
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="assembly-no">Assembly Number (AC_NO)</Label>
              <Input
                id="assembly-no"
                type="text"
                placeholder="Enter assembly number"
                value={assemblyNo}
                onChange={(e) => setAssemblyNo(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Part Numbers (PART_NO)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPartNumberInput}
                >
                  + Add Part Number
                </Button>
              </div>
              
              <div className="space-y-2">
                {partNumbers.map((partNo, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder={`Enter part number ${index + 1}`}
                      value={partNo}
                      onChange={(e) => updatePartNumber(index, e.target.value)}
                    />
                    {partNumbers.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removePartNumberInput(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              
              <p className="text-xs text-muted-foreground">
                {getValidPartNumbers().length} valid part number(s) entered
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Search Action */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Action
            </CardTitle>
            <CardDescription>
              Execute search and export operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Button 
                onClick={handleSearchData} 
                disabled={loading || !selectedTable || !assemblyNo || getValidPartNumbers().length === 0}
                className="w-full"
                size="lg"
              >
                {loading ? 'Searching...' : 'Search Data'}
              </Button>
              
              {parabhagRecords.length > 0 && (
                <Button 
                  onClick={handleExportExcel} 
                  disabled={exporting}
                  className="w-full"
                  size="lg"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {exporting ? 'Exporting...' : `Export to Excel (${filteredRecords.length > 0 ? filteredRecords.length : parabhagRecords.length})`}
                </Button>
              )}
            </div>

            {stats && (
              <div className="p-3 bg-blue-50 rounded-lg border">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">{stats.total.toLocaleString()}</div>
                  <div className="text-sm text-blue-800 font-medium">Records Found</div>
                  <div className="text-xs text-blue-600 mt-1">
                    Assembly: {assemblyNo} | Parts: {getValidPartNumbers().join(', ')}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Part Number Filter */}
      {parabhagRecords.length > 0 && availablePartNumbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter by Part Numbers
            </CardTitle>
            <CardDescription>
              Select specific part numbers to filter the results. All part numbers are selected by default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Available Part Numbers ({availablePartNumbers.length})</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllPartNumbers}
                    disabled={selectedPartNumbers.length === availablePartNumbers.length}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearPartNumberSelection}
                    disabled={selectedPartNumbers.length === 0}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
                {availablePartNumbers.map((partNo) => (
                  <div key={partNo} className="flex items-center space-x-2">
                    <Checkbox
                      id={`part-${partNo}`}
                      checked={selectedPartNumbers.includes(partNo)}
                      onCheckedChange={() => togglePartNumberSelection(partNo)}
                    />
                    <Label
                      htmlFor={`part-${partNo}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {partNo}
                    </Label>
                  </div>
                ))}
              </div>
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {selectedPartNumbers.length} of {availablePartNumbers.length} part numbers selected
                </span>
                <span>
                  {filteredRecords.length} records will be displayed
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {parabhagRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Search Results
            </CardTitle>
            <CardDescription>
              Found {parabhagRecords.length.toLocaleString()} total records for Assembly {assemblyNo}, Parts: {getValidPartNumbers().join(', ')}
              {filteredRecords.length !== parabhagRecords.length && (
                <span className="text-blue-600 font-medium">
                  {' '}({filteredRecords.length.toLocaleString()} filtered by part numbers)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-green-50 rounded-lg border">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{parabhagRecords.length}</div>
                <div className="text-sm text-green-800">Total Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{filteredRecords.length}</div>
                <div className="text-sm text-blue-800">Filtered Records</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{selectedTable}</div>
                <div className="text-sm text-purple-800">Database Table</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{tableColumns.length}</div>
                <div className="text-sm text-orange-800">Columns Available</div>
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-md border max-h-96 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background border-r">#</TableHead>
                    <TableHead className="min-w-[120px]">EPIC_NO</TableHead>
                    <TableHead className="min-w-[120px]">ADDRESS</TableHead>
                    <TableHead className="min-w-[120px]">ADDRESS_V1</TableHead>
                    <TableHead className="min-w-[120px]">PART_NUMBER</TableHead>
                    <TableHead className="min-w-[120px]">NAME_EN</TableHead>
                    <TableHead className="min-w-[120px]">NAME_V1</TableHead>
                    <TableHead className="min-w-[120px]">RLN_TYPE</TableHead>
                    <TableHead className="min-w-[120px]">RLN_NAME_EN</TableHead>
                    <TableHead className="min-w-[120px]">RLN_NAME_V1</TableHead>
                    <TableHead className="min-w-[120px]">DOB</TableHead>
                    <TableHead className="min-w-[120px]">MOB</TableHead>
                    <TableHead className="min-w-[120px]">GENDER</TableHead>
                    <TableHead className="min-w-[120px]">GENDER</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filteredRecords.length > 0 ? filteredRecords : parabhagRecords).slice(0, 100).map((record, index) => (
                    <TableRow key={index}>
                      <TableCell className="sticky left-0 bg-background border-r font-medium text-xs">
                        {index + 1}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.EPIC_NO || '-'}>
                          {record.data.EPIC_NO || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.adr1 || '-'}>
                          {record.data.adr1 || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.adr2 || '-'}>
                          {record.data.adr2 || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.PART_NO || '-'}>
                          {record.data.PART_NO || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={`${record.data.LASTNAME_EN || ''} ${record.data.FM_NAME_EN || ''}`.replace(/\s+/g, ' ').trim() || '-'}>
                          {`${record.data.LASTNAME_EN || ''} ${record.data.FM_NAME_EN || ''}`.replace(/\s+/g, ' ').trim() || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={`${record.data.LASTNAME_V1 || ''} ${record.data.FM_NAME_V1 || ''}`.replace(/\s+/g, ' ').trim() || '-'}>
                          {`${record.data.LASTNAME_V1 || ''} ${record.data.FM_NAME_V1 || ''}`.replace(/\s+/g, ' ').trim() || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.RLN_TYPE || '-'}>
                          {record.data.RLN_TYPE || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={`${record.data.RLN_L_NM_EN || ''} ${record.data.RLN_FM_NM_EN || ''}`.replace(/\s+/g, ' ').trim() || '-'}>
                          {`${record.data.RLN_L_NM_EN || ''} ${record.data.RLN_FM_NM_EN || ''}`.replace(/\s+/g, ' ').trim() || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={`${record.data.RLN_L_NM_V1 || ''} ${record.data.RLN_FM_NM_V1 || ''}`.replace(/\s+/g, ' ').trim() || '-'}>
                          {`${record.data.RLN_L_NM_V1 || ''} ${record.data.RLN_FM_NM_V1 || ''}`.replace(/\s+/g, ' ').trim() || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.DOB || '-'}>
                          {record.data.DOB || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.MOB || '-'}>
                          {record.data.MOB || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={getGenderFromRecord(record.data) || '-'}>
                          {getGenderFromRecord(record.data) || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs">
                        <span title={record.data.GENDER || '-'}>
                          {record.data.GENDER || '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>
                Showing first 100 of {(filteredRecords.length > 0 ? filteredRecords : parabhagRecords).length.toLocaleString()} records
                {filteredRecords.length > 0 && filteredRecords.length !== parabhagRecords.length && (
                  <span className="text-blue-600"> (filtered)</span>
                )}
              </span>
              <span>
                {tableColumns.length} columns available
              </span>
            </div>

            <Separator />

            {/* Prabhag Number Input */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="prabhag-number">Prabhag Number *</Label>
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
                  This number will be added as a column for all records in the Excel file
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <Button 
                onClick={handleExportExcel} 
                size="lg" 
                className="px-8" 
                disabled={exporting || !prabhagNumber.trim()}
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : `Export to Excel (${filteredRecords.length > 0 ? filteredRecords.length : parabhagRecords.length})`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Configuration
          </CardTitle>
          <CardDescription>
            Export format and structure information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border">
                <h4 className="font-medium text-sm mb-3 text-blue-800">Excel Export Format</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="font-medium text-blue-700">Export Columns:</div>
                    <ul className="space-y-1 text-blue-600">
                      <li>• PRABHAG_NO (User entered Prabhag number)</li>
                      <li>• EPIC_NO</li>
                      <li>• ADDRESS</li>
                      <li>• ADDRESS_V1</li>
                      <li>• PART_NUMBER</li>
                      <li>• NAME_EN</li>
                      <li>• NAME_V1</li>
                      <li>• RLN_TYPE</li>
                      <li>• RLN_NAME_EN</li>
                      <li>• RLN_NAME_V1</li>
                      <li>• DOB</li>
                      <li>• MOB</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium text-green-700">File Naming:</div>
                    <ul className="space-y-1 text-green-600">
                      <li>• Format: prabhag-[number]-parabhag-list-[table]-[assembly]-[parts]-[date].xlsx</li>
                      <li>• Example: prabhag-5-parabhag-list-assembly_1_1-123-456-789-2024-01-15.xlsx</li>
                      <li>• Automatic download</li>
                      <li>• Date timestamp included</li>
                    </ul>
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
