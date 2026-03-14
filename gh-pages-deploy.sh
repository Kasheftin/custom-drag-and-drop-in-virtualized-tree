#!/bin/bash
set -e

echo "Building..."
pnpm install
pnpm run build
echo "Build complete"

git checkout --orphan gh-pages
git --work-tree dist add --all
git --work-tree dist commit -m "gh-pages"
git push origin HEAD:gh-pages --force

rm -rf dist
git checkout -f master
git branch -D gh-pages
echo "Deployed to gh-pages"
