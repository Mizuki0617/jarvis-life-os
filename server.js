const fs = require('fs');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

// .envを直接パースしてAPIキーを取得
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const env = {};
    lines.forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    });
    return env;
  } catch { return {}; }
}
const ENV = loadEnv();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ENV.ANTHROPIC_API_KEY || '';

const app = express();
const PORT = ENV.PORT || process.env.PORT || 3458;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// System prompt for J.A.R.V.I.S. coach persona
function buildSystemPrompt(scores, history) {
  const dimLabels = {
    health: '生理的欲求（Health）',
    security: '安全欲求（Security）',
    relationship: '所属欲求（Relationship）',
    achievement: '承認欲求（Achievement）',
    growth: '自己実現欲求（Growth）',
  };

  const scoresText = Object.entries(scores)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => `${dimLabels[k] || k}: ${v}/100`)
    .join('\n');

  const trend = history.length >= 2
    ? `直近の推移: ${history.slice(-4).map(e => `${e.label || e.date}=${e.total}点`).join(' → ')}`
    : '';

  return `あなたはJ.A.R.V.I.S.（Just A Rather Very Intelligent System）という、ユーザーの人生を最適化するAIパーソナルコーチです。

## ユーザーの現在のLife Scoreデータ
総合スコア: ${scores.total}/100
${scoresText}
${trend}

## あなたの役割
- マズローの5段階欲求理論に基づいて、ユーザーの人生バランスを分析する
- 具体的で実行可能なアドバイスを提供する
- データを根拠にした洞察を与える（スコアを参照しながら話す）
- 励ましながらも、改善すべき点は明確に指摘する
- 回答は日本語で、簡潔かつ具体的に（200字以内を目安）
- 近未来的なAIコーチとしてのキャラクターを保つ（堅くならず、知的でクール）

## 制約
- 医療・法律・金融の専門的アドバイスは「専門家への相談」を勧める
- ユーザーのデータを必ず参照して、パーソナライズされた回答をする
`;
}

app.post('/api/coach', async (req, res) => {
  const { messages, scores, history } = req.body;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API_KEY_NOT_SET', message: 'ANTHROPIC_API_KEYが設定されていません。.envファイルを確認してください。' });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages配列が必要です' });
  }

  try {
    // streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(scores || {}, history || []),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Claude API error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeySet: !!ANTHROPIC_API_KEY,
  });
});

// ローカル起動（Vercelではmodule.exportsをエントリポイントとして使う）
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`J.A.R.V.I.S. Life OS running on http://localhost:${PORT}`);
    if (!ANTHROPIC_API_KEY) {
      console.warn('⚠️  ANTHROPIC_API_KEY が設定されていません。.envファイルに設定してください。');
    } else {
      console.log('✓ ANTHROPIC_API_KEY loaded');
    }
  });
}

module.exports = app;
