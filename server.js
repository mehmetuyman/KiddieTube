const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const videosPath = path.join(__dirname, 'public', 'videos.json');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/videos', async (_req, res) => {
  try {
    const data = await fs.readFile(videosPath, 'utf8');
    res.setHeader('Cache-Control', 'no-store');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Failed to read videos.json', error);
    res.status(500).json({ message: 'Unable to load videos' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});