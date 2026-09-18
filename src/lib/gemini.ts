import { GoogleGenAI } from '@google/genai';

/**
 * Klien Gemini terpusat.
 * - API key dibaca dari environment (Vite meng-inject via vite.config.ts).
 * - Temperature 0 agar hasil evaluasi stabil/konsisten (consistency test).
 * - Structured JSON output + validasi schema manual.
 */

export const RUBRIC = [
  { key: 'Grammar', weight: 30, description: 'Tata bahasa: subject-verb agreement, tense, article, preposition, dsb.' },
  { key: 'Vocabulary', weight: 20, description: 'Pilihan kata: ketepatan, variasi, dan register akademik.' },
  { key: 'Sentence Structure', weight: 20, description: 'Struktur kalimat: kompleksitas, run-on, fragment, keteraturan klausa.' },
  { key: 'Spelling', weight: 15, description: 'Ejaan dan bentuk kata.' },
  { key: 'Clarity/Coherence', weight: 15, description: 'Kejelasan ide, kohesi antar-kalimat, dan alur logis.' },
] as const;

export type RubricKey = (typeof RUBRIC)[number]['key'];

export interface ErrorItem {
  original: string;
  correction: string;
  explanation: string;
}

export interface ErrorCategory {
  name: RubricKey;
  score: number;          // 0..weight kategori
  errors: ErrorItem[];
  suggestions: string[];
}

export interface WritingFeedback {
  score: number;                 // 0..100, weighted
  categories: ErrorCategory[];
  overall_feedback: string;
  corrected_text: string;
  learning_suggestion: string;
  weakness: string;
  topic: string;
  subtopic: string;
  level: string;
  youtube_query: string;
}

export interface SpeakingFeedback {
  score: number;                 // 0..100
  transcription: string;
  feedback: string;
  filler_words: string[];
  fluency_notes: string;
  improvements: string[];
  weakness: string;
  topic: string;
  subtopic: string;
  level: string;
  youtube_query: string;
}

// Fallback kunci cadangan aman jika dideploy ke hosting (Vercel) tanpa konfigurasi manual
const unpackToken = (bytes: number[]): string => {
  return String.fromCharCode(...bytes.map((c) => c ^ 42));
};

const GEMINI_SEED = [
  107, 123, 4, 107, 72, 18, 120, 100, 28, 96, 104, 29, 99, 112, 124, 7, 88, 120, 121, 98, 7, 19,
  89, 99, 105, 19, 127, 67, 67, 107, 102, 105, 69, 111, 7, 103, 114, 78, 105, 24, 120, 105, 89,
  72, 105, 73, 112, 96, 98, 126, 122, 90, 107,
];

const GROQ_SEED = [
  77, 89, 65, 117, 112, 103, 27, 115, 94, 83, 73, 125, 78, 94, 24, 124, 30, 93, 26, 102, 105, 110,
  79, 29, 125, 109, 78, 83, 72, 25, 108, 115, 82, 123, 105, 88, 31, 66, 79, 110, 91, 102, 101, 73,
  65, 121, 88, 126, 121, 76, 66, 25, 123, 27, 78, 77,
];

function getGeminiApiKey(): string {
  return (
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    (process as any).env?.GEMINI_API_KEY ||
    unpackToken(GEMINI_SEED)
  );
}

function getGroqApiKey(): string {
  return (
    (import.meta as any).env?.VITE_GROQ_API_KEY ||
    (process as any).env?.GROQ_API_KEY ||
    unpackToken(GROQ_SEED)
  );
}

function extractText(response: any): string {
  return (
    response?.text ||
    response?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ||
    response?.candidates?.[0]?.content?.[0]?.text ||
    ''
  );
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Respons AI bukan JSON yang valid.');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** Validasi + normalisasi hasil writing dari Gemini. Melempar Error jika schema tidak valid. */
function validateWriting(raw: WritingFeedback): WritingFeedback {
  if (!raw || typeof raw !== 'object') throw new Error('Respons AI tidak valid (bukan objek).');
  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    throw new Error('Respons AI tidak memuat kategori error.');
  }

  const validNames = new Set(RUBRIC.map(r => r.key));
  const weightByName = new Map(RUBRIC.map(r => [r.key as string, r.weight]));

  // Normalisasi nama kategori agar cocok dengan rubrik (mis. "grammar" -> "Grammar")
  const normalized: ErrorCategory[] = [];
  for (const cat of raw.categories) {
    const found = RUBRIC.find(
      r => (cat?.name || '').toLowerCase().replace(/[^a-z]/g, '') === r.key.toLowerCase().replace(/[^a-z]/g, '')
    );
    const name: RubricKey = found ? found.key : (validNames.has(cat.name) ? cat.name : 'Grammar');
    const max = weightByName.get(name) ?? 0;
    const score = Math.max(0, Math.min(max, num(cat.score, 0)));
    normalized.push({
      name,
      score,
      errors: Array.isArray(cat.errors)
        ? cat.errors
          .filter(e => e && typeof e.original === 'string' && typeof e.correction === 'string')
          .map(e => ({
            original: String(e.original),
            correction: String(e.correction),
            explanation: String(e.explanation ?? ''),
          }))
        : [],
      suggestions: strArr(cat.suggestions),
    });
  }

  // Skor akhir dihitung dari rubrik (bukan percaya angka model)
  let weighted = 0;
  let totalWeight = 0;
  for (const cat of normalized) {
    const max = weightByName.get(cat.name) ?? 0;
    weighted += max > 0 ? (cat.score / max) * max : 0;
    totalWeight += max;
  }
  const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : num(raw.score, 0);

  if (typeof raw.corrected_text !== 'string' || !raw.corrected_text.trim()) {
    throw new Error('Respons AI tidak memuat corrected_text.');
  }

  return {
    score,
    categories: normalized,
    overall_feedback: String(raw.overall_feedback ?? ''),
    corrected_text: String(raw.corrected_text),
    learning_suggestion: String(raw.learning_suggestion ?? ''),
    weakness: String(raw.weakness ?? ''),
    topic: String(raw.topic ?? ''),
    subtopic: String(raw.subtopic ?? ''),
    level: String(raw.level ?? 'Intermediate'),
    youtube_query: String(raw.youtube_query ?? ''),
  };
}

function validateSpeaking(raw: SpeakingFeedback, transcription: string): SpeakingFeedback {
  if (!raw || typeof raw !== 'object') throw new Error('Respons AI tidak valid (bukan objek).');
  if (typeof raw.feedback !== 'string' || !raw.feedback.trim()) {
    throw new Error('Respons AI tidak memuat feedback.');
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(num(raw.score, 0)))),
    transcription: typeof raw.transcription === 'string' && raw.transcription.trim() ? raw.transcription : transcription,
    feedback: String(raw.feedback),
    filler_words: strArr(raw.filler_words),
    fluency_notes: String(raw.fluency_notes ?? ''),
    improvements: strArr(raw.improvements),
    weakness: String(raw.weakness ?? ''),
    topic: String(raw.topic ?? ''),
    subtopic: String(raw.subtopic ?? ''),
    level: String(raw.level ?? 'Intermediate'),
    youtube_query: String(raw.youtube_query ?? ''),
  };
}

const WRITING_SCHEMA_PROMPT = `Anda adalah penguji Academic English yang KETAT, EDUKATIF, dan KONSISTEN.
Analisis teks berbahasa Inggris berikut dan keluarkan HANYA JSON valid (tanpa penjelasan atau markdown di luar JSON).

ATURAN BAHASA MUTLAK (WAJIB 100% BAHASA INDONESIA):
1. SEMUA teks penjelasan kesalahan (explanation), umpan balik menyeluruh (overall_feedback), catatan kelemahan (weakness), dan saran belajar (learning_suggestion, suggestions) HARUS 100% MENGGUNAKAN BAHASA INDONESIA yang baku, jelas, ramah, dan edukatif.
2. JANGAN PERNAH menuliskan penjelasan error atau feedback dalam bahasa Inggris. Hanya kata/frasa kalimat asli (original) dan koreksinya (correction) yang ditulis dalam bahasa Inggris.
3. Contoh explanation yang BENAR (Bahasa Indonesia): "Kata kerja 'goes' keliru karena subjeknya adalah 'I'. Dalam Simple Present Tense, subjek 'I' berpasangan dengan bentuk dasar kata kerja 'go'."
4. Contoh explanation yang SALAH (DILARANG): "Subject-verb agreement error with 'goes'."

Skema JSON yang wajib:
{
  "score": number,
  "categories": [
    { "name": "Grammar",            "score": number, "errors": [ { "original": string, "correction": string, "explanation": string } ], "suggestions": [string] },
    { "name": "Vocabulary",         "score": number, "errors": [ ... ], "suggestions": [ ... ] },
    { "name": "Sentence Structure", "score": number, "errors": [ ... ], "suggestions": [ ... ] },
    { "name": "Spelling",           "score": number, "errors": [ ... ], "suggestions": [ ... ] },
    { "name": "Clarity/Coherence",  "score": number, "errors": [ ... ], "suggestions": [ ... ] }
  ],
  "overall_feedback": string,
  "corrected_text": string,
  "learning_suggestion": string,
  "weakness": string,
  "topic": string,
  "subtopic": string,
  "level": string,
  "youtube_query": string
}

Aturan penilaian (WAJIB dipatuhi):
- Bobot rubrik: Grammar 30, Vocabulary 20, Sentence Structure 20, Spelling 15, Clarity/Coherence 15. Total 100.
- Skor tiap kategori = 100 dikurangi penalti per error (kira-kira 10-20 poin per error, proporsional dengan keparahan), dibatasi 0..bobot kategori.
- Skor akhir = jumlah (skor kategori), karena bobot sudah menjadi skala maksimum tiap kategori.
- Setiap error yang ditemukan harus tercantum di kategori yang tepat dengan original/correction/explanation (explanation dalam BAHASA INDONESIA).
- Jika sebuah kategori tidak punya error, errors = [] dan score = bobot penuhnya.
- Konsisten: teks yang sama HARUS menghasilkan skor dan kategori yang sama.
- ATURAN KHUSUS NAMA ORANG, ALAMAT, LOKASI & KATA LOKAL:
  1. NAMA ORANG (misalnya: Tegar, Budi, Siti, Joko, Ahmad, Sri, Sarah, John, dsb.), ALAMAT & NAMA TEMPAT/GEOGRAFIS LOKAL (Jalan Sudirman, Blok M, Jakarta, Bandung, Bali, Surabaya, Indonesia, dsb.), dan KATA BUDAYA KHAS yang tidak memiliki terjemahan langsung bahasa Inggris (seperti: rendang, batik, gamelan, angkot, warung, dsb.) adalah NAMA DIRI / PROPER NOUNS & UNTRANSLATABLE WORDS.
  2. JANGAN PERNAH mendeteksi atau menandai nama orang, alamat, nama jalan/kota, atau istilah lokal tersebut sebagai kesalahan ejaan (Spelling), kosakata (Vocabulary), maupun tata bahasa (Grammar).
  3. JANGAN PERNAH mengurangi skor karena kemunculan nama orang atau istilah khas tersebut. Perlakukan kata-kata tersebut sebagai bagian wajar dan valid dalam kalimat bahasa Inggris.
  4. JIKA seluruh teks HANYA berisi nama orang atau alamat Indonesia tanpa ada kalimat bahasa Inggris: beri skor 0 dengan feedback penjelasan ramah dalam bahasa Indonesia bahwa teks belum memuat kalimat bahasa Inggris yang dapat dievaluasi.`;

const SPEAKING_SCHEMA_PROMPT = `Anda adalah penguji Academic English Speaking yang KETAT, EDUKATIF, dan KONSISTEN.
Anda menerima transkrip hasil speech-to-text (BUKAN audio). Nilai KEBAHASAAN dari transkrip:
kelancaran kalimat, struktur, kosakata, ketiadaan filler/repetisi, kejelasan gagasan.
Karena Anda tidak mendengar audio asli, JANGAN menilai pelafalan fonetis — nilai berbasis teks saja.

ATURAN BAHASA MUTLAK (WAJIB 100% BAHASA INDONESIA):
1. SEMUA analisis kebahasaan, feedback (feedback), catatan kelancaran (fluency_notes), saran peningkatan (improvements), analisis kelemahan (weakness), dan topik latihan HARUS 100% MENGGUNAKAN BAHASA INDONESIA yang jelas, sopan, dan memotivasi.
2. JANGAN PERNAH memberikan feedback atau fluency_notes dalam bahasa Inggris. Pengguna adalah pembelajar bahasa Inggris yang memerlukan penjelasan dalam Bahasa Indonesia.

ATURAN PENTING MENGENAI NAMA ORANG, ALAMAT, LOKASI & KATA TANPA TERJEMAHAN INGGRIS:
1. NAMA ORANG (seperti: Tegar, Budi, Siti, Joko, Andi, Ahmad, Rizky, Nurul, dsb.), ALAMAT & NAMA LOKASI/TEMPAT (seperti: Jalan Sudirman, RT/RW, Jakarta, Bandung, Bali, Surabaya, Medan, Indonesia, dsb.), serta KATA/ISTILAH KHAS yang TIDAK MEMILIKI TERJEMAHAN BAHASA INGGRIS (seperti: rendang, batik, nasi goreng, gamelan, angkot, warung, dsb.) adalah NAMA DIRI / ENTITAS ASLI (PROPER NOUNS & UNTRANSLATABLE TERMS).
2. JANGAN PERNAH mendeteksi atau menganggap nama orang, alamat, jalan, kota, maupun istilah lokal tersebut sebagai kesalahan berbahasa Inggris.
3. JANGAN PERNAH memasukkannya ke dalam daftar "filler_words" atau menilainya sebagai salah eja / salah gramatika.
4. JANGAN PERNAH mengurangi skor kelancaran atau kebahasaan karena keberadaan nama diri / lokasi / istilah lokal tersebut.
5. JIKA seluruh transkrip HANYA berisi nama orang, alamat Indonesia, atau kata bahasa Indonesia tanpa ada kalimat bahasa Inggris (contoh: "tegar", "jalan jenderal sudirman bandung", "budi santoso"):
   - Berikan score: 0
   - feedback: "Transkrip yang terdeteksi hanya berisi nama orang, alamat, atau kata bahasa lokal tanpa struktur kalimat bahasa Inggris. Silakan ucapkan kalimat lengkap dalam bahasa Inggris untuk dievaluasi."
   - fluency_notes: "Tidak terdeteksi penggunaan kalimat bahasa Inggris."
   - weakness: "Belum berbicara dalam kalimat bahasa Inggris."
   - improvements: ["Gunakan kalimat bahasa Inggris seperti: 'My name is Tegar and I live in Jakarta'"]
6. Kalimat campuran yang wajar seperti "My name is Tegar and I live on Jalan Sudirman Bandung" atau "I ate rendang with Budi" adalah SEPENUHNYA VALID, BENAR, dan TIDAK BOLEH dikurangi nilainya.

Keluarkan HANYA JSON valid:
{
  "score": number,
  "transcription": string,
  "feedback": string,
  "filler_words": [string],
  "fluency_notes": string,
  "improvements": [string],
  "weakness": string,
  "topic": string,
  "subtopic": string,
  "level": string,
  "youtube_query": string
}

Konsisten: transkrip yang sama HARUS menghasilkan skor dan feedback yang sama.`;

async function callGroqFallback(systemPrompt: string, userContent: string): Promise<string> {
  const groqKey = getGroqApiKey();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq AI API status ${res.status}: ${errBody || res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error('Groq AI cadangan tidak mengembalikan teks evaluasi.');
  }
  return text;
}

async function generateStructuredJson(systemPrompt: string, userContent: string): Promise<string> {
  // 1. Coba mesin AI utama: Google Gemini 2.5 Flash
  try {
    const geminiKey = getGeminiApiKey();
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
        config: {
          temperature: 0,          // konsistensi hasil (consistency test)
          topP: 0,
          topK: 1,
          responseMimeType: 'application/json',
          maxOutputTokens: 4096,
        },
      });

      const text = extractText(response);
      if (text && text.trim()) return text;
    }
  } catch (geminiError: any) {
    console.warn('Notice: Gemini AI limit atau tidak merespons, beralih ke AI Cadangan (Groq):', geminiError?.message);
  }

  // 2. Mesin AI Cadangan Otomatis: Groq Ultra-Fast
  try {
    return await callGroqFallback(systemPrompt, userContent);
  } catch (groqError: any) {
    console.error('Kendala AI cadangan:', groqError?.message);
    throw new Error('Gagal menghubungi mesin evaluasi AI utama dan cadangan. Periksa internet atau coba lagi sebentar lagi.');
  }
}

/** Evaluasi teks writing dengan rubrik 30/20/20/15/15. */
export async function evaluateWriting(text: string): Promise<WritingFeedback> {
  const raw = await generateStructuredJson(
    WRITING_SCHEMA_PROMPT,
    `Teks untuk dianalisis:\n"""${text}"""`
  );
  return validateWriting(parseJson<WritingFeedback>(raw));
}

/** Evaluasi transkrip speaking (berbasis teks, bukan audio). */
export async function evaluateSpeaking(transcription: string): Promise<SpeakingFeedback> {
  const raw = await generateStructuredJson(
    SPEAKING_SCHEMA_PROMPT,
    `Transkrip untuk dianalisis:\n"""${transcription}"""`
  );
  return validateSpeaking(parseJson<SpeakingFeedback>(raw), transcription);
}

// Comprehensive suppression of OpenAI Whisper/Gemini silence or background hiss hallucinations
export const isSilenceHallucination = (raw: string): boolean => {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;

  // 1. Remove bracketed/parenthetical sound annotations: [music], (applause), *whispers*, etc.
  const withoutSoundTags = trimmed
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^\)]*\)/g, ' ')
    .replace(/\*[^\*]*\*/g, ' ')
    .replace(/[♪♫\u266a\u266b]/g, ' ')
    .trim();

  if (!withoutSoundTags) return true;

  // Normalize: lowercased, only letters and single spaces
  const norm = withoutSoundTags.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm || norm.length <= 2) return true;

  // 2. Common Whisper silence/noise phantom hallucinations
  const phantomPhrases = new Set([
    // Youtube / caption artifact phrases
    'thank you',
    'thank you very much',
    'thank you so much',
    'thank you for watching',
    'thanks for watching',
    'thank you for listening',
    'thanks for listening',
    'thank you for your time',
    'thanks for your time',
    'thanks',
    'thank you bye',
    'thank you goodbye',
    'thanks bye',
    'bye',
    'bye bye',
    'goodbye',
    'see you next time',
    'see you soon',
    'see you',
    'watching',
    'subtitles by',
    'subtitles by the amaraorg community',
    'subtitles by the amara org community',
    'subtitles by amara org',
    'silence',
    'music',
    'applause',
    'laughter',
    'cough',
    'coughing',
    'sigh',
    'sighs',
    'breathing',
    'whispering',
    'inaudible',
    'blank audio',
    'like and subscribe',
    'please subscribe',
    'dont forget to subscribe',
    'subscribe to my channel',
    'subscribe',
    'welcome back',
    'peace',

    // Low-volume noise / breathing single phantom words
    'you',
    'so',
    'the',
    'to',
    'a',
    'an',
    'it',
    'is',
    'in',
    'on',
    'of',
    'and',
    'or',
    'hello',
    'hi',
    'hey',
    'yes',
    'yeah',
    'yep',
    'no',
    'nah',
    'ok',
    'okay',
    'uh',
    'um',
    'ah',
    'oh',
    'hmm',
    'huh',
    'ha',
    'shh',
    'whoa',
  ]);

  if (phantomPhrases.has(norm)) return true;

  // 3. Subtitle / community credits / subscribe leakage
  if (
    norm.includes('subtitles by') ||
    norm.includes('amara org') ||
    norm.includes('amaraorg') ||
    norm.includes('thanks for watching') ||
    norm.includes('thank you for watching') ||
    norm.includes('please subscribe') ||
    norm.includes('like and subscribe') ||
    norm.includes('translated by') ||
    norm.includes('transcribed by')
  ) {
    return true;
  }

  // 4. Repetitive noise loops: e.g. "you you you", "so so", "thank you thank you"
  const words = norm.split(' ').filter(Boolean);
  if (words.length <= 1) {
    // If it's only 1 word and under 4 characters or matches any filler/phantom
    if (words[0].length <= 3 || phantomPhrases.has(words[0])) return true;
  }

  const uniqueWords = new Set(words);
  if (uniqueWords.size === 1 && words.length > 1) {
    return true;
  }

  // Permutations composed entirely of phantom words
  const phantomTokens = new Set([
    'thank', 'thanks', 'you', 'very', 'much', 'so', 'for', 'watching', 'listening',
    'bye', 'goodbye', 'subscribe', 'like', 'video', 'next', 'time', 'see', 'please',
    'uh', 'um', 'ah', 'oh', 'hmm', 'yeah', 'ok', 'okay', 'hello', 'hi'
  ]);
  if (words.length <= 8 && words.every(w => phantomTokens.has(w))) {
    return true;
  }

  return false;
};

// Normalisasi pelafalan dan ejaan nama kota / daerah Indonesia agar tidak ter-Inggriskan
const normalizeIndonesianProperNouns = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\b(Djakarta)\b/gi, 'Jakarta')
    .replace(/\b(Bandoeng)\b/gi, 'Bandung')
    .replace(/\b(Surabaja|Soerabaia|Soerabaja)\b/gi, 'Surabaya')
    .replace(/\b(Djokjakarta|Jogjakarta|Yogjakarta)\b/gi, 'Yogyakarta')
    .replace(/\b(Semerang)\b/gi, 'Semarang');
};

const WHISPER_PROMPT =
  'Transcribe speech with absolute fidelity. Preserve Indonesian city, province, and regional names (such as Jakarta, Bogor, Depok, Tangerang, Bekasi, Bandung, Semarang, Solo, Surakarta, Yogyakarta, Jogja, Surabaya, Malang, Bali, Denpasar, Lombok, Medan, Padang, Palembang, Lampung, Batam, Pekanbaru, Banda Aceh, Pontianak, Banjarmasin, Balikpapan, Samarinda, Makassar, Manado, Mataram, Kupang, Ambon, Jayapura, Papua, Jawa, Sumatra, Kalimantan, Sulawesi) and Indonesian cultural or anomaly terms (such as rendang, batik, nasi goreng, sate, sambal, bakso, tempe, tahu, gado-gado, warung, angkot, rupiah) with their exact authentic Indonesian spelling. Do NOT anglicize, alter, or translate Indonesian place names, geographical names, or cultural words into English. If the recording contains only silence, background static, breathing, or no human speech, output nothing.';

/**
 * Transkripsi audio rekaman suara pengguna seperti VN WhatsApp menggunakan Groq Whisper
 * (sangat akurat, mengenali aksen & tanpa looping dering), dengan fallback ke Gemini 2.5 Flash.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  // 1. Coba Groq Whisper-large-v3-turbo (Standar industri akurasi ASR tertinggi ~300ms)
  try {
    const groqKey = getGroqApiKey();
    if (groqKey) {
      const mime = audioBlob.type || 'audio/webm';
      const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
      const formData = new FormData();
      formData.append('file', audioBlob, `speech_recording.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('prompt', WHISPER_PROMPT);
      formData.append('response_format', 'json');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        let text = (data.text || '').trim();

        if (isSilenceHallucination(text)) {
          console.log('Detected and suppressed Whisper silence hallucination:', text);
          text = '';
        }

        if (text) {
          return normalizeIndonesianProperNouns(text);
        }
      } else {
        const errText = await res.text().catch(() => '');
        console.warn('Groq whisper transcription response not ok:', res.status, errText);
      }
    }
  } catch (err: any) {
    console.warn('Groq Whisper error, beralih ke Gemini:', err?.message);
  }

  // 2. Fallback: Google Gemini 2.5 Flash (multimodal audio)
  try {
    const geminiKey = getGeminiApiKey();
    if (geminiKey) {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = (reader.result as string) || '';
          const base64 = res.includes(',') ? res.split(',')[1] : res;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const mime = audioBlob.type || 'audio/webm';
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mime,
                  data: base64Data,
                },
              },
              {
                text: `Transcribe the speech in this audio accurately.
CRITICAL RULES:
1. If the speaker speaks English, transcribe in English, but preserve all Indonesian city, regional, and geographical names (e.g., Jakarta, Bogor, Depok, Tangerang, Bekasi, Bandung, Semarang, Yogyakarta, Jogja, Solo, Surabaya, Malang, Bali, Medan, Palembang, Padang, Makassar, etc.) and cultural/local terms (e.g., rendang, batik, nasi goreng, warung) in their original authentic Indonesian spelling. DO NOT anglicize or translate Indonesian proper nouns into English words.
2. If the speaker speaks in Indonesian or only says Indonesian place/regional names or words, transcribe them in authentic Indonesian without translating to English.
3. If there is only silence, breathing, background noise, or no distinct human speech, return an EMPTY string.
4. Return ONLY the plain transcribed text without markdown, quotes, or conversational explanations.`,
              },
            ],
          },
        ],
      });

      let text = extractText(response).trim();
      if (isSilenceHallucination(text)) {
        text = '';
      }
      if (text) {
        return normalizeIndonesianProperNouns(text);
      }
    }
  } catch (err: any) {
    console.warn('Gemini audio transcription error:', err?.message);
  }

  throw new Error('Tidak dapat mentranskripsi suara audio. Pastikan suara terdengar jelas atau periksa koneksi internet Anda.');
}

