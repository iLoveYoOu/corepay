const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'linux') process.exit(0);

const version = '0.5.11';
const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
const binDir = path.join(__dirname, '..', 'bin');
const archive = path.join(binDir, 'litestream.tar.gz');
const binary = path.join(binDir, 'litestream');
fs.mkdirSync(binDir, { recursive: true });
if (fs.existsSync(binary)) process.exit(0);

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CorePay installer' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
        response.resume();
        return resolve(download(response.headers.location, destination, redirects + 1));
      }
      if (response.statusCode !== 200) return reject(new Error(`Download Litestream falhou: HTTP ${response.statusCode}`));
      const file = fs.createWriteStream(destination, { mode: 0o600 });
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const url = `https://github.com/benbjohnson/litestream/releases/download/v${version}/litestream-v${version}-linux-${arch}.tar.gz`;
  await download(url, archive);
  execFileSync('tar', ['-xzf', archive, '-C', binDir], { stdio: 'inherit' });
  fs.chmodSync(binary, 0o755);
  fs.rmSync(archive, { force: true });
  execFileSync(binary, ['version'], { stdio: 'inherit' });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
