// Exact recipient-provisioning byte metadata. Not a license map or execution grant.
const CANDIDATE = {
  schema: 1,
  release: '37.0.1',
  archive: {
    url: 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip',
    bytes: 8044989,
    sha256: '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
  },
  files: [
    {
      path: 'AdbWinApi.dll',
      bytes: 108184,
      sha256: 'c1d653030b4bde65d3e07e4d0b0979e17be56df1436cdd15528630f27808050d',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'AdbWinUsbApi.dll',
      bytes: 73368,
      sha256: '0710e894d9b40f71a670c13c694079d564c92c1279da382cfe4850983aaebe1b',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'NOTICE.txt',
      bytes: 1154131,
      sha256: '38ec8c6f5b7799c223ffeab1f9e81c2d5fc67b5e56d6424f649630ca1ee1a811',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'adb.exe',
      bytes: 8273560,
      sha256: 'b4a6b455702684652cccf7b46258b29e653538904359a58fd4931cf3ef286b3f',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'etc1tool.exe',
      bytes: 451224,
      sha256: 'ee9bb89bb770badcfeb12bb9a3c4095682fb2ea0105487f9f16e440c582064a3',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'fastboot.exe',
      bytes: 2429080,
      sha256: 'b2d9cbff4ce9ae7eb448cfc831bafc867935f50f5be38f8f81057fd7eb3b8d86',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'hprof-conv.exe',
      bytes: 52888,
      sha256: '70cfef266dd9d94922679be159901cec3218561be946347e6e4a7577fc81dede',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'libwinpthread-1.dll',
      bytes: 243016,
      sha256: 'f2044c755e39efc5d47f47c5a942178dd6d79dc8945bb182dc8753d10e2a4269',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'make_f2fs.exe',
      bytes: 473752,
      sha256: 'a1d8e18474636972e4ebaf2617ac17c880e76642fad7fa3e51ae5cd3c1fe5d17',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'make_f2fs_casefold.exe',
      bytes: 473752,
      sha256: '9ac076516c2a1f620df24e148660becf3e7d4102b46ddda66970d35c59db2962',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'mke2fs.conf',
      bytes: 1157,
      sha256: 'ad58a58dcdd24d85055814ca9cac67db89d4e67c434e96774bdce0d0a007d067',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'mke2fs.exe',
      bytes: 763544,
      sha256: '308304852b1f1a1449e9d9115332ab908b8a54b99f460ed1df5d109decef5be7',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'source.properties',
      bytes: 38,
      sha256: '2dccd788c0234d8cf7f7457377e57f57527a86a629c6ed54feb8af0f549dac38',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'sqlite3.exe',
      bytes: 3031704,
      sha256: '234d9e6c475c6e9ba07498a1ad96a6a32840fbfdc74e50277e1a94cbac48abdc',
      peMachine: 332,
      peMagic: 267,
    },
  ],
} as const;

for (const row of CANDIDATE.files) Object.freeze(row);
Object.freeze(CANDIDATE.files);
Object.freeze(CANDIDATE.archive);
export const PLATFORM_TOOLS_CANDIDATE = Object.freeze(CANDIDATE);

// Reviewed prior metadata only; never the current INSTALL target.
const PRIOR_36_CANDIDATE = {
  schema: 1,
  release: '36.0.0',
  archive: {
    url: 'https://dl.google.com/android/repository/platform-tools_r36.0.0-win.zip',
    bytes: 7138784,
    sha256: '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c',
  },
  files: [
    {
      path: 'AdbWinApi.dll',
      bytes: 108128,
      sha256: '9a56e72fe1372cb722a80c00b79dcecf2b37165884e470ed05f00c668c0043b0',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'AdbWinUsbApi.dll',
      bytes: 73312,
      sha256: '5e77ccb2f25cd3a97553745adf1cd28a5fe8137cf64613b7fef9c6f92ff91f37',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'NOTICE.txt',
      bytes: 1089730,
      sha256: 'b319ee2dc88f5d38b0921b0349bf6f7a1f7b30453ecef2180a74989503d7f704',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'adb.exe',
      bytes: 6641760,
      sha256: '1e1c2280b90b3f01ad84cd8df4858b1b1995012814f3ca8893bcc3ba3848edec',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'etc1tool.exe',
      bytes: 454240,
      sha256: 'e0b3ae98dffbe02766861ce7fb539d8dde8c5e2d5addb5f41fbdbd55fde3dede',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'fastboot.exe',
      bytes: 2050144,
      sha256: '04a4105ecbd9407e1dd65d6e7301b62ae96fdbd64ece3ce8cddb8059193abbeb',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'hprof-conv.exe',
      bytes: 54368,
      sha256: '6ce5a2a4e890e7f5c72f7deb5ddfabf4d48c5aabb4e0b951b8083416d63679dd',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'libwinpthread-1.dll',
      bytes: 242960,
      sha256: '055f5a8693720186e21bfd35f68aead1510f1a7d104f8cd8485c0ed6bcb42a94',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'make_f2fs.exe',
      bytes: 487008,
      sha256: 'b7311675c22980fead6f2e79a6b2a7652f7114cf76a4c52b88d24efb9640ef8f',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'make_f2fs_casefold.exe',
      bytes: 487008,
      sha256: '839ce0abd71771b2d7edb86a219ce22756b4f062dc54db5c06caf51a784da569',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'mke2fs.conf',
      bytes: 1157,
      sha256: 'ad58a58dcdd24d85055814ca9cac67db89d4e67c434e96774bdce0d0a007d067',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'mke2fs.exe',
      bytes: 759392,
      sha256: 'e471dd11b4afa217ed05f520c408f22340001b83f39647a541fca6f37bb34c13',
      peMachine: 332,
      peMagic: 267,
    },
    {
      path: 'source.properties',
      bytes: 38,
      sha256: '382f8b27c4af692501671a83e725217629c45883cfedeb29a1a3fd8e5b191677',
      peMachine: null,
      peMagic: null,
    },
    {
      path: 'sqlite3.exe',
      bytes: 2924640,
      sha256: 'b2e3241ff4cee0cd9b6cf70ae8cf5cd8bbc0b43e86cb8174407800b1bc435320',
      peMachine: 332,
      peMagic: 267,
    },
  ],
} as const;
for (const row of PRIOR_36_CANDIDATE.files) Object.freeze(row);
Object.freeze(PRIOR_36_CANDIDATE.files);
Object.freeze(PRIOR_36_CANDIDATE.archive);
export const PLATFORM_TOOLS_PRIOR_36_CANDIDATE = Object.freeze(PRIOR_36_CANDIDATE);
