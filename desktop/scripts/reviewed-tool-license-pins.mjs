// Fixed development-evidence pins from independently rehashed registry artifacts.
// Export only a primitive; callers cannot mutate the pin records.
export const TOOL_LICENSE_PROVENANCE =
  JSON.stringify(
    {
      kind: 'FONESI_AUTO_REVIEWED_TOOL_LICENSE_PROVENANCE',
      schemaVersion: 1,
      scope: 'THREE_EXACT_NPM_ARTIFACTS_SEVEN_SELECTED_TEXTS_ONLY',
      limitations: [
        'Recorded offline artifact SHA512 and selected member byte equality, not runtime archive verification.',
        'No signatures, attestations, source commits, whole installed packages, native artifacts, complete notices, legal clearance or redistribution approval verified.',
        'The nested vscode-jsonrpc text is a TypeScript artifact member, not a separately resolved package.',
        'Both Biome alternatives and Rome attribution are retained; no license option is selected.',
      ],
      artifacts: [
        {
          name: '@biomejs/biome',
          version: '2.6.4',
          lockPath: 'node_modules/@biomejs/biome',
          registryArtifact: 'https://registry.npmjs.org/@biomejs/biome/-/biome-2.6.4.tgz',
          integrity:
            'sha512-8sKKwaNW4ot22awZ3lBjwWLHnUFXgXnrBPYS2gNlBAXRbDC++7kqjK2H7dR/FgCDtPvO1xfKpgEhJkGxAKYkxA==',
          declaredLicense: 'MIT OR Apache-2.0',
          archiveSizeBytes: 115389,
          archiveMemberCount: 19,
          texts: [
            {
              archiveMember: 'package/LICENSE-APACHE',
              sha256: 'e2746aba8799f7a3378259f36a83a079e811ca7926cbdd248a2eb7ca9cbbac5d',
              sizeBytes: 10858,
              readLimitBytes: 32768,
            },
            {
              archiveMember: 'package/LICENSE-MIT',
              sha256: '4f6a0d776a00c0f46e1da1879321896071494229aa3219862a625e4560691a3a',
              sizeBytes: 1091,
              readLimitBytes: 32768,
            },
            {
              archiveMember: 'package/ROME-LICENSE-MIT',
              sha256: 'dd3cd750e06451ce467ac3dbc1b437f4474e81fdde45153c95ab6ea1cffc6747',
              sizeBytes: 1112,
              readLimitBytes: 32768,
            },
          ],
        },
        {
          name: 'esbuild',
          version: '0.28.2',
          lockPath: 'node_modules/esbuild',
          registryArtifact: 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz',
          integrity:
            'sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==',
          declaredLicense: 'MIT',
          archiveSizeBytes: 34207,
          archiveMemberCount: 7,
          texts: [
            {
              archiveMember: 'package/LICENSE.md',
              sha256: 'b40ec5baec7bb34fa5b1c09521fa3cd52d5fad7adafed74932a2010d3612a681',
              sizeBytes: 1069,
              readLimitBytes: 32768,
            },
          ],
        },
        {
          name: 'typescript',
          version: '7.0.2',
          lockPath: 'node_modules/typescript',
          registryArtifact: 'https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz',
          integrity:
            'sha512-8FYau96o3NKOhbjKi/qNvG/W5jhzxkbdm5sj9AbZ/5T5sWqn3hJgLfGx27sRKZWTvyzCP8dLRBTf5tBTSRVUNA==',
          declaredLicense: 'Apache-2.0',
          archiveSizeBytes: 365612,
          archiveMemberCount: 416,
          texts: [
            {
              archiveMember: 'package/LICENSE',
              sha256: 'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
              sizeBytes: 9197,
              readLimitBytes: 32768,
            },
            {
              archiveMember: 'package/vendor/vscode-jsonrpc/License.txt',
              sha256: 'ec9ee83580841e8eb687aca9867f221503809ba6426c7f876ede17d91b9fcfd0',
              sizeBytes: 1095,
              readLimitBytes: 32768,
            },
            {
              archiveMember: 'package/NOTICE.txt',
              sha256: 'f5c708b59114507b8b27b48181b6883d106bbca0c1634bbee45b5e344237b66b',
              sizeBytes: 48860,
              readLimitBytes: 65536,
            },
          ],
        },
      ],
    },
    null,
    2,
  ) + '\n';
