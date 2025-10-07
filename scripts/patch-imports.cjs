const fs = require('fs');
const path = require('path');
function walk(dir, cb) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, cb);
    else cb(p);
  });
}
const SRC = path.join(__dirname, '..', 'src');
walk(SRC, file => {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return;
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(/(from\s+['"])(\.\.\/|\.\.\/\.[^'"]*|\.\/[^'"]+?)(['"])/g, (m, p1, p2, p3) => {
    if (/\.[a-z0-9]+$/i.test(p2)) return m;
    return `${p1}${p2}.js${p3}`;
  });
  if (s !== before) {
    fs.writeFileSync(file, s, 'utf8');
    console.log('patched', path.relative(process.cwd(), file));
  }
});
