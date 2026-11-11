//server-prod.js
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import compression from 'compression';

const app = express();
console.log("coucou")

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// En-têtes HTTP de sécurité (sans CSP). Ce serveur ne sert que la prod ; HSTS est ignoré par les navigateurs hors HTTPS.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(compression());
app.use(express.static(path.resolve(__dirname, '../build'), { index: false }));
 
app.route('*').all((req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

app.listen(8080, () => {
  console.log("Listning at: 8080.")
})