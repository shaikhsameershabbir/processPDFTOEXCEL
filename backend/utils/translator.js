const Sanscript = require('@indic-transliteration/sanscript');
const { transliterate } = require('transliteration');

const translationCache = new Map();

function cleanInput(text) {
  if (!text) return '';
  return text.toString().replace(/\s+/g, ' ').trim();
}

function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(text);
}

function applyCorrections(text) {
  if (!text) return '';
  let result = text
    // Normalize to remove combining marks (accents)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/aa+/gi, 'a')
    .replace(/ii+/gi, 'i')
    .replace(/uu+/gi, 'u')
    .replace(/\s+/g, ' ')
    .replace(/\bgh/gi, 'Gh')
    .replace(/\bch/gi, 'Ch')
    .replace(/\bth/gi, 'Th')
    .replace(/\bbh/gi, 'Bh')
    .replace(/\bph/gi, 'Ph')
    .replace(/\bsh/gi, 'Sh')
    .replace(/\b(\w+)aya\b/gi, '$1ay')
    .replace(/\b(\w+)iya\b/gi, '$1iy')
    .replace(/\b(\w+)ana\b/gi, '$1an')
    .replace(/\b(\w+)ada\b/gi, '$1ad')
    .replace(/\b(\w+)asa\b/gi, '$1ash')
    .trim();

  const dictionaryReplacements = [
    { pattern: /\bPamcayata\b/gi, replacement: 'Panchayat' },
    { pattern: /\bPancayata\b/gi, replacement: 'Panchayat' },
    { pattern: /\bPancayat\b/gi, replacement: 'Panchayat' },
    { pattern: /\bPamcayat\b/gi, replacement: 'Panchayat' },
    { pattern: /\bPamcayata Samiti\b/gi, replacement: 'Panchayat Samiti' },
    { pattern: /\bMatdaan\b/gi, replacement: 'Matdan' },
    { pattern: /\bBhaga\b/gi, replacement: 'Bhag' },
    { pattern: /\bNagara\b/gi, replacement: 'Nagar' },
    { pattern: /\bAdarza\b/gi, replacement: 'Adarsh' },
    { pattern: /\bAdarsha\b/gi, replacement: 'Adarsh' },
    { pattern: /\bSamta\b/gi, replacement: 'Sant' },
    { pattern: /\bRohidash\b/gi, replacement: 'Rohidas' },
    { pattern: /\bRohidasa\b/gi, replacement: 'Rohidas' },
    { pattern: /\bKaryalay\b/gi, replacement: 'Karyalaya' },
    { pattern: /\bKaryalya\b/gi, replacement: 'Karyalaya' },
    { pattern: /\bSamiti\b/gi, replacement: 'Samiti' },
    { pattern: /\bPanca\b/gi, replacement: 'Pancha' },
    { pattern: /\bPamca\b/gi, replacement: 'Pancha' },
    { pattern: /\bcaya\b/gi, replacement: 'chaya' },
    { pattern: /\bcayi\b/gi, replacement: 'chayi' }
  ];

  dictionaryReplacements.forEach(({ pattern, replacement }) => {
    result = result.replace(pattern, replacement);
  });

  // Fix remaining standalone 'c' between vowels (turn into 'ch')
  result = result.replace(/([aeiou])c([aeiou])/gi, (_, p1, p2) => `${p1}ch${p2}`);
  // Fix 'z' sounding like 'sh'
  result = result
    .replace(/za/gi, 'sha')
    .replace(/zi/gi, 'shi')
    .replace(/zu/gi, 'shu');

  return result;
}

function formatTitleCase(text) {
  return text
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function transliterateText(text) {
  const cleaned = cleanInput(text);
  if (!cleaned) return '';

  if (!hasDevanagari(cleaned)) {
    return formatTitleCase(cleaned);
  }

  if (translationCache.has(cleaned)) {
    return translationCache.get(cleaned);
  }

  let transliterated = '';
  try {
    transliterated = Sanscript.t(cleaned, 'devanagari', 'hk');
  } catch (error) {
    try {
      transliterated = transliterate(cleaned, { unknown: '?', replace: [] });
    } catch (fallbackError) {
      transliterated = cleaned;
    }
  }

  const corrected = formatTitleCase(applyCorrections(transliterated));
  translationCache.set(cleaned, corrected);
  return corrected;
}

function transliterateBatch(texts) {
  if (!Array.isArray(texts)) return [];
  return texts.map(text => transliterateText(text));
}

module.exports = {
  transliterateText,
  transliterateBatch,
};


