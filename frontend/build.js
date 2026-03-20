import { build } from 'vite';
import fs from 'fs';
build().catch(err => {
  let log = err.stack || err.message || String(err);
  if (err.errors) log += '\n' + JSON.stringify(err.errors, null, 2);
  fs.writeFileSync('build_fatal.log', log);
  process.exit(1);
});
