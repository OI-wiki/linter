#!/bin/bash
export PATH=$PATH:~/.local/bin
export PYTHONUNBUFFERED=1
set -xo pipefail
echo $UID
echo $USER
echo $PATH

which python3
which clang-format
which ruff
python3 --version
clang-format --version
ruff --version
# source /root/.bashrc

# Use pr-{pr-num}-{commit_hash} format for directory naming
commit_short=$(echo "$5" | cut -c1-8)
dir_name="pr-$4-$commit_short"

echo "Cloning to directory: $dir_name"
git clone --depth=1 -b $3 https://github.com/$1/$2.git "$dir_name"

cd "$dir_name"

# rm yarn.lock
# rm package-lock.json
# cp /root/package.json .

# npm install .
# yarn add .

if [[ -f package-lock.json ]]; then
    npm install .
else
    yarn
fi

git config --local user.email "15963390+24OI-bot@users.noreply.github.com"
git config --local user.name "24OI-bot"

python3 scripts/fix_details.py ./docs
find . -type f \( -name "*.c" -o -name "*.cpp" -o -name "*.h" -o -name "*.hpp" \) -print0 | xargs -0 clang-format -i
ruff format ./docs
yarn run remark ./docs -o --silent

git add ./docs
git commit -m 'style: format markdown files with remark-lint'
git remote add upd https://24OI-bot:$GH_TOKEN@github.com/$1/$2.git
git push upd $3

cd ..
rm -rf "$dir_name"
yarn cache clean

