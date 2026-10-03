#!/usr/bin/env bash
# Recensement « seize » des devises B20 appariables (lecture seule, aucune transaction).
# Regle (definie par le parent, 2026-10-02) : seize ACTIF  <=> policyId(keccak("SEIZE_EXEMPT_POLICY")) != 0
#                                            seize INACTIF <=> == 0
#                                            INCONNU       <=> la lecture echoue (apres reessais)
# Temoin negatif : une cle inconnue (FOO_BAR_POLICY) DOIT reverter, sinon la lecture ne prouve rien.
# usage : BASE_RPC=https://base.drpc.org ./script/seize-census.sh > seize-census-52070900.tsv
set -u
C=${CAST:-$HOME/.foundry/versions/base-nightly/cast}; export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
R=${BASE_RPC:-https://base.drpc.org}; B=${BLOC:-52070900}; PAUSE=${PAUSE:-2}
SE=$($C keccak SEIZE_EXEMPT_POLICY); FOO=$($C keccak FOO_BAR_POLICY)
lire() { # $1 adresse $2 cle -> valeur ou ERR:<motif>
  local i out
  for i in 1 2 3 4 5; do
    out=$($C call "$1" 'policyId(bytes32)(uint64)' "$2" --block "$B" --rpc-url "$R" 2>&1); sleep "$PAUSE"
    if [[ "$out" =~ ^[0-9]+ ]]; then echo "${out%% *}"; return; fi
    if [[ "$out" == *"execution reverted"* || "$out" == *"revert"* ]]; then echo "ERR:revert:$(grep -o '0x[0-9a-f]\{8\}' <<<"$out" | head -1)"; return; fi
  done
  echo "ERR:rpc"
}
echo "# bloc $B ts $($C block $B -f timestamp --rpc-url $R) (Cobalt 1790791200) rpc $R"
echo "# temoin NVDAc FOO_BAR_POLICY -> $(lire 0xb20000000000000000000078ee7ce2fe4908108c $FOO) (attendu ERR:revert)"
printf 'symbole\tadresse\tseizeExemptPolicy\tetat\n'
while read -r sym a; do
  v=$(lire "$a" "$SE")
  case "$v" in ERR:*) e=unknown;; 0) e=disabled;; *) e=enabled;; esac
  printf '%s\t%s\t%s\t%s\n' "$sym" "$a" "$v" "$e"
done <<L
AAPLc 0xb200000000000000000000c2e324d24d7eecd1fb
AMZNc 0xb200000000000000000000d9192b6b456483c2e8
AVGOc 0xb200000000000000000000fc737aea6196ab5a4c
BEc 0xb20000000000000000000016f9dfe862feba122b
GOOGLc 0xb2000000000000000000002d0ba3164cc74f58b7
HIMSc 0xb20000000000000000000043a599976181bcf336
METAc 0xb2000000000000000000008bc8786b856e61707c
MSFTc 0xb200000000000000000000ab99cfa739e253872b
MSTRc 0xb2000000000000000000004884b426556b92883d
MUc 0xb200000000000000000000fd2f87532b90095211
NVDAc 0xb20000000000000000000078ee7ce2fe4908108c
PLTRc 0xb2000000000000000000007d16372840df4dabbe
SNDKc 0xb200000000000000000000397293cb8cda9a10c5
SPCXc 0xb2000000000000000000007b9fcbd005511acbd5
TSLAc 0xb2000000000000000000001e800a7f5189430cd0
OUSD 0xb2000000000000000000002feb517dfec7415344
TBLOCK 0xb20000000000000000000024c30d3fcb7931272e
L
