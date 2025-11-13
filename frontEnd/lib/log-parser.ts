// Log Parser Utility for OCR Parsing Logs
// This utility helps analyze and parse console logs from the OCR parsing process

export interface ParsingLogAnalysis {
  totalRows: number
  totalVoters: number
  extractionStats: {
    names: {
      total: number
      successful: number
      missing: number
      strategySuccess: { [strategy: string]: number }
    }
    houses: {
      total: number
      successful: number
      missing: number
    }
    ages: {
      total: number
      successful: number
      missing: number
    }
    genders: {
      total: number
      successful: number
      missing: number
    }
  }
  commonIssues: string[]
  processingTime?: number
}

export interface LogEntry {
  timestamp?: string
  level: 'info' | 'debug' | 'error'
  message: string
  data?: any
}

export class ParsingLogParser {
  private logEntries: LogEntry[] = []
  private currentRow: any = null
  private analysis: ParsingLogAnalysis = {
    totalRows: 0,
    totalVoters: 0,
    extractionStats: {
      names: { total: 0, successful: 0, missing: 0, strategySuccess: {} },
      houses: { total: 0, successful: 0, missing: 0 },
      ages: { total: 0, successful: 0, missing: 0 },
      genders: { total: 0, successful: 0, missing: 0 }
    },
    commonIssues: []
  }

  constructor(logText: string) {
    this.parseLogText(logText)
    this.analyzeLogs()
  }

  private parseLogText(logText: string): void {
    const lines = logText.split('\n')
    
    for (const line of lines) {
      if (line.trim()) {
        this.parseLogLine(line.trim())
      }
    }
  }

  private parseLogLine(line: string): void {
    // Parse different types of log entries
    if (line.includes('=== EXTRACTING NAMES ===')) {
      this.logEntries.push({
        level: 'info',
        message: 'Starting name extraction',
        data: { phase: 'name_extraction' }
      })
    } else if (line.includes('=== Row with')) {
      const match = line.match(/=== Row with (\d+) headers ===/)
      if (match) {
        this.currentRow = { headers: parseInt(match[1]) }
        this.analysis.totalRows++
      }
    } else if (line.includes('Found labeled name:')) {
      this.parseNameExtraction(line, 'labeled')
    } else if (line.includes('Found unlabeled name:')) {
      this.parseNameExtraction(line, 'unlabeled')
    } else if (line.includes('Found permissive name:')) {
      this.parseNameExtraction(line, 'permissive')
    } else if (line.includes('Found aggressive name:')) {
      this.parseNameExtraction(line, 'aggressive')
    } else if (line.includes('Found segment name:')) {
      this.parseNameExtraction(line, 'segment')
    } else if (line.includes('Found truncated name:')) {
      this.parseNameExtraction(line, 'truncated')
    } else if (line.includes('Found desperate name:')) {
      this.parseNameExtraction(line, 'desperate')
    } else if (line.includes('Found') && line.includes('houses:')) {
      this.parseHouseExtraction(line)
    } else if (line.includes('Found age/gender:')) {
      this.parseAgeGenderExtraction(line)
    } else if (line.includes('Voter') && line.includes(':')) {
      this.parseVoterResult(line)
    } else if (line.includes('No') && line.includes('found')) {
      this.parseMissingData(line)
    }
  }

  private parseNameExtraction(line: string, strategy: string): void {
    const match = line.match(/Found \w+ name: "([^"]+)" -> "([^"]+)"/)
    if (match) {
      this.analysis.extractionStats.names.total++
      this.analysis.extractionStats.names.successful++
      
      if (!this.analysis.extractionStats.names.strategySuccess[strategy]) {
        this.analysis.extractionStats.names.strategySuccess[strategy] = 0
      }
      this.analysis.extractionStats.names.strategySuccess[strategy]++
    }
  }

  private parseHouseExtraction(line: string): void {
    const match = line.match(/Found (\d+) houses:/)
    if (match) {
      const count = parseInt(match[1])
      this.analysis.extractionStats.houses.total += count
      this.analysis.extractionStats.houses.successful += count
    }
  }

  private parseAgeGenderExtraction(line: string): void {
    const match = line.match(/Found age\/gender: age="([^"]+)"/)
    if (match) {
      this.analysis.extractionStats.ages.total++
      this.analysis.extractionStats.ages.successful++
      this.analysis.extractionStats.genders.total++
      this.analysis.extractionStats.genders.successful++
    }
  }

  private parseVoterResult(line: string): void {
    const match = line.match(/Voter (\d+): (.+)/)
    if (match) {
      this.analysis.totalVoters++
      const voterData = match[2]
      
      if (voterData.includes('[MISSING NAME]')) {
        this.analysis.extractionStats.names.missing++
      }
    }
  }

  private parseMissingData(line: string): void {
    if (line.includes('No houses found')) {
      this.analysis.commonIssues.push('Missing house numbers')
    } else if (line.includes('No names found')) {
      this.analysis.commonIssues.push('Missing names')
    } else if (line.includes('No age/gender pairs found')) {
      this.analysis.commonIssues.push('Missing age/gender data')
    }
  }

  private analyzeLogs(): void {
    // Calculate missing counts
    this.analysis.extractionStats.names.missing = 
      this.analysis.totalVoters - this.analysis.extractionStats.names.successful
    
    this.analysis.extractionStats.houses.missing = 
      this.analysis.totalVoters - this.analysis.extractionStats.houses.successful
    
    this.analysis.extractionStats.ages.missing = 
      this.analysis.totalVoters - this.analysis.extractionStats.ages.successful
    
    this.analysis.extractionStats.genders.missing = 
      this.analysis.totalVoters - this.analysis.extractionStats.genders.successful
  }

  public getAnalysis(): ParsingLogAnalysis {
    return this.analysis
  }

  public getLogEntries(): LogEntry[] {
    return this.logEntries
  }

  public generateReport(): string {
    const analysis = this.getAnalysis()
    
    let report = '# Parsing Log Analysis Report\n\n'
    
    report += `## Summary\n`
    report += `- **Total Rows Processed**: ${analysis.totalRows}\n`
    report += `- **Total Voters Extracted**: ${analysis.totalVoters}\n\n`
    
    report += `## Extraction Statistics\n\n`
    
    report += `### Names\n`
    report += `- **Total Expected**: ${analysis.totalVoters}\n`
    report += `- **Successfully Extracted**: ${analysis.extractionStats.names.successful}\n`
    report += `- **Missing**: ${analysis.extractionStats.names.missing}\n`
    report += `- **Success Rate**: ${((analysis.extractionStats.names.successful / analysis.totalVoters) * 100).toFixed(1)}%\n\n`
    
    report += `### Houses\n`
    report += `- **Total Expected**: ${analysis.totalVoters}\n`
    report += `- **Successfully Extracted**: ${analysis.extractionStats.houses.successful}\n`
    report += `- **Missing**: ${analysis.extractionStats.houses.missing}\n`
    report += `- **Success Rate**: ${((analysis.extractionStats.houses.successful / analysis.totalVoters) * 100).toFixed(1)}%\n\n`
    
    report += `### Ages\n`
    report += `- **Total Expected**: ${analysis.totalVoters}\n`
    report += `- **Successfully Extracted**: ${analysis.extractionStats.ages.successful}\n`
    report += `- **Missing**: ${analysis.extractionStats.ages.missing}\n`
    report += `- **Success Rate**: ${((analysis.extractionStats.ages.successful / analysis.totalVoters) * 100).toFixed(1)}%\n\n`
    
    report += `### Genders\n`
    report += `- **Total Expected**: ${analysis.totalVoters}\n`
    report += `- **Successfully Extracted**: ${analysis.extractionStats.genders.successful}\n`
    report += `- **Missing**: ${analysis.extractionStats.genders.missing}\n`
    report += `- **Success Rate**: ${((analysis.extractionStats.genders.successful / analysis.totalVoters) * 100).toFixed(1)}%\n\n`
    
    if (Object.keys(analysis.extractionStats.names.strategySuccess).length > 0) {
      report += `## Name Extraction Strategy Success Rates\n`
      for (const [strategy, count] of Object.entries(analysis.extractionStats.names.strategySuccess)) {
        const percentage = ((count / analysis.extractionStats.names.successful) * 100).toFixed(1)
        report += `- **${strategy}**: ${count} (${percentage}%)\n`
      }
      report += '\n'
    }
    
    if (analysis.commonIssues.length > 0) {
      report += `## Common Issues\n`
      for (const issue of analysis.commonIssues) {
        report += `- ${issue}\n`
      }
      report += '\n'
    }
    
    return report
  }

  public exportToCSV(): string {
    const analysis = this.getAnalysis()
    
    let csv = 'Metric,Value\n'
    csv += `Total Rows,${analysis.totalRows}\n`
    csv += `Total Voters,${analysis.totalVoters}\n`
    csv += `Names Successful,${analysis.extractionStats.names.successful}\n`
    csv += `Names Missing,${analysis.extractionStats.names.missing}\n`
    csv += `Houses Successful,${analysis.extractionStats.houses.successful}\n`
    csv += `Houses Missing,${analysis.extractionStats.houses.missing}\n`
    csv += `Ages Successful,${analysis.extractionStats.ages.successful}\n`
    csv += `Ages Missing,${analysis.extractionStats.ages.missing}\n`
    csv += `Genders Successful,${analysis.extractionStats.genders.successful}\n`
    csv += `Genders Missing,${analysis.extractionStats.genders.missing}\n`
    
    return csv
  }
}

// Utility functions for easy usage
export function parseLogFile(logText: string): ParsingLogAnalysis {
  const parser = new ParsingLogParser(logText)
  return parser.getAnalysis()
}

export function generateLogReport(logText: string): string {
  const parser = new ParsingLogParser(logText)
  return parser.generateReport()
}

export function exportLogToCSV(logText: string): string {
  const parser = new ParsingLogParser(logText)
  return parser.exportToCSV()
}
