const http = require('http'), fs = require('fs'), path = require('path');
const dir = __dirname;
http.createServer((req, res) => {
  let u = req.url === '/' ? '/preview.html' : req.url;
  let f = path.join(dir, u);
  try {
    let d = fs.readFileSync(f);
    let ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript' : 'text/plain';
    res.writeHead(200, {'Content-Type': ct + ';charset=utf-8'});
    res.end(d);
  } catch(e) { res.writeHead(404); res.end('404'); }
}).listen(5599, () => {});
