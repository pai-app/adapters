import debug from 'debug';

const root = debug('adapters');

function createLogger(module: string) {
  const base = root.extend(module);
  return Object.assign(base, {
    warn: base.extend('warn'),
    error: base.extend('error'),
  });
}

export const log = {
  parse: createLogger('parse'),
  pdf: createLogger('pdf'),
  excel: createLogger('excel'),
  email: createLogger('email'),
};
