import { supabase } from './supabase';
import type { WritingFeedback, SpeakingFeedback } from './gemini';

/**
 * Satu sumber data untuk semua hasil latihan (writing & speaking).
 * Disimpan di tabel Supabase `submissions` dengan RLS (user_id = auth.uid()).
 */

export interface SubmissionRow {
  id: string;
  user_id: string;
  type: 'writing' | 'speaking';
  original_text: string;         // writing: teks asli; speaking: transkrip
  corrected_text: string | null; // writing only
  score: number;
  error_categories: string[];    // nama kategori yang memiliki error
  feedback: WritingFeedback | SpeakingFeedback;
  suggestions: string[];
  created_at: string;
}

export async function saveWritingSubmission(
  userId: string,
  originalText: string,
  feedback: WritingFeedback
): Promise<SubmissionRow> {
  const errorCategories = feedback.categories
    .filter(c => c.errors.length > 0)
    .map(c => c.name);

  const suggestions = feedback.categories.flatMap(c => c.suggestions);

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: userId,
      type: 'writing',
      original_text: originalText,
      corrected_text: feedback.corrected_text,
      score: feedback.score,
      error_categories: errorCategories,
      feedback,
      suggestions,
    })
    .select()
    .single();

  if (error) throw new Error(`Gagal menyimpan hasil: ${error.message}`);
  return data as SubmissionRow;
}

export async function saveSpeakingSubmission(
  userId: string,
  transcription: string,
  feedback: SpeakingFeedback
): Promise<SubmissionRow> {
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: userId,
      type: 'speaking',
      original_text: transcription,
      corrected_text: null,
      score: feedback.score,
      error_categories: feedback.weakness ? [feedback.weakness] : [],
      feedback,
      suggestions: feedback.improvements,
    })
    .select()
    .single();

  if (error) throw new Error(`Gagal menyimpan hasil: ${error.message}`);
  return data as SubmissionRow;
}

export async function fetchSubmissions(userId: string, limit = 50): Promise<SubmissionRow[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Gagal mengambil riwayat: ${error.message}`);
  return (data ?? []) as SubmissionRow[];
}

export async function deleteSubmission(id: string): Promise<void> {
  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) throw new Error(`Gagal menghapus hasil: ${error.message}`);
}

export interface YouTubeRecommendationRow {
  id: string;
  submission_id: string | null;
  topic: string;
  subtopic: string;
  query: string;
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  description: string;
  published_at: string;
  created_at: string;
}

export async function fetchRecommendations(submissionId: string): Promise<YouTubeRecommendationRow[]> {
  const { data, error } = await supabase
    .from('youtube_recommendations')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Gagal mengambil rekomendasi: ${error.message}`);
  return (data ?? []) as YouTubeRecommendationRow[];
}

export async function saveRecommendations(
  rows: Omit<YouTubeRecommendationRow, 'id' | 'created_at'>[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('youtube_recommendations').insert(rows);
  if (error) throw new Error(`Gagal menyimpan rekomendasi: ${error.message}`);
}
