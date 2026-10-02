# cradle-witness.py — Zero 1's 11 sellCredit mutants (Section C) PORTED onto Grok Bot's cradle (6260b7c).
# Grok Bot 2026-10-02: adapted to fix F1 (M6 target follows the new seed-exemption line; F3 = the db != 0 guard).
#   WSRC defaults to THIS directory; WRPC to a local anvil fork of Base (never a public RPC for 11+ full runs).
# Each mutation is applied to a TEMP COPY of contracts/launch-lock; the fork suite must go RED.
# Fork only (my own anvil). Nothing is broadcast, nothing deployed, Grok Bot's dirs are never touched.
import subprocess, shutil, os, sys
SRC = os.environ.get('WSRC', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.environ.get('WDST', '/tmp/cradle-mut')
RPC = os.environ.get('WRPC', 'http://127.0.0.1:8549')
FORGE = os.path.expanduser('~/.foundry/versions/base-nightly/forge')
MATCH = os.environ.get('MATCH', '')  # optional --match-contract filter
TOK = 'src/TBlockBloc24h.sol'
HOOK = 'src/TBlockLaunchLockHook.sol'
ENV = dict(os.environ, FOUNDRY_DISABLE_NIGHTLY_WARNING='1')
NOMATCH = os.environ.get('NOMATCH', '')
CMD = [FORGE, 'test', '--fork-url', RPC] + (['--match-contract', MATCH] if MATCH else []) + (['--no-match-contract', NOMATCH] if NOMATCH else [])
def prep():
    shutil.rmtree(D, ignore_errors=True)
    os.makedirs(D)
    for x in ['foundry.toml']: shutil.copy(os.path.join(SRC, x), D)
    for x in ['src', 'test', 'script']:
        if os.path.isdir(os.path.join(SRC, x)): shutil.copytree(os.path.join(SRC, x), os.path.join(D, x))
    os.symlink(os.path.join(SRC, 'lib'), os.path.join(D, 'lib'))
def summary(r):
    tot = [l for l in r.stdout.splitlines() if 'tests passed' in l]
    return tot[-1].strip() if tot else '(no summary: ' + (r.stderr.strip() or r.stdout.strip())[-160:] + ')'
reds = 0
def run(label, f, a, b):
    global reds
    prep()
    p = os.path.join(D, f); s = open(p).read()
    assert s.count(a) == 1, 'target not unique/absent: ' + a[:60]
    open(p, 'w').write(s.replace(a, b, 1))
    r = runf()
    red = r.returncode != 0
    reds += red
    fails = [l.strip() for l in r.stdout.splitlines() if l.startswith('[FAIL')]
    print(f"=== MUTATION: {label}\n    {'RED' if red else 'GREEN (!!)'}  {summary(r)}", flush=True)
    for l in fails[:5]: print('     ' + l[:170], flush=True)
FLAKY = ('error sending request', 'rate limit', 'connection refused', 'timed out', 'Could not instantiate forked environment', 'failed to get')
def runf():
    # an RPC flake must never count as a RED: retry up to 3 times when the output smells of RPC trouble
    for i in range(3):
        r = subprocess.run(CMD, cwd=D, env=ENV, capture_output=True, text=True)
        out = r.stdout + r.stderr
        if r.returncode == 0 or not any(f.lower() in out.lower() for f in FLAKY): return r
        print('    (rpc flake, retry %d)' % (i + 1), flush=True)
    return r
prep()
r = runf()
print('=== UNMUTATED:', summary(r), flush=True)
if r.returncode != 0: print('baseline not green, abort'); sys.exit(2)
M = [
 ('M1 token: a sell into our pool is not debited from the seller credit', TOK,
  "uint256 du = (from == seeder && !trading && !hook.echange(address(this))) ? vente : v;", "uint256 du = 0;"),
 ('M2 token: inflow to the PoolManager need not pay OUR hooked pool', TOK,
  "if (vente + ajout != v) revert PasNotrePool(v, vente + ajout);", ""),
 ('M3 token: every PoolManager payout is credited', TOK,
  "uint256 c = hook.consommerSortie(v);", "uint256 c = v;"),
 ('M4 token: lenient p2p (unbacked transfers allowed, min(credit, amount) moves)', TOK,
  "        _debiter(from, v);\n        _credit[to] += v;",
  "        uint256 c0 = _credit[from] < v ? _credit[from] : v;\n        _credit[from] -= c0;\n        _credit[to] += c0;"),
 ('M5 token: p2p debits the sender but the credit does not follow the tokens', TOK,
  "        _debiter(from, v);\n        _credit[to] += v;", "        _debiter(from, v);"),
 ('M6 token: seed exemption not closed by the first trade', TOK,
  "(from == seeder && !trading && !hook.echange(address(this))) ? vente : v", "(from == seeder) ? vente : v"),
 ('M7 token: the window never lifts', TOK,
  "return f == 0 ? block.timestamp < creeLe + SOUPAPE : block.timestamp < f;", "return true;"),
 ('M8 token: burn does not trim the credit', TOK,
  "if (_credit[from] > resteFrom) _credit[from] = resteFrom;", ""),
 ('M9 hook: payouts not consumed (one payout credited twice)', HOOK,
  "tstore(k, sub(n, pris))", ""),
 ('M10 hook: sells not netted against buys (only buys recorded)', HOOK,
  "tstore(k, add(tload(k), signextend(15, db)))", "if sgt(db, 0) { tstore(k, add(tload(k), db)) }"),
 ('M11 hook: LP removal allowed inside the window', HOOK,
  "if (fin == 0 || block.timestamp < fin) revert RetraitBloque24h();", ""),
]
FIXM = [
 ('F1 fix removed in the token (seed exemption ignores the first-swap flag)', TOK,
  "uint256 du = (from == seeder && !trading && !hook.echange(address(this))) ? vente : v;", "uint256 du = (from == seeder && !trading) ? vente : v;"),
 ('F2 fix removed in the hook (first hooked swap never recorded)', HOOK,
  "                if (!echange[bq]) echange[bq] = true;\n", ""),
 ('F3 guard removed in the hook (a ZERO-block swap ends the seed exemption: anyone can kill the birth seed)', HOOK,
  "            if (db != 0) {\n", "            if (true) {\n"),
]
if os.environ.get('SET') == 'fix': M = FIXM
if os.environ.get('ONLY'): M = [m for m in M if m[0].split()[0] in os.environ['ONLY'].split(',')]
if os.environ.get('SET') == 'mine3': M = [m for m in M if m[0].split()[0] in ('M6', 'M8', 'M11')]
for m in M: run(*m)
print(f"=== RESULT: {reds}/{len(M)} RED", flush=True)
shutil.rmtree(D, ignore_errors=True)
