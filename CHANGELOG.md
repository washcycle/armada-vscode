# Changelog

## [0.3.0](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.2.4...armada-vscode-v0.3.0) (2026-03-19)


### Features

* implement P1 features (job detail panel, failure reasons, cancel job set, reprioritize, time-in-state, fix Lookout URL) ([#52](https://github.com/washcycle/armada-vscode/issues/52)) ([6ce95c7](https://github.com/washcycle/armada-vscode/commit/6ce95c776193f604d122bee46345202ef4b1d381))


### Bug Fixes

* remove duplicate on:release trigger from publish workflow ([0686f0e](https://github.com/washcycle/armada-vscode/commit/0686f0eaf7429bd3d6af6da40dd31668e5f9616e))
* **test:** scope integration test glob to suite/ directory ([badedce](https://github.com/washcycle/armada-vscode/commit/badedce45750b9d13cfb0bb492bab6a7f0188325))
* **test:** scope integration test glob to suite/ directory ([#49](https://github.com/washcycle/armada-vscode/issues/49)) ([0f1f08b](https://github.com/washcycle/armada-vscode/commit/0f1f08bf8ca50a43d0beab14b1ef8bcf851133f6))


### Miscellaneous

* **ci:** auto-request Copilot review on pull requests ([#50](https://github.com/washcycle/armada-vscode/issues/50)) ([2b81620](https://github.com/washcycle/armada-vscode/commit/2b8162083e80f1234322cedc2355d33fcc9b909f))
* **deps-dev:** bump @types/node from 25.3.0 to 25.5.0 ([#47](https://github.com/washcycle/armada-vscode/issues/47)) ([0b3adee](https://github.com/washcycle/armada-vscode/commit/0b3adee078065fce2d339badf18c9cc736625982))
* **deps-dev:** bump @typescript-eslint/eslint-plugin from 8.54.0 to 8.57.1 ([#48](https://github.com/washcycle/armada-vscode/issues/48)) ([0a50e50](https://github.com/washcycle/armada-vscode/commit/0a50e5021da5bdaa5bcf95d3f485faa51bad165c))
* **deps-dev:** bump glob from 13.0.3 to 13.0.6 ([#44](https://github.com/washcycle/armada-vscode/issues/44)) ([9115ccd](https://github.com/washcycle/armada-vscode/commit/9115ccdace618e4d5e0da0190632801bb187355f))

## [0.2.4](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.2.3...armada-vscode-v0.2.4) (2026-03-17)


### Miscellaneous

* add CLAUDE.md to enforce beads usage and PR conventions ([cb60318](https://github.com/washcycle/armada-vscode/commit/cb603180b0f976b3054960237419ad8afdcc0339))
* archive enforce-conventional-pr-titles change ([d9219bf](https://github.com/washcycle/armada-vscode/commit/d9219bf9f8dc4917da23141f2d73d1fbb79cdbd1))
* trigger release for [#39](https://github.com/washcycle/armada-vscode/issues/39) [#40](https://github.com/washcycle/armada-vscode/issues/40) [#41](https://github.com/washcycle/armada-vscode/issues/41) ([7bc2632](https://github.com/washcycle/armada-vscode/commit/7bc2632b4b592bcec22f366cd08a7d9b636df153))

## [0.2.3](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.2.2...armada-vscode-v0.2.3) (2026-03-15)


### Bug Fixes

* patch serialize-javascript RCE (CVE-2024-11831) ([#37](https://github.com/washcycle/armada-vscode/issues/37)) ([55b06d3](https://github.com/washcycle/armada-vscode/commit/55b06d397e7d6e2da22a751cf5a16b2743147f71))
* upgrade GitHub Actions to Node.js 22 runners ([#35](https://github.com/washcycle/armada-vscode/issues/35)) ([8ea730d](https://github.com/washcycle/armada-vscode/commit/8ea730d5aa151bc5bcb9134f9d5fef35b088fb20))

## [0.2.2](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.2.1...armada-vscode-v0.2.2) (2026-03-14)


### Bug Fixes

* bundle extension with esbuild to fix marketplace install ([#32](https://github.com/washcycle/armada-vscode/issues/32)) ([2b665c8](https://github.com/washcycle/armada-vscode/commit/2b665c855f19d4e992701e57c2c5afebc3e9fc70))
* skip integration tests for release commits ([ecb758d](https://github.com/washcycle/armada-vscode/commit/ecb758dd0aea2d544cc4e17e921806b4aa443521))


### Miscellaneous

* **deps-dev:** bump @types/node from 25.2.3 to 25.3.0 ([c67adf5](https://github.com/washcycle/armada-vscode/commit/c67adf5c8e77f13ac6dacc5da981f9d2703eadaa))
* **deps-dev:** bump @types/node from 25.2.3 to 25.3.0 ([a22a2b6](https://github.com/washcycle/armada-vscode/commit/a22a2b60226ea82c68f738aaf72fe232324990dc))
* **deps-dev:** bump @typescript-eslint/parser from 8.55.0 to 8.56.0 ([ab97e5a](https://github.com/washcycle/armada-vscode/commit/ab97e5af4c304ebc696ace0a806e82550cd6ed21))
* **deps-dev:** bump @typescript-eslint/parser from 8.55.0 to 8.56.0 ([8409b3d](https://github.com/washcycle/armada-vscode/commit/8409b3d11d43fdd88f265028b551a9da06992580))
* **deps-dev:** bump minimatch ([6867cbb](https://github.com/washcycle/armada-vscode/commit/6867cbb85a81b5ffb20c0771e7547ddf46536ecc))
* **deps-dev:** bump minimatch from 3.1.2 to 3.1.5 in the npm_and_yarn group across 1 directory ([ca36584](https://github.com/washcycle/armada-vscode/commit/ca36584c0fa749bc2b14a17f15ca7f6d76f8708d))

## [0.2.1](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.2.0...armada-vscode-v0.2.1) (2026-02-14)


### Bug Fixes

* add Lookout CR application to integration tests workflow ([7ea46ff](https://github.com/washcycle/armada-vscode/commit/7ea46ffcca8863514dc6bf935577522602ad6912))
* add workflow_dispatch to publish workflow for manual triggering ([ce1c962](https://github.com/washcycle/armada-vscode/commit/ce1c9629f7880e3e157c608886c5b47cdf6aa25d))
* align engines.vscode with @types/vscode version requirement ([4fc4de5](https://github.com/washcycle/armada-vscode/commit/4fc4de5b3bcbebf3b6124ea4510abfafe4d94c5c))
* enhance integration tests and improve resource limits for Redis and Pulsar deployments ([efc55af](https://github.com/washcycle/armada-vscode/commit/efc55af67fac3a891a64b52c4f3c9f52c5bf7ce0))
* improve deployment wait logic in integration tests and enhance CR application in Makefile ([2437b7c](https://github.com/washcycle/armada-vscode/commit/2437b7c77315746ade291aa15be74b598edcb5e8))
* increase timeout for Armada readiness checks and update CI configuration for minimal deployments ([9b02a2f](https://github.com/washcycle/armada-vscode/commit/9b02a2f47c79cfed9d66992582a23c89541de0d7))
* increase timeout for waiting on Armada deployments and improve job completion checks ([75f7f5b](https://github.com/washcycle/armada-vscode/commit/75f7f5bf9d61831829385443fa77d1ba3ef42174))
* update CI and publish workflows to install Xvfb and run tests with xvfb-run ([c161014](https://github.com/washcycle/armada-vscode/commit/c161014e1b52936a386b11c2ea236f5fe0e7e6f6))
* update Docker image versions and enhance CI resource limits for Redis and PostgreSQL ([07b291a](https://github.com/washcycle/armada-vscode/commit/07b291a66cc7d9f31c8f84ecf7211095da23c824))
* update engines.vscode to ^1.109.0 to match @types/vscode ([15b7639](https://github.com/washcycle/armada-vscode/commit/15b7639e6bc98df1820f8dc283c2f3520a71bfbe))
* update Pulsar image version and adjust installation steps in Makefile ([152daa6](https://github.com/washcycle/armada-vscode/commit/152daa65f9f846db4e020e4869ef5d948cbc3c52))
* update pulsar URL in configuration files to use the correct service address ([b9328c3](https://github.com/washcycle/armada-vscode/commit/b9328c3858a5f522890a95c177efd1a1a15c697c))
* wait for lookout deployment to be created before checking availability ([61b3212](https://github.com/washcycle/armada-vscode/commit/61b3212fd984f0ecb36a6f00146f0da4e5fc8527))


### Miscellaneous

* **deps-dev:** bump @types/node from 20.19.25 to 25.2.0 ([338d646](https://github.com/washcycle/armada-vscode/commit/338d646335c2b8e34e70b024864c99305e5c62dc))
* **deps-dev:** bump @types/vscode from 1.106.0 to 1.109.0 ([c07961f](https://github.com/washcycle/armada-vscode/commit/c07961fe866d3666e1eb1998034904256e5958fb))
* **deps-dev:** bump @types/vscode from 1.106.0 to 1.109.0 ([ce145b6](https://github.com/washcycle/armada-vscode/commit/ce145b68fc501898c253815ee0a4d3fb78870ba7))
* **deps-dev:** bump @typescript-eslint/parser from 8.46.4 to 8.54.0 ([89b1320](https://github.com/washcycle/armada-vscode/commit/89b1320ba11eace972d8b3a97b3914f471500a43))
* **deps-dev:** bump glob from 13.0.0 to 13.0.1 ([bbec78a](https://github.com/washcycle/armada-vscode/commit/bbec78a81052fd74d9cc7229ac95b2eaa3763d8f))

## [0.2.0](https://github.com/washcycle/armada-vscode/compare/armada-vscode-v0.1.1...armada-vscode-v0.2.0) (2026-02-14)


### Features

* add ability to create a queue ([934a508](https://github.com/washcycle/armada-vscode/commit/934a508f7e7728b3caf25d567eff89449d5ca73a))
* add CI-specific configurations and caching for faster integration test setup ([68417ed](https://github.com/washcycle/armada-vscode/commit/68417ed210d7e32ddd0e4b9af5479252e288991e))
* add GitHub Actions for CI/CD and automated marketplace publishing ([ecce3b7](https://github.com/washcycle/armada-vscode/commit/ecce3b70e52982f0db50a9705dd73d45291556f5))
* add metadata and icon for the Armada VSCode extension ([688db8c](https://github.com/washcycle/armada-vscode/commit/688db8c4b96588ffd097b157e863569c2ee41cb5))
* add PostgreSQL configuration with init script and service ([162bca3](https://github.com/washcycle/armada-vscode/commit/162bca3a62e4795316df0f49b036291c456bffc4))
* add skipConfirmation option to submitJob command for testing ([00bccd7](https://github.com/washcycle/armada-vscode/commit/00bccd799f9b720fc2716e4944e912ca8863e959))
* add test queue creation for integration tests ([0159b45](https://github.com/washcycle/armada-vscode/commit/0159b4537f1ba235da3bc54171683168b6cbde1c))
* added initial capabilities ([b87eab7](https://github.com/washcycle/armada-vscode/commit/b87eab7017deecf582333e062e282c0635e8d6d7))
* install armadactl v0.17.0 from GitHub releases in CI ([4d70a5f](https://github.com/washcycle/armada-vscode/commit/4d70a5fb4302a960eeaa8f2ec55ce48b2d6fbbe3))
* integration tests with Armada instance in GitHub Actions ([079144e](https://github.com/washcycle/armada-vscode/commit/079144e067e504102474b7797d667717d68dffe3))
* Setup npm as the package ecosystem for Dependabot ([52d76b2](https://github.com/washcycle/armada-vscode/commit/52d76b2d0f294b0b849b2db74b2100b33858a964))
* update CI configuration to use lightweight Alpine image for PostgreSQL ([fb94363](https://github.com/washcycle/armada-vscode/commit/fb943632bd9fd5cce78ff257a2e513812e9a6fe6))


### Bug Fixes

* add explicit permissions to workflow jobs ([1f17ee5](https://github.com/washcycle/armada-vscode/commit/1f17ee59b7619ccbaaea3a58989a010a9346384a))
* add Prometheus CRDs for Pulsar PodMonitor resources ([205da01](https://github.com/washcycle/armada-vscode/commit/205da01d39598cb6365d8655fa6ab8901f759a80))
* add retry logic to queue creation for CI timing issues ([5b7b9a1](https://github.com/washcycle/armada-vscode/commit/5b7b9a120d068c0a458a02353731e7531d1585c9))
* add timeout and better error handling to submit job integration test ([b9a0df3](https://github.com/washcycle/armada-vscode/commit/b9a0df3f1f9db1a3b06bedf9a20ce36e73ea34f6))
* clean reinstall of dependencies for package-lock.json ([1e3bb50](https://github.com/washcycle/armada-vscode/commit/1e3bb5029213d3cb7a22c7224de8ec783374a6e8))
* clean up formatting in publish workflow ([4c27587](https://github.com/washcycle/armada-vscode/commit/4c2758786737fb5180de6df45a51f248beb701f2))
* clean up redundant code in publish.yml workflow ([e81e383](https://github.com/washcycle/armada-vscode/commit/e81e3838a64c1ce5214736698919e24c5260a114))
* correct Redis service name for Armada compatibility ([dc0bf51](https://github.com/washcycle/armada-vscode/commit/dc0bf515a1f1fb624f48e85ad2cc80860d4cfca3))
* handle dialog timeout in Submit Job integration test ([70668ba](https://github.com/washcycle/armada-vscode/commit/70668bab32f232e5a5f6a80efaed7503a8ed68d7))
* improve publish workflow with release tag checkout and environment protection ([88c43b7](https://github.com/washcycle/armada-vscode/commit/88c43b7e3c6f87775945565dc577927e07bd00ac))
* only package extension on Node 20.x due to vsce requirements ([ce3d339](https://github.com/washcycle/armada-vscode/commit/ce3d339befe931d67394684152d1623e6212a7f4))
* regenerate package-lock.json for Node 20 compatibility ([12133c2](https://github.com/washcycle/armada-vscode/commit/12133c2b54033b1fcc29baad78f449d6d754264e))
* remove Node 18.x from CI matrix, use only 20.x ([60cec94](https://github.com/washcycle/armada-vscode/commit/60cec94fd7721f2fa3f129412e881a45e46681af))
* revert to Pulsar Helm chart - standalone incompatible ([b434869](https://github.com/washcycle/armada-vscode/commit/b4348690ffbd4fc5c1f38863611578e9a4f1bc25))
* skip interactive command tests in CI environment ([e830b9c](https://github.com/washcycle/armada-vscode/commit/e830b9c8e29d9aaec8f7e4425dd3eb69b81eeb42))
* standardize formatting and reorder steps in integration tests workflow ([2eb24e6](https://github.com/washcycle/armada-vscode/commit/2eb24e6ff45676a677b0f80d7c2989bf14ac6ef9))
* update armadactl installation to use correct tar.gz format and v0.20.28 ([4c96c59](https://github.com/washcycle/armada-vscode/commit/4c96c59e8bb078a28eabe7c34f19660c39fdeed2))
* update glob package to version 11.1.0 and adjust dependencies ([af61281](https://github.com/washcycle/armada-vscode/commit/af612812322b4c218729814f26a36f4c5a5c93e6))
* update integration test runner to use ubuntu-latest ([6abd05b](https://github.com/washcycle/armada-vscode/commit/6abd05b9331f6fbee79f1ed1c5ab2c0f136719b8))
* update integration test runner to use ubuntu-latest-4-cores ([abb2993](https://github.com/washcycle/armada-vscode/commit/abb2993716940e697c053f095f03bb272416ebcb))
* update version number to 0.1.1 in package.json ([bda1d9a](https://github.com/washcycle/armada-vscode/commit/bda1d9a82459a3110b870f7ef941cdda8f520d4e))
* use armadactl instead of kubectl for queue creation ([2b48020](https://github.com/washcycle/armada-vscode/commit/2b48020298b397b49af115e085cfefd6530f3476))
* use correct armadactl config format (map instead of list) ([4ebb56c](https://github.com/washcycle/armada-vscode/commit/4ebb56c40430243392738c417bb75e9c100481ec))


### Miscellaneous

* add release-please configuration files ([690d466](https://github.com/washcycle/armada-vscode/commit/690d4662d9676f3b1ff776868762624431516152))
* **deps-dev:** bump eslint from 9.39.1 to 9.39.2 ([fb6ccd0](https://github.com/washcycle/armada-vscode/commit/fb6ccd08316875a33f833fd75cd157888967f9e8))
* **deps-dev:** bump eslint from 9.39.1 to 9.39.2 ([b0891be](https://github.com/washcycle/armada-vscode/commit/b0891be4b6df4f89494a58fe6a92aa47cf98bb20))
* **deps-dev:** bump glob from 11.0.3 to 11.1.0 in the npm_and_yarn group across 1 directory ([30f7bfe](https://github.com/washcycle/armada-vscode/commit/30f7bfe185db1cee3cf9b05d08c333037ed17a4e))
* **deps-dev:** bump glob from 11.0.3 to 13.0.0 ([ddc50b8](https://github.com/washcycle/armada-vscode/commit/ddc50b83a1fb868da824cc751a7e5bf39d3bc3e8))
* **deps-dev:** bump glob from 11.0.3 to 13.0.0 ([8354c2d](https://github.com/washcycle/armada-vscode/commit/8354c2df023d17ec3c4039a533f35d998bc3a0d4))
* **deps-dev:** bump glob in the npm_and_yarn group across 1 directory ([be070da](https://github.com/washcycle/armada-vscode/commit/be070dacbe89bf0e5429e2f10f0d5e7f55dc9f4f))
* **deps:** bump @grpc/grpc-js from 1.14.1 to 1.14.3 ([15421e7](https://github.com/washcycle/armada-vscode/commit/15421e769ce2d146b6d438a222b627fe9478095e))
* **deps:** bump @grpc/grpc-js from 1.14.1 to 1.14.3 ([bda0a6e](https://github.com/washcycle/armada-vscode/commit/bda0a6ef2594920a50a46de752a79e3c8aa00e7e))
* **deps:** bump @grpc/proto-loader from 0.7.15 to 0.8.0 ([9bfd674](https://github.com/washcycle/armada-vscode/commit/9bfd6748e97a50634cd2947471af8ef89b31f4fc))
* **deps:** bump @grpc/proto-loader from 0.7.15 to 0.8.0 ([473072b](https://github.com/washcycle/armada-vscode/commit/473072b14dd9e5c88e58666a54c439104c494757))
* **deps:** bump protobufjs from 7.5.4 to 8.0.0 ([e753f2e](https://github.com/washcycle/armada-vscode/commit/e753f2e049ad3456610e9e0698c215adbf1808cf))
* **deps:** bump protobufjs from 7.5.4 to 8.0.0 ([dad94a7](https://github.com/washcycle/armada-vscode/commit/dad94a7016849dd9f7a966bfd8b305ad58d2a2ca))
* remove placeholder for Marketplace installation in README ([82a6a07](https://github.com/washcycle/armada-vscode/commit/82a6a07e8b64dcf1a74334db3e486943257316ec))
* update README and configuration files for clarity and consistency ([6964241](https://github.com/washcycle/armada-vscode/commit/6964241b382840d09dc29f2af3749e611bac9c58))


### Documentation

* add TODO comments for test step in workflows ([fa67cd0](https://github.com/washcycle/armada-vscode/commit/fa67cd0db286d52a08a52066e6fc3ce9990dbe23))
* update README and CONTRIBUTING with CI/CD info ([46b061c](https://github.com/washcycle/armada-vscode/commit/46b061c74ae698bbe3c37655292d131604b16ae7))
