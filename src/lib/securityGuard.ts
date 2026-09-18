/**
 * Security & Content Moderation Guard
 * 1. Deteksi Kata Toxic / Vulgar (Bahasa Indonesia & English)
 * 2. Deteksi Script Berbahaya & Exploit Payloads (XSS, SQLi, Command Injection)
 */

export type ViolationType = 'toxic' | 'malicious_script';

export interface SecurityCheckResult {
  safe: boolean;
  violationType?: ViolationType;
  label?: string;
  reason?: string;
  matchedContent?: string;
}

// 1. Pola Script Berbahaya, XSS, Code Execution, SQLi, & Exploit Injections
const MALICIOUS_SCRIPT_PATTERNS: { regex: RegExp; label: string }[] = [
  // XSS & HTML Script Tags
  { regex: /<\s*script\b[^>]*>/i, label: 'Tag HTML <script> Injection' },
  { regex: /<\s*\/\s*script\s*>/i, label: 'Tag Penutup </script> Injection' },
  { regex: /javascript\s*:/i, label: 'Protokol Berbahaya javascript:' },
  { regex: /vbscript\s*:/i, label: 'Protokol Berbahaya vbscript:' },
  { regex: /data\s*:\s*text\/html/i, label: 'Data URI HTML Injection' },

  // Dangerous HTML Inline Event Handlers
  {
    regex: /\bon(error|load|click|mouseover|mouseenter|focus|blur|change|submit|input|keydown|keyup)\s*=\s*['"][^'"]*['"]/i,
    label: 'Inline HTML Event Handler (onerror, onload, onclick, dll)',
  },
  {
    regex: /<\s*(iframe|object|embed|svg|img|body|meta|link|style|base|input|form)\b[^>]*\bon(error|load|click|focus)/i,
    label: 'Tag HTML Berbahaya dengan Event Handler',
  },
  { regex: /<\s*iframe\b[^>]*>/i, label: 'Tag <iframe src=...> Injection' },
  { regex: /<\s*object\b[^>]*>/i, label: 'Tag <object> Injection' },
  { regex: /<\s*embed\b[^>]*>/i, label: 'Tag <embed> Injection' },

  // Execution Functions & DOM Cookie/Storage Access
  { regex: /\beval\s*\(\s*.*?\s*\)/i, label: 'Eksekusi Kode Dinamis eval()' },
  { regex: /\bFunction\s*\(\s*['"].*?['"]\s*\)/i, label: 'Konstruktor Function() Injection' },
  { regex: /\bdocument\s*\.\s*(cookie|write|writeln|location)\b/i, label: 'Akses Berbahaya document.cookie / document.location' },
  { regex: /\bwindow\s*\.\s*(location|open)\b/i, label: 'Manipulasi window.location' },
  { regex: /\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)\b/i, label: 'Eksploitasi Akses LocalStorage / SessionStorage' },

  // SQL Injection Payloads
  { regex: /('|"|`)\s*(or|and)\s+('?\w+'?|\d+)\s*=/i, label: "SQL Injection (' OR '1'='1)" },
  { regex: /\b(or|and)\s+('?\w+'?|\d+)\s*=\s*('?\w+'?|\d+)/i, label: "SQL Injection (OR 1=1 / OR '1'='1')" },
  { regex: /('|"|`)\s*(or|and)\s+('|"|`)/i, label: "SQL Injection Quote Bypass (' OR ')" },
  { regex: /\bUNION\s+(ALL\s+)?SELECT\b/i, label: 'SQL Injection UNION SELECT' },
  { regex: /\bDROP\s+(TABLE|DATABASE)\b/i, label: 'SQL Injection DROP TABLE/DATABASE' },
  { regex: /\bINSERT\s+INTO\b/i, label: 'SQL Injection INSERT INTO' },
  { regex: /;\s*--\s*$/m, label: 'SQL Comment Injection (--)' },

  // Shell / OS Command Injection
  { regex: /(;|\||&&)\s*(rm\s+-rf|shutdown|cat\s+\/etc\/passwd|powershell|curl\s+.*?\|\s*sh|wget\s+.*?\|\s*sh)/i, label: 'Percobaan Command Injection OS / Shell' },

  // Template Injection (SSTI)
  { regex: /\{\{\s*constructor\s*\.\s*constructor\s*\(.*?\}\}/i, label: 'Server-Side Template Injection (SSTI)' },
  { regex: /<%\s*=.*?\s*%>/i, label: 'Server Template Tag Injection' },
];

// 2. Daftar Kata Kasar / Toxic / Vulgar (Bahasa Indonesia & English)
// Kata-kata terisolasi dengan word-boundary untuk mencegah false-positives
const INDONESIAN_TOXIC_WORDS = [
  // Organ kelamin & kata seksual vulgar
  'kontol', 'kntl', 'k0nt0l', 'memek', 'mmk', 'm3m3k', 'jembut', 'jmbt', 'ngentot', 'ngentod',
  'ngewe', 'itil', 'peler', 'pantek', 'puki', 'pukimak', 'kimak', 'tetek', 'toket', 'pepek',
  'colmek', 'coli', 'sange', 'ngocok', 'bispak', 'lonte', 'perek', 'pelacur', 'pecun',
  'cuki', 'sundal', 'jablay', 'tempik', 'kentu',
  // Makian & umpatan kotor
  'bangsat', 'bajingan', 'kampret', 'keparat', 'sialan', 'bedebah', 'brengsek',
  'jancuk', 'jancok', 'dancok', 'cok',
  'asu',
];

const ENGLISH_TOXIC_WORDS = [
  // Profanities & Vulgarities
  'fuck', 'fucking', 'fucker', 'fuckoff', 'fucked', 'motherfucker', 'motherfucking',
  'shit', 'bullshit', 'shitty',
  'bitch', 'bitches', 'bitching',
  'asshole', 'jackass', 'dumbass',
  'cunt', 'cunts',
  'dick', 'dicks', 'cock', 'cocks',
  'pussy', 'pussies',
  'bastard', 'bastards',
  'slut', 'sluts', 'whore', 'whores',
  'nigger', 'nigga', 'faggot', 'fag',
  'blowjob', 'handjob', 'dildo', 'deepthroat',
  'retard', 'retarded',
];

// Frasa Toxic / Pelecehan / Makian Terarah
const TOXIC_PHRASES = [
  'dasar anjing', 'anjing lu', 'anak anjing lu', 'dasar babi', 'babi lu',
  'goblok lu', 'dasar goblok', 'tolol lu', 'dasar tolol', 'bego lu', 'dasar bego',
  'idiot lu', 'mati aja lu', 'fuck you', 'fuck u', 'go to hell', 'eat shit',
  'pantek kau', 'puki mak kau', 'son of a bitch', 'piece of shit',
];

/**
 * Normalisasi teks untuk deteksi leetspeak & penyamaran karakter
 */
function normalizeTextForDetection(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[$]/g, 's')
    .replace(/[0]/g, 'o')
    .replace(/[1!]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sensor kata toxic agar sopan saat ditampilkan di Surat Peringatan
 * Contoh: "kontol" -> "k***ol", "fuck" -> "f**k"
 */
export function censorWord(word: string): string {
  if (word.length <= 2) return word[0] + '*';
  const first = word[0];
  const last = word[word.length - 1];
  const middle = '*'.repeat(Math.max(1, word.length - 2));
  return `${first}${middle}${last}`;
}

/**
 * Deteksi apakah teks memuat script berbahaya / exploit payloads
 */
export function detectMaliciousScript(input: string): SecurityCheckResult {
  if (!input || !input.trim()) {
    return { safe: true };
  }

  for (const item of MALICIOUS_SCRIPT_PATTERNS) {
    const match = input.match(item.regex);
    if (match) {
      return {
        safe: false,
        violationType: 'malicious_script',
        label: item.label,
        reason: 'Percobaan memasukkan skrip atau kode berbahaya yang dapat merusak website (XSS/Exploit/Injection)',
        matchedContent: match[0],
      };
    }
  }

  return { safe: true };
}

/**
 * Deteksi apakah teks memuat kata atau frasa toxic / vulgar
 */
export function detectToxicContent(input: string): SecurityCheckResult {
  if (!input || !input.trim()) {
    return { safe: true };
  }

  const rawLower = input.toLowerCase();
  const normalized = normalizeTextForDetection(input);

  // 1. Cek Frasa Toxic Spesifik Terlebih Dahulu
  for (const phrase of TOXIC_PHRASES) {
    if (rawLower.includes(phrase) || normalized.includes(phrase)) {
      return {
        safe: false,
        violationType: 'toxic',
        label: 'Frasa Makian / Umpatan Kasar Terarah',
        reason: 'Terdeteksi frasa umpatan kasar atau pelecehan yang melanggar aturan etika komunitas',
        matchedContent: phrase,
      };
    }
  }

  // 2. Tokenisasi kata-kata dengan pemisah tanda baca & spasi
  const words = rawLower.split(/[^a-z0-9]+/i).filter(Boolean);
  const normalizedWords = normalized.split(/[^a-z0-9]+/i).filter(Boolean);

  const checkWordList = (wordList: string[]): string | null => {
    for (const bad of wordList) {
      // Periksa exact match pada kata mentah maupun hasil de-leetspeak
      if (words.includes(bad) || normalizedWords.includes(bad)) {
        return bad;
      }
      // Periksa pengulangan karakter (misal: "fuuuuck", "kontooool", "shiiiit")
      for (const w of words) {
        const compressed = w.replace(/(.)\1+/g, '$1');
        if (compressed === bad) return w;
      }
    }
    return null;
  };

  // Cek kata toxic Indonesia
  const matchedIndonesian = checkWordList(INDONESIAN_TOXIC_WORDS);
  if (matchedIndonesian) {
    return {
      safe: false,
      violationType: 'toxic',
      label: 'Kata Kasar / Vulgar (Bahasa Indonesia)',
      reason: 'Terdeteksi penggunaan kata kotor, vulgar, atau asusila dalam bahasa Indonesia',
      matchedContent: matchedIndonesian,
    };
  }

  // Cek kata toxic Inggris
  const matchedEnglish = checkWordList(ENGLISH_TOXIC_WORDS);
  if (matchedEnglish) {
    return {
      safe: false,
      violationType: 'toxic',
      label: 'Profanity / Vulgar Word (English)',
      reason: 'Terdeteksi penggunaan kata umpatan atau profanitas bahasa Inggris',
      matchedContent: matchedEnglish,
    };
  }

  return { safe: true };
}

/**
 * Pemeriksaan Terpadu:
 * 1. Skrip Berbahaya diperiksa terlebih dahulu (kategori pelanggaran tertinggi -> Banned Selamanya)
 * 2. Kata Toxic / Vulgar diperiksa berikutnya (kategori pelanggaran etika -> SP 1..3, 3x = Banned 1 Hari)
 */
export function checkInputSecurity(input: string): SecurityCheckResult {
  if (!input || !input.trim()) {
    return { safe: true };
  }

  // Skrip berbahaya harus dicegah paling awal
  const scriptCheck = detectMaliciousScript(input);
  if (!scriptCheck.safe) {
    return scriptCheck;
  }

  // Kata toxic / vulgar
  const toxicCheck = detectToxicContent(input);
  if (!toxicCheck.safe) {
    return toxicCheck;
  }

  return { safe: true };
}
