'use strict';
// Run with the repository's Electron-as-Node so node-pty uses the app's native ABI.
const pty = require('node-pty');
let terminal;
process.on('message', message => {
  if (message.type === 'start') {
    terminal = pty.spawn(message.file, message.args, message.options);
    terminal.onData(data => process.send?.({ type: 'data', data }));
    terminal.onExit(event => {
      process.send?.({ type: 'exit', ...event }, () => process.exit(0));
    });
    process.send?.({ type: 'started', pid: terminal.pid });
  } else if (message.type === 'data') terminal?.write(message.data);
  else if (message.type === 'resize') terminal?.resize(message.cols, message.rows);
  else if (message.type === 'pause') terminal?.pause();
  else if (message.type === 'resume') terminal?.resume();
  else if (message.type === 'close') terminal?.kill();
});
process.on('disconnect', () => { terminal?.kill(); process.exit(0); });
process.on('uncaughtException', error => {
  process.send?.({ type: 'error', message: error.message }, () => process.exit(1));
});
