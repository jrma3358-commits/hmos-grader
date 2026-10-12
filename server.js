const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;
const GRADER = path.join(__dirname, 'hmos-grader');

app.use(express.json());
app.use(express.static(__dirname));

function parseEngineOutput(raw) {
  const lines = raw.split('\n');
  const nodes = [];
  let pivot = null;

  for (const line of lines) {
    const nm = line.match(/^\\s*n(\d+)\s+([BCPDQ])\s+(.+)/);
    if (nm) nodes.push({ id: 'n' + nm[1], color: nm[2], entity: nm[3].replace(/[\u300c\u300d]/g,"").trim() });

    const pm = line.match(/^pivot:\s*(\{.+\})/);
    if (pm) {
      try { pivot = JSON.parse(pm[1]); } catch(e) {}
    }
  }

  const k = (pivot && pivot.pivot) ? pivot.pivot : {};
  const colors = { B: [], C: [], P: [], D: [], Q: [] };
  for (const n of nodes) {
    if (colors[n.color]) colors[n.color].push(n.entity);
  }

  return {
    nodes,
    pivot: k,
    colors,
    급소: {
      color: k.color || 'B',
      entity: k.entity || '',
      keyword: k.keyword || ''
    }
  };
}

app.post('/api/analyze', (req, res) => {
  const q = (req.body.question || '').trim();
  if (!q) { res.status(400).json({ error: 'empty' }); return; }

  const tmp = path.join(os.tmpdir(), 'q' + Date.now() + '.txt');
  fs.writeFileSync(tmp, q, 'utf8');

  execFile('npx', ['tsx', 'run.ts', tmp], {
    cwd: GRADER,
    timeout: 30000,
    encoding: 'utf8'
  }, (err, stdout) => {
    try { fs.unlinkSync(tmp); } catch(_) {}
    if (err) { res.status(500).json({ error: err.message }); return; }
    const parsed = parseEngineOutput(stdout);
    res.json({ raw: stdout, parsed });
  });
});

app.listen(PORT, () => console.log('HMOS ' + PORT));
