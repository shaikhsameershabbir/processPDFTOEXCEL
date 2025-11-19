"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Database, Download, CheckCircle, XCircle } from "lucide-react"
import { parseVotersToLines, tryExtractAddress, parseVoters, tryExtractHeaderInfo } from "@/lib/ocr-parser"
import { convertPdfToImages, processImages, combineOCRResults, getRawOCRResults, getRawApiResponses, ProcessingStatus, downloadRawText } from "@/lib/azure-vision"
import { utils, writeFile, write } from "xlsx"
import { translateText, translateBatch } from "@/lib/translator"

interface TableColumn {
  COLUMN_NAME: string
  DATA_TYPE: string
  IS_NULLABLE: string
}

interface MatchedRecord {
  index: number
  epic_no: string
  file_data: any
  db_data: any
  matched: boolean
}

interface MatchStats {
  total: number
  matched: number
  unmatched: number
  matchRate: string
}

export function FormatterApp() {
  const [raw, setRaw] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [voters, setVoters] = useState<Array<{
    serial: string
    epic: string
    part: string
    name: string
    rel: string
    house: string
    age: string
    gender: string
    genderMarathi: string
    genderEnglish: string
    address: string
    prabhag: string
    yadi: string
    booth: string
    matdarKendra: string
    gan: string
    nameEnglish?: string
    relEnglish?: string
    addressEnglish?: string
    yadiEnglish?: string
    boothEnglish?: string
    prabhagEnglish?: string
    matdarKendraEnglish?: string
    ganEnglish?: string
  }>>([])
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    status: 'idle',
    message: '',
    progress: 0
  })
  const [rawAzureText, setRawAzureText] = useState<string>("")
  const [rawApiResponses, setRawApiResponses] = useState<string>("")
  const [isApiDebugOpen, setIsApiDebugOpen] = useState<boolean>(false)
  const [isTranslating, setIsTranslating] = useState<boolean>(false)
  const [translationProgress, setTranslationProgress] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Database matching states
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [tableColumns, setTableColumns] = useState<TableColumn[]>([])
  const [matchedRecords, setMatchedRecords] = useState<MatchedRecord[]>([])
  const [unmatchedRecords, setUnmatchedRecords] = useState<MatchedRecord[]>([])
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null)
  const [matching, setMatching] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [prabhagNumber, setPrabhagNumber] = useState('')
  const [tempExcelPath, setTempExcelPath] = useState<string>('')
  const [matchCachePath, setMatchCachePath] = useState<string>('')
  const [skipPagesStart, setSkipPagesStart] = useState<number>(0)
  const [skipPagesEnd, setSkipPagesEnd] = useState<number>(0)
  const [concurrency, setConcurrency] = useState<number>(5)

  const headerInfo = useMemo(() => tryExtractHeaderInfo(raw), [raw])
  const hintedAddress = useMemo(() => {
    if (!raw) return ""
    if (headerInfo) {
      return headerInfo.booth || headerInfo.raw || ""
    }
    return tryExtractAddress(raw) || ""
  }, [raw, headerInfo])
  const serialGapInfo = useMemo(() => {
    if (!voters.length) return null

    const numericSerials = voters
      .map((voter) => {
        if (!voter.serial) return null
        const match = voter.serial.toString().match(/\d+/g)
        if (!match) return null
        const parsed = parseInt(match.join(""), 10)
        return isNaN(parsed) ? null : parsed
      })
      .filter((value): value is number => typeof value === "number")

    if (!numericSerials.length) return null

    // Find duplicates
    const serialCounts = new Map<number, number>()
    numericSerials.forEach(serial => {
      serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1)
    })
    
    const duplicates = Array.from(serialCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([serial, count]) => ({ serial, count }))
      .sort((a, b) => a.serial - b.serial)

    const uniqueSorted = Array.from(new Set(numericSerials)).sort((a, b) => a - b)
    if (uniqueSorted.length < 2) {
      return {
        min: uniqueSorted[0],
        max: uniqueSorted[0],
        totalSerials: numericSerials.length,
        uniqueSerials: uniqueSorted.length,
        missingNumbers: [],
        missingCount: 0,
        duplicates: duplicates,
        duplicateCount: duplicates.length,
      }
    }

    const missingNumbers: number[] = []

    for (let i = 0; i < uniqueSorted.length - 1; i++) {
      const current = uniqueSorted[i]
      const next = uniqueSorted[i + 1]

      if (next - current > 1) {
        for (let candidate = current + 1; candidate < next; candidate++) {
          missingNumbers.push(candidate)
        }
      }
    }

    return {
      min: uniqueSorted[0],
      max: uniqueSorted[uniqueSorted.length - 1],
      totalSerials: numericSerials.length,
      uniqueSerials: uniqueSorted.length,
      missingNumbers,
      missingCount: missingNumbers.length,
      duplicates: duplicates,
      duplicateCount: duplicates.length,
    }
  }, [voters])

  // Fetch database tables on component mount
  useEffect(() => {
    fetchTables()
  }, [])

  // Fetch table columns when table is selected
  useEffect(() => {
    if (selectedTable) {
      fetchTableColumns(selectedTable)
    }
  }, [selectedTable])

  const fetchTables = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tables`)
      const contentType = response.headers.get('content-type') || ''
      const body = await response.text()

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`)
      }

      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Unexpected response type ${contentType}: ${body.slice(0, 200)}`)
      }

      let data
      try {
        data = body ? JSON.parse(body) : null
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${(parseError as Error).message}. Body: ${body.slice(0, 200)}`)
      }

      if (Array.isArray(data)) {
        setTables(data.filter(Boolean))
      } else if (data && Array.isArray(data.tables)) {
        setTables(data.tables.filter(Boolean))
      } else {
        setTables([])
      }
    } catch (error) {
      setTables([])
    }
  }

  const fetchTableColumns = async (tableName: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tables/${tableName}/columns`)
      const contentType = response.headers.get('content-type') || ''
      const body = await response.text()

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`)
      }

      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Unexpected response type ${contentType}: ${body.slice(0, 200)}`)
      }

      let data
      try {
        data = body ? JSON.parse(body) : null
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${(parseError as Error).message}. Body: ${body.slice(0, 200)}`)
      }

      setTableColumns(data)
    } catch (error) {
      // Error handled silently
    }
  }

  async function handleFormat() {
    const addr = address.trim() || hintedAddress || ""
    const parsedVoters = parseVoters(raw, addr)
    setVoters(parsedVoters)
    
    // Automatically translate to English
    if (parsedVoters.length > 0) {
      await translateVotersToEnglish(parsedVoters)
    }
  }

  async function handleCopy() {
    if (!voters.length) return
    try {
      const addr = address.trim() || hintedAddress || ""
      const lines = parseVotersToLines(raw, addr)
      await navigator.clipboard.writeText(lines.join("\n"))
    } catch {
      // noop
    }
  }

  function handleClear() {
    setRaw("")
    setVoters([])
    setAddress("")
    setRawAzureText("")
    setRawApiResponses("")
    setIsApiDebugOpen(false)
    setMatchedRecords([])
    setUnmatchedRecords([])
    setMatchStats(null)
    setSelectedTable('')
    setPrabhagNumber('')
    setTempExcelPath('')
    setSkipPagesStart(0)
    setSkipPagesEnd(0)
  }

  function handleExportExcel() {
    const addr = (address.trim() || hintedAddress || "").trim()
    if (!voters.length) return

    // Count duplicates for highlighting
    const serialCounts = new Map<string, number>();
    voters.forEach(v => {
      const serial = v.serial || '';
      serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1);
    });
    const duplicates = Array.from(serialCounts.entries()).filter(([_, count]) => count > 1);

    // Custom field names as requested
    const header = [
      "SERIAL_NO",
      "DUPLICATE",  // Indicator column for duplicates
      "EPIC_NO",
      "PRABHAG",
      "PRABHAG_EN",
      "YADI_BHAG",
      "YADI_BHAG_EN",
      "MATDAR_KENDRA",
      "MATDAR_KENDRA_EN",
      "BOOTH_ADDRESS",
      "BOOTH_ADDRESS_EN",
      "PART_NUMBER",
      "NAME_EN",
      "NAME_V1",
      "RLN_TYPE",
      "RLN_NAME_EN",
      "RLN_NAME_V1",
      "C_HOUSE_NO",
      "AGE",
      "GENDER",
      "GAN",
      "GAN_EN"
    ]
    // Create a set of duplicate serials for quick lookup
    const duplicateSerialsSet = new Set(duplicates.map(([serial]) => serial));
    
    // Include ALL voters - no filtering or deduplication
    // Map each voter to a row - this preserves ALL duplicates
    const rows = voters.map((v) => {
      const isDuplicate = duplicateSerialsSet.has(v.serial || '');
      return [
        v.serial || '',                                          // SERIAL_NO = Serial Number (preserve all duplicates)
        isDuplicate ? 'DUPLICATE' : '',                          // DUPLICATE = Indicator column
        v.epic || '',                                            // EPIC_NO = EPIC ID
        v.prabhag || '',
        v.prabhagEnglish || '',
        v.yadi || '',
        v.yadiEnglish || '',
        v.matdarKendra || '',
        v.matdarKendraEnglish || '',
        v.booth || addr,
        v.boothEnglish || v.addressEnglish || '',
        v.part,                                                    // PART_NUMBER = Part Number
        v.nameEnglish || '',                                      // NAME_EN = Name (English)
        v.name || '',                                             // NAME_V1 = Name (Marathi)
        '',                                                        // RLN_TYPE (empty for now)
        v.relEnglish || '',                                       // RLN_NAME_EN = Father/Husband (English)
        v.rel || '',                                              // RLN_NAME_V1 = Father/Husband (Marathi)
        v.house,                                                   // C_HOUSE_NO = House Number
        v.age,                                                     // AGE = Age
        v.genderEnglish || v.genderMarathi || '',                 // GENDER = Gender
        v.gan || '',                                              // GAN = निवाचन गण
        v.ganEnglish || ''
      ];
    });

    const ws = utils.aoa_to_sheet([header, ...rows])
    
    // Apply red background color to duplicate rows
    if (duplicateSerialsSet.size > 0) {
      try {
        const range = utils.decode_range(ws['!ref'] || 'A1');
        
        for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
          const row = rows[rowIndex - 1];
          const serial = row[0] || '';
          
          if (duplicateSerialsSet.has(serial)) {
            for (let colIndex = 0; colIndex <= range.e.c; colIndex++) {
              const cellAddress = utils.encode_cell({ r: rowIndex, c: colIndex });
              if (!ws[cellAddress]) {
                ws[cellAddress] = { t: 's', v: '' };
              }
              ws[cellAddress].s = {
                fill: {
                  fgColor: { rgb: 'FFFF0000' }
                },
                font: {
                  color: { rgb: 'FFFFFFFF' },
                  bold: true
                }
              };
            }
          }
        }
      } catch (error) {
        // Silently fail if styling is not supported
      }
    }
    
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, "Voters")
    writeFile(wb, "voters_with_translations.xlsx")
  }


  function handleDownloadRawText() {
    if (!rawAzureText) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadRawText(rawAzureText, `azure-ocr-raw-${timestamp}.txt`)
  }

  function handleDownloadRawApiResponses() {
    if (!rawApiResponses) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const blob = new Blob([rawApiResponses], { type: "application/json;charset=utf-8;" })
    const link = document.createElement("a")
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `azure-api-responses-${timestamp}.json`)
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setProcessingStatus({
        status: 'error',
        message: 'Please upload a PDF file',
        progress: 0
      })
      return
    }

    try {
      setProcessingStatus({
        status: 'uploading',
        message: 'Uploading PDF...',
        progress: 10
      })

      setProcessingStatus({
        status: 'converting',
        message: 'Converting PDF to images...',
        progress: 20
      })

      let images = await convertPdfToImages(file)
      const totalPages = images.length
      
      // Apply page skipping
      const startIndex = Math.max(0, skipPagesStart)
      const endIndex = Math.max(0, totalPages - skipPagesEnd)
      
      if (startIndex > 0 || skipPagesEnd > 0) {
        images = images.slice(startIndex, endIndex)
        setProcessingStatus({
          status: 'processing',
          message: `Skipped ${skipPagesStart} pages from start and ${skipPagesEnd} from end. Processing ${images.length} of ${totalPages} pages...`,
          progress: 25
        })
      }
      
      setProcessingStatus({
        status: 'processing',
        message: `Processing ${images.length} pages with Azure Vision OCR...`,
        progress: 30
      })

      const ocrResults = await processImages(images, (status) => {
        setProcessingStatus(status)
      }, concurrency)

      const combinedText = combineOCRResults(ocrResults)
      const extractedHeader = tryExtractHeaderInfo(combinedText)
      const rawAzureText = getRawOCRResults(ocrResults)
      const rawApiResponses = getRawApiResponses(ocrResults)
      setRaw(combinedText)
      setRawAzureText(rawAzureText)
      setRawApiResponses(rawApiResponses)

      // Auto-format the extracted text
      const addr = extractedHeader?.booth || extractedHeader?.raw || tryExtractAddress(combinedText) || ""
      setAddress(addr)
      const parsedVoters = parseVoters(combinedText, addr)
      setVoters(parsedVoters)

      setProcessingStatus({
        status: 'processing',
        message: `Translating ${parsedVoters.length} voters to English...`,
        progress: 80
      })

      // Automatically translate to English
      await translateVotersToEnglish(parsedVoters)

      setProcessingStatus({
        status: 'completed',
        message: `Successfully processed ${images.length} pages, extracted ${parsedVoters.length} voters, and translated to English`,
        progress: 100
      })

    } catch (error) {
      
      // Provide helpful error message and suggest manual input
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setProcessingStatus({
        status: 'error',
        message: `PDF processing failed: ${errorMessage}. Please try uploading the PDF again or use manual text input below.`,
        progress: 0
      })
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  async function translateVotersToEnglish(votersToTranslate: typeof voters) {
    if (!votersToTranslate.length) return

    setIsTranslating(true)
    setTranslationProgress(0)

    try {
      // Collect all texts to translate in batches
      const allTexts: string[] = []
      const voterIndices: number[] = []
      const fieldTypes: string[] = []
      
      votersToTranslate.forEach((voter, index) => {
        if (voter.name) {
          allTexts.push(voter.name)
          voterIndices.push(index)
          fieldTypes.push('name')
        }
        if (voter.rel) {
          allTexts.push(voter.rel)
          voterIndices.push(index)
          fieldTypes.push('rel')
        }
        if (voter.address) {
          allTexts.push(voter.address)
          voterIndices.push(index)
          fieldTypes.push('address')
        }
        if (voter.yadi) {
          allTexts.push(voter.yadi)
          voterIndices.push(index)
          fieldTypes.push('yadi')
        }
        if (voter.booth) {
          allTexts.push(voter.booth)
          voterIndices.push(index)
          fieldTypes.push('booth')
        }
        if (voter.prabhag) {
          allTexts.push(voter.prabhag)
          voterIndices.push(index)
          fieldTypes.push('prabhag')
        }
        if (voter.matdarKendra) {
          allTexts.push(voter.matdarKendra)
          voterIndices.push(index)
          fieldTypes.push('matdar')
        }
        if (voter.gan) {
          allTexts.push(voter.gan)
          voterIndices.push(index)
          fieldTypes.push('gan')
        }
      })

      // Batch translate all texts at once
      const translatedTexts = await translateBatch(allTexts)
      
      // Apply translations to voters
      const translatedVoters = votersToTranslate.map(voter => ({ ...voter }))
      
      translatedTexts.forEach((translatedText, textIndex) => {
        const voterIndex = voterIndices[textIndex]
        const fieldType = fieldTypes[textIndex]
        
        if (fieldType === 'name') {
          translatedVoters[voterIndex].nameEnglish = translatedText
        } else if (fieldType === 'rel') {
          translatedVoters[voterIndex].relEnglish = translatedText
        } else if (fieldType === 'address') {
          translatedVoters[voterIndex].addressEnglish = translatedText
        } else if (fieldType === 'yadi') {
          translatedVoters[voterIndex].yadiEnglish = translatedText
        } else if (fieldType === 'booth') {
          translatedVoters[voterIndex].boothEnglish = translatedText
          if (!translatedVoters[voterIndex].addressEnglish) {
            translatedVoters[voterIndex].addressEnglish = translatedText
          }
        } else if (fieldType === 'prabhag') {
          translatedVoters[voterIndex].prabhagEnglish = translatedText
        } else if (fieldType === 'matdar') {
          translatedVoters[voterIndex].matdarKendraEnglish = translatedText
        } else if (fieldType === 'gan') {
          translatedVoters[voterIndex].ganEnglish = translatedText
        }
      })

      setVoters(translatedVoters)
      setIsTranslating(false)
      setTranslationProgress(100)

    } catch (error) {
      setIsTranslating(false)
      setTranslationProgress(0)
    }
  }

  async function uploadExtractedDataToServer() {
    const addr = (address.trim() || hintedAddress || "").trim()
    if (!voters.length) return null

    try {
      // Create Excel data with extracted and translated info
      const header = [
        "SERIAL_NO",
        "EPIC_NO",
        "PRABHAG",
        "YADI_BHAG",
        "MATDAR_KENDRA",
        "BOOTH_ADDRESS",
        "BOOTH_ADDRESS_EN",
        "PART_NUMBER",
        "NAME_EN",
        "NAME_V1",
        "RLN_TYPE",
        "RLN_NAME_EN",
        "RLN_NAME_V1",
        "C_HOUSE_NO",
        "AGE",
        "GENDER",
        "GAN"
      ]
      // Include ALL voters - no filtering or deduplication
      const rows = voters.map((v) => [
        v.serial || '',
        v.epic || '',
        v.prabhag || '',
        v.yadi || '',
        v.matdarKendra || '',
        v.booth || addr,
        v.addressEnglish || '',
        v.part || '',
        v.nameEnglish || '',
        v.name || '',
        '',
        v.relEnglish || '',
        v.rel || '',
        v.house || '',
        v.age || '',
        v.genderEnglish || v.genderMarathi || '',
        v.gan || ''
      ]);

      const ws = utils.aoa_to_sheet([header, ...rows])
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, "Voters")
      
      // Convert to blob and upload to server
      const wbout = write(wb, { type: 'array', bookType: 'xlsx' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      
      const formData = new FormData()
      formData.append('file', blob, 'extracted_voters.xlsx')
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      setTempExcelPath(data.filepath)
      return data.filepath
    } catch (error) {
      alert('Failed to prepare data for matching. Please try again.')
      return null
    }
  }

  async function handleMatchData() {
    if (!voters.length) {
      alert('No voter data to match')
      return
    }
    
    if (!selectedTable) {
      alert('Please select a database table')
      return
    }

    setMatching(true)
    setProcessingStatus({
      status: 'processing',
      message: 'Uploading extracted data to server...',
      progress: 85
    })

    try {
      // Upload extracted data if not already uploaded
      let filepath = tempExcelPath
      if (!filepath) {
        filepath = await uploadExtractedDataToServer()
        if (!filepath) {
          setMatching(false)
          return
        }
      }

      setProcessingStatus({
        status: 'processing',
        message: 'Matching with database records...',
        progress: 90
      })

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/match-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: filepath,
          tableName: selectedTable,
          epicColumn: 'EPIC_NO',
          selectedColumns: [],
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      setMatchedRecords(data.matched)
      setUnmatchedRecords(data.unmatched)
      setMatchStats(data.stats)
      
      // Store cache file path for optimized export
      if (data.cacheFilePath) {
        setMatchCachePath(data.cacheFilePath)
      }

      setProcessingStatus({
        status: 'completed',
        message: `Successfully matched ${data.stats.matched} of ${data.stats.total} records (${data.stats.matchRate}% match rate)`,
        progress: 100
      })

      if (data.stats) {
        const matchRate = parseFloat(data.stats.matchRate)
        if (matchRate < 50) {
          alert(`⚠️ Low match rate: ${data.stats.matchRate}%. Please verify your data format.`)
        }
      }
      
    } catch (error) {
      setProcessingStatus({
        status: 'error',
        message: `Error matching data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0
      })
      alert(`Error matching data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setMatching(false)
    }
  }

  async function handleExportFinal() {
    if (!matchStats) {
      alert('Please match data first')
      return
    }

    setExporting(true)
    try {
      const prabhagValue = prabhagNumber.trim()
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: tempExcelPath,
          tableName: selectedTable,
          epicColumn: 'EPIC_NO',
          prabhagNumber: prabhagValue || '',
          filename: `prabhag-${prabhagValue || 'auto'}-matched-data-${new Date().toISOString().split('T')[0]}.xlsx`,
          cacheFilePath: matchCachePath, // Pass cache path for optimized export
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `prabhag-${prabhagValue || 'auto'}-matched-data-${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        throw new Error(`Export failed: ${response.status}`)
      }
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-pretty">Upload PDF Document</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a PDF file to automatically extract voter data using Azure Vision OCR
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Page Skipping Options and Performance Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="skip-start">Skip Pages from Start</Label>
                <Input
                  id="skip-start"
                  type="number"
                  min="0"
                  value={skipPagesStart}
                  onChange={(e) => setSkipPagesStart(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Number of pages to skip from the beginning
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skip-end">Skip Pages from End</Label>
                <Input
                  id="skip-end"
                  type="number"
                  min="0"
                  value={skipPagesEnd}
                  onChange={(e) => setSkipPagesEnd(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Number of pages to skip from the end
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="concurrency">Processing Speed ⚡</Label>
                <Select 
                  value={concurrency.toString()} 
                  onValueChange={(value) => setConcurrency(parseInt(value))}
                >
                  <SelectTrigger id="concurrency">
                    <SelectValue placeholder="Select speed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Slow (1 page at a time)</SelectItem>
                    <SelectItem value="3">Normal (3 pages)</SelectItem>
                    <SelectItem value="5">Fast (5 pages) ⭐</SelectItem>
                    <SelectItem value="8">Very Fast (8 pages)</SelectItem>
                    <SelectItem value="10">Maximum (10 pages)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Higher = faster but may hit API rate limits
                </p>
              </div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button onClick={handleUploadClick} className="w-full">
              Upload PDF File
            </Button>
            
            {processingStatus.status !== 'idle' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{processingStatus.message}</span>
                  <span>{Math.round(processingStatus.progress)}%</span>
                </div>
                <Progress value={processingStatus.progress} className="w-full" />
                {processingStatus.status === 'error' && (
                  <Alert variant="destructive">
                    <AlertDescription>{processingStatus.message}</AlertDescription>
                  </Alert>
                )}
                {processingStatus.status === 'completed' && (
                  <Alert>
                    <AlertDescription className="text-green-600">
                      {processingStatus.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Summary and Workflow */}
      {voters.length > 0 && (
        <>
          {/* Step 1: Extraction Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-pretty">Step 1: Data Extraction Summary</CardTitle>
              <CardDescription>
                OCR extraction and translation completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Summary Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Total Voters</div>
                    <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{voters.length}</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Translated Records</div>
                    <div className="text-3xl font-bold text-green-700 dark:text-green-400">
                      {voters.filter(v => v.nameEnglish || v.relEnglish).length}
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <div className="text-sm text-muted-foreground">Completion Rate</div>
                    <div className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                      {voters.length > 0 ? Math.round((voters.filter(v => v.nameEnglish).length / voters.length) * 100) : 0}%
                    </div>
                  </div>
                </div>

                {serialGapInfo && (
                  <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Serial Number Integrity</p>
                        <p className="text-xs text-muted-foreground">
                          Range {serialGapInfo.min} - {serialGapInfo.max} ({serialGapInfo.totalSerials} total, {serialGapInfo.uniqueSerials} unique)
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {serialGapInfo.missingCount > 0 && (
                          <Badge variant="destructive">
                            {serialGapInfo.missingCount} gap{serialGapInfo.missingCount > 1 ? "s" : ""} detected
                          </Badge>
                        )}
                        {serialGapInfo.duplicateCount > 0 && (
                          <Badge variant="destructive">
                            {serialGapInfo.duplicateCount} duplicate{serialGapInfo.duplicateCount > 1 ? "s" : ""} found
                          </Badge>
                        )}
                        {serialGapInfo.missingCount === 0 && serialGapInfo.duplicateCount === 0 && (
                          <Badge variant="secondary" className="text-green-700 dark:text-green-300">
                            No issues found
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {serialGapInfo.missingCount > 0 && (
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-muted-foreground">
                          Missing SERIAL_NO values ({serialGapInfo.missingCount} total):
                        </p>
                        <div className="max-h-48 overflow-y-auto p-2 bg-background rounded border">
                          <p className="font-mono text-xs break-words">
                            {serialGapInfo.missingNumbers.join(", ")}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {serialGapInfo.duplicateCount > 0 && (
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-muted-foreground">
                          Duplicate SERIAL_NO values ({serialGapInfo.duplicateCount} found):
                        </p>
                        <div className="max-h-48 overflow-y-auto p-2 bg-background rounded border">
                          <p className="font-mono text-xs break-words">
                            {serialGapInfo.duplicates.map(dup => `${dup.serial} (${dup.count}x)`).join(", ")}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {serialGapInfo.missingCount === 0 && serialGapInfo.duplicateCount === 0 && (
                      <p className="text-sm text-green-700 dark:text-green-400">
                        SERIAL_NO column contains a continuous sequence with no missing values or duplicates.
                      </p>
                    )}
                  </div>
                )}

                {/* Translation Progress */}
                {isTranslating && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Translating to English...</span>
                      <span>{Math.round(translationProgress)}%</span>
                    </div>
                    <Progress value={translationProgress} className="w-full" />
                  </div>
                )}

                {/* Export Extracted Data Button */}
                {!isTranslating && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-3">
                      <Button 
                        onClick={handleExportExcel} 
                        disabled={voters.length === 0}
                        size="lg"
                        variant="outline"
                        className="border-green-600 text-green-600 hover:bg-green-50"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export Extracted Data to Excel
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Export the extracted and translated data without database matching
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Database Matching */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Step 2: Database Matching
              </CardTitle>
              <CardDescription>
                Match extracted voter data with database records using EPIC numbers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isTranslating && voters.filter(v => v.nameEnglish).length === 0 ? (
                <Alert>
                  <AlertDescription>
                    ⏳ Waiting for translation to complete before matching...
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div>
                    <Label>Select Database Table</Label>
                    <Select value={selectedTable} onValueChange={setSelectedTable}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a database table" />
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
                    <Alert>
                      <Database className="h-4 w-4" />
                      <AlertDescription>
                        Selected: <strong>{selectedTable}</strong> ({tableColumns.length} columns)
                        <br />
                        Ready to match {voters.length} voter records
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <Button 
                      onClick={handleMatchData} 
                      disabled={!selectedTable || matching || voters.length === 0}
                      size="lg"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {matching ? 'Matching Data...' : `Match ${voters.length} Records with Database`}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Match Results and Export */}
          {matchStats && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Step 3: Matching Results</CardTitle>
                  <CardDescription>
                    Data matching completed successfully
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg border">
                      <div className="text-3xl font-bold text-blue-600 mb-1">{matchStats.total.toLocaleString()}</div>
                      <div className="text-sm text-blue-800 font-medium">Total Records</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg border">
                      <div className="text-3xl font-bold text-green-600 mb-1">{matchStats.matched.toLocaleString()}</div>
                      <div className="text-sm text-green-800 font-medium">Matched</div>
                      <div className="text-xs text-green-600 mt-1">
                        {matchStats.total > 0 ? ((matchStats.matched / matchStats.total) * 100).toFixed(1) : '0.0'}%
                      </div>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg border">
                      <div className="text-3xl font-bold text-red-600 mb-1">{matchStats.unmatched.toLocaleString()}</div>
                      <div className="text-sm text-red-800 font-medium">Unmatched</div>
                      <div className="text-xs text-red-600 mt-1">
                        {matchStats.total > 0 ? ((matchStats.unmatched / matchStats.total) * 100).toFixed(1) : '0.0'}%
                      </div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg border">
                      <div className="text-3xl font-bold text-purple-600 mb-1">
                        {matchStats.matchRate && !isNaN(parseFloat(matchStats.matchRate)) ? matchStats.matchRate : '0.0'}%
                      </div>
                      <div className="text-sm text-purple-800 font-medium">Success Rate</div>
                    </div>
                  </div>

                  <Progress 
                    value={matchStats.matchRate && !isNaN(parseFloat(matchStats.matchRate)) ? parseFloat(matchStats.matchRate) : 0} 
                    className="w-full" 
                  />

                  {matchStats.total > 0 && (
                    <>
                      {/* Prabhag Number Input */}
                      <div className="pt-4 border-t">
                        <h4 className="text-lg font-semibold mb-3">Step 4: Final Export Configuration</h4>
                        <Label htmlFor="prabhag-number">Prabhag Number (optional)</Label>
                        <Input
                          id="prabhag-number"
                          type="number"
                          placeholder="Enter Prabhag number (e.g., 1, 2, 3...)"
                          value={prabhagNumber}
                          onChange={(e) => setPrabhagNumber(e.target.value)}
                          min="1"
                          className="max-w-xs mt-2"
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          Leave blank to use the Prabhag value detected from the PDF, or override it here.
                        </p>
                      </div>

                      {/* Export Button */}
                      <div className="flex items-center gap-3 pt-4 border-t">
                        <Button 
                          onClick={handleExportFinal} 
                          disabled={exporting}
                          size="lg"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {exporting ? 'Exporting...' : 'Export Final Excel'}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          onClick={handleClear}
                          size="lg"
                        >
                          Clear All
                        </Button>
                      </div>
                    </>
                  )}
                  
                  {matchStats.total === 0 && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        No records to export. Please ensure you have uploaded a PDF and extracted voter data first.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Data Preview */}
              {matchStats.total > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Data Preview</CardTitle>
                    <CardDescription>
                      Preview of matched and unmatched records
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="matched" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="matched" className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          Matched ({matchedRecords.length.toLocaleString()})
                        </TabsTrigger>
                        <TabsTrigger value="unmatched" className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-600" />
                          Unmatched ({unmatchedRecords.length.toLocaleString()})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="matched" className="space-y-4">
                        <div className="rounded-md border max-h-96 overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>EPIC No</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Age</TableHead>
                                <TableHead>Gender</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {matchedRecords.slice(0, 50).map((record) => (
                                <TableRow key={record.index}>
                                  <TableCell className="font-medium text-xs">{record.index}</TableCell>
                                  <TableCell className="font-mono text-sm">{record.epic_no}</TableCell>
                                  <TableCell className="text-sm">{record.file_data?.NAME_EN || record.db_data?.FM_NAME_EN || '-'}</TableCell>
                                  <TableCell className="text-sm">{record.file_data?.AGE || record.db_data?.AGE || '-'}</TableCell>
                                  <TableCell className="text-sm">{record.file_data?.GENDER || record.db_data?.GENDER || '-'}</TableCell>
                                  <TableCell>
                                    <Badge variant="default" className="bg-green-100 text-green-800 text-xs">
                                      {record.db_data ? 'DB Match' : 'File Only'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Showing first 50 of {matchedRecords.length.toLocaleString()} matched records
                        </div>
                      </TabsContent>

                      <TabsContent value="unmatched" className="space-y-4">
                        <div className="rounded-md border max-h-96 overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-background">
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>EPIC No</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Age</TableHead>
                                <TableHead>Issue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {unmatchedRecords.slice(0, 50).map((record) => (
                                <TableRow key={record.index}>
                                  <TableCell className="font-medium text-xs">{record.index}</TableCell>
                                  <TableCell className="font-mono text-sm">{record.epic_no || 'N/A'}</TableCell>
                                  <TableCell className="text-sm">{record.file_data?.NAME_EN || '-'}</TableCell>
                                  <TableCell className="text-sm">{record.file_data?.AGE || '-'}</TableCell>
                                  <TableCell>
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
                        <div className="text-sm text-muted-foreground">
                          Showing first 50 of {unmatchedRecords.length.toLocaleString()} unmatched records
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
