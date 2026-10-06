#!/usr/bin/env bash
# Undo what one delegated run changed, restoring files to their state before the run.
#
# Usage: revert-run.sh <run-dir> [path…]
#
# Without paths, reverts every file the run changed. A file that changed again after the
# run (it no longer matches the after-tree) is skipped and reported, never overwritten.
set -euo pipefail

run_dir=${1:?usage: revert-run.sh <run-dir> [path…]}
shift
before=$(cat "$run_dir/before-tree")
after=$(cat "$run_dir/after-tree")
cd "$(cat "$run_dir/repository")"

if [[ $# -gt 0 ]]; then
  paths=("$@")
else
  mapfile -t paths < <(git diff --name-only --no-renames "$before" "$after")
fi

blob_at() { git rev-parse -q --verify "$1:$2" 2>/dev/null || echo absent; }
current_blob() { if [[ -e $1 || -L $1 ]]; then git hash-object -- "$1"; else echo absent; fi; }

skipped=0
for path in "${paths[@]}"; do
  if [[ $(current_blob "$path") != "$(blob_at "$after" "$path")" ]]; then
    echo "skipped  $path (changed after the run)"
    skipped=$((skipped + 1))
    continue
  fi
  if [[ $(blob_at "$before" "$path") == absent ]]; then
    rm -f -- "$path"
    echo "removed  $path"
  else
    git restore --source="$before" --worktree -- "$path"
    echo "restored $path"
  fi
done

[[ $skipped -eq 0 ]] || { echo "$skipped file(s) skipped; inspect them by hand" >&2; exit 1; }
