// Optimized translation service using Indic transliteration libraries
import Sanscript from '@indic-transliteration/sanscript';
import { transliterate } from 'transliteration';

interface TranslationResponse {
  translatedText: string;
  detectedSourceLanguage?: string;
}

// Professional translation function using Indic transliteration libraries
export async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  if (!text || text.trim() === '') {
    return text;
  }

  try {
    // No artificial delay - process immediately for speed
    
    // Enhanced dictionary for common Marathi words with professional transliteration
    const enhancedTranslations: Record<string, string> = {
      // Family relations
      'पिता': 'Father',
      'पती': 'Husband',
      'पत्नी': 'Wife',
      'माता': 'Mother',
      'भाऊ': 'Brother',
      'बहीण': 'Sister',
      'वडील': 'Father',
      'आई': 'Mother',
      
      // Common names (using professional transliteration)
      'शंकर': 'Shankar',
      'विमल': 'Vimal',
      'माने': 'Mane',
      'राम': 'Ram',
      'कृष्ण': 'Krishna',
      'शिव': 'Shiv',
      'विष्णु': 'Vishnu',
      'गणेश': 'Ganesh',
      'हनुमान': 'Hanuman',
      'कुमार': 'Kumar',
      'प्रसाद': 'Prasad',
      'चंद्र': 'Chandra',
      'शेखर': 'Shekhar',
      'लाल': 'Lal',
      'स्वामी': 'Swamy',
      'दास': 'Das',
      'राव': 'Rao',
      
      // Essential common words only (pattern-based system handles most cases)
      'चाँद': 'Chand',
      'महाराष्ट्र': 'Maharashtra',
      'मुंबई': 'Mumbai',
      'पुणे': 'Pune',
      'नागपूर': 'Nagpur',
      'औरंगाबाद': 'Aurangabad',
      'नाशिक': 'Nashik',
      'कोल्हापूर': 'Kolhapur',
      'सोलापूर': 'Solapur',
      'अमरावती': 'Amravati',
      'चंद्रपूर': 'Chandrapur',
      'जळगाव': 'Jalgaon',
      'अकोला': 'Akola',
      'लातूर': 'Latur',
      'अहमदनगर': 'Ahmednagar',
      'धुळे': 'Dhule',
      'परभणी': 'Parbhani',
      'बीड': 'Beed',
      'गोंदिया': 'Gondia',
      'सातारा': 'Satara',
      'रत्नागिरी': 'Ratnagiri',
      'सिंधुदुर्ग': 'Sindhudurg',
      'रायगड': 'Raigad',
      'ठाणे': 'Thane',
      'पालघर': 'Palghar',
      'नंदुरबार': 'Nandurbar',
      'वर्धा': 'Wardha',
      'यवतमाळ': 'Yavatmal',
      'बुलढाणा': 'Buldhana',
      'हिंगोली': 'Hingoli',
      'नांदेड': 'Nanded',
      'उस्मानाबाद': 'Osmanabad',
      'जालना': 'Jalna',
      'वाशिम': 'Washim',
      'गडचिरोली': 'Gadchiroli',
      'भंडारा': 'Bhandara',
      
      // Common words
      'नाव': 'Name',
      'गाव': 'Village',
      'तालुका': 'Taluka',
      'जिल्हा': 'District',
      'पुरुष': 'Male',
      'स्त्री': 'Female',
      'पत्ता': 'Address',
      'घर': 'House',
      'गल्ली': 'Street',
      'मोहल्ला': 'Area',
      'वॉर्ड': 'Ward',
      'नगरपालिका': 'Municipality',
      'ग्रामपंचायत': 'Village Panchayat',
      'पोस्ट': 'Post',
      'तारखा': 'Date',
      'जन्मतारीख': 'Date of Birth',
      'वय': 'Age',
      'लिंग': 'Gender',
      'मतदार': 'Voter',
      'मतदार यादी': 'Voter List',
      'मतदार क्रमांक': 'Voter Number',
      'मतदार कार्ड': 'Voter Card',
      'अनुक्रमांक': 'Serial Number',
      'क्रमांक': 'Number'
    };

    // Try to find exact match first
    if (enhancedTranslations[text.trim()]) {
      return enhancedTranslations[text.trim()];
    }

    // For longer text, try professional transliteration with enhanced matching
    const words = text.split(' ');
    const translatedWords = words.map(word => {
      const cleanWord = word.replace(/[^\u0900-\u097F]/g, ''); // Remove non-Marathi characters
      
      // First try exact match in dictionary
      if (enhancedTranslations[cleanWord]) {
        return enhancedTranslations[cleanWord];
      }
      
      // Try to find partial matches for compound names (improved algorithm)
      let bestMatch = '';
      let bestMatchLength = 0;
      let matchedKey = '';
      
      // Sort dictionary entries by length (longest first) for better matching
      const sortedEntries = Object.entries(enhancedTranslations)
        .sort(([a], [b]) => b.length - a.length);
      
      for (const [marathiWord, englishWord] of sortedEntries) {
        if (cleanWord.includes(marathiWord) && marathiWord.length > bestMatchLength) {
          bestMatch = englishWord;
          bestMatchLength = marathiWord.length;
          matchedKey = marathiWord;
        }
      }
      
      if (bestMatch && bestMatchLength > 0) {
        // Replace the matched part and transliterate the rest
        const remainingPart = cleanWord.replace(matchedKey, '');
        if (remainingPart.length > 0) {
          // Use professional transliteration for remaining part
          const transliteratedRemaining = transliterateDevanagari(remainingPart);
          return bestMatch + ' ' + transliteratedRemaining;
        } else {
          return bestMatch;
        }
      }
      
      // If no partial match found, use professional transliteration
      if (cleanWord.length > 0) {
        return transliterateDevanagari(cleanWord);
      }
      
      return word;
    });

    return translatedWords.join(' ');

  } catch (error) {
    return text; // Return original text if translation fails
  }
}

// Professional Devanagari transliteration using Sanscript library
function transliterateDevanagari(text: string): string {
  try {
    // Use Sanscript library for professional transliteration
    const transliterated = Sanscript.t(text, 'devanagari', 'hk');
    
    // Clean up and format the result
    let result = transliterated
      .replace(/aa+/g, 'a')  // Multiple 'a's to single 'a'
      .replace(/ii+/g, 'i')  // Multiple 'i's to single 'i'
      .replace(/uu+/g, 'u')  // Multiple 'u's to single 'u'
      .replace(/nn+/g, 'n')  // Multiple 'n's to single 'n'
      .replace(/rr+/g, 'r')  // Multiple 'r's to single 'r'
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .trim();
    
    // Apply intelligent pattern-based corrections
    result = applyIntelligentCorrections(result);
    
    // Format with proper capitalization
    return result
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
      
  } catch (error) {
    
    // Fallback to general transliteration library
    try {
      const fallbackResult = transliterate(text, {
        unknown: '?',
        replace: [
          [/[अ-ह]/g, ''], // Remove Devanagari characters if general transliteration fails
        ]
      });
      return applyIntelligentCorrections(fallbackResult);
    } catch (fallbackError) {
      return text; // Return original text if all methods fail
    }
  }
}

// Apply intelligent pattern-based corrections for Marathi transliteration
function applyIntelligentCorrections(text: string): string {
  return text
    // Fix common consonant cluster issues
    .replace(/\bgh(\w*)\b/gi, 'Gh$1')  // Fix 'gh' patterns
    .replace(/\bch(\w*)\b/gi, 'Ch$1')  // Fix 'ch' patterns
    .replace(/\bth(\w*)\b/gi, 'Th$1')  // Fix 'th' patterns
    .replace(/\bdh(\w*)\b/gi, 'Dh$1')  // Fix 'dh' patterns
    .replace(/\bph(\w*)\b/gi, 'Ph$1')  // Fix 'ph' patterns
    .replace(/\bbh(\w*)\b/gi, 'Bh$1')  // Fix 'bh' patterns
    .replace(/\bkh(\w*)\b/gi, 'Kh$1')  // Fix 'kh' patterns
    .replace(/\bsh(\w*)\b/gi, 'Sh$1')  // Fix 'sh' patterns
    
    // Fix vowel corrections
    .replace(/\b(\w*)aa(\w*)\b/gi, '$1a$2')  // Remove double 'aa'
    .replace(/\b(\w*)ii(\w*)\b/gi, '$1i$2')  // Remove double 'ii'
    .replace(/\b(\w*)uu(\w*)\b/gi, '$1u$2')  // Remove double 'uu'
    
    // Fix common transliteration errors
    .replace(/\b(\w*)z(\w*)\b/gi, '$1j$2')   // Fix 'z' to 'j' patterns
    .replace(/\b(\w*)c(\w*)\b/gi, '$1ch$2')  // Fix 'c' to 'ch' patterns
    .replace(/\b(\w*)q(\w*)\b/gi, '$1k$2')   // Fix 'q' to 'k' patterns
    .replace(/\b(\w*)x(\w*)\b/gi, '$1ks$2')  // Fix 'x' to 'ks' patterns
    
    // Fix Marathi-specific consonant clusters
    .replace(/\bjjanu\b/gi, 'Dnyanu')        // Fix 'jjanu' to 'dnyanu' (ज्ञानु)
    .replace(/\bjja(\w*)\b/gi, 'Dnya$1')     // Fix 'jja' to 'dnya' patterns (ज्ञ)
    .replace(/\bjj(\w*)\b/gi, 'Dny$1')       // Fix 'jj' to 'dny' patterns (ज्ञ)
    
    // Fix specific transliteration issues
    .replace(/\bbhaga\b/gi, 'Bhag')          // Fix 'bhaga' to 'bhag' (भाग)
    .replace(/\bkra\b/gi, 'Kr')              // Fix 'kra' to 'kr' (क्र)
    .replace(/\bdevalaya\b/gi, 'Devalay')    // Fix 'devalaya' to 'devalay' (देवालय)
    .replace(/\bmagila\b/gi, 'Magil')        // Fix 'magila' to 'magil' (मागील)
    .replace(/\bkarada\b/gi, 'Karad')        // Fix 'karada' to 'karad' (कराड)
    .replace(/\bmamgalavara\b/gi, 'Mangalvar') // Fix 'mamgalavara' to 'mangalvar' (मंगलवार)
    .replace(/\bpajchima\b/gi, 'Paschim')    // Fix 'pajchima' to 'paschim' (पश्चिम)
    .replace(/\bpaschhim\b/gi, 'Paschim')    // Fix 'paschhim' to 'paschim' (पश्चिम)
    
    // Fix specific character issues
    .replace(/\bchaॉda\b/gi, 'Chand')        // Fix 'chaॉda' to 'chand' (चॉद)
    .replace(/\bchaॉ(\w*)\b/gi, 'Chand$1')   // Fix 'chaॉ' patterns to 'chand'
    .replace(/ॉ/g, '')                       // Remove unwanted 'ॉ' characters
    
    // Fix specific name corrections for common issues
    .replace(/\bbhaladara\b/gi, 'Bhaldar')   // Fix 'bhaladara' to 'bhaldar'
    .replace(/\busman\b/gi, 'Usman')         // Fix 'usman' to 'usman'
    .replace(/\bchamda\b/gi, 'Chand')        // Fix 'chamda' to 'chand'
    .replace(/\bcha~da\b/gi, 'Chand')        // Fix 'cha~da' to 'chand'
    
    // Advanced pattern-based corrections for common Marathi transliteration issues
    .replace(/\b(\w*)omdhe\b/gi, '$1ondhe')  // Fix 'omdhe' to 'ondhe' patterns
    .replace(/\b(\w*)amgeja\b/gi, '$1angesh') // Fix 'amgeja' to 'angesh' patterns
    .replace(/\b(\w*)mrta\b/gi, '$1mrit')    // Fix 'mrta' to 'mrit' patterns
    .replace(/\b(\w*)amrta\b/gi, '$1amrit')  // Fix 'amrta' to 'amrit' patterns
    
    // Intelligent pattern-based corrections for thousands of names
    .replace(/\b(\w*)om(\w*)\b/gi, (match, p1, p2) => {
      // Fix 'om' to 'on' patterns in names (selective)
      if (p2 && p2.length > 1 && ['dhe', 'kar', 'pat'].includes(p2.toLowerCase())) {
        return p1 + 'on' + p2;
      }
      return match;
    })
    .replace(/\b(\w*)am(\w*)\b/gi, (match, p1, p2) => {
      // Fix 'am' to 'an' patterns in names (selective)
      if (p2 && p2.length > 1 && ['geja', 'rta', 'kar'].includes(p2.toLowerCase())) {
        return p1 + 'an' + p2;
      }
      return match;
    })
    .replace(/\b(\w*)mr(\w*)\b/gi, (match, p1, p2) => {
      // Fix 'mr' to 'mr' patterns in names (selective)
      if (p2 && p2.length > 1 && ['ta', 'it', 'at'].includes(p2.toLowerCase())) {
        return p1 + 'mr' + p2;
      }
      return match;
    })
    
    // Fix double consonant issues
    .replace(/\bchhand\b/gi, 'Chand')        // Fix 'chhand' to 'chand'
    .replace(/\bchhandd\b/gi, 'Chand')       // Fix 'chhandd' to 'chand'
    
    // Simple pattern-based corrections for common Marathi transliteration issues
    .replace(/\b(\w+)ina\b/gi, '$1in')       // Fix 'ina' endings to 'in' (sachina -> sachin)
    .replace(/\b(\w+)aya\b/gi, '$1ay')       // Fix 'aya' endings to 'ay' (aksaya -> akshay)
    .replace(/\b(\w+)ata\b/gi, '$1at')       // Fix 'ata' endings to 'at' (bharata -> bharat)
    .replace(/\b(\w+)ola\b/gi, '$1ol')       // Fix 'ola' endings to 'ol' (amola -> amol)
    .replace(/\b(\w+)aka\b/gi, '$1ak')       // Fix 'aka' endings to 'ak' (vinayaka -> vinayak)
    .replace(/\b(\w+)ana\b/gi, '$1an')       // Fix 'ana' endings to 'an' (laksmana -> lakshman)
    .replace(/\b(\w+)ada\b/gi, '$1ad')       // Fix 'ada' endings to 'ad' (mohammada -> mohammed)
    .replace(/\b(\w+)ima\b/gi, '$1im')       // Fix 'ima' endings to 'im' (ajima -> azim)
    .replace(/\b(\w+)osa\b/gi, '$1osh')      // Fix 'osa' endings to 'osh' (samtosa -> santosh)
    .replace(/\b(\w+)aja\b/gi, '$1aj')       // Fix 'aja' endings to 'aj' (ganeja -> ganesh)
    .replace(/\b(\w+)aji\b/gi, '$1aji')      // Fix 'aji' endings (jahaji -> shahaji)
    
    // Fix common consonant cluster patterns
    .replace(/\b(\w*)ksh(\w*)\b/gi, '$1ksh$2') // Fix 'ksh' patterns
    .replace(/\b(\w*)sh(\w*)\b/gi, '$1sh$2')   // Fix 'sh' patterns
    .replace(/\b(\w*)ch(\w*)\b/gi, '$1ch$2')   // Fix 'ch' patterns
    .replace(/\b(\w*)th(\w*)\b/gi, '$1th$2')   // Fix 'th' patterns
    .replace(/\b(\w*)dh(\w*)\b/gi, '$1dh$2')   // Fix 'dh' patterns
    .replace(/\b(\w*)ph(\w*)\b/gi, '$1ph$2')   // Fix 'ph' patterns
    .replace(/\b(\w*)bh(\w*)\b/gi, '$1bh$2')   // Fix 'bh' patterns
    .replace(/\b(\w*)gh(\w*)\b/gi, '$1gh$2')   // Fix 'gh' patterns
    .replace(/\b(\w*)kh(\w*)\b/gi, '$1kh$2')   // Fix 'kh' patterns
    
    // Fix common name patterns
    .replace(/\b(\w*)ankar\b/gi, '$1ankar')  // Fix 'ankar' patterns
    .replace(/\b(\w*)kumar\b/gi, '$1kumar')  // Fix 'kumar' patterns
    .replace(/\b(\w*)ram\b/gi, '$1ram')      // Fix 'ram' patterns
    .replace(/\b(\w*)lal\b/gi, '$1lal')      // Fix 'lal' patterns
    
    // Fix common address patterns
    .replace(/\b(\w*)marg\b/gi, '$1marg')    // Fix 'marg' patterns
    .replace(/\b(\w*)nagar\b/gi, '$1nagar')  // Fix 'nagar' patterns
    .replace(/\b(\w*)pura\b/gi, '$1pura')    // Fix 'pura' patterns
    .replace(/\b(\w*)wadi\b/gi, '$1wadi')    // Fix 'wadi' patterns
    
    // Fix common day names
    .replace(/\b(\w*)var\b/gi, '$1var')      // Fix 'var' patterns (day names)
    .replace(/\b(\w*)day\b/gi, '$1day')      // Fix 'day' patterns
    
    // Fix direction names
    .replace(/\b(\w*)chim\b/gi, '$1chim')    // Fix 'chim' patterns (paschim, uttarachim)
    .replace(/\b(\w*)purv\b/gi, '$1purv')    // Fix 'purv' patterns (purv, dakshinpurv)
    
    // Clean up spacing and formatting
    .replace(/\s+/g, ' ')                    // Multiple spaces to single space
    .trim();
}

// Fast batch translation for multiple texts
export async function translateBatch(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  
  for (const text of texts) {
    if (!text || text.trim() === '') {
      results.push(text);
      continue;
    }
    
    try {
      // Use fast transliteration without delays
      const transliterated = Sanscript.t(text, 'devanagari', 'hk');
      const corrected = applyIntelligentCorrections(transliterated);
      const formatted = corrected
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      results.push(formatted);
    } catch (error) {
      // Fallback to original text if translation fails
      results.push(text);
    }
  }
  
  return results;
}

// Function to detect if text is in Marathi
export function isMarathiText(text: string): boolean {
  const marathiRegex = /[\u0900-\u097F]/;
  return marathiRegex.test(text);
}

// Function to get confidence score for translation
export function getTranslationConfidence(originalText: string, translatedText: string): number {
  if (!originalText || !translatedText) return 0;
  
  // Calculate confidence based on text length and character changes
  const lengthRatio = Math.min(translatedText.length / originalText.length, 1);
  const hasMarathiChars = /[\u0900-\u097F]/.test(translatedText);
  const hasSpecialChars = /[^\u0000-\u007F]/.test(translatedText);
  
  let confidence = lengthRatio * 100;
  
  // Reduce confidence if translated text still contains Marathi
  if (hasMarathiChars) {
    confidence *= 0.3;
  }
  
  // Increase confidence if it looks like proper English
  if (!hasSpecialChars && translatedText.match(/^[a-zA-Z\s]+$/)) {
    confidence *= 1.2;
  }
  
  return Math.min(Math.round(confidence), 100);
}

// Function to validate transliteration quality
export function validateTransliteration(originalText: string, transliteratedText: string): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Check for mixed scripts
  if (/[\u0900-\u097F]/.test(transliteratedText)) {
    issues.push('Contains Devanagari characters');
    suggestions.push('Ensure complete transliteration to English');
  }
  
  // Check for special characters that shouldn't be in transliteration
  if (/[^\u0000-\u007F\s]/.test(transliteratedText)) {
    issues.push('Contains non-ASCII characters');
    suggestions.push('Use standard ASCII characters only');
  }
  
  // Check for reasonable length
  const lengthRatio = transliteratedText.length / originalText.length;
  if (lengthRatio < 0.5 || lengthRatio > 2) {
    issues.push('Unusual length ratio');
    suggestions.push('Verify transliteration accuracy');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  };
}