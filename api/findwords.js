const fs = require('fs');
const path = require('path');
let dictionary = null;

function loadDictionary() {
  if (!dictionary) {
    const DICTIONARY_PATH = path.resolve(__dirname, '../dico.txt');
    dictionary = fs.readFileSync(DICTIONARY_PATH, 'utf-8').split('\n');
  }
}

export default function handler(req, res) {
  const syll = (req.query.syll || '').toLowerCase();
  if (!syll || syll.length < 2) {
    res.status(400).json({ error: 'Syllabe trop courte' });
    return;
  }
  loadDictionary();
  const mots = dictionary.filter(mot => mot.toLowerCase().includes(syll));
  res.status(200).json({ syll, mots: mots.slice(0, 30) });
}
