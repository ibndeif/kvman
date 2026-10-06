#!/usr/bin/env bash
# Run one opencode task from a brief file and record exactly what it changed.
#
# Usage: delegate.sh --brief <file> [--agent build|plan] [--session <id>] [--title <text>]
#                    [--model <provider/model>] [--dir <repository>]
#
# The working tree is snapshotted as a git tree object before and after the run,
# through a throwaway index, so the real index, stash, and uncommitted work are untouched.
# Run folder: $OPENCODE_DELEGATE_RUNS (default ${TMPDIR:-/tmp}/opencode-delegate)/<repo>/<stamp>.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
agent=build
brief=""
session=""
title=""
model=""
directory=$PWD

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brief) brief=$2; shift 2 ;;
    --agent) agent=$2; shift 2 ;;
    --session) session=$2; shift 2 ;;
    --title) title=$2; shift 2 ;;
    --model) model=$2; shift 2 ;;
    --dir) directory=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[[ -n $brief && -f $brief ]] || { echo "brief file not found: '$brief'" >&2; exit 2; }
command -v opencode >/dev/null || { echo "opencode is not on PATH" >&2; exit 2; }

repository=$(git -C "$directory" rev-parse --show-toplevel)
cd "$repository"

runs_root=${OPENCODE_DELEGATE_RUNS:-${TMPDIR:-/tmp}/opencode-delegate}
run_dir="$runs_root/$(basename "$repository")/$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$run_dir"
cp "$brief" "$run_dir/brief.md"
echo "$repository" > "$run_dir/repository"

snapshot_tree() {
  local scratch
  scratch=$(mktemp -d)
  local real_index
  real_index=$(git rev-parse --path-format=absolute --git-path index)
  [[ -f $real_index ]] && cp "$real_index" "$scratch/index"
  GIT_INDEX_FILE="$scratch/index" git add -A >/dev/null 2>&1
  GIT_INDEX_FILE="$scratch/index" git write-tree
  rm -rf "$scratch"
}

before=$(snapshot_tree)
echo "$before" > "$run_dir/before-tree"

arguments=(run --format json --agent "$agent")
[[ -n $session ]] && arguments+=(--session "$session")
[[ -n $title ]] && arguments+=(--title "$title")
[[ -n $model ]] && arguments+=(--model "$model")

echo "run folder: $run_dir"
echo "opencode running (agent: $agent${session:+, session: $session})…"
started=$(date +%s)
set +e
opencode "${arguments[@]}" "$(cat "$brief")" >"$run_dir/events.jsonl" 2>"$run_dir/stderr.log" </dev/null
exit_code=$?
set -e
echo "$exit_code" > "$run_dir/exit-code"
echo "$(( $(date +%s) - started ))" > "$run_dir/duration-seconds"

after=$(snapshot_tree)
echo "$after" > "$run_dir/after-tree"
git diff --binary "$before" "$after" > "$run_dir/changes.patch"

echo
node "$script_dir/summarize-run.mjs" "$run_dir"
echo
echo "== files changed in the working tree =="
if [[ $before == "$after" ]]; then
  echo "(none)"
else
  git diff --stat=120 "$before" "$after"
fi
echo
echo "before-tree: $before"
echo "after-tree:  $after"
echo "patch:       $run_dir/changes.patch"
exit "$exit_code"
