// Extracts lines as: serial_no epic_id part_no name father_or_husband house_no age gender address

type Voter = {
  serial: string
  epic: string
  part: string
  name: string
  rel: string // father_or_husband
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
  nameEnglish?: string
  relEnglish?: string
  addressEnglish?: string
  yadiEnglish?: string
  boothEnglish?: string
  matdarKendraEnglish?: string
  gan: string // निवाचन गण (Election GAN)
}

type HeaderInfo = {
  raw: string
  prabhag: string
  yadi: string
  booth: string
  matdarKendra: string
}

type VoterRow = {
  headers: Array<{ serial: string; epic: string; part: string }>
  content: string
}

type VoterChunk = {
  startSerial: string
  endSerial: string | null
  content: string
  voterCount: number
  headers: Array<{ serial: string; epic: string; part: string }>
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९"
const ARABIC_DIGITS = "0123456789"

// Convert Devanagari numerals to ASCII digits.
export function toAsciiDigits(input: string): string {
  return input.replace(/[०-९]/g, (d) => {
    const idx = DEVANAGARI_DIGITS.indexOf(d)
    return idx >= 0 ? ARABIC_DIGITS[idx] : d
  })
}

// Convert gender from Marathi to English
function normalizeGender(marathi: string): { marathi: string; english: string } {
  const cleaned = marathi.trim().toLowerCase()
  
  // Handle various OCR variations for female
  if (cleaned === "स्त्री" || cleaned === "महिला" || cleaned === "स्त्रि" || cleaned === "स्त्र") {
    return { marathi: "स्त्री", english: "Female" }
  }
  
  // Handle various OCR variations for male
  if (cleaned === "पु" || cleaned === "पुरुष" || cleaned === "पू" || cleaned === "पुः") {
    return { marathi: "पु", english: "Male" }
  }
  
  // Return original if not recognized
  return { marathi: marathi, english: marathi }
}

// Remove OCR noise artifacts
function stripNoise(s: string): string {
  return s
    .replace(/नांव\s*Photo\s*नांव/gi, " ")
    .replace(/Photo\s*नांव\s*Photo/gi, " ")
    .replace(/Available\s*Available/gi, " ")
    .replace(/Photo\s*तांव\s*नांव\s*Photo/gi, " ")
    .replace(/\bPhoto\b/gi, " ")
    .replace(/\bPhot\b/gi, " ")
    .replace(/\bAvailable\b/gi, " ")
    .replace(/\bनांव\b/g, " ")
    .replace(/\bपांव\b/g, " ")
    .replace(/\bतांव\b/g, " ")
    .replace(/\bगांव\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function normalize(s: string): string {
  return stripNoise(
    s
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  ).replace(/\s{2,}/g, " ")
}

function normalizeHeaderLine(line: string): string {
  let cleaned = toAsciiDigits(stripNoise(line).replace(/\s{2,}/g, " ").trim())
  cleaned = cleaned.replace(/^(?:Prabhag|Prabhag\s*No\.?|Prabhag\s*Kr\.?|Prabhag\s*Number)\s*:?\s*/i, "")
  cleaned = cleaned.replace(/^(?:Yadi\s*Bhag|Yadi\s*Part|Yadi\s*Bhag\s*Kr\.?|Part\s*No\.?|Ward\s*No\.?)\s*:?\s*/i, "")
  cleaned = cleaned.replace(/^(?:Booth|Address|Add\s*:?|Pata|Patta)\s*:?\s*/i, "")
  return cleaned.trim()
}

// Extract header information (Prabhag, Yadi, Booth) from the beginning of the text
export function tryExtractHeaderInfo(text: string): HeaderInfo | null {
  if (!text) return null

  const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/
  const firstSerialMatch = serialPattern.exec(text)
  const headerEndIndex = firstSerialMatch ? firstSerialMatch.index : Math.min(text.length, 800)

  const headerSegment = text.slice(0, headerEndIndex)
  const headerEntries = headerSegment
    .split(/\r?\n/)
    .map(line => {
      const cleanedRaw = toAsciiDigits(stripNoise(line).replace(/\s{2,}/g, " ").trim())
      const normalized = normalizeHeaderLine(line)
      return {
        raw: cleanedRaw,
        normalized
      }
    })
    .filter(entry => entry.raw)

  if (headerEntries.length === 0) return null

  const findLine = (pattern: RegExp) => {
    const entry = headerEntries.find(line => pattern.test(line.normalized))
    return entry ? entry.raw : ""
  }

  const prabhagLine = findLine(/प्रभाग\s*क्र/i) || ""
  const yadiBhagLine = findLine(/यादी\s*भाग\s*क्र/i) || ""
  const matdanWithColon = findLine(/मतदान\s*कें?द्र\s*[:：]/i) || ""
  const matdanHeading = findLine(/मतदान\s*केंद्रनिहाय\s*मतदार\s*यादी/i) || ""
  const boothLineRaw = findLine(/पत्ता\s*[:：]/i) || ""
  const boothLine = boothLineRaw || matdanWithColon

  const parts: string[] = []
  if (prabhagLine) parts.push(prabhagLine)
  if (yadiBhagLine) parts.push(yadiBhagLine)
  if (matdanWithColon) {
    parts.push(matdanWithColon)
  } else if (matdanHeading) {
    parts.push(matdanHeading)
  }
  if (boothLineRaw && boothLineRaw !== matdanWithColon) {
    parts.push(boothLineRaw)
  } else if (boothLine && boothLine !== matdanWithColon) {
    parts.push(boothLine)
  }

  let raw = parts.join(" | ")

  if (!raw) {
    const fallback = headerEntries.slice(0, Math.min(3, headerEntries.length)).map(entry => entry.raw)
    raw = fallback.join(" | ")
  }

  raw = raw.trim()

  if (!raw) return null

  return {
    raw,
    prabhag: prabhagLine,
    yadi: yadiBhagLine,
    booth: boothLine,
    matdarKendra: matdanWithColon
  }
}

// Backwards-compatible helper returning combined address text
export function tryExtractAddress(text: string): string | null {
  const headerInfo = tryExtractHeaderInfo(text)
  return headerInfo?.raw || null
}

// Extract GAN (निवाचन गण) number from the page text
export function tryExtractGan(text: string): string | null {
  const t = normalize(text)
  
  // Pattern to match "निवाचन गण : १९" or "निवार्चन गण : १९" with variations
  const ganPattern = /(?:निवा?र?्?चन|निवाचन)\s+गण\s*[;:]\s*([०-९\d]+)/i
  const match = ganPattern.exec(t)
  
  if (match) {
    // Convert Devanagari digits to ASCII
    const ganValue = toAsciiDigits(match[1].trim())
    return ganValue
  }
  
  return null
}

// NEW APPROACH: Split text into chunks based on 3-voter groups
function splitIntoChunks(text: string): VoterChunk[] {
  const t = normalize(text)
  // Updated pattern to handle commas and periods in serial numbers (e.g., 1,000 or 1.000)
  const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/g

  const allMatches: Array<{ serial: string; epic: string; part: string; index: number }> = []
  let m: RegExpExecArray | null
  
  while ((m = serialPattern.exec(t))) {
    allMatches.push({
      serial: m[1].replace(/[,.]/g, ''), // Remove commas and periods from serial numbers
      epic: m[2],
      part: m[3],
      index: m.index,
    })
  }

  if (allMatches.length === 0) return []
  
  
  const chunks: VoterChunk[] = []
  
  // Group serial numbers into chunks of 3 (or remaining if less than 3)
  for (let i = 0; i < allMatches.length; i += 3) {
    const currentGroup = allMatches.slice(i, i + 3)
    const nextGroup = allMatches.slice(i + 3, i + 6)
    
    // Determine chunk boundaries
    const chunkStart = currentGroup[0].index
    const chunkEnd = nextGroup.length > 0 ? nextGroup[0].index : t.length
    
    // Extract the chunk content
    const chunkContent = t.slice(chunkStart, chunkEnd)
    
    // Count how many voters are in this chunk by counting serial number occurrences
    const voterCount = countVotersInChunk(chunkContent)
    
    
    chunks.push({
      startSerial: currentGroup[0].serial,
      endSerial: nextGroup.length > 0 ? nextGroup[0].serial : null,
      content: chunkContent,
      voterCount: voterCount,
      headers: currentGroup.map(s => ({ serial: s.serial, epic: s.epic, part: s.part }))
    })
  }
  
  return chunks
}

// Count voters in a chunk by counting serial number occurrences
function countVotersInChunk(chunkContent: string): number {
  // Updated pattern to handle commas and periods in serial numbers (e.g., 1,000 or 1.000)
  const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/g
  const matches = [...chunkContent.matchAll(serialPattern)]
  return matches.length
}

// Process a single chunk to extract voter data
function processChunk(chunk: VoterChunk, header: HeaderInfo | null, gan: string): Voter[] {
  
  const voters: Voter[] = []
  const addressText = header?.booth || header?.raw || ""
  const prabhagText = header?.prabhag || ""
  const yadiText = header?.yadi || ""
  const boothText = header?.booth || ""
  const matdarText = header?.matdarKendra || ""
  
  // Extract all data using existing methods
  const names = extractAllNames(chunk.content)
  const relations = extractAllRelations(chunk.content)
  const houses = extractAllHouses(chunk.content)
  const agesGenders = extractAllAgesAndGenders(chunk.content)
  
  
  // Create voters based on the expected count
  for (let i = 0; i < chunk.voterCount; i++) {
    let voter: Voter = {
      serial: "", // Will be extracted from content
      epic: "",   // Will be extracted from content
      part: "",   // Will be extracted from content
      name: names[i] || "",
      rel: relations[i] || "NA",
      house: houses[i] || "NA", // Default to "NA" for missing houses
      age: agesGenders[i]?.age || "",
      gender: agesGenders[i]?.gender || "",
      genderMarathi: agesGenders[i]?.genderMarathi || "",
      genderEnglish: agesGenders[i]?.genderEnglish || "",
      address: addressText,
      prabhag: prabhagText,
      yadi: yadiText,
      booth: boothText,
      matdarKendra: matdarText,
      gan: gan, // Use the page-specific GAN
    }
    
    // Extract serial, epic, part for this voter
    const serialMatch = extractSerialInfoForVoter(chunk.content, i)
    if (serialMatch) {
      // Remove commas, periods and convert Devanagari digits to ASCII
      voter.serial = toAsciiDigits(serialMatch.serial.replace(/[,.]/g, ''))
      voter.epic = serialMatch.epic
      voter.part = serialMatch.part
    }
    
    // Validate and clean voter data
    voter = validateAndCleanVoterData(voter, i + 1)
    
    voters.push(voter)
  }
  
  return voters
}

// Validate and clean voter data, handling missing fields
function validateAndCleanVoterData(voter: Voter, voterIndex: number): Voter {
  // Clean name - remove relation labels and noise
  if (voter.name) {
    voter.name = voter.name
      // Remove relation labels if they somehow got into the name field
      .replace(/^(?:पतीचे\s*नाव|वडिलांचे\s*नाव|मतदाराचे\s*पूर्ण\s*नाव)\s*[;:]\s*/gi, "")
      .replace(/\b(?:पतीचे\s*नाव|वडिलांचे\s*नाव)\b/gi, "")
      // Remove "NA :" pattern that sometimes appears
      .replace(/^NA\s*[;:]\s*/gi, "")
      .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
      .replace(/\s+(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\s*/gi, " ")
      .replace(/(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\s*$/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  }
  
  // Handle missing name
  if (!voter.name || voter.name.length < 2) {
    voter.name = `[MISSING NAME - Serial ${voter.serial}]`
  }
  
  // Clean relation
  if (voter.rel && voter.rel !== "NA") {
    voter.rel = voter.rel
      .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
      .replace(/\s+(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\s*/gi, " ")
      .replace(/(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\s*$/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  }
  
  // Handle missing relation
  if (!voter.rel || voter.rel.length < 2) {
    voter.rel = "NA"
  }
  
  // Clean house number
  if (voter.house) {
    voter.house = voter.house.trim()
    if (voter.house === "" || voter.house === "-") {
      voter.house = "NA"
    }
  } else {
    voter.house = "NA"
  }
  
  // Handle missing age/gender
  if (!voter.age || !voter.gender) {
    if (!voter.age) voter.age = ""
    if (!voter.gender) {
      voter.gender = ""
      voter.genderMarathi = ""
      voter.genderEnglish = ""
    }
  }
  
  // Validate data completeness
  const missingFields = []
  if (!voter.name || voter.name.includes('[MISSING NAME')) missingFields.push('name')
  if (!voter.age) missingFields.push('age')
  if (!voter.gender) missingFields.push('gender')
  if (voter.house === "NA" && missingFields.length === 0) missingFields.push('house')
  
  if (missingFields.length > 0) {
  }
  
  return voter
}

// Extract serial information for a specific voter in the chunk
function extractSerialInfoForVoter(chunkContent: string, voterIndex: number): { serial: string; epic: string; part: string } | null {
  // Updated pattern to handle commas and periods in serial numbers (e.g., 1,000 or 1.000)
  const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/g
  const matches = [...chunkContent.matchAll(serialPattern)]
  
  if (voterIndex < matches.length) {
    const match = matches[voterIndex]
    return {
      serial: match[1], // Comma/period removal will be done by the caller
      epic: match[2],
      part: match[3]
    }
  }
  
  return null
}

// Legacy function for backward compatibility - now uses chunk-based approach
function splitIntoRows(text: string): VoterRow[] {
  const chunks = splitIntoChunks(text)
  const rows: VoterRow[] = []
  
  for (const chunk of chunks) {
    const row: VoterRow = {
      headers: [],
      content: chunk.content
    }
    
    // Extract headers from the chunk - updated pattern to handle commas and periods
    const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/g
    let m: RegExpExecArray | null
    
    while ((m = serialPattern.exec(chunk.content))) {
      row.headers.push({
        serial: m[1].replace(/[,.]/g, ''), // Remove commas and periods from serial numbers
        epic: m[2],
        part: m[3]
      })
    }
    
    rows.push(row)
  }
  
  return rows
}

// Extract all names from a row's content
function extractAllNames(content: string): string[] {
  const names: string[] = []
  
  
  // Strategy 1: Find names with the "मतदाराचे पूर्ण नांव:" label (most reliable)
  // Enhanced pattern to handle OCR variations, optional "नांव" word, names without spaces after colon
  // Pattern handles: "मतदाराचे पूर्ण:", "मतदाराचे पूर्ण;" (semicolon), "मतदाराचे पूर्ण:Name" (no space)
  // Stop capturing before relation labels, standalone नांव, or house number
  const labeledPattern = /मतदाराचे\s*पूर्ण\s*(?:नांव|पांव|तांव|गांव)?\s*[;:ः]\s*(.+?)(?=\s*(?:\bनांव\b\s*(?:Photo|Phot|Available|$)|मतदाराचे\s*पूर्ण|वडिलांचे\s*नाव|पतीचे\s*नाव|आईचे\s*नाव|घर\s*क्रमांक|Photo\s*Available|$))/gi
  
  let m: RegExpExecArray | null
  while ((m = labeledPattern.exec(content))) {
    const rawName = m[1].trim()
    const cleanName = rawName
      // Remove relation labels that might have been captured
      .replace(/^(?:पतीचे\s*नाव|वडिलांचे\s*नाव)\s*[;:]\s*/gi, "")
      // Remove Photo, Available, and name label noise
      .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव|गांव)\b/gi, "")
      .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
      .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
      // Clean up multiple spaces and newlines
      .replace(/[\r\n]+/g, " ")  // Replace newlines with spaces
      .replace(/\s{2,}/g, " ")   // Multiple spaces to single space
      .trim()
    
    if (cleanName && cleanName.length > 2) {
      names.push(cleanName)
    }
  }
  
  
  // Strategy 2: Look for unlabeled names (Marathi text patterns before relation labels)
  if (names.length === 0) {
    
    // Enhanced pattern to catch more variations - updated to handle commas and periods in serial numbers
    const unlabeledPattern = /([अ-ह]{2,}(?:\s+[अ-ह]{2,}){0,4})\s+(?=(?:पतीचे नाव|वडिलांचे नाव|घर क्रमांक|वय|लिंग|\d{1,3}(?:[,.]?\d{3})*\s+[A-Z]{2,}[0-9]{5,}|$))/gi
    
    let match: RegExpExecArray | null
    while ((match = unlabeledPattern.exec(content))) {
      const rawName = match[1].trim()
      const cleanName = rawName
        // Remove relation labels that might have been captured
        .replace(/^(?:पतीचे\s*नाव|वडिलांचे\s*नाव)\s*[;:]\s*/gi, "")
        .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
        .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
        .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
        .replace(/\s{2,}/g, " ")
        .trim()
      
      if (cleanName && cleanName.length > 2) {
        names.push(cleanName)
      }
    }
  }
  
  // Strategy 2.5: Look for names after standalone "नांव" label
  if (names.length === 0) {
    
    // Pattern: "नांव" followed by Marathi text (name)
    const standaloneNavPattern = /(?:^|\n|\s)नांव\s+([अ-ह]{2,}(?:\s+[अ-ह]{2,}){0,4})(?=\s|$|\n|Photo|Available|पतीचे|वडिलांचे)/gi
    
    let match: RegExpExecArray | null
    while ((match = standaloneNavPattern.exec(content))) {
      const rawName = match[1].trim()
      const cleanName = rawName
        .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
        .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ")
        .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
      
      if (cleanName && cleanName.length > 2) {
        names.push(cleanName)
      }
    }
  }
  
  // Strategy 2.6: If still no names, try a more permissive approach
  if (names.length === 0) {
    
    // Look for any Marathi text that could be a name, even without strict lookahead - updated to handle commas and periods
    const permissivePattern = /([अ-ह]{2,}(?:\s+[अ-ह]{2,}){1,3})(?=\s*(?:पतीचे|वडिलांचे|घर|वय|लिंग|Photo|Available|नांव|\d{1,3}(?:[,.]?\d{3})*\s+[A-Z]{2,}|$))/gi
    
    let match: RegExpExecArray | null
    while ((match = permissivePattern.exec(content))) {
      const rawName = match[1].trim()
      const cleanName = rawName
        .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
        .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
        .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
        .replace(/\s{2,}/g, " ")
        .trim()
      
      if (cleanName && cleanName.length > 2) {
        names.push(cleanName)
      }
    }
  }
  
  
  // Strategy 3: Look for Marathi names near Photo/Available markers
  if (names.length === 0) {
    
    // Pattern: Marathi text that appears after "Photo" or before "Available"
    const photoNearbyPattern = /(?:Photo|Available|नांव)\s+([अ-ह]{2,}(?:\s+[अ-ह]{2,}){0,3})\s+(?:Photo|Available|पतीचे|वडिलांचे|घर|वय)/gi
    
    let match: RegExpExecArray | null
    while ((match = photoNearbyPattern.exec(content))) {
      const rawName = match[1].trim()
      const cleanName = rawName
        .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
        .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ")
        .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim()
      
      if (cleanName && cleanName.length > 2) {
        names.push(cleanName)
      }
    }
  }
  
  // Strategy 4: More aggressive fallback - look for any Marathi text sequences
  if (names.length === 0) {
    
    // Look for any Marathi text that could be a name - updated to handle commas and periods
    const aggressivePattern = /([अ-ह]{2,}(?:\s+[अ-ह]{2,}){1,3})(?=\s*(?:पतीचे|वडिलांचे|घर|वय|लिंग|\d{1,3}(?:[,.]?\d{3})*\s+[A-Z]{2,}|$))/gi
    
    let match: RegExpExecArray | null
    while ((match = aggressivePattern.exec(content))) {
      const rawName = match[1].trim()
      const cleanName = rawName
        .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
        .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
        .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
        .replace(/\s{2,}/g, " ")
        .trim()
      
      if (cleanName && cleanName.length > 2) {
        names.push(cleanName)
      }
    }
  }
  
  
  // Strategy 5: Final fallback - segment-based extraction
  if (names.length === 0) {
    
    // Split content by common field markers and look for name-like patterns
    const segments = content.split(/(?:पतीचे नाव|वडिलांचे नाव|घर क्रमांक|वय|लिंग)/gi)
    
    for (const segment of segments) {
      const trimmed = segment.trim()
      // Look for Marathi text that could be a name (2-4 words, no numbers)
      const nameMatch = trimmed.match(/^([अ-ह]{2,}(?:\s+[अ-ह]{2,}){1,3})(?:\s|$)/)
      if (nameMatch) {
        const cleanName = nameMatch[1]
          .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
          .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
          .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
          .replace(/\s{2,}/g, " ")
          .trim()
        
        if (cleanName && cleanName.length > 2) {
          names.push(cleanName)
        }
      }
    }
  }
  
  // Strategy 6: Handle truncated names and OCR artifacts
  if (names.length > 0) {
    
    // Look for patterns where names might be split across lines or have OCR artifacts
    const truncatedPattern = /([अ-ह]{2,}(?:\s+[अ-ह]{2,}){0,2})\s*(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)/gi
    let match: RegExpExecArray | null
    while ((match = truncatedPattern.exec(content))) {
      const potentialName = match[1].trim()
      if (potentialName && potentialName.length > 3) {
        // Check if this name is already in our list
        const isDuplicate = names.some(existingName => 
          existingName.includes(potentialName) || potentialName.includes(existingName)
        )
        
        if (!isDuplicate) {
          names.push(potentialName)
        }
      }
    }
  }
  
  // Strategy 7: If we still have fewer names than expected, try to find any remaining Marathi text
  if (names.length === 0) {
    
    // Look for any Marathi text that could potentially be a name
    const desperatePattern = /([अ-ह]{2,}(?:\s+[अ-ह]+)*)/g
    const allTextMatches = [...content.matchAll(desperatePattern)]
    
    for (const match of allTextMatches) {
      const potentialName = match[1].trim()
      if (potentialName && potentialName.length > 4) {
        // Clean the potential name
        const cleanName = potentialName
          .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव|मतदाराचे|पूर्ण|नाव|पतीचे|वडिलांचे|घर|क्रमांक|वय|लिंग)\b/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim()
        
        if (cleanName && cleanName.length > 3) {
          names.push(cleanName)
        }
      }
    }
  }
  
  // Strategy 8: Sort names by position in content to ensure correct order
  if (names.length > 1) {
    const namesWithPositions = names.map(name => {
      const position = content.indexOf(name)
      return { name, position }
    }).sort((a, b) => a.position - b.position)
    
    const sortedNames = namesWithPositions.map(item => item.name)
    
    return sortedNames
  }
  
  
  return names
}

// Extract all relations (RLN_FM_NM_ENs) from a row's content
function extractAllRelations(content: string): string[] {
  const relations: string[] = []
  // Updated pattern to handle commas and periods in serial numbers
  const pattern = /(वडिलांचे नाव|पतीचे नाव)\s*:\s*([^:]+?)(?=\s*(?:पतीचे नाव|वडिलांचे नाव|घर क्रमांक|वय|लिंग|मतदाराचे पूर्ण:|\d{1,3}(?:[,.]?\d{3})*\s+[A-Z]{2,}[0-9]{5,}|$))/gi
  
  let m: RegExpExecArray | null
  while ((m = pattern.exec(content))) {
    const rawRel = m[2].trim()
    // Clean the relation name
    const cleanRel = rawRel
      .replace(/\b(?:नांव|Photo|Available|Phot|पांव|तांव|गांव)\b/gi, "")
      .replace(/\s+(?:नांव|पांव|तांव|गांव)\s*/gi, " ") // Remove noise words with surrounding spaces
      .replace(/(?:नांव|पांव|तांव|गांव)\s*$/gi, "") // Remove noise words at the end
    .replace(/\s{2,}/g, " ")
    .trim()
    
    if (cleanRel) {
      relations.push(cleanRel)
    }
  }
  
  return relations
}

// Extract all house numbers from a row's content
function extractAllHouses(content: string): string[] {
  const houses: string[] = []
  
  
  // Split content into individual voter sections first
  const voterSections = splitContentIntoSections(content)
  
  for (let i = 0; i < voterSections.length; i++) {
    const section = voterSections[i]
    
    const house = extractHouseFromSection(section)
    houses.push(house)
  }
  
  return houses
}

// Split content into individual voter sections
function splitContentIntoSections(content: string): string[] {
  const sections: string[] = []
  
  // Find all serial number patterns to split on - updated to handle commas and periods
  const serialPattern = /(\d{1,3}(?:[,.]?\d{3})*)\s+([A-Z]{2,}[0-9]{5,})\s+(\d+\/\d+\/\d+)/g
  const matches: Array<{ serial: string; epic: string; part: string; index: number }> = []
  let m: RegExpExecArray | null
  
  while ((m = serialPattern.exec(content))) {
    matches.push({
      serial: m[1].replace(/[,.]/g, ''), // Remove commas and periods from serial numbers
      epic: m[2],
      part: m[3],
      index: m.index
    })
  }
  
  if (matches.length === 0) {
    // No serial numbers found, treat entire content as one section
    sections.push(content)
    return sections
  }
  
  // Split content based on serial number positions
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i]
    const nextMatch = matches[i + 1]
    
    const startIndex = currentMatch.index
    const endIndex = nextMatch ? nextMatch.index : content.length
    
    const section = content.slice(startIndex, endIndex).trim()
    if (section) {
      sections.push(section)
    }
  }
  
  return sections
}

// Extract house number from a single voter section
function extractHouseFromSection(section: string): string {
  
  // Clean up the section first
  let cleanSection = section
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\n/g, " ") // Replace newlines with spaces
    .trim()
  
  // Look for house number patterns with better handling of malformed entries
  const housePatterns = [
    // Pattern 1: Standard "घर क्रमांक :" followed by content until next field
    /घर क्रमांक\s*:?\s*([^वयलिंगमतदाराचेपृष्ठ\*]+?)(?=\s*(?:वय|लिंग|मतदाराचे पूर्ण|पृष्ठ|\*|$))/gi,
    
    // Pattern 2: Handle cases where house number is mixed with other fields
    /घर क्रमांक\s*:?\s*([^वयलिंगमतदाराचेपृष्ठ\*]+?)(?=\s*(?:वय|लिंग|मतदाराचे पूर्ण|पृष्ठ|\*|$))/gi,
    
    // Pattern 3: More aggressive - look for any content after "घर क्रमांक"
    /घर क्रमांक\s*:?\s*([^वयलिंगमतदाराचेपृष्ठ\*]+)/gi
  ]
  
  for (const pattern of housePatterns) {
    const matches = [...cleanSection.matchAll(pattern)]
    
    if (matches.length > 0) {
      // Take the first match and clean it
      let house = matches[0][1].trim()
      
      // Clean up the house number
      house = cleanHouseNumber(house)
      
      if (house && house !== "NA") {
        return house
      }
    }
  }
  
  // If no house found, return NA
  return "NA"
}

// Clean and normalize house number
function cleanHouseNumber(house: string): string {
  if (!house) return "NA"
  
  // Remove duplicate labels and clean up
  let cleaned = house
    .replace(/घर क्रमांक\s*:?\s*/g, "") // Remove duplicate "घर क्रमांक :" labels
    .replace(/घ/g, "") // Remove unwanted "घ" character from house numbers
    .replace(/वय\s*:\s*[०-९0-9]+/g, "") // Remove age info
    .replace(/लिंग\s*:\s*[^\s]+/g, "") // Remove gender info
    .replace(/लि[ंं]?ग\s*[^\s]+/g, "") // Remove gender info (with OCR errors)
    .replace(/वय\s*[०-९0-9]+/g, "") // Remove age info without colon
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/^[:\s\-]+|[:\s\-]+$/g, "") // Remove leading/trailing colons, spaces, dashes
    .trim()
  
  // Remove any remaining "NA" values that are not part of a valid address
  cleaned = cleaned.replace(/\bNA\b/g, "").trim()
  
  // Handle special cases
  if (cleaned === "" || cleaned === "-" || cleaned === "NA") {
    return "NA"
  }
  
  // Convert Devanagari digits to ASCII
  if (cleaned.match(/[०-९]/)) {
    cleaned = cleaned.replace(/[०-९]/g, (d) => {
      const devanagari = "०१२३४५६७८९"
      const arabic = "0123456789"
      const idx = devanagari.indexOf(d)
      return idx >= 0 ? arabic[idx] : d
    })
  }
  
  // Final validation - if it contains only gender info, return NA
  if (cleaned.match(/^[स्त्रीपु]+\s*$/)) {
    return "NA"
  }
  
  // Keep numeric house numbers (they are valid)
  if (cleaned.match(/^[०-९0-9]+\s*$/)) {
    return cleaned.trim()
  }
  
  // If the cleaned result is empty or only contains whitespace, return NA
  if (!cleaned || cleaned.trim() === "") {
    return "NA"
  }
  
  return cleaned || "NA"
}

// Extract all ages and genders from a row's content
function extractAllAgesAndGenders(content: string): Array<{ age: string; gender: string; genderMarathi: string; genderEnglish: string }> {
  const results: Array<{ age: string; gender: string; genderMarathi: string; genderEnglish: string }> = []
  
  // More flexible pattern to handle OCR errors in gender field
  // Handles cases like "लिग" instead of "लिंग" and "पू" instead of "पु"
  // Also handles page endings with footer text
  // Updated pattern to handle commas and periods in serial numbers
  const pattern = /वय\s*:\s*([०-९0-9]+)\s+लि[ंं]?ग\s*:\s*([^\s]+?)(?=\s+(?:वय|मतदाराचे पूर्ण:|\d{1,3}(?:[,.]?\d{3})*\s+[A-Z]{2,}[0-9]{5,}|\*.*DELETED.*|$))/gi
  
  let m: RegExpExecArray | null
  while ((m = pattern.exec(content))) {
    const age = toAsciiDigits(m[1].trim())
    const rawGender = m[2].trim()
    
    // Clean and normalize the gender
    const cleanGender = rawGender
      .replace(/[ूू]/g, "ु") // Fix "पू" -> "पु"
      .replace(/[ंं]/g, "ं") // Normalize anusvara
      .trim()
    
    const normalizedGender = normalizeGender(cleanGender)
    
    results.push({ 
      age, 
      gender: `${normalizedGender.marathi} (${normalizedGender.english})`,
      genderMarathi: normalizedGender.marathi,
      genderEnglish: normalizedGender.english
    })
  }
  
  // Fallback: if we didn't find enough age/gender pairs, try a more aggressive search
  if (results.length === 0) {
    
    // Look for any gender tokens that might be standalone
    const genderPattern = /(स्त्री|महिला|पु|पुरुष|स्त्रि|स्त्र|पू|पुः)/gi
    const agePattern = /वय\s*:\s*([०-९0-9]+)/gi
    
    const genders: Array<{ marathi: string; english: string }> = []
    const ages: string[] = []
    
    let m: RegExpExecArray | null
    while ((m = genderPattern.exec(content))) {
      const rawGender = m[1].trim()
      const cleanGender = rawGender
        .replace(/[ूू]/g, "ु")
        .replace(/[ंं]/g, "ं")
        .trim()
      const normalizedGender = normalizeGender(cleanGender)
      genders.push(normalizedGender)
    }
    
    while ((m = agePattern.exec(content))) {
      ages.push(toAsciiDigits(m[1].trim()))
    }
    
    // Match ages and genders by index
    for (let i = 0; i < Math.min(ages.length, genders.length); i++) {
      results.push({ 
        age: ages[i], 
        gender: `${genders[i].marathi} (${genders[i].english})`,
        genderMarathi: genders[i].marathi,
        genderEnglish: genders[i].english
      })
    }
  }
  
  // Additional fallback: Handle page endings where age/gender might be cut off
  if (results.length === 0) {
    
    // Look for age patterns that might be at the end of content (before page footer)
    const pageEndingPattern = /वय\s*:\s*([०-९0-9]+)\s+लि[ंं]?ग\s*:\s*([^\s]+?)(?=\s*\*.*DELETED.*|$)/gi
    
    let m: RegExpExecArray | null
    while ((m = pageEndingPattern.exec(content))) {
      const age = toAsciiDigits(m[1].trim())
      const rawGender = m[2].trim()
      
      const cleanGender = rawGender
        .replace(/[ूू]/g, "ु")
        .replace(/[ंं]/g, "ं")
        .trim()
      
      const normalizedGender = normalizeGender(cleanGender)
      
      results.push({ 
        age, 
        gender: `${normalizedGender.marathi} (${normalizedGender.english})`,
        genderMarathi: normalizedGender.marathi,
        genderEnglish: normalizedGender.english
      })
    }
  }
  
  return results
}

export function parseVoters(text: string, address: string): Voter[] {
  
  // First, separate pages
  const pages = separatePages(text)
  
  // Filter out empty pages
  const validPages = pages.filter(page => page.content.trim().length > 0 && page.address.trim().length > 0)
  
  // Debug: Show all page addresses and GANs
  validPages.forEach((page, idx) => {
  })
  
  const allVoters: Voter[] = []
  
  for (let pageIndex = 0; pageIndex < validPages.length; pageIndex++) {
    const page = validPages[pageIndex]
    
    // Process voters on this page with the page-specific address and GAN
    const pageVoters = parseVotersFromPage(page.content, page.header, page.gan)
    
    // Debug: Show voter addresses and GANs
    pageVoters.forEach((voter, idx) => {
    })
    
    allVoters.push(...pageVoters)
  }
  
  
  // Debug: Show final voter addresses and GANs
  allVoters.forEach((voter, idx) => {
  })
  
  return allVoters
}

// Separate text into individual pages
function separatePages(text: string): Array<{ content: string; address: string; header: HeaderInfo | null; gan: string; pageNumber: number }> {
  const pages: Array<{ content: string; address: string; header: HeaderInfo | null; gan: string; pageNumber: number }> = []
  
  // Split by page markers - handle both English "PAGE X:" and Marathi "पृष्ठ X"
  const pagePattern = /(?:PAGE (\d+):\s*\n-+\s*\n|पृष्ठ\s*([०-९]+)\s*\n)/g
  const pageMatches = [...text.matchAll(pagePattern)]
  
  
  if (pageMatches.length === 0) {
    // No page markers - try to detect multiple addresses within the text
    const addressSections = detectAddressSections(text)
    
    if (addressSections.length > 1) {
      addressSections.forEach((section, idx) => {
        pages.push({
          content: section.content,
          address: section.address,
          header: section.header || tryExtractHeaderInfo(section.content),
          gan: section.gan,
          pageNumber: idx + 1
        })
      })
      return pages
    } else {
      // Single page - no page markers and no multiple addresses
      const headerInfo = tryExtractHeaderInfo(text)
      const address = headerInfo?.raw || tryExtractAddress(text) || ""
      const gan = tryExtractGan(text) || ""
      pages.push({
        content: text,
        address: address,
        header: headerInfo,
        gan: gan,
        pageNumber: 1
      })
      return pages
    }
  }
  
  // Handle the first page (before any markers)
  if (pageMatches.length > 0) {
    const firstMatch = pageMatches[0]
    const firstPageContent = text.slice(0, firstMatch.index).trim()
    const firstPageHeader = tryExtractHeaderInfo(firstPageContent)
    const firstPageAddress = firstPageHeader?.raw || tryExtractAddress(firstPageContent) || ""
    const firstPageGan = tryExtractGan(firstPageContent) || ""
    
    if (firstPageContent && firstPageAddress) {
      pages.push({
        content: firstPageContent,
        address: firstPageAddress,
        header: firstPageHeader,
        gan: firstPageGan,
        pageNumber: 1
      })
    }
  }
  
  // Process each page after markers
  for (let i = 0; i < pageMatches.length; i++) {
    const currentMatch = pageMatches[i]
    const nextMatch = pageMatches[i + 1]
    
    // Get page number from either English or Marathi format
    const pageNumberStr = currentMatch[1] || currentMatch[2]
    const pageNumber = pageNumberStr ? parseInt(toAsciiDigits(pageNumberStr)) : i + 2
    const startIndex = currentMatch.index! + currentMatch[0].length
    const endIndex = nextMatch ? nextMatch.index! : text.length
    
    const pageContent = text.slice(startIndex, endIndex).trim()
    const pageHeader = tryExtractHeaderInfo(pageContent)
    const pageAddress = pageHeader?.raw || tryExtractAddress(pageContent) || ""
    const pageGan = tryExtractGan(pageContent) || ""
    
    // Only add pages with content and address
    if (pageContent && pageAddress) {
      pages.push({
        content: pageContent,
        address: pageAddress,
        header: pageHeader,
        gan: pageGan,
        pageNumber: pageNumber
      })
    } else {
    }
  }
  
  return pages
}

// Detect multiple address sections within text (for data without page markers)
function detectAddressSections(text: string): Array<{ content: string; address: string; header: HeaderInfo | null; gan: string }> {
  const sections: Array<{ content: string; address: string; header: HeaderInfo | null; gan: string }> = []
  
  // Find all address patterns
  const addressPattern = /यादी भाग क्र[.:]?\s*[^:]+/gi
  const addressMatches = [...text.matchAll(addressPattern)]
  
  
  if (addressMatches.length <= 1) {
    // Only one address found
    const headerInfo = tryExtractHeaderInfo(text)
    return [{
      content: text,
      address: headerInfo?.raw || tryExtractAddress(text) || "",
      header: headerInfo,
      gan: tryExtractGan(text) || ""
    }]
  }
  
  // Split text by address boundaries
  for (let i = 0; i < addressMatches.length; i++) {
    const currentMatch = addressMatches[i]
    const nextMatch = addressMatches[i + 1]
    
    const startIndex = currentMatch.index!
    const endIndex = nextMatch ? nextMatch.index! : text.length
    
    const sectionContent = text.slice(startIndex, endIndex).trim()
    const sectionHeader = tryExtractHeaderInfo(sectionContent)
    const sectionAddress = sectionHeader?.raw || tryExtractAddress(sectionContent) || ""
    const sectionGan = tryExtractGan(sectionContent) || ""
    
    if (sectionContent && sectionAddress) {
      sections.push({
        content: sectionContent,
        address: sectionAddress,
        header: sectionHeader,
        gan: sectionGan
      })
    }
  }
  
  return sections
}

// Parse voters from a single page
function parseVotersFromPage(pageContent: string, pageHeader: HeaderInfo | null, pageGan: string): Voter[] {
  
  // Split page content into chunks using the existing approach
  const chunks = splitIntoChunks(pageContent)
  
  const voters: Voter[] = []
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    
    const chunkHeader = tryExtractHeaderInfo(chunk.content) || pageHeader
    
    // Use the header info and GAN for all voters in this chunk
    const chunkVoters = processChunk(chunk, chunkHeader, pageGan)
    voters.push(...chunkVoters)
  }
  
  return voters
}

export function parseVotersToLines(text: string, address: string): string[] {
  const addr = address?.trim() || ""
  const voters = parseVoters(text, addr)
  return voters.map((v) =>
    [v.serial, v.epic, v.part, v.name, v.rel, v.house, v.age, v.gender, v.address || addr]
      .map((s) => s?.trim?.() ?? "")
      .join(" ")
  )
}

// Generate CSV content from voters data with custom field names
export function generateCSV(voters: Voter[], address: string): string {
  const addr = address?.trim() || ""
  
  // CSV headers with custom field names
  const headers = [
    "SERIAL_NO",
    "EPIC_NO",
    "PRABHAG",
    "YADI_BHAG",
    "YADI_BHAG_EN",
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
  
  // CSV rows with custom field mapping
  const rows = voters.map(voter => [
    voter.serial,                                                  // SERIAL_NO = Serial Number
    voter.epic,                                                    // EPIC_NO = EPIC ID
    `"${(voter.prabhag || '').replace(/"/g, '""')}"`,             // PRABHAG column
    `"${(voter.yadi || '').replace(/"/g, '""')}"`,                // YADI_BHAG column
    `"${(voter.yadiEnglish || '').replace(/"/g, '""')}"`,         // YADI_BHAG_EN column
    `"${(voter.matdarKendra || '').replace(/"/g, '""')}"`,        // MATDAR_KENDRA column
    `"${(voter.booth || addr).replace(/"/g, '""')}"`,             // BOOTH_ADDRESS column
    `"${(voter.boothEnglish || voter.addressEnglish || '').replace(/"/g, '""')}"`,      // BOOTH_ADDRESS_EN column
    voter.part,                                                    // PART_NUMBER = Part Number
    `"${(voter.nameEnglish || '').replace(/"/g, '""')}"`,         // NAME_EN = Name (English)
    `"${voter.name.replace(/"/g, '""')}"`,                        // NAME_V1 = Name (Marathi)
    '',                                                            // RLN_TYPE (empty for now)
    `"${(voter.relEnglish || '').replace(/"/g, '""')}"`,          // RLN_NAME_EN = Father/Husband (English)
    `"${voter.rel.replace(/"/g, '""')}"`,                         // RLN_NAME_V1 = Father/Husband (Marathi)
    voter.house,                                                   // C_HOUSE_NO = House Number
    voter.age,                                                     // AGE = Age
    voter.genderEnglish || voter.genderMarathi,                    // GENDER = Gender
    voter.gan                                                      // GAN = निवाचन गण
  ])
  
  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map(row => row.join(","))
    .join("\n")
  
  return csvContent
}

// Download CSV file
export function downloadCSV(csvContent: string, filename: string = "voters.csv"): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
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
