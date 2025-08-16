const fs = require('fs');
const path = require('path');

function extractSyllabes(dictionary) {
  const syllabes = new Set();
  dictionary.forEach(mot => {
    mot = mot.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿñæœ-]/g, ''); // Garde lettres et tirets
    for (let i = 0; i < mot.length - 1; i++) {
      let syl = mot.slice(i, i + 2);
      if (syl.length === 2) syllabes.add(syl);
    }
  });
  return Array.from(syllabes).sort();
}

export default function handler(req, res) {
  const DICTIONARY_PATH = path.resolve(__dirname, '../dico.txt');
  const dictionary = fs.readFileSync(DICTIONARY_PATH, 'utf-8').split('\n').filter(Boolean);
  const syllabes = extractSyllabes(dictionary);
  res.status(200).json({ syllabes });
}
