import https from 'https';
import dotenv from 'dotenv';

dotenv.config();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('NO KEY');
  process.exit(1);
}
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (err) {
      console.log(data);
    }
  });
}).on('error', (err) => {
  console.error(err);
});
