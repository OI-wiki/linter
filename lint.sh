#!/bin/bash
export PATH=$PATH:~/.local/bin
set -xo pipefail
echo $UID
echo $USER
echo $PATH

which clang-format
which ruff
clang-format --version
ruff --version
# source /root/.bashrc

num=$RANDOM
git clone --depth=1 -b $3 https://github.com/$1/$2.git $num

cd $num

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

find . -type f \( -name "*.c" -o -name "*.cpp" -o -name "*.h" -o -name "*.hpp" \) -print0 | xargs -0 clang-format -i
ruff format ./docs
yarn run remark ./docs -o --silent

git add ./docs
git commit -m 'style: format markdown files with remark-lint'
git remote add upd https://24OI-bot:$GH_TOKEN@github.com/$1/$2.git
git push upd $3

cd ..
rm -rf $num
yarn cache clean

