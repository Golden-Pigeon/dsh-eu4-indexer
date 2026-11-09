#!/bin/sh
set -eu
case "$(node -p 'process.report.getReport().header.glibcVersionRuntime || "musl"')" in
  musl) apk add --no-cache icu-libs icu-data-full libgcc libstdc++ libssl3 zlib ca-certificates krb5 tar git zip ;;
  *) apt-get update -qq; apt-get install -y --no-install-recommends libicu72 libssl3 libgssapi-krb5-2 ca-certificates git zip >/dev/null ;;
esac
mkdir -p /tmp/dsh-test
cd /tmp/dsh-test
tar -xzf /inputs/source.tgz
if [ -f /inputs/update.tgz ]; then tar -xzf /inputs/update.tgz; fi
if ! npm ci --ignore-scripts --omit=optional --cache /tmp/npm-cache; then
  tail -n 80 /tmp/npm-cache/_logs/*debug-0.log
  exit 1
fi
npm install --global pnpm@11.21.0 --ignore-scripts --cache /tmp/npm-cache
RID=$(node --input-type=module -e "import {rid} from './dist/engine/platforms.js'; console.log(rid())")
ARCHIVE=$(node --input-type=module -e "import {platforms,rid} from './dist/engine/platforms.js'; import {npmArchiveName} from './scripts/lib/npm-package.mjs'; import fs from 'node:fs'; console.log(npmArchiveName(platforms[rid()].name,JSON.parse(fs.readFileSync('package.json')).version))")
mkdir -p /tmp/dsh-engine/package
tar -xzf "artifacts/npm/$ARCHIVE" -C /tmp/dsh-engine
mkdir -p /tmp/dsh-executable
tar -xzf /tmp/dsh-engine/package/engine.tar.gz -C /tmp/dsh-executable
export DSH_EU4_ENGINE=/tmp/dsh-executable/bin/eu4indexer
export EU4_CONFIG_DIR=/tmp/dsh-test/rules/eu4
export HOI4_CONFIG_DIR=/tmp/dsh-test/rules/hoi4
# The exported test source has no Git history. Skills were generated and
# checked in the native job; never bypass provenance checks to repack here.
npm run typecheck
npm --ignore-scripts test
npm --ignore-scripts run test:integration
npm --ignore-scripts run test:dsh-rc1 -- --package
node scripts/verify-package.mjs
printf 'Linux packaged integration passed: %s\n' "$RID"
