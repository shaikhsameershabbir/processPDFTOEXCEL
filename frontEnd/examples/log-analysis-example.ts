// Example script showing how to use the log parser utility
// This demonstrates how to analyze parsing logs and generate reports

import { ParsingLogParser, parseLogFile, generateLogReport, exportLogToCSV } from '../lib/log-parser'

// Example usage with a sample log
const sampleLog = `
=== EXTRACTING NAMES ===
Content preview: मतदाराचे पूर्ण: राम शर्मा पतीचे नाव: शिव शर्मा घर क्रमांक: १२३...
Found labeled name: "राम शर्मा" -> "राम शर्मा"
Found 1 labeled names
=== END NAME EXTRACTION ===

=== Row with 2 headers ===
Headers: [1 ABC123456 1/1/1, 2 DEF789012 1/1/1]
Names found: 2 ["राम शर्मा", "सीता देवी"]
Houses found: 2 ["123", "124"]
Ages/Genders found: 2 [{"age": "35", "gender": "पु (Male)"}, {"age": "30", "gender": "स्त्री (Female)"}]

--- Processing voter 1 (Serial: 1) ---
Final name for voter 1: "राम शर्मा"
Voter 1: राम शर्मा

--- Processing voter 2 (Serial: 2) ---
Final name for voter 2: "सीता देवी"
Voter 2: सीता देवी
`

// Method 1: Using the class directly
console.log('=== Using ParsingLogParser Class ===')
const parser = new ParsingLogParser(sampleLog)
const analysis = parser.getAnalysis()
console.log('Analysis:', analysis)

// Method 2: Using utility functions
console.log('\n=== Using Utility Functions ===')
const quickAnalysis = parseLogFile(sampleLog)
console.log('Quick Analysis:', quickAnalysis)

// Generate a detailed report
console.log('\n=== Generated Report ===')
const report = generateLogReport(sampleLog)
console.log(report)

// Export to CSV
console.log('\n=== CSV Export ===')
const csv = exportLogToCSV(sampleLog)
console.log(csv)

// Example of analyzing a real log file
export function analyzeLogFile(filePath: string): void {
  // In a real scenario, you would read the file
  // const fs = require('fs')
  // const logContent = fs.readFileSync(filePath, 'utf8')
  
  console.log(`Analyzing log file: ${filePath}`)
  
  // Parse the log
  const analysis = parseLogFile(sampleLog) // Replace with actual file content
  
  // Generate report
  const report = generateLogReport(sampleLog)
  
  // Save report to file
  // fs.writeFileSync(`${filePath}.analysis.md`, report)
  
  // Export CSV
  const csv = exportLogToCSV(sampleLog)
  // fs.writeFileSync(`${filePath}.analysis.csv`, csv)
  
  console.log('Analysis complete!')
  console.log(`- Total voters: ${analysis.totalVoters}`)
  console.log(`- Names success rate: ${((analysis.extractionStats.names.successful / analysis.totalVoters) * 100).toFixed(1)}%`)
  console.log(`- Houses success rate: ${((analysis.extractionStats.houses.successful / analysis.totalVoters) * 100).toFixed(1)}%`)
}

// Example of batch processing multiple log files
export function batchAnalyzeLogs(logFiles: string[]): void {
  console.log(`Batch analyzing ${logFiles.length} log files...`)
  
  const results = logFiles.map(file => {
    // In real scenario, read file content
    const analysis = parseLogFile(sampleLog)
    return {
      file,
      analysis,
      report: generateLogReport(sampleLog)
    }
  })
  
  // Generate summary
  const totalVoters = results.reduce((sum, r) => sum + r.analysis.totalVoters, 0)
  const avgNameSuccess = results.reduce((sum, r) => {
    const rate = (r.analysis.extractionStats.names.successful / r.analysis.totalVoters) * 100
    return sum + (isNaN(rate) ? 0 : rate)
  }, 0) / results.length
  
  console.log(`\nBatch Analysis Summary:`)
  console.log(`- Total files processed: ${results.length}`)
  console.log(`- Total voters across all files: ${totalVoters}`)
  console.log(`- Average name extraction success rate: ${avgNameSuccess.toFixed(1)}%`)
}

// Run the example
if (require.main === module) {
  console.log('Running log analysis example...\n')
  
  // Analyze the sample log
  analyzeLogFile('sample-log.txt')
  
  console.log('\n=== Batch Analysis Example ===')
  batchAnalyzeLogs(['log1.txt', 'log2.txt', 'log3.txt'])
}
