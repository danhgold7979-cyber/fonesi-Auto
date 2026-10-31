'use strict';
// Observation only: the real filesystem call decides success/failure.
async function observeIndexRename(filesystem, target, operation) {
  const original = filesystem.rename;
  let denialCode = null;
  filesystem.rename = async function (...args) {
    try {
      return await Reflect.apply(original, this, args);
    } catch (error) {
      if (
        args.length === 2 &&
        args[1] === target &&
        error instanceof Error &&
        ['EACCES', 'EPERM', 'EBUSY'].includes(error.code)
      )
        denialCode = error.code;
      throw error;
    }
  };
  try {
    return { result: await operation(), denialCode };
  } finally {
    filesystem.rename = original;
  }
}
module.exports = { observeIndexRename };
