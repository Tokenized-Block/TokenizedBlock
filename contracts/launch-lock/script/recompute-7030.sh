#!/usr/bin/env bash
# FORK ONLY, nothing is sent or signed. Rebuilds the hook-7030 deploy plan from source on a pinned Base fork, then
# re-derives salt / initcode hash / CREATE2 address / permission bits and the constructor config with cast alone.
# Usage: script/recompute-7030.sh            (env: BASE_RPC, FORK_BLOCK, FORGE, CAST)
set -euo pipefail
cd "$(dirname "$0")/.."
CAST="${CAST:-$HOME/.foundry/versions/base-nightly/cast}"
RPC="${BASE_RPC:-https://base.gateway.tenderly.co}"
BLOCK="${FORK_BLOCK:-52090382}"
DEPLOYER=0x4e59b44847b379578588920cA78FbF26c0B4956C
V8=0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc
./fork-test.sh --match-test test_L2_planDeDeploiement > /dev/null
D=$(tr -d '\r\n' < plan/deploy-calldata.hex); D=${D#0x}
SALT=0x${D:0:64}; INIT=0x${D:64}
CC=$(node -e 'const a=require("./out/TBlockLaunchLockHook.sol/TBlockLaunchLockHook.json");process.stdout.write(a.bytecode.object.replace(/^0x/,""))')
[ "${D:64:${#CC}}" = "$CC" ] || { echo "KO initcode does not start with the freshly compiled creationCode"; exit 1; }
ARGS=0x${D:$((64 + ${#CC}))}
HASH=$("$CAST" keccak "$INIT")
ADDR=$("$CAST" create2 --deployer "$DEPLOYER" --salt "$SALT" --init-code-hash "$HASH" | awk '{print $1}')
BITS=$(printf '0x%04x' $(( 0x${ADDR: -4} & 0x3fff )))
echo "calldata sha256 $(sha256sum plan/deploy-calldata.hex | cut -c1-64)  bytes $(( ${#D} / 2 ))"
echo "salt $SALT"
echo "initcodeHash $HASH"
echo "create2 $ADDR  bits $BITS"
[ "$BITS" = "0x24cc" ] || { echo "KO bits"; exit 1; }
[ "$("$CAST" code "$ADDR" --rpc-url "$RPC" --block "$BLOCK")" = "0x" ] && echo "no code at the address on Base at block $BLOCK"
CFG=$("$CAST" abi-decode --input 'x((address,address,uint256,uint24,uint24,uint24,uint8,bool,int24,uint128,uint32,bool,address[],bytes,(address,address,uint24,int24,address),uint256,uint256[],address,uint256))' "$ARGS")
node - "$CFG" <<'JS'
const s = process.argv[2].replace(/\s+/g, ' ').replace(/ \[[0-9.e+-]+\]/g, '');
const m = s.match(/^\((0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (\d+), (\d+), (\d+), (\d+), (\d+), (true|false), (-?\d+), (\d+), (\d+), (true|false), \[([^\]]*)\], (0x[0-9a-f]*), \(([^)]*)\), (\d+), \[([^\]]*)\], (0x[0-9a-fA-F]{40}), (\d+)\)$/);
if (!m) { console.log('KO cannot parse config'); process.exit(1); }
const dev = m[13].split(', ').map((x) => x.toLowerCase()), pl = m[17].split(', ');
const out = { poolManager: m[1], fraisVie: m[3], hookFee: m[4], partCreateur: m[5], partCollateral: m[6], modeCollateral: m[7],
  ancre: m[8], largeur: m[9], seuil: m[10], delaiRetrait: m[11], exigerB20: m[12], devises: dev.length,
  marqueur: Buffer.from(m[14].slice(2), 'hex').toString(), plancherEth: m[16], planchers: pl.length,
  uniques: new Set(dev).size, createRouter: m[18], fraisCreation: m[19], gmecPresent: dev.includes('0xb2000000000000000000007790ed6e48e06ed935') };
console.log(JSON.stringify(out));
if (out.devises !== 41 || out.uniques !== 41 || out.planchers !== 41 || !out.gmecPresent) { console.log('KO list: expected 41 distinct currencies incl. GMEc'); process.exit(1); }
require('fs').writeFileSync('/tmp/recompute-7030-config.json', JSON.stringify({ feeWallet: m[2], devises: dev, planchers: pl, plancherEth: m[16], createRouter: m[18] }));
JS
FW=$(node -e 'process.stdout.write(require("/tmp/recompute-7030-config.json").feeWallet.toLowerCase())')
LIVE=$("$CAST" call "$V8" 'feeWallet()(address)' --rpc-url "$RPC" -b "$BLOCK" | tr 'A-F' 'a-f')
[ "$FW" = "$LIVE" ] && echo "config.feeWallet == live V8 feeWallet(): OK" || { echo "KO feeWallet"; exit 1; }
CR=$(node -e 'process.stdout.write(require("/tmp/recompute-7030-config.json").createRouter.toLowerCase())')
[ "$CR" = "0xe05cd0336cd18a0909bca980a4191a0b00a3fdf5" ] && echo "config.createRouter == the TB CreateRouter 0xe05C…FdF5: OK" || { echo "KO createRouter"; exit 1; }
RFW=$("$CAST" call "$CR" 'FEE_WALLET()(address)' --rpc-url "$RPC" -b "$BLOCK" | tr 'A-F' 'a-f')
[ "$RFW" = "$LIVE" ] && echo "CreateRouter.FEE_WALLET() == the same fee wallet: OK" || { echo "KO router fee wallet"; exit 1; }
node script/planchers-caution.mjs check --block "$BLOCK" 2>&1 | tail -1
node -e '
const c = require("/tmp/recompute-7030-config.json"), rows = require("./plan/planchers-caution.json").rows;
const eth = rows[0], l = rows.slice(1);
const ok = eth.adresse === "0x0000000000000000000000000000000000000000" && eth.raw === c.plancherEth && l.length === c.devises.length
  && l.every((r, i) => r.adresse.toLowerCase() === c.devises[i] && r.raw === c.planchers[i]);
console.log(ok ? "calldata list + floors == plan/planchers-caution.json (ETH + " + l.length + ")" : "KO calldata list/floors differ from plan/planchers-caution.json");
process.exit(ok ? 0 : 1);
'
