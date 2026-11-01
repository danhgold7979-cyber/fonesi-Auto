'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm'),
  { createHash } = require('node:crypto');
const admission = require('../launch/package-admission.cjs');
const helperFile = path.join(__dirname, 'main-runtime-version-package.cjs'),
  hash = (b) => createHash('sha256').update(b).digest('hex'),
  id = '00000000-0000-4000-8000-000000000001',
  head = 'a'.repeat(40),
  tree = 'b'.repeat(40);
function fixture() {
  const temp = fs.realpathSync.native(
      fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'pkv-')),
    ),
    desktop = path.join(temp, 'd'),
    root = path.join(desktop, '.retained-host-runtime', 'r'),
    candidateRoot = path.join(desktop, '.package-build'),
    container = path.join(candidateRoot, 'Fonesi-Auto-' + id),
    original = path.join(container, 'package'),
    extracted = path.join(root, 'relocated-package');
  for (const dir of [
    root,
    original,
    extracted,
    path.join(desktop, 'verification'),
    path.join(desktop, 'build'),
  ])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, '.owner'), id);
  const manifest = { sourceHead: head, sourceTree: tree },
    build = JSON.stringify({
      version: 1,
      outputs: {
        'main.cjs': hash('module.exports={source:"PACKAGE"};'),
        'log-contract.cjs': hash('module.exports={source:"PACKAGED_ENCODER"};'),
      },
    });
  for (const base of [original, extracted]) {
    fs.mkdirSync(path.join(base, 'app/build'), { recursive: true });
    fs.mkdirSync(path.join(base, 'app/launch'), { recursive: true });
    fs.writeFileSync(path.join(base, 'package-manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(base, 'app/build/.verified-build.json'), build);
    fs.writeFileSync(path.join(base, 'app/build/main.cjs'), 'module.exports={source:"PACKAGE"};');
    fs.writeFileSync(
      path.join(base, 'app/build/log-contract.cjs'),
      'module.exports={source:"PACKAGED_ENCODER"};',
    );
    fs.writeFileSync(
      path.join(base, 'app/launch/persistence-initialize.cjs'),
      'module.exports={source:"INITIALIZER"};',
    );
  }
  fs.writeFileSync(path.join(desktop, 'build/.verified-build.json'), build);
  fs.writeFileSync(
    path.join(desktop, 'build/main.cjs'),
    'module.exports={source:"SOURCE_MUST_NOT_LOAD"};',
  );
  const zip = path.join(container, 'Fonesi-Auto.zip'),
    bytes = Buffer.from('synthetic archive bytes; ZIP extraction separately tested');
  fs.writeFileSync(zip, bytes);
  fs.writeFileSync(zip + '.sha256', hash(bytes) + '\n');
  fs.writeFileSync(
    path.join(candidateRoot, 'candidate.json'),
    JSON.stringify({ directory: original, zip, sha256: hash(bytes), bytes: bytes.length }) + '\n',
  );
  const module = { exports: {} };
  let semanticCalls = 0;
  vm.runInNewContext(
    fs.readFileSync(helperFile, 'utf8'),
    {
      module,
      exports: module.exports,
      __dirname: path.join(desktop, 'verification'),
      Buffer,
      TextDecoder,
      require(name) {
        if (name === '../launch/package-admission.cjs')
          return {
            ...admission,
            verifyPackage(p) {
              semanticCalls++;
              return JSON.parse(fs.readFileSync(path.join(p, 'package-manifest.json'), 'utf8'));
            },
          };
        return require(name);
      },
    },
    { filename: helperFile },
  );
  return {
    api: module.exports,
    root,
    desktop,
    extracted,
    original,
    zip,
    get semanticCalls() {
      return semanticCalls;
    },
    close() {
      fs.rmSync(temp, { recursive: true, force: true });
    },
  };
}
test('owned package proof binds original/extracted bytes and loads only packaged outputs with synthetic semantic admission', () => {
  const f = fixture();
  try {
    assert.ok(
      fs
        .readFileSync(path.join(__dirname, 'package-build-entry.mjs'), 'utf8')
        .includes("JSON.stringify(candidate) + '\\n'"),
    );
    const a = f.api.prepareBinding(f.root, head, tree);
    assert.equal(a.packageRoot, f.extracted);
    assert.equal(a.sourceHead, head);
    assert.equal(f.api.loadBuild(a, 'main.cjs').source, 'PACKAGE');
    assert.equal(f.api.loadBuild(a, 'log-contract.cjs').source, 'PACKAGED_ENCODER');
    assert.equal(
      f.api.initializer(a),
      path.join(f.extracted, 'app/launch/persistence-initialize.cjs'),
    );
    assert.ok(f.semanticCalls >= 4);
    assert.throws(() => f.api.loadBuild({ ...a }, 'main.cjs'));
    assert.throws(() => f.api.loadBuild(a, '../main.cjs'));
    assert.throws(() => f.api.prepareBinding(f.root, head, tree));
  } finally {
    f.close();
  }
});
test('wrong source tuple, modified package or ZIP, and noncanonical binding never admit', () => {
  for (const fault of ['head', 'extracted', 'zip', 'binding', 'candidateLf']) {
    const f = fixture();
    try {
      if (fault === 'head') {
        assert.throws(() => f.api.prepareBinding(f.root, 'c'.repeat(40), tree));
        assert.equal(fs.existsSync(path.join(f.root, 'package-binding.json')), false);
        continue;
      }
      f.api.prepareBinding(f.root, head, tree);
      if (fault === 'candidateLf')
        fs.appendFileSync(path.join(f.desktop, '.package-build/candidate.json'), '\n');
      if (fault === 'extracted')
        fs.appendFileSync(path.join(f.extracted, 'app/build/main.cjs'), 'changed');
      if (fault === 'zip') fs.appendFileSync(f.zip, 'changed');
      if (fault === 'binding') fs.appendFileSync(path.join(f.root, 'package-binding.json'), '\n');
      assert.throws(() => f.api.admitPackage(f.root));
    } finally {
      f.close();
    }
  }
});
test('branded output loading rechecks owned marker and exact module bytes with no checkout fallback', () => {
  for (const fault of ['owner', 'module']) {
    const f = fixture();
    try {
      const a = f.api.prepareBinding(f.root, head, tree);
      if (fault === 'owner')
        fs.writeFileSync(path.join(f.root, '.owner'), '00000000-0000-4000-8000-000000000002');
      else fs.unlinkSync(path.join(f.extracted, 'app/build/main.cjs'));
      assert.throws(() => f.api.loadBuild(a, 'main.cjs'));
      assert.equal(fs.existsSync(path.join(f.desktop, 'build/main.cjs')), true);
    } finally {
      f.close();
    }
  }
});
test('hardlinked package payload is refused before binding publication', () => {
  const f = fixture();
  try {
    const file = path.join(f.extracted, 'app/build/main.cjs');
    fs.linkSync(file, path.join(f.root, 'held'));
    assert.throws(() => f.api.prepareBinding(f.root, head, tree));
    assert.equal(fs.existsSync(path.join(f.root, 'package-binding.json')), false);
  } finally {
    f.close();
  }
});
test('projected helper and packaged file limits refuse unsupported roots before package reads or binding writes', () => {
  const f = fixture();
  try {
    assert.equal(f.api.pathBudget(f.root, f.extracted), true);
    assert.throws(() => f.api.pathBudget(path.join(f.root, 'x'.repeat(80)), f.extracted));
    assert.throws(() => f.api.pathBudget(f.root, path.join(f.extracted, 'x'.repeat(260))));
    assert.equal(fs.existsSync(path.join(f.root, 'package-binding.json')), false);
  } finally {
    f.close();
  }
});

test('initializer probe resolves original packaged filename only from exact PACKAGE control and proof', () => {
  const f = fixture();
  try {
    const admitted = f.api.prepareBinding(f.root, head, tree),
      launch = path.join(f.root, 'first-use', 'Fonesi-Auto-' + id, 'launch-' + id);
    fs.mkdirSync(launch, { recursive: true });
    const controlFile = path.join(launch, 'provision-control.json');
    for (const fault of ['none', 'mode', 'root', 'downgrade', 'source']) {
      fs.writeFileSync(
        controlFile,
        JSON.stringify({
          version: ['downgrade', 'source'].includes(fault) ? 2 : 3,
          root: path.dirname(launch),
          stage: 'provision',
          packageRoot: fault === 'root' ? f.original : f.extracted,
        }),
      );
      fs.writeFileSync(
        path.join(f.root, 'copy.json'),
        JSON.stringify({
          version: 2,
          mode: ['mode', 'source'].includes(fault) ? 'MAIN_VERSION' : 'PACKAGE_VERSION',
        }),
      );
      let selected = 0,
        sourceSelected = 0,
        exited = false;
      vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, 'persistence-launch-init-probe.cjs'), 'utf8'),
        {
          process: { env: { FONESI_PERSISTENCE_LAUNCH_CONTROL: controlFile } },
          TextDecoder,
          Buffer,
          console: { error() {} },
          require(name) {
            if (name === 'electron')
              return {
                app: {
                  on() {},
                  exit(code) {
                    assert.equal(code, 1);
                    exited = true;
                  },
                },
                dialog: {},
              };
            if (name === './persistence-launch-e2e-control.cjs')
              return {
                witnessPath() {
                  throw Error('NOT_CALLED');
                },
              };
            if (name === './retained-host-contract.cjs')
              return {
                rootForLaunch(value) {
                  assert.equal(value, launch);
                  return f.root;
                },
              };
            if (name === './main-runtime-version-package.cjs')
              return {
                admitPackage(root) {
                  assert.equal(root, f.root);
                  return admitted;
                },
                initializer: f.api.initializer,
              };
            if (name === f.api.initializer(admitted)) {
              selected++;
              return {};
            }
            if (name === '../launch/persistence-initialize.cjs' && fault === 'source') {
              sourceSelected++;
              return {};
            }
            if (name.includes('persistence-initialize')) throw Error('SOURCE_FALLBACK');
            return require(name);
          },
        },
      );
      assert.equal(selected, fault === 'none' ? 1 : 0);
      assert.equal(sourceSelected, fault === 'source' ? 1 : 0);
      assert.equal(exited, !['none', 'source'].includes(fault));
    }
  } finally {
    f.close();
  }
});
