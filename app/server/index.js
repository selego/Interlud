//server-prod.js
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
 
const app = express();
console.log("coucou")
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.resolve(__dirname, '../build'), { index: false }));
 
app.route('*').all((req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

app.listen(8080, '0.0.0.0', () => {
  console.log(`Listening on ${host}:${port}`)
})