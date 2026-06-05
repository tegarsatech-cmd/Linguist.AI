import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Groq
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  // API Routes
  app.post('/api/feedback/writing', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Writing Tutor. 
            Provide feedback on the following essay. 
            Output must be in JSON format with the following keys:
            - score: number (0-100)
            - grammar: string (feedback on grammar)
            - coherence: string (feedback on coherence)
            - vocabulary: string (feedback on vocabulary)
            - suggestions: string[] (list of specific improvements)
            - revisedText: string (a slightly improved version of the text)
            Respond ONLY with the JSON object.`
          },
          { role: 'user', content: text }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });

      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Groq Error:', error);
      res.status(500).json({ error: 'Failed to get AI feedback' });
    }
  });

  app.post('/api/feedback/speaking', async (req, res) => {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Transcript is required' });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an Academic English Speaking Tutor. 
            Analyze the following transcript from a spoken recording.
            Output must be in JSON format with the following keys:
            - pronunciationScore: number (0-100)
            - fluencyScore: number (0-100)
            - feedback: string (overall feedback)
            - fillerWords: string[] (detected filler words like um, ah, etc)
            - improvements: string[] (specific tips for better delivery)
            Respond ONLY with the JSON object.`
          },
          { role: 'user', content: transcript }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });

      res.json(JSON.parse(completion.choices[0].message.content || '{}'));
    } catch (error: any) {
      console.error('Groq Error:', error);
      res.status(500).json({ error: 'Failed to get AI feedback' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
