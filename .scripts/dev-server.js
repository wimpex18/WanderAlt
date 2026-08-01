#!/usr/bin/env node
/* ============================================================
   WanderAlt — dev server launcher
   ------------------------------------------------------------
   `npm start` used to be a bare `npx http-server . -p 5173`, which
   throws an unhandled EADDRINUSE and dies the moment anything is
   already on the port. That happens more than you'd think: an
   http-server detached from a closed terminal keeps running (its
   parent becomes init, so it survives the shell that started it),
   and from then on every `npm start` fails with a stack trace that
   says nothing about what to do.

   This wrapper never throws and never kills anything:

     port free                → serve on it
     port serving WanderAlt   → say so and exit 0, nothing to do
     port serving something   → step to the next free port and serve

   Only Node builtins plus the same `npx http-server` underneath —
   no new dependency, no build step.

   Starting port: --port 8080, or PORT=8080, else 5173. The flag form is
   what package.json uses — `PORT=x node …` is a POSIX-ism that would
   break the npm script on Windows.
   ============================================================ */
'use strict';

const net   = require('net');
const http  = require('http');
const path  = require('path');
const { spawn } = require('child_process');

const flagPort = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 ? Number(process.argv[i + 1]) : NaN;
})();
const START_PORT = flagPort || Number(process.env.PORT) || 5173;
const MAX_TRIES  = 20;
const ROOT       = path.resolve(__dirname, '..');

/* Can we bind it ourselves? Bind on the same wildcard address
   http-server uses, or a port held only on 0.0.0.0 reads as free. */
const isFree = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.ID = 1;
  probe.once('error', () => resolve(false));
  probe.once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port, '0.0.0.0');
});

/* Is the thing already on this port OUR dev server? Ask it for a file
   only this repo serves, and check the SHAPE of the answer — parse it as
   the manifest and read its name field. A substring search for the word
   would be enough to fool: a stub server answering every path with the
   text "not wanderalt" matched it during testing, and got misreported as
   our own server. Anything that isn't valid JSON with name: "WanderAlt"
   is somebody else's process. */
const servesWanderAlt = (port) => new Promise((resolve) => {
  const req = http.get(
    { host: '127.0.0.1', port, path: '/manifest.webmanifest', timeout: 1500 },
    (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(false); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 8192) req.destroy(); });
      res.on('end', () => {
        try { resolve(JSON.parse(body).name === 'WanderAlt'); }
        catch { resolve(false); }
      });
    },
  );
  req.on('timeout', () => { req.destroy(); resolve(false); });
  req.on('error', () => resolve(false));
});

const serve = (port) => {
  const args = ['http-server', ROOT, '-p', String(port), '-c-1', '--cors'];
  const child = spawn('npx', args, { stdio: 'inherit', shell: false });
  child.on('error', (err) => {
    console.error(`\n  Could not launch http-server: ${err.message}\n`);
    process.exit(1);
  });
  /* Forward Ctrl-C so the child dies with us and never becomes the
     orphan this script exists to cope with. */
  const stop = () => { child.kill('SIGTERM'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code == null ? 0 : code));
};

(async () => {
  for (let port = START_PORT; port < START_PORT + MAX_TRIES; port++) {
    if (await isFree(port)) {
      if (port !== START_PORT) {
        console.log(`\n  Port ${START_PORT} was busy — serving on ${port} instead.`);
      }
      console.log(`\n  WanderAlt  →  http://localhost:${port}\n`);
      return serve(port);
    }
    if (await servesWanderAlt(port)) {
      console.log(
        `\n  WanderAlt is already being served on http://localhost:${port}` +
        `\n  (left running by an earlier session — nothing to start).` +
        `\n\n  To take it over:  npx kill-port ${port}   then  npm start\n`,
      );
      return;   /* exit 0: the thing you asked for is already true */
    }
    console.log(`  Port ${port} is in use by something else — trying ${port + 1}…`);
  }
  console.error(
    `\n  Could not find a free port in ${START_PORT}–${START_PORT + MAX_TRIES - 1}.` +
    `\n  Try:  PORT=8080 npm start\n`,
  );
  process.exit(1);
})();
