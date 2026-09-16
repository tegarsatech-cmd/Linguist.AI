import { RUBRIC } from '../lib/gemini';

/**
 * Rubrik Penilaian — bobot harus sama dengan yang dipakai algoritma
 * (validasi di src/lib/gemini.ts → validateWriting menghitung skor dari bobot ini).
 */

export default function Rubric() {
  const total = RUBRIC.reduce((s, r) => s + r.weight, 0);

  return (
    <div className="p-6 md:p-10 pb-28 max-w-4xl mx-auto space-y-6 min-h-full">
      <header>
        <h1 className="text-2xl font-semibold text-white/95">Rubrik Penilaian</h1>
        <p className="mt-1 text-sm text-text-muted">
          Semua latihan Writing dinilai dengan rubrik berikut. Bobot yang ditampilkan sama dengan bobot
          yang digunakan algoritma penilaian — skor total adalah jumlah skor kelima kategori.
        </p>
      </header>

      <section className="bg-white/[0.03] border-border-main rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-main text-left">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Kategori</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Bobot</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Deskripsi</th>
            </tr>
          </thead>
          <tbody>
            {RUBRIC.map(r => (
              <tr key={r.key} className="border-b border-border-main/50 last:border-0">
                <td className="px-5 py-3 font-medium text-white/90">{r.key}</td>
                <td className="px-5 py-3 font-mono text-brand-blue">{r.weight}%</td>
                <td className="px-5 py-3 text-text-dim">{r.description}</td>
              </tr>
            ))}
            <tr className="bg-white/[0.02]">
              <td className="px-5 py-3 font-semibold text-white/90">Total</td>
              <td className="px-5 py-3 font-mono font-semibold text-white">{total}%</td>
              <td className="px-5 py-3" />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="bg-white/[0.03] border-border-main rounded-lg p-6 space-y-3">
        <h2 className="text-sm font-semibold text-white/90">Cara Penilaian</h2>
        <p className="text-sm text-text-dim">
          Untuk setiap kategori, penguji (Gemini, temperature 0 agar hasil konsisten) memberi skor 0 sampai
          bobot maksimum kategori. Skor kategori berkurang sesuai jumlah dan keparahan kesalahan yang ditemukan:
          setiap kesalahan mengurangi sekitar 10–20 poin dari kategori terkait. Kategori tanpa kesalahan
          mendapat skor penuh.
        </p>
        <p className="text-sm text-text-dim">
          <span className="font-medium text-white/80">Skor total</span> = jumlah skor kelima kategori
          (Grammar 30 + Vocabulary 20 + Sentence Structure 20 + Spelling 15 + Clarity/Coherence 15), sehingga
          maksimum 100. Setiap kesalahan ditampilkan dengan teks asli, koreksi, dan penjelasannya agar penilaian
          dapat diverifikasi.
        </p>
      </section>
    </div>
  );
}
