import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 8787;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5500';

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// ---- SCENARIO (Isabelle) ----
const isabelle = {
  name: "Isabelle Vidal",
  positive: {
    open: ["how", "what", "why", "tell me", "walk me through", "help me understand", "could you share"],
    empathy: ["i understand", "that makes sense", "fair point", "i appreciate", "thanks for sharing", "important to you"],
    demo: ["try", "test", "write with", "feel the weight", "sample", "would you like to"]
  },
  negative: { pushy: ["buy now", "sign today", "last chance", "limited time", "must", "guaranteed", "only today", "best price if"] },
  responses: {
    neutral: "I’m curious—what do you usually look for in a writing instrument?",
    engaged: "Oh, that feels lovely—very smooth. I do care about balance and presentation.",
    decline: "Thank you for your time. I think I’ll pass for now.",
    buy: "Yes, I’ll take it."
  },
  feedback: {
    good: [
      "You asked thoughtful, open questions.",
      "You invited me to try the pen—great move.",
      "You acknowledged my concerns before answering."
    ],
    improve: [
      "Slow down before discussing price—let me connect emotionally first.",
      "Summarize my needs back before proposing a model.",
      "Avoid pushy phrases; keep it consultative."
    ]
  }
};

const includesAny = (text, list) => list.some(k => text.includes(k));
function analyze(turns) {
  const s = (turns || []).map(t => t.text).join(' \n ').toLowerCase();
  return {
    open: includesAny(s, isabelle.positive.open),
    empathy: includesAny(s, isabelle.positive.empathy),
    demo: includesAny(s, isabelle.positive.demo),
    pushy: includesAny(s, isabelle.negative.pushy)
  };
}
function isabelleReply(transcript) {
  const { open, empathy, demo, pushy } = analyze(transcript);
  if (pushy && !open) return isabelle.responses.decline;
  if (open && empathy && demo) return isabelle.responses.buy;
  if (open && (empathy || demo)) return isabelle.responses.engaged;
  return isabelle.responses.neutral;
}

// ---- HEALTH
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// ---- CHAT (mock stream)
app.post('/chat', async (req, res) => {
  const { transcript = [] } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const reply = isabelleReply(transcript);
  for (const ch of reply) {
    res.write(`data: ${JSON.stringify({ token: ch })}\n\n`);
    await new Promise(r => setTimeout(r, 20));
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

// ---- FEEDBACK
app.post('/feedback', (req, res) => {
  const { transcript = [] } = req.body || {};
  const s = transcript.map(t => t.text).join(' \n ').toLowerCase();
  const strengths = [...isabelle.feedback.good];
  const suggestions = [];
  if (!includesAny(s, isabelle.positive.open)) suggestions.push("Ask more open-ended questions.");
  if (!includesAny(s, isabelle.positive.empathy)) suggestions.push("Acknowledge feelings/concerns first.");
  if (!includesAny(s, isabelle.positive.demo)) suggestions.push("Invite the customer to try the pen.");
  if (includesAny(s, isabelle.negative.pushy)) suggestions.push("Avoid pushy phrases—stay consultative.");

  res.json({
    persona: isabelle.name,
    strengths: strengths.slice(0, 3),
    suggestions: suggestions.length ? suggestions : isabelle.feedback.improve
  });
});

// ---- (Optional) WebSocket for audio mock (not used yet)
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', ws => { ws.on('message', () => {}); });
const server = app.listen(PORT, () => console.log(`Server :${PORT}`));
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/audio') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  else socket.destroy();
});

