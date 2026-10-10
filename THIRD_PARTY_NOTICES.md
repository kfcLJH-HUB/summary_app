# Third-party notices

This project was independently implemented after studying these open-source projects:

- **Engineering Notebook** by Prime Radiant, Apache License 2.0. Its session-journal workflow informed the daily-summary product design.
- **AgentHUD**, MIT license as declared in its package metadata. Its Codex and Claude Code session-schema documentation informed interoperability tests.
- **VESTI** by abraxas914. Its public Doubao integration documented the relevant read-only web endpoints. No VESTI source file is copied into this project; the integration was rewritten for an Electron page context.

Runtime npm dependency licenses remain available in their respective package directories and package metadata.

## License scope

The root MIT license covers this project's own code and documentation. It does not relicense third-party packages, brand images, or trademarks. Packaged distributions must retain the relevant third-party notices; this short inventory is not a replacement for dependency license texts or Electron/Chromium's bundled notices.

## Direct dependency inventory

The following declarations were checked against the locally installed package metadata. Consult the corresponding package's license files for the actual terms and copyright notices; transitive dependencies must also be retained and reviewed before distribution.

| Package | Declared license |
| --- | --- |
| Electron | MIT; the bundled runtime also includes its own third-party notices |
| React / React DOM | MIT |
| lucide-react | ISC |
| Vite / esbuild / electron-builder | MIT |
| TypeScript | Apache-2.0 |
| Vitest / concurrently / wait-on | MIT |

## Image and brand asset provenance

| Files | Usage and recorded provenance | License status |
| --- | --- | --- |
| `build/icon.png` | Application icon derived from the image supplied by the maintainer, described as Doubao-generated, then cropped and given a transparent outline | No separate image license or generation-service terms are recorded here; verify redistribution rights before public release |
| `src/assets/codex.png`, `public/icons/codex.png` | Codex/OpenAI source identifier; exact download origin was not recorded | Brand asset, not covered by this project's MIT license; source and applicable terms require verification |
| `src/assets/claude.png`, `public/icons/claude.png` | Claude/Anthropic source identifier; exact download origin was not recorded | Brand asset, not covered by this project's MIT license; source and applicable terms require verification |
| `src/assets/doubao.png`, `public/icons/doubao.png` | Doubao source identifier; exact download origin was not recorded | Brand asset, not covered by this project's MIT license; source and applicable terms require verification |
| `src/assets/deepseek.svg` | DeepSeek source identifier; exact source and any modifications were not recorded | Brand asset, not covered by this project's MIT license; source and applicable terms require verification |

The names and logos identify the conversation source only and do not imply affiliation or endorsement. Unverified assets should be replaced with original generic identifiers if redistribution rights cannot be established. This project does not claim that these images are licensed under MIT.

## Reference-project verification

The reference-project statements above are inherited project notes describing design inspiration, not a declaration that their code is bundled. Engineering Notebook and AgentHUD repository URLs and exact revisions were not recorded in this repository; those attributions remain to be verified against the upstream projects. Do not infer an upstream license from this project's MIT license. VESTI's recorded reference is `https://github.com/abraxas914/VESTI`.
