#!/usr/bin/env bash
# Flag the rule breaks in a delegated run's diff that a grep can find (CLAUDE.md §5–§7).
# It is a first pass before reading the diff, not a replacement for reading it.
#
# Usage: check-diff.sh <run-dir> [allowed-path-prefix…]
#
# With allowed prefixes (the brief's Scope), any changed file outside them is flagged.
# Exits 1 when something is flagged.
set -euo pipefail

run_dir=${1:?usage: check-diff.sh <run-dir> [allowed-path-prefix…]}
shift
allowed=("$@")
before=$(cat "$run_dir/before-tree")
after=$(cat "$run_dir/after-tree")
cd "$(cat "$run_dir/repository")"

flags=0
flag() { echo "FLAG  $*"; flags=$((flags + 1)); }

mapfile -t changed < <(git diff --name-only --no-renames "$before" "$after")
if [[ ${#changed[@]} -eq 0 ]]; then
  echo "no files changed"
  exit 0
fi

while IFS=$'\t' read -r status path; do
  [[ $status == D ]] && flag "deleted: $path"
done < <(git diff --name-status --no-renames "$before" "$after")

for path in "${changed[@]}"; do
  if [[ ${#allowed[@]} -gt 0 ]]; then
    inside=false
    for prefix in "${allowed[@]}"; do [[ $path == "$prefix"* ]] && inside=true; done
    $inside || flag "outside scope: $path"
  fi
  case "$path" in
    pnpm-lock.yaml | */pnpm-lock.yaml) flag "lockfile changed: $path" ;;
    plan/* | CLAUDE.md | eslint.config.js | eslint/* | tsconfig*.json | */tsconfig*.json | turbo.json | vitest.config.ts | .claude/*)
      flag "project config or spec changed: $path" ;;
  esac
  if [[ $path == package.json || $path == */package.json ]] &&
    git diff "$before" "$after" -- "$path" | grep -qE '^[-+]\s*"[^"]+":\s*"(\^|~|[0-9]|workspace:|npm:|file:|link:)'; then
    flag "dependency or version line changed: $path"
  fi
  if [[ $path =~ \.(ts|tsx|mts|js|mjs|vue)$ ]] && git cat-file -e "$after:$path" 2>/dev/null; then
    line_count=$(git cat-file -p "$after:$path" | wc -l)
    ((line_count > 300)) && flag "over 300 lines ($line_count): $path"
  fi
done

added_lines() {
  git diff -U0 "$before" "$after" -- '*.ts' '*.tsx' '*.mts' '*.js' '*.mjs' '*.vue' |
    awk '/^\+\+\+ /{file=substr($0,7); next} /^---/{next}
         /^@@/{split($3,range,","); line=substr(range[1],2)-1; next}
         /^\+/{line++; print file ":" line ": " substr($0,2)}'
}

forbidden='eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck|\.(skip|only)\(|\b(TODO|FIXME|XXX|HACK)\b|:\s*any\b|\bas any\b|<any>|console\.(log|debug)\(|v-html'
while IFS= read -r line; do
  flag "forbidden pattern: $line"
done < <(added_lines | grep -E "$forbidden" || true)
while IFS= read -r line; do
  flag "default export (only defineExtension results may be default): $line"
done < <(added_lines | grep -E 'export default' | grep -v 'defineExtension' || true)

removed_tests=$(git diff -U0 "$before" "$after" -- '*.test.ts' '*.spec.ts' | grep -cE '^-\s*(it|test)(\.each)?\(' || true)
((removed_tests > 0)) && flag "$removed_tests test case line(s) removed from test files: check none was dropped or weakened"

echo "${#changed[@]} file(s) changed, $flags flag(s)"
((flags == 0))
